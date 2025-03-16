import { Data } from 'effect';

export class RequestError extends Data.TaggedError('RequestError')<{
  message: string;
  statusCode: number;
}> {}

export class DatabaseError extends Data.TaggedError('DatabaseError')<{
  message: string;
  type: string;
  innerError?: unknown;
}> {}
