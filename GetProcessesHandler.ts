import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda/trigger/api-gateway-proxy';
import { Effect } from 'effect';
import { Process } from './model/process';
import { Database, DynamoDatabase } from './services/DatabaseService';
import { getTenantFromRequest, transformExitToApiResult } from './utils';
import { RequestError } from './model/errors';

const getProcessToQuery = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Effect.Effect<string, RequestError> => {
  const processId: string | undefined = event.queryStringParameters?.id;

  if (!processId) {
    return Effect.fail(
      new RequestError({
        message: "Missing required query parameter 'id'.",
        statusCode: 400,
      }),
    );
  }

  return Effect.succeed(processId);
};

const getProcessEffect = (event: APIGatewayProxyEventV2WithJWTAuthorizer) => {
  return Effect.gen(function* () {
    const processId = yield* getProcessToQuery(event);
    const tenantId = yield* getTenantFromRequest(event);

    const database = yield* Database;
    const process = yield* database.getProcessById(tenantId, processId);

    return process;
  });
};

export async function getProcesses(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) {
  const processResult = await Effect.runPromiseExit(
    getProcessEffect(event).pipe(
      Effect.provideService(Database, DynamoDatabase),
    ),
  );

  return transformExitToApiResult(processResult);
}
//redeploy-pls
//redeploy-pls
//redeploy-pls
//redeploy-pls
//redeploy-pls
//redeploy-pls
//redeploy-pls
//redeploy-pls
//redeploy-pls
//redeploy-pls
