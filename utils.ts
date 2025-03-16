import { Effect, Exit } from 'effect';
import { DatabaseError, RequestError } from './model/errors';
import { ParseError } from 'effect/ParseResult';
import { APIGatewayProxyResult } from 'aws-lambda';
import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda/trigger/api-gateway-proxy';

export const getTenantFromRequest = (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
) => {
  const tenantId = event.requestContext.authorizer.jwt.claims['client_id'];

  return !!tenantId
    ? Effect.succeed(tenantId.toString())
    : Effect.fail(
        new RequestError({ message: 'Could not locate client id in token.' }),
      );
};

export function transformExitToApiResult<T>(
  exit: Exit.Exit<T, RequestError | ParseError | DatabaseError>,
): APIGatewayProxyResult {
  return Exit.match({
    onSuccess: res => ({
      statusCode: 200,
      body: JSON.stringify(res),
      headers: {
        'content-type': 'application/json',
      },
    }),
    onFailure: err => {
      console.log(err._tag, err);

      return {
        statusCode: 400,
        body: JSON.stringify(err.toJSON()),
        headers: {
          'content-type': 'application/json',
        },
      };
    },
  })(exit);
}
