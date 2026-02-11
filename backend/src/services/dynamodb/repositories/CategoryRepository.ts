/**
 * CategoryRepository - DynamoDB implementation for Category CRUD operations
 * 
 * DynamoDB Structure:
 * Category:
 *   PK: "CATEGORY#${id}"
 *   SK: "METADATA"
 *   GSI1PK: "CATEGORY_SLUG#${slug}"
 *   GSI1SK: "${created_at}"
 *   GSI2PK: "CATEGORY_PARENT#${parent_id || 'ROOT'}"
 *   GSI2SK: "${name}#${id}"
 * 
 * Product-Category Link (bidirectional):
 *   PK: "PRODUCT#${product_id}"
 *   SK: "CATEGORY#${category_id}"
 *   AND
 *   PK: "CATEGORY#${category_id}"
 *   SK: "PRODUCT#${product_id}"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  Category,
  CreateCategoryData,
  UpdateCategoryData,
  CategoryProduct,
  PaginationParams,
  PaginatedResponse,
  Product,
} from './types';

export class CategoryRepository {
  private dynamoDB: DynamoDBOptimized;
  private readonly COUNTER_PK = 'COUNTER';
  private readonly COUNTER_SK = 'CATEGORY_ID';

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
   * Map DynamoDB item to Category interface
   */
  private mapToCategory(item: Record<string, any>): Category {
    return {
      id: item.id,
      name: item.name,
      slug: item.slug,
      description: item.description,
      parent_id: item.parent_id,
      created_at: item.created_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
    };
  }

  /**
   * Build DynamoDB item from Category
   */
  private buildCategoryItem(category: Category): Record<string, any> {
    const item: Record<string, any> = {
      PK: `CATEGORY#${category.id}`,
      SK: 'METADATA',
      id: category.id,
      name: category.name,
      slug: category.slug,
      created_at: category.created_at,
      updated_at: category.updated_at,
      // GSI1 - Category by slug (for uniqueness check)
      GSI1PK: `CATEGORY_SLUG#${category.slug}`,
      GSI1SK: category.created_at,
      // GSI2 - Categories by parent
      GSI2PK: `CATEGORY_PARENT#${category.parent_id || 'ROOT'}`,
      GSI2SK: `${category.name}#${category.id}`,
    };

    // Add optional fields
    if (category.description !== undefined) item.description = category.description;
    if (category.parent_id !== undefined && category.parent_id !== null) item.parent_id = category.parent_id;
    if (category.deleted_at !== undefined) item.deleted_at = category.deleted_at;

    return item;
  }

  /**
   * Check if setting parent_id would create a circular reference
   * Returns true if circular reference detected, false otherwise
   */
  private async wouldCreateCircularReference(categoryId: number, parentId: number | undefined): Promise<boolean> {
    if (!parentId) return false;
    if (categoryId === parentId) return true;

    // Traverse up the parent chain to check for cycles
    let currentParentId: number | undefined = parentId;
    const visited = new Set<number>([categoryId]);

    while (currentParentId) {
      if (visited.has(currentParentId)) {
        return true; // Circular reference detected
      }
      visited.add(currentParentId);

      const parent = await this.findById(currentParentId);
      if (!parent) break;
      currentParentId = parent.parent_id;
    }

    return false;
  }

  /**
   * Create a new category with auto-increment ID
   * Validates slug uniqueness and prevents circular parent references
   */
  async create(data: CreateCategoryData): Promise<Category> {
    const now = new Date().toISOString();

    // Check slug uniqueness
    const existingCategory = await this.findBySlug(data.slug);
    if (existingCategory && !existingCategory.deleted_at) {
      throw new Error(`Category with slug '${data.slug}' already exists`);
    }

    const id = await this.getNextId();

    // Check for circular reference
    if (data.parent_id) {
      const isCircular = await this.wouldCreateCircularReference(id, data.parent_id);
      if (isCircular) {
        throw new Error('Cannot create category: circular parent reference detected');
      }
    }

    const category: Category = {
      id,
      name: data.name,
      slug: data.slug,
      description: data.description,
      parent_id: data.parent_id,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildCategoryItem(category);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return category;
  }

  /**
   * Find category by ID (strongly consistent read)
   */
  async findById(id: number): Promise<Category | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `CATEGORY#${id}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToCategory(result.data);
  }

  /**
   * Find category by slug using GSI1 (eventually consistent)
   */
  async findBySlug(slug: string): Promise<Category | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `CATEGORY_SLUG#${slug}`,
      },
      limit: 1,
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToCategory(result.data[0]);
  }

  /**
   * Find all categories with pagination (eventually consistent)
   * Excludes soft-deleted categories
   */
  async findAll(params: PaginationParams = {}): Promise<PaginatedResponse<Category>> {
    // Query all root categories and their descendants
    // For simplicity, we'll use a scan-like approach via GSI2 to get all categories
    // In production, consider implementing cursor-based pagination across multiple GSI2 queries
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :gsi2pk',
      expressionAttributeValues: {
        ':gsi2pk': 'CATEGORY_PARENT#ROOT',
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      filterExpression: 'attribute_not_exists(deleted_at)',
    });

    return {
      items: result.data.map(item => this.mapToCategory(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Update category by ID
   * Validates slug uniqueness and prevents circular parent references
   */
  async update(id: number, data: UpdateCategoryData): Promise<Category | null> {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
    };

    // Check slug uniqueness if slug is being updated
    if (data.slug !== undefined) {
      const existingCategory = await this.findBySlug(data.slug);
      if (existingCategory && existingCategory.id !== id && !existingCategory.deleted_at) {
        throw new Error(`Category with slug '${data.slug}' already exists`);
      }
    }

    // Check for circular reference if parent_id is being updated
    if (data.parent_id !== undefined) {
      const isCircular = await this.wouldCreateCircularReference(id, data.parent_id);
      if (isCircular) {
        throw new Error('Cannot update category: circular parent reference detected');
      }
    }

    // Build updates object with only provided fields
    if (data.name !== undefined) updates.name = data.name;
    if (data.slug !== undefined) updates.slug = data.slug;
    if (data.description !== undefined) updates.description = data.description;
    if (data.parent_id !== undefined) updates.parent_id = data.parent_id;

    // Update GSI attributes if relevant fields are changed
    const needsGSIUpdate = data.slug !== undefined || data.name !== undefined || data.parent_id !== undefined;
    let current: any | null = null;

    if (needsGSIUpdate) {
      const currentResult = await this.dynamoDB.get({
        key: {
          PK: `CATEGORY#${id}`,
          SK: 'METADATA',
        },
        projectionExpression: '#name, slug, parent_id, created_at',
        expressionAttributeNames: {
          '#name': 'name',
        },
        consistentRead: true,
      });

      if (!currentResult.data) return null;
      current = currentResult.data;
    }

    if (data.slug !== undefined) {
      updates.GSI1PK = `CATEGORY_SLUG#${data.slug}`;
      const createdAt = current?.created_at || now;
      updates.GSI1SK = createdAt;
    }

    if (data.name !== undefined || data.parent_id !== undefined) {
      const newName = data.name ?? current.name;
      const newParentId = data.parent_id !== undefined ? data.parent_id : current.parent_id;
      updates.GSI2PK = `CATEGORY_PARENT#${newParentId || 'ROOT'}`;
      updates.GSI2SK = `${newName}#${id}`;
    }

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `CATEGORY#${id}`,
          SK: 'METADATA',
        },
        updates,
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToCategory(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Soft delete category
   * Note: Does not cascade to child categories or product links
   */
  async softDelete(id: number): Promise<Category | null> {
    try {
      const result = await this.dynamoDB.softDelete({
        key: {
          PK: `CATEGORY#${id}`,
          SK: 'METADATA',
        },
        deletedAtField: 'deleted_at',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToCategory(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Find categories by parent ID using GSI2 (eventually consistent)
   * Excludes soft-deleted categories
   */
  async findByParentId(parentId: number | null, params: PaginationParams = {}): Promise<PaginatedResponse<Category>> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :gsi2pk',
      expressionAttributeValues: {
        ':gsi2pk': `CATEGORY_PARENT#${parentId || 'ROOT'}`,
      },
      limit: params.limit || 30,
      exclusiveStartKey: params.lastEvaluatedKey,
      filterExpression: 'attribute_not_exists(deleted_at)',
    });

    return {
      items: result.data.map(item => this.mapToCategory(item)),
      lastEvaluatedKey: result.lastEvaluatedKey,
      count: result.count,
    };
  }

  /**
   * Get all parent categories (ancestors) for a given category
   * Returns array from immediate parent to root (ordered)
   */
  async getAncestors(id: number): Promise<Category[]> {
    const ancestors: Category[] = [];
    let currentParentId: number | undefined;

    // Get the starting category to find its parent
    const startCategory = await this.findById(id);
    if (!startCategory || startCategory.deleted_at) {
      return ancestors;
    }
    
    currentParentId = startCategory.parent_id;

    // Walk up the parent chain
    while (currentParentId) {
      const parent = await this.findById(currentParentId);
      if (!parent || parent.deleted_at) break;

      ancestors.push(parent);
      currentParentId = parent.parent_id;
    }

    return ancestors;
  }

  /**
   * Get all child categories (descendants) recursively
   * Returns all descendants at all levels
   */
  async getDescendants(id: number): Promise<Category[]> {
    const descendants: Category[] = [];
    const queue: number[] = [id];
    const visited = new Set<number>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const children = await this.findByParentId(currentId);
      for (const child of children.items) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return descendants;
  }

  /**
   * Get top-level categories (categories with no parent)
   * Alias for findByParentId(null)
   */
  async findRootCategories(params: PaginationParams = {}): Promise<PaginatedResponse<Category>> {
    return this.findByParentId(null, params);
  }

  /**
   * Get all products in a category
   */
  async getProducts(categoryId: number): Promise<number[]> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `CATEGORY#${categoryId}`,
        ':sk': 'PRODUCT#',
      },
    });

    return result.data.map(item => parseInt(item.SK.replace('PRODUCT#', ''), 10));
  }

  /**
   * Add bidirectional product-category link
   * Creates links in both directions for efficient queries
   */
  async addProduct(categoryId: number, productId: number): Promise<CategoryProduct> {
    const now = new Date().toISOString();

    // Create bidirectional links using BatchWriteCommand
    const { BatchWriteCommand } = await import('@aws-sdk/lib-dynamodb');
    const tableName = (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME;

    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: [
          {
            PutRequest: {
              Item: {
                PK: `CATEGORY#${categoryId}`,
                SK: `PRODUCT#${productId}`,
                category_id: categoryId,
                product_id: productId,
                created_at: now,
              },
            },
          },
          {
            PutRequest: {
              Item: {
                PK: `PRODUCT#${productId}`,
                SK: `CATEGORY#${categoryId}`,
                product_id: productId,
                category_id: categoryId,
                created_at: now,
              },
            },
          },
        ],
      },
    });

    const client = (this.dynamoDB as any).client;
    await client.send(command);

    return {
      category_id: categoryId,
      product_id: productId,
      created_at: now,
    };
  }

  /**
   * Remove bidirectional product-category link
   */
  async removeProduct(categoryId: number, productId: number): Promise<void> {
    // Delete both directions of the link using BatchWriteCommand
    const { BatchWriteCommand } = await import('@aws-sdk/lib-dynamodb');
    const tableName = (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME;

    const command = new BatchWriteCommand({
      RequestItems: {
        [tableName]: [
          {
            DeleteRequest: {
              Key: {
                PK: `CATEGORY#${categoryId}`,
                SK: `PRODUCT#${productId}`,
              },
            },
          },
          {
            DeleteRequest: {
              Key: {
                PK: `PRODUCT#${productId}`,
                SK: `CATEGORY#${categoryId}`,
              },
            },
          },
        ],
      },
    });

    const client = (this.dynamoDB as any).client;
    await client.send(command);
  }
}
