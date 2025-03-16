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

export class NotUniqueError extends Data.TaggedError('NotUniqueError')<{
  duplicateValue: unknown;
  type: string;
}> {}

export class InvalidPhoneNumberError extends Data.TaggedError(
  'InvalidPhoneNumber',
)<{
  employeeId: string;
}> {}
