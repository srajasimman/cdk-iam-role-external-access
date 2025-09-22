import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as path from "path";
import { Construct } from "constructs";

/**
 * Properties for the CrossAccountAccessStack
 */
export interface CrossAccountAccessStackProps extends cdk.StackProps {
  /**
   * External AWS Account ID that will assume the role
   */
  readonly externalAccountId: string;

  /**
   * List of principal ARNs from the external account allowed to assume the role
   * Example: ['arn:aws:iam::123456789012:user/ExternalUser', 'arn:aws:iam::123456789012:role/ExternalRole']
   */
  readonly externalPrincipalArns: string[];

  /**
   * Target S3 bucket ARN(s) that the role will have access to
   * Example: ['arn:aws:s3:::my-bucket', 'arn:aws:s3:::my-bucket/*']
   */
  readonly s3BucketArns: string[];

  /**
   * Role name prefix
   * @default 'cross-account-s3-access'
   */
  readonly roleNamePrefix?: string;

  /**
   * Role description
   * @default 'Cross-account role for S3 access with external ID rotation'
   */
  readonly roleDescription?: string;

  /**
   * Allowed S3 actions
   * @default ['s3:GetObject', 's3:ListBucket']
   */
  readonly allowedS3Actions?: string[];

  /**
   * External ID rotation schedule in days
   * @default 30
   */
  readonly externalIdRotationDays?: number;
}

/**
 * CDK Stack that creates a secure cross-account IAM Role with automatic external ID rotation
 * for accessing S3 bucket objects from an external AWS account.
 */
export class CrossAccountAccessStack extends cdk.Stack {
  /**
   * The IAM Role that can be assumed by external accounts
   */
  public readonly crossAccountRole: iam.Role;

  /**
   * The Secrets Manager secret containing the external ID
   */
  public readonly externalIdSecret: secretsmanager.Secret;

  /**
   * The Lambda function that handles external ID rotation
   */
  public readonly rotationFunction: lambda.Function;

  constructor(
    scope: Construct,
    id: string,
    props: CrossAccountAccessStackProps,
  ) {
    super(scope, id, props);

    // Validate required properties
    this.validateProps(props);

    const roleNamePrefix = props.roleNamePrefix ?? "cross-account-s3-access";
    const roleDescription =
      props.roleDescription ??
      "Cross-account role for S3 access with external ID rotation";
    const allowedS3Actions = props.allowedS3Actions ?? [
      "s3:GetObject",
      "s3:ListBucket",
    ];
    const rotationDays = props.externalIdRotationDays ?? 30;

    // Create the external ID secret with automatic rotation
    this.externalIdSecret = this.createExternalIdSecret(rotationDays);

    // Create the rotation Lambda function
    this.rotationFunction = this.createRotationFunction();

    // Set up automatic rotation
    this.setupSecretRotation(rotationDays);

    // Create the cross-account IAM role
    this.crossAccountRole = this.createCrossAccountRole(
      props.externalAccountId,
      props.externalPrincipalArns,
      props.s3BucketArns,
      allowedS3Actions,
      roleNamePrefix,
      roleDescription,
    );

    // Create stack outputs
    this.createStackOutputs();
  }

  /**
   * Validates the stack properties
   */
  private validateProps(props: CrossAccountAccessStackProps): void {
    if (!props.externalAccountId || !/^\d{12}$/.test(props.externalAccountId)) {
      throw new Error(
        "externalAccountId must be a valid 12-digit AWS account ID",
      );
    }

    if (
      !props.externalPrincipalArns ||
      props.externalPrincipalArns.length === 0
    ) {
      throw new Error(
        "externalPrincipalArns must contain at least one principal ARN",
      );
    }

    if (!props.s3BucketArns || props.s3BucketArns.length === 0) {
      throw new Error("s3BucketArns must contain at least one S3 bucket ARN");
    }

    // Validate principal ARNs format
    props.externalPrincipalArns.forEach((arn, index) => {
      if (
        !arn.startsWith("arn:aws:iam::") ||
        !arn.includes(props.externalAccountId)
      ) {
        throw new Error(
          `externalPrincipalArns[${index}] must be a valid IAM ARN from the external account ${props.externalAccountId}`,
        );
      }
    });

    // Validate S3 bucket ARNs format
    props.s3BucketArns.forEach((arn, index) => {
      if (!arn.startsWith("arn:aws:s3:::")) {
        throw new Error(`s3BucketArns[${index}] must be a valid S3 bucket ARN`);
      }
    });
  }

