import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { CartRepository } from './dynamodb/repositories/CartRepository';
import { CartItemRepository } from './dynamodb/repositories/CartItemRepository';
import { DiscountCodeRepository } from './dynamodb/repositories/DiscountCodeRepository';
import { ProductRepository } from './dynamodb/repositories/ProductRepository';
import { ProductVariantRepository } from './dynamodb/repositories/ProductVariantRepository';
import { Cart, CartItem, DiscountType, ProductVariant } from './dynamodb/repositories/types';
import { config } from '../config';

export class CartService {
  private cartRepo: CartRepository;
  private cartItemRepo: CartItemRepository;
  private discountRepo: DiscountCodeRepository;
  private productRepo: ProductRepository;
  private variantRepo: ProductVariantRepository;

  constructor(dynamoDB?: DynamoDBOptimized) {
    const db = dynamoDB || new DynamoDBOptimized({
      tableName: process.env.DYNAMODB_TABLE_NAME || 'art-management',
      region: process.env.AWS_REGION || 'us-east-1',
    });

    this.cartRepo = new CartRepository(db);
    this.cartItemRepo = new CartItemRepository(db);
    this.discountRepo = new DiscountCodeRepository(db);
    this.productRepo = new ProductRepository(db);
    this.variantRepo = new ProductVariantRepository(db);
  }

  /**
   * Validate variant stock against the requested quantity.
   * If variant is not found, stock validation is skipped.
   */
  private async validateStock(variantId: number | undefined, quantity: number): Promise<void> {
    if (variantId == null) return;

    const variant = await this.variantRepo.findById(String(variantId));
    if (variant && variant.stock < quantity) {
      throw new Error(
        `Insufficient stock available. Requested: ${quantity}, Available: ${variant.stock}`
      );
    }
  }

  /**
   * Find an existing cart by session ID, or create a new one.
   * If a userId is provided and no session cart exists, an existing user cart is
   * reused (associating the current session with it). TTL is refreshed on every call.
   */
  async getOrCreateCart(sessionId: string, userId?: number): Promise<Cart> {
    let cart = await this.cartRepo.findBySessionId(sessionId);

    if (!cart) {
      if (userId) {
        cart = await this.cartRepo.findByUserId(userId);
      }

      if (cart) {
        // Associate the current session with the existing user cart
        const updated = await this.cartRepo.update(cart.id, { session_id: sessionId });
        if (updated) {
          cart = updated;
        }
      } else {
        cart = await this.cartRepo.create({
          session_id: sessionId,
          user_id: userId,
        });
      }
    } else {
      // Refresh TTL on activity
      await this.cartRepo.refreshTTL(cart.id);
    }

    return cart;
  }

  /**
   * Return all items in a cart.
   */
  async getCartItems(cartId: string): Promise<CartItem[]> {
    return this.cartItemRepo.findByCartId(cartId);
  }

  /**
   * Get the cart (find or create) by session ID.
   * Kept for backward compatibility with the shop handler.
   */
  async getCart(sessionId: string): Promise<Cart> {
    return this.getOrCreateCart(sessionId);
  }

  /**
   * Add an item to the cart, or update quantity if it already exists.
   * Validates product existence, variant existence (if provided), and stock.
   * Refreshes cart TTL on success.
   */
  async addItem(
    cartId: string,
    productId: number,
    variantId: number | undefined,
    quantity: number
  ): Promise<CartItem> {
    if (quantity <= 0) {
      throw new Error('Invalid quantity');
    }

    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }

    if (variantId != null) {
      const variant = await this.variantRepo.findById(String(variantId));
      if (!variant) {
        throw new Error('Variant not found');
      }
      await this.validateStock(variantId, quantity);
    }

    const item = await this.cartItemRepo.addItem(cartId, productId, variantId, quantity);

    // Refresh TTL on activity (non-blocking; failure must not prevent the addItem response)
    this.cartRepo.refreshTTL(cartId).catch(err => {
      console.error(`[CartService] Failed to refresh TTL for cart ${cartId}:`, err);
    });

