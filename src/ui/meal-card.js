import { MEAL_STATUS } from "../config.js";
import { upsertMealLog } from "../data/days.js";
import { SHARED_COPY } from "./copy.js";
import { h, icon } from "./dom.js";
import { createPhotoField } from "./photo-field.js";
import { createSaveQueue, debounceTextSave, settleSave } from "./save-status.js";

const COPY = Object.freeze({
  SHOW_FOODS: "Show foods",
  HIDE_FOODS: "Hide foods",
  OPTIONAL_TAG: "Optional",
  SUBSTITUTE_TAG: "Something else",
  SUBSTITUTE_BUTTON: "Ate something else",
  SUBSTITUTE_LABEL: "What did you eat instead?",
  SUBSTITUTE_PLACEHOLDER: "e.g. Sushi bowl",
  SUBSTITUTE_HINT: "Counts as eaten.",
  NOTE_BUTTON: "Note",
  NOTE_LABEL: "Note",
  NOTE_PLACEHOLDER: "How did it go?",
});

const FOOD_SEPARATOR = ", ";
const ENTER_KEY = "Enter";

function toLogState(log) {
  return {
    status: log?.status ?? MEAL_STATUS.PENDING,
    substitute_text: log?.substitute_text ?? null,
    note: log?.note ?? null,
    photo_path: log?.photo_path ?? null,
  };
}

function cleanText(value) {
  return value.trim() || null;
}

// The tick says whether the meal was eaten; substitute text says it was something else.
function getStatus(isEaten, substituteText) {
  if (!isEaten) return MEAL_STATUS.PENDING;
  return substituteText ? MEAL_STATUS.SUBSTITUTED : MEAL_STATUS.DONE;
}

// Text input that saves after a pause in typing and right away on blur.
function createTextField({ id, label, placeholder, hint, value, multiline, onInput, onSave }) {
  const save = debounceTextSave(onSave);
  const input = h(multiline ? "textarea" : "input", {
    id,
    class: multiline ? "input input--multiline" : "input",
    type: multiline ? undefined : "text",
    placeholder,
    enterkeyhint: multiline ? undefined : "done",
    oninput: () => {
      onInput(input.value);
      save();
    },
    onblur: () => save.flush(),
    onkeydown: (event) => {
      if (!multiline && event.key === ENTER_KEY) input.blur();
    },
  });
  input.value = value ?? "";
  const field = h("div", { class: "field" }, [
    h("label", { class: "field__label", for: id }, label),
    input,
    hint && h("span", { class: "field__hint" }, hint),
  ]);
  return { field, input };
}

function getTitles(meal) {
  // An optional meal's label is just "Optional", which the tag already says.
  const subtitle = meal.optional ? "" : meal.label;
  return { eyebrow: subtitle ? meal.name : "", title: subtitle || meal.name };
}

