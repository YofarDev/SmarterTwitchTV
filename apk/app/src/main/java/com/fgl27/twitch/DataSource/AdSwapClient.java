/*
 * Copyright (c) 2017–present Felipe de Leon <fglfgl27@gmail.com>
 *
 * This file is part of SmartTwitchTV <https://github.com/fgl27/SmartTwitchTV>
 *
 * SmartTwitchTV is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * SmartTwitchTV is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartTwitchTV.  If not, see <https://www.gnu.org/licenses/>.
 *
 */

package com.fgl27.twitch.DataSource;

import android.net.Uri;
import android.util.Log;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Ad free backup playlist provider, an adaptation of the desktop "vaft" solution from
 * https://github.com/pixeltris/twitchadsolutions.
 *
 * When the playback token gets server side ads stitched into its media playlists, alternate tokens
 * requested with a different playerType ("embed", "popout", "autoplay") often reference ad free
 * copies of the same live stream. This client requests one of those alternates and hands its media
 * playlist back to the player in place of the ad laden one, so the stream keeps playing without
 * ads instead of pausing while the ad segments are stripped.
 *
 * The player never really requests the usher master playlist (DefaultHttpDataSource serves it from
 * memory), that request is recorded here together with the master's variant urls. This gives the
 * client everything needed to rebuild the usher request with an alternate token: the channel name,
 * the original query parameters and the resolution of the variant currently being played.
 *
 * Everything is best effort and fail open: on any error the caller keeps the previous behavior
 * (stripping the ad segments).
 */
public final class AdSwapClient {

    private static final String TAG = "STTV_AdSwap";

    private static final String GQL_URL = "https://gql.twitch.tv/gql";
    //Public web player client id, the same one used by pixeltris/twitchadsolutions
    private static final String CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
    private static final String TOKEN_PERSISTED_HASH = "ed230aa1e33e07eebb8928504583da78a5173989fadfb1ac94be06a04f3cdbe9";

    //Backup player types in order of preference, index matched with PLAYER_PLATFORMS.
    //"embed" and "popout" both give source quality, "autoplay" is the 360p last resort
    private static final String[] PLAYER_TYPES = {"embed", "popout", "autoplay"};
    private static final String[] PLAYER_PLATFORMS = {"web", "web", "android"};

    private static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

    private static final int CONNECT_TIMEOUT = 4000;
    private static final int READ_TIMEOUT = 4000;
    //Total wall clock budget for one swap attempt, keeps the player loader thread from blocking for too long
    private static final long SWAP_BUDGET_MS = 9000;
    //How long a fetched backup master playlist is reused before being refreshed
    private static final long MASTER_CACHE_MS = 90000;
    //Minimum time between swap attempts for the same media playlist (it refreshes each ~2 seconds)
    private static final long RETRY_COOLDOWN_MS = 4000;
    //After a connectivity level failure wait before any new token request
    private static final long GQL_FAIL_COOLDOWN_MS = 20000;

    private static final Object LOCK = new Object();

    private static final List<Session> SESSIONS = new ArrayList<>();

    private static volatile long gqlBlockedUntil;
    private static String deviceId;

    //Media playlist url -> last swap attempt time, bounded by clearing when it grows too much
    private static final Map<String, Long> LAST_ATTEMPT = new HashMap<>();

    private static class Variant {

        String url;
        int width;
        int height;
        boolean hevc;
    }

    private static class Session {

        String masterUrl;
        String channel;
        //Variant urls as present on the master playlist served to the player
        final Map<String, Variant> variantsByUrl = new HashMap<>();

        //Backup master playlist cache, per player type
        final String[] backupMasters = new String[PLAYER_TYPES.length];
        final long[] backupMasterAt = new long[PLAYER_TYPES.length];
    }

    private AdSwapClient() {}

