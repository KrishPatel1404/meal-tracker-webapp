// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HISTORY_WEEKS, MEAL_STATUS } from "../../src/config.js";
import { getDaysInRange } from "../../src/data/days.js";
import { LoadError } from "../../src/data/errors.js";
import { MEAL_PLAN } from "../../src/plan/meal-plan.js";
import { SHADE_LEVEL } from "../../src/lib/score.js";
import { mountHistoryView } from "../../src/ui/history-view.js";

vi.mock("../../src/data/days.js", () => ({ getDaysInRange: vi.fn() }));

// Tue 6 Oct 2026, midday local time.
const NOW = new Date(2026, 9, 6, 12, 0, 0);
const TODAY = "2026-10-06";
// Monday of today's week minus 51 weeks: the earliest week that can be on the grid.
const LOAD_START = "2025-10-13";
// Monday of the week holding the first logged day (Wed 30 Sep).
const GRID_START = "2026-09-28";
const TODAY_WEEK_START = "2026-10-05";
const DAYS_PER_WEEK = 7;
const TOTAL_SLOTS = HISTORY_WEEKS * DAYS_PER_WEEK;
// Today is the Tuesday of the grid's second column.
const TODAY_SLOT = DAYS_PER_WEEK + 1;
const FUTURE_SLOTS = TOTAL_SLOTS - TODAY_SLOT - 1;
// Today as the Tuesday of the last column, once the grid has rolled.
const LAST_COLUMN_TODAY_SLOT = TOTAL_SLOTS - DAYS_PER_WEEK + 1;
const WEEKDAY_PREFIXES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const REST_REQUIRED = ["meal-1", "meal-2", "meal-5"];
const WORKOUT_REQUIRED = ["meal-1", "meal-2", "meal-3", "meal-4", "meal-5"];
const SNACK = "bedtime-snack";

function day(date, isWorkout) {
  return { date, is_workout: isWorkout, plan_snapshot: MEAL_PLAN, plan_version: "test" };
}

function logs(date, keys, status = MEAL_STATUS.DONE) {
  return keys.map((meal_key) => ({ date, meal_key, status }));
}

const FAKE_RANGE = {
  days: [
    day("2026-09-30", false),
    day("2026-10-01", true),
    day("2026-10-02", false),
    day("2026-10-03", true),
    day("2026-10-04", true),
    day("2026-10-05", false),
    day("2026-10-06", false),
  ],
  mealLogs: [
    ...logs("2026-09-30", REST_REQUIRED, MEAL_STATUS.PENDING),
    ...logs("2026-10-01", WORKOUT_REQUIRED.slice(0, 4)),
    ...logs("2026-10-02", REST_REQUIRED.slice(0, 2)),
    ...logs("2026-10-03", ["meal-1", SNACK]),
    ...logs("2026-10-04", ["meal-3", "meal-4"]),
    ...logs("2026-10-05", ["meal-1", "meal-2"]),
    ...logs("2026-10-05", ["meal-5"], MEAL_STATUS.SUBSTITUTED),
    ...logs("2026-10-06", REST_REQUIRED),
  ],
  extras: [],
};

const EXPECTED_CELLS = {
  // ICU builds differ on "Sep" vs "Sept" for en-GB.
  "2026-09-28": { label: /^Mon 28 Sept?: nothing logged$/, level: SHADE_LEVEL.NONE },
  "2026-09-30": { label: /^Wed 30 Sept?: 0 of 3 meals$/, level: SHADE_LEVEL.NONE },
  "2026-10-01": { label: "Thu 1 Oct: 4 of 5 meals", level: SHADE_LEVEL.HIGH },
  "2026-10-02": { label: "Fri 2 Oct: 2 of 3 meals", level: SHADE_LEVEL.MID },
  "2026-10-03": { label: "Sat 3 Oct: 1 of 5 meals", level: SHADE_LEVEL.LOW },
  "2026-10-04": { label: "Sun 4 Oct: 2 of 5 meals", level: SHADE_LEVEL.MID },
  "2026-10-05": { label: "Mon 5 Oct: 3 of 3 meals", level: SHADE_LEVEL.FULL },
  "2026-10-06": { label: "Tue 6 Oct: 3 of 3 meals", level: SHADE_LEVEL.FULL },
};

let root;

function slots() {
  return [...root.querySelector(".contrib__grid").children];
}

