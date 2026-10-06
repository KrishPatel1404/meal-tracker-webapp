import { jsPDF } from "jspdf";
import { MEAL_STATUS, MIME_TYPE } from "../config.js";
import { LoadError, NetworkError, toTypedError } from "../data/errors.js";
import { getPhotoUrl } from "../data/photos.js";
import { formatDayLabel, listDates } from "../lib/day.js";
import { resizeToCanvas } from "../lib/image.js";
import { countSwaps, getDayEntries, getMealTitle, getRangeTotals } from "./day-entries.js";

const PAGE_MARGIN_MM = 15;
const MM_PER_PT = 0.3528;
const LINE_HEIGHT_RATIO = 1.3;
const BASELINE_RATIO = 0.75;
const INDENT_MM = 4;
const SECTION_GAP_MM = 6;
const ENTRY_GAP_MM = 2.5;
const RULE_WIDTH_MM = 0.2;
const PERCENT = 100;

const FONT = "helvetica";
const FONT_STYLE = Object.freeze({ NORMAL: "normal", BOLD: "bold" });
const FONT_SIZE = Object.freeze({ TITLE: 20, SECTION: 15, DAY: 13, ENTRY: 10.5, DETAIL: 9.5 });
const COLOR = Object.freeze({
  TEXT: [20, 20, 22],
  QUIET: [110, 110, 118],
  RULE: [210, 210, 216],
  [MEAL_STATUS.DONE]: [33, 92, 218],
  [MEAL_STATUS.SUBSTITUTED]: [161, 1, 201],
  [MEAL_STATUS.PENDING]: [110, 110, 118],
  EXTRA: [206, 84, 0],
});

const STATUS_LABEL = Object.freeze({
  [MEAL_STATUS.DONE]: "Ate as planned",
  [MEAL_STATUS.SUBSTITUTED]: "Ate something else",
  [MEAL_STATUS.PENDING]: "Not ticked",
});
const EXTRA_LABEL = "Extra";
const DAY_TYPE_LABEL = Object.freeze({ WORKOUT: "Workout", REST: "Rest" });
const NOT_LOGGED_LABEL = "Not logged";
const NO_VALUE = "-";
const FOOD_SEPARATOR = ", ";
const SUMMARY_HEADING = "Summary";
const DETAIL_HEADING = "Day by day";
export const EXTRA_FALLBACK_TITLE = "Extra food";
const EMPTY_RANGE_TEXT = "No meals logged in this range.";
const TITLE = "Meal log";

const THUMB_BOX_MM = 32;
const THUMB_MAX_PX = 360;
const THUMB_JPEG_QUALITY = 0.7;
const THUMB_FORMAT = "JPEG";
// Summary table columns, as x offsets from the left margin.
const SUMMARY_COLUMNS = Object.freeze([
  { title: "Day", xMm: 0 },
  { title: "Training", xMm: 42 },
  { title: "Meals eaten", xMm: 72 },
  { title: "Swapped", xMm: 107 },
  { title: "Extras", xMm: 132 },
]);

const PHOTO_MESSAGE = "Couldn't load a photo for the PDF.";

