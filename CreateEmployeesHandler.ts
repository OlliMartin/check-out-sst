import { Effect, Either, Exit, Schema } from 'effect';
import { APIGatewayProxyResult } from 'aws-lambda';
import { Database, DynamoDatabase } from './services/DatabaseService';
import { APIGatewayProxyWithCognitoAuthorizerEvent } from 'aws-lambda/trigger/api-gateway-proxy';
import { Employee, EmployeeSchema } from './model/employee';
import { RequestError } from './model/errors';
import { ParseError } from 'effect/ParseResult';

const CreateEmployeesRequestSchema = Schema.NonEmptyArray(EmployeeSchema);

const getTenantId = (event: APIGatewayProxyWithCognitoAuthorizerEvent) => {
  const tenantId = event.requestContext.authorizer.claims['client_id'];

  return !!tenantId
    ? Effect.succeed(tenantId)
    : Effect.fail(
        new RequestError({ message: 'Could not locate client id in token.' }),
      );
};

const parsePayload = (
  body: string | null,
): Effect.Effect<readonly Employee[], RequestError | ParseError> => {
  return Effect.gen(function* () {
    if (!body) {
      return yield* new RequestError({
        message: 'Empty request body is invalid.',
      });
    }

    const jsonParsed = yield* Effect.try({
      try: () => JSON.parse(body),
      catch: err =>
        new RequestError({ message: 'Could not parse request body.' }),
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

const createEmployeesEffect = (
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
) => {
  return Effect.gen(function* () {
    const tenantId = yield* getTenantId(event);
    const employees = yield* parsePayload(event.body);

    const database = yield* Database;

    return yield* Effect.succeed('abc');
  });
};

export async function createEmployees(
  event: APIGatewayProxyWithCognitoAuthorizerEvent,
): Promise<APIGatewayProxyResult> {
  try {
    const employeeResult = await Effect.runPromiseExit(
      createEmployeesEffect(event).pipe(
        Effect.provideService(Database, DynamoDatabase),
      ),
    );

    return Exit.match({
      onSuccess: res => ({
        statusCode: 200,
        body: JSON.stringify(res),
      }),
      onFailure: err => ({
        statusCode: 400,
        body: JSON.stringify(err.toJSON()),
      }),
    })(employeeResult);
  } catch (err) {
    console.log(err);

    return {
      statusCode: 500,
      body: 'An unexpected error occured.',
    };
  }
}
