import { MIME_TYPE } from "../config.js";
import { getDaysInRange } from "../data/days.js";
import { isTypedError } from "../data/errors.js";
import { getLogicalDate, shiftDate } from "../lib/day.js";
import { buildCsv } from "../export/csv.js";
import { h } from "./dom.js";
import { openSheet } from "./sheet.js";

const EARLIEST_POSSIBLE_DATE = "2000-01-01";
const DOWNLOAD_URL_REVOKE_DELAY_MS = 30_000;
const ABORT_ERROR = "AbortError";
const NOT_ALLOWED_ERROR = "NotAllowedError";
const FILE_PREFIX = "meal-log";

const FORMATS = Object.freeze({
  CSV: { extension: "csv", mimeType: MIME_TYPE.CSV, label: "Export CSV" },
  PDF: { extension: "pdf", mimeType: MIME_TYPE.PDF, label: "Export PDF" },
});

const PRESETS = Object.freeze([
  { key: "week", label: "Last 7 days", daysBack: 6 },
  { key: "month", label: "Last 30 days", daysBack: 29 },
  { key: "all", label: "All", daysBack: null },
]);
const DEFAULT_PRESET_KEY = "week";

const MESSAGE = Object.freeze({
  GATHERING: "Gathering your meals...",
  BUILDING_PDF: "Putting your PDF together...",
  EMPTY: "Nothing logged in those dates.",
  BAD_RANGE: "The start date needs to be on or before the end date.",
  READY: "",
});

async function buildFile(format, data) {
  if (format === FORMATS.CSV) {
    return new Blob([buildCsv(data)], { type: format.mimeType });
  }
  const { buildPdf } = await import("../export/pdf.js");
  return buildPdf(data);
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = h("a", { href: url, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS);
}

// Native share sheet when the browser can share files, a plain download otherwise.
async function deliverFile(blob, fileName, mimeType) {
  const file = new File([blob], fileName, { type: mimeType });
  if (!navigator.canShare?.({ files: [file] })) return downloadBlob(blob, fileName);
  try {
    await navigator.share({ files: [file] });
  } catch (error) {
    if (error.name === ABORT_ERROR) return;
    // Long exports can outlive the tap that started them, and browsers then refuse to share.
    if (error.name === NOT_ALLOWED_ERROR) return downloadBlob(blob, fileName);
    throw error;
  }
}

function createDateField(label, value, onchange) {
  const input = h("input", { class: "input", type: "date", value, required: true, onchange });
  return {
    input,
    field: h("label", { class: "field" }, [h("span", { class: "field__label" }, label), input]),
  };
}

export function openExportSheet() {
  const today = getLogicalDate();
  const clearPreset = () => markPreset(null);
  const fromField = createDateField("From", shiftDate(today, -PRESETS[0].daysBack), clearPreset);
  const toField = createDateField("To", today, clearPreset);
  const status = h("p", { class: "field__hint", role: "status", "aria-live": "polite" });
  let activePresetKey = DEFAULT_PRESET_KEY;

  const presetButtons = PRESETS.map((preset) =>
    h(
      "button",
      {
        type: "button",
        class: "segmented__option",
        "aria-pressed": String(preset.key === activePresetKey),
        onclick: () => applyPreset(preset),
      },
      preset.label,
    ),
  );
  const formatButtons = Object.values(FORMATS).map((format) =>
    h(
      "button",
      {
        type: "button",
        class: format === FORMATS.CSV ? "btn btn--primary" : "btn btn--secondary",
        onclick: () => runExport(format),
      },
      format.label,
    ),
  );

  function setStatus(message) {
    status.textContent = message;
  }

  function setBusy(busy) {
    for (const button of [...presetButtons, ...formatButtons]) button.disabled = busy;
  }

  function markPreset(key) {
    activePresetKey = key;
    presetButtons.forEach((button, index) => {
      button.setAttribute("aria-pressed", String(PRESETS[index].key === key));
    });
  }

  async function findEarliestLoggedDate() {
    const { days } = await getDaysInRange(EARLIEST_POSSIBLE_DATE, today);
    return days[0]?.date ?? today;
  }

  async function applyPreset(preset) {
    markPreset(preset.key);
    toField.input.value = today;
    if (preset.daysBack !== null) {
      fromField.input.value = shiftDate(today, -preset.daysBack);
      return;
    }
    await withErrorStatus(async () => {
      fromField.input.value = await findEarliestLoggedDate();
    });
  }

  // Typed data-layer errors carry a friendly message; anything else is a real bug and propagates.
  async function withErrorStatus(task) {
    setBusy(true);
    setStatus(MESSAGE.GATHERING);
    try {
      setStatus((await task()) ?? MESSAGE.READY);
    } catch (error) {
      if (!isTypedError(error)) throw error;
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function runExport(format) {
    const from = fromField.input.value;
    const to = toField.input.value;
    if (!from || !to || from > to) return setStatus(MESSAGE.BAD_RANGE);
    await withErrorStatus(async () => {
      const data = await getDaysInRange(from, to);
      if (data.days.length === 0) return MESSAGE.EMPTY;
      if (format === FORMATS.PDF) setStatus(MESSAGE.BUILDING_PDF);
      const blob = await buildFile(format, data);
      await deliverFile(
        blob,
        `${FILE_PREFIX}_${from}_to_${to}.${format.extension}`,
        format.mimeType,
      );
    });
  }

  openSheet({
    title: "Export your meals",
    content: [
      h("div", { class: "segmented", role: "group", "aria-label": "Date range" }, presetButtons),
      fromField.field,
      toField.field,
      status,
      h("div", { class: "sheet__actions" }, formatButtons),
    ],
  });
}
