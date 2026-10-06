import { describe, expect, it } from "vitest";
import { DAY_RESET_HOUR } from "../../src/config.js";
import {
  formatDayLabel,
  getLogicalDate,
  getNextResetTime,
  groupByDate,
  parseLocalDate,
  shiftDate,
} from "../../src/lib/day.js";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;

// Local-time constructor: month is 1-based here to match how dates read.
function local(year, month, day, hour = 0, minute = 0) {
  return new Date(year, month - 1, day, hour, minute);
}

// Days where clocks change in America/New_York (2026) and Pacific/Auckland (2026/27).
const DST_DAYS = [
  { label: "NY spring forward", year: 2026, month: 3, day: 8 },
  { label: "NY fall back", year: 2026, month: 11, day: 1 },
  { label: "Auckland spring forward", year: 2026, month: 9, day: 27 },
  { label: "Auckland fall back", year: 2027, month: 4, day: 4 },
];

describe("getLogicalDate", () => {
  it("uses 3am as the reset hour", () => {
    expect(DAY_RESET_HOUR).toBe(3);
  });

  it("returns the previous day at 02:59", () => {
    expect(getLogicalDate(local(2026, 10, 6, 2, 59))).toBe("2026-10-05");
  });

  it("returns the same day at exactly 03:00", () => {
    expect(getLogicalDate(local(2026, 10, 6, 3, 0))).toBe("2026-10-06");
  });

  it("returns the previous day at midnight", () => {
    expect(getLogicalDate(local(2026, 10, 6, 0, 0))).toBe("2026-10-05");
  });

  it("returns the same day at 23:59", () => {
    expect(getLogicalDate(local(2026, 10, 6, 23, 59))).toBe("2026-10-06");
  });

  it("rolls back over a month boundary before 3am", () => {
    expect(getLogicalDate(local(2026, 3, 1, 1, 0))).toBe("2026-02-28");
  });

  it("rolls back over a year boundary before 3am", () => {
    expect(getLogicalDate(local(2027, 1, 1, 2, 30))).toBe("2026-12-31");
  });

  it("handles the 29 Feb leap day", () => {
    expect(getLogicalDate(local(2028, 3, 1, 2, 0))).toBe("2028-02-29");
  });

  it("defaults to the current time", () => {
    expect(getLogicalDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each(DST_DAYS)(
    "flips at 03:00 local (checked from 01:59) on $label day",
    ({ year, month, day }) => {
      const before = getLogicalDate(local(year, month, day, 1, 59)); // 02:59 does not exist on spring-forward days
      const at = getLogicalDate(local(year, month, day, 3, 0));
      expect(before).toBe(shiftDate(at, -1));
      expect(at).toBe(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    },
  );
});

describe("getNextResetTime", () => {
  it("returns today's 03:00 when called at 02:59", () => {
    expect(getNextResetTime(local(2026, 10, 6, 2, 59))).toEqual(local(2026, 10, 6, 3, 0));
  });

  it("returns tomorrow's 03:00 when called at exactly 03:00", () => {
    expect(getNextResetTime(local(2026, 10, 6, 3, 0))).toEqual(local(2026, 10, 7, 3, 0));
  });

  it("returns tomorrow's 03:00 when called at 23:59", () => {
    expect(getNextResetTime(local(2026, 10, 6, 23, 59))).toEqual(local(2026, 10, 7, 3, 0));
  });

  it("returns 03:00 the same day just after midnight", () => {
    expect(getNextResetTime(local(2026, 10, 6, 0, 0))).toEqual(local(2026, 10, 6, 3, 0));
  });

  it("crosses a month boundary", () => {
    expect(getNextResetTime(local(2026, 1, 31, 12, 0))).toEqual(local(2026, 2, 1, 3, 0));
  });

  it("crosses a year boundary", () => {
    expect(getNextResetTime(local(2026, 12, 31, 12, 0))).toEqual(local(2027, 1, 1, 3, 0));
  });

  it.each(DST_DAYS)(
    "lands on 03:00 wall-clock time with the real elapsed time on $label day",
    ({ year, month, day }) => {
      const start = local(year, month, day, 0, 30);
      const reset = getNextResetTime(start);
      const wallClockGap = 2.5 * MS_PER_HOUR;
      const offsetShift = (reset.getTimezoneOffset() - start.getTimezoneOffset()) * MS_PER_MINUTE;

      expect(reset.getHours()).toBe(DAY_RESET_HOUR);
      expect(reset.getMinutes()).toBe(0);
      expect(reset.getDate()).toBe(day);
      expect(reset.getTime() - start.getTime()).toBe(wallClockGap + offsetShift);
    },
  );

  it("is always strictly after now and flips the logical date", () => {
    const now = local(2026, 10, 6, 14, 20);
    const reset = getNextResetTime(now);
    expect(reset.getTime()).toBeGreaterThan(now.getTime());
    expect(getLogicalDate(reset)).not.toBe(getLogicalDate(now));
    expect(getLogicalDate(new Date(reset.getTime() - 1))).toBe(getLogicalDate(now));
  });
});

describe("shiftDate", () => {
  it("shifts forward within a month", () => {
    expect(shiftDate("2026-10-06", 1)).toBe("2026-10-07");
  });

  it("shifts back within a month", () => {
    expect(shiftDate("2026-10-06", -1)).toBe("2026-10-05");
  });

  it("returns the same date for a zero shift", () => {
    expect(shiftDate("2026-10-06", 0)).toBe("2026-10-06");
  });

  it("rolls forward over a month end", () => {
    expect(shiftDate("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("rolls back over a month start", () => {
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("rolls forward over a year end", () => {
    expect(shiftDate("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("rolls back over a year start", () => {
    expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("includes 29 Feb in a leap year", () => {
    expect(shiftDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDate("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("skips 29 Feb in a non-leap year", () => {
    expect(shiftDate("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("handles shifts larger than a month", () => {
    expect(shiftDate("2026-10-06", 100)).toBe("2027-01-14");
    expect(shiftDate("2026-10-06", -280)).toBe("2025-12-30");
  });

  it("pads single-digit months and days", () => {
    expect(shiftDate("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftDate("2026-01-09", -8)).toBe("2026-01-01");
  });

  it.each(DST_DAYS)("moves exactly one calendar day across $label day", ({ year, month, day }) => {
    const pad = (n) => String(n).padStart(2, "0");
    const dayBefore = shiftDate(`${year}-${pad(month)}-${pad(day)}`, -1);
    const dayAfter = shiftDate(`${year}-${pad(month)}-${pad(day)}`, 1);
    expect(shiftDate(dayBefore, 1)).toBe(`${year}-${pad(month)}-${pad(day)}`);
    expect(shiftDate(dayBefore, 2)).toBe(dayAfter);
    expect(shiftDate(dayAfter, -2)).toBe(dayBefore);
  });

  it("walks a full year one day at a time without skipping or repeating", () => {
    const seen = new Set();
    let date = "2026-01-01";
    for (let i = 0; i < 365; i += 1) {
      expect(seen.has(date)).toBe(false);
      seen.add(date);
      date = shiftDate(date, 1);
    }
    expect(date).toBe("2027-01-01");
  });
});

describe("parseLocalDate", () => {
  it("returns local midnight of that calendar day, whatever the time zone", () => {
    const date = parseLocalDate("2026-10-06");
    expect([date.getFullYear(), date.getMonth() + 1, date.getDate()]).toEqual([2026, 10, 6]);
    expect([date.getHours(), date.getMinutes()]).toEqual([0, 0]);
  });

  it.each(DST_DAYS)("keeps the calendar day on $label day", ({ year, month, day }) => {
    const pad = (n) => String(n).padStart(2, "0");
    const date = parseLocalDate(`${year}-${pad(month)}-${pad(day)}`);
    expect(date.getDate()).toBe(day);
  });
});

describe("formatDayLabel", () => {
  it("formats as short weekday, day and month with no comma", () => {
    expect(formatDayLabel("2026-10-06")).toBe("Tue 6 Oct");
  });

  it("adds the year when asked", () => {
    expect(formatDayLabel("2026-10-06", { withYear: true })).toBe("Tue 6 Oct 2026");
  });

  it("labels the day in the string, not the UTC day (no off-by-one west of UTC)", () => {
    expect(formatDayLabel("2001-01-01")).toBe("Mon 1 Jan");
    expect(formatDayLabel("2026-12-31", { withYear: true })).toBe("Thu 31 Dec 2026");
  });
});

describe("groupByDate", () => {
  it("groups rows under their date, keeping each date's rows in input order", () => {
    const rows = [
      { date: "2001-01-02", id: "a" },
      { date: "2001-01-01", id: "b" },
      { date: "2001-01-02", id: "c" },
    ];
    const groups = groupByDate(rows);
    expect([...groups.keys()]).toEqual(["2001-01-02", "2001-01-01"]);
    expect(groups.get("2001-01-02").map((row) => row.id)).toEqual(["a", "c"]);
    expect(groups.get("2001-01-01").map((row) => row.id)).toEqual(["b"]);
  });

  it("returns an empty map for no rows", () => {
    expect(groupByDate([]).size).toBe(0);
  });
});
