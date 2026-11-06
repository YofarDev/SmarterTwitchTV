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
 * along with SmartTwitchTV.  If not, see <https://github.com/fgl27/SmartTwitchTV/blob/master/LICENSE>.
 *
 */

package com.fgl27.twitch.DataSource;

import android.net.Uri;
import android.util.Log;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.google.common.io.ByteStreams;

/**
 * Removes server side ad insertion (SSAI) entries from Twitch live media playlists before the
 * player parses them. Twitch stitches ads directly into the *.ttvnw.net media playlists; the
 * playlist is filtered on every refresh so the player only ever sees the stream's own segments,
 * resuming at the live edge once the ad window is over.
 *
 * When the whole playlist window turns into ad content the filter freezes the picture instead:
 * it serves a playlist that repeats the last live segment seen for that stream, so the player
 * shows a frozen frame (and keeps buffering nothing new) until Twitch serves live content again.
 * Only a window that is all ads from the very first fetch (a preroll on a brand new session,
 * with no live segment ever seen) still fails open and plays the ad, because an empty playlist
 * would end playback with a PlaylistStuckException.
 *
 * The filter is intentionally fail-open: on any parse error the original playlist is returned
 * unmodified so playback is never broken by the ad blocking itself.
 */
public final class AdPlaylistFilter {

    private static final String TAG = "STTV_AdFilter";

    private static final String HOST_SUFFIX = ".ttvnw.net";
    private static final String PLAYLIST_EXTENSION = ".m3u8";

    private static final String MARKER_STITCHED_AD = "twitch-stitched-ad";
    private static final String MARKER_STREAM_SOURCE = "twitch-stream-source";
    //The source marker value when live content is being served; during ads the same marker
    //carries the ad creative id instead (X-TV-TWITCH-STREAM-SOURCE="Amazon|..."), so only
    //this exact value really means the ad window is over
    private static final String MARKER_STREAM_SOURCE_LIVE = "X-TV-TWITCH-STREAM-SOURCE=\"live\"";
    private static final String MARKER_LEGACY_AD_URL = "stitched-ad";
    //Ad segments are titled "Amazon" or "Amazon|<creative id>"
    private static final String MARKER_AD_TITLE = "Amazon";
    private static final String LIVE_SEGMENT_TITLE = "live";

    public static volatile boolean enabled = true;

    /**
     * Fired (from a player loader thread) when a midroll can no longer be hidden by stripping,
     * the web side is expected to reload the stream in the hope of getting an ad free token.
     */
    public interface AdReloadListener {

        void onAdReloadRequested();
    }

    private static volatile AdReloadListener adReloadListener;
    private static volatile long strippingSince;
    private static volatile long lastReloadNotify;

    //A midroll shorter than this is usually covered by the player buffer and never visible
    private static final long STRIP_GRACE_MS = 6000;
    //Minimum time between reload requests. Ads surviving a reload mean the fresh session also
    //carries the break, so the player type must rotate fast (the web side walks its
    //embed/popout/autoplay ladder) to try every type within a single ad break
    private static final long RELOAD_COOLDOWN_MS = 15000;

    //Last seen live segment per media playlist url ({EXTINF line, segment uri}), the source of
    //the freeze frame playlist when a window becomes all ad content. Keyed by playlist url so
    //concurrent players (multi view, previews) never freeze on each other's content
    private static final Map<String, String[]> LIVE_SEGMENTS = new HashMap<>();
    //Sessions are few, a size cap with a full clear is enough to drop entries of ended sessions
    private static final int LIVE_SEGMENTS_MAX = 16;
    //Playlist level tags copied over to a freeze frame playlist; segment level tags and the ad
    //DATERANGEs are deliberately left out
    private static final String[] FREEZE_HEADER_TAGS = {
        "#EXT-X-VERSION:",
        "#EXT-X-TARGETDURATION:",
        "#EXT-X-MEDIA-SEQUENCE:",
        "#EXT-X-DISCONTINUITY-SEQUENCE:"
    };
    private static final String END_LIST_TAG = "#EXT-X-ENDLIST";

    //While a freeze frame is served the player stalls on it or reports its playlist as stuck.
    //That is the ad break, not a dead stream, so the player checks must not count it as a failure
    private static volatile long freezeStartedAt;
    private static volatile long freezeServedAt;
    //Freeze frames are served on every playlist refresh, a few seconds apart; a longer gap means
    //the freeze is over (live content is back, or the playlist requests fail)
    static final long FREEZE_ACTIVE_MS = 10000;
    //Longer than any ad break. A freeze lasting more than this no longer excuses player failures,
    //so a stream that never comes back from a break is still declared ended
    static final long FREEZE_EXCUSE_MAX_MS = 300000;

