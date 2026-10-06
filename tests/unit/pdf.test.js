// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MEAL_STATUS } from "../../src/config.js";
import { LoadError } from "../../src/data/errors.js";
import { getPhotoUrl } from "../../src/data/photos.js";
import { buildPdf, EXTRA_FALLBACK_TITLE, toDrawableText } from "../../src/export/pdf.js";
import { MEAL_PLAN } from "../../src/plan/meal-plan.js";

vi.mock("../../src/data/photos.js", () => ({ getPhotoUrl: vi.fn() }));

const PDF_MIME_TYPE = "application/pdf";
const PDF_MAGIC = "%PDF-";
const DATE = "2001-03-04";
const PHOTO_PATH = "user/2001-03-04/meal-1.jpg";

const day = { date: DATE, is_workout: true, plan_snapshot: MEAL_PLAN };
const SINGLE_DAY_RANGE = { from: DATE, to: DATE };

async function pdfTextOf(blob) {
  return new TextDecoder("latin1").decode(await blob.arrayBuffer());
}

// jsPDF writes each drawn string as "(text) Tj" and escapes parentheses with a backslash.
function countTextDraws(pdfText, text) {
  const escaped = text.replaceAll("(", "\\(").replaceAll(")", "\\)");
  return pdfText.split(`(${escaped}) Tj`).length - 1;
}

async function startOf(blob) {
  return new TextDecoder().decode((await blob.arrayBuffer()).slice(0, PDF_MAGIC.length));
}

beforeEach(() => {
  vi.mocked(getPhotoUrl).mockReset();
});

