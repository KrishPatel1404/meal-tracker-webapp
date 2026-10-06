import { addExtra, deleteExtra, updateExtra } from "../data/extras.js";
import { deletePhoto } from "../data/photos.js";
import { h, icon } from "./dom.js";
import { createPhotoField } from "./photo-field.js";
import { createSaveQueue, debounceTextSave, settleSave } from "./save-status.js";

const COPY = Object.freeze({
  DESCRIPTION: "What did you have?",
  NOTE: "Note (optional)",
  DELETE: "Remove this food",
  CONFIRM: "Remove?",
  KEEP: "Keep",
  REMOVE: "Remove",
  INSERT_FAILED: "Couldn't save this food yet. What you typed is kept.",
  RETRY: "Retry",
});

const DESCRIPTION_FIELD = "description";
export const DESCRIPTION_FIELD_SELECTOR = `[data-field="${DESCRIPTION_FIELD}"]`;

// `extra` is the saved row, or null for a new row: it is built right away (so the caller can focus
// it inside the tap handler, which iOS needs for the keyboard) and inserted behind the scenes.
export function createExtraItem({ date, extra = null, onDeleted }) {
  let extraId = extra?.id ?? null;
  let photoPath = extra?.photo_path ?? null;
  const enqueueWrite = createSaveQueue();

  const readFields = () => ({
    description: description.value,
    note: note.value || null,
    photo_path: photoPath,
  });

  async function writeRow() {
    if (extraId !== null) {
      await updateExtra(extraId, readFields());
      return;
    }
    extraId = (await addExtra(date, readFields())).id;
  }

  // Every write sends the whole row in tap order, so a later write also repairs an earlier failed one.
  // Until the insert has landed (or after it failed) a write is the insert, so typed text is never lost.
  const saveExtra = () =>
    enqueueWrite(async () => {
      const result = await settleSave(writeRow());
      insertFailure.hidden = extraId !== null;
      if (extraId !== null) mountPhotoField();
      return result;
    });
  const saveText = debounceTextSave(saveExtra);
  const textFieldAttrs = {
    type: "text",
    class: "input",
    autocomplete: "off",
    enterkeyhint: "done",
    oninput: () => saveText(),
    onblur: () => saveText.flush(),
  };
  const description = h("input", {
    ...textFieldAttrs,
    dataset: { field: DESCRIPTION_FIELD },
    "aria-label": COPY.DESCRIPTION,
    placeholder: COPY.DESCRIPTION,
    value: extra?.description ?? "",
  });
  const note = h("input", {
    ...textFieldAttrs,
    "aria-label": COPY.NOTE,
    placeholder: COPY.NOTE,
    value: extra?.note ?? "",
  });
  // A photo is stored under the row id, so the field only appears once the row exists.
  const photoSlot = h("div");
  function mountPhotoField() {
    if (photoSlot.hasChildNodes()) return;
    photoSlot.append(
      createPhotoField({
        date,
        ownerKey: extraId,
        photoPath,
        onChange: (path) => {
          photoPath = path;
          saveExtra();
        },
      }),
    );
  }
  const insertFailure = h("div", { class: "meal-card__actions", role: "alert", hidden: true }, [
    h("span", { class: "extra-row__note" }, COPY.INSERT_FAILED),
    h(
      "button",
      { type: "button", class: "btn btn--secondary btn--sm", onclick: saveExtra },
      COPY.RETRY,
    ),
  ]);

  const deleteButton = h(
    "button",
    {
      type: "button",
      class: "icon-button icon-button--plain extra-row__delete",
      "aria-label": COPY.DELETE,
      onclick: () => showConfirm(true),
    },
    [icon("trash")],
  );
  const keepButton = h(
    "button",
    { type: "button", class: "btn btn--secondary btn--sm", onclick: () => showConfirm(false) },
    COPY.KEEP,
  );
  const removeButton = h(
    "button",
    { type: "button", class: "btn btn--primary btn--sm", onclick: removeExtra },
    COPY.REMOVE,
  );
  const confirmRow = h("div", { class: "meal-card__actions", role: "group", hidden: true }, [
    h("span", { class: "extra-row__note" }, COPY.CONFIRM),
    keepButton,
    removeButton,
  ]);

  function showConfirm(isAsking) {
    confirmRow.hidden = !isAsking;
    deleteButton.hidden = isAsking;
    (isAsking ? keepButton : deleteButton).focus();
  }

  // Photo goes first so a failed row delete can be retried without leaving a dead path behind.
  async function deleteExtraAndPhoto() {
    if (photoPath) await deletePhoto(photoPath);
    await deleteExtra(extraId);
  }

  // A row that never reached the server has nothing to delete remotely.
  const deleteSavedRow = () =>
    extraId === null ? { saved: true } : settleSave(deleteExtraAndPhoto());

  async function removeExtra() {
    saveText.cancel();
    removeButton.disabled = true;
    const { saved } = await enqueueWrite(deleteSavedRow);
    if (!saved) {
      removeButton.disabled = false;
      return;
    }
    onDeleted(extraId);
  }

  if (extraId === null) saveExtra();
  else mountPhotoField();

  return h("div", { class: "card extra-row" }, [
    h("span", { class: "extra-row__badge" }, [icon("plus")]),
    h("div", { class: "extra-row__body" }, [
      description,
      note,
      photoSlot,
      insertFailure,
      confirmRow,
    ]),
    deleteButton,
  ]);
}