function cellFor(date) {
  return root.querySelector(`.contrib__cell[data-date="${date}"]`);
}

async function mountLoaded(handlers = {}) {
  const onOpenDay = handlers.onOpenDay ?? vi.fn();
  const onBack = handlers.onBack ?? vi.fn();
  const unmount = mountHistoryView(root, { onOpenDay, onBack });
  await vi.waitFor(() => expect(root.querySelector(".contrib__grid")).not.toBeNull());
  return { unmount, onOpenDay, onBack };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  getDaysInRange.mockReset();
  getDaysInRange.mockResolvedValue(FAKE_RANGE);
  root = document.createElement("main");
  document.body.append(root);
});

afterEach(() => {
  vi.useRealTimers();
  root.remove();
});

describe("mountHistoryView data loading", () => {
  it("loads the whole grid range with one getDaysInRange call", async () => {
    await mountLoaded();
    expect(getDaysInRange).toHaveBeenCalledTimes(1);
    expect(getDaysInRange).toHaveBeenCalledWith(LOAD_START, TODAY);
  });
});

describe("contribution grid layout", () => {
  it(`has ${HISTORY_WEEKS} week columns of 7 slots, starting on the first logged week's Monday`, async () => {
    await mountLoaded();
    const all = slots();
    expect(all).toHaveLength(TOTAL_SLOTS);
    expect(all[0].dataset.date).toBe(GRID_START);
  });

  it("starts at today's week when nothing is logged yet", async () => {
    getDaysInRange.mockResolvedValue({ days: [], mealLogs: [], extras: [] });
    await mountLoaded();
    expect(slots()[0].dataset.date).toBe(TODAY_WEEK_START);
    expect(slots()[1].getAttribute("aria-current")).toBe("date");
  });

  it(`rolls so today's week is the last column once ${HISTORY_WEEKS} weeks are logged`, async () => {
    getDaysInRange.mockResolvedValue({ days: [day(LOAD_START, false)], mealLogs: [], extras: [] });
    await mountLoaded();
    expect(slots()).toHaveLength(TOTAL_SLOTS);
    expect(slots()[0].dataset.date).toBe(LOAD_START);
    expect(slots()[LAST_COLUMN_TODAY_SLOT].getAttribute("aria-current")).toBe("date");
    // 1 Nov 2025 is in column 3 (Mon 27 Oct), too close for a leading "Oct" label on column 1.
    expect(root.querySelector(".contrib__month").textContent).toBe("Nov");
    expect(root.querySelector(".contrib__month").style.gridColumn).toBe("3");
  });

  it("puts every weekday in the same row (Mon top, Sun bottom) across all weeks", async () => {
    await mountLoaded();
    const buttons = slots().filter((slot) => slot.tagName === "BUTTON");
    for (const [index, slot] of slots().entries()) {
      if (slot.tagName !== "BUTTON") continue;
      const expectedPrefix = WEEKDAY_PREFIXES[index % DAYS_PER_WEEK];
      expect(slot.getAttribute("aria-label"), `slot ${index} (${slot.dataset.date})`).toMatch(
        new RegExp(`^${expectedPrefix} `),
      );
    }
    expect(buttons).toHaveLength(TODAY_SLOT + 1);
  });

  it("renders every day after today as hidden blanks, not buttons", async () => {
    await mountLoaded();
    const tail = slots().slice(TODAY_SLOT + 1);
    expect(tail).toHaveLength(FUTURE_SLOTS);
    for (const slot of tail) {
      expect(slot.tagName).toBe("SPAN");
      expect(slot.classList.contains("contrib__cell--blank")).toBe(true);
      expect(slot.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("marks only today with aria-current, in the second column", async () => {
    await mountLoaded();
    const current = root.querySelectorAll('[aria-current="date"]');
    expect(current).toHaveLength(1);
    expect(current[0].dataset.date).toBe(TODAY);
    expect(slots()[TODAY_SLOT]).toBe(current[0]);
  });

  it("labels each column that holds the 1st of a month, from the first column", async () => {
    await mountLoaded();
    const months = [...root.querySelectorAll(".contrib__month")].map((label) => [
      label.textContent,
      label.style.gridColumn,
    ]);
    // 1 Oct 2026 is in the first column (Mon 28 Sep), so no extra leading label.
    expect(months[0]).toEqual(["Oct", "1"]);
    // 1 Nov 2026 is the Sunday of the week of Mon 26 Oct, column 5.
    expect(months[1]).toEqual(["Nov", "5"]);
    // 1 Sep 2027 is in the week of Mon 30 Aug, column 49.
    // ICU builds differ on "Sep" vs "Sept" for en-GB.
    expect(months.at(-1)).toEqual([expect.stringMatching(/^Sept?$/), "49"]);
    expect(months).toHaveLength(12);
  });
});

describe("square levels and labels", () => {
  it.each(Object.entries(EXPECTED_CELLS))("%s", async (date, expected) => {
    await mountLoaded();
    const cell = cellFor(date);
    expect(cell, `cell for ${date}`).not.toBeNull();
    expect(cell.getAttribute("aria-label")).toMatch(
      expected.label instanceof RegExp ? expected.label : new RegExp(`^${expected.label}$`),
    );
    expect(cell.dataset.level).toBe(String(expected.level));
  });

  it("leaves every day without a row at level 0", async () => {
    await mountLoaded();
    const loggedDates = new Set(FAKE_RANGE.days.map((entry) => entry.date));
    const unlogged = slots().filter(
      (slot) => slot.tagName === "BUTTON" && !loggedDates.has(slot.dataset.date),
    );
    expect(unlogged.length).toBeGreaterThan(0);
    expect(unlogged.every((slot) => slot.dataset.level === String(SHADE_LEVEL.NONE))).toBe(true);
  });
});

describe("stat tiles", () => {
  it("shows the streak of complete days ending today and the count of logged days", async () => {
    await mountLoaded();
    const tiles = [...root.querySelectorAll(".stat-tile")].map((tile) => ({
      label: tile.querySelector(".stat-tile__label").textContent,
      value: tile.querySelector(".stat-tile__value").textContent,
    }));
    expect(tiles).toEqual([
      { label: "Current streak", value: "2 days" },
      { label: "Days logged", value: String(FAKE_RANGE.days.length) },
    ]);
  });

  it("uses the singular unit for a one-day streak", async () => {
    getDaysInRange.mockResolvedValue({
      days: [day(TODAY, false)],
      mealLogs: logs(TODAY, REST_REQUIRED),
      extras: [],
    });
    await mountLoaded();
    expect(root.querySelector(".stat-tile__value").textContent).toBe("1 day");
  });
});

describe("interaction", () => {
  it("opens the tapped day", async () => {
    const { onOpenDay } = await mountLoaded();
    cellFor("2026-10-04").click();
    expect(onOpenDay).toHaveBeenCalledWith("2026-10-04");
  });

  it("goes back from the header button", async () => {
    const { onBack, onOpenDay } = await mountLoaded();
    root.querySelector('.app-header button[aria-label="Back to today"]').click();
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onOpenDay).not.toHaveBeenCalled();
  });

  it("unmount removes its nodes and listeners", async () => {
    const { unmount, onOpenDay, onBack } = await mountLoaded();
    const cell = cellFor(TODAY);
    const back = root.querySelector(".app-header button");
    unmount();
    expect(root.children).toHaveLength(0);
    cell.click();
    back.click();
    expect(onOpenDay).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe("load failures", () => {
  it("shows a calm retry state on LoadError and recovers on retry", async () => {
    getDaysInRange.mockRejectedValueOnce(new LoadError("Couldn't load your meals."));
    mountHistoryView(root, { onOpenDay: vi.fn(), onBack: vi.fn() });
    const retry = await vi.waitFor(() => {
      const button = root.querySelector(".btn");
      expect(button?.textContent).toBe("Try again");
      return button;
    });
    expect(root.textContent).not.toMatch(/fail|missed/i);
    retry.click();
    await vi.waitFor(() => expect(root.querySelector(".contrib__grid")).not.toBeNull());
    expect(getDaysInRange).toHaveBeenCalledTimes(2);
  });

  it("ignores a response that arrives after unmount", async () => {
    let resolveRange;
    getDaysInRange.mockReturnValue(new Promise((resolve) => (resolveRange = resolve)));
    const unmount = mountHistoryView(root, { onOpenDay: vi.fn(), onBack: vi.fn() });
    const page = root.querySelector(".page");
    unmount();
    resolveRange(FAKE_RANGE);
    await vi.waitFor(() => expect(getDaysInRange).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(page.querySelector(".contrib__grid")).toBeNull();
  });
});
