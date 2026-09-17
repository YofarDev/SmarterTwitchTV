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
import java.util.List;

import com.google.common.io.ByteStreams;

/**
 * Removes server side ad insertion (SSAI) entries from Twitch live media playlists before the
 * player parses them. Twitch stitches ads directly into the *.ttvnw.net media playlists; the
 * playlist is filtered on every refresh so the player only ever sees the stream's own segments,
 * resuming at the live edge once the ad window is over.
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
    private static final String MARKER_LEGACY_AD_URL = "stitched-ad";
    private static final String MARKER_LEGACY_AD_TITLE = "Amazon";

    public static volatile boolean enabled = true;

    private AdPlaylistFilter() {}

    public static void setEnabled(boolean value) {
        enabled = value;
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
            byte[] filtered = filter(original);

            return filtered != null ? filtered : original;
        } catch (Exception e) {
            // Fail-open, never let the filter break playback
            Log.e(TAG, "playlist filter error, returning original playlist", e);

            return original;
        }
    }

    /**
     * Returns the scrubbed playlist, or null when the playlist has no ad content.
     */
    private static byte[] filter(byte[] playlistBytes) {
        String playlist = new String(playlistBytes, StandardCharsets.UTF_8);

        // Playlists are small, a simple split is cheaper than a streaming parser
        String[] lines = playlist.split("\n");
        List<String> out = new ArrayList<>(lines.length);

        boolean inAdRegion = false;
        int removedSegments = 0;
        int removedAtHead = 0;
        boolean seenKeptSegment = false;

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
                    // Live content resumed after the ad
                    inAdRegion = false;
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
            } else if (!line.isEmpty() && !line.startsWith("#")) {
                seenKeptSegment = true;
            } else if (line.startsWith("#EXT-X-TWITCH-PREFETCH:") && (inAdRegion || line.contains(MARKER_LEGACY_AD_URL))) {
                // Never prefetch an ad segment
                continue;
            }

            out.add(line);
        }

        if (removedSegments == 0) return null;

        collapseDiscontinuities(out);

        if (removedAtHead > 0) bumpMediaSequence(out, removedAtHead);

        Log.d(TAG, "removed " + removedSegments + " ad segment(s)");

        return joinLines(out);
    }

    /**
     * A segment is ad content when inside an ad region, or when it carries one of the legacy
     * ad markers in its url or title.
     */
    private static boolean isAdSegment(String extInfLine, String uriLine, boolean inAdRegion) {
        if (inAdRegion) return true;

        if (uriLine.contains(MARKER_LEGACY_AD_URL)) return true;

        int titleIndex = extInfLine.indexOf(',');

        return titleIndex >= 0 && MARKER_LEGACY_AD_TITLE.equals(extInfLine.substring(titleIndex + 1).trim());
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
