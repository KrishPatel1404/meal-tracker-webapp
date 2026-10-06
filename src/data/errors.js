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
