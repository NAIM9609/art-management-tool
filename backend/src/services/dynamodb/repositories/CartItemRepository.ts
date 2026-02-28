/**
 * CartItemRepository - DynamoDB implementation for CartItem operations
 * 
 * DynamoDB Structure:
 * CartItem:
 *   PK: "CART#${cart_id}"
 *   SK: "ITEM#${id}"
 */

import { DynamoDBOptimized } from '../DynamoDBOptimized';
import { v4 as uuidv4 } from 'uuid';
import {
  CartItem,
} from './types';

export class CartItemRepository {
  private dynamoDB: DynamoDBOptimized;
  
  constructor(dynamoDB: DynamoDBOptimized) {
    this.dynamoDB = dynamoDB;
  }

  /**
   * Map DynamoDB item to CartItem interface
   */
  mapToCartItem(item: Record<string, any>): CartItem {
    return {
      id: item.id,
      cart_id: item.cart_id,
      product_id: item.product_id,
      variant_id: item.variant_id,
      quantity: item.quantity,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  }

  /**
   * Build DynamoDB item from CartItem
   */
  buildCartItemItem(cartItem: CartItem): Record<string, any> {
    const item: Record<string, any> = {
      PK: `CART#${cartItem.cart_id}`,
      SK: `ITEM#${cartItem.id}`,
      id: cartItem.id,
      cart_id: cartItem.cart_id,
      product_id: cartItem.product_id,
      quantity: cartItem.quantity,
      created_at: cartItem.created_at,
      updated_at: cartItem.updated_at,
    };

    if (cartItem.variant_id !== undefined) {
      item.variant_id = cartItem.variant_id;
    }

    return item;
  }

  /**
   * Find all items for a cart (single query)
   */
  async findByCartId(cartId: string): Promise<CartItem[]> {
    const result = await this.dynamoDB.queryEventuallyConsistent({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `CART#${cartId}`,
        ':sk': 'ITEM#',
      },
    });

    return result.data.map(item => this.mapToCartItem(item));
  }

  /**
   * Generate deterministic item ID based on cart, product, and variant
   * This ensures idempotency and prevents race conditions
   */
  private generateItemId(cartId: string, productId: number, variantId: number | undefined): string {
    const crypto = require('crypto');
    const key = `${cartId}:${productId}:${variantId ?? 'null'}`;
    return crypto.createHash('sha256').update(key).digest('hex').substring(0, 32);
  }

