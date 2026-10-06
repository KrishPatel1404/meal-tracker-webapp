import { SERVICE_WORKER_URL } from "./config.js";

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register(SERVICE_WORKER_URL).catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}