    /**
     * Records the usher url of a live channel together with the master playlist the player is
     * served, allowing later mapping of a media playlist request back to its session.
     */
    static void recordMasterSession(String masterUrl, byte[] mainPlaylist) {
        if (masterUrl == null || mainPlaylist == null || mainPlaylist.length == 0) return;

        //Only live channel playback can be swapped
        int pathIndex = masterUrl.indexOf("/api/channel/hls/");
        if (pathIndex < 0) return;

        int nameStart = pathIndex + "/api/channel/hls/".length();
        int nameEnd = masterUrl.indexOf(".m3u8", nameStart);
        if (nameEnd <= nameStart) return;

        try {
            Session session = new Session();

            session.masterUrl = masterUrl;
            session.channel = masterUrl.substring(nameStart, nameEnd);
            session.variantsByUrl.putAll(parseVariantUrls(new String(mainPlaylist, StandardCharsets.UTF_8)));

            if (session.variantsByUrl.isEmpty()) return;

            synchronized (LOCK) {
                //Replace a previous session of the same master url, keep the list small (multi view plays up to 4 streams)
                for (int i = 0; i < SESSIONS.size(); i++) {
                    if (SESSIONS.get(i).masterUrl.equals(masterUrl)) {
                        SESSIONS.set(i, session);
                        return;
                    }
                }

                if (SESSIONS.size() >= 8) SESSIONS.remove(0);

                SESSIONS.add(session);
            }
        } catch (Exception e) {
            Log.e(TAG, "recordMasterSession error", e);
        }
    }

    /**
     * Whether this media playlist url belongs to a recorded live channel session. Live channel
     * playlists title their content segments "live", what allows spotting ads that carry no
     * dedicated marker at all; vod playlists don't follow that convention so the check must not
     * be applied to them.
     */
    static boolean isLiveSession(Uri uri) {
        return findSession(uri) != null;
    }

    /**
     * Returns the media playlist of an ad free backup stream matching the given playlist's
     * resolution, or null when no clean backup could be obtained in time.
     */
    static byte[] getCleanPlaylist(Uri uri) {
        long now = System.currentTimeMillis();

        if (now < gqlBlockedUntil) return null;

        Session session = findSession(uri);
        if (session == null) return null;

        //The player may append low latency delta parameters to the url, compare without the query
        Variant target = session.variantsByUrl.get(withoutQuery(uri));
        if (target == null) return null;

        String uriKey = withoutQuery(uri);

        synchronized (LOCK) {
            Long lastAttempt = LAST_ATTEMPT.get(uriKey);
            if (lastAttempt != null && now - lastAttempt < RETRY_COOLDOWN_MS) return null;

            if (LAST_ATTEMPT.size() > 32) LAST_ATTEMPT.clear();

            LAST_ATTEMPT.put(uriKey, now);
        }

        long deadline = now + SWAP_BUDGET_MS;

        for (int typeIndex = 0; typeIndex < PLAYER_TYPES.length; typeIndex++) {
            String backupMaster = backupMaster(session, typeIndex, deadline);

            if (backupMaster == null) continue;

            Variant backup = pickVariant(backupMaster, target);

            if (backup == null) continue;

            String backupPlaylist = httpGet(backup.url, deadline);

            if (backupPlaylist == null) {
                //The cached master is likely dead (the stream probably restarted), back this
                //player type off and force a refresh next time
                synchronized (LOCK) {
                    session.backupMasters[typeIndex] = null;
                    session.backupMasterAt[typeIndex] = now;
                }
                continue;
            }

            if (!AdPlaylistFilter.playlistHasAds(backupPlaylist, true)) {
                Log.d(TAG, "swapping " + session.channel + " to a clean " + PLAYER_TYPES[typeIndex] + " playlist");
                return backupPlaylist.getBytes(StandardCharsets.UTF_8);
            }
        }

        return null;
    }

    /**
     * The url without its query part, media playlist urls on the master playlist carry no query
     * while the player may request them with low latency delta parameters appended.
     */
    private static String withoutQuery(Uri uri) {
        String uriString = uri.toString();
        int queryStart = uriString.indexOf('?');

        return queryStart >= 0 ? uriString.substring(0, queryStart) : uriString;
    }

    private static Session findSession(Uri uri) {
        String uriKey = withoutQuery(uri);

        synchronized (LOCK) {
            for (int i = SESSIONS.size() - 1; i >= 0; i--) {
                Session session = SESSIONS.get(i);
                if (session.variantsByUrl.containsKey(uriKey)) return session;
            }
        }

        return null;
    }

