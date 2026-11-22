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

package com.fgl27.twitch;

import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Reads the wall clock a Twitch HLS segment was transcoded at from its ID3 text frames.
 *
 * Every Twitch segment starts with an ID3 tag carrying a TXXX frame with the ld_lat_data JSON
 * ("transc_r": epoch ms) and TDEN/TDTG dates (UTC, second precision). VOD chat offsets count
 * wall clock from the recording start, while the VOD timeline skips the time the stream was down,
 * so the web side needs the segment wall clock to place chat on the video.
 *
 * Plain Java only (no Android/Media3 types) so the parsing runs in the JDK fixture harness.
 */
public final class SegmentWallClock {

    private static final String TRANSCODE_KEY = "\"transc_r\":";
    //Earliest accepted value, anything before is a broken tag (2015-01-01)
    private static final long MIN_EPOCH_MS = 1420070400000L;

    private SegmentWallClock() {}

    /**
     * Wall clock (epoch ms) from one ID3 text frame, 0 when the frame carries none.
     * TXXX gives ms precision, TDEN/TDTG second precision; callers prefer the first.
     */
    public static long fromFrame(String id, String value) {
        if (id == null || value == null) return 0;

        if (id.equals("TXXX")) return fromLatencyJson(value);
        if (id.equals("TDEN") || id.equals("TDTG")) return fromDate(value);

        return 0;
    }

    /** Whether a frame value comes with ms precision, so no other frame needs to be checked. */
    public static boolean isPrecise(String id) {
        return "TXXX".equals(id);
    }

    static long fromLatencyJson(String value) {
        int index = value.indexOf(TRANSCODE_KEY);
        if (index < 0) return 0;

        index += TRANSCODE_KEY.length();
        int end = index;

        while (end < value.length() && Character.isDigit(value.charAt(end))) end++;

        if (end == index) return 0;

        try {
            long ms = Long.parseLong(value.substring(index, end));
            return ms >= MIN_EPOCH_MS ? ms : 0;
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    static long fromDate(String value) {
        //yyyy-MM-ddTHH:mm:ss, UTC
        if (value.length() < 19) return 0;

        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        format.setLenient(false);

        try {
            long ms = format.parse(value.substring(0, 19)).getTime();
            return ms >= MIN_EPOCH_MS ? ms : 0;
        } catch (ParseException e) {
            return 0;
        }
    }
}
