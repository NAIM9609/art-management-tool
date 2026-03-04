/**
 * Unit tests for CartService (DynamoDB implementation)
 */

import { CartService } from './CartService';
import { CartRepository } from './dynamodb/repositories/CartRepository';
import { CartItemRepository } from './dynamodb/repositories/CartItemRepository';
import { DiscountCodeRepository } from './dynamodb/repositories/DiscountCodeRepository';
import { ProductRepository } from './dynamodb/repositories/ProductRepository';
import { ProductVariantRepository } from './dynamodb/repositories/ProductVariantRepository';
import { DynamoDBOptimized } from './dynamodb/DynamoDBOptimized';
import { Cart, CartItem, DiscountCode, DiscountType, Product, ProductVariant } from './dynamodb/repositories/types';

// Mock all dependencies
jest.mock('./dynamodb/DynamoDBOptimized');
jest.mock('./dynamodb/repositories/CartRepository');
jest.mock('./dynamodb/repositories/CartItemRepository');
jest.mock('./dynamodb/repositories/DiscountCodeRepository');
jest.mock('./dynamodb/repositories/ProductRepository');
jest.mock('./dynamodb/repositories/ProductVariantRepository');
jest.mock('../config', () => ({
  config: {
    taxRate: 0.1,
  },
}));

process.env.DYNAMODB_TABLE_NAME = 'test-table';

