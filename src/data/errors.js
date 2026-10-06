export class AuthError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "AuthError";
  }
}

export class NetworkError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "NetworkError";
  }
}

export class SaveError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "SaveError";
  }
}

export class LoadError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "LoadError";
  }
}

const NETWORK_FAILURE_PATTERN = /failed to fetch|fetch failed|network|load failed|timed? ?out/i;
const AUTH_HTTP_STATUSES = [401, 403];
const AUTH_ERROR_CODES = [
  "PGRST301",
  "42501",
  "bad_jwt",
  "session_not_found",
  "invalid_credentials",
];
const NETWORK_ERROR_NAMES = ["AuthRetryableFetchError", "TypeError"];

const TYPED_ERRORS = [AuthError, NetworkError, SaveError, LoadError];

function isNetworkFailure(error) {
  return (
    NETWORK_ERROR_NAMES.includes(error.name) ||
    error.status === 0 ||
    NETWORK_FAILURE_PATTERN.test(error.message ?? "")
  );
}

function isAuthFailure(error) {
  return (
    AUTH_HTTP_STATUSES.includes(error.status ?? error.statusCode) ||
    AUTH_ERROR_CODES.includes(error.code) ||
    error.name === "AuthApiError" ||
    error.name === "AuthSessionMissingError"
  );
}

// True for the error types the data layer throws on purpose (each carries a friendly message).
export function isTypedError(error) {
  return TYPED_ERRORS.some((TypedError) => error instanceof TypedError);
}

// Maps any supabase / fetch error to AuthError, NetworkError or the given fallback class.
export function toTypedError(error, FallbackError, message) {
  if (isTypedError(error)) return error;
  if (isNetworkFailure(error)) return new NetworkError(message, { cause: error });
  if (isAuthFailure(error)) return new AuthError(message, { cause: error });
  return new FallbackError(message, { cause: error });
}

// Returns data from a supabase { data, error } result, or throws a typed error.
export function unwrap({ data, error }, FallbackError, message) {
  if (error) throw toTypedError(error, FallbackError, message);
  return data;
}