describe("buildPdf", () => {
  it("returns a non-empty PDF blob for a day without photos", async () => {
    const mealLogs = [
      { date: DATE, meal_key: "meal-1", status: MEAL_STATUS.DONE, note: "Good", photo_path: null },
      {
        date: DATE,
        meal_key: "meal-2",
        status: MEAL_STATUS.SUBSTITUTED,
        substitute_text: 'Burrito, "large"',
        note: null,
        photo_path: null,
      },
    ];
    const extras = [{ date: DATE, description: "Ice cream", note: "treat", photo_path: null }];

    const blob = await buildPdf({ days: [day], mealLogs, extras }, SINGLE_DAY_RANGE);

    expect(blob.type).toBe(PDF_MIME_TYPE);
    expect(blob.size).toBeGreaterThan(0);
    expect(await startOf(blob)).toBe(PDF_MAGIC);
    expect(getPhotoUrl).not.toHaveBeenCalled();
  });

  it("still builds the PDF when a photo can't be loaded", async () => {
    vi.mocked(getPhotoUrl).mockRejectedValue(new LoadError("Couldn't load that photo."));
    const mealLogs = [
      {
        date: DATE,
        meal_key: "meal-1",
        status: MEAL_STATUS.DONE,
        note: null,
        photo_path: PHOTO_PATH,
      },
    ];

    const blob = await buildPdf({ days: [day], mealLogs, extras: [] }, SINGLE_DAY_RANGE);

    expect(getPhotoUrl).toHaveBeenCalledWith(PHOTO_PATH);
    expect(blob.type).toBe(PDF_MIME_TYPE);
    expect(await startOf(blob)).toBe(PDF_MAGIC);
  });

  it("builds a PDF for an empty range", async () => {
    const blob = await buildPdf({ days: [], mealLogs: [], extras: [] }, SINGLE_DAY_RANGE);
    expect(blob.size).toBeGreaterThan(0);
    expect(await startOf(blob)).toBe(PDF_MAGIC);
  });

  it("adds pages when many days are logged", async () => {
    const days = Array.from({ length: 30 }, (_, index) => ({
      ...day,
      date: `2001-04-${String(index + 1).padStart(2, "0")}`,
    }));
    const single = await buildPdf({ days: [day], mealLogs: [], extras: [] }, SINGLE_DAY_RANGE);
    const many = await buildPdf(
      { days, mealLogs: [], extras: [] },
      { from: days[0].date, to: days.at(-1).date },
    );
    expect(many.size).toBeGreaterThan(single.size);
    const text = new TextDecoder("latin1").decode(await many.arrayBuffer());
    expect(text.match(/\/Type\s*\/Page\b/g).length).toBeGreaterThan(1);
  });

  describe("summary", () => {
    const RANGE = { from: "2001-03-04", to: "2001-03-06" };
    const mealLogs = [
      { date: DATE, meal_key: "meal-1", status: MEAL_STATUS.DONE, note: null, photo_path: null },
      {
        date: DATE,
        meal_key: "meal-2",
        status: MEAL_STATUS.SUBSTITUTED,
        substitute_text: "Burrito",
        note: null,
        photo_path: null,
      },
    ];
    const extras = [{ date: DATE, description: "Apple", note: null, photo_path: null }];

    async function buildSummaryText() {
      return pdfTextOf(await buildPdf({ days: [day], mealLogs, extras }, RANGE));
    }

    it("prints the totals for the range, counting only required meals as eaten", async () => {
      const text = await buildSummaryText();
      for (const line of [
        "Days logged: 1 of 3",
        "Workout days: 1",
        "Planned meals eaten: 2 of 5 (40%)",
        "Swapped for something else: 1",
        "Extras: 1",
      ]) {
        expect(countTextDraws(text, line), line).toBe(1);
      }
    });

    it("prints a table row for every date in the range, including unlogged ones", async () => {
      const text = await buildSummaryText();
      for (const cell of ["Sun 4 Mar", "Mon 5 Mar", "Tue 6 Mar", "Workout", "2 of 5"]) {
        expect(countTextDraws(text, cell), cell).toBe(1);
      }
      expect(countTextDraws(text, "Not logged")).toBe(2);
    });

    it("lists the planned food for meals eaten as planned and the swap for the rest", async () => {
      const text = await buildSummaryText();
      const plannedFood = MEAL_PLAN.meals[0].foods.join(", ");
      expect(countTextDraws(text, `Ate: ${plannedFood}`)).toBe(1);
      expect(countTextDraws(text, "Ate instead: Burrito")).toBe(1);
      expect(countTextDraws(text, "Workout day - 40%")).toBe(1);
    });
  });

  describe("extra food titles", () => {
    const buildExtraText = async (description) => {
      const extras = [{ date: DATE, description, note: null, photo_path: null }];
      const blob = await buildPdf({ days: [day], mealLogs: [], extras }, SINGLE_DAY_RANGE);
      return pdfTextOf(blob);
    };

    it("prints the fallback title for an empty description", async () => {
      const text = await buildExtraText("");
      expect(countTextDraws(text, EXTRA_FALLBACK_TITLE)).toBe(1);
    });

    it("prints the fallback title when the description is only whitespace or emoji", async () => {
      for (const description of ["   ", "\u{1F355}\u{1F600}"]) {
        const text = await buildExtraText(description);
        expect(countTextDraws(text, EXTRA_FALLBACK_TITLE), JSON.stringify(description)).toBe(1);
      }
    });

    it("keeps a real description instead of the fallback", async () => {
      const text = await buildExtraText("Ice cream");
      expect(countTextDraws(text, "Ice cream")).toBe(1);
      expect(countTextDraws(text, EXTRA_FALLBACK_TITLE)).toBe(0);
    });

    it("draws emoji-laden text without the emoji and keeps accented Latin text", async () => {
      const text = await buildExtraText("Caf\u00E9 cr\u00E8me \u{1F370} \u{1F44D}\uFE0F");
      expect(countTextDraws(text, "Caf\u00E9 cr\u00E8me")).toBe(1);
      expect(text).not.toContain("\uD83C");
    });
  });
});

describe("toDrawableText", () => {
  it.each([
    ["removes emoji and joiners", "Pizza \u{1F355} \u{1F468}\u200D\u{1F373} time", "Pizza time"],
    ["removes characters outside Latin-1 such as CJK", "Rice \u7C73", "Rice"],
    [
      "keeps accented Latin text",
      "Cr\u00E8me br\u00FBl\u00E9e, ni\u00F1o",
      "Cr\u00E8me br\u00FBl\u00E9e, ni\u00F1o",
    ],
    ["recomposes decomposed accents", "Cafe\u0301", "Caf\u00E9"],
    [
      "keeps smart quotes and dashes from phone keyboards",
      "Mum\u2019s \u201Cbig\u201D one \u2013 yum\u2026",
      "Mum\u2019s \u201Cbig\u201D one \u2013 yum\u2026",
    ],
    ["collapses the gaps left behind", "a \u{1F355}  b", "a b"],
    ["returns an empty string for emoji only", "\u{1F355}", ""],
  ])("%s", (_name, input, expected) => {
    expect(toDrawableText(input)).toBe(expected);
  });
});
