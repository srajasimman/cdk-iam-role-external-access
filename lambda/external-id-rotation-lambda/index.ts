import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
  UpdateSecretVersionStageCommand,
} from "@aws-sdk/client-secrets-manager";
import { Handler, Context } from "aws-lambda";
import { randomBytes } from "crypto";

/**
 * AWS Lambda event for Secrets Manager rotation
 */
interface RotationEvent {
  SecretId: string;
  ClientRequestToken: string;
  Step: "createSecret" | "setSecret" | "testSecret" | "finishSecret";
  PreviousVersionId?: string;
}

/**
 * Secret data structure for external ID
 */
interface SecretData {
  externalId: string;
}

/**
 * Lambda response type
 */
interface RotationResponse {
  statusCode: number;
}

/**
 * AWS Lambda function to rotate external ID in Secrets Manager
 *
 * This function handles the four steps of AWS Secrets Manager rotation:
 * 1. createSecret - Generate a new external ID and store it as AWSPENDING
 * 2. setSecret - No additional setup needed for external ID
 * 3. testSecret - Validate the new external ID
 * 4. finishSecret - Activate the new external ID as AWSCURRENT
 */
export const handler: Handler<RotationEvent, RotationResponse> = async (
  event: RotationEvent,
  context: Context,
): Promise<RotationResponse> => {
  console.log("External ID rotation started", {
    secretId: event.SecretId,
    step: event.Step,
    clientRequestToken: event.ClientRequestToken,
    functionName: context.functionName,
    requestId: context.awsRequestId,
  });

  const client = new SecretsManagerClient({});
  const {
    SecretId: secretArn,
    ClientRequestToken: token,
    Step: step,
    PreviousVersionId,
  } = event;

  try {
    switch (step) {
      case "createSecret":
        await createSecret(client, secretArn, token);
        break;
      case "setSecret":
        await setSecret(client, secretArn, token);
        break;
      case "testSecret":
        await testSecret(client, secretArn, token);
        break;
      case "finishSecret":
        await finishSecret(client, secretArn, token, PreviousVersionId);
        break;
      default:
        throw new Error(`Invalid step: ${step}`);
    }

    console.log(`External ID rotation step '${step}' completed successfully`);
    return { statusCode: 200 };
  } catch (error) {
    console.error(`External ID rotation step '${step}' failed:`, error);
    throw error;
  }
};

/**
 * Step 1: Create a new external ID and store it as AWSPENDING
 */
async function createSecret(
  client: SecretsManagerClient,
  secretArn: string,
  token: string,
): Promise<void> {
  console.log("Creating new external ID...");

  // Generate a cryptographically secure random external ID
  const newExternalId = generateSecureExternalId();
  const newSecretValue = JSON.stringify({
    externalId: newExternalId,
  } as SecretData);

  const command = new PutSecretValueCommand({
    SecretId: secretArn,
    ClientRequestToken: token,
    SecretString: newSecretValue,
    VersionStages: ["AWSPENDING"],
  });

  await client.send(command);
  console.log("New external ID created and stored as AWSPENDING");
}

/**
 * Step 2: Set up the secret (no additional setup needed for external ID)
 */
async function setSecret(
  client: SecretsManagerClient,
  secretArn: string,
  token: string,
): Promise<void> {
  console.log("Setting secret (no additional setup needed for external ID)");
  // No additional setup required for external ID rotation
}

/**
 * Step 3: Test the new external ID
 */
async function testSecret(
  client: SecretsManagerClient,
  secretArn: string,
  token: string,
): Promise<void> {
  console.log("Testing new external ID...");

  const command = new GetSecretValueCommand({
    SecretId: secretArn,
    VersionId: token,
    VersionStage: "AWSPENDING",
  });

  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error("No secret string found in response");
  }

  const secretData: SecretData = JSON.parse(response.SecretString);

  // Validate the external ID
  validateExternalId(secretData.externalId);

  console.log("New external ID validation passed");
}

/**
 * Step 4: Finalize the rotation by making the new version current
 */
async function finishSecret(
  client: SecretsManagerClient,
  secretArn: string,
  token: string,
  previousVersionId?: string,
): Promise<void> {
  console.log("Finalizing external ID rotation...");

  // Move the new version to AWSCURRENT
  const moveToCurrentCommand = new UpdateSecretVersionStageCommand({
    SecretId: secretArn,
    VersionStage: "AWSCURRENT",
    MoveToVersionId: token,
    RemoveFromVersionId: previousVersionId,
  });

  await client.send(moveToCurrentCommand);

  // If there was a previous version, remove it from AWSPENDING
  if (previousVersionId) {
    const removePendingCommand = new UpdateSecretVersionStageCommand({
      SecretId: secretArn,
      VersionStage: "AWSPENDING",
      RemoveFromVersionId: previousVersionId,
    });

    await client.send(removePendingCommand);
  }

  console.log("External ID rotation completed successfully");
}

/**
 * Validate external ID according to AWS best practices
 */
function validateExternalId(externalId: unknown): asserts externalId is string {
  if (!externalId) {
    throw new Error("External ID not found in secret");
  }

  if (typeof externalId !== "string") {
    throw new Error("External ID must be a string");
  }

  if (externalId.length < 8) {
    throw new Error("External ID must be at least 8 characters long");
  }

  if (externalId.length > 1224) {
    throw new Error("External ID must be less than 1224 characters long");
  }

  // Validate character set (alphanumeric only for security)
  if (!/^[a-zA-Z0-9]+$/.test(externalId)) {
    throw new Error("External ID must contain only alphanumeric characters");
  }
}

/**
 * Generate a cryptographically secure external ID
 */
function generateSecureExternalId(): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const length = 32;
  let result = "";

  // Use crypto.randomBytes for cryptographically secure random generation
  const randomValues = randomBytes(length);

  for (let i = 0; i < length; i++) {
    result += characters.charAt(randomValues[i] % characters.length);
  }

  return result;
}

