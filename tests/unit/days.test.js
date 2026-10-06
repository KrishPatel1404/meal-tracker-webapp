import { beforeEach, describe, expect, it, vi } from "vitest";
import { RANGE_PAGE_SIZE, TABLES } from "../../src/config.js";
import { getDaysInRange } from "../../src/data/days.js";
import { LoadError } from "../../src/data/errors.js";
import { supabase } from "../../src/data/supabase.js";

vi.mock("../../src/data/supabase.js", () => ({ supabase: { from: vi.fn() } }));

const FROM_DATE = "2001-01-01";
const TO_DATE = "2001-12-31";

// Stands in for PostgREST: serves `rows` in the order asked, never more than RANGE_PAGE_SIZE at once,
// and records every request so tests can check the filters, sort and ranges sent.
function createFakeTable(rows, { failAtOffset = null } = {}) {
  const requests = [];
  const from = () => {
    const request = { filters: [], order: [], range: null };
    requests.push(request);
    const builder = {
      select: () => builder,
      gte: (column, value) => {
        request.filters.push(["gte", column, value]);
        return builder;
      },
      lte: (column, value) => {
        request.filters.push(["lte", column, value]);
        return builder;
      },
      order: (column) => {
        request.order.push(column);
        return builder;
      },
      range: async (start, end) => {
        request.range = [start, end];
        if (start === failAtOffset)
          return { data: null, error: { message: "boom", code: "XX000" } };
        const last = Math.min(end, start + RANGE_PAGE_SIZE - 1);
        return { data: rows.slice(start, last + 1), error: null };
      },
    };
    return builder;
  };
  return { from, requests };
}

function makeRows(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }));
}

let tables;

function useTables(definitions) {
  tables = definitions;
  vi.mocked(supabase.from).mockImplementation((name) => tables[name].from());
}

describe("getDaysInRange", () => {
  beforeEach(() => {
    vi.mocked(supabase.from).mockReset();
  });

  it("returns every row when a table holds more than one page", async () => {
    const mealLogCount = RANGE_PAGE_SIZE * 2 + 37;
    useTables({
      [TABLES.DAYS]: createFakeTable(makeRows(400, "day")),
      [TABLES.MEAL_LOGS]: createFakeTable(makeRows(mealLogCount, "log")),
      [TABLES.EXTRAS]: createFakeTable(makeRows(3, "extra")),
    });

    const { days, mealLogs, extras } = await getDaysInRange(FROM_DATE, TO_DATE);

    expect(days, "days fit in one page").toHaveLength(400);
    expect(mealLogs, "meal logs span three pages, newest included").toHaveLength(mealLogCount);
    expect(mealLogs.at(-1).id).toBe(`log-${mealLogCount - 1}`);
    expect(new Set(mealLogs.map((log) => log.id)).size, "no row repeated").toBe(mealLogCount);
    expect(extras).toHaveLength(3);
    expect(tables[TABLES.MEAL_LOGS].requests.map((request) => request.range)).toEqual([
      [0, RANGE_PAGE_SIZE - 1],
      [RANGE_PAGE_SIZE, RANGE_PAGE_SIZE * 2 - 1],
      [RANGE_PAGE_SIZE * 2, RANGE_PAGE_SIZE * 3 - 1],
    ]);
  });

  it("asks for one more page when the last full page ends exactly on the page size", async () => {
    useTables({
      [TABLES.DAYS]: createFakeTable([]),
      [TABLES.MEAL_LOGS]: createFakeTable(makeRows(RANGE_PAGE_SIZE, "log")),
      [TABLES.EXTRAS]: createFakeTable([]),
    });

    const { mealLogs } = await getDaysInRange(FROM_DATE, TO_DATE);

    expect(mealLogs).toHaveLength(RANGE_PAGE_SIZE);
    expect(tables[TABLES.MEAL_LOGS].requests, "second request comes back empty").toHaveLength(2);
  });

  it("filters by the date range and sorts each table by a unique key so pages are stable", async () => {
    useTables({
      [TABLES.DAYS]: createFakeTable([]),
      [TABLES.MEAL_LOGS]: createFakeTable([]),
      [TABLES.EXTRAS]: createFakeTable([]),
    });

    await getDaysInRange(FROM_DATE, TO_DATE);

    const [daysRequest] = tables[TABLES.DAYS].requests;
    expect(daysRequest.filters).toEqual([
      ["gte", "date", FROM_DATE],
      ["lte", "date", TO_DATE],
    ]);
    expect(daysRequest.order).toEqual(["date"]);
    expect(tables[TABLES.MEAL_LOGS].requests[0].order).toEqual(["date", "meal_key"]);
    expect(tables[TABLES.EXTRAS].requests[0].order).toEqual(["date", "created_at", "id"]);
  });

  it("throws a LoadError when a later page fails instead of returning a partial range", async () => {
    useTables({
      [TABLES.DAYS]: createFakeTable([]),
      [TABLES.MEAL_LOGS]: createFakeTable(makeRows(RANGE_PAGE_SIZE + 5, "log"), {
        failAtOffset: RANGE_PAGE_SIZE,
      }),
      [TABLES.EXTRAS]: createFakeTable([]),
    });

    await expect(getDaysInRange(FROM_DATE, TO_DATE)).rejects.toBeInstanceOf(LoadError);
  });
});
