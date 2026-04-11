// errors.mjs — PostgRESTError class and PG error mapping
// Stub: throws "not implemented" until real implementation is added.

export class PostgRESTError extends Error {
  constructor(statusCode, code, message, details, hint) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details || null;
    this.hint = hint || null;
  }

  toJSON() {
    throw new Error('PostgRESTError.toJSON not implemented');
  }
}

export function mapPgError(pgError) {
  throw new Error('mapPgError not implemented');
}