    return item;
  }

  /**
   * Update the quantity of an existing cart item atomically.
   * Use removeItem() to delete an item instead of passing quantity=0 here.
   * Refreshes cart TTL on success.
   */
  async updateQuantity(cartId: string, itemId: string, quantity: number): Promise<CartItem> {
    if (quantity <= 0) {
      throw new Error('Invalid quantity');
    }

    const item = await this.cartItemRepo.updateQuantity(cartId, itemId, quantity);

    // Refresh TTL on activity (non-blocking)
    this.cartRepo.refreshTTL(cartId).catch(err => {
      console.error(`[CartService] Failed to refresh TTL for cart ${cartId}:`, err);
    });

    return item;
  }

  /**
   * Remove an item from the cart.
   * Refreshes cart TTL on success.
   */
  async removeItem(cartId: string, itemId: string): Promise<void> {
    await this.cartItemRepo.removeItem(cartId, itemId);

    // Refresh TTL on activity (non-blocking)
    this.cartRepo.refreshTTL(cartId).catch(err => {
      console.error(`[CartService] Failed to refresh TTL for cart ${cartId}:`, err);
    });
  }

  /**
   * Remove all items from the cart.
   * Refreshes cart TTL on success.
   */
  async clearCart(cartId: string): Promise<void> {
    await this.cartItemRepo.clearCart(cartId);

    // Refresh TTL on activity (non-blocking)
    this.cartRepo.refreshTTL(cartId).catch(err => {
      console.error(`[CartService] Failed to refresh TTL for cart ${cartId}:`, err);
    });
  }

  /**
   * Merge the session cart's items into the user cart, then delete the session cart.
   * Item quantities are summed for matching product/variant combinations.
   */
  async mergeCarts(sessionCartId: string, userCartId: string): Promise<void> {
    const mergedCount = await this.cartItemRepo.mergeItems(sessionCartId, userCartId);
    await this.cartRepo.mergeCarts(sessionCartId, userCartId, mergedCount);

    // Refresh TTL on the user cart after merge (non-blocking)
    this.cartRepo.refreshTTL(userCartId).catch(err => {
      console.error(`[CartService] Failed to refresh TTL for cart ${userCartId}:`, err);
    });
  }

  /**
   * Validate a discount code and apply it to the cart.
   * Supports percentage and fixed discount types.
   * Throws if the code is invalid or expired.
   */
  async applyDiscount(cartId: string, code: string): Promise<Cart> {
    const discountCode = await this.discountRepo.findByCode(code);

    if (!discountCode) {
      throw new Error('Invalid discount code');
    }

    const isValid = await this.discountRepo.isValid(code);
    if (!isValid) {
      throw new Error('Discount code is expired or no longer active');
    }

    // Calculate discount amount based on type
    let discountAmount = 0;
    if (discountCode.discount_type === DiscountType.FIXED) {
      discountAmount = discountCode.discount_value;
    } else if (discountCode.discount_type === DiscountType.PERCENTAGE) {
      const totals = await this.calculateTotals(cartId);
      discountAmount = totals.subtotal * (discountCode.discount_value / 100);
      if (discountCode.max_discount_amount) {
        discountAmount = Math.min(discountAmount, discountCode.max_discount_amount);
      }
    }

    const updated = await this.cartRepo.update(cartId, {
      discount_code: code,
      discount_amount: discountAmount,
    });

    if (!updated) {
      throw new Error('Cart not found');
    }

    return updated;
  }

  /**
   * Calculate cart totals: subtotal, tax, discount amount, and final total.
   * Fetches product and variant prices from DynamoDB to avoid stale data.
   */
  async calculateTotals(cartId: string): Promise<{
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
  }> {
    const [cart, items] = await Promise.all([
      this.cartRepo.findById(cartId),
      this.cartItemRepo.findByCartId(cartId),
    ]);

    let subtotal = 0;

    if (items.length > 0) {
      // Fetch all products and variants in parallel to avoid N+1 queries
      const productIds = [...new Set(items.map(item => item.product_id))];
      const variantIds = [...new Set(
        items.filter(item => item.variant_id != null).map(item => String(item.variant_id!))
      )];

      const [products, variants] = await Promise.all([
        Promise.all(productIds.map(id => this.productRepo.findById(id))),
        Promise.all(variantIds.map(id => this.variantRepo.findById(id))),
      ]);

      const productMap = new Map(
        products.filter(Boolean).map(p => [p!.id, p!])
      );
      // Key the variant map by the CartItem variant_id string so lookups
      // below (String(item.variant_id)) work regardless of the UUID stored in
      // the ProductVariant.id field.
      const variantMap = new Map<string, ProductVariant>();
      variantIds.forEach((id, i) => {
        if (variants[i]) {
          variantMap.set(id, variants[i]!);
        }
      });

      for (const item of items) {
        const product = productMap.get(item.product_id);
        if (product) {
          let itemPrice = Number(product.base_price);

          if (item.variant_id != null) {
            const variant = variantMap.get(String(item.variant_id));
            if (variant) {
              itemPrice += Number(variant.price_adjustment);
            }
          }

          subtotal += itemPrice * item.quantity;
        }
      }
    }

    const tax = subtotal * config.taxRate;
    const discount = cart?.discount_amount != null ? Number(cart.discount_amount) : 0;
    const total = Math.max(0, subtotal + tax - discount);

    return { subtotal, tax, discount, total };
  }
}
