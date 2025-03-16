import { Effect, Schema, Stream } from 'effect';
import { APIGatewayProxyResult } from 'aws-lambda';
import { Database, DynamoDatabase } from './services/DatabaseService';
import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda/trigger/api-gateway-proxy';
import { Employee, EmployeeSchema } from './model/employee';
import {
  DatabaseError,
  InvalidPhoneNumberError,
  RequestError,
} from './model/errors';
import { ParseError } from 'effect/ParseResult';
import { Process } from './model/process';
import { getTenantFromRequest, transformExitToApiResult } from './utils';
import { isValidPhoneNumber } from 'libphonenumber-js';

const CreateEmployeesRequestSchema = Schema.NonEmptyArray(EmployeeSchema);

const getProcessId = (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  const processId = event.requestContext.requestId;
  return Effect.succeed(processId);
};

const parsePayload = (
  body: string | undefined,
): Effect.Effect<readonly Employee[], RequestError | ParseError> => {
  return Effect.gen(function* () {
    if (!body) {
      return yield* new RequestError({
        message: 'Empty request body is invalid.',
        statusCode: 400,
      });
    }

    const jsonParsed = yield* Effect.try({
      try: () => JSON.parse(body),
      catch: () =>
        new RequestError({
          message: 'Could not parse request body.',
          statusCode: 400,
        }),
    });

    const parserResult: readonly Employee[] = yield* Schema.decode(
      CreateEmployeesRequestSchema,
    )(jsonParsed, {
      exact: true,
      onExcessProperty: 'error',
    });

    return parserResult;
  });
};

const verifyIdUniqueness = (
  employees: readonly Employee[],
): Effect.Effect<void, RequestError> => {
  return Effect.gen(function* () {
    const employeeIdCountUnique = new Set<string>(
      employees.map(e => e.employeeId),
    );

    if (employeeIdCountUnique.size !== employees.length) {
      yield* new RequestError({
        message: 'Employee IDs must be unique.',
        statusCode: 400,
      });
    }
  });
};

const indicateProcessStarted = (
  process: Process,
): Effect.Effect<Process, DatabaseError, Database> => {
  return Effect.gen(function* () {
    const database = yield* Database;
    return yield* database.upsertProcess({
      ...process,
      startedAt: Date.now(),
    });
  });
};

const writeProcessSummary = (
  process: Process,
  employees: readonly Employee[],
) => {
  return Effect.gen(function* () {
    const database = yield* Database;

    return yield* database.upsertProcess({
      ...process,
      finishedAt: Date.now(),
      processedRecords: employees.length,
    });
  });
};

const validatePhoneNumber = (
  employee: Employee,
): Effect.Effect<Employee, InvalidPhoneNumberError> => {
  if (employee.phoneNumber && !isValidPhoneNumber(employee.phoneNumber)) {
    return Effect.fail(
      new InvalidPhoneNumberError({ employeeId: employee.employeeId }),
    );
  }

  return Effect.succeed(employee);
};

const processEmployeesEffect = (
  process: Process,
  employees: readonly Employee[],
): Effect.Effect<void, DatabaseError, Database> => {
  return Effect.scoped(
    Effect.gen(function* () {
      process = yield* indicateProcessStarted(process);

      const employeeStreamEff = Stream.fromIterable(employees).pipe(
        Stream.partitionEither(e => validatePhoneNumber(e).pipe(Effect.either)),
      );

      const database = yield* Database;
      const [invalidPhoneNumberStream, successful] = yield* employeeStreamEff;

      const dbUpdateStream = yield* database.createEmployees(
        process.tenantId,
        successful,
      );

      const dbResult = yield* Stream.runCollect(
        dbUpdateStream.pipe(Stream.either),
      );

      yield* Effect.log(
        yield* Stream.runCollect(invalidPhoneNumberStream),
        dbResult,
      );

      // Missing: Use the different streams to calculate #successful, #failed records and to generate error details,
      // i.e. which record was rejected for which reason (invalid phone number, duplicate, ..)
      process = yield* writeProcessSummary(process, employees);
    }),
  );
};

const createEmployeesEffect = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Effect.Effect<
  Process,
  RequestError | ParseError | DatabaseError,
  Database
> => {
  return Effect.gen(function* () {
    const tenantId = yield* getTenantFromRequest(event);
    const processId = yield* getProcessId(event);
    const employees = yield* parsePayload(event.body);

    yield* verifyIdUniqueness(employees);

    yield* Effect.log(
      `[${processId}] Received ${employees.length} employees to process for tenant ${tenantId}.`,
    );

    const database = yield* Database;
    const processRecord = new Process(tenantId, processId, employees.length);
    yield* database.upsertProcess(processRecord);

    yield* Effect.forkDaemon(processEmployeesEffect(processRecord, employees));

    return processRecord;
  });
};

export async function createEmployees(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResult> {
  const employeeResult = await Effect.runPromiseExit(
    createEmployeesEffect(event).pipe(
      Effect.provideService(Database, DynamoDatabase),
    ),
  );

  return transformExitToApiResult(employeeResult);
}
