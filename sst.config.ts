/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "aws-api",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
      providers: {
        aws: {
          profile: input?.stage === "production" ? "acaad-prod" : "acaad-dev",
        }
      }
    };
  },
  async run() {
    const api = new sst.aws.ApiGatewayV2("PublicApiGateway");

    api.route("GET /", {
      handler: "index.upload",
    });
    api.route("GET /latest", {
      handler: "index.latest",
    });
  },
});