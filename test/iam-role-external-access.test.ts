import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { CrossAccountAccessStack } from "../lib/index";

describe("CrossAccountAccessStack", () => {
  const defaultProps = {
    externalAccountId: "123456789012",
    externalPrincipalArns: [
      "arn:aws:iam::123456789012:user/TestUser",
      "arn:aws:iam::123456789012:role/TestRole",
    ],
    s3BucketArns: ["arn:aws:s3:::test-bucket", "arn:aws:s3:::test-bucket/*"],
  };

  describe("Stack Creation", () => {
    test("should create stack without errors", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      expect(stack).toBeDefined();
    });

    test("should have correct stack properties", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      expect(stack.crossAccountRole).toBeDefined();
      expect(stack.externalIdSecret).toBeDefined();
      expect(stack.rotationFunction).toBeDefined();
    });
  });

  describe("IAM Role", () => {
    test("should create cross-account IAM role", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        Description:
          "Cross-account role for S3 access with external ID rotation",
        MaxSessionDuration: 3600, // 1 hour in seconds
      });
    });

    test("should have deny statements for security conditions", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            {
              Effect: "Deny",
              Principal: {
                AWS: "*",
              },
              Action: "sts:AssumeRole",
              Condition: {
                Bool: {
                  "aws:SecureTransport": "false",
                },
              },
            },
          ]),
        },
      });
    });
  });

  describe("S3 Policy", () => {
    test("should create S3 access policy", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyName: "S3AccessPolicy",
        PolicyDocument: {
          Statement: [
            {
              Effect: "Allow",
              Action: ["s3:GetObject", "s3:ListBucket"],
              Resource: [
                "arn:aws:s3:::test-bucket",
                "arn:aws:s3:::test-bucket/*",
              ],
              Condition: {
                Bool: {
                  "aws:SecureTransport": "true",
                },
                StringEquals: {
                  "s3:x-amz-server-side-encryption": "AES256",
                },
              },
            },
          ],
        },
      });
    });

    test("should allow custom S3 actions", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "CustomStack", {
        ...defaultProps,
        allowedS3Actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: [
            {
              Action: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
            },
          ],
        },
      });
    });
  });

  describe("Secrets Manager", () => {
    test("should create external ID secret", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SecretsManager::Secret", {
        Description:
          "External ID for cross-account role assumption with automatic rotation",
        GenerateSecretString: {
          SecretStringTemplate: "{}",
          GenerateStringKey: "externalId",
          ExcludeCharacters: " \"\\'",
          IncludeSpace: false,
          PasswordLength: 32,
          RequireEachIncludedType: true,
        },
      });
    });

    test("should create rotation schedule", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SecretsManager::RotationSchedule", {
        RotationRules: {
          ScheduleExpression: "rate(30 days)",
        },
      });
    });

    test("should allow custom rotation schedule", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "CustomRotationStack", {
        ...defaultProps,
        externalIdRotationDays: 14,
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::SecretsManager::RotationSchedule", {
        RotationRules: {
          ScheduleExpression: "rate(14 days)",
        },
      });
    });
  });

  describe("Lambda Function", () => {
    test("should create rotation Lambda function", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      // Check that we have a Lambda function with correct timeout
      template.hasResourceProperties("AWS::Lambda::Function", {
        Timeout: 300, // 5 minutes
      });

      // Check that we have either the JavaScript or Python version
      // (depends on whether we're in test mode with TypeScript or production mode with JavaScript)
      const resources = template.toJSON().Resources;
      const lambdaFunctions = Object.values(resources).filter(
        (resource: any) => resource.Type === "AWS::Lambda::Function",
      );

      const rotationFunction = lambdaFunctions.find(
        (func: any) => func.Properties.Timeout === 300,
      ) as any;

      expect(rotationFunction).toBeDefined();
      expect(["nodejs20.x", "python3.11"]).toContain(
        rotationFunction.Properties.Runtime,
      );
      expect(["externalIdRotation.handler", "index.lambda_handler"]).toContain(
        rotationFunction.Properties.Handler,
      );
    });

    test("should have correct IAM permissions for rotation function", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      // Check that there's a policy for the rotation function with the required permissions
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyName: "RotationFunctionRoleDefaultPolicyF80073BA",
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Effect: "Allow",
              Action: [
                "secretsmanager:DescribeSecret",
                "secretsmanager:GetSecretValue",
                "secretsmanager:PutSecretValue",
                "secretsmanager:UpdateSecretVersionStage",
              ],
              Resource: Match.anyValue(),
            },
          ]),
        },
      });
    });
  });

  describe("Stack Outputs", () => {
    test("should create all required outputs", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasOutput("CrossAccountRoleArn", {});
      template.hasOutput("CrossAccountRoleName", {});
      template.hasOutput("ExternalIdSecretArn", {});
      template.hasOutput("AssumeRoleInstructions", {});
    });

    test("should export outputs with correct names", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasOutput("CrossAccountRoleArn", {
        Export: {
          Name: "TestStack-RoleArn",
        },
      });
    });
  });

  describe("Input Validation", () => {
    test("should throw error for invalid account ID", () => {
      const app = new cdk.App();
      expect(() => {
        new CrossAccountAccessStack(app, "InvalidAccountStack", {
          ...defaultProps,
          externalAccountId: "invalid-account-id",
        });
      }).toThrow("externalAccountId must be a valid 12-digit AWS account ID");
    });

    test("should throw error for empty principal ARNs", () => {
      const app = new cdk.App();
      expect(() => {
        new CrossAccountAccessStack(app, "EmptyPrincipalsStack", {
          ...defaultProps,
          externalPrincipalArns: [],
        });
      }).toThrow(
        "externalPrincipalArns must contain at least one principal ARN",
      );
    });

    test("should throw error for invalid principal ARN", () => {
      const app = new cdk.App();
      expect(() => {
        new CrossAccountAccessStack(app, "InvalidPrincipalStack", {
          ...defaultProps,
          externalPrincipalArns: ["invalid-arn"],
        });
      }).toThrow(
        "externalPrincipalArns[0] must be a valid IAM ARN from the external account",
      );
    });

    test("should throw error for empty S3 bucket ARNs", () => {
      const app = new cdk.App();
      expect(() => {
        new CrossAccountAccessStack(app, "EmptyBucketsStack", {
          ...defaultProps,
          s3BucketArns: [],
        });
      }).toThrow("s3BucketArns must contain at least one S3 bucket ARN");
    });

    test("should throw error for invalid S3 bucket ARN", () => {
      const app = new cdk.App();
      expect(() => {
        new CrossAccountAccessStack(app, "InvalidBucketStack", {
          ...defaultProps,
          s3BucketArns: ["invalid-s3-arn"],
        });
      }).toThrow("s3BucketArns[0] must be a valid S3 bucket ARN");
    });
  });

  describe("Custom Configuration", () => {
    test("should use custom role description", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "CustomDescStack", {
        ...defaultProps,
        roleDescription: "My custom role description",
      });
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        Description: "My custom role description",
      });
    });
  });

  describe("Security Best Practices", () => {
    test("should enforce HTTPS in S3 policy", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: [
            {
              Condition: {
                Bool: {
                  "aws:SecureTransport": "true",
                },
              },
            },
          ],
        },
      });
    });

    test("should enforce server-side encryption", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: [
            {
              Condition: {
                StringEquals: {
                  "s3:x-amz-server-side-encryption": "AES256",
                },
              },
            },
          ],
        },
      });
    });

    test("should limit session duration to 1 hour", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        MaxSessionDuration: 3600,
      });
    });

    test("should add appropriate tags", () => {
      const app = new cdk.App();
      const stack = new CrossAccountAccessStack(app, "TestStack", defaultProps);
      const template = Template.fromStack(stack);

      template.hasResourceProperties("AWS::IAM::Role", {
        Tags: Match.arrayWith([
          {
            Key: "Purpose",
            Value: "CrossAccountS3Access",
          },
        ]),
      });
    });
  });
});