    private AdPlaylistFilter() {}

    public static void setEnabled(boolean value) {
        enabled = value;
    }

    /**
     * Whether an ad freeze frame is being served right now, so a player stall or stuck playlist
     * is the ad break and not a dead stream. Stays false for a freeze older than
     * FREEZE_EXCUSE_MAX_MS.
     */
    public static boolean isAdFreezeActive() {
        return isAdFreezeActive(System.currentTimeMillis());
    }

    static boolean isAdFreezeActive(long now) {
        return freezeServedAt > 0 && now - freezeServedAt <= FREEZE_ACTIVE_MS && now - freezeStartedAt <= FREEZE_EXCUSE_MAX_MS;
    }

    static void onFreezeServed(long now) {
        if (now - freezeServedAt > FREEZE_ACTIVE_MS) freezeStartedAt = now;

        freezeServedAt = now;
    }

    public static void setAdReloadListener(AdReloadListener listener) {
        adReloadListener = listener;
    }

    private static void requestAdReloadIfNeeded(boolean allAds) {
        long now = System.currentTimeMillis();

        if (!allAds) {
            if (strippingSince == 0) {
                strippingSince = now;
                return;
            }

            if (now - strippingSince < STRIP_GRACE_MS) return;
        }

        if (now - lastReloadNotify < RELOAD_COOLDOWN_MS) return;

        lastReloadNotify = now;
        strippingSince = 0;

        AdReloadListener listener = adReloadListener;
        if (listener != null) {
            Log.i(TAG, "requesting a stream reload to escape ads");
            listener.onAdReloadRequested();
        }
    }

    private static void resetAdReloadTracking() {
        strippingSince = 0;
    }

    /**
     * Whether a request for this uri should be filtered. Only Twitch media playlists are of
     * interest; segments and everything else flow through untouched.
     */
    public static boolean shouldFilter(Uri uri) {
        if (uri == null || uri.getHost() == null) return false;

        String path = uri.getPath();
        return uri.getHost().endsWith(HOST_SUFFIX) && path != null && path.endsWith(PLAYLIST_EXTENSION);
    }

    /**
     * Reads the whole response and, when filtering applies, returns the scrubbed bytes. Returns
     * null when the response must not be buffered (the caller then reads the stream normally).
     */
    public static byte[] readAndFilter(Uri uri, InputStream inputStream) throws IOException {
        if (!enabled || !shouldFilter(uri)) return null;

        byte[] original = ByteStreams.toByteArray(inputStream);

        try {
            FilterResult result = filter(original, uri.toString());

            if (result == null) {
                //No ad content, playback is clean
                resetAdReloadTracking();
                return original;
            }

            requestAdReloadIfNeeded(result.allAds);

            return result.playlist != null ? result.playlist : original;
        } catch (Exception e) {
            // Fail-open, never let the filter break playback
            Log.e(TAG, "playlist filter error, returning original playlist", e);

            return original;
        }
    }

    /**
     * The outcome of a filter pass: the scrubbed playlist (null when the original must be
     * served) and whether the whole window turned out to be ad content.
     */
    private static class FilterResult {

        final byte[] playlist;
        final boolean allAds;

        FilterResult(byte[] playlist, boolean allAds) {
            this.playlist = playlist;
            this.allAds = allAds;
        }
    }

