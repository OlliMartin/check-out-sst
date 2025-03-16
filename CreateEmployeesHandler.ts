import { Effect, Schema } from 'effect';
import { APIGatewayProxyResult } from 'aws-lambda';
import { Database, DynamoDatabase } from './services/DatabaseService';
import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda/trigger/api-gateway-proxy';
import { Employee, EmployeeSchema } from './model/employee';
import { DatabaseError, RequestError } from './model/errors';
import { ParseError } from 'effect/ParseResult';
import { Process } from './model/process';
import { getTenantFromRequest, transformExitToApiResult } from './utils';

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
      catch: err =>
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

const processEmployeesEffect = (
  process: Process,
  employees: readonly Employee[],
): Effect.Effect<void, any, Database> => {
  return Effect.gen(function* () {
    process = yield* indicateProcessStarted(process);

    yield* Effect.sleep('10 seconds');

    process = yield* writeProcessSummary(process, employees);

    yield* Effect.log(process);
  });
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
//redeploy-pls
//redeploy-pls
//redeploy-pls
//redeploy-pls