describe('CartService', () => {
  let service: CartService;
  let mockCartRepo: jest.Mocked<CartRepository>;
  let mockCartItemRepo: jest.Mocked<CartItemRepository>;
  let mockDiscountRepo: jest.Mocked<DiscountCodeRepository>;
  let mockProductRepo: jest.Mocked<ProductRepository>;
  let mockVariantRepo: jest.Mocked<ProductVariantRepository>;

  const NOW = '2024-01-01T00:00:00.000Z';
  const TTL = 1704067200;

  const makeCart = (overrides: Partial<Cart> = {}): Cart => ({
    id: 'cart-uuid-1',
    session_id: 'session-abc',
    user_id: undefined,
    discount_code: undefined,
    discount_amount: 0,
    created_at: NOW,
    updated_at: NOW,
    expires_at: TTL,
    ...overrides,
  });

  const makeCartItem = (overrides: Partial<CartItem> = {}): CartItem => ({
    id: 'item-hash-1',
    cart_id: 'cart-uuid-1',
    product_id: 101,
    variant_id: undefined,
    quantity: 2,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });

  const makeProduct = (overrides: Partial<Product> = {}): Product => ({
    id: 101,
    slug: 'test-product',
    title: 'Test Product',
    base_price: 50,
    currency: 'USD',
    status: 'published' as any,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });

  const makeVariant = (overrides: Partial<ProductVariant> = {}): ProductVariant => ({
    id: 'variant-uuid-1',
    product_id: 101,
    sku: 'SKU-001',
    name: 'Red / Large',
    price_adjustment: 5,
    stock: 10,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });

  const makeDiscountCode = (overrides: Partial<DiscountCode> = {}): DiscountCode => ({
    id: 1,
    code: 'SAVE10',
    discount_type: DiscountType.PERCENTAGE,
    discount_value: 10,
    times_used: 0,
    is_active: true,
    valid_from: NOW,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockCartRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findBySessionId: jest.fn(),
      findByUserId: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      mergeCarts: jest.fn(),
      refreshTTL: jest.fn(),
      mapToCart: jest.fn(),
      buildCartItem: jest.fn(),
    } as unknown as jest.Mocked<CartRepository>;

    mockCartItemRepo = {
      findByCartId: jest.fn(),
      findById: jest.fn(),
      addItem: jest.fn(),
      updateQuantity: jest.fn(),
      removeItem: jest.fn(),
      clearCart: jest.fn(),
      mergeItems: jest.fn(),
      mapToCartItem: jest.fn(),
      buildCartItemItem: jest.fn(),
    } as unknown as jest.Mocked<CartItemRepository>;

    mockDiscountRepo = {
      findByCode: jest.fn(),
      findById: jest.fn(),
      isValid: jest.fn(),
      incrementUsage: jest.fn(),
      create: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      getStats: jest.fn(),
      getNextId: jest.fn(),
      mapToDiscountCode: jest.fn(),
      buildDiscountCodeItem: jest.fn(),
    } as unknown as jest.Mocked<DiscountCodeRepository>;

    mockProductRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<ProductRepository>;

    mockVariantRepo = {
      findById: jest.fn(),
    } as unknown as jest.Mocked<ProductVariantRepository>;

    (CartRepository as jest.Mock).mockImplementation(() => mockCartRepo);
    (CartItemRepository as jest.Mock).mockImplementation(() => mockCartItemRepo);
    (DiscountCodeRepository as jest.Mock).mockImplementation(() => mockDiscountRepo);
    (ProductRepository as jest.Mock).mockImplementation(() => mockProductRepo);
    (ProductVariantRepository as jest.Mock).mockImplementation(() => mockVariantRepo);

    mockCartRepo.refreshTTL.mockResolvedValue(undefined);

    service = new CartService();
  });

  // ==================== getOrCreateCart ====================

  describe('getOrCreateCart', () => {
    it('should return existing cart when found by session ID', async () => {
      const cart = makeCart();
      mockCartRepo.findBySessionId.mockResolvedValue(cart);

      const result = await service.getOrCreateCart('session-abc');

      expect(mockCartRepo.findBySessionId).toHaveBeenCalledWith('session-abc');
      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith(cart.id);
      expect(result).toEqual(cart);
    });

    it('should create a new cart when none exists', async () => {
      const newCart = makeCart();
      mockCartRepo.findBySessionId.mockResolvedValue(null);
      mockCartRepo.create.mockResolvedValue(newCart);

      const result = await service.getOrCreateCart('session-abc');

      expect(mockCartRepo.create).toHaveBeenCalledWith({
        session_id: 'session-abc',
        user_id: undefined,
      });
      expect(result).toEqual(newCart);
    });

    it('should find user cart and associate session when userId is provided', async () => {
      const userCart = makeCart({ user_id: 42 });
      const updatedCart = makeCart({ user_id: 42, session_id: 'new-session' });
      mockCartRepo.findBySessionId.mockResolvedValue(null);
      mockCartRepo.findByUserId.mockResolvedValue(userCart);
      mockCartRepo.update.mockResolvedValue(updatedCart);

      const result = await service.getOrCreateCart('new-session', 42);

      expect(mockCartRepo.findByUserId).toHaveBeenCalledWith(42);
      expect(mockCartRepo.update).toHaveBeenCalledWith(userCart.id, { session_id: 'new-session' });
      expect(result).toEqual(updatedCart);
    });

    it('should create new cart with userId when no cart exists for user', async () => {
      const newCart = makeCart({ user_id: 42 });
      mockCartRepo.findBySessionId.mockResolvedValue(null);
      mockCartRepo.findByUserId.mockResolvedValue(null);
      mockCartRepo.create.mockResolvedValue(newCart);

      const result = await service.getOrCreateCart('session-abc', 42);

      expect(mockCartRepo.create).toHaveBeenCalledWith({
        session_id: 'session-abc',
        user_id: 42,
      });
      expect(result).toEqual(newCart);
    });
  });

  // ==================== getCartItems ====================

  describe('getCartItems', () => {
    it('should return all items for a cart', async () => {
      const items = [makeCartItem(), makeCartItem({ id: 'item-hash-2', product_id: 202 })];
      mockCartItemRepo.findByCartId.mockResolvedValue(items);

      const result = await service.getCartItems('cart-uuid-1');

      expect(mockCartItemRepo.findByCartId).toHaveBeenCalledWith('cart-uuid-1');
      expect(result).toEqual(items);
    });

    it('should return empty array if cart has no items', async () => {
      mockCartItemRepo.findByCartId.mockResolvedValue([]);

      const result = await service.getCartItems('empty-cart');

      expect(result).toEqual([]);
    });
  });

  // ==================== addItem ====================

  describe('addItem', () => {
    it('should add a new item to the cart', async () => {
      const product = makeProduct();
      const item = makeCartItem();
      mockProductRepo.findById.mockResolvedValue(product);
      mockCartItemRepo.addItem.mockResolvedValue(item);

      const result = await service.addItem('cart-uuid-1', 101, undefined, 2);

      expect(mockProductRepo.findById).toHaveBeenCalledWith(101);
      expect(mockCartItemRepo.addItem).toHaveBeenCalledWith('cart-uuid-1', 101, undefined, 2);
      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('cart-uuid-1');
      expect(result).toEqual(item);
    });

    it('should validate variant exists when variantId is provided', async () => {
      const product = makeProduct();
      const variant = makeVariant();
      const item = makeCartItem({ variant_id: 5 });
      mockProductRepo.findById.mockResolvedValue(product);
      mockVariantRepo.findById.mockResolvedValue(variant);
      mockCartItemRepo.addItem.mockResolvedValue(item);

      await service.addItem('cart-uuid-1', 101, 5, 1);

      expect(mockVariantRepo.findById).toHaveBeenCalledWith('5');
    });

    it('should throw when product is not found', async () => {
      mockProductRepo.findById.mockResolvedValue(null);

      await expect(service.addItem('cart-uuid-1', 999, undefined, 1)).rejects.toThrow(
        'Product not found'
      );
    });

    it('should throw when variant is not found', async () => {
      mockProductRepo.findById.mockResolvedValue(makeProduct());
      mockVariantRepo.findById.mockResolvedValue(null);

      await expect(service.addItem('cart-uuid-1', 101, 999, 1)).rejects.toThrow(
        'Variant not found'
      );
    });

    it('should throw when quantity is zero or negative', async () => {
      await expect(service.addItem('cart-uuid-1', 101, undefined, 0)).rejects.toThrow(
        'Invalid quantity'
      );
      await expect(service.addItem('cart-uuid-1', 101, undefined, -1)).rejects.toThrow(
        'Invalid quantity'
      );
    });

    it('should throw when stock is insufficient', async () => {
      mockProductRepo.findById.mockResolvedValue(makeProduct());
      mockVariantRepo.findById.mockResolvedValue(makeVariant({ stock: 2 }));

      await expect(service.addItem('cart-uuid-1', 101, 5, 5)).rejects.toThrow(
        'Insufficient stock available'
      );
    });

    it('should not throw on stock validation when variant is not found in DynamoDB', async () => {
      const product = makeProduct();
      const item = makeCartItem({ variant_id: 999 });
      mockProductRepo.findById.mockResolvedValue(product);
      // findById called twice: once for "variant found?" check, once for stock validation
      mockVariantRepo.findById.mockResolvedValue(null);

      // variant_id exists but cannot be found — should throw "Variant not found"
      await expect(service.addItem('cart-uuid-1', 101, 999, 1)).rejects.toThrow(
        'Variant not found'
      );
    });
  });

  // ==================== updateQuantity ====================

  describe('updateQuantity', () => {
    it('should update item quantity atomically', async () => {
      const updatedItem = makeCartItem({ quantity: 5 });
      mockCartItemRepo.updateQuantity.mockResolvedValue(updatedItem);

      const result = await service.updateQuantity('cart-uuid-1', 'item-hash-1', 5);

      expect(mockCartItemRepo.updateQuantity).toHaveBeenCalledWith('cart-uuid-1', 'item-hash-1', 5);
      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('cart-uuid-1');
      expect(result.quantity).toBe(5);
    });

    it('should throw when quantity is zero or negative', async () => {
      await expect(service.updateQuantity('cart-uuid-1', 'item-hash-1', 0)).rejects.toThrow(
        'Invalid quantity'
      );
      await expect(service.updateQuantity('cart-uuid-1', 'item-hash-1', -3)).rejects.toThrow(
        'Invalid quantity'
      );
    });

    it('should propagate errors from the repository', async () => {
      mockCartItemRepo.updateQuantity.mockRejectedValue(new Error('Item not found'));

      await expect(service.updateQuantity('cart-uuid-1', 'bad-id', 3)).rejects.toThrow(
        'Item not found'
      );
    });
  });

  // ==================== removeItem ====================

  describe('removeItem', () => {
    it('should remove item and refresh TTL', async () => {
      mockCartItemRepo.removeItem.mockResolvedValue(undefined);

      await service.removeItem('cart-uuid-1', 'item-hash-1');

      expect(mockCartItemRepo.removeItem).toHaveBeenCalledWith('cart-uuid-1', 'item-hash-1');
      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('cart-uuid-1');
    });
  });

  // ==================== clearCart ====================

  describe('clearCart', () => {
    it('should clear all items and refresh TTL', async () => {
      mockCartItemRepo.clearCart.mockResolvedValue(undefined);

      await service.clearCart('cart-uuid-1');

      expect(mockCartItemRepo.clearCart).toHaveBeenCalledWith('cart-uuid-1');
      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('cart-uuid-1');
    });
  });

  // ==================== mergeCarts ====================

  describe('mergeCarts', () => {
    it('should merge items from session cart to user cart', async () => {
      mockCartItemRepo.mergeItems.mockResolvedValue(3);
      mockCartRepo.mergeCarts.mockResolvedValue(undefined);

      await service.mergeCarts('session-cart-id', 'user-cart-id');

      expect(mockCartItemRepo.mergeItems).toHaveBeenCalledWith('session-cart-id', 'user-cart-id');
      expect(mockCartRepo.mergeCarts).toHaveBeenCalledWith('session-cart-id', 'user-cart-id', 3);
      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('user-cart-id');
    });

    it('should still call mergeCarts when no items are merged', async () => {
      mockCartItemRepo.mergeItems.mockResolvedValue(0);
      mockCartRepo.mergeCarts.mockResolvedValue(undefined);

      await service.mergeCarts('session-cart-id', 'user-cart-id');

      expect(mockCartRepo.mergeCarts).toHaveBeenCalledWith('session-cart-id', 'user-cart-id', 0);
    });
  });

  // ==================== applyDiscount ====================

  describe('applyDiscount', () => {
    it('should apply a percentage discount to the cart', async () => {
      const discountCode = makeDiscountCode({ discount_type: DiscountType.PERCENTAGE, discount_value: 10 });
      const updatedCart = makeCart({ discount_code: 'SAVE10', discount_amount: 10 });

      mockDiscountRepo.findByCode.mockResolvedValue(discountCode);
      mockDiscountRepo.isValid.mockResolvedValue(true);
      // calculateTotals will need cartRepo + cartItemRepo
      mockCartRepo.findById.mockResolvedValue(makeCart());
      mockCartItemRepo.findByCartId.mockResolvedValue([makeCartItem({ quantity: 2 })]); // 2 × $50 = $100
      mockProductRepo.findById.mockResolvedValue(makeProduct({ base_price: 50 }));
      mockVariantRepo.findById.mockResolvedValue(null);
      mockCartRepo.update.mockResolvedValue(updatedCart);

      const result = await service.applyDiscount('cart-uuid-1', 'SAVE10');

      // 10% of subtotal (100) = 10
      expect(mockCartRepo.update).toHaveBeenCalledWith('cart-uuid-1', {
        discount_code: 'SAVE10',
        discount_amount: 10,
      });
      expect(result).toEqual(updatedCart);
    });

    it('should apply a fixed discount to the cart', async () => {
      const discountCode = makeDiscountCode({ discount_type: DiscountType.FIXED, discount_value: 15 });
      const updatedCart = makeCart({ discount_code: 'FLAT15', discount_amount: 15 });

      mockDiscountRepo.findByCode.mockResolvedValue(discountCode);
      mockDiscountRepo.isValid.mockResolvedValue(true);
      mockCartRepo.update.mockResolvedValue(updatedCart);

      const result = await service.applyDiscount('cart-uuid-1', 'FLAT15');

      expect(mockCartRepo.update).toHaveBeenCalledWith('cart-uuid-1', {
        discount_code: 'FLAT15',
        discount_amount: 15,
      });
      expect(result).toEqual(updatedCart);
    });

    it('should cap percentage discount at max_discount_amount', async () => {
      const discountCode = makeDiscountCode({
        discount_type: DiscountType.PERCENTAGE,
        discount_value: 50,
        max_discount_amount: 20,
      });
      const updatedCart = makeCart({ discount_code: 'BIGDEAL', discount_amount: 20 });

      mockDiscountRepo.findByCode.mockResolvedValue(discountCode);
      mockDiscountRepo.isValid.mockResolvedValue(true);
      mockCartRepo.findById.mockResolvedValue(makeCart());
      // subtotal = 2 × $50 = $100, 50% = $50 but capped at $20
      mockCartItemRepo.findByCartId.mockResolvedValue([makeCartItem({ quantity: 2 })]);
      mockProductRepo.findById.mockResolvedValue(makeProduct({ base_price: 50 }));
      mockVariantRepo.findById.mockResolvedValue(null);
      mockCartRepo.update.mockResolvedValue(updatedCart);

      const result = await service.applyDiscount('cart-uuid-1', 'BIGDEAL');

      expect(mockCartRepo.update).toHaveBeenCalledWith('cart-uuid-1', {
        discount_code: 'BIGDEAL',
        discount_amount: 20,
      });
      expect(result).toEqual(updatedCart);
    });

    it('should throw when discount code is not found', async () => {
      mockDiscountRepo.findByCode.mockResolvedValue(null);

      await expect(service.applyDiscount('cart-uuid-1', 'INVALID')).rejects.toThrow(
        'Invalid discount code'
      );
    });

    it('should throw when discount code is expired or inactive', async () => {
      mockDiscountRepo.findByCode.mockResolvedValue(makeDiscountCode());
      mockDiscountRepo.isValid.mockResolvedValue(false);

      await expect(service.applyDiscount('cart-uuid-1', 'EXPIRED')).rejects.toThrow(
        'Discount code is expired or no longer active'
      );
    });

    it('should throw when cart is not found during update', async () => {
      const discountCode = makeDiscountCode({ discount_type: DiscountType.FIXED, discount_value: 5 });
      mockDiscountRepo.findByCode.mockResolvedValue(discountCode);
      mockDiscountRepo.isValid.mockResolvedValue(true);
      mockCartRepo.update.mockResolvedValue(null);

      await expect(service.applyDiscount('cart-uuid-1', 'SAVE10')).rejects.toThrow(
        'Cart not found'
      );
    });
  });

  // ==================== calculateTotals ====================

  describe('calculateTotals', () => {
    it('should calculate totals with no items', async () => {
      mockCartRepo.findById.mockResolvedValue(makeCart({ discount_amount: 0 }));
      mockCartItemRepo.findByCartId.mockResolvedValue([]);

      const result = await service.calculateTotals('cart-uuid-1');

      expect(result.subtotal).toBe(0);
      expect(result.tax).toBe(0);
      expect(result.discount).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should calculate subtotal using product base_price', async () => {
      const items = [makeCartItem({ quantity: 2 })];
      mockCartRepo.findById.mockResolvedValue(makeCart({ discount_amount: 0 }));
      mockCartItemRepo.findByCartId.mockResolvedValue(items);
      mockProductRepo.findById.mockResolvedValue(makeProduct({ base_price: 30 }));
      mockVariantRepo.findById.mockResolvedValue(null);

      const result = await service.calculateTotals('cart-uuid-1');

      // 2 × $30 = $60
      expect(result.subtotal).toBe(60);
      expect(result.tax).toBeCloseTo(6); // 10% of $60
      expect(result.discount).toBe(0);
      expect(result.total).toBeCloseTo(66);
    });

    it('should add variant price_adjustment to item price', async () => {
      const items = [makeCartItem({ quantity: 1, variant_id: 5 })];
      mockCartRepo.findById.mockResolvedValue(makeCart({ discount_amount: 0 }));
      mockCartItemRepo.findByCartId.mockResolvedValue(items);
      mockProductRepo.findById.mockResolvedValue(makeProduct({ base_price: 50 }));
      mockVariantRepo.findById.mockResolvedValue(makeVariant({ price_adjustment: 10 }));

      const result = await service.calculateTotals('cart-uuid-1');

      // 1 × ($50 + $10) = $60
      expect(result.subtotal).toBe(60);
    });

    it('should subtract discount_amount from total', async () => {
      mockCartRepo.findById.mockResolvedValue(makeCart({ discount_amount: 15 }));
      mockCartItemRepo.findByCartId.mockResolvedValue([makeCartItem({ quantity: 1 })]);
      mockProductRepo.findById.mockResolvedValue(makeProduct({ base_price: 100 }));
      mockVariantRepo.findById.mockResolvedValue(null);

      const result = await service.calculateTotals('cart-uuid-1');

      // subtotal=$100, tax=$10, discount=$15, total=$100+$10-$15=$95
      expect(result.subtotal).toBe(100);
      expect(result.tax).toBeCloseTo(10);
      expect(result.discount).toBe(15);
      expect(result.total).toBeCloseTo(95);
    });

    it('should not return a negative total', async () => {
      // Discount larger than subtotal + tax
      mockCartRepo.findById.mockResolvedValue(makeCart({ discount_amount: 500 }));
      mockCartItemRepo.findByCartId.mockResolvedValue([makeCartItem({ quantity: 1 })]);
      mockProductRepo.findById.mockResolvedValue(makeProduct({ base_price: 10 }));
      mockVariantRepo.findById.mockResolvedValue(null);

      const result = await service.calculateTotals('cart-uuid-1');

      expect(result.total).toBe(0);
    });
  });

  // ==================== TTL refresh ====================

  describe('TTL management', () => {
    it('should refresh TTL after addItem', async () => {
      mockProductRepo.findById.mockResolvedValue(makeProduct());
      mockCartItemRepo.addItem.mockResolvedValue(makeCartItem());

      await service.addItem('cart-uuid-1', 101, undefined, 1);

      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('cart-uuid-1');
    });

    it('should refresh TTL after updateQuantity', async () => {
      mockCartItemRepo.updateQuantity.mockResolvedValue(makeCartItem({ quantity: 3 }));

      await service.updateQuantity('cart-uuid-1', 'item-hash-1', 3);

      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('cart-uuid-1');
    });

    it('should refresh TTL after removeItem', async () => {
      mockCartItemRepo.removeItem.mockResolvedValue(undefined);

      await service.removeItem('cart-uuid-1', 'item-hash-1');

      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('cart-uuid-1');
    });

    it('should refresh TTL after clearCart', async () => {
      mockCartItemRepo.clearCart.mockResolvedValue(undefined);

      await service.clearCart('cart-uuid-1');

      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith('cart-uuid-1');
    });

    it('should refresh TTL on existing cart retrieval', async () => {
      const cart = makeCart();
      mockCartRepo.findBySessionId.mockResolvedValue(cart);

      await service.getOrCreateCart('session-abc');

      expect(mockCartRepo.refreshTTL).toHaveBeenCalledWith(cart.id);
    });
  });
});