    /**
     * Returns the filter outcome, or null when the playlist has no ad content. The playlist url
     * keys the live segment memory used to build freeze frame playlists.
     */
    private static FilterResult filter(byte[] playlistBytes, String playlistUrl) {
        String playlist = new String(playlistBytes, StandardCharsets.UTF_8);

        // Playlists are small, a simple split is cheaper than a streaming parser
        String[] lines = playlist.split("\n");
        List<String> out = new ArrayList<>(lines.length);

        boolean inAdRegion = false;
        int removedSegments = 0;
        int removedAtHead = 0;
        boolean seenKeptSegment = false;
        String lastLiveExtInf = null;
        String lastLiveUri = null;

        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();

            // SCTE-35 markers delimit an ad insertion window, the SSAI DATERANGE marks a
            // twitch-stitched-ad region; both only exist to describe ads, so they are dropped
            if (line.startsWith("#EXT-X-SCTE35-OUT") || line.startsWith("#EXT-X-SCTE35-IN")) {
                inAdRegion = line.startsWith("#EXT-X-SCTE35-OUT");
                continue;
            }

            if (line.startsWith("#EXT-X-DATERANGE")) {
                if (line.contains(MARKER_STITCHED_AD)) {
                    inAdRegion = true;
                    continue;
                } else if (line.contains(MARKER_STREAM_SOURCE)) {
                    //Live content resumed after the ad; only when the marker really says live,
                    //during an ad it describes the ad creative instead
                    if (line.contains(MARKER_STREAM_SOURCE_LIVE)) inAdRegion = false;
                }
            } else if (line.startsWith("#EXT-X-SCTE35") || line.startsWith("#EXT-X-ASSET")) {
                // Leftover SSAI signalling tags
                continue;
            }

            //While inside an ad region the remaining tags only describe ad content, dropping
            //them avoids orphan PROGRAM-DATE-TIME entries mis-timestamping the next kept segment
            if (inAdRegion && (line.startsWith("#EXT-X-PROGRAM-DATE-TIME") || line.startsWith("#EXT-X-BYTERANGE"))) {
                continue;
            }

            if (line.startsWith("#EXTINF")) {
                //Ad segments are never titled "live", so a live title also ends any ad region
                //whose end marker may be missing
                if (inAdRegion && segmentTitleIs(line, LIVE_SEGMENT_TITLE)) inAdRegion = false;

                int segmentLine = findSegmentUri(lines, i + 1);

                if (segmentLine != -1 && isAdSegment(line, lines[segmentLine].trim(), inAdRegion)) {
                    removedSegments++;
                    if (!seenKeptSegment) removedAtHead++;

                    // Drop the EXTINF, everything between it and the uri (PROGRAM-DATE-TIME and
                    // related) plus the uri itself
                    i = segmentLine;
                    continue;
                }

                seenKeptSegment = true;

                //Remember the newest live segment, it becomes the freeze frame when the whole
                //window turns into ad content
                if (segmentLine != -1) {
                    lastLiveExtInf = line;
                    lastLiveUri = lines[segmentLine].trim();
                }
            } else if (!line.isEmpty() && !line.startsWith("#")) {
                seenKeptSegment = true;
            } else if (line.startsWith("#EXT-X-TWITCH-PREFETCH:") && (inAdRegion || line.contains(MARKER_LEGACY_AD_URL))) {
                // Never prefetch an ad segment
                continue;
            }

            out.add(line);
        }

        if (lastLiveUri != null && playlistUrl != null) {
            synchronized (LIVE_SEGMENTS) {
                if (LIVE_SEGMENTS.size() >= LIVE_SEGMENTS_MAX) LIVE_SEGMENTS.clear();

                LIVE_SEGMENTS.put(playlistUrl, new String[] {lastLiveExtInf, lastLiveUri});
            }
        }

        if (removedSegments == 0) return null;

        if (!seenKeptSegment) {
            //The whole window is ad content. Freeze on the last live segment seen for this
            //playlist so the player shows a still frame instead of the ad and simply waits out
            //the break; the escape reloads keep running underneath looking for a clean session
            String[] liveSegment = playlistUrl != null ? getLiveSegment(playlistUrl) : null;

            if (liveSegment != null) {
                Log.i(TAG, "playlist is all ad content, freezing on the last live segment");
                onFreezeServed(System.currentTimeMillis());

                return new FilterResult(freezePlaylist(lines, liveSegment), true);
            }

            //Nothing live was ever seen for this playlist (a preroll on a brand new session),
            //there is no segment to freeze on and serving an empty playlist would end with a
            //PlaylistStuckException; better to let this ad run and continue normally after it
            Log.i(TAG, "playlist is all ad content with no live segment to freeze on, letting it play");

            return new FilterResult(null, true);
        }

        collapseDiscontinuities(out);

        if (removedAtHead > 0) bumpMediaSequence(out, removedAtHead);

        Log.i(TAG, "removed " + removedSegments + " ad segment(s)");

