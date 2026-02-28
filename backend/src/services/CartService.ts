import { Repository, In } from 'typeorm';
import { AppDataSource } from '../database/connection';
import { Cart } from '../entities/Cart';
import { CartItem } from '../entities/CartItem';
import { EnhancedProduct } from '../entities/EnhancedProduct';
import { ProductVariant } from '../entities/ProductVariant';
import { DiscountCode, DiscountType } from '../entities/DiscountCode';
import { config } from '../config';

export class CartService {
  private cartRepo: Repository<Cart>;
  private cartItemRepo: Repository<CartItem>;
  private productRepo: Repository<EnhancedProduct>;
  private variantRepo: Repository<ProductVariant>;
  private discountRepo: Repository<DiscountCode>;

  constructor() {
    this.cartRepo = AppDataSource.getRepository(Cart);
    this.cartItemRepo = AppDataSource.getRepository(CartItem);
    this.productRepo = AppDataSource.getRepository(EnhancedProduct);
    this.variantRepo = AppDataSource.getRepository(ProductVariant);
    this.discountRepo = AppDataSource.getRepository(DiscountCode);
  }

  private validateStock(variant: ProductVariant | null, quantity: number): void {
    if (variant && variant.stock < quantity) {
      throw new Error(`Insufficient stock available. Requested: ${quantity}, Available: ${variant.stock}`);
    }
  }