  /**
   * Creates the Secrets Manager secret for external ID with automatic rotation
   */
  private createExternalIdSecret(rotationDays: number): secretsmanager.Secret {
    return new secretsmanager.Secret(this, "ExternalIdSecret", {
      secretName: `cross-account-external-id-${this.stackName}`,
      description:
        "External ID for cross-account role assumption with automatic rotation",
      generateSecretString: {
        secretStringTemplate: "{}",
        generateStringKey: "externalId",
        excludeCharacters: " \"\\'",
        includeSpace: false,
        passwordLength: 32,
        requireEachIncludedType: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For development - use RETAIN for production
    });
  }

  /**
   * Creates the Lambda function for external ID rotation using TypeScript
   */
  private createRotationFunction(): lambda.Function {
    const rotationRole = new iam.Role(this, "RotationFunctionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
      inlinePolicies: {
        SecretsManagerRotation: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "secretsmanager:GetSecretValue",
                "secretsmanager:UpdateSecretVersionStage",
                "secretsmanager:PutSecretValue",
              ],
              resources: [this.externalIdSecret.secretArn],
            }),
          ],
        }),
      },
    });

    return new lambda.Function(this, "ExternalIdRotationFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      role: rotationRole,
      timeout: cdk.Duration.minutes(5),
      code: lambda.Code.fromAsset(
        path.join(__dirname, "../lambda/external-id-rotation-lambda"),
      ),
      description:
        "Lambda function to rotate external ID in Secrets Manager (TypeScript)",
      environment: {
        NODE_ENV: "production",
      },
      logGroup: new logs.LogGroup(this, "RotationFunctionLogGroup", {
        logGroupName: `/aws/lambda/${this.stackName}-ExternalIdRotationFunction`,
        retention: logs.RetentionDays.TWO_YEARS,
      }),
    });
  }

  /**
   * Sets up automatic rotation for the external ID secret
   */
  private setupSecretRotation(rotationDays: number): void {
    new secretsmanager.RotationSchedule(this, "ExternalIdRotationSchedule", {
      secret: this.externalIdSecret,
      rotationLambda: this.rotationFunction,
      automaticallyAfter: cdk.Duration.days(rotationDays),
    });
  }

  /**
   * Creates the cross-account IAM role with security best practices
   */
  private createCrossAccountRole(
    externalAccountId: string,
    externalPrincipalArns: string[],
    s3BucketArns: string[],
    allowedS3Actions: string[],
    roleNamePrefix: string,
    roleDescription: string,
  ): iam.Role {
    // Create the IAM role with external principals
    const role = new iam.Role(this, "CrossAccountRole", {
      roleName: `${roleNamePrefix}-${this.region}-${cdk.Aws.ACCOUNT_ID}`,
      description: roleDescription,
      assumedBy: new iam.CompositePrincipal(
        ...externalPrincipalArns.map((arn) => new iam.ArnPrincipal(arn)),
      ),
      maxSessionDuration: cdk.Duration.hours(1), // Limit session duration for security
    });

    // Add external ID condition to the role's trust policy
    role.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["sts:AssumeRole"],
        conditions: {
          StringNotEquals: {
            "sts:ExternalId": this.externalIdSecret
              .secretValueFromJson("externalId")
              .unsafeUnwrap(),
          },
        },
      }),
    );

    // Add secure transport condition
    role.assumeRolePolicy?.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["sts:AssumeRole"],
        conditions: {
          Bool: {
            "aws:SecureTransport": "false",
          },
        },
      }),
    );

    // Create S3 permission policy with least privilege
    const s3PolicyDocument = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: allowedS3Actions,
          resources: s3BucketArns,
          conditions: {
            Bool: {
              "aws:SecureTransport": "true", // Enforce HTTPS
            },
            StringEquals: {
              "s3:x-amz-server-side-encryption": "AES256", // Enforce encryption
            },
          },
        }),
      ],
    });

    // Attach the S3 policy to the role
    role.attachInlinePolicy(
      new iam.Policy(this, "CrossAccountS3Policy", {
        policyName: "S3AccessPolicy",
        document: s3PolicyDocument,
      }),
    );

    // Add tags for governance
    cdk.Tags.of(role).add("Purpose", "CrossAccountS3Access");
    cdk.Tags.of(role).add("ExternalAccount", externalAccountId);
    cdk.Tags.of(role).add("CreatedBy", "CDK");

    return role;
  }

  /**
   * Creates stack outputs
   */
  private createStackOutputs(): void {
    new cdk.CfnOutput(this, "CrossAccountRoleArn", {
      value: this.crossAccountRole.roleArn,
      description: "ARN of the cross-account IAM role",
      exportName: `${this.stackName}-RoleArn`,
    });

    new cdk.CfnOutput(this, "CrossAccountRoleName", {
      value: this.crossAccountRole.roleName,
      description: "Name of the cross-account IAM role",
      exportName: `${this.stackName}-RoleName`,
    });

    new cdk.CfnOutput(this, "ExternalIdSecretArn", {
      value: this.externalIdSecret.secretArn,
      description:
        "ARN of the Secrets Manager secret containing the external ID",
      exportName: `${this.stackName}-ExternalIdSecretArn`,
    });

    new cdk.CfnOutput(this, "AssumeRoleInstructions", {
      value: JSON.stringify({
        roleArn: this.crossAccountRole.roleArn,
        externalIdSecretArn: this.externalIdSecret.secretArn,
        awsCliExample: `aws sts assume-role --role-arn ${this.crossAccountRole.roleArn} --role-session-name CrossAccountAccess --external-id $(aws secretsmanager get-secret-value --secret-id ${this.externalIdSecret.secretArn} --query SecretString --output text | jq -r .externalId)`,
        sdkExample:
          "Use the external ID from Secrets Manager when calling AssumeRole",
      }),
      description: "Instructions for assuming the cross-account role",
      exportName: `${this.stackName}-Instructions`,
    });
  }
}
