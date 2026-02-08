import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  // Populated relations
  parent?: Category;
  children?: Category[];
  products?: any[];
}

export class CategoryRepository {
  
  /**
   * Create a new category
   */
  static async create(data: Omit<Category, 'id' | 'created_at' | 'updated_at'>): Promise<Category> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.CATEGORY);
    const now = new Date().toISOString();
    
    const category: Category = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.CATEGORY}#${id}`,
      SK: 'METADATA',
      GSI1PK: `CATEGORY_SLUG#${data.slug}`,
      GSI1SK: `${EntityPrefix.CATEGORY}#${id}`,
      // Parent lookup GSI
      GSI2PK: data.parent_id ? `CATEGORY_PARENT#${data.parent_id}` : 'CATEGORY_ROOT',
      GSI2SK: `${EntityPrefix.CATEGORY}#${id}`,
      entity_type: 'Category',
      ...category,
    });

    return category;
  }

  /**
   * Find category by ID
   */
  static async findById(id: number, includeDeleted: boolean = false): Promise<Category | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.CATEGORY}#${id}`, 'METADATA');
    if (!item) return null;
    if (!includeDeleted && item.deleted_at) return null;
    return this.mapToCategory(item);
  }

  /**
   * Find category by slug
   */
  static async findBySlug(slug: string): Promise<Category | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `CATEGORY_SLUG#${slug}`,
      },
      limit: 1,
    });

    if (items.length === 0 || items[0].deleted_at) return null;
    return this.mapToCategory(items[0]);
  }

  /**
   * Find all categories
   */
  static async findAll(includeDeleted: boolean = false): Promise<Category[]> {
    // Scan for all categories (this is acceptable for a small number of categories)
    const items = await DynamoDBHelper.scan({
      filterExpression: 'entity_type = :type',
      expressionAttributeValues: {
        ':type': 'Category',
      },
    });

    return items
      .filter(item => includeDeleted || !item.deleted_at)
      .map(this.mapToCategory);
  }

  /**
   * Find root categories (no parent)
   */
  static async findRootCategories(): Promise<Category[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI2,
      keyConditionExpression: 'GSI2PK = :pk',
      expressionAttributeValues: {
        ':pk': 'CATEGORY_ROOT',
      },
    });

    return items
      .filter(item => !item.deleted_at)
      .map(this.mapToCategory);
  }

  /**
   * Find children of a category
   */
  static async findChildren(parentId: number): Promise<Category[]> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI2,
      keyConditionExpression: 'GSI2PK = :pk',
      expressionAttributeValues: {
        ':pk': `CATEGORY_PARENT#${parentId}`,
      },
    });

    return items
      .filter(item => !item.deleted_at)
      .map(this.mapToCategory);
  }

  /**
   * Find category with parent populated
   */
  static async findByIdWithParent(id: number): Promise<Category | null> {
    const category = await this.findById(id);
    if (!category) return null;

    if (category.parent_id) {
      category.parent = await this.findById(category.parent_id) || undefined;
    }

    return category;
  }

  /**
   * Find category with children populated
   */
  static async findByIdWithChildren(id: number): Promise<Category | null> {
    const category = await this.findById(id);
    if (!category) return null;

    category.children = await this.findChildren(id);
    return category;
  }

  /**
   * Get category tree (hierarchical structure)
   */
  static async getCategoryTree(): Promise<Category[]> {
    const allCategories = await this.findAll();

    const buildTree = (categories: Category[], parentId?: number): Category[] => {
      return categories
        .filter(c => c.parent_id === parentId)
        .map(c => ({
          ...c,
          children: buildTree(allCategories, c.id),
        }));
    };

    return buildTree(allCategories, undefined);
  }

  /**
   * Update a category
   */
  static async update(id: number, data: Partial<Category>): Promise<Category> {
    const { id: _, created_at: __, children: ___, parent: ____, products: _____, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.CATEGORY}#${id}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    // Update GSI values if slug or parent changed
    if (data.slug || data.parent_id !== undefined) {
      const category = await this.findById(id);
      if (category) {
        await DynamoDBHelper.put({
          PK: `${EntityPrefix.CATEGORY}#${id}`,
          SK: 'METADATA',
          GSI1PK: `CATEGORY_SLUG#${category.slug}`,
          GSI1SK: `${EntityPrefix.CATEGORY}#${id}`,
          GSI2PK: category.parent_id ? `CATEGORY_PARENT#${category.parent_id}` : 'CATEGORY_ROOT',
          GSI2SK: `${EntityPrefix.CATEGORY}#${id}`,
          entity_type: 'Category',
          ...category,
        });
      }
    }

    return this.mapToCategory(result);
  }

  /**
   * Soft delete a category
   */
  static async softDelete(id: number): Promise<void> {
    await DynamoDBHelper.softDelete(`${EntityPrefix.CATEGORY}#${id}`, 'METADATA');
  }

  /**
   * Hard delete a category
   */
  static async delete(id: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.CATEGORY}#${id}`, 'METADATA');
  }

  /**
   * Add product to category (create relationship)
   */
  static async addProduct(categoryId: number, productId: number): Promise<void> {
    const now = new Date().toISOString();
    
    // Create bidirectional relationship
    await DynamoDBHelper.batchWrite([
      {
        type: 'put',
        item: {
          PK: `${EntityPrefix.PRODUCT}#${productId}`,
          SK: `${EntityPrefix.CATEGORY}#${categoryId}`,
          entity_type: 'ProductCategory',
          product_id: productId,
          category_id: categoryId,
          created_at: now,
        },
      },
      {
        type: 'put',
        item: {
          PK: `${EntityPrefix.CATEGORY}#${categoryId}`,
          SK: `${EntityPrefix.PRODUCT}#${productId}`,
          entity_type: 'ProductCategory',
          product_id: productId,
          category_id: categoryId,
          created_at: now,
        },
      },
    ]);
  }

  /**
   * Remove product from category
   */
  static async removeProduct(categoryId: number, productId: number): Promise<void> {
    await DynamoDBHelper.batchWrite([
      {
        type: 'delete',
        key: { PK: `${EntityPrefix.PRODUCT}#${productId}`, SK: `${EntityPrefix.CATEGORY}#${categoryId}` },
      },
      {
        type: 'delete',
        key: { PK: `${EntityPrefix.CATEGORY}#${categoryId}`, SK: `${EntityPrefix.PRODUCT}#${productId}` },
      },
    ]);
  }

  /**
   * Get products in a category
   */
  static async getProducts(categoryId: number): Promise<number[]> {
    const items = await DynamoDBHelper.query({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `${EntityPrefix.CATEGORY}#${categoryId}`,
        ':sk': `${EntityPrefix.PRODUCT}#`,
      },
    });

    return items.map(item => item.product_id);
  }

  private static mapToCategory(item: any): Category {
    const { PK, SK, GSI1PK, GSI1SK, GSI2PK, GSI2SK, entity_type, ...category } = item;
    return category as Category;
  }
}
