import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export interface Personaggio {
  id: number;
  name: string;
  description?: string;
  icon?: string;
  images?: string[];
  backgroundColor?: string;
  backgroundType?: string;
  gradientFrom?: string;
  gradientTo?: string;
  backgroundImage?: string;
  order: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export class PersonaggioRepository {
  
  /**
   * Create a new personaggio
   */
  static async create(data: Omit<Personaggio, 'id' | 'created_at' | 'updated_at'>): Promise<Personaggio> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.PERSONAGGIO);
    const now = new Date().toISOString();
    
    const personaggio: Personaggio = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.PERSONAGGIO}#${id}`,
      SK: 'METADATA',
      GSI1PK: 'PERSONAGGIO_LIST',
      GSI1SK: `ORDER#${String(data.order).padStart(5, '0')}#${id}`,
      entity_type: 'Personaggio',
      ...personaggio,
    });

    return personaggio;
  }

  /**
   * Find personaggio by ID
   */
  static async findById(id: number, includeDeleted: boolean = false): Promise<Personaggio | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.PERSONAGGIO}#${id}`, 'METADATA');
    if (!item) return null;
    if (!includeDeleted && item.deleted_at) return null;
    return this.mapToPersonaggio(item);
  }

  /**
   * Find all personaggi ordered
   */
  static async findAll(includeDeleted: boolean = false): Promise<Personaggio[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': 'PERSONAGGIO_LIST',
      },
      scanIndexForward: true, // Order ascending
    });

    return items
      .filter(item => includeDeleted || !item.deleted_at)
      .map(this.mapToPersonaggio);
  }

  /**
   * Update a personaggio
   */
  static async update(id: number, data: Partial<Personaggio>): Promise<Personaggio> {
    const { id: _, created_at: __, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.PERSONAGGIO}#${id}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    // If order changed, update GSI
    if (data.order !== undefined) {
      const personaggio = this.mapToPersonaggio(result);
      await DynamoDBHelper.put({
        PK: `${EntityPrefix.PERSONAGGIO}#${id}`,
        SK: 'METADATA',
        GSI1PK: 'PERSONAGGIO_LIST',
        GSI1SK: `ORDER#${String(personaggio.order).padStart(5, '0')}#${id}`,
        entity_type: 'Personaggio',
        ...personaggio,
      });
    }

    return this.mapToPersonaggio(result);
  }

  /**
   * Reorder personaggi
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
    await DynamoDBHelper.softDelete(`${EntityPrefix.PERSONAGGIO}#${id}`, 'METADATA');
  }

  /**
   * Hard delete
   */
  static async delete(id: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.PERSONAGGIO}#${id}`, 'METADATA');
  }

  private static mapToPersonaggio(item: any): Personaggio {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...personaggio } = item;
    return personaggio as Personaggio;
  }
}
