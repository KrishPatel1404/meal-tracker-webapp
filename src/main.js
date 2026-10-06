import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import { ROUTES } from "./config.js";
import { ensureSession, SESSION_STATE } from "./data/auth.js";
import { isTypedError } from "./data/errors.js";
import { getLogicalDate } from "./lib/day.js";
import { mountDayView } from "./ui/today-view.js";
import { mountHistoryView } from "./ui/history-view.js";
import { mountLinkScreen } from "./ui/link-screen.js";
import { mountOfflineBanner } from "./ui/offline-banner.js";
import { registerServiceWorker } from "./pwa.js";

const root = document.getElementById("app");
let unmountCurrent = () => {};

function show(route, date) {
  unmountCurrent();
  root.replaceChildren();
  if (route === ROUTES.HISTORY) {
    unmountCurrent = mountHistoryView(root, {
      onOpenDay: (picked) => show(ROUTES.TODAY, picked),
      onBack: () => show(ROUTES.TODAY, getLogicalDate()),
    });
    return;
  }
  unmountCurrent = mountDayView(root, {
    date,
    onChangeDate: (next) => show(ROUTES.TODAY, next),
    onOpenHistory: () => show(ROUTES.HISTORY),
  });
}

async function start() {
  mountOfflineBanner(document.body);
  registerServiceWorker();
  const openToday = () => show(ROUTES.TODAY, getLogicalDate());
  try {
    const state = await ensureSession();
    if (state === SESSION_STATE.NEEDS_LINK) {
      mountLinkScreen(root, { onSignedIn: openToday });
      return;
    }
  } catch (error) {
    if (!isTypedError(error)) throw error;
    mountLinkScreen(root, { onSignedIn: openToday, error });
    return;
  }
  openToday();
}

start();
