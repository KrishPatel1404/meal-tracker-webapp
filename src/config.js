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

export const PHOTO_URL_REFRESH_MARGIN_S = 60;
// Signing requests made within this window go to storage as one batch.
export const PHOTO_SIGN_BATCH_DELAY_MS = 0;

export const MIME_TYPE = Object.freeze({
  WEBP: "image/webp",
  JPEG: "image/jpeg",
  CSV: "text/csv",
  PDF: "application/pdf",
});

export const PHOTO_EXTENSIONS = Object.freeze({
  [MIME_TYPE.WEBP]: "webp",
  [MIME_TYPE.JPEG]: "jpg",
});
export const MS_PER_SECOND = 1000;

// Rows per range request. Must not exceed the project's PostgREST max-rows (Supabase default 1000),
// because a page shorter than this is read as the last one.
export const RANGE_PAGE_SIZE = 1000;

export const DAY_CONFLICT_COLUMNS = "user_id,date";
export const MEAL_LOG_CONFLICT_COLUMNS = "user_id,date,meal_key";

export const SERVICE_WORKER_URL = "/sw.js";
