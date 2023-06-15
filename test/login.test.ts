import { handler } from "../src/api-gateway-authorizer";

test("Test loging process", async () => {
  process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";

  const TEST_CLIENT_ID = "TestClientId";
  const ISSUER_URL = "https://3.72.251.128:8443/realms/master";
  process.env["IDP_ENDPOINT"] = ISSUER_URL;
  process.env["IDP_CLIENT_ID"] = TEST_CLIENT_ID;
  const TEST_TOKEN = {
    sid: "test_user_id",
    realm_access: {
      roles: ["TEST_ROLE_1", "TEST_ROLE_2"],
    },
  };

  const result = await handler({
    type: "TOKEN",
    methodArn: "arn:aws:execute-api:eu-central-1:606743733838:9e201bs3b6/$default/GET/GetStartedLambdaProxyIntegration",
    authorizationToken: `Bearer ${JSON.stringify(TEST_TOKEN)}`,
  });

  expect(result.context['TEST_ROLE_1']).toBe('dummy');
  expect(result.context['TEST_ROLE_1']).toBe('dummy');
  expect(result.context['X-ROLES']).toBe('TEST_ROLE_1 TEST_ROLE_2');
  console.log(JSON.stringify(result, null, 2));
});
