# Cross-Account IAM Role for S3 Access with External ID Rotation

This CDK project creates a secure cross-account IAM role that allows specific users from an external AWS account to access S3 bucket objects. The solution implements AWS security best practices including automatic external ID rotation via AWS Secrets Manager.

## Architecture Overview

The stack creates:

1. **Cross-Account IAM Role** - A role that can be assumed by external AWS accounts with strict security controls
2. **External ID Secret** - An AWS Secrets Manager secret containing a randomly generated external ID
3. **TypeScript Rotation Lambda** - Automatically rotates the external ID every 30 days (configurable)
4. **S3 Permissions Policy** - Least-privilege access to specified S3 buckets
5. **Security Controls** - Enforces encryption in transit, external ID validation, and session duration limits

## Security Features

- ✅ **External ID Rotation**: Automatic 30-day rotation via AWS Secrets Manager with TypeScript Lambda
- ✅ **Least Privilege**: Scoped permissions to specific S3 buckets and actions
- ✅ **Encryption Enforcement**: Requires HTTPS and server-side encryption
- ✅ **Session Limits**: Maximum 1-hour session duration
- ✅ **Principal Validation**: Only specified external principals can assume the role
- ✅ **Trust Policy Conditions**: Multiple layers of security validation
- ✅ **Type Safety**: TypeScript implementation prevents runtime errors
- ✅ **Modern Runtime**: Node.js 20.x Lambda runtime with enhanced performance

## Technology Stack

- **AWS CDK v2.214.0**: Infrastructure as Code with TypeScript
- **TypeScript 5.6.3**: Full type safety and modern JavaScript features
- **Node.js 20.x**: Latest LTS runtime for Lambda functions
- **AWS SDK v3**: Modern AWS SDK with tree-shaking and optimized imports
- **Jest**: Comprehensive unit testing with 23 test cases
- **pnpm**: Fast, space-efficient package management

## Quick Start

### Prerequisites

- AWS CDK v2 installed (`npm install -g aws-cdk`)
- AWS CLI configured with appropriate permissions
- Node.js 20+ and pnpm (recommended) or npm

### Installation

1. Clone and install dependencies:
```bash
git clone <repository-url>
cd cdk-iam-role-external-access
pnpm install  # or npm install
```

2. Update configuration in `bin/app.ts`:
```typescript
new CrossAccountAccessStack(app, 'CrossAccountAccessStack', {
  // REQUIRED: Replace with actual values
  externalAccountId: '123456789012', // External AWS account ID
  externalPrincipalArns: [
    'arn:aws:iam::123456789012:user/ExternalUser',
    'arn:aws:iam::123456789012:role/ExternalRole'
  ],
  s3BucketArns: [
    'arn:aws:s3:::my-shared-bucket',
    'arn:aws:s3:::my-shared-bucket/*'
  ],
  
  // OPTIONAL: Customize as needed
  roleNamePrefix: 'cross-account-s3-access',
  allowedS3Actions: ['s3:GetObject', 's3:ListBucket'],
  externalIdRotationDays: 30,
});
```

3. Deploy the stack:
```bash
# Build the TypeScript project and Lambda function
pnpm run build

# Bootstrap CDK (if not already done)
cdk bootstrap

# Deploy to AWS (uses compiled TypeScript)
pnpm run deploy

# Or deploy manually
CDK_PROD=1 cdk deploy
```

## TypeScript Lambda Function

The external ID rotation is handled by a TypeScript Lambda function (`src/Lambda/externalIdRotation.ts`) that provides:

### Key Features
- **Type Safety**: Full TypeScript typing for AWS SDK calls and Lambda events
- **Enhanced Error Handling**: Type assertions and comprehensive validation
- **Modern AWS SDK**: Uses AWS SDK v3 with tree-shaking for optimal bundle size
- **Cryptographic Security**: Secure random external ID generation using Node.js crypto
- **Four-Step Rotation**: Implements AWS Secrets Manager rotation best practices
  1. `createSecret` - Generate and store new external ID as AWSPENDING
  2. `setSecret` - Validate secret configuration (no-op for external IDs)
  3. `testSecret` - Validate new external ID meets security requirements
  4. `finishSecret` - Promote new external ID to AWSCURRENT

### Type Definitions
```typescript
interface RotationEvent {
    SecretId: string;
    ClientRequestToken: string;
    Step: 'createSecret' | 'setSecret' | 'testSecret' | 'finishSecret';
    PreviousVersionId?: string;
}

export const handler: Handler<RotationEvent, RotationResponse> = async (
    event: RotationEvent,
    context: Context
): Promise<RotationResponse> => {
    // Type-safe implementation
};
```

