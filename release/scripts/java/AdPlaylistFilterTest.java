package com.fgl27.twitch.DataSource;

import android.net.Uri;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Fixture checks for AdPlaylistFilter: ad stripping, media sequence handling and the freeze
 * frame served when a whole window turns into ad content. The playlists mirror the structure
 * of real Twitch SSAI playlists (stitched-ad DATERANGE, Amazon|<creative id> titles, live
 * titles, SCTE-less signalling).
 */
public final class AdPlaylistFilterTest {
    private static int checks;

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    private static byte[] filter(String url, String playlist) throws Exception {
        return AdPlaylistFilter.readAndFilter(Uri.parse(url), new ByteArrayInputStream(playlist.getBytes(StandardCharsets.UTF_8)));
    }

    private static String s(byte[] b) {
        return new String(b, StandardCharsets.UTF_8);
    }

    private static long mediaSequence(String playlist) {
        for (String l : playlist.split("\n")) {
            if (l.startsWith("#EXT-X-MEDIA-SEQUENCE:")) return Long.parseLong(l.substring(l.indexOf(':') + 1).trim());
        }
        return -1;
    }

    private static boolean hasAdSegment(String playlist) {
        for (String l : playlist.split("\n")) {
            if (l.startsWith("#EXTINF") && l.contains("Amazon")) return true;
        }
        return false;
    }

    private static String segments(String... uris) {
        StringBuilder b = new StringBuilder();
        for (String uri : uris) b.append("#EXTINF:2.000,").append(uri.startsWith("ad_") ? "Amazon|2474283100494" : "live").append('\n').append("https://cdn.hls.ttvnw.net/v1/segment/").append(uri).append(".ts\n");
        return b.toString();
    }

    private static final String LIVE_HEADER =
        "#EXTM3U\n" +
        "#EXT-X-VERSION:3\n" +
        "#EXT-X-TARGETDURATION:6\n" +
        "#EXT-X-MEDIA-SEQUENCE:3400\n" +
        "#EXT-X-TWITCH-LIVE-SEQUENCE:3400\n" +
        "#EXT-X-DATERANGE:ID=\"playlist-creation-1\",CLASS=\"timestamp\",START-DATE=\"2026-10-24T06:42:20.056Z\",END-ON-NEXT=YES,X-SERVER-TIME=\"1792824140.06\"\n" +
        "#EXT-X-DATERANGE:ID=\"source-1\",CLASS=\"twitch-stream-source\",START-DATE=\"2026-10-24T06:41:48.153Z\",END-ON-NEXT=YES,X-TV-TWITCH-STREAM-SOURCE=\"live\"\n";

    private static final String STITCHED_AD_DATERANGE =
        "#EXT-X-DATERANGE:ID=\"stitched-ad-1\",CLASS=\"twitch-stitched-ad\",START-DATE=\"2026-10-24T06:50:37.698Z\",DURATION=30.235,X-TV-TWITCH-AD-ROLL-TYPE=\"MIDROLL\",X-TV-TWITCH-AD-CREATIVE-ID=\"2474283100494\"\n";

    private static final String AD_SOURCE_DATERANGE =
        "#EXT-X-DATERANGE:ID=\"source-2\",CLASS=\"twitch-stream-source\",START-DATE=\"2026-10-24T06:50:37.698Z\",END-ON-NEXT=YES,X-TV-TWITCH-STREAM-SOURCE=\"Amazon|2474283100494\"\n";

