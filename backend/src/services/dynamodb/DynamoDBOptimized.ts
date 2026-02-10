/**
 * DynamoDB Client Wrapper with Optimizations
 * 
 * This class provides an optimized DynamoDB client with features including:
 * - Eventually consistent reads for 50% cost savings
 * - Batch operations with automatic splitting
 * - Comprehensive logging for consumed capacity tracking
 * - Retry logic with exponential backoff
 * - Soft delete support
 * - Sparse GSI support
 */

import {
  DynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
  BatchWriteCommand,
  QueryCommandInput,
  GetCommandInput,
  PutCommandInput,
  UpdateCommandInput,
  DeleteCommandInput,
  BatchGetCommandInput,
  BatchWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  QueryEventuallyConsistentParams,
  BatchGetParams,
  BatchWriteParams,
  BatchWriteItem,
  CreateGSIAttributesParams,
  BuildProjectionParams,
  UpdateParams,
  SoftDeleteParams,
  GetParams,
  PutParams,
  DeleteParams,
  DynamoDBResponse,
  QueryResponse,
  BatchGetResponse,
  BatchWriteResponse,
  DynamoDBConfig,
} from './types';

// Export TABLE_NAME constant from environment variable
export const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'default-table';

/**
 * Logger for consumed capacity tracking
 */
class CapacityLogger {
  private static formatCapacity(capacity: any): string {
    if (!capacity) return 'N/A';
    return JSON.stringify({
      table: capacity.TableName,
      total: capacity.CapacityUnits,
      read: capacity.ReadCapacityUnits,
      write: capacity.WriteCapacityUnits,
    });
  }

  static logConsumedCapacity(operation: string, capacity: any): void {
    if (capacity) {
      console.log(`[DynamoDB] ${operation} - Consumed Capacity: ${this.formatCapacity(capacity)}`);
    }
  }

  static logBatchConsumedCapacity(operation: string, capacities: any[]): void {
    if (capacities && capacities.length > 0) {
      const totalCapacity = capacities.reduce((sum, cap) => {
        return sum + (cap.CapacityUnits || 0);
      }, 0);
      console.log(`[DynamoDB] ${operation} - Total Consumed Capacity: ${totalCapacity} units`);
      capacities.forEach(cap => {
        console.log(`  ${this.formatCapacity(cap)}`);
      });
    }
  }
}

/**
 * DynamoDB Optimized Client
 */
