import { jsPDF } from "jspdf";
import { MEAL_STATUS, MIME_TYPE } from "../config.js";
import { LoadError, NetworkError, toTypedError } from "../data/errors.js";
import { getPhotoUrl } from "../data/photos.js";
import { formatDayLabel, listDates } from "../lib/day.js";
import { resizeToCanvas } from "../lib/image.js";
import { getDayEntries, getMealTitle, getPlanMeals, getRangeTotals } from "./day-entries.js";

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
const FONT_SIZE = Object.freeze({
  TITLE: 20,
  TILE_VALUE: 20,
  SECTION: 15,
  DAY: 13,
  ENTRY: 10.5,
  DETAIL: 9.5,
  GRID: 8.5,
});
const COLOR = Object.freeze({
  TEXT: [20, 20, 22],
  QUIET: [110, 110, 118],
  RULE: [210, 210, 216],
  [MEAL_STATUS.DONE]: [33, 92, 218],
  [MEAL_STATUS.SUBSTITUTED]: [161, 1, 201],
  [MEAL_STATUS.PENDING]: [110, 110, 118],
  EXTRA: [206, 84, 0],
});
const FILL = Object.freeze({
  [MEAL_STATUS.DONE]: [224, 234, 252],
  [MEAL_STATUS.SUBSTITUTED]: [243, 226, 250],
  OFF_PLAN: [240, 240, 243],
  TILE: [246, 246, 248],
  NONE: null,
});

const STATUS_LABEL = Object.freeze({
  [MEAL_STATUS.DONE]: "Ate as planned",
  [MEAL_STATUS.SUBSTITUTED]: "Ate something else",
  [MEAL_STATUS.PENDING]: "Not ticked",
});
// Short labels for the week grid's cells.
const CELL_LABEL = Object.freeze({
  [MEAL_STATUS.DONE]: "Ate",
  [MEAL_STATUS.SUBSTITUTED]: "Swap",
  [MEAL_STATUS.PENDING]: "",
  OFF_PLAN: "-",
});
const LEGEND = Object.freeze([
  { fill: FILL[MEAL_STATUS.DONE], text: "Ate as planned" },
  { fill: FILL[MEAL_STATUS.SUBSTITUTED], text: "Ate something else" },
  { fill: FILL.NONE, text: "Not ticked" },
  { fill: FILL.OFF_PLAN, text: "Not on that day's plan" },
]);
const EXTRA_LABEL = "Extra";
const DAY_TYPE_LABEL = Object.freeze({ WORKOUT: "Workout", REST: "Rest" });
const NOT_LOGGED_LABEL = "No log";
const ROW_LABEL = Object.freeze({ TRAINING: "Training", EXTRAS: "Extras", SCORE: "Day score" });
const FOOD_SEPARATOR = ", ";
const WORKOUT_ONLY_SUFFIX = " - workout days only";
const HIGHLIGHTS_HEADING = "Swaps, extras and notes";
const NO_HIGHLIGHTS_TEXT = "Everything eaten went to plan, with no extras or notes.";
const PLAN_HEADING = "The plan";
export const EXTRA_FALLBACK_TITLE = "Extra food";
const EMPTY_RANGE_TEXT = "No meals logged in this range.";
const TITLE = "Meal log";

const THUMB_BOX_MM = 32;
const THUMB_MAX_PX = 360;
const THUMB_JPEG_QUALITY = 0.7;
const THUMB_FORMAT = "JPEG";

