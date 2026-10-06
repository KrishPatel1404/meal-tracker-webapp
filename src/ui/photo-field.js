import { isTypedError } from "../data/errors.js";
import { deletePhoto, getPhotoUrl, uploadPhoto } from "../data/photos.js";
import { compressImage } from "../lib/image.js";
import { h, icon } from "./dom.js";
import { settleSave } from "./save-status.js";
import { openSheet } from "./sheet.js";

const COPY = Object.freeze({
  ATTACH: "Photo",
  ADDING: "Adding...",
  VIEWER_TITLE: "Photo",
  THUMB_ALT: "Photo, tap to enlarge",
  VIEWER_ALT: "Photo",
  REMOVE: "Remove photo",
  ADD_FAILED: "Couldn't add that photo. Try again.",
  REMOVE_FAILED: "Couldn't remove that photo. Try again.",
  LOAD_FAILED: "Couldn't load that photo.",
});

const OPEN_KEYS = ["Enter", " "];

export function createPhotoField({ date, ownerKey, photoPath, onChange }) {
  let path = photoPath ?? null;
  let uploading = false;
  let stopWatchingThumb = () => {};

  const input = h("input", {
    type: "file",
    accept: "image/*",
    class: "visually-hidden",
    onchange: attachPhoto,
  });
  const attachTile = h("label", { class: "photo-attach" }, [icon("camera"), COPY.ATTACH, input]);
  const busyTile = h("div", { class: "photo-attach", role: "status", hidden: true }, COPY.ADDING);
  const message = h("p", { class: "field__hint", role: "status", hidden: true });
  const root = h("div", { class: "photo-field" });

  function showMessage(text) {
    message.textContent = text ?? "";
    message.hidden = !text;
  }

  async function showPhoto(img, photoPathToShow) {
    try {
      img.src = await getPhotoUrl(photoPathToShow);
    } catch (error) {
      if (!isTypedError(error)) throw error;
      showMessage(COPY.LOAD_FAILED);
    }
  }

  // Signs the URL only once the thumbnail is on screen, so collapsed or off-screen photos cost nothing.
  function showPhotoWhenVisible(img, photoPathToShow) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      showPhoto(img, photoPathToShow);
    });
    observer.observe(img);
    return () => observer.disconnect();
  }

  function viewLarger(img) {
    if (!img.src) return;
    openSheet({
      title: COPY.VIEWER_TITLE,
      content: h("img", { class: "photo-viewer__img", alt: COPY.VIEWER_ALT, src: img.src }),
    });
  }

  function buildThumb() {
    const img = h("img", {
      class: "photo-thumb__img",
      alt: COPY.THUMB_ALT,
      loading: "lazy",
      role: "button",
      tabindex: "0",
      onclick: () => viewLarger(img),
      onkeydown: (event) => {
        if (!OPEN_KEYS.includes(event.key)) return;
        event.preventDefault();
        viewLarger(img);
      },
    });
    const removeButton = h(
      "button",
      {
        type: "button",
        class: "photo-thumb__remove",
        "aria-label": COPY.REMOVE,
        onclick: () => removePhoto(removeButton),
      },
      [icon("close")],
    );
    stopWatchingThumb = showPhotoWhenVisible(img, path);
    return h("div", { class: "photo-thumb" }, [img, removeButton]);
  }

  function render() {
    attachTile.hidden = uploading || path !== null;
    busyTile.hidden = !uploading;
    stopWatchingThumb();
    const thumb = path === null ? null : buildThumb();
    root.replaceChildren(...[thumb, attachTile, busyTile, message].filter(Boolean));
  }

  async function compressAndUpload(file) {
    return uploadPhoto(date, ownerKey, await compressImage(file));
  }

  async function attachPhoto() {
    const [file] = input.files;
    if (!file) return;
    uploading = true;
    showMessage(null);
    render();
    const { saved, value } = await settleSave(compressAndUpload(file));
    input.value = "";
    uploading = false;
    if (saved) path = value;
    else showMessage(COPY.ADD_FAILED);
    render();
    if (saved) onChange(path);
  }

  async function removePhoto(removeButton) {
    removeButton.disabled = true;
    showMessage(null);
    const { saved } = await settleSave(deletePhoto(path));
    if (!saved) {
      removeButton.disabled = false;
      showMessage(COPY.REMOVE_FAILED);
      return;
    }
    path = null;
    render();
    input.focus();
    onChange(null);
  }

  render();
  return root;
}