## Configuration Options

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `externalAccountId` | string | 12-digit external AWS account ID |
| `externalPrincipalArns` | string[] | IAM principal ARNs from external account |
| `s3BucketArns` | string[] | S3 bucket ARNs to grant access to |

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `roleNamePrefix` | string | `'cross-account-s3-access'` | Prefix for the IAM role name |
| `roleDescription` | string | Auto-generated | Description for the IAM role |
| `allowedS3Actions` | string[] | `['s3:GetObject', 's3:ListBucket']` | S3 actions to allow |
| `externalIdRotationDays` | number | `30` | External ID rotation frequency |

## Usage Examples

### Example 1: Basic Setup
```typescript
new CrossAccountAccessStack(app, 'BasicCrossAccount', {
  externalAccountId: '123456789012',
  externalPrincipalArns: ['arn:aws:iam::123456789012:user/DataAnalyst'],
  s3BucketArns: ['arn:aws:s3:::analytics-data', 'arn:aws:s3:::analytics-data/*'],
});
```

### Example 2: Partner Integration
```typescript
new CrossAccountAccessStack(app, 'PartnerIntegration', {
  externalAccountId: '987654321098',
  externalPrincipalArns: [
    'arn:aws:iam::987654321098:role/PartnerApplicationRole',
    'arn:aws:iam::987654321098:user/PartnerAdmin'
  ],
  s3BucketArns: [
    'arn:aws:s3:::partner-shared-files',
    'arn:aws:s3:::partner-shared-files/*',
    'arn:aws:s3:::partner-reports/*'
  ],
  allowedS3Actions: [
    's3:GetObject',
    's3:ListBucket',
    's3:GetObjectVersion',
    's3:GetObjectMetadata'
  ],
  roleNamePrefix: 'partner-integration',
  externalIdRotationDays: 14, // More frequent rotation
});
```

## Assuming the Role from External Account

After deployment, the external account can assume the role using:

### AWS CLI Example
```bash
# Get the current external ID
EXTERNAL_ID=$(aws secretsmanager get-secret-value \
  --secret-id <ExternalIdSecretArn> \
  --query SecretString --output text | jq -r .externalId)

# Assume the role
aws sts assume-role \
  --role-arn <CrossAccountRoleArn> \
  --role-session-name "CrossAccountSession" \
  --external-id $EXTERNAL_ID
```

### AWS SDK Example (Python)
```python
import boto3
import json

# Get the external ID from Secrets Manager
secrets_client = boto3.client('secretsmanager')
secret_response = secrets_client.get_secret_value(SecretId='<ExternalIdSecretArn>')
external_id = json.loads(secret_response['SecretString'])['externalId']

# Assume the role
sts_client = boto3.client('sts')
response = sts_client.assume_role(
    RoleArn='<CrossAccountRoleArn>',
    RoleSessionName='CrossAccountSession',
    ExternalId=external_id
)

# Use the temporary credentials
credentials = response['Credentials']
s3_client = boto3.client(
    's3',
    aws_access_key_id=credentials['AccessKeyId'],
    aws_secret_access_key=credentials['SecretAccessKey'],
    aws_session_token=credentials['SessionToken']
)
```

## Stack Outputs

The stack provides these outputs:

- `CrossAccountRoleArn` - ARN of the cross-account IAM role
- `CrossAccountRoleName` - Name of the IAM role
- `ExternalIdSecretArn` - ARN of the Secrets Manager secret
- `AssumeRoleInstructions` - JSON with usage instructions

## Development

### Build Process
- **Development**: Uses TypeScript source files directly
- **Production**: Compiles to JavaScript in `dist/` folder
- **Lambda**: TypeScript compiled to Node.js 20.x compatible JavaScript
- **Assets**: Automatic copying of Lambda dependencies

### Testing
```bash
# Run all tests (23 comprehensive unit tests)
pnpm test

# Run tests in watch mode
pnpm run test -- --watch

# Generate coverage report
pnpm run test -- --coverage
```

## Useful commands

* `pnpm run build`     compile TypeScript to js and prepare Lambda assets
* `pnpm run clean`     remove all build artifacts
* `pnpm run watch`     watch for changes and compile
* `pnpm run test`      perform the jest unit tests (23 tests)
* `pnpm run deploy`    build and deploy to AWS (production mode)
* `pnpm run synth`     build and synthesize CloudFormation template
* `pnpx cdk diff`      compare deployed stack with current state
* `pnpx cdk doctor`    check CDK environment and configuration

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.