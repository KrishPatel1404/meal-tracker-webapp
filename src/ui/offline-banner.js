import { h, icon } from "./dom.js";

const OFFLINE_CLASS = "is-offline";
const MESSAGE = "You're offline. Changes are paused.";

function syncOfflineClass() {
  document.body.classList.toggle(OFFLINE_CLASS, !navigator.onLine);
}

// Lives for the whole app session. CSS shows the banner and disables inputs while offline.
export function mountOfflineBanner(parent) {
  parent.append(
    h("div", { class: "offline-banner", role: "status" }, [
      icon("cloud-off", { small: true }),
      MESSAGE,
    ]),
  );
  window.addEventListener("online", syncOfflineClass);
  window.addEventListener("offline", syncOfflineClass);
  syncOfflineClass();
}
