import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export interface Fumetto {
  id: number;
  title: string;
  description?: string;
  coverImage?: string;
  pages?: string[];
  order: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export class FumettoRepository {
  
  /**
   * Create a new fumetto
   */
  static async create(data: Omit<Fumetto, 'id' | 'created_at' | 'updated_at'>): Promise<Fumetto> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.FUMETTO);
    const now = new Date().toISOString();
    
    const fumetto: Fumetto = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.FUMETTO}#${id}`,
      SK: 'METADATA',
      GSI1PK: 'FUMETTO_LIST',
      GSI1SK: `ORDER#${String(data.order).padStart(5, '0')}#${id}`,
      entity_type: 'Fumetto',
      ...fumetto,
    });

    return fumetto;
  }

  /**
   * Find fumetto by ID
   */
  static async findById(id: number, includeDeleted: boolean = false): Promise<Fumetto | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.FUMETTO}#${id}`, 'METADATA');
    if (!item) return null;
    if (!includeDeleted && item.deleted_at) return null;
    return this.mapToFumetto(item);
  }

  /**
   * Find all fumetti ordered
   */
  static async findAll(includeDeleted: boolean = false): Promise<Fumetto[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': 'FUMETTO_LIST',
      },
      scanIndexForward: true,
    });

    return items
      .filter(item => includeDeleted || !item.deleted_at)
      .map(this.mapToFumetto);
  }

  /**
   * Update a fumetto
   */
  static async update(id: number, data: Partial<Fumetto>): Promise<Fumetto> {
    const { id: _, created_at: __, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.FUMETTO}#${id}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    // If order changed, update GSI
    if (data.order !== undefined) {
      const fumetto = this.mapToFumetto(result);
      await DynamoDBHelper.put({
        PK: `${EntityPrefix.FUMETTO}#${id}`,
        SK: 'METADATA',
        GSI1PK: 'FUMETTO_LIST',
        GSI1SK: `ORDER#${String(fumetto.order).padStart(5, '0')}#${id}`,
        entity_type: 'Fumetto',
        ...fumetto,
      });
    }

    return this.mapToFumetto(result);
  }

  /**
   * Reorder fumetti
   */
  static async reorder(orders: Array<{ id: number; order: number }>): Promise<void> {
    for (const { id, order } of orders) {
      await this.update(id, { order });
    }
  }

  /**
   * Soft delete
   */
  static async softDelete(id: number): Promise<void> {
    await DynamoDBHelper.softDelete(`${EntityPrefix.FUMETTO}#${id}`, 'METADATA');
  }

  /**
   * Hard delete
   */
  static async delete(id: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.FUMETTO}#${id}`, 'METADATA');
  }

  private static mapToFumetto(item: any): Fumetto {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...fumetto } = item;
    return fumetto as Fumetto;
  }
}
