import { DynamoDBHelper, EntityPrefix, GSI } from '../database/dynamodb-client';

export interface Cart {
  id: string; // Using session_id as ID
  session_id: string;
  user_id?: number;
  discount_code?: string;
  discount_amount: number;
  created_at: string;
  updated_at: string;
  expires_at: string; // TTL - 30 days from creation
  // Populated relations
  items?: CartItem[];
}

export interface CartItem {
  id: number;
  cart_id: string;
  product_id: number;
  variant_id?: number;
  quantity: number;
  price_at_time: number;
  created_at: string;
  updated_at: string;
  // Populated from product
  product_name?: string;
  product_slug?: string;
  variant_name?: string;
  product_image?: string;
}

const CART_TTL_DAYS = 30;

export class CartRepository {
  
  /**
   * Create or get a cart by session ID
   */
  static async getOrCreate(sessionId: string, userId?: number): Promise<Cart> {
    const existing = await this.findBySessionId(sessionId);
    if (existing) return existing;
    
    return this.create({ session_id: sessionId, user_id: userId });
  }

  /**
   * Create a new cart
   */
  static async create(data: { session_id: string; user_id?: number }): Promise<Cart> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);
    
    const cart: Cart = {
      id: data.session_id,
      session_id: data.session_id,
      user_id: data.user_id,
      discount_code: undefined,
      discount_amount: 0,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.CART}#${data.session_id}`,
      SK: 'METADATA',
      GSI1PK: data.user_id ? `USER_CART#${data.user_id}` : `SESSION_CART#${data.session_id}`,
      GSI1SK: now.toISOString(),
      entity_type: 'Cart',
      ttl: Math.floor(expiresAt.getTime() / 1000), // TTL in seconds
      ...cart,
    });

    return cart;
  }

  /**
   * Find cart by session ID
   */
  static async findBySessionId(sessionId: string): Promise<Cart | null> {
    const item = await DynamoDBHelper.get(`${EntityPrefix.CART}#${sessionId}`, 'METADATA');
    if (!item) return null;
    return this.mapToCart(item);
  }

  /**
   * Find cart by user ID
   */
  static async findByUserId(userId: number): Promise<Cart | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `USER_CART#${userId}`,
      },
      scanIndexForward: false,
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToCart(items[0]);
  }

  /**
   * Find cart with items
   */
  static async findBySessionIdWithItems(sessionId: string): Promise<Cart | null> {
    const cart = await this.findBySessionId(sessionId);
    if (!cart) return null;

    cart.items = await CartItemRepository.findByCartId(sessionId);
    return cart;
  }

  /**
   * Update cart
   */
  static async update(sessionId: string, data: Partial<Cart>): Promise<Cart> {
    const { id: _, session_id: __, created_at: ___, items: ____, ...updateData } = data as any;
    
    const { updateExpression, expressionAttributeValues, expressionAttributeNames } = 
      DynamoDBHelper.buildUpdateExpression(updateData);

    const result = await DynamoDBHelper.update(
      `${EntityPrefix.CART}#${sessionId}`,
      'METADATA',
      updateExpression,
      expressionAttributeValues,
      expressionAttributeNames
    );

    return this.mapToCart(result);
  }

  /**
   * Apply discount code
   */
  static async applyDiscount(sessionId: string, discountCode: string, discountAmount: number): Promise<Cart> {
    return this.update(sessionId, {
      discount_code: discountCode,
      discount_amount: discountAmount,
    });
  }

  /**
   * Remove discount
   */
  static async removeDiscount(sessionId: string): Promise<Cart> {
    const result = await DynamoDBHelper.update(
      `${EntityPrefix.CART}#${sessionId}`,
      'METADATA',
      'REMOVE discount_code SET discount_amount = :zero, updated_at = :updated_at',
      {
        ':zero': 0,
        ':updated_at': new Date().toISOString(),
      }
    );

    return this.mapToCart(result);
  }

  /**
   * Delete cart and all its items
   */
  static async delete(sessionId: string): Promise<void> {
    // First delete all items
    await CartItemRepository.deleteByCartId(sessionId);
    
    // Then delete the cart
    await DynamoDBHelper.delete(`${EntityPrefix.CART}#${sessionId}`, 'METADATA');
  }

  /**
   * Refresh cart TTL (extend expiration)
   */
  static async refreshTTL(sessionId: string): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + CART_TTL_DAYS * 24 * 60 * 60 * 1000);
    
    await DynamoDBHelper.update(
      `${EntityPrefix.CART}#${sessionId}`,
      'METADATA',
      'SET expires_at = :expires_at, ttl = :ttl, updated_at = :updated_at',
      {
        ':expires_at': expiresAt.toISOString(),
        ':ttl': Math.floor(expiresAt.getTime() / 1000),
        ':updated_at': now.toISOString(),
      }
    );
  }

  /**
   * Calculate cart totals
   */
  static async calculateTotals(sessionId: string): Promise<{ subtotal: number; discount: number; total: number }> {
    const cart = await this.findBySessionIdWithItems(sessionId);
    if (!cart || !cart.items) {
      return { subtotal: 0, discount: 0, total: 0 };
    }

    const subtotal = cart.items.reduce((sum, item) => sum + (item.price_at_time * item.quantity), 0);
    const discount = cart.discount_amount || 0;
    const total = Math.max(0, subtotal - discount);

    return { subtotal, discount, total };
  }

  private static mapToCart(item: any): Cart {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ttl, ...cart } = item;
    return cart as Cart;
  }
}

