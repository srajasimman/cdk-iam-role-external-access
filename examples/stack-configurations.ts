import * as cdk from "aws-cdk-lib";
import { CrossAccountAccessStack } from "../src/index";

/**
 * Example configurations for different use cases
 */

// Example 1: Basic Partner Integration
export function createPartnerIntegrationStack(
  app: cdk.App,
): CrossAccountAccessStack {
  return new CrossAccountAccessStack(app, "PartnerIntegrationStack", {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },

    // Partner AWS account details
    externalAccountId: "987654321098",
    externalPrincipalArns: [
      "arn:aws:iam::987654321098:role/PartnerDataProcessingRole",
      "arn:aws:iam::987654321098:user/PartnerAnalyst",
    ],

    // Shared data buckets
    s3BucketArns: [
      "arn:aws:s3:::partner-shared-data",
      "arn:aws:s3:::partner-shared-data/*",
      "arn:aws:s3:::partner-reports",
      "arn:aws:s3:::partner-reports/*",
    ],

    // Configuration
    roleNamePrefix: "partner-data-access",
    roleDescription:
      "Cross-account access for partner data processing and analytics",
    allowedS3Actions: [
      "s3:GetObject",
      "s3:ListBucket",
      "s3:GetObjectVersion",
      "s3:GetObjectMetadata",
    ],
    externalIdRotationDays: 30,
  });
}

// Example 2: Vendor Analytics Access
export function createVendorAnalyticsStack(
  app: cdk.App,
): CrossAccountAccessStack {
  return new CrossAccountAccessStack(app, "VendorAnalyticsStack", {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },

    // Vendor AWS account details
    externalAccountId: "555666777888",
    externalPrincipalArns: [
      "arn:aws:iam::555666777888:role/AnalyticsServiceRole",
    ],

    // Analytics data bucket (read-only)
    s3BucketArns: [
      "arn:aws:s3:::analytics-export-data",
      "arn:aws:s3:::analytics-export-data/*",
    ],

    // Minimal read-only access
    roleNamePrefix: "vendor-analytics-readonly",
    roleDescription: "Read-only access for external analytics vendor",
    allowedS3Actions: ["s3:GetObject", "s3:ListBucket"],
    externalIdRotationDays: 14, // More frequent rotation for external vendors
  });
}

// Example 3: Customer Data Export
export function createCustomerDataExportStack(
  app: cdk.App,
): CrossAccountAccessStack {
  return new CrossAccountAccessStack(app, "CustomerDataExportStack", {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },

    // Customer AWS account details
    externalAccountId: "111222333444",
    externalPrincipalArns: [
      "arn:aws:iam::111222333444:role/DataExportRole",
      "arn:aws:iam::111222333444:user/DataAdministrator",
    ],

    // Customer-specific export bucket
    s3BucketArns: [
      "arn:aws:s3:::customer-data-export-111222333444",
      "arn:aws:s3:::customer-data-export-111222333444/*",
    ],

    // Full access to their export bucket
    roleNamePrefix: "customer-data-export",
    roleDescription: "Customer access to their data export bucket",
    allowedS3Actions: [
      "s3:GetObject",
      "s3:ListBucket",
      "s3:GetObjectVersion",
      "s3:GetObjectMetadata",
      "s3:GetBucketLocation",
      "s3:ListBucketVersions",
    ],
    externalIdRotationDays: 45, // Less frequent for customer accounts
  });
}

// Example 4: Development/Testing Environment
export function createDevTestingStack(app: cdk.App): CrossAccountAccessStack {
  return new CrossAccountAccessStack(app, "DevTestingStack", {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION,
    },

    // Development AWS account
    externalAccountId: "999888777666",
    externalPrincipalArns: [
      "arn:aws:iam::999888777666:role/DeveloperRole",
      "arn:aws:iam::999888777666:user/TestUser1",
      "arn:aws:iam::999888777666:user/TestUser2",
    ],

    // Test data buckets
    s3BucketArns: [
      "arn:aws:s3:::dev-test-data",
      "arn:aws:s3:::dev-test-data/*",
      "arn:aws:s3:::integration-test-files",
      "arn:aws:s3:::integration-test-files/*",
    ],

    // Extended permissions for development
    roleNamePrefix: "dev-testing-access",
    roleDescription: "Development and testing cross-account access",
    allowedS3Actions: [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetObjectVersion",
      "s3:DeleteObjectVersion",
    ],
    externalIdRotationDays: 7, // Frequent rotation for dev environment
  });
}

// Configuration helper function
export function getStackConfiguration(
  stackType: "partner" | "vendor" | "customer" | "dev",
): any {
  const configurations = {
    partner: {
      externalAccountId: "987654321098",
      roleNamePrefix: "partner-integration",
      externalIdRotationDays: 30,
    },
    vendor: {
      externalAccountId: "555666777888",
      roleNamePrefix: "vendor-analytics",
      externalIdRotationDays: 14,
    },
    customer: {
      externalAccountId: "111222333444",
      roleNamePrefix: "customer-export",
      externalIdRotationDays: 45,
    },
    dev: {
      externalAccountId: "999888777666",
      roleNamePrefix: "dev-testing",
      externalIdRotationDays: 7,
    },
  };

  return configurations[stackType];
}

// Environment-specific configurations
export const environments = {
  development: {
    account: "123456789012",
    region: "us-east-1",
  },
  staging: {
    account: "234567890123",
    region: "us-east-1",
  },
  production: {
    account: "345678901234",
    region: "us-east-1",
  },
};