        return new FilterResult(joinLines(out), false);
    }

    private static String[] getLiveSegment(String playlistUrl) {
        synchronized (LIVE_SEGMENTS) {
            return LIVE_SEGMENTS.get(playlistUrl);
        }
    }

    /**
     * Builds the freeze frame playlist: the original's playlist level header tags followed by the
     * last live segment, repeated on every refresh. The advancing media sequence keeps the player
     * polling while the repeated segment leaves the decoder with already played content, so the
     * picture freezes until the original playlist serves live content again.
     */
    private static byte[] freezePlaylist(String[] lines, String[] liveSegment) {
        List<String> out = new ArrayList<>(FREEZE_HEADER_TAGS.length + 4);
        boolean endList = false;

        out.add("#EXTM3U");

        for (String line : lines) {
            String trimmed = line.trim();

            if (trimmed.equals(END_LIST_TAG)) endList = true;

            for (String tag : FREEZE_HEADER_TAGS) {
                if (trimmed.startsWith(tag)) {
                    out.add(trimmed);
                    break;
                }
            }
        }

        out.add(liveSegment[0]);
        out.add(liveSegment[1]);

        //The stream ended during the break: keep the end mark so the player ends normally
        //instead of waiting on the freeze for live content that will never come
        if (endList) out.add(END_LIST_TAG);

        return joinLines(out);
    }

    /**
     * A segment is ad content when inside an ad region, or when it carries one of the ad
     * markers in its url or title.
     */
    private static boolean isAdSegment(String extInfLine, String uriLine, boolean inAdRegion) {
        if (inAdRegion) return true;

        if (uriLine.contains(MARKER_LEGACY_AD_URL)) return true;

        return segmentTitleIs(extInfLine, MARKER_AD_TITLE);
    }

    /**
     * Whether the EXTINF line's title (the text after the comma) is or starts with the given
     * ad title... when checking for the live title it must match exactly, for ad titles a
     * prefix match covers the "Amazon|<creative id>" format.
     */
    private static boolean segmentTitleIs(String extInfLine, String title) {
        int titleIndex = extInfLine.indexOf(',');
        if (titleIndex < 0) return false;

        String segmentTitle = extInfLine.substring(titleIndex + 1).trim();

        return title.equals(LIVE_SEGMENT_TITLE) ? segmentTitle.equals(title) : segmentTitle.startsWith(title);
    }

    /**
     * Finds the line index of the segment uri that follows an EXTINF tag, skipping the comment
     * lines (PROGRAM-DATE-TIME, BYTERANGE and etc) in between. Returns -1 when there is none.
     */
    private static int findSegmentUri(String[] lines, int from) {
        for (int i = from; i < lines.length; i++) {
            String line = lines[i].trim();

            if (line.startsWith("#")) continue;

            return line.isEmpty() ? -1 : i;
        }

        return -1;
    }

    /**
     * Removing ad segments leaves behind the discontinuity tags that surrounded them, resulting
     * in back to back EXT-X-DISCONTINUITY entries; those must collapse into a single one.
     */
    private static void collapseDiscontinuities(List<String> lines) {
        boolean previousWasDiscontinuity = false;

        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);
            // EXT-X-DISCONTINUITY-SEQUENCE also prefix matches EXT-X-DISCONTINUITY, exclude it
            boolean isDiscontinuity = line.startsWith("#EXT-X-DISCONTINUITY") && !line.startsWith("#EXT-X-DISCONTINUITY-SEQUENCE");

            if (isDiscontinuity && previousWasDiscontinuity) {
                lines.remove(i);
                i--;
            } else {
                previousWasDiscontinuity = isDiscontinuity;
            }
        }
    }

    /**
     * String.join needs api 26, the app supports older devices so join manually
     */
    private static byte[] joinLines(List<String> lines) {
        StringBuilder builder = new StringBuilder(lines.size() * 32);

        for (String line : lines) {
            builder.append(line).append('\n');
        }

        return builder.toString().getBytes(StandardCharsets.UTF_8);
    }

    /**
     * Segments dropped from the head of the window shift the playlist's first segment, the media
     * sequence must follow so the player's segment indexing stays consistent across refreshes.
     */
    private static void bumpMediaSequence(List<String> lines, int removedAtHead) {
        for (int i = 0; i < lines.size(); i++) {
            String line = lines.get(i);

            if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
                try {
                    long sequence = Long.parseLong(line.substring(line.indexOf(':') + 1).trim());

                    lines.set(i, "#EXT-X-MEDIA-SEQUENCE:" + (sequence + removedAtHead));
                } catch (NumberFormatException e) {
                    Log.e(TAG, "invalid media sequence line " + line);
                }

                return;
            }
        }
    }
}
