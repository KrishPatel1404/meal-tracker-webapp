export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL;

// Day boundary: before this local hour you're still on the previous day.
export const DAY_RESET_HOUR = 3;

export const TEXT_SAVE_DEBOUNCE_MS = 600;

// Secret link: https://<site>/#k=<token>
export const SECRET_LINK_HASH_KEY = "k";

export const PHOTO_BUCKET = "meal-photos";
export const PHOTO_MAX_EDGE_PX = 1280;
export const PHOTO_QUALITY = 0.75;
export const PHOTO_SIGNED_URL_TTL_S = 60 * 60;

export const HISTORY_WEEKS = 52;

export const MEAL_STATUS = Object.freeze({
  PENDING: "pending",
  DONE: "done",
  SUBSTITUTED: "substituted",
});

export const SAVE_STATE = Object.freeze({
  IDLE: "idle",
  SAVING: "saving",
  SAVED: "saved",
  ERROR: "error",
});

export const ROUTES = Object.freeze({
  TODAY: "today",
  HISTORY: "history",
});

export const TABLES = Object.freeze({
  DAYS: "days",
  MEAL_LOGS: "meal_logs",
  EXTRAS: "extras",
});