const DAYS_PER_GRID = 7;
const GRID = Object.freeze({
  LABEL_WIDTH_MM: 40,
  HEADER_HEIGHT_MM: 10,
  ROW_HEIGHT_MM: 7,
  CELL_INSET_MM: 0.6,
  CELL_RADIUS_MM: 1,
});
const LEGEND_SWATCH = Object.freeze({
  WIDTH_MM: 5,
  HEIGHT_MM: 3.5,
  TEXT_GAP_MM: 2,
  ITEM_GAP_MM: 7,
});
const TILE = Object.freeze({ GAP_MM: 4, HEIGHT_MM: 24, PADDING_MM: 4, RADIUS_MM: 2 });
const TILE_LINE_OFFSET_MM = Object.freeze({ LABEL: 10, DETAIL: 15 });
const TEXT_ALIGN = Object.freeze({ LEFT: "left", CENTER: "center", RIGHT: "right" });
const TEXT_BASELINE = Object.freeze({ TOP: "top", MIDDLE: "middle" });
const SHAPE_STYLE = Object.freeze({ FILL: "F", STROKE: "S" });

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
        align: TEXT_ALIGN.RIGHT,
      });
    }
    cursor.y += lineHeight;
  }

  // Free-placed text for grids and tiles; x is from the left margin, y from the page top.
  function drawText(
    text,
    { x, y, size, style = FONT_STYLE.NORMAL, color = COLOR.TEXT, align, baseline },
  ) {
    setFont(size, style, color);
    doc.text(toDrawableText(text), PAGE_MARGIN_MM + x, y, { align, baseline });
  }

  function getTextWidth(text, size) {
    setFont(size, FONT_STYLE.NORMAL, COLOR.TEXT);
    return doc.getTextWidth(toDrawableText(text));
  }

  function drawBox({ x, y, w, h, fill, radius = 0 }) {
    if (fill) {
      doc.setFillColor(...fill);
      doc.roundedRect(PAGE_MARGIN_MM + x, y, w, h, radius, radius, SHAPE_STYLE.FILL);
      return;
    }
    doc.setDrawColor(...COLOR.RULE);
    doc.setLineWidth(RULE_WIDTH_MM);
    doc.roundedRect(PAGE_MARGIN_MM + x, y, w, h, radius, radius, SHAPE_STYLE.STROKE);
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
    contentWidth,
    ensureSpace,
    drawLine,
    drawText,
    getTextWidth,
    drawBox,
    drawWrapped,
    drawRule,
    drawImage,
    gap: (mm) => {
      cursor.y += mm;
    },
  };
}

function drawSectionHeading(page, text) {
  // Keeps a heading on the same page as at least a couple of lines under it.
  page.ensureSpace(getLineHeightMm(FONT_SIZE.SECTION) + getLineHeightMm(FONT_SIZE.DAY) * 2);
  page.drawLine({ left: text, size: FONT_SIZE.SECTION, style: FONT_STYLE.BOLD });
  page.gap(ENTRY_GAP_MM);
}

function getTiles(totals, loggedCount, rangeLength) {
  const mealShare = totals.mealsRequired === 0 ? 0 : totals.mealsEaten / totals.mealsRequired;
  return [
    {
      value: formatPercent(mealShare),
      label: "Planned meals eaten",
      detail: `${totals.mealsEaten} of ${totals.mealsRequired} meals`,
    },
    {
      value: String(totals.workoutDays),
      label: "Workout days",
      detail: `${loggedCount} of ${rangeLength} days logged`,
    },
    { value: String(totals.swaps), label: "Meals swapped", detail: "Ate something else" },
    { value: String(totals.extras), label: "Extras", detail: "Food outside the plan" },
  ];
}

function drawTiles(page, tiles) {
  const tileWidth = (page.contentWidth - TILE.GAP_MM * (tiles.length - 1)) / tiles.length;
  page.ensureSpace(TILE.HEIGHT_MM);
  const top = page.cursor.y;
  tiles.forEach(({ value, label, detail }, index) => {
    const x = index * (tileWidth + TILE.GAP_MM);
    const textX = x + TILE.PADDING_MM;
    const textTop = top + TILE.PADDING_MM;
    page.drawBox({
      x,
      y: top,
      w: tileWidth,
      h: TILE.HEIGHT_MM,
      fill: FILL.TILE,
      radius: TILE.RADIUS_MM,
    });
    const baseline = TEXT_BASELINE.TOP;
    page.drawText(value, {
      x: textX,
      y: textTop,
      size: FONT_SIZE.TILE_VALUE,
      style: FONT_STYLE.BOLD,
      baseline,
    });
    page.drawText(label, {
      x: textX,
      y: textTop + TILE_LINE_OFFSET_MM.LABEL,
      size: FONT_SIZE.GRID,
      style: FONT_STYLE.BOLD,
      baseline,
    });
    page.drawText(detail, {
      x: textX,
      y: textTop + TILE_LINE_OFFSET_MM.DETAIL,
      size: FONT_SIZE.GRID,
      color: COLOR.QUIET,
      baseline,
    });
  });
  page.cursor.y = top + TILE.HEIGHT_MM;
}

const NOT_LOGGED_CELL = Object.freeze({ text: "", fill: FILL.OFF_PLAN });

