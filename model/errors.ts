import { Data } from 'effect';

export class RequestError extends Data.TaggedError('RequestError')<{
  message: string;
}> {}
