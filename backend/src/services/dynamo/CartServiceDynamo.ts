/**
 * CartService using DynamoDB repositories
 * Provides full API compatibility with the original TypeORM-based service
 */

import { config } from '../../config';
import { 
  CartRepository, 
  CartItemRepository,
  ProductRepository,
  ProductImageRepository,
  ProductVariantRepository,
  Cart,
  CartItem,
} from '../../repositories';

export { Cart, CartItem };

export class CartServiceDynamo {
  
  /**
   * Validate stock availability
   */
  private async validateStock(productId: number, variantId: number | undefined, quantity: number): Promise<void> {
    if (variantId) {
      const variant = await ProductVariantRepository.findById(variantId);
      if (variant && variant.stock < quantity) {
        throw new Error(`Insufficient stock available. Requested: ${quantity}, Available: ${variant.stock}`);
      }
    }
  }

  /**
   * Get or create a cart for a session
   */
  async getOrCreateCart(sessionId: string, userId?: number): Promise<Cart> {
    return CartRepository.getOrCreate(sessionId, userId);
  }

  /**
   * Add item to cart
   */
  async addItem(sessionId: string, productId: number, variantId: number | undefined, quantity: number): Promise<Cart> {
    if (quantity <= 0) {
      throw new Error('Invalid quantity');
    }

    const product = await ProductRepository.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (variantId) {
      const variant = await ProductVariantRepository.findById(variantId);
      if (!variant) {
        throw new Error('Variant not found');
      }
    }

    await this.getOrCreateCart(sessionId);

    // Check existing item
    const existingItem = await CartItemRepository.findByProductVariant(sessionId, productId, variantId);
    const finalQuantity = existingItem ? existingItem.quantity + quantity : quantity;

    // Validate stock
    await this.validateStock(productId, variantId, finalQuantity);

    // Calculate price
    let price = product.base_price;
    if (variantId) {
      const variant = await ProductVariantRepository.findById(variantId);
      if (variant) {
        price += variant.price_adjustment;
      }
    }

    if (existingItem) {
      await CartItemRepository.updateQuantity(sessionId, existingItem.id, finalQuantity);
    } else {
      await CartItemRepository.create({
        cart_id: sessionId,
        product_id: productId,
        variant_id: variantId,
        quantity,
        price_at_time: price,
      });
    }

    // Refresh TTL
    await CartRepository.refreshTTL(sessionId);

    return this.getCartWithItems(sessionId);
  }

  /**
   * Update item quantity in cart
   */
  async updateItem(sessionId: string, itemId: number, quantity: number): Promise<Cart> {
    if (quantity < 0) {
      throw new Error('Invalid quantity');
    }

    const items = await CartItemRepository.findByCartId(sessionId);
    const item = items.find(i => i.id === itemId);

    if (!item) {
      throw new Error('Item not found');
    }

    if (quantity === 0) {
      await CartItemRepository.delete(sessionId, itemId);
    } else {
      await this.validateStock(item.product_id, item.variant_id, quantity);
      await CartItemRepository.updateQuantity(sessionId, itemId, quantity);
    }

    return this.getCartWithItems(sessionId);
  }

  /**
   * Remove item from cart
   */
  async removeItem(sessionId: string, itemId: number): Promise<Cart> {
    const items = await CartItemRepository.findByCartId(sessionId);
    const item = items.find(i => i.id === itemId);

    if (!item) {
      throw new Error('Item not found');
    }

    await CartItemRepository.delete(sessionId, itemId);
    return this.getCartWithItems(sessionId);
  }

  /**
   * Clear all items from cart
   */
  async clearCart(sessionId: string): Promise<void> {
    await CartItemRepository.deleteByCartId(sessionId);
  }

  /**
   * Get cart with all items
   */
  async getCart(sessionId: string): Promise<Cart> {
    return this.getCartWithItems(sessionId);
  }

  /**
   * Get cart with populated items
   */
  private async getCartWithItems(sessionId: string): Promise<Cart> {
    const cart = await CartRepository.findBySessionIdWithItems(sessionId);
    if (!cart) {
      return CartRepository.create({ session_id: sessionId });
    }

    // Populate product details for each item
    if (cart.items) {
      const productCache = new Map<number, any>();
      const variantCache = new Map<number, any>();
      const productIds = new Set<number>();

      for (const item of cart.items) {
        productIds.add(item.product_id);
      }

      const imageCache = new Map<number, string | undefined>();
      await Promise.all(
        Array.from(productIds).map(async productId => {
          const images = await ProductImageRepository.findByProductId(productId);
          imageCache.set(productId, images.length > 0 ? images[0].url : undefined);
        })
      );

      for (const item of cart.items) {
        let product = productCache.get(item.product_id);
        if (!product) {
          product = await ProductRepository.findById(item.product_id);
          productCache.set(item.product_id, product);
        }
        if (product) {
          item.product_name = product.title;
          item.product_slug = product.slug;
          item.product_image = imageCache.get(product.id);
        }
        
        if (item.variant_id) {
          let variant = variantCache.get(item.variant_id);
          if (!variant) {
            variant = await ProductVariantRepository.findById(item.variant_id);
            variantCache.set(item.variant_id, variant);
          }
          if (variant) {
            item.variant_name = variant.name;
          }
        }
      }
    }

    return cart;
  }

  /**
   * Calculate cart totals
   */
  async calculateTotals(sessionId: string): Promise<{
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
  }> {
    const cart = await CartRepository.findBySessionIdWithItems(sessionId);
    
    if (!cart || !cart.items || cart.items.length === 0) {
      return { subtotal: 0, tax: 0, discount: 0, total: 0 };
    }

    let subtotal = 0;
    
    for (const item of cart.items) {
      const product = await ProductRepository.findById(item.product_id);
      if (product) {
        let itemPrice = product.base_price;
        
        if (item.variant_id) {
          const variant = await ProductVariantRepository.findById(item.variant_id);
          if (variant) {
            itemPrice += variant.price_adjustment;
          }
        }
        
        subtotal += itemPrice * item.quantity;
      }
    }
    
    const tax = subtotal * (config.taxRate || 0);
    const discount = cart.discount_amount || 0;
    const total = Math.max(0, subtotal + tax - discount);
    
    return { subtotal, tax, discount, total };
  }

  /**
   * Apply discount code to cart
   */
  async applyDiscount(sessionId: string, discountCode: string, discountAmount: number): Promise<Cart> {
    await CartRepository.applyDiscount(sessionId, discountCode, discountAmount);
    return this.getCartWithItems(sessionId);
  }

  /**
   * Remove discount from cart
   */
  async removeDiscount(sessionId: string): Promise<Cart> {
    await CartRepository.removeDiscount(sessionId);
    return this.getCartWithItems(sessionId);
  }
}

// Export singleton instance
export const cartServiceDynamo = new CartServiceDynamo();
