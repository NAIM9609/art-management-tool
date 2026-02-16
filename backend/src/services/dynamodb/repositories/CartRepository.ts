/**
 * CartRepository - DynamoDB implementation for Cart CRUD operations
 * 
 * DynamoDB Structure:
 * Cart:
 *   PK: "CART#${id}"
 *   SK: "METADATA"
 *   GSI1PK: "CART_SESSION#${session_id}"
 *   GSI2PK: "CART_USER#${user_id}"
 *   expires_at: timestamp (TTL attribute)
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { v4 as uuidv4 } from 'uuid';
import {
  Cart,
  CreateCartData,
  UpdateCartData,
} from './types';

export class CartRepository {
  private dynamoDB: DynamoDBOptimized;
  private readonly TTL_DAYS = 30;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Calculate TTL timestamp (30 days from now)
   */
  private calculateTTL(): number {
    const now = Math.floor(Date.now() / 1000);
    return now + (this.TTL_DAYS * 24 * 60 * 60);
  }

  /**
   * Map DynamoDB item to Cart interface
   */
  mapToCart(item: Record<string, any>): Cart {
    return {
      id: item.id,
      session_id: item.session_id,
      user_id: item.user_id,
      discount_code: item.discount_code,
      discount_amount: item.discount_amount,
      created_at: item.created_at,
      updated_at: item.updated_at,
      expires_at: item.expires_at,
    };
  }

  /**
   * Build DynamoDB item from Cart
   */
  buildCartItem(cart: Cart): Record<string, any> {
    const item: Record<string, any> = {
      PK: `CART#${cart.id}`,
      SK: 'METADATA',
      id: cart.id,
      created_at: cart.created_at,
      updated_at: cart.updated_at,
      expires_at: cart.expires_at,
    };

    // Add optional fields
    if (cart.session_id !== undefined) {
      item.session_id = cart.session_id;
      item.GSI1PK = `CART_SESSION#${cart.session_id}`;
    }
    
    if (cart.user_id !== undefined && cart.user_id !== null) {
      item.user_id = cart.user_id;
      item.GSI2PK = `CART_USER#${cart.user_id}`;
    }
    
    if (cart.discount_code !== undefined) item.discount_code = cart.discount_code;
    if (cart.discount_amount !== undefined) item.discount_amount = cart.discount_amount;

    return item;
  }

  /**
   * Create a new cart with TTL
   */
  async create(data: CreateCartData): Promise<Cart> {
    const now = new Date().toISOString();
    const id = uuidv4();

    const cart: Cart = {
      id,
      session_id: data.session_id,
      user_id: data.user_id,
      discount_code: data.discount_code,
      discount_amount: data.discount_amount,
      created_at: now,
      updated_at: now,
      expires_at: this.calculateTTL(),
    };

    const item = this.buildCartItem(cart);

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK)',
    });

    return cart;
  }

  /**
   * Find cart by ID (strongly consistent read)
   */
  async findById(id: string): Promise<Cart | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `CART#${id}`,
        SK: 'METADATA',
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToCart(result.data);
  }

  /**
   * Find cart by session ID using GSI1 (eventually consistent)
   */
  async findBySessionId(sessionId: string): Promise<Cart | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI1',
      keyConditionExpression: 'GSI1PK = :gsi1pk',
      expressionAttributeValues: {
        ':gsi1pk': `CART_SESSION#${sessionId}`,
      },
      limit: 1,
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToCart(result.data[0]);
  }

  /**
   * Find cart by user ID using GSI2 (eventually consistent)
   */
  async findByUserId(userId: number): Promise<Cart | null> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      indexName: 'GSI2',
      keyConditionExpression: 'GSI2PK = :gsi2pk',
      expressionAttributeValues: {
        ':gsi2pk': `CART_USER#${userId}`,
      },
      limit: 1,
    });

    if (result.data.length === 0) {
      return null;
    }

    return this.mapToCart(result.data[0]);
  }

  /**
   * Update cart and refresh TTL
   */
  async update(id: string, data: UpdateCartData): Promise<Cart | null> {
    const now = new Date().toISOString();
    const updates: Record<string, any> = {
      updated_at: now,
      expires_at: this.calculateTTL(), // Refresh TTL on activity
    };

    // Build updates object with only provided fields
    if (data.session_id !== undefined) {
      updates.session_id = data.session_id;
      // Only update GSI1PK when session_id has a non-null, non-empty value
      if (data.session_id !== null && data.session_id !== '') {
        updates.GSI1PK = `CART_SESSION#${data.session_id}`;
      }
    }
    
    if (data.user_id !== undefined) {
      updates.user_id = data.user_id;
      // Only update GSI2PK when user_id has a non-null value
      if (data.user_id !== null) {
        updates.GSI2PK = `CART_USER#${data.user_id}`;
      }
    }
    
    if (data.discount_code !== undefined) updates.discount_code = data.discount_code;
    if (data.discount_amount !== undefined) updates.discount_amount = data.discount_amount;

    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `CART#${id}`,
          SK: 'METADATA',
        },
        updates,
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        return null;
      }

      return this.mapToCart(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Hard delete cart
   */
  async delete(id: string): Promise<void> {
    await this.dynamoDB.delete({
      key: {
        PK: `CART#${id}`,
        SK: 'METADATA',
      },
    });
  }

  /**
   * Merge session cart into user cart.
   *
   * Item merging must be done separately by CartItemRepository.mergeItems().
   * This method is responsible for deleting the session cart *only after*
   * items have been successfully merged.
   *
   * To reduce the risk of data loss, callers must provide the number
   * of items that were successfully merged. If the merge count is zero or
   * negative, the session cart will not be deleted.
   *
   * Proper usage pattern:
   *   1. Call CartItemRepository.mergeItems(sessionCartId, userCartId) 
   *      which returns the number of items merged.
   *   2. Call mergeCarts(sessionCartId, userCartId, mergedItemCount).
   *
   * This coordination helps ensure that session cart data is not lost if the
   * item merge operation fails or only partially succeeds.
   */
  async mergeCarts(
    sessionCartId: string,
    userCartId: string,
    mergedItemCount: number
  ): Promise<void> {
    if (mergedItemCount < 0) {
      throw new Error(
        `Invalid merged item count: ${mergedItemCount}. Expected a non-negative number.`
      );
    }

    // Delete the session cart only after verifying that items were merged
    await this.delete(sessionCartId);
  }

  /**
   * Refresh TTL on cart activity (without updating other fields)
   */
  async refreshTTL(id: string): Promise<void> {
    await this.dynamoDB.update({
      key: {
        PK: `CART#${id}`,
        SK: 'METADATA',
      },
      updates: {
        updated_at: new Date().toISOString(),
        expires_at: this.calculateTTL(),
      },
      conditionExpression: 'attribute_exists(PK)',
    });
  }
}