export class CartItemRepository {
  
  /**
   * Add item to cart
   */
  static async create(data: Omit<CartItem, 'id' | 'created_at' | 'updated_at'>): Promise<CartItem> {
    const id = await DynamoDBHelper.getNextId(EntityPrefix.CART_ITEM);
    const now = new Date().toISOString();
    
    const item: CartItem = {
      ...data,
      id,
      created_at: now,
      updated_at: now,
    };

    await DynamoDBHelper.put({
      PK: `${EntityPrefix.CART}#${data.cart_id}`,
      SK: `ITEM#${id}`,
      GSI1PK: `CARTITEM#${id}`,
      GSI1SK: 'METADATA',
      entity_type: 'CartItem',
      ...item,
    });

    return item;
  }

  /**
   * Find cart items by cart ID
   */
  static async findByCartId(cartId: string): Promise<CartItem[]> {
    const items = await DynamoDBHelper.query({
      keyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      expressionAttributeValues: {
        ':pk': `${EntityPrefix.CART}#${cartId}`,
        ':sk': 'ITEM#',
      },
    });

    return items.map(this.mapToCartItem);
  }

  /**
   * Find cart item by ID
   */
  static async findById(id: number): Promise<CartItem | null> {
    const items = await DynamoDBHelper.query({
      indexName: GSI.GSI1,
      keyConditionExpression: 'GSI1PK = :pk',
      expressionAttributeValues: {
        ':pk': `CARTITEM#${id}`,
      },
      limit: 1,
    });

    if (items.length === 0) return null;
    return this.mapToCartItem(items[0]);
  }

  /**
   * Find item by cart, product, and variant
   */
  static async findByProductVariant(cartId: string, productId: number, variantId?: number): Promise<CartItem | null> {
    const items = await this.findByCartId(cartId);
    return items.find(item => 
      item.product_id === productId && 
      item.variant_id === variantId
    ) || null;
  }

  /**
   * Update cart item quantity
   */
  static async updateQuantity(cartId: string, itemId: number, quantity: number): Promise<CartItem> {
    const result = await DynamoDBHelper.update(
      `${EntityPrefix.CART}#${cartId}`,
      `ITEM#${itemId}`,
      'SET quantity = :quantity, updated_at = :updated_at',
      {
        ':quantity': quantity,
        ':updated_at': new Date().toISOString(),
      }
    );

    return this.mapToCartItem(result);
  }

  /**
   * Delete cart item
   */
  static async delete(cartId: string, itemId: number): Promise<void> {
    await DynamoDBHelper.delete(`${EntityPrefix.CART}#${cartId}`, `ITEM#${itemId}`);
  }

  /**
   * Delete all items in a cart
   */
  static async deleteByCartId(cartId: string): Promise<void> {
    const items = await this.findByCartId(cartId);
    
    const operations = items.map(item => ({
      type: 'delete' as const,
      key: { PK: `${EntityPrefix.CART}#${cartId}`, SK: `ITEM#${item.id}` },
    }));

    if (operations.length > 0) {
      await DynamoDBHelper.batchWrite(operations);
    }
  }

  /**
   * Add or update item in cart
   */
  static async addOrUpdate(cartId: string, productId: number, variantId: number | undefined, quantity: number, priceAtTime: number): Promise<CartItem> {
    const existing = await this.findByProductVariant(cartId, productId, variantId);
    
    if (existing) {
      return this.updateQuantity(cartId, existing.id, existing.quantity + quantity);
    } else {
      return this.create({
        cart_id: cartId,
        product_id: productId,
        variant_id: variantId,
        quantity,
        price_at_time: priceAtTime,
      });
    }
  }

  private static mapToCartItem(item: any): CartItem {
    const { PK, SK, GSI1PK, GSI1SK, entity_type, ...cartItem } = item;
    return cartItem as CartItem;
  }
}