function getTrainingCell(entry) {
  if (!entry) return { text: NOT_LOGGED_LABEL, fill: FILL.OFF_PLAN, color: COLOR.QUIET };
  return entry.day.is_workout
    ? { text: DAY_TYPE_LABEL.WORKOUT, style: FONT_STYLE.BOLD }
    : { text: DAY_TYPE_LABEL.REST, color: COLOR.QUIET };
}

function getMealCell(mealKey, entry) {
  if (!entry) return NOT_LOGGED_CELL;
  const mealEntry = entry.meals.find(({ meal }) => meal.key === mealKey);
  if (!mealEntry) return { text: CELL_LABEL.OFF_PLAN, fill: FILL.OFF_PLAN, color: COLOR.QUIET };
  const { status } = mealEntry;
  // Boxed even without a fill, so a meal that wasn't ticked still shows as an empty slot.
  return {
    text: CELL_LABEL[status],
    fill: FILL[status] ?? FILL.NONE,
    color: COLOR[status],
    boxed: true,
  };
}

function getExtrasCell(entry) {
  if (!entry) return NOT_LOGGED_CELL;
  const count = entry.extras.length;
  return { text: count ? String(count) : "", color: COLOR.EXTRA, style: FONT_STYLE.BOLD };
}

function getScoreCell(entry) {
  if (!entry) return NOT_LOGGED_CELL;
  return { text: formatPercent(entry.progress.score), style: FONT_STYLE.BOLD };
}

function getGridRows(planMeals) {
  return [
    { label: ROW_LABEL.TRAINING, getCell: getTrainingCell },
    ...planMeals.map((meal) => ({
      label: getMealTitle(meal),
      getCell: (entry) => getMealCell(meal.key, entry),
    })),
    { label: ROW_LABEL.EXTRAS, getCell: getExtrasCell },
    { label: ROW_LABEL.SCORE, getCell: getScoreCell },
  ];
}

function drawGridHeader(page, dates, top, dayWidth) {
  const lineHeight = getLineHeightMm(FONT_SIZE.GRID);
  dates.forEach((date, column) => {
    const [weekday, ...dayMonth] = formatDayLabel(date).split(" ");
    const x = GRID.LABEL_WIDTH_MM + column * dayWidth + dayWidth / 2;
    const options = {
      x,
      size: FONT_SIZE.GRID,
      align: TEXT_ALIGN.CENTER,
      baseline: TEXT_BASELINE.TOP,
    };
    page.drawText(weekday, { ...options, y: top, style: FONT_STYLE.BOLD });
    page.drawText(dayMonth.join(" "), { ...options, y: top + lineHeight, color: COLOR.QUIET });
  });
}

function drawGridCell(page, cell, { x, y, w }) {
  const inset = GRID.CELL_INSET_MM;
  if (cell.fill || cell.boxed) {
    page.drawBox({
      x: x + inset,
      y: y + inset,
      w: w - inset * 2,
      h: GRID.ROW_HEIGHT_MM - inset * 2,
      fill: cell.fill,
      radius: GRID.CELL_RADIUS_MM,
    });
  }
  if (!cell.text) return;
  page.drawText(cell.text, {
    x: x + w / 2,
    y: y + GRID.ROW_HEIGHT_MM / 2,
    size: FONT_SIZE.GRID,
    style: cell.style,
    color: cell.color,
    align: TEXT_ALIGN.CENTER,
    baseline: TEXT_BASELINE.MIDDLE,
  });
}

// Days across the top, one row per meal. Columns are a fixed 1/7th wide so every week lines up.
function drawWeekGrid(page, dates, rows, entriesByDate) {
  const dayWidth = (page.contentWidth - GRID.LABEL_WIDTH_MM) / DAYS_PER_GRID;
  page.ensureSpace(GRID.HEADER_HEIGHT_MM + rows.length * GRID.ROW_HEIGHT_MM);
  const top = page.cursor.y;
  drawGridHeader(page, dates, top, dayWidth);
  rows.forEach(({ label, getCell }, rowIndex) => {
    const y = top + GRID.HEADER_HEIGHT_MM + rowIndex * GRID.ROW_HEIGHT_MM;
    page.drawText(label, {
      x: 0,
      y: y + GRID.ROW_HEIGHT_MM / 2,
      size: FONT_SIZE.GRID,
      baseline: TEXT_BASELINE.MIDDLE,
    });
    dates.forEach((date, column) => {
      const x = GRID.LABEL_WIDTH_MM + column * dayWidth;
      drawGridCell(page, getCell(entriesByDate.get(date)), { x, y, w: dayWidth });
    });
  });
  page.cursor.y = top + GRID.HEADER_HEIGHT_MM + rows.length * GRID.ROW_HEIGHT_MM;
}

