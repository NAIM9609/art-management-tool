import { Repository } from 'typeorm';
import { AppDataSource } from '../database/connection';
import { Cart } from '../entities/Cart';
import { CartItem } from '../entities/CartItem';
import { EnhancedProduct } from '../entities/EnhancedProduct';
import { ProductVariant } from '../entities/ProductVariant';
import { config } from '../config';

export class CartService {
  private cartRepo: Repository<Cart>;
  private cartItemRepo: Repository<CartItem>;
  private productRepo: Repository<EnhancedProduct>;
  private variantRepo: Repository<ProductVariant>;

  constructor() {
    this.cartRepo = AppDataSource.getRepository(Cart);
    this.cartItemRepo = AppDataSource.getRepository(CartItem);
    this.productRepo = AppDataSource.getRepository(EnhancedProduct);
    this.variantRepo = AppDataSource.getRepository(ProductVariant);
  }

  async getOrCreateCart(sessionId: string, userId?: number): Promise<Cart> {
    let cart = await this.cartRepo.findOne({
      where: { session_id: sessionId },
      relations: ['items'],
    });

    if (!cart) {
      cart = this.cartRepo.create({
        session_id: sessionId,
        user_id: userId,
        items: [],
      });
      await this.cartRepo.save(cart);
    }

    return cart;
  }

  async addItem(sessionId: string, productId: number, variantId: number | undefined, quantity: number): Promise<Cart> {
    if (quantity <= 0) {
      throw new Error('Invalid quantity');
    }

    const product = await this.productRepo.findOne({ where: { id: productId } });
    if (!product) {
      throw new Error('Product not found');
    }

    let variant: ProductVariant | null = null;
    if (variantId !== null && variantId !== undefined) {
      variant = await this.variantRepo.findOne({ where: { id: variantId } });
      if (!variant) {
        throw new Error('Variant not found');
      }
    }

    const cart = await this.getOrCreateCart(sessionId);

    const existingItem = await this.cartItemRepo.findOne({
      where: {
        cart_id: cart.id,
        product_id: productId,
        variant_id: variantId !== null && variantId !== undefined ? variantId : undefined,
      },
    });

    if (existingItem) {
      const finalQuantity = existingItem.quantity + quantity;
      
      // Validate stock for the final quantity
      if (variant && variant.stock < finalQuantity) {
        throw new Error('Product out of stock');
      }
      
      existingItem.quantity = finalQuantity;
      await this.cartItemRepo.save(existingItem);
    } else {
      // Validate stock for new items
      if (variant && variant.stock < quantity) {
        throw new Error('Product out of stock');
      }
      
      const newItem = this.cartItemRepo.create({
        cart_id: cart.id,
        product_id: productId,
        variant_id: variantId,
        quantity,
      });
      await this.cartItemRepo.save(newItem);
    }

    return this.cartRepo.findOne({
      where: { id: cart.id },
      relations: ['items'],
    }) as Promise<Cart>;
  }

  async updateItem(sessionId: string, itemId: number, quantity: number): Promise<Cart> {
    if (quantity < 0) {
      throw new Error('Invalid quantity');
    }

    const cart = await this.getOrCreateCart(sessionId);
    const item = await this.cartItemRepo.findOne({ where: { id: itemId, cart_id: cart.id } });

    if (!item) {
      throw new Error('Item not found');
    }

    if (quantity === 0) {
      await this.cartItemRepo.remove(item);
    } else {
      item.quantity = quantity;
      await this.cartItemRepo.save(item);
    }

    return this.cartRepo.findOne({
      where: { id: cart.id },
      relations: ['items'],
    }) as Promise<Cart>;
  }

  async removeItem(sessionId: string, itemId: number): Promise<Cart> {
    const cart = await this.getOrCreateCart(sessionId);
    const item = await this.cartItemRepo.findOne({ where: { id: itemId, cart_id: cart.id } });

    if (!item) {
      throw new Error('Item not found');
    }

    await this.cartItemRepo.remove(item);

    return this.cartRepo.findOne({
      where: { id: cart.id },
      relations: ['items'],
    }) as Promise<Cart>;
  }

  async clearCart(sessionId: string): Promise<void> {
    const cart = await this.getOrCreateCart(sessionId);
    await this.cartItemRepo.delete({ cart_id: cart.id });
  }

  async getCart(sessionId: string): Promise<Cart> {
    return this.getOrCreateCart(sessionId);
  }

  async calculateTotals(sessionId: string): Promise<{
    subtotal: number;
    tax: number;
    discount: number;
    total: number;
  }> {
    const cart = await this.getOrCreateCart(sessionId);
    
    let subtotal = 0;
    
    if (cart.items && cart.items.length > 0) {
      // Fetch all products and variants in bulk to avoid N+1 queries
      const productIds = cart.items.map(item => item.product_id);
      const variantIds = cart.items.filter(item => item.variant_id).map(item => item.variant_id!);
      
      const products = await this.productRepo.findByIds(productIds);
      const variants = variantIds.length > 0 
        ? await this.variantRepo.findByIds(variantIds)
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