    public static void main(String[] args) throws Exception {
        String url = "https://euw11.playlist.ttvnw.net/v1/playlist/testvariant.m3u8";

        String live = LIVE_HEADER + segments("live_0", "live_1", "live_2", "live_3");
        String allAds = "#EXTM3U\n" +
            "#EXT-X-VERSION:3\n" +
            "#EXT-X-TARGETDURATION:5\n" +
            "#EXT-X-MEDIA-SEQUENCE:3404\n" +
            STITCHED_AD_DATERANGE +
            AD_SOURCE_DATERANGE +
            "#EXT-X-DISCONTINUITY\n" +
            segments("ad_0", "ad_1", "ad_2") +
            "#EXT-X-TWITCH-PREFETCH:https://cdn.hls.ttvnw.net/v1/segment/ad_3.ts\n";
        String tailAds = LIVE_HEADER + segments("live_0", "live_1") + "#EXT-X-DISCONTINUITY\n" + STITCHED_AD_DATERANGE + AD_SOURCE_DATERANGE + segments("ad_0", "ad_1");
        String headAds = "#EXTM3U\n" +
            "#EXT-X-VERSION:3\n" +
            "#EXT-X-TARGETDURATION:6\n" +
            "#EXT-X-MEDIA-SEQUENCE:3400\n" +
            STITCHED_AD_DATERANGE +
            AD_SOURCE_DATERANGE +
            segments("ad_0", "ad_1") +
            "#EXT-X-DISCONTINUITY\n" +
            "#EXT-X-DATERANGE:ID=\"source-3\",CLASS=\"twitch-stream-source\",START-DATE=\"2026-10-24T06:52:00.000Z\",END-ON-NEXT=YES,X-TV-TWITCH-STREAM-SOURCE=\"live\"\n" +
            segments("live_0", "live_1");

        //A clean playlist passes through untouched
        byte[] r = filter(url, live);
        check(r != null && Arrays.equals(r, live.getBytes(StandardCharsets.UTF_8)), "clean playlist served unchanged");
        check(!AdPlaylistFilter.isAdFreezeActive(), "no freeze reported before one is served");

        //The whole window is ad content and live content was seen before: freeze on the last
        //live segment instead of playing the ad
        r = filter(url, allAds);
        String frozen = s(r);
        check(!Arrays.equals(r, allAds.getBytes(StandardCharsets.UTF_8)), "all-ads playlist replaced by a freeze frame");
        check(frozen.startsWith("#EXTM3U"), "freeze frame starts with EXTM3U");
        check(frozen.contains("#EXT-X-TARGETDURATION:"), "freeze frame carries TARGETDURATION");
        check(frozen.contains("#EXT-X-MEDIA-SEQUENCE:"), "freeze frame carries MEDIA-SEQUENCE");
        check(mediaSequence(frozen) == 3404, "freeze frame keeps the original media sequence");
        check(!hasAdSegment(frozen) && !frozen.contains("stitched") && !frozen.contains("ad_"), "freeze frame has no ad content");
        check(frozen.contains("https://cdn.hls.ttvnw.net/v1/segment/live_3.ts"), "freeze frame loops the last live segment");
        check(frozen.indexOf("live_3.ts") == frozen.lastIndexOf("live_3.ts"), "freeze frame holds a single segment");

        //The freeze holds across refreshes of the all-ads window
        r = filter(url, allAds);
        check(s(r).contains("live_3.ts") && !hasAdSegment(s(r)), "freeze frame stable across refreshes");
        check(!frozen.contains("#EXT-X-ENDLIST"), "freeze frame of a live window has no end mark");

        //While a freeze is served, player failures are the ad break and not a dead stream
        long now = System.currentTimeMillis();
        check(AdPlaylistFilter.isAdFreezeActive(), "freeze reported active while it is served");
        check(AdPlaylistFilter.isAdFreezeActive(now + AdPlaylistFilter.FREEZE_ACTIVE_MS / 2), "freeze still active between refreshes");
        check(!AdPlaylistFilter.isAdFreezeActive(now + AdPlaylistFilter.FREEZE_ACTIVE_MS + 1000), "freeze over once no freeze frame is served");

        //A freeze longer than any ad break stops excusing failures, so a stream that never comes
        //back is still declared ended; a later freeze (new break) is excused again
        long start = now + 10 * AdPlaylistFilter.FREEZE_ACTIVE_MS;
        long t = start;
        for (; t <= start + AdPlaylistFilter.FREEZE_EXCUSE_MAX_MS; t += 2000) AdPlaylistFilter.onFreezeServed(t);
        check(AdPlaylistFilter.isAdFreezeActive(start + AdPlaylistFilter.FREEZE_EXCUSE_MAX_MS), "long freeze excused up to the limit");
        AdPlaylistFilter.onFreezeServed(t);
        check(!AdPlaylistFilter.isAdFreezeActive(t), "freeze past the limit no longer excused");
        long nextBreak = t + AdPlaylistFilter.FREEZE_ACTIVE_MS + 1000;
        AdPlaylistFilter.onFreezeServed(nextBreak);
        check(AdPlaylistFilter.isAdFreezeActive(nextBreak), "a new freeze after a gap is excused again");

        //The stream ends during the break: the end mark survives the freeze so the player ends
        //normally instead of waiting for live content that never comes
        r = filter(url, allAds + "#EXT-X-ENDLIST\n");
        String frozenEnd = s(r);
        check(frozenEnd.contains("live_3.ts") && !hasAdSegment(frozenEnd), "ended all-ads window still frozen on live content");
        check(frozenEnd.trim().endsWith("#EXT-X-ENDLIST"), "freeze frame keeps the end mark, after the segment");

        //An all-ads window with no live segment ever seen (a preroll on a brand new session)
        //fails open: there is nothing to freeze on and an empty playlist would stall the player
        r = filter("https://euw13.playlist.ttvnw.net/v1/playlist/fresh.m3u8", allAds);
        check(r != null && Arrays.equals(r, allAds.getBytes(StandardCharsets.UTF_8)), "preroll on an unknown playlist fails open");

        //Ads at the tail of the window are stripped, live content is kept
        r = filter(url, tailAds);
        String stripped = s(r);
        check(!hasAdSegment(stripped) && !stripped.contains("ad_"), "tail ad segments removed");
        check(stripped.contains("live_0") && stripped.contains("live_1"), "live segments kept");
        check(mediaSequence(stripped) == 3400, "media sequence unchanged when no ads were at the head");
        check(!stripped.contains("#EXT-X-DISCONTINUITY\n#EXT-X-DISCONTINUITY"), "no doubled discontinuities");

        //Ads at the head shift the window, the media sequence must follow
        r = filter(url, headAds);
        stripped = s(r);
        check(!hasAdSegment(stripped), "head ad segments removed");
        check(stripped.contains("live_0") && stripped.contains("live_1"), "live segments kept after head ads");
        check(mediaSequence(stripped) == 3402, "media sequence bumped by the segments removed at the head");

        //After the break live content is served again
        r = filter(url, live);
        check(r != null && Arrays.equals(r, live.getBytes(StandardCharsets.UTF_8)), "live content served again once the break is over");

        System.out.println("AdPlaylistFilter checks passed: " + checks);
    }
}
