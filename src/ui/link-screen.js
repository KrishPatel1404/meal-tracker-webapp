import { signInWithLink } from "../data/auth.js";
import { isTypedError } from "../data/errors.js";
import { h, icon } from "./dom.js";

const INPUT_ID = "secret-link";

const COPY = Object.freeze({
  TITLE: "Open your secret link",
  TEXT: "Paste the link you saved to sign in on this device.",
  LABEL: "Secret link",
  PLACEHOLDER: "https://...",
  SUBMIT: "Continue",
  SUBMITTING: "Opening...",
  EMPTY: "Paste your secret link first.",
  FALLBACK_ERROR: "That link didn't open the app. Check it and try again.",
});

export function mountLinkScreen(root, { onSignedIn, error }) {
  const input = h("input", {
    id: INPUT_ID,
    class: "input",
    type: "text",
    inputmode: "url",
    autocomplete: "off",
    autocapitalize: "off",
    autocorrect: "off",
    spellcheck: "false",
    placeholder: COPY.PLACEHOLDER,
  });
  const message = h("p", { class: "link-screen__message", role: "alert" });
  const submitButton = h("button", { type: "submit", class: "btn btn--primary btn--block" }, [
    COPY.SUBMIT,
  ]);
  const form = h("form", { class: "card link-screen__card", novalidate: true }, [
    h("span", { class: "link-screen__icon" }, [icon("link")]),
    h("h1", { class: "link-screen__title" }, COPY.TITLE),
    h("p", { class: "link-screen__text" }, COPY.TEXT),
    h("div", { class: "field" }, [
      h("label", { class: "field__label", for: INPUT_ID }, COPY.LABEL),
      input,
    ]),
    message,
    submitButton,
  ]);
  const screen = h("div", { class: "link-screen" }, form);

  function showMessage(text) {
    message.textContent = text ?? "";
    message.hidden = !text;
  }

  function setBusy(busy) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? COPY.SUBMITTING : COPY.SUBMIT;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!input.value.trim()) {
      showMessage(COPY.EMPTY);
      input.focus();
      return;
    }
    showMessage(null);
    setBusy(true);
    try {
      await signInWithLink(input.value);
    } catch (signInError) {
      if (!isTypedError(signInError)) throw signInError;
      setBusy(false);
      showMessage(signInError.message || COPY.FALLBACK_ERROR);
      input.select();
      return;
    }
    unmount();
    onSignedIn();
  }

  function unmount() {
    form.removeEventListener("submit", onSubmit);
    screen.remove();
  }

  form.addEventListener("submit", onSubmit);
  showMessage(error ? error.message || COPY.FALLBACK_ERROR : null);
  root.append(screen);
  return unmount;
}
