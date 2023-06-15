Execute unit test
`npm run test`

Create prod build
`npm run build-prod`

Expected input
```
{
    type: "TOKEN",
    methodArn: "arn:aws:execute-api:eu-central-1:606743733838:9e201bs3b6/$default/GET/GetStartedLambdaProxyIntegration",
    authorizationToken: "Bearer { sid: \"test_user_id\", realm_access: { roles: [\"TEST_ROLE_1\", \"TEST_ROLE_2\"], }, }",
}
```