  private async refreshTTL(cartId: number): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    await this.cartRepo.update(cartId, { expires_at: expiresAt });
  }

  async getOrCreateCart(sessionId: string, userId?: number): Promise<Cart> {
    let cart = await this.cartRepo.findOne({
      where: { session_id: sessionId },
      relations: ['items'],
    });

    if (!cart) {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

      cart = this.cartRepo.create({
        session_id: sessionId,
        user_id: userId,
        items: [],
        expires_at: expiresAt,
      });
      await this.cartRepo.save(cart);
    } else {
      // Refresh TTL on access
      await this.refreshTTL(cart.id);
    }

    return cart;
  }

  async addItem(cartId: number, productId: number, variantId: number | undefined, quantity: number): Promise<Cart> {
    if (quantity <= 0) {
      throw new Error('Invalid quantity');
    }

    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new Error('Product not found');
    }

    let variant: ProductVariant | null = null;
    if (variantId != null) {
      variant = await this.variantRepo.findOne({ where: { id: variantId } });
      if (!variant) {
        throw new Error('Variant not found');
      }
    }

    const existingItem = await this.cartItemRepo.findOne({
      where: {
        cart_id: cartId,
        product_id: productId,
        variant_id: variantId ?? undefined,
      },
    });

    if (existingItem) {
      const finalQuantity = existingItem.quantity + quantity;

      // Validate stock for the final quantity
      this.validateStock(variant, finalQuantity);

      existingItem.quantity = finalQuantity;
      await this.cartItemRepo.save(existingItem);
    } else {
      // Validate stock for new items
      this.validateStock(variant, quantity);

      const newItem = this.cartItemRepo.create({
        cart_id: cartId,
        product_id: productId,
        variant_id: variantId,
        quantity,
      });
      await this.cartItemRepo.save(newItem);
    }

    // Refresh TTL after activity
    await this.refreshTTL(cartId);

    return this.cartRepo.findOne({
      where: { id: cartId },
      relations: ['items'],
    }) as Promise<Cart>;
  }

  async updateQuantity(cartId: number, itemId: number, quantity: number): Promise<Cart> {
    if (quantity < 0) {
      throw new Error('Invalid quantity');
    }

    const item = await this.cartItemRepo.findOne({ where: { id: itemId, cart_id: cartId } });

    if (!item) {
      throw new Error('Item not found');
    }

    if (quantity === 0) {
      await this.cartItemRepo.remove(item);
    } else {
      // Validate stock if variant exists
      if (item.variant_id) {
        const variant = await this.variantRepo.findOne({ where: { id: item.variant_id } });
        this.validateStock(variant, quantity);
      }

      item.quantity = quantity;
      await this.cartItemRepo.save(item);
    }

    // Refresh TTL after activity
    await this.refreshTTL(cartId);

    return this.cartRepo.findOne({
      where: { id: cartId },
      relations: ['items'],
    }) as Promise<Cart>;
  }

  async removeItem(cartId: number, itemId: number): Promise<Cart> {
    const item = await this.cartItemRepo.findOne({ where: { id: itemId, cart_id: cartId } });

    if (!item) {
      throw new Error('Item not found');
    }

    await this.cartItemRepo.remove(item);

    // Refresh TTL after activity
    await this.refreshTTL(cartId);

    return this.cartRepo.findOne({
      where: { id: cartId },
      relations: ['items'],
    }) as Promise<Cart>;
  }

  async clearCart(cartId: number): Promise<void> {
    await this.cartItemRepo.delete({ cart_id: cartId });

    // Refresh TTL after activity
    await this.refreshTTL(cartId);
  }

  async getCart(sessionId: string): Promise<Cart> {
    return this.getOrCreateCart(sessionId);
  }

  async mergeCarts(sessionCartId: number, userCartId: number): Promise<Cart> {
    const sessionCart = await this.cartRepo.findOne({
      where: { id: sessionCartId },
      relations: ['items'],
    });
    const userCart = await this.cartRepo.findOne({
      where: { id: userCartId },
      relations: ['items'],
    });

    if (!sessionCart || !userCart) {
      throw new Error('Cart not found');
    }

    // Merge items from session cart to user cart
    for (const sessionItem of sessionCart.items) {
      const existingItem = await this.cartItemRepo.findOne({
        where: {
          cart_id: userCartId,
          product_id: sessionItem.product_id,
          variant_id: sessionItem.variant_id ?? undefined,
        },
      });

      if (existingItem) {
        // Merge quantities
        existingItem.quantity += sessionItem.quantity;
        await this.cartItemRepo.save(existingItem);
      } else {
        // Move item to user cart
        sessionItem.cart_id = userCartId;
        await this.cartItemRepo.save(sessionItem);
      }
    }

    // Delete session cart
    await this.cartRepo.remove(sessionCart);

    // Refresh TTL after merge
    await this.refreshTTL(userCartId);

    return this.cartRepo.findOne({
      where: { id: userCartId },
      relations: ['items'],
    }) as Promise<Cart>;
  }

  async applyDiscount(cartId: number, code: string): Promise<Cart> {
    const cart = await this.cartRepo.findOne({
      where: { id: cartId },
      relations: ['items'],
    });

    if (!cart) {
      throw new Error('Cart not found');
    }

    // Validate discount code
    const discountCode = await this.discountRepo.findOne({
      where: { code, is_active: true },
    });

    if (!discountCode) {
      throw new Error('Invalid discount code');
    }

    // Check if discount is expired
    const now = new Date();
    if (discountCode.valid_from && discountCode.valid_from > now) {
      throw new Error('Discount code is not yet valid');
    }
    if (discountCode.valid_until && discountCode.valid_until < now) {
      throw new Error('Discount code has expired');
    }

    // Check max uses
    if (discountCode.max_uses && discountCode.times_used >= discountCode.max_uses) {
      throw new Error('Discount code has reached maximum uses');
    }

    // Calculate subtotal to check min order value
    const totals = await this.calculateTotals(cartId);

    if (discountCode.min_order_value && totals.subtotal < parseFloat(discountCode.min_order_value.toString())) {
      throw new Error(`Minimum order value of ${discountCode.min_order_value} required`);
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (discountCode.type === DiscountType.PERCENTAGE) {
      discountAmount = totals.subtotal * (parseFloat(discountCode.value.toString()) / 100);
    } else if (discountCode.type === DiscountType.FIXED) {
      discountAmount = parseFloat(discountCode.value.toString());
    }

    // Apply discount to cart
    cart.discount_code = code;
    cart.discount_amount = discountAmount;
    await this.cartRepo.save(cart);

    // Increment usage count
    discountCode.times_used += 1;
    await this.discountRepo.save(discountCode);

    // Refresh TTL after activity
    await this.refreshTTL(cartId);

    return this.cartRepo.findOne({
      where: { id: cartId },
      relations: ['items'],
    }) as Promise<Cart>;
  }

  async calculateTotals(cartId: number): Promise<{
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
  }> {
    const cart = await this.cartRepo.findOne({
      where: { id: cartId },
      relations: ['items'],
    });

    if (!cart) {
      throw new Error('Cart not found');
    }

    let subtotal = 0;

    if (cart.items && cart.items.length > 0) {
      // Fetch all products and variants in bulk to avoid N+1 queries
      const productIds = cart.items.map(item => item.product_id);
      const variantIds = cart.items.filter(item => item.variant_id).map(item => item.variant_id!);

      const products = await this.productRepo.findBy({ id: In(productIds) });
      const variants = variantIds.length > 0
        ? await this.variantRepo.findBy({ id: In(variantIds) })
        : [];

      // Create lookup maps for O(1) access
      const productMap = new Map(products.map(p => [p.id, p]));
      const variantMap = new Map(variants.map(v => [v.id, v]));

      for (const item of cart.items) {
        const product = productMap.get(item.product_id);
        if (product) {
          let itemPrice = parseFloat(product.base_price.toString());

          // Add variant price adjustment if applicable
          if (item.variant_id) {
            const variant = variantMap.get(item.variant_id);
            if (variant) {
              itemPrice += parseFloat(variant.price_adjustment.toString());
            }
          }

          subtotal += itemPrice * item.quantity;
        }
      }
    }

    const tax = subtotal * config.taxRate;
    const discount = parseFloat(cart.discount_amount.toString());
    const total = subtotal + tax - discount;

    return {
      subtotal,
      tax,
      discount,
      total,
    };
  }
}