    /**
     * Returns the backup master playlist for the given player type, from cache when fresh or
     * requesting a new token and usher playlist when needed.
     */
    private static String backupMaster(Session session, int typeIndex, long deadline) {
        long now = System.currentTimeMillis();
        String cached;

        synchronized (LOCK) {
            cached = session.backupMasters[typeIndex];
            if (cached != null && now - session.backupMasterAt[typeIndex] < MASTER_CACHE_MS) return cached;
        }

        String[] token = requestToken(session.channel, typeIndex, deadline);

        if (token == null) {
            synchronized (LOCK) {
                session.backupMasterAt[typeIndex] = now;
            }
            return null;
        }

        String master = httpGet(buildUsherUrl(session.masterUrl, token[0], token[1]), deadline);

        synchronized (LOCK) {
            session.backupMasterAt[typeIndex] = now;
            if (master != null) session.backupMasters[typeIndex] = master;
        }

        return master;
    }

    /**
     * Requests an anonymous PlaybackAccessToken for the given player type.
     * Returns {value, signature} or null on failure.
     */
    private static String[] requestToken(String channel, int typeIndex, long deadline) {
        String body = "{\"operationName\":\"PlaybackAccessToken\",\"variables\":{\"isLive\":true,\"login\":\"" + channel + "\",\"isVod\":false,\"vodID\":\"\",\"playerType\":\""
            + PLAYER_TYPES[typeIndex] + "\",\"platform\":\"" + PLAYER_PLATFORMS[typeIndex]
            + "\"},\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\"" + TOKEN_PERSISTED_HASH + "\"}}}";

        try {
            JSONObject response = new JSONObject(httpPost(GQL_URL, body, deadline));

            if (response.has("data")) {
                JSONObject token = response.getJSONObject("data").getJSONObject("streamPlaybackAccessToken");

                return new String[] {token.getString("value"), token.getString("signature")};
            }
        } catch (IOException e) {
            //Connectivity level problem, back off before trying any token request again
            gqlBlockedUntil = System.currentTimeMillis() + GQL_FAIL_COOLDOWN_MS;
            Log.e(TAG, "token request failed " + e.toString());
        } catch (Exception e) {
            Log.e(TAG, "token parse error", e);
        }

        return null;
    }

    /**
     * Rebuilds the original usher url replacing the token and signature with the given ones,
     * every other query parameter is kept as the player sent it.
     */
    private static String buildUsherUrl(String masterUrl, String token, String signature) {
        int queryStart = masterUrl.indexOf('?');
        if (queryStart < 0) return null; //should not happen, the token always comes in the query

        try {
            StringBuilder builder = new StringBuilder(masterUrl.substring(0, queryStart + 1));
            String[] params = masterUrl.substring(queryStart + 1).split("&");
            boolean first = true;

            for (String param : params) {
                if (param.startsWith("token=") || param.startsWith("sig=")) continue;

                if (!first) builder.append('&');
                builder.append(param);
                first = false;
            }

            if (!first) builder.append('&');
            builder.append("token=").append(URLEncoder.encode(token, "UTF-8"));
            builder.append("&sig=").append(URLEncoder.encode(signature, "UTF-8"));

            return builder.toString();
        } catch (Exception e) {
            Log.e(TAG, "buildUsherUrl error", e);
            return null;
        }
    }

    /**
     * Picks from a backup master the variant closest to the one currently being played, preferring
     * the same codec family so the player doesn't have to switch decoders mid stream.
     */
    private static Variant pickVariant(String master, Variant target) {
        Variant best = null;
        int bestScore = Integer.MAX_VALUE;

        for (Variant variant : parseVariants(master)) {
            int score = Math.abs(variant.width * variant.height - target.width * target.height);

            if (variant.hevc != target.hevc) score += 100000000;

            if (score < bestScore) {
                bestScore = score;
                best = variant;
            }
        }

        return best;
    }

    private static Map<String, Variant> parseVariantUrls(String master) {
        Map<String, Variant> urls = new HashMap<>();

        for (Variant variant : parseVariants(master)) {
            urls.put(variant.url, variant);
        }

        return urls;
    }

