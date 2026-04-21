export class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = "INTERNAL_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.errorCode   = errorCode;
    this.name        = "AppError";
  }
}

// Keep default export for backward compatibility with existing imports.
export default AppError;
