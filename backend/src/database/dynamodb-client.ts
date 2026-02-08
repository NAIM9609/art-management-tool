import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { 
  DynamoDBDocumentClient, 
  PutCommand, 
  GetCommand, 
  QueryCommand, 
  UpdateCommand, 
  DeleteCommand, 
  BatchGetCommand, 
  BatchWriteCommand, 
  TransactWriteCommand,
  ScanCommand,
  QueryCommandInput,
  ScanCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { config } from '../config';

// Initialize DynamoDB client
const client = new DynamoDBClient({
  region: config.aws?.region || 'eu-west-1',
  ...(config.aws?.endpoint && { endpoint: config.aws.endpoint }) // For local testing with DynamoDB Local
});

export const dynamoDB = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

export const TABLE_NAME = config.dynamodb?.tableName || 'ArtManagementTable';

export interface PaginatedResult<T> {
  items: T[];
  lastEvaluatedKey?: Record<string, any>;
  count: number;
}

export interface QueryParams {
  keyConditionExpression: string;
  expressionAttributeValues: Record<string, any>;
  expressionAttributeNames?: Record<string, string>;
  filterExpression?: string;
  indexName?: string;
  limit?: number;
  scanIndexForward?: boolean;
  exclusiveStartKey?: Record<string, any>;
}

// Helper functions for DynamoDB operations
export class DynamoDBHelper {
  private static instance: DynamoDBHelper;
  
  /**
   * Get singleton instance (for migration script compatibility)
   */
  static getInstance(): DynamoDBHelper {
    if (!DynamoDBHelper.instance) {
      DynamoDBHelper.instance = new DynamoDBHelper();
    }
    return DynamoDBHelper.instance;
  }
  
  /**
   * Get the table name
   */
  getTableName(): string {
    return TABLE_NAME;
  }
  
  /**
   * Get a single item by primary key
   */
  static async get(pk: string, sk: string): Promise<any> {
    const result = await dynamoDB.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
    }));
    return result.Item;
  }

  /**
   * Put an item into the table
   */
  static async put(item: Record<string, any>): Promise<void> {
    await dynamoDB.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));
  }

  /**
   * Put an item with a condition (for unique constraints)
   */
  static async putIfNotExists(item: Record<string, any>, conditionField: string = 'PK'): Promise<boolean> {
    try {
      await dynamoDB.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: item,
        ConditionExpression: `attribute_not_exists(${conditionField})`,
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Query items using key conditions
   */
  static async query(params: QueryParams): Promise<any[]> {
    const commandInput: QueryCommandInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: params.keyConditionExpression,
      ExpressionAttributeValues: params.expressionAttributeValues,
    };

    if (params.expressionAttributeNames) {
      commandInput.ExpressionAttributeNames = params.expressionAttributeNames;
    }
    if (params.filterExpression) {
      commandInput.FilterExpression = params.filterExpression;
    }
    if (params.indexName) {
      commandInput.IndexName = params.indexName;
    }
    if (params.limit) {
      commandInput.Limit = params.limit;
    }
    if (params.scanIndexForward !== undefined) {
      commandInput.ScanIndexForward = params.scanIndexForward;
    }
    if (params.exclusiveStartKey) {
      commandInput.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await dynamoDB.send(new QueryCommand(commandInput));
    return result.Items || [];
  }

  /**
   * Query with pagination support
   */
  static async queryPaginated<T>(params: QueryParams): Promise<PaginatedResult<T>> {
    const commandInput: QueryCommandInput = {
      TableName: TABLE_NAME,
      KeyConditionExpression: params.keyConditionExpression,
      ExpressionAttributeValues: params.expressionAttributeValues,
    };

    if (params.expressionAttributeNames) {
      commandInput.ExpressionAttributeNames = params.expressionAttributeNames;
    }
    if (params.filterExpression) {
      commandInput.FilterExpression = params.filterExpression;
    }
    if (params.indexName) {
      commandInput.IndexName = params.indexName;
    }
    if (params.limit) {
      commandInput.Limit = params.limit;
    }
    if (params.scanIndexForward !== undefined) {
      commandInput.ScanIndexForward = params.scanIndexForward;
    }
    if (params.exclusiveStartKey) {
      commandInput.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await dynamoDB.send(new QueryCommand(commandInput));
    
    return {
      items: (result.Items || []) as T[],
      lastEvaluatedKey: result.LastEvaluatedKey,
      count: result.Count || 0,
    };
  }

  /**
   * Scan the table (use sparingly - expensive operation)
   */
  static async scan(params: {
    filterExpression?: string;
    expressionAttributeValues?: Record<string, any>;
    expressionAttributeNames?: Record<string, string>;
    limit?: number;
    exclusiveStartKey?: Record<string, any>;
  } = {}): Promise<any[]> {
    const commandInput: ScanCommandInput = {
      TableName: TABLE_NAME,
    };

    if (params.filterExpression) {
      commandInput.FilterExpression = params.filterExpression;
    }
    if (params.expressionAttributeValues) {
      commandInput.ExpressionAttributeValues = params.expressionAttributeValues;
    }
    if (params.expressionAttributeNames) {
      commandInput.ExpressionAttributeNames = params.expressionAttributeNames;
    }
    if (params.limit) {
      commandInput.Limit = params.limit;
    }
    if (params.exclusiveStartKey) {
      commandInput.ExclusiveStartKey = params.exclusiveStartKey;
    }

    const result = await dynamoDB.send(new ScanCommand(commandInput));
    return result.Items || [];
  }

  /**
   * Update an item
   */
  static async update(
    pk: string,
    sk: string,
    updateExpression: string,
    expressionAttributeValues: Record<string, any>,
    expressionAttributeNames?: Record<string, string>
  ): Promise<any> {
    const result = await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes;
  }

  /**
   * Delete an item
   */
  static async delete(pk: string, sk: string): Promise<void> {
    await dynamoDB.send(new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: pk, SK: sk },
    }));
  }

  /**
   * Soft delete implementation - sets deleted_at timestamp
   */
  static async softDelete(pk: string, sk: string): Promise<any> {
    return this.update(
      pk,
      sk,
      'SET deleted_at = :deleted_at, updated_at = :updated_at',
      {
        ':deleted_at': new Date().toISOString(),
        ':updated_at': new Date().toISOString(),
      }
    );
  }

  /**
   * Restore a soft-deleted item
   */
  static async restore(pk: string, sk: string): Promise<any> {
    return this.update(
      pk,
      sk,
      'REMOVE deleted_at SET updated_at = :updated_at',
      {
        ':updated_at': new Date().toISOString(),
      }
    );
  }

  /**
   * Batch get multiple items
   */
  static async batchGet(keys: Array<{PK: string; SK: string}>): Promise<any[]> {
    if (keys.length === 0) return [];

    // DynamoDB limits batch get to 100 items
    const chunks: Array<Array<{PK: string; SK: string}>> = [];
    for (let i = 0; i < keys.length; i += 100) {
      chunks.push(keys.slice(i, i + 100));
    }

    const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
    const maxRetries = 5;
    const baseDelayMs = 100;

    const results: any[] = [];
    for (const chunk of chunks) {
      let unprocessedKeysChunk: Array<{ PK: string; SK: string }> = chunk;
      let attempt = 0;

      while (unprocessedKeysChunk.length > 0) {
        const result = await dynamoDB.send(new BatchGetCommand({
          RequestItems: {
            [TABLE_NAME]: {
              Keys: unprocessedKeysChunk,
            },
          },
        }));

        if (result.Responses?.[TABLE_NAME]) {
          results.push(...result.Responses[TABLE_NAME]);
        }

        const unprocessed =
          result.UnprocessedKeys &&
          result.UnprocessedKeys[TABLE_NAME] &&
          Array.isArray(result.UnprocessedKeys[TABLE_NAME].Keys)
            ? result.UnprocessedKeys[TABLE_NAME].Keys as Array<{ PK: string; SK: string }>
            : [];

        if (!unprocessed || unprocessed.length === 0) {
          break;
        }

        attempt += 1;
        if (attempt > maxRetries) {
          throw new Error(
            `DynamoDB BatchGetItem still has ${unprocessed.length} unprocessed keys after ${maxRetries} retries`
          );
        }

        unprocessedKeysChunk = unprocessed;
        const backoffMs = baseDelayMs * Math.pow(2, attempt - 1);
        await delay(backoffMs);
      }
    }
    return results;
  }

  /**
   * Batch write (put/delete) multiple items
   */
  static async batchWrite(operations: Array<{
    type: 'put' | 'delete';
    item?: Record<string, any>;
    key?: { PK: string; SK: string };
  }>): Promise<void> {
    if (operations.length === 0) return;

    // DynamoDB limits batch write to 25 items
    const chunks = [];
    for (let i = 0; i < operations.length; i += 25) {
      chunks.push(operations.slice(i, i + 25));
    }

    for (const chunk of chunks) {
      const writeRequests = chunk.map(op => {
        if (op.type === 'put' && op.item) {
          return { PutRequest: { Item: op.item } };
        } else if (op.type === 'delete' && op.key) {
          return { DeleteRequest: { Key: op.key } };
        }
        return null;
      }).filter(Boolean);

      // Handle potential partial success by retrying UnprocessedItems with backoff
      let unprocessed: Record<string, any> | undefined = {
        [TABLE_NAME]: writeRequests as any,
      };
      const maxRetries = 5;
      let attempt = 0;

      while (unprocessed && Object.keys(unprocessed).length > 0) {
        const response = await dynamoDB.send(new BatchWriteCommand({
          RequestItems: unprocessed,
        }));

        unprocessed = response.UnprocessedItems as Record<string, any> | undefined;

        if (!unprocessed || Object.keys(unprocessed).length === 0) {
          break;
        }

        attempt += 1;
        if (attempt > maxRetries) {
          throw new Error("Failed to process all batch write items after retries");
        }

        // Exponential backoff with a capped delay
        const delayMs = Math.min(100 * Math.pow(2, attempt), 2000);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Transactional write - all or nothing operations
   */
  static async transactWrite(items: Array<{
    type: 'Put' | 'Update' | 'Delete' | 'ConditionCheck';
    item?: Record<string, any>;
    key?: { PK: string; SK: string };
    updateExpression?: string;
    expressionAttributeValues?: Record<string, any>;
    expressionAttributeNames?: Record<string, string>;
    conditionExpression?: string;
  }>): Promise<void> {
    const transactItems = items.map(item => {
      if (item.type === 'Put' && item.item) {
        return {
          Put: {
            TableName: TABLE_NAME,
            Item: item.item,
            ConditionExpression: item.conditionExpression,
          },
        };
      } else if (item.type === 'Update' && item.key) {
        return {
          Update: {
            TableName: TABLE_NAME,
            Key: item.key,
            UpdateExpression: item.updateExpression,
            ExpressionAttributeValues: item.expressionAttributeValues,
            ExpressionAttributeNames: item.expressionAttributeNames,
            ConditionExpression: item.conditionExpression,
          },
        };
      } else if (item.type === 'Delete' && item.key) {
        return {
          Delete: {
            TableName: TABLE_NAME,
            Key: item.key,
            ConditionExpression: item.conditionExpression,
          },
        };
      } else if (item.type === 'ConditionCheck' && item.key) {
        return {
          ConditionCheck: {
            TableName: TABLE_NAME,
            Key: item.key,
            ConditionExpression: item.conditionExpression!,
            ExpressionAttributeValues: item.expressionAttributeValues,
          },
        };
      }
      return null;
    }).filter(Boolean);

    await dynamoDB.send(new TransactWriteCommand({
      TransactItems: transactItems as any,
    }));
  }

  /**
   * Get next auto-increment ID for an entity type
   */
  static async getNextId(entityType: string): Promise<number> {
    const result = await dynamoDB.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: 'COUNTER', SK: entityType },
      UpdateExpression: 'SET #counter = if_not_exists(#counter, :start) + :incr',
      ExpressionAttributeValues: {
        ':start': 0,
        ':incr': 1,
      },
      ExpressionAttributeNames: {
        '#counter': 'counter',
      },
      ReturnValues: 'ALL_NEW',
    }));
    return result.Attributes?.counter || 1;
  }

  /**
   * Build update expression from an object
   */
  static buildUpdateExpression(data: Record<string, any>): {
    updateExpression: string;
    expressionAttributeValues: Record<string, any>;
    expressionAttributeNames: Record<string, string>;
  } {
    const updates: string[] = [];
    const values: Record<string, any> = {};
    const names: Record<string, string> = {};

    Object.entries(data).forEach(([key, value], index) => {
      if (value !== undefined) {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        names[attrName] = key;
        values[attrValue] = value;
        updates.push(`${attrName} = ${attrValue}`);
      }
    });

    // Always update updated_at
    values[':updated_at'] = new Date().toISOString();
    names['#updated_at'] = 'updated_at';
    updates.push('#updated_at = :updated_at');

    return {
      updateExpression: `SET ${updates.join(', ')}`,
      expressionAttributeValues: values,
      expressionAttributeNames: names,
    };
  }
}

// Entity type prefixes for partition keys
export const EntityPrefix = {
  PRODUCT: 'PRODUCT',
  PRODUCT_VARIANT: 'VARIANT',
  PRODUCT_IMAGE: 'IMAGE',
  CATEGORY: 'CATEGORY',
  ORDER: 'ORDER',
  ORDER_ITEM: 'ORDERITEM',
  CART: 'CART',
  CART_ITEM: 'CARTITEM',
  PERSONAGGIO: 'PERSONAGGIO',
  FUMETTO: 'FUMETTO',
  DISCOUNT: 'DISCOUNT',
  NOTIFICATION: 'NOTIFICATION',
  AUDIT: 'AUDIT',
  SHOPIFY_LINK: 'SHOPIFY',
  ETSY_TOKEN: 'ETSY_TOKEN',
  ETSY_CONFIG: 'ETSY_CONFIG',
  ETSY_PRODUCT: 'ETSY_PRODUCT',
  ETSY_RECEIPT: 'ETSY_RECEIPT',
  ETSY_SYNC_LOG: 'ETSY_SYNC_LOG',
} as const;

// GSI names
export const GSI = {
  GSI1: 'GSI1',
  GSI2: 'GSI2',
  GSI3: 'GSI3',
} as const;