    private static List<Variant> parseVariants(String master) {
        List<Variant> variants = new ArrayList<>();
        String[] lines = master.split("\n");

        for (int i = 0; i < lines.length; i++) {
            if (!lines[i].trim().startsWith("#EXT-X-STREAM-INF")) continue;

            for (int j = i + 1; j < lines.length; j++) {
                String urlLine = lines[j].trim();

                if (urlLine.isEmpty() || urlLine.startsWith("#")) continue;

                Variant variant = parseStreamInf(lines[i].trim(), urlLine);
                if (variant != null) variants.add(variant);

                break;
            }
        }

        return variants;
    }

    private static Variant parseStreamInf(String streamInfLine, String url) {
        String resolution = attributeValue(streamInfLine, "RESOLUTION");
        if (resolution == null) return null; //audio only or malformed entry

        int separator = resolution.indexOf('x');
        if (separator <= 0 || separator == resolution.length() - 1) return null;

        try {
            Variant variant = new Variant();

            variant.url = url;
            variant.width = Integer.parseInt(resolution.substring(0, separator));
            variant.height = Integer.parseInt(resolution.substring(separator + 1));

            String codecs = attributeValue(streamInfLine, "CODECS");
            variant.hevc = codecs != null && (codecs.contains("hvc") || codecs.contains("hev"));

            return variant;
        } catch (NumberFormatException e) {
            Log.e(TAG, "invalid resolution " + resolution);
            return null;
        }
    }

    /**
     * Extracts an unquoted attribute value from a #EXT-X-STREAM-INF line, quoted values have
     * their quotes stripped.
     */
    private static String attributeValue(String line, String attribute) {
        int keyIndex = line.indexOf(attribute + "=");
        if (keyIndex < 0) return null;

        int valueStart = keyIndex + attribute.length() + 1;
        if (valueStart >= line.length()) return null;

        if (line.charAt(valueStart) == '"') {
            int valueEnd = line.indexOf('"', valueStart + 1);
            return valueEnd > valueStart ? line.substring(valueStart + 1, valueEnd) : null;
        }

        int valueEnd = line.indexOf(',', valueStart);
        return valueEnd > valueStart ? line.substring(valueStart, valueEnd) : line.substring(valueStart);
    }

    private static String httpGet(String url, long deadline) {
        HttpURLConnection connection = null;

        try {
            if (System.currentTimeMillis() > deadline) return null;

            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setConnectTimeout(CONNECT_TIMEOUT);
            connection.setReadTimeout(READ_TIMEOUT);
            connection.setRequestProperty("User-Agent", USER_AGENT);

            int code = connection.getResponseCode();
            if (code < 200 || code > 299) return null;

            return readResponse(connection, deadline);
        } catch (IOException e) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String httpPost(String url, String body, long deadline) throws IOException {
        HttpURLConnection connection = null;

        try {
            if (System.currentTimeMillis() > deadline) throw new IOException("swap budget expired");

            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(CONNECT_TIMEOUT);
            connection.setReadTimeout(READ_TIMEOUT);
            connection.setDoOutput(true);
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Client-ID", CLIENT_ID);
            connection.setRequestProperty("X-Device-Id", getDeviceId());
            connection.setRequestProperty("Content-Type", "application/json");

            connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));

            int code = connection.getResponseCode();
            if (code < 200 || code > 299) throw new IOException("gql http " + code);

            return readResponse(connection, deadline);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readResponse(HttpURLConnection connection, long deadline) throws IOException {
        InputStream stream = connection.getInputStream();
        ByteArrayOutputStream output = new ByteArrayOutputStream(8192);
        byte[] buffer = new byte[4096];

        try {
            int read;
            while ((read = stream.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                if (System.currentTimeMillis() > deadline) throw new IOException("swap budget expired");
            }
        } finally {
            stream.close();
        }

        return output.toString("UTF-8");
    }

    private static String getDeviceId() {
        synchronized (LOCK) {
            if (deviceId == null) {
                StringBuilder builder = new StringBuilder(32);
                String characters = "abcdefghijklmnopqrstuvwxyz0123456789";

                for (int i = 0; i < 32; i++) {
                    builder.append(characters.charAt((int) Math.floor(Math.random() * characters.length())));
                }

                deviceId = builder.toString();
            }

            return deviceId;
        }
    }
}
