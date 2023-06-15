import { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult, MaybeStatementResource, ConditionBlock, Statement } from "aws-lambda";

export async function handler(event: APIGatewayTokenAuthorizerEvent): Promise<APIGatewayAuthorizerResult> {
  if (process.env.IDP_DEV_MODE) {
    process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = "0";
  }

  const tmp = event.methodArn.split(":");
  const apiGatewayArnTmp = tmp[5].split("/");
  const awsAccountId = tmp[4];
  const region = tmp[3];
  const restApiId = apiGatewayArnTmp[0];
  const stage = apiGatewayArnTmp[1];
  const method = apiGatewayArnTmp[2];
  let resource = "/"; // root resource

  let policy: AuthPolicy;

  if (apiGatewayArnTmp[3]) {
    resource += apiGatewayArnTmp.slice(3, apiGatewayArnTmp.length).join("/");
  }

  const tokenString = event.authorizationToken.replace("Bearer ", "");
  let roles = [];
  try {
    const token = JSON.parse(tokenString);
    roles = token.realm_access.roles;

    policy = new AuthPolicy(token.sid, awsAccountId, restApiId, region, stage);
    policy.allowMethod(HttpVerb[method as keyof typeof HttpVerb], resource);
  } catch (err) {
    console.debug("Token verification error: ");
    console.debug(err);
    policy = new AuthPolicy("SID", awsAccountId, restApiId, region, stage);
    policy.denyAllMethods();
  }
  // finally, build the policy
  const authResponse = policy.build();

  authResponse.context = {
    authenticated: Date.now(),
  };

  // Option 1 for placing roles in context
  for (const role of roles) {
    authResponse.context[role] = "dummy";
  }

  // Option 2 for placing roles in context
  authResponse.context["X-ROLES"] = roles.join(" ");

  return authResponse;
}

/**
 * AuthPolicy receives a set of allowed and denied methods and generates a valid
 * AWS policy for the API Gateway authorizer. The constructor receives the calling
 * user principal, the AWS account ID of the API owner, and an apiOptions object.
 * The apiOptions can contain an API Gateway RestApi Id, a region for the RestApi, and a
 * stage that calls should be allowed/denied for. For example
 * {
 *   restApiId: "xxxxxxxxxx",
 *   region: "us-east-1",
 *   stage: "dev"
 * }
 *
 * var testPolicy = new AuthPolicy("[principal user identifier]", "[AWS account id]", apiOptions);
 * testPolicy.allowMethod(AuthPolicy.HttpVerb.GET, "/users/username");
 * testPolicy.denyMethod(AuthPolicy.HttpVerb.POST, "/pets");
 * context.succeed(testPolicy.build());
 *
 * @class AuthPolicy
 * @constructor
 */
class AuthPolicy {
  /**
   * The policy version used for the evaluation. This should always be "2012-10-17"
   *
   * @property version
   * @type {String}
   * @default "2012-10-17"
   */
  private version = "2012-10-17";
  private pathRegex = new RegExp("^[/.a-zA-Z0-9-*]+$");
  private allowMethods: MethodConfig[] = [];
  private denyMethods: MethodConfig[] = [];

  constructor(
    /**
     * The principal used for the policy, this should be a unique identifier for
     * the end user.
     *
     * @property principalId
     * @type {String}
     */
    private principalId: string,
    /**
     * The AWS account id the policy will be generated for. This is used to create
     * the method ARNs.
     *
     * @property awsAccountId
     * @type {String}
     */
    private awsAccountId: string,
    private restApiId: string,
    private region: string,
    private stage: string
  ) {}

  /**
   * Returns an empty statement object prepopulated with the correct action and the
   * desired effect.
   *
   * @method getEmptyStatement
   * @param {String} The effect of the statement, this can be "Allow" or "Deny"
   * @return {Object} An empty statement object with the Action, Effect, and Resource
   *                  properties prepopulated.
   */
  public getEmptyStatement(effect: string): Statement {
    effect = effect.substring(0, 1).toUpperCase() + effect.substring(1, effect.length).toLowerCase();
    const statement: Statement = {
      Action: "execute-api:Invoke",
      Effect: effect,
      Resource: [],
    };

    return statement;
  }

  public addMethod(effect: "allow" | "deny", verb: HttpVerb, resource: string, conditions: ConditionBlock): void {
    if (!this.pathRegex.test(resource)) {
      throw new Error("Invalid resource path: " + resource + ". Path should match " + this.pathRegex);
    }

    var cleanedResource = resource;
    if (resource.substring(0, 1) == "/") {
      cleanedResource = resource.substring(1, resource.length);
    }
    var resourceArn =
      "arn:aws:execute-api:" + this.region + ":" + this.awsAccountId + ":" + this.restApiId + "/" + this.stage + "/" + verb + "/" + cleanedResource;

    if (effect.toLowerCase() == "allow") {
      this.allowMethods.push({
        resourceArn: resourceArn,
        conditions: conditions,
      });
    } else if (effect.toLowerCase() == "deny") {
      this.denyMethods.push({
        resourceArn: resourceArn,
        conditions: conditions,
      });
    }
  }