  /**
   * Add item to cart or update quantity if already exists
   * Uses deterministic IDs to prevent race conditions
   */
  async addItem(
    cartId: string,
    productId: number,
    variantId: number | undefined,
    quantity: number
  ): Promise<CartItem> {
    const now = new Date().toISOString();
    const id = this.generateItemId(cartId, productId, variantId);

    const cartItem: CartItem = {
      id,
      cart_id: cartId,
      product_id: productId,
      variant_id: variantId,
      quantity,
      created_at: now,
      updated_at: now,
    };

    const item = this.buildCartItemItem(cartItem);

    try {
      // Try to create new item
      await this.dynamoDB.put({
        item,
        conditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
      });
      return cartItem;
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        // Item already exists, update quantity instead
        const existingItem = await this.findById(cartId, id);
        if (existingItem) {
          return await this.updateQuantity(cartId, id, existingItem.quantity + quantity);
        }
      }
      throw error;
    }
  }

  /**
   * Update item quantity atomically using SET operation
   */
  async updateQuantity(cartId: string, itemId: string, newQuantity: number): Promise<CartItem> {
    const now = new Date().toISOString();
    
    try {
      const result = await this.dynamoDB.update({
        key: {
          PK: `CART#${cartId}`,
          SK: `ITEM#${itemId}`,
        },
        updates: {
          quantity: newQuantity,
          updated_at: now,
        },
        conditionExpression: 'attribute_exists(PK)',
        returnValues: 'ALL_NEW',
      });

      if (!result.data) {
        throw new Error('Item not found');
      }

      return this.mapToCartItem(result.data);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException' || error.code === 'ConditionalCheckFailedException') {
        throw new Error('Item not found');
      }
      throw error;
    }
  }

  /**
   * Remove item from cart
   */
  async removeItem(cartId: string, itemId: string): Promise<void> {
    await this.dynamoDB.delete({
      key: {
        PK: `CART#${cartId}`,
        SK: `ITEM#${itemId}`,
      },
    });
  }

  /**
   * Clear all items from cart (batch delete)
   */
  async clearCart(cartId: string): Promise<void> {
    const items = await this.findByCartId(cartId);
    
    if (items.length === 0) {
      return;
    }

    const deleteItems = items.map(item => ({
      type: 'delete' as const,
      key: {
        PK: `CART#${cartId}`,
        SK: `ITEM#${item.id}`,
      },
    }));

    await this.dynamoDB.batchWriteOptimized({
      items: deleteItems,
    });
  }

  /**
   * Find item by cart ID and item ID
   */
  async findById(cartId: string, itemId: string): Promise<CartItem | null> {
    const result = await this.dynamoDB.get({
      key: {
        PK: `CART#${cartId}`,
        SK: `ITEM#${itemId}`,
      },
      consistentRead: true,
    });

    if (!result.data) {
      return null;
    }

    return this.mapToCartItem(result.data);
  }

  /**
   * Merge items from source cart to destination cart.
   *
   * For items that exist in both carts with same product/variant, sum quantities.
   *
   * NOTE: This operation is NOT atomic. It performs multiple sequential
   * DynamoDB writes (updates/additions/deletes). If any write fails partway
   * through, some items may already have been merged into the destination
   * cart while others are not, and the source cart will not be cleared.
   *
   * Callers should be prepared to handle partial success and may need to
   * trigger reconciliation or retry logic based on the error thrown from
   * this method.
   *
   * @returns The number of items successfully merged
   */
  async mergeItems(sourceCartId: string, destCartId: string): Promise<number> {
    const sourceItems = await this.findByCartId(sourceCartId);
    const destItems = await this.findByCartId(destCartId);

    // Track which source items have been successfully merged
    const mergedItemIds: string[] = [];

    try {
      for (const sourceItem of sourceItems) {
        const matchingDestItem = destItems.find(
          item => item.product_id === sourceItem.product_id && item.variant_id === sourceItem.variant_id
        );

        if (matchingDestItem) {
          // Item exists in destination - add quantities
          await this.updateQuantity(
            destCartId,
            matchingDestItem.id,
            matchingDestItem.quantity + sourceItem.quantity
          );
        } else {
          // Item doesn't exist in destination - create new item directly
          // to avoid redundant query in addItem
          const now = new Date().toISOString();
          const id = this.generateItemId(destCartId, sourceItem.product_id, sourceItem.variant_id);

          const newItem: CartItem = {
            id,
            cart_id: destCartId,
            product_id: sourceItem.product_id,
            variant_id: sourceItem.variant_id,
            quantity: sourceItem.quantity,
            created_at: now,
            updated_at: now,
          };

          const item = this.buildCartItemItem(newItem);

          await this.dynamoDB.put({
            item,
            conditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
          });
        }

        mergedItemIds.push(sourceItem.id);
      }

      // Clear source cart after merge
      await this.clearCart(sourceCartId);

      return mergedItemIds.length;
    } catch (error) {
      // Log partial success information for diagnosis and potential recovery
      console.error(
        'Error while merging cart items',
        {
          sourceCartId,
          destCartId,
          totalSourceItems: sourceItems.length,
          mergedItemCount: mergedItemIds.length,
          mergedItemIds,
        },
        error
      );
      // Rethrow so callers know the merge did not fully succeed
      throw error;
    }
  }
}
