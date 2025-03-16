/// <reference path="./.sst/platform/config.d.ts" />

const LAMBDA_DEFAULTS = {
  memory: '128 MB',
};

export default $config({
  app(input) {
    return {
      name: 'aws-api',
      removal: input?.stage === 'production' ? 'retain' : 'remove',
      home: 'aws',
      providers: {
        aws: {
          profile: input?.stage === 'production' ? 'acaad-prod' : 'acaad-dev',
        },
      },
    };
  },
  async run() {
    const pool = new sst.aws.CognitoUserPool('AcaadTenants');

    const poolDomain = new aws.cognito.UserPoolDomain('main', {
      domain: `acaad-${$app.stage ?? 'fallback'}`,
      userPoolId: pool.id,
    });

    const resource = new aws.cognito.ResourceServer('resource', {
      identifier: 'https://acaad.dev',
      name: 'AcaadTenants',
      scopes: [
        {
          scopeName: 'AcaadTenants',
          scopeDescription: 'Scope for Employee API',
        },
      ],
      userPoolId: pool.id,
    });

    const poolClient1 = new aws.cognito.UserPoolClient('AcaadClient1', {
      name: 'CompanyA',
      userPoolId: pool.id,
      allowedOauthFlowsUserPoolClient: true,
      allowedOauthFlows: ['client_credentials'],
      allowedOauthScopes: ['https://acaad.dev/AcaadTenants'],
      supportedIdentityProviders: ['COGNITO'],
      generateSecret: true,
    });

    const employeeTable = new sst.aws.Dynamo('Employees', {
      fields: {
        tenantId: 'string',
        employeeId: 'string',
        // firstName: 'string',
        // lastName: 'string',
        // phoneNumber: 'string',
      },
      primaryIndex: { hashKey: 'employeeId', rangeKey: 'tenantId' },
    });

    const processTable = new sst.aws.Dynamo('Processes', {
      fields: {
        processId: 'string',
        // ttl: 'number',
      },
      primaryIndex: { hashKey: 'processId' },
      ttl: 'ttl',
    });

    const api = new sst.aws.ApiGatewayV2('PublicApiGateway', {
      transform: {
        route: {
          args: props => {
            props.auth ??= {
              jwt: {
                authorizer: authorizer.id,
              },
            };
          },
        },
      },
    });

    const authorizer = api.addAuthorizer({
      name: 'AcaadCognitoAuthorizer',
      jwt: {
        issuer: $interpolate`https://cognito-idp.${aws.getRegionOutput().name}.amazonaws.com/${pool.id}`,
        audiences: [poolClient1.id],
      },
    });

    api.route('POST /employees', {
      ...LAMBDA_DEFAULTS,
      allowMethods: ['POST'],
      link: [employeeTable, processTable],
      handler: 'CreateEmployeesHandler.createEmployees',
      /*
        Async lambda 
        -> Return http response directly to API Gw (30s integration timeout) 
        -> Continue processing payload and write process info into respective db table
        However, we can do basic validation (valid json, no excess properties, etc) upon parsing the request.
      */
      timeout: '15 minutes',
    });
    api.route('GET /processes', {
      ...LAMBDA_DEFAULTS,
      allowMethods: ['GET'],
      link: [processTable],
      handler: 'GetProcessesHandler.getProcesses',
      timeout: '15 seconds',
    });
  },
});