export function createMealCard({ date, meal, log, onSaved }) {
  const savedLog = toLogState(log);
  const current = { ...savedLog };
  const ids = {
    body: `${meal.key}-body`,
    substitute: `${meal.key}-substitute`,
    note: `${meal.key}-note`,
  };
  const enqueueWrite = createSaveQueue();
  let expanded = false;
  let substituteOpen = Boolean(current.substitute_text);
  let noteOpen = Boolean(current.note);

  function getUnsavedChanges() {
    return Object.fromEntries(
      Object.entries(current).filter(([field, value]) => value !== savedLog[field]),
    );
  }

  // Sends whatever differs from the server, read when the write runs, so a retry after a
  // failure always carries the latest values and a write with nothing left to send is skipped.
  async function writeUnsaved() {
    const changes = getUnsavedChanges();
    if (Object.keys(changes).length === 0) return;
    const { saved } = await settleSave(upsertMealLog(date, meal.key, changes), persist);
    if (!saved) return;
    Object.assign(savedLog, changes);
    onSaved?.({ meal_key: meal.key, ...savedLog });
  }

  function persist() {
    return enqueueWrite(writeUnsaved);
  }

  const { eyebrow, title } = getTitles(meal);
  const check = h("button", {
    type: "button",
    class: "check",
    role: "checkbox",
    "aria-label": `${meal.name} ${SHARED_COPY.EATEN_SUFFIX}`,
    onclick: toggleEaten,
  });
  const substituteTag = h("span", { class: "tag tag--substitute" }, COPY.SUBSTITUTE_TAG);
  const summary = h("span", { class: "meal-card__summary" }, meal.foods.join(FOOD_SEPARATOR));
  const substituteLine = h("span", { class: "meal-card__substitute" });
  const expandButton = h(
    "button",
    {
      type: "button",
      class: "icon-button icon-button--plain meal-card__expand",
      "aria-controls": ids.body,
      onclick: toggleExpanded,
    },
    [icon("chevron-down")],
  );
  const collapsible = h("div", { class: "collapsible", id: ids.body });

  const substitute = createTextField({
    id: ids.substitute,
    label: COPY.SUBSTITUTE_LABEL,
    placeholder: COPY.SUBSTITUTE_PLACEHOLDER,
    hint: COPY.SUBSTITUTE_HINT,
    value: current.substitute_text,
    multiline: false,
    onInput: (value) => {
      current.substitute_text = cleanText(value);
      const isEaten = current.status !== MEAL_STATUS.PENDING || Boolean(current.substitute_text);
      current.status = getStatus(isEaten, current.substitute_text);
      render();
    },
    onSave: persist,
  });
  const note = createTextField({
    id: ids.note,
    label: COPY.NOTE_LABEL,
    placeholder: COPY.NOTE_PLACEHOLDER,
    value: current.note,
    multiline: true,
    onInput: (value) => {
      current.note = cleanText(value);
    },
    onSave: persist,
  });
  const textFields = h("div", { class: "meal-card__text-fields" }, [substitute.field, note.field]);
  const photoField = createPhotoField({
    date,
    ownerKey: meal.key,
    photoPath: current.photo_path,
    onChange: (path) => {
      current.photo_path = path;
      persist();
    },
  });

  const substituteButton = h(
    "button",
    {
      type: "button",
      class: "btn btn--sm",
      "aria-controls": ids.substitute,
      onclick: () => {
        substituteOpen = !substituteOpen;
        render();
        if (substituteOpen) substitute.input.focus();
      },
    },
    [icon("swap", { small: true }), COPY.SUBSTITUTE_BUTTON],
  );
  const noteButton = h(
    "button",
    {
      type: "button",
      class: "btn btn--secondary btn--sm",
      "aria-controls": ids.note,
      onclick: () => {
        noteOpen = !noteOpen;
        render();
        if (noteOpen) note.input.focus();
      },
    },
    [icon("note", { small: true }), COPY.NOTE_BUTTON],
  );

  collapsible.append(
    h("div", { class: "collapsible__inner" }, [
      h("div", { class: "meal-card__body" }, [
        h(
          "ul",
          { class: "food-list" },
          meal.foods.map((food) => h("li", { class: "food-list__item" }, food)),
        ),
        meal.notes.length > 0 &&
          h(
            "ul",
            { class: "plan-notes" },
            meal.notes.map((planNote) => h("li", {}, planNote)),
          ),
        h("div", { class: "meal-card__actions" }, [substituteButton, noteButton]),
        h("div", { class: "meal-card__fields" }, [textFields, photoField]),
      ]),
    ]),
  );

  const card = h("article", { class: "card meal-card" }, [
    h("div", { class: "meal-card__header" }, [
      check,
      h("div", { class: "meal-card__text", onclick: toggleExpanded }, [
        h("span", { class: "meal-card__eyebrow" }, [
          eyebrow,
          meal.optional && h("span", { class: "tag" }, COPY.OPTIONAL_TAG),
          substituteTag,
        ]),
        h("span", { class: "meal-card__title" }, title),
        summary,
        substituteLine,
      ]),
      expandButton,
    ]),
    collapsible,
  ]);

  function toggleEaten() {
    const isEaten = current.status === MEAL_STATUS.PENDING;
    current.status = getStatus(isEaten, current.substitute_text);
    render();
    persist();
  }

  function toggleExpanded() {
    expanded = !expanded;
    render();
  }

  function render() {
    const isSubstituted = current.status === MEAL_STATUS.SUBSTITUTED;
    const isDone = current.status === MEAL_STATUS.DONE;
    check.setAttribute("aria-checked", String(isDone || isSubstituted));
    check.classList.toggle("check--substituted", isSubstituted);
    card.classList.toggle("meal-card--done", isDone);
    card.classList.toggle("meal-card--substituted", isSubstituted);
    substituteTag.hidden = !isSubstituted;
    summary.hidden = isSubstituted;
    substituteLine.hidden = !isSubstituted;
    substituteLine.textContent = current.substitute_text ?? "";

    collapsible.classList.toggle("is-open", expanded);
    expandButton.setAttribute("aria-expanded", String(expanded));
    expandButton.setAttribute("aria-label", expanded ? COPY.HIDE_FOODS : COPY.SHOW_FOODS);

    substitute.field.hidden = !substituteOpen;
    note.field.hidden = !noteOpen;
    // With no text field open, the photo moves into the first column.
    textFields.hidden = !substituteOpen && !noteOpen;
    substituteButton.classList.toggle("btn--substitute", substituteOpen);
    substituteButton.classList.toggle("btn--secondary", !substituteOpen);
    substituteButton.setAttribute("aria-expanded", String(substituteOpen));
    noteButton.setAttribute("aria-expanded", String(noteOpen));
  }

  render();
  return card;
}
