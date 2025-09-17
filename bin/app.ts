#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CrossAccountAccessStack } from '../src/index.js';

const app = new cdk.App();

// Example usage - replace with your actual configuration
new CrossAccountAccessStack(app, 'CrossAccountAccessStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
  
  // Required properties - update these values for your use case
  externalAccountId: '123456789012', // Replace with the external AWS account ID
  externalPrincipalArns: [
    'arn:aws:iam::123456789012:user/ExternalUser',
    'arn:aws:iam::123456789012:role/ExternalRole'
  ], // Replace with actual principal ARNs from external account
  s3BucketArns: [
    'arn:aws:s3:::my-shared-bucket',
    'arn:aws:s3:::my-shared-bucket/*'
  ], // Replace with your S3 bucket ARNs
  
  // Optional properties with defaults
  roleNamePrefix: 'cross-account-s3-access',
  roleDescription: 'Cross-account role for S3 access with external ID rotation',
  allowedS3Actions: [
    's3:GetObject',
    's3:ListBucket',
    's3:GetObjectVersion'
  ],
  externalIdRotationDays: 30,
});

// You can create multiple stacks for different external accounts or use cases
// new CrossAccountAccessStack(app, 'PartnerAccessStack', {
//   env: {
//     account: process.env.CDK_DEFAULT_ACCOUNT,
//     region: process.env.CDK_DEFAULT_REGION,
//   },
//   externalAccountId: '987654321098',
//   externalPrincipalArns: [
//     'arn:aws:iam::987654321098:role/PartnerRole'
//   ],
//   s3BucketArns: [
//     'arn:aws:s3:::partner-data-bucket',
//     'arn:aws:s3:::partner-data-bucket/*'
//   ],
//   roleNamePrefix: 'partner-s3-access',
//   allowedS3Actions: ['s3:GetObject', 's3:ListBucket'],
// });