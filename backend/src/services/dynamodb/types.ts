/**
 * TypeScript interfaces for DynamoDB operations
 */

import { ReturnConsumedCapacity } from '@aws-sdk/client-dynamodb';

/**
 * Base query parameters for eventually consistent reads
 */
export interface QueryEventuallyConsistentParams {
  indexName?: string;
  keyConditionExpression: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  filterExpression?: string;
  projectionExpression?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, any>;
  scanIndexForward?: boolean;
}

/**
 * Parameters for batch get operations
 */
export interface BatchGetParams {
  keys: Record<string, any>[];
  projectionExpression?: string;
  consistentRead?: boolean;
}

/**
 * Parameters for batch write operations
 */
export interface BatchWriteParams {
  items: BatchWriteItem[];
}

export interface BatchWriteItem {
  type: 'put' | 'delete';
  item?: Record<string, any>;
  key?: Record<string, any>;
}

/**
 * Parameters for creating GSI attributes conditionally
 */
export interface CreateGSIAttributesParams {
  item: Record<string, any>;
  gsiConfig: GSIConfig[];
}

export interface GSIConfig {
  gsiName: string;
  partitionKey: string;
  sortKey?: string;
  condition: (item: Record<string, any>) => boolean;
  partitionKeyValue: (item: Record<string, any>) => any;
  sortKeyValue?: (item: Record<string, any>) => any;
}

/**
 * Parameters for building projection expressions
 */
export interface BuildProjectionParams {
  attributes: string[];
}

/**
 * Parameters for update operations
 */
export interface UpdateParams {
  key: Record<string, any>;
  updates: Record<string, any>;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  returnValues?: 'NONE' | 'ALL_OLD' | 'UPDATED_OLD' | 'ALL_NEW' | 'UPDATED_NEW';
}

/**
 * Parameters for soft delete operations
 */
export interface SoftDeleteParams {
  key: Record<string, any>;
  deletedAtField?: string;
  deletedByField?: string;
  deletedBy?: string;
}

/**
 * Parameters for get operations
 */
export interface GetParams {
  key: Record<string, any>;
  projectionExpression?: string;
  consistentRead?: boolean;
}

/**
 * Parameters for put operations
 */
export interface PutParams {
  item: Record<string, any>;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  returnValues?: 'NONE' | 'ALL_OLD';
}

/**
 * Parameters for delete operations
 */
export interface DeleteParams {
  key: Record<string, any>;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, any>;
  returnValues?: 'NONE' | 'ALL_OLD';
}

/**
 * Response wrapper for operations with consumed capacity
 */
export interface DynamoDBResponse<T> {
  data: T;
  consumedCapacity?: {
    tableName?: string;
    capacityUnits?: number;
    readCapacityUnits?: number;
    writeCapacityUnits?: number;
  };
}

/**
 * Query response with pagination
 */
export interface QueryResponse<T> extends DynamoDBResponse<T[]> {
  lastEvaluatedKey?: Record<string, any>;
  count: number;
  scannedCount: number;
}

/**
 * Batch get response
 */
export interface BatchGetResponse<T> extends DynamoDBResponse<T[]> {
  unprocessedKeys?: Record<string, any>[];
}

/**
 * Batch write response
 */
export interface BatchWriteResponse extends DynamoDBResponse<void> {
  unprocessedItems?: BatchWriteItem[];
}

/**
 * Configuration for DynamoDB client
 */
export interface DynamoDBConfig {
  tableName: string;
  region?: string;
  endpoint?: string;
  maxRetries?: number;
  retryDelay?: number;
  returnConsumedCapacity?: ReturnConsumedCapacity;
}
