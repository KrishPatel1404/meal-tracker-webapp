import { h, icon } from "./dom.js";
import { createExtraItem, DESCRIPTION_FIELD_SELECTOR } from "./extra-item.js";

const ADD_LABEL = "Add food";

export function createExtrasList({ date, extras }) {
  const addButton = h(
    "button",
    { type: "button", class: "btn btn--extra btn--block", onclick: addFood },
    [icon("plus"), ADD_LABEL],
  );
  const list = h("div", { class: "extras" }, addButton);

  function appendItem(extra) {
    const item = createExtraItem({
      date,
      extra,
      onDeleted: () => {
        item.remove();
        addButton.focus();
      },
    });
    addButton.before(item);
    return item;
  }

  // Focus must happen synchronously in the tap for iOS to open the keyboard, so the row is
  // built and focused now and its insert runs behind it.
  function addFood() {
    appendItem(null).querySelector(DESCRIPTION_FIELD_SELECTOR).focus();
  }

  extras.forEach(appendItem);
  return list;
}
