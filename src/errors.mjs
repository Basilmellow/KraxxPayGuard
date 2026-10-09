export class AppError extends Error {
  constructor(status, message, code = 'REQUEST_DENIED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function requireValue(condition, status, message, code) {
  if (!condition) throw new AppError(status, message, code);
}
export function exactObject(value, keys) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => keys.includes(key)), 400, 'Invalid request fields');
}
