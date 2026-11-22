package com.fgl27.twitch;

/* SegmentWallClock fixtures, values taken from a real Twitch VOD segment ID3 tag. */
public final class SegmentWallClockTest {

    private static int passed = 0;

    private static void check(long value, long expected, String label) {
        if (value != expected) throw new AssertionError(label + ": expected " + expected + " got " + value);
        passed++;
    }

    public static void main(String[] args) {
        String latency =
            "{\"cmd\":\"ld_lat_data\",\"broadc_r\":0,\"broadc_s\":0,\"ingest_r\":1795294535346,\"ingest_s\":0,\"transc_r\":1795294535487,\"transc_s\":1795294535612,\"stream_offset\":0}";

        check(SegmentWallClock.fromFrame("TXXX", latency), 1795294535487L, "TXXX ld_lat_data gives transc_r");
        check(SegmentWallClock.fromFrame("TDEN", "2026-11-21T20:55:35"), 1795294535000L, "TDEN is UTC with second precision");
        check(SegmentWallClock.fromFrame("TDTG", "2026-11-21T20:55:35"), 1795294535000L, "TDTG is read like TDEN");
        check(SegmentWallClock.fromFrame("TXXX", "{\"cmd\":\"other\"}"), 0L, "TXXX without transc_r is ignored");
        check(SegmentWallClock.fromFrame("TXXX", "{\"transc_r\":0}"), 0L, "zero transc_r is ignored");
        check(SegmentWallClock.fromFrame("TXXX", "{\"transc_r\":\"x\"}"), 0L, "non numeric transc_r is ignored");
        check(SegmentWallClock.fromFrame("TDEN", "not a date"), 0L, "broken TDEN is ignored");
        check(SegmentWallClock.fromFrame("TDEN", "1970-01-01T00:00:10"), 0L, "implausibly old TDEN is ignored");
        check(SegmentWallClock.fromFrame("TRCK", "77381"), 0L, "other frames are ignored");
        check(SegmentWallClock.fromFrame(null, latency), 0L, "null id is ignored");
        check(SegmentWallClock.fromFrame("TXXX", null), 0L, "null value is ignored");
        check(SegmentWallClock.isPrecise("TXXX") ? 1 : 0, 1, "TXXX is the precise source");
        check(SegmentWallClock.isPrecise("TDEN") ? 1 : 0, 0, "TDEN is not precise");

        System.out.println(passed + " segment wall clock checks passed");
    }
}
