/**
 * FumettoRepository - DynamoDB implementation for Fumetto CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "FUMETTO#${id}"
 * SK: "METADATA"
 * GSI1PK: "FUMETTO_ORDER#${order}"
 * GSI1SK: "FUMETTO#${id}"
 * 
 * Features:
 * - CRUD operations with auto-increment ID
 * - Reorder functionality for managing fumetti order
 * - Soft delete support
 * - JSON array handling for pages
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  Fumetto,
  CreateFumettoData,
  UpdateFumettoData,
  PaginationParams,
  PaginatedResponse,
} from './types';

export class FumettoRepository {
  private dynamoDB: DynamoDBOptimized;
  private tableName: string;
  private readonly COUNTER_PK = 'COUNTER';
  private readonly COUNTER_SK = 'FUMETTO_ID';
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
    this.tableName = (dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME || 'products';
  }

  /**
   * Get next auto-increment ID using atomic counter
   */
  async getNextId(): Promise<number> {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: this.COUNTER_PK,
        SK: this.COUNTER_SK,
      },
      UpdateExpression: 'SET #v = if_not_exists(#v, :zero) + :one',
      ExpressionAttributeNames: {
        '#v': 'value',
      },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':one': 1,
      },
      ReturnValues: 'ALL_NEW',
    });

    const client = (this.dynamoDB as any).client;
    const result = await client.send(command);
    return result.Attributes?.value || 1;
  }

  /**
   * Get next order value for ordering
   */
  private async getNextOrder(): Promise<number> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'begins_with(GSI1PK, :prefix)',
      expressionAttributeValues: {
        ':prefix': 'FUMETTO_ORDER#',
      },
      scanIndexForward: false, // Descending order
      limit: 1,
      projectionExpression: '#order',
      expressionAttributeNames: {
        '#order': 'order',
      },
    });

    if (result.data.length === 0) {
      return 0;
    }

    return (result.data[0].order || -1) + 1;
  }

  /**
   * Map DynamoDB item to Fumetto interface
   */
  mapToFumetto(item: Record<string, any>): Fumetto {
    return {
      id: item.id,
      title: item.title,
      description: item.description,
      coverImage: item.coverImage,
      pages: item.pages || [],
      order: item.order,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
    };
  }

  /**
   * Build DynamoDB item from Fumetto
   */
  buildFumettoItem(fumetto: Fumetto): Record<string, any> {
    const item: Record<string, any> = {
      PK: `FUMETTO#${fumetto.id}`,
      SK: 'METADATA',
      id: fumetto.id,
      title: fumetto.title,
      order: fumetto.order,
      created_at: fumetto.created_at,
      updated_at: fumetto.updated_at,
      // GSI1 - Fumetto by order
      GSI1PK: `FUMETTO_ORDER#${String(fumetto.order).padStart(10, '0')}`,
      GSI1SK: `FUMETTO#${fumetto.id}`,
    };

    // Add optional fields
    if (fumetto.description !== undefined) item.description = fumetto.description;
    if (fumetto.coverImage !== undefined) item.coverImage = fumetto.coverImage;
    if (fumetto.pages !== undefined) item.pages = fumetto.pages;
    if (fumetto.deleted_at !== undefined) item.deleted_at = fumetto.deleted_at;

    return item;
  }

  /**
   * Create a new fumetto with auto-increment ID
   */
  async create(data: CreateFumettoData): Promise<Fumetto> {
    const now = new Date().toISOString();
    const id = await this.getNextId();
    const order = data.order !== undefined ? data.order : await this.getNextOrder();

    const fumetto: Fumetto = {
      id,
      title: data.title,
      description: data.description,
      coverImage: data.coverImage,
      pages: data.pages || [],
      order,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildFumettoItem(fumetto);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return fumetto;
  }

  /**
   * Find fumetto by ID (strongly consistent read)
   */
  async findById(id: number): Promise<Fumetto | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `FUMETTO#${id}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToFumetto(result.data);
  }

  /**
   * Find all fumetti sorted by order (eventually consistent)
   */
  async findAll(params: PaginationParams = {}): Promise<PaginatedResponse<Fumetto>> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'begins_with(GSI1PK, :prefix)',
      expressionAttributeValues: {
        ':prefix': 'FUMETTO_ORDER#',
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      scanIndexForward: true, // Ascending order by order field
      // Exclude soft-deleted fumetti
      filterExpression: 'attribute_not_exists(deleted_at)',
    });

    return {
      items: result.data.map(item => this.mapToFumetto(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Update fumetto by ID
   */
  async update(id: number, data: UpdateFumettoData): Promise<Fumetto | null> {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.coverImage !== undefined) updates.coverImage = data.coverImage;
    if (data.pages !== undefined) updates.pages = data.pages;
    if (data.order !== undefined) updates.order = data.order;

    // Update GSI attributes if order is changed
    const needsGSI1Update = data.order !== undefined;
    
    if (needsGSI1Update) {
      updates.GSI1PK = `FUMETTO_ORDER#${String(data.order).padStart(10, '0')}`;
      updates.GSI1SK = `FUMETTO#${id}`;
    }

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `FUMETTO#${id}`,
          SK: 'METADATA',
        },
        updates,
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToFumetto(result.data);
    } catch (error: any) {
      // If item doesn't exist, return null
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Soft delete fumetto by ID
   */
  async softDelete(id: number): Promise<Fumetto | null> {
    try {
      const result = await this.dynamoDB.softDelete({
        key: {
          PK: `FUMETTO#${id}`,
          SK: 'METADATA',
        },
        deletedAtField: 'deleted_at',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToFumetto(result.data);
    } catch (error: any) {
      // If item doesn't exist, return null
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Restore soft-deleted fumetto by ID
   */
  async restore(id: number): Promise<Fumetto | null> {
    // Check if fumetto exists and is deleted
    const current = await this.findById(id);
    if (!current || !current.deleted_at) {
      return null;
    }

    const now = new Date().toISOString();
    
    // Use UpdateCommand directly to REMOVE deleted_at attribute
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: `FUMETTO#${id}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'REMOVE deleted_at SET updated_at = :now',
      ExpressionAttributeValues: {
        ':now': now,
      },
      ConditionExpression: 'attribute_exists(PK) AND attribute_exists(deleted_at)',
      ReturnValues: 'ALL_NEW',
    });

    try {
      const client = (this.dynamoDB as any).client;
      const result = await client.send(command);
      
      if (!result.Attributes) {
        return null;
      }

      return this.mapToFumetto(result.Attributes);
    } catch (error: any) {
      // If item doesn't exist or is not deleted, return null
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Reorder fumetti by updating their order field
   * Takes an array of fumetto IDs in the desired order
   */
  async reorder(fumettiIds: number[]): Promise<Fumetto[]> {
    if (fumettiIds.length === 0) {
      return [];
    }

    if (fumettiIds.length > 25) {
      throw new Error('Reorder supports up to 25 fumetti at a time due to DynamoDB transaction limits');
    }

    // Get current fumetti to validate they all exist
    const fumetti: Fumetto[] = [];
    for (const id of fumettiIds) {
      const fumetto = await this.findById(id);
      if (!fumetto) {
        throw new Error(`Fumetto ${id} not found`);
      }
      fumetti.push(fumetto);
    }

    // Create a map for quick lookup
    const fumettoMap = new Map(fumetti.map(f => [f.id, f]));

    // Build transaction items to update order for each fumetto
    const now = new Date().toISOString();
    const transactWrites: any[] = [];
    
    for (let i = 0; i < fumettiIds.length; i++) {
      const id = fumettiIds[i];
      const newOrder = i;
      const fumetto = fumettoMap.get(id)!;
      
      // If order hasn't changed, skip
      if (fumetto.order === newOrder) {
        continue;
      }
      
      // Update item with new order
      transactWrites.push({
        Update: {
          TableName: this.tableName,
          Key: {
            PK: `FUMETTO#${id}`,
            SK: 'METADATA',
          },
          UpdateExpression: 'SET #order = :order, #updated_at = :updated_at, GSI1PK = :gsi1pk, GSI1SK = :gsi1sk',
          ExpressionAttributeNames: {
            '#order': 'order',
            '#updated_at': 'updated_at',
          },
          ExpressionAttributeValues: {
            ':order': newOrder,
            ':updated_at': now,
            ':gsi1pk': `FUMETTO_ORDER#${String(newOrder).padStart(10, '0')}`,
            ':gsi1sk': `FUMETTO#${id}`,
          },
        },
      });
    }

    // Execute transaction if there are updates
    if (transactWrites.length > 0) {
      const command = new TransactWriteCommand({
        TransactItems: transactWrites,
      });

      const client = (this.dynamoDB as any).client;
      await client.send(command);
    }

    // Return reordered fumetti by mapping from already-fetched data with updated order
    return fumettiIds.map((id, newOrder) => {
      const fumetto = fumettoMap.get(id)!;
      return {
        ...fumetto,
        order: newOrder,
        updated_at: now,
      };
    });
  }
}