  /**
   * This function loops over an array of objects containing a resourceArn and
   * conditions statement and generates the array of statements for the policy.
   *
   * @method getStatementsForEffect
   * @param {String} The desired effect. This can be "Allow" or "Deny"
   * @param {Array} An array of method objects containing the ARN of the resource
   *                and the conditions for the policy
   * @return {Array} an array of formatted statements for the policy.
   */
  getStatementsForEffect(effect: string, methods: MethodConfig[]): Statement[] {
    const statements: Statement[] = [];

    if (methods.length > 0) {
      const statement = this.getEmptyStatement(effect);

      for (let i = 0; i < methods.length; i++) {
        const curMethod: MethodConfig = methods[i];
        if (curMethod.conditions === null || Object.keys(curMethod.conditions).length === 0) {
          (<string[]>(<MaybeStatementResource>statement).Resource).push(curMethod.resourceArn);
        } else {
          const conditionalStatement = this.getEmptyStatement(effect);
          (<string[]>(<MaybeStatementResource>statement).Resource).push(curMethod.resourceArn);
          conditionalStatement.Condition = curMethod.conditions;
          statements.push(conditionalStatement);
        }
      }

      if ((<MaybeStatementResource>statement).Resource !== null && (<MaybeStatementResource>statement).Resource.length > 0) {
        statements.push(statement);
      }
    }

    return statements;
  }

  /**
   * Adds an allow "*" statement to the policy.
   *
   * @method allowAllMethods
   */
  public allowAllMethods(): void {
    this.addMethod("allow", HttpVerb.ALL, "*", null);
  }

  /**
   * Adds a deny "*" statement to the policy.
   *
   * @method denyAllMethods
   */
  public denyAllMethods(): void {
    this.addMethod("deny", HttpVerb.ALL, "*", null);
  }

  /**
   * Adds an API Gateway method (Http verb + Resource path) to the list of allowed
   * methods for the policy
   *
   * @method allowMethod
   * @param {String} The HTTP verb for the method, this should ideally come from the
   *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
   * @param {string} The resource path. For example "/pets"
   * @return {void}
   */
  public allowMethod(verb: HttpVerb, resource: string): void {
    this.addMethod("allow", verb, resource, null);
  }

  /**
   * Adds an API Gateway method (Http verb + Resource path) to the list of denied
   * methods for the policy
   *
   * @method denyMethod
   * @param {String} The HTTP verb for the method, this should ideally come from the
   *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
   * @param {string} The resource path. For example "/pets"
   * @return {void}
   */
  public denyMethod(verb: HttpVerb, resource: string): void {
    this.addMethod("deny", verb, resource, null);
  }

  /**
   * Adds an API Gateway method (Http verb + Resource path) to the list of allowed
   * methods and includes a condition for the policy statement. More on AWS policy
   * conditions here: http://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html#Condition
   *
   * @method allowMethodWithConditions
   * @param {String} The HTTP verb for the method, this should ideally come from the
   *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
   * @param {string} The resource path. For example "/pets"
   * @param {Object} The conditions object in the format specified by the AWS docs
   * @return {void}
   */
  public allowMethodWithConditions(verb: HttpVerb, resource: string, conditions: ConditionBlock) {
    this.addMethod("allow", verb, resource, conditions);
  }

  /**
   * Adds an API Gateway method (Http verb + Resource path) to the list of denied
   * methods and includes a condition for the policy statement. More on AWS policy
   * conditions here: http://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements.html#Condition
   *
   * @method denyMethodWithConditions
   * @param {String} The HTTP verb for the method, this should ideally come from the
   *                 AuthPolicy.HttpVerb object to avoid spelling mistakes
   * @param {string} The resource path. For example "/pets"
   * @param {Object} The conditions object in the format specified by the AWS docs
   * @return {void}
   */
  public denyMethodWithConditions(verb: HttpVerb, resource: string, conditions: ConditionBlock): void {
    this.addMethod("deny", verb, resource, conditions);
  }

  /**
   * Generates the policy document based on the internal lists of allowed and denied
   * conditions. This will generate a policy with two main statements for the effect:
   * one statement for Allow and one statement for Deny.
   * Methods that includes conditions will have their own statement in the policy.
   *
   * @method build
   * @return {Object} The policy object that can be serialized to JSON.
   */
  build(): APIGatewayAuthorizerResult {
    if ((!this.allowMethods || this.allowMethods.length === 0) && (!this.denyMethods || this.denyMethods.length === 0)) {
      throw new Error("No statements defined for the policy");
    }

    let statement: Statement[] = [];

    statement = statement.concat(this.getStatementsForEffect("Allow", this.allowMethods));
    statement = statement.concat(this.getStatementsForEffect("Deny", this.denyMethods));

    const policy: APIGatewayAuthorizerResult = {
      principalId: this.principalId,
      policyDocument: {
        Version: this.version,
        Statement: statement,
      },
    };

    return policy;
  }
}

interface MethodConfig {
  resourceArn: string;
  conditions: ConditionBlock;
}

enum HttpVerb {
  GET = "GET",
  POST = "POST",
  PUT = "PUT",
  PATCH = "PATCH",
  HEAD = "HEAD",
  DELETE = "DELETE",
  OPTIONS = "OPTIONS",
  ALL = "*",
}