export class DynamoDBOptimized {
  private client: DynamoDBDocumentClient;
  private tableName: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(config: DynamoDBConfig) {
    this.tableName = config.tableName || TABLE_NAME;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 100; // Base delay in ms

    const dynamoConfig: DynamoDBClientConfig = {
      region: config.region || process.env.AWS_REGION || 'us-east-1',
    };

    if (config.endpoint) {
      dynamoConfig.endpoint = config.endpoint;
    }

    const ddbClient = new DynamoDBClient(dynamoConfig);

    // Configure DynamoDBDocumentClient with proper settings
    this.client = DynamoDBDocumentClient.from(ddbClient, {
      marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
      },
      unmarshallOptions: {
        wrapNumbers: false,
      },
    });
  }

  /**
   * Execute command with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    commandFn: () => Promise<T>,
    operation: string,
    attempt: number = 0
  ): Promise<T> {
    try {
      return await commandFn();
    } catch (error: any) {
      // Check if error is retryable
      const isRetryable = this.isRetryableError(error);
      
      if (isRetryable && attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff
        console.warn(
          `[DynamoDB] ${operation} failed (attempt ${attempt + 1}/${this.maxRetries}), retrying in ${delay}ms...`,
          error.message
        );
        await this.sleep(delay);
        return this.executeWithRetry(commandFn, operation, attempt + 1);
      }

      // Log error and rethrow
      console.error(`[DynamoDB] ${operation} failed:`, error);
      throw this.normalizeError(error);
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const retryableErrors = [
      'ProvisionedThroughputExceededException',
      'ThrottlingException',
      'RequestLimitExceeded',
      'InternalServerError',
      'ServiceUnavailable',
    ];

    return retryableErrors.some(errName => 
      error.name === errName || error.code === errName
    );
  }

  /**
   * Normalize AWS SDK errors
   */
  private normalizeError(error: any): Error {
    if (error.$metadata) {
      const err = new Error(error.message || 'DynamoDB operation failed');
      err.name = error.name || 'DynamoDBError';
      (err as any).code = error.name;
      (err as any).statusCode = error.$metadata.httpStatusCode;
      return err;
    }
    return error;
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Query with eventually consistent reads for 50% cost savings
   */
  async queryEventuallyConsistent<T = any>(
    params: QueryEventuallyConsistentParams
  ): Promise<QueryResponse<T>> {
    const input: QueryCommandInput = {
      TableName: this.tableName,
      ConsistentRead: false, // Eventually consistent for cost savings
      KeyConditionExpression: params.keyConditionExpression,
      ExpressionAttributeNames: params.expressionAttributeNames,
      ExpressionAttributeValues: params.expressionAttributeValues,
      FilterExpression: params.filterExpression,
      ProjectionExpression: params.projectionExpression,
      Limit: params.limit,
      ExclusiveStartKey: params.exclusiveStartKey,
      ScanIndexForward: params.scanIndexForward,
      IndexName: params.indexName,
      ReturnConsumedCapacity: 'TOTAL',
    };

    const result = await this.executeWithRetry(
      async () => this.client.send(new QueryCommand(input)),
      'queryEventuallyConsistent'
    );

    // Log consumed capacity
    CapacityLogger.logConsumedCapacity('Query (Eventually Consistent)', result.ConsumedCapacity);

    return {
      data: (result.Items || []) as T[],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count || 0,
      scannedCount: result.ScannedCount || 0,
      consumedCapacity: result.ConsumedCapacity ? {
        tableName: result.ConsumedCapacity.TableName,
        capacityUnits: result.ConsumedCapacity.CapacityUnits,
        readCapacityUnits: result.ConsumedCapacity.ReadCapacityUnits,
        writeCapacityUnits: result.ConsumedCapacity.WriteCapacityUnits,
      } : undefined,
    };
  }

  /**
   * Batch get items with automatic splitting (up to 100 items per batch)
   */
  async batchGetOptimized<T = any>(
    params: BatchGetParams
  ): Promise<BatchGetResponse<T>> {
    const maxBatchSize = 100;
    const batches: Record<string, any>[][] = [];
    
    // Split into batches of 100
    for (let i = 0; i < params.keys.length; i += maxBatchSize) {
      batches.push(params.keys.slice(i, i + maxBatchSize));
    }

    const allItems: T[] = [];
    const allConsumedCapacities: any[] = [];
    let unprocessedKeys: Record<string, any>[] = [];

    // Process each batch
    for (const batch of batches) {
      const input: BatchGetCommandInput = {
        RequestItems: {
          [this.tableName]: {
            Keys: batch,
            ProjectionExpression: params.projectionExpression,
            ConsistentRead: params.consistentRead || false,
          },
        },
        ReturnConsumedCapacity: 'TOTAL',
      };

      const result = await this.executeWithRetry(
        async () => this.client.send(new BatchGetCommand(input)),
        'batchGetOptimized'
      );

      // Collect results
      if (result.Responses && result.Responses[this.tableName]) {
        allItems.push(...(result.Responses[this.tableName] as T[]));
      }

      // Collect consumed capacities
      if (result.ConsumedCapacity) {
        allConsumedCapacities.push(...result.ConsumedCapacity);
      }

      // Handle unprocessed keys
      if (result.UnprocessedKeys && result.UnprocessedKeys[this.tableName]) {
        const keys = result.UnprocessedKeys[this.tableName].Keys;
        if (keys) {
          unprocessedKeys.push(...keys);
        }
      }
    }

    // Log consumed capacity
    CapacityLogger.logBatchConsumedCapacity('BatchGet', allConsumedCapacities);

    return {
      data: allItems,
      unprocessedKeys: unprocessedKeys.length > 0 ? unprocessedKeys : undefined,
      consumedCapacity: allConsumedCapacities.length > 0 ? {
        capacityUnits: allConsumedCapacities.reduce((sum, cap) => sum + (cap.CapacityUnits || 0), 0),
      } : undefined,
    };
  }

  /**
   * Batch write items with automatic splitting (up to 25 items per batch)
   */
  async batchWriteOptimized(
    params: BatchWriteParams
  ): Promise<BatchWriteResponse> {
    const maxBatchSize = 25;
    const batches: BatchWriteItem[][] = [];
    
    // Split into batches of 25
    for (let i = 0; i < params.items.length; i += maxBatchSize) {
      batches.push(params.items.slice(i, i + maxBatchSize));
    }

    const allConsumedCapacities: any[] = [];
    let unprocessedItems: BatchWriteItem[] = [];

    // Process each batch
    for (const batch of batches) {
      const requestItems = batch.map(item => {
        if (item.type === 'put') {
          return { PutRequest: { Item: item.item } };
        } else {
          return { DeleteRequest: { Key: item.key } };
        }
      });

      const input: BatchWriteCommandInput = {
        RequestItems: {
          [this.tableName]: requestItems,
        },
        ReturnConsumedCapacity: 'TOTAL',
      };

      const result = await this.executeWithRetry(
        async () => this.client.send(new BatchWriteCommand(input)),
        'batchWriteOptimized'
      );

      // Collect consumed capacities
      if (result.ConsumedCapacity) {
        allConsumedCapacities.push(...result.ConsumedCapacity);
      }

      // Handle unprocessed items
      if (result.UnprocessedItems && result.UnprocessedItems[this.tableName]) {
        const unprocessed = result.UnprocessedItems[this.tableName];
        unprocessed.forEach((req: any) => {
          if (req.PutRequest) {
            unprocessedItems.push({ type: 'put', item: req.PutRequest.Item });
          } else if (req.DeleteRequest) {
            unprocessedItems.push({ type: 'delete', key: req.DeleteRequest.Key });
          }
        });
      }
    }

    // Log consumed capacity
    CapacityLogger.logBatchConsumedCapacity('BatchWrite', allConsumedCapacities);

    return {
      data: undefined as any,
      unprocessedItems: unprocessedItems.length > 0 ? unprocessedItems : undefined,
      consumedCapacity: allConsumedCapacities.length > 0 ? {
        capacityUnits: allConsumedCapacities.reduce((sum, cap) => sum + (cap.CapacityUnits || 0), 0),
      } : undefined,
    };
  }

  /**
   * Create GSI attributes conditionally for sparse indexes
   */
  createGSIAttributesConditionally(
    params: CreateGSIAttributesParams
  ): Record<string, any> {
    const item = { ...params.item };

    params.gsiConfig.forEach(config => {
      // Check if condition is met
      if (config.condition(params.item)) {
        // Add GSI partition key
        item[config.partitionKey] = config.partitionKeyValue(params.item);
        
        // Add GSI sort key if configured
        if (config.sortKey && config.sortKeyValue) {
          item[config.sortKey] = config.sortKeyValue(params.item);
        }
      }
    });

    return item;
  }

  /**
   * Build projection expression to minimize data transfer
   */
  buildProjectionExpression(params: BuildProjectionParams): {
    projectionExpression: string;
    expressionAttributeNames: Record<string, string>;
  } {
    const expressionAttributeNames: Record<string, string> = {};
    const projectionParts: string[] = [];

    params.attributes.forEach((attr, index) => {
      const placeholder = `#attr${index}`;
      expressionAttributeNames[placeholder] = attr;
      projectionParts.push(placeholder);
    });

    return {
      projectionExpression: projectionParts.join(', '),
      expressionAttributeNames,
    };
  }

  /**
   * Update item with atomic updates
   */
  async update<T = any>(params: UpdateParams): Promise<DynamoDBResponse<T>> {
    // Build update expression
    const updateParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = { 
      ...params.expressionAttributeNames 
    };
    const expressionAttributeValues: Record<string, any> = { 
      ...params.expressionAttributeValues 
    };

    let attrIndex = 0;
    Object.entries(params.updates).forEach(([key, value]) => {
      const nameKey = `#attr${attrIndex}`;
      const valueKey = `:val${attrIndex}`;
      expressionAttributeNames[nameKey] = key;
      expressionAttributeValues[valueKey] = value;
      updateParts.push(`${nameKey} = ${valueKey}`);
      attrIndex++;
    });

    const input: UpdateCommandInput = {
      TableName: this.tableName,
      Key: params.key,
      UpdateExpression: `SET ${updateParts.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: params.conditionExpression,
      ReturnValues: params.returnValues || 'ALL_NEW',
      ReturnConsumedCapacity: 'TOTAL',
    };

    const result = await this.executeWithRetry(
      async () => this.client.send(new UpdateCommand(input)),
      'update'
    );

    // Log consumed capacity
    CapacityLogger.logConsumedCapacity('Update', result.ConsumedCapacity);

    return {
      data: result.Attributes as T,
      consumedCapacity: result.ConsumedCapacity ? {
        tableName: result.ConsumedCapacity.TableName,
        capacityUnits: result.ConsumedCapacity.CapacityUnits,
        readCapacityUnits: result.ConsumedCapacity.ReadCapacityUnits,
        writeCapacityUnits: result.ConsumedCapacity.WriteCapacityUnits,
      } : undefined,
    };
  }

  /**
   * Soft delete item
   */
  async softDelete<T = any>(params: SoftDeleteParams): Promise<DynamoDBResponse<T>> {
    const deletedAtField = params.deletedAtField || 'deletedAt';
    const deletedByField = params.deletedByField || 'deletedBy';
    const now = new Date().toISOString();

    const updates: Record<string, any> = {
      [deletedAtField]: now,
    };

    if (params.deletedBy) {
      updates[deletedByField] = params.deletedBy;
    }

    return this.update<T>({
      key: params.key,
      updates,
    });
  }

  /**
   * Get single item
   */
  async get<T = any>(params: GetParams): Promise<DynamoDBResponse<T | null>> {
    const input: GetCommandInput = {
      TableName: this.tableName,
      Key: params.key,
      ProjectionExpression: params.projectionExpression,
      ConsistentRead: params.consistentRead || false,
      ReturnConsumedCapacity: 'TOTAL',
    };

    const result = await this.executeWithRetry(
      async () => this.client.send(new GetCommand(input)),
      'get'
    );

    // Log consumed capacity
    CapacityLogger.logConsumedCapacity('Get', result.ConsumedCapacity);

    return {
      data: (result.Item as T) || null,
      consumedCapacity: result.ConsumedCapacity ? {
        tableName: result.ConsumedCapacity.TableName,
        capacityUnits: result.ConsumedCapacity.CapacityUnits,
        readCapacityUnits: result.ConsumedCapacity.ReadCapacityUnits,
        writeCapacityUnits: result.ConsumedCapacity.WriteCapacityUnits,
      } : undefined,
    };
  }

  /**
   * Put single item
   */
  async put<T = any>(params: PutParams): Promise<DynamoDBResponse<T | null>> {
    const input: PutCommandInput = {
      TableName: this.tableName,
      Item: params.item,
      ConditionExpression: params.conditionExpression,
      ExpressionAttributeNames: params.expressionAttributeNames,
      ExpressionAttributeValues: params.expressionAttributeValues,
      ReturnValues: params.returnValues || 'NONE',
      ReturnConsumedCapacity: 'TOTAL',
    };

    const result = await this.executeWithRetry(
      async () => this.client.send(new PutCommand(input)),
      'put'
    );

    // Log consumed capacity
    CapacityLogger.logConsumedCapacity('Put', result.ConsumedCapacity);

    return {
      data: (result.Attributes as T) || null,
      consumedCapacity: result.ConsumedCapacity ? {
        tableName: result.ConsumedCapacity.TableName,
        capacityUnits: result.ConsumedCapacity.CapacityUnits,
        readCapacityUnits: result.ConsumedCapacity.ReadCapacityUnits,
        writeCapacityUnits: result.ConsumedCapacity.WriteCapacityUnits,
      } : undefined,
    };
  }

  /**
   * Delete item (hard delete)
   */
  async delete<T = any>(params: DeleteParams): Promise<DynamoDBResponse<T | null>> {
    const input: DeleteCommandInput = {
      TableName: this.tableName,
      Key: params.key,
      ConditionExpression: params.conditionExpression,
      ExpressionAttributeNames: params.expressionAttributeNames,
      ExpressionAttributeValues: params.expressionAttributeValues,
      ReturnValues: params.returnValues || 'NONE',
      ReturnConsumedCapacity: 'TOTAL',
    };

    const result = await this.executeWithRetry(
      async () => this.client.send(new DeleteCommand(input)),
      'delete'
    );

    // Log consumed capacity
    CapacityLogger.logConsumedCapacity('Delete', result.ConsumedCapacity);

    return {
      data: (result.Attributes as T) || null,
      consumedCapacity: result.ConsumedCapacity ? {
        tableName: result.ConsumedCapacity.TableName,
        capacityUnits: result.ConsumedCapacity.CapacityUnits,
        readCapacityUnits: result.ConsumedCapacity.ReadCapacityUnits,
        writeCapacityUnits: result.ConsumedCapacity.WriteCapacityUnits,
      } : undefined,
    };
  }
}