// Helvetica in a PDF only has Latin-1 plus a few Windows-1252 punctuation marks (the ones phone
// keyboards type: smart quotes, dashes, ellipsis, bullet, euro). Anything else prints as garbage.
const DRAWABLE_CHARS =
  /[\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/;
const WHITESPACE_RUN = /\s+/g;

export function toDrawableText(text) {
  return [...text.normalize("NFC")]
    .filter((char) => DRAWABLE_CHARS.test(char))
    .join("")
    .replace(WHITESPACE_RUN, " ")
    .trim();
}

const getExtraTitle = ({ description }) =>
  toDrawableText(description ?? "") || EXTRA_FALLBACK_TITLE;

const getLineHeightMm = (size) => size * MM_PER_PT * LINE_HEIGHT_RATIO;

const formatDate = (dateStr) => formatDayLabel(dateStr, { withYear: true });
const formatPercent = (share) => `${Math.round(share * PERCENT)}%`;
const getDayTypeLabel = (isWorkout) => (isWorkout ? DAY_TYPE_LABEL.WORKOUT : DAY_TYPE_LABEL.REST);

function drawThumbnail(bitmap) {
  const canvas = resizeToCanvas(bitmap, THUMB_MAX_PX);
  if (!canvas) throw new LoadError("This browser can't draw photos for the PDF.");
  return {
    dataUrl: canvas.toDataURL(MIME_TYPE.JPEG, THUMB_JPEG_QUALITY),
    aspect: canvas.width / canvas.height,
  };
}

async function fetchThumbnail(path) {
  try {
    const response = await fetch(await getPhotoUrl(path));
    if (!response.ok) throw new LoadError(`Photo request returned ${response.status}.`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      return drawThumbnail(bitmap);
    } finally {
      bitmap.close();
    }
  } catch (error) {
    throw toTypedError(error, LoadError, PHOTO_MESSAGE);
  }
}

// A photo that can't be fetched or decoded is left out; the entry itself still prints.
async function loadThumbnail(path) {
  try {
    return await fetchThumbnail(path);
  } catch (error) {
    if (error instanceof LoadError || error instanceof NetworkError) return null;
    throw error;
  }
}

async function loadThumbnails(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  const thumbnails = await Promise.all(unique.map(loadThumbnail));
  return new Map(unique.map((path, index) => [path, thumbnails[index]]));
}

function createPage(doc) {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const contentWidth = width - PAGE_MARGIN_MM * 2;
  const cursor = { y: PAGE_MARGIN_MM };

  function ensureSpace(needed) {
    if (cursor.y + needed <= height - PAGE_MARGIN_MM) return;
    doc.addPage();
    cursor.y = PAGE_MARGIN_MM;
  }

  function setFont(size, style, color) {
    doc.setFont(FONT, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  }

  // Draws one line, with optional right-aligned text on the same baseline.
  function drawLine({
    left,
    right,
    size,
    style = FONT_STYLE.NORMAL,
    color = COLOR.TEXT,
    indent = 0,
  }) {
    const lineHeight = getLineHeightMm(size);
    ensureSpace(lineHeight);
    const baseline = cursor.y + lineHeight * BASELINE_RATIO;
    setFont(size, style, color);
    doc.text(toDrawableText(left), PAGE_MARGIN_MM + indent, baseline);
    if (right) {
      setFont(size, FONT_STYLE.NORMAL, right.color);
      doc.text(toDrawableText(right.text), PAGE_MARGIN_MM + contentWidth, baseline, {
        align: "right",
      });
    }
    cursor.y += lineHeight;
  }

  // Draws one line of cells, each starting at its own x offset.
  function drawRow(cells, { size, style = FONT_STYLE.NORMAL, color = COLOR.TEXT }) {
    const lineHeight = getLineHeightMm(size);
    ensureSpace(lineHeight);
    const baseline = cursor.y + lineHeight * BASELINE_RATIO;
    setFont(size, style, color);
    for (const { text, xMm } of cells) {
      doc.text(toDrawableText(text), PAGE_MARGIN_MM + xMm, baseline);
    }
    cursor.y += lineHeight;
  }

  function drawWrapped(text, { size, style = FONT_STYLE.NORMAL, color = COLOR.QUIET, indent = 0 }) {
    setFont(size, style, color);
    for (const line of doc.splitTextToSize(toDrawableText(text), contentWidth - indent)) {
      drawLine({ left: line, size, style, color, indent });
    }
  }

  function drawRule() {
    doc.setDrawColor(...COLOR.RULE);
    doc.setLineWidth(RULE_WIDTH_MM);
    doc.line(PAGE_MARGIN_MM, cursor.y, PAGE_MARGIN_MM + contentWidth, cursor.y);
    cursor.y += ENTRY_GAP_MM;
  }

  function drawImage({ dataUrl, aspect }, indent) {
    const imageWidth = aspect >= 1 ? THUMB_BOX_MM : THUMB_BOX_MM * aspect;
    const imageHeight = imageWidth / aspect;
    ensureSpace(imageHeight + ENTRY_GAP_MM);
    doc.addImage(dataUrl, THUMB_FORMAT, PAGE_MARGIN_MM + indent, cursor.y, imageWidth, imageHeight);
    cursor.y += imageHeight + ENTRY_GAP_MM;
  }

  return {
    cursor,
    ensureSpace,
    drawLine,
    drawRow,
    drawWrapped,
    drawRule,
    drawImage,
    gap: (mm) => {
      cursor.y += mm;
    },
  };
}

function drawEntry(page, { title, statusText, statusColor, details, thumbnail }) {
  page.drawLine({
    left: title,
    right: { text: statusText, color: statusColor },
    size: FONT_SIZE.ENTRY,
    style: FONT_STYLE.BOLD,
    indent: INDENT_MM,
  });
  for (const detail of details) {
    page.drawWrapped(detail, { size: FONT_SIZE.DETAIL, indent: INDENT_MM * 2 });
  }
  if (thumbnail) page.drawImage(thumbnail, INDENT_MM * 2);
  page.gap(ENTRY_GAP_MM);
}

function getMealDetails({ meal, log, status }) {
  const details = [];
  if (status === MEAL_STATUS.DONE) details.push(`Ate: ${meal.foods.join(FOOD_SEPARATOR)}`);
  if (status === MEAL_STATUS.SUBSTITUTED && log.substitute_text) {
    details.push(`Ate instead: ${log.substitute_text}`);
  }
  if (log?.note) details.push(`Note: ${log.note}`);
  return details;
}

async function drawDay(page, entry) {
  const { day, progress, meals, extras } = entry;
  const thumbnails = await loadThumbnails([
    ...meals.map(({ log }) => log?.photo_path),
    ...extras.map((extra) => extra.photo_path),
  ]);
  const minimumBlock = getLineHeightMm(FONT_SIZE.DAY) + getLineHeightMm(FONT_SIZE.ENTRY) * 2;
  page.ensureSpace(minimumBlock);
  page.drawLine({
    left: formatDate(day.date),
    right: {
      text: `${getDayTypeLabel(day.is_workout)} day - ${formatPercent(progress.score)}`,
      color: COLOR.QUIET,
    },
    size: FONT_SIZE.DAY,
    style: FONT_STYLE.BOLD,
  });
  page.drawRule();

  for (const mealEntry of meals) {
    drawEntry(page, {
      title: getMealTitle(mealEntry.meal),
      statusText: STATUS_LABEL[mealEntry.status],
      statusColor: COLOR[mealEntry.status],
      details: getMealDetails(mealEntry),
      thumbnail: thumbnails.get(mealEntry.log?.photo_path) ?? null,
    });
  }
  for (const extra of extras) {
    drawEntry(page, {
      title: getExtraTitle(extra),
      statusText: EXTRA_LABEL,
      statusColor: COLOR.EXTRA,
      details: extra.note ? [`Note: ${extra.note}`] : [],
      thumbnail: thumbnails.get(extra.photo_path) ?? null,
    });
  }
  page.gap(SECTION_GAP_MM);
}

function getSummaryCells(date, entry) {
  const texts = entry
    ? [
        formatDayLabel(date),
        getDayTypeLabel(entry.day.is_workout),
        `${entry.progress.done} of ${entry.progress.required}`,
        String(countSwaps(entry.meals)),
        String(entry.extras.length),
      ]
    : [formatDayLabel(date), NOT_LOGGED_LABEL, NO_VALUE, NO_VALUE, NO_VALUE];
  return SUMMARY_COLUMNS.map(({ xMm }, index) => ({ text: texts[index], xMm }));
}

function getTotalsLines(totals, loggedCount, rangeLength) {
  const mealShare = totals.mealsRequired === 0 ? 0 : totals.mealsEaten / totals.mealsRequired;
  return [
    `Days logged: ${loggedCount} of ${rangeLength}`,
    `Workout days: ${totals.workoutDays}`,
    `Planned meals eaten: ${totals.mealsEaten} of ${totals.mealsRequired} (${formatPercent(mealShare)})`,
    `Swapped for something else: ${totals.swaps}`,
    `Extras: ${totals.extras}`,
  ];
}

// One line per date in the range, so days with nothing logged still show up.
function drawSummary(page, entries, { from, to }) {
  const dates = listDates(from, to);
  const entriesByDate = new Map(entries.map((entry) => [entry.day.date, entry]));
  page.drawLine({ left: SUMMARY_HEADING, size: FONT_SIZE.SECTION, style: FONT_STYLE.BOLD });
  page.gap(ENTRY_GAP_MM);
  for (const line of getTotalsLines(getRangeTotals(entries), entries.length, dates.length)) {
    page.drawLine({ left: line, size: FONT_SIZE.ENTRY });
  }
  page.gap(SECTION_GAP_MM);
  page.drawRow(
    SUMMARY_COLUMNS.map(({ title, xMm }) => ({ text: title, xMm })),
    {
      size: FONT_SIZE.DETAIL,
      style: FONT_STYLE.BOLD,
      color: COLOR.QUIET,
    },
  );
  page.drawRule();
  for (const date of dates) {
    page.drawRow(getSummaryCells(date, entriesByDate.get(date)), { size: FONT_SIZE.ENTRY });
  }
  page.gap(SECTION_GAP_MM);
}

const toPdfBlob = (doc) => new Blob([doc.output("arraybuffer")], { type: MIME_TYPE.PDF });

export async function buildPdf({ days, mealLogs, extras }, range) {
  const entries = getDayEntries({ days, mealLogs, extras });
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const page = createPage(doc);

  page.drawLine({ left: TITLE, size: FONT_SIZE.TITLE, style: FONT_STYLE.BOLD });
  if (entries.length === 0) {
    page.drawLine({ left: EMPTY_RANGE_TEXT, size: FONT_SIZE.ENTRY, color: COLOR.QUIET });
    return toPdfBlob(doc);
  }
  page.drawLine({
    left: [...new Set([range.from, range.to].map(formatDate))].join(" to "),
    size: FONT_SIZE.ENTRY,
    color: COLOR.QUIET,
  });
  page.gap(SECTION_GAP_MM);

  drawSummary(page, entries, range);
  // Keeps the heading on the same page as the first day.
  page.ensureSpace(getLineHeightMm(FONT_SIZE.SECTION) + getLineHeightMm(FONT_SIZE.DAY) * 2);
  page.drawLine({ left: DETAIL_HEADING, size: FONT_SIZE.SECTION, style: FONT_STYLE.BOLD });
  page.gap(ENTRY_GAP_MM);
  for (const entry of entries) await drawDay(page, entry);
  return toPdfBlob(doc);
}
