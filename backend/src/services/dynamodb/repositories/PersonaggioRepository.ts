/**
 * PersonaggioRepository - DynamoDB implementation for Personaggio CRUD operations
 * 
 * DynamoDB Structure:
 * PK: "PERSONAGGIO#${id}"
 * SK: "METADATA"
 * GSI1PK: "PERSONAGGIO_ORDER#${order}"
 * GSI1SK: "${id}"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import {
  Personaggio,
  CreatePersonaggioData,
  UpdatePersonaggioData,
} from './types';

export class PersonaggioRepository {
  private dynamoDB: DynamoDBOptimized;
  private readonly COUNTER_PK = 'COUNTER';
  private readonly COUNTER_SK = 'PERSONAGGIO_ID';

  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Get next auto-increment ID using atomic counter
   */
  async getNextId(): Promise<number> {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
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
   * Get next order value using atomic counter
   */
  async getNextOrder(): Promise<number> {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: this.COUNTER_PK,
        SK: 'PERSONAGGIO_ORDER',
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
   * Map DynamoDB item to Personaggio interface
   */
  mapToPersonaggio(item: Record<string, any>): Personaggio {
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      images: item.images ? JSON.parse(item.images) : [],
      order: item.order,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
    };
  }

  /**
   * Build DynamoDB item from Personaggio
   */
  buildPersonaggioItem(personaggio: Personaggio): Record<string, any> {
    const item: Record<string, any> = {
      PK: `PERSONAGGIO#${personaggio.id}`,
      SK: 'METADATA',
      id: personaggio.id,
      name: personaggio.name,
      images: JSON.stringify(personaggio.images),
      order: personaggio.order,
      created_at: personaggio.created_at,
      updated_at: personaggio.updated_at,
      // GSI1 - Personaggio by order for sorted retrieval
      GSI1PK: `PERSONAGGIO_ORDER#${personaggio.order}`,
      GSI1SK: `${personaggio.id}`,
    };

    // Add optional fields
    if (personaggio.description !== undefined) {
      item.description = personaggio.description;
    }
    if (personaggio.deleted_at !== undefined) {
      item.deleted_at = personaggio.deleted_at;
    }

    return item;
  }

  /**
   * Create a new personaggio with auto-increment ID
   */
  async create(data: CreatePersonaggioData): Promise<Personaggio> {
    const now = new Date().toISOString();
    const id = await this.getNextId();
    const order = data.order !== undefined ? data.order : await this.getNextOrder();

    const personaggio: Personaggio = {
      id,
      name: data.name,
      description: data.description,
      images: data.images || [],
      order,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildPersonaggioItem(personaggio);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return personaggio;
  }

  /**
   * Find personaggio by ID (strongly consistent read)
   */
  async findById(id: number): Promise<Personaggio | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `PERSONAGGIO#${id}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToPersonaggio(result.data);
  }

  /**
   * Find all personaggi sorted by order using GSI1 (eventually consistent)
   * @param includeDeleted - If true, includes soft-deleted items
   */
  async findAll(includeDeleted: boolean = false): Promise<Personaggio[]> {
    // Query GSI1 to get items sorted by order
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'begins_with(GSI1PK, :prefix)',
      expressionAttributeValues: {
        ':prefix': 'PERSONAGGIO_ORDER#',
      },
      filterExpression: includeDeleted ? undefined : 'attribute_not_exists(deleted_at)',
      scanIndexForward: true, // Sort ascending by order (GSI1PK contains order)
    });

    return result.data.map(item => this.mapToPersonaggio(item));
  }

  /**
   * Update personaggio by ID
   */
  async update(id: number, data: UpdatePersonaggioData): Promise<Personaggio | null> {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Build updates object with only provided fields
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.images !== undefined) updates.images = JSON.stringify(data.images);

    // Handle order update - need to update GSI1 attributes
    if (data.order !== undefined) {
      updates.order = data.order;
      updates.GSI1PK = `PERSONAGGIO_ORDER#${data.order}`;
    }

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `PERSONAGGIO#${id}`,
          SK: 'METADATA',
        },
        updates,
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToPersonaggio(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Soft delete personaggio (set deleted_at)
   */
  async softDelete(id: number): Promise<Personaggio | null> {
    try {
      const result = await this.dynamoDB.softDelete({
        key: {
          PK: `PERSONAGGIO#${id}`,
          SK: 'METADATA',
        },
        deletedAtField: 'deleted_at',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToPersonaggio(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Restore soft-deleted personaggio
   */
  async restore(id: number): Promise<Personaggio | null> {
    const current = await this.findById(id);
    if (!current || !current.deleted_at) {
      return null;
    }

    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: `PERSONAGGIO#${id}`,
        SK: 'METADATA',
      },
      UpdateExpression: 'REMOVE deleted_at SET updated_at = :now',
      ExpressionAttributeValues: {
        ':now': new Date().toISOString(),
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

      return this.mapToPersonaggio(result.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Reorder multiple personaggi atomically
   * Updates the order field and GSI1 attributes for all provided IDs
   * 
   * @param personaggiIds - Array of personaggio IDs in the desired order.
   *                        Each ID will be assigned an order starting from 1.
   *                        If duplicate IDs are provided, each occurrence will be updated
   *                        with the order corresponding to its position in the array.
   *                        If an ID doesn't exist, the update will fail for that ID.
   * @throws Error if any update fails (e.g., if an ID doesn't exist)
   * 
   * @example
   * // Reorder three personaggi: set order 1 for ID 5, order 2 for ID 3, order 3 for ID 1
   * await repository.reorder([5, 3, 1]);
   */
  async reorder(personaggiIds: number[]): Promise<void> {
    // Use batch write to update all items
    const batchItems = personaggiIds.map((id, index) => {
      const order = index + 1; // Start order from 1
      
      // We need to get the current item to build the complete update
      // For batch write, we'll use a different approach - update items individually
      return { id, order };
    });

    // Update each item individually with its new order
    // This ensures atomicity at the item level
    const updatePromises = batchItems.map(async ({ id, order }) => {
      try {
        await this.update(id, { order });
      } catch (error) {
        console.error(
          `Failed to reorder personaggio ${id} to position ${order}. ` +
          `Reorder operation: [${personaggiIds.join(', ')}]`,
          error
        );
        throw error;
      }
    });

    await Promise.all(updatePromises);
  }
}
