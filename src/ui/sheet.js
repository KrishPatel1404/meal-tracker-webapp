import { h, icon } from "./dom.js";

const OPEN_CLASS = "is-open";
const SCROLL_LOCK_CLASS = "has-open-sheet";
const ESCAPE_KEY = "Escape";

let sheetCount = 0;

// Everything already on the page becomes inert while the sheet is open, so
// focus and taps can't leave it. Elements that were already inert stay that way.
function makeBackgroundInert() {
  const changed = [...document.body.children].filter((el) => !el.inert);
  for (const el of changed) el.inert = true;
  return () => {
    for (const el of changed) el.inert = false;
  };
}

async function waitForAnimations(el) {
  await Promise.allSettled(el.getAnimations().map((animation) => animation.finished));
}

// Bottom sheet primitive. Returns close(); closing is idempotent.
export function openSheet({ title, content }) {
  sheetCount += 1;
  const titleId = `sheet-title-${sheetCount}`;
  const previousFocus = document.activeElement;
  let closed = false;

  const backdrop = h("div", { class: "sheet-backdrop", "aria-hidden": "true" });
  const closeButton = h(
    "button",
    { type: "button", class: "icon-button sheet__close", "aria-label": "Close" },
    [icon("close")],
  );
  const sheet = h(
    "div",
    {
      class: "sheet",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
      tabindex: "-1",
    },
    [
      h("div", { class: "sheet__handle", "aria-hidden": "true" }),
      h("div", { class: "sheet__header" }, [
        h("h2", { class: "sheet__title", id: titleId }, title),
        closeButton,
      ]),
      h("div", { class: "sheet__body" }, content),
    ],
  );

  const restoreBackground = makeBackgroundInert();
  document.documentElement.classList.add(SCROLL_LOCK_CLASS);
  document.body.append(backdrop, sheet);

  function onKeydown(event) {
    if (event.key !== ESCAPE_KEY) return;
    event.preventDefault();
    close();
  }

  async function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeydown);
    backdrop.removeEventListener("click", close);
    closeButton.removeEventListener("click", close);

    restoreBackground();
    document.documentElement.classList.remove(SCROLL_LOCK_CLASS);
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }

    backdrop.classList.remove(OPEN_CLASS);
    sheet.classList.remove(OPEN_CLASS);
    await Promise.all([waitForAnimations(backdrop), waitForAnimations(sheet)]);
    backdrop.remove();
    sheet.remove();
  }

  document.addEventListener("keydown", onKeydown);
  backdrop.addEventListener("click", close);
  closeButton.addEventListener("click", close);

  // Commit the closed position first so the open state transitions in.
  sheet.getBoundingClientRect();
  backdrop.classList.add(OPEN_CLASS);
  sheet.classList.add(OPEN_CLASS);
  sheet.focus({ preventScroll: true });

  return close;
}
