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
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  CartItem,
  CreateCartItemData,
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
   * Add item to cart or update quantity if already exists
   */
  async addItem(
    cartId: string,
    productId: number,
    variantId: number | undefined,
    quantity: number
  ): Promise<CartItem> {
    // First check if item already exists
    const existingItems = await this.findByCartId(cartId);
    const existingItem = existingItems.find(
      item => item.product_id === productId && item.variant_id === variantId
    );

    if (existingItem) {
      // Update existing item quantity
      return await this.updateQuantity(cartId, existingItem.id, existingItem.quantity + quantity);
    }

    // Create new item
    const now = new Date().toISOString();
    const id = uuidv4();

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

    await this.dynamoDB.put({
      item,
      conditionExpression: 'attribute_not_exists(PK) AND attribute_not_exists(SK)',
    });

    return cartItem;
  }

  /**
   * Update item quantity atomically using ADD operation
   */
  async updateQuantity(cartId: string, itemId: string, newQuantity: number): Promise<CartItem> {
    const now = new Date().toISOString();
    
    // Use atomic SET operation for quantity
    const command = new UpdateCommand({
      TableName: (this.dynamoDB as any).tableName || process.env.DYNAMODB_TABLE_NAME,
      Key: {
        PK: `CART#${cartId}`,
        SK: `ITEM#${itemId}`,
      },
      UpdateExpression: 'SET quantity = :quantity, updated_at = :now',
      ExpressionAttributeValues: {
        ':quantity': newQuantity,
        ':now': now,
      },
      ConditionExpression: 'attribute_exists(PK)',
      ReturnValues: 'ALL_NEW',
    });

    try {
      const client = (this.dynamoDB as any).client;
      const result = await client.send(command);
      
      if (!result.Attributes) {
        throw new Error('Item not found');
      }

      return this.mapToCartItem(result.Attributes);
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
   * Merge items from source cart to destination cart
   * For items that exist in both carts with same product/variant, sum quantities
   */
  async mergeItems(sourceCartId: string, destCartId: string): Promise<void> {
    const sourceItems = await this.findByCartId(sourceCartId);
    const destItems = await this.findByCartId(destCartId);

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
        // Item doesn't exist in destination - create new item
        await this.addItem(
          destCartId,
          sourceItem.product_id,
          sourceItem.variant_id,
          sourceItem.quantity
        );
      }
    }

    // Clear source cart after merge
    await this.clearCart(sourceCartId);
  }
}
