/**
 * Example usage of DynamoDBOptimized client
 * 
 * This file demonstrates how to use the DynamoDB client wrapper in your application
 */

import { DynamoDBOptimized } from './DynamoDBOptimized';
import {
  QueryEventuallyConsistentParams,
  BatchGetParams,
  BatchWriteParams,
  CreateGSIAttributesParams,
  UpdateParams,
  GetParams,
  PutParams,
  DeleteParams,
  SoftDeleteParams,
} from './types';

// Initialize the client
const dynamoDB = new DynamoDBOptimized({
  tableName: process.env.DYNAMODB_TABLE_NAME || 'my-table',
  region: 'us-east-1',
  maxRetries: 3,
  retryDelay: 100,
});

// Example 1: Query with eventually consistent reads
async function queryUsers() {
  const params: QueryEventuallyConsistentParams = {
    keyConditionExpression: 'userId = :userId',
    expressionAttributeValues: {
      ':userId': 'user-123',
      ':status': 'ACTIVE',
    },
    filterExpression: 'status = :status',
    projectionExpression: 'userId, name, email',
  };

  const result = await dynamoDB.queryEventuallyConsistent(params);
  console.log(`Found ${result.count} users`);
  return result.data;
}

// Example 2: Batch get multiple items
async function getUsersInBatch(userIds: string[]) {
  const keys = userIds.map(id => ({ userId: id }));
  
  const params: BatchGetParams = {
    keys,
    consistentRead: false, // Eventually consistent for cost savings
  };

  const result = await dynamoDB.batchGetOptimized(params);
  return result.data;
}

// Example 3: Batch write (mix of puts and deletes)
async function batchWriteUsers() {
  const params: BatchWriteParams = {
    items: [
      {
        type: 'put',
        item: { userId: 'user-1', name: 'John', email: 'john@example.com' },
      },
      {
        type: 'put',
        item: { userId: 'user-2', name: 'Jane', email: 'jane@example.com' },
      },
      {
        type: 'delete',
        key: { userId: 'user-3' },
      },
    ],
  };

  const result = await dynamoDB.batchWriteOptimized(params);
  console.log('Batch write completed');
  return result;
}

// Example 4: Create item with sparse GSI
async function createPremiumUser() {
  const user = {
    userId: 'user-123',
    name: 'Premium User',
    status: 'premium',
    tier: 'gold',
  };

  // Add GSI attributes conditionally
  const gsiParams: CreateGSIAttributesParams = {
    item: user,
    gsiConfig: [
      {
        partitionKey: 'gsi_status',
        sortKey: 'gsi_tier',
        condition: (item) => item.status === 'premium',
        partitionKeyValue: (item) => item.status,
        sortKeyValue: (item) => item.tier,
      },
    ],
  };

  const itemWithGSI = dynamoDB.createGSIAttributesConditionally(gsiParams);

  const putParams: PutParams = {
    item: itemWithGSI,
  };

  return dynamoDB.put(putParams);
}

// Example 5: Update user
async function updateUser(userId: string, updates: Record<string, any>) {
  const params: UpdateParams = {
    key: { userId },
    updates,
    conditionExpression: 'attribute_exists(userId)',
    returnValues: 'ALL_NEW',
  };

  const result = await dynamoDB.update(params);
  return result.data;
}

// Example 6: Soft delete
async function softDeleteUser(userId: string, adminId: string) {
  const params: SoftDeleteParams = {
    key: { userId },
    deletedBy: adminId,
  };

  const result = await dynamoDB.softDelete(params);
  return result.data;
}

// Example 7: Get single item with projection
async function getUser(userId: string) {
  const { projectionExpression, expressionAttributeNames } = 
    dynamoDB.buildProjectionExpression({
      attributes: ['userId', 'name', 'email', 'createdAt'],
    });

  const params: GetParams = {
    key: { userId },
    projectionExpression,
    expressionAttributeNames,
    consistentRead: false,
  };

  const result = await dynamoDB.get(params);
  return result.data;
}

// Example 8: Hard delete
async function hardDeleteUser(userId: string) {
  const params: DeleteParams = {
    key: { userId },
    conditionExpression: 'attribute_exists(userId)',
    returnValues: 'ALL_OLD',
  };

  const result = await dynamoDB.delete(params);
  return result.data;
}

// Export all example functions
export {
  queryUsers,
  getUsersInBatch,
  batchWriteUsers,
  createPremiumUser,
  updateUser,
  softDeleteUser,
  getUser,
  hardDeleteUser,
};