function drawLegend(page) {
  const lineHeight = getLineHeightMm(FONT_SIZE.GRID);
  page.ensureSpace(lineHeight);
  const middle = page.cursor.y + lineHeight / 2;
  let x = 0;
  for (const { fill, text } of LEGEND) {
    const swatchTop = middle - LEGEND_SWATCH.HEIGHT_MM / 2;
    page.drawBox({
      x,
      y: swatchTop,
      w: LEGEND_SWATCH.WIDTH_MM,
      h: LEGEND_SWATCH.HEIGHT_MM,
      fill,
      radius: GRID.CELL_RADIUS_MM,
    });
    x += LEGEND_SWATCH.WIDTH_MM + LEGEND_SWATCH.TEXT_GAP_MM;
    page.drawText(text, {
      x,
      y: middle,
      size: FONT_SIZE.GRID,
      color: COLOR.QUIET,
      baseline: TEXT_BASELINE.MIDDLE,
    });
    x += page.getTextWidth(text, FONT_SIZE.GRID) + LEGEND_SWATCH.ITEM_GAP_MM;
  }
  page.gap(lineHeight);
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
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

function getMealDetails({ log, status }) {
  const details = [];
  if (status === MEAL_STATUS.SUBSTITUTED && log.substitute_text) {
    details.push(`Ate instead: ${log.substitute_text}`);
  }
  if (log?.note) details.push(`Note: ${log.note}`);
  return details;
}

// A meal is worth a closer look when it was swapped, or has a note or photo to show.
const isMealHighlight = ({ log, status }) =>
  status === MEAL_STATUS.SUBSTITUTED || Boolean(log?.note) || Boolean(log?.photo_path);

const hasHighlights = (entry) => entry.extras.length > 0 || entry.meals.some(isMealHighlight);

async function drawDayHighlights(page, entry) {
  const { day, progress, extras } = entry;
  const meals = entry.meals.filter(isMealHighlight);
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

async function drawHighlights(page, entries) {
  drawSectionHeading(page, HIGHLIGHTS_HEADING);
  const highlighted = entries.filter(hasHighlights);
  if (highlighted.length === 0) {
    page.drawLine({ left: NO_HIGHLIGHTS_TEXT, size: FONT_SIZE.ENTRY, color: COLOR.QUIET });
    page.gap(SECTION_GAP_MM);
    return;
  }
  for (const entry of highlighted) await drawDayHighlights(page, entry);
}

// Each meal's food once, so the grid and highlights don't have to repeat it.
function drawPlan(page, planMeals) {
  drawSectionHeading(page, PLAN_HEADING);
  for (const meal of planMeals) {
    const suffix = meal.workoutOnly ? WORKOUT_ONLY_SUFFIX : "";
    page.drawLine({
      left: getMealTitle(meal) + suffix,
      size: FONT_SIZE.ENTRY,
      style: FONT_STYLE.BOLD,
    });
    page.drawWrapped(meal.foods.join(FOOD_SEPARATOR), {
      size: FONT_SIZE.DETAIL,
      indent: INDENT_MM,
    });
    page.gap(ENTRY_GAP_MM);
  }
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

  const dates = listDates(range.from, range.to);
  drawTiles(page, getTiles(getRangeTotals(entries), entries.length, dates.length));
  page.gap(SECTION_GAP_MM);

  const planMeals = getPlanMeals(entries);
  const rows = getGridRows(planMeals);
  const entriesByDate = new Map(entries.map((entry) => [entry.day.date, entry]));
  for (const week of chunk(dates, DAYS_PER_GRID)) {
    drawWeekGrid(page, week, rows, entriesByDate);
    page.gap(ENTRY_GAP_MM);
  }
  drawLegend(page);
  page.gap(SECTION_GAP_MM);

  await drawHighlights(page, entries);
  drawPlan(page, planMeals);
  return toPdfBlob(doc);
}
