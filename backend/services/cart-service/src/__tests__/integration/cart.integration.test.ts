/**
 * Integration tests for Cart Service
 *
 * Tests CartService with real repository instances and DynamoDB mocked at the
 * AWS SDK level (aws-sdk-client-mock). This validates the full stack of
 * business logic: CartService → Repositories → DynamoDB SDK.
 */

// Set environment variables before any imports
process.env.DYNAMODB_TABLE_NAME = 'test-cart-integration';
process.env.AWS_REGION = 'us-east-1';
process.env.JWT_SECRET = 'test-secret';

import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBOptimized } from '../../../../../src/services/dynamodb/DynamoDBOptimized';
import { CartService } from '../../../../../src/services/CartService';
import { DiscountType } from '../../../../../src/services/dynamodb/repositories/types';

// Mock config to avoid external dependency
jest.mock('../../../../../src/config', () => ({
  config: { taxRate: 0.1 },
}));

// Mock at the DynamoDB Document Client level — intercepts all instances
const ddbMock = mockClient(DynamoDBDocumentClient);

// ─────────────────────────────────────────────────────────────────────────────
// Shared test data
// ─────────────────────────────────────────────────────────────────────────────

const NOW = '2024-06-01T00:00:00.000Z';
const TTL_30_DAYS = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

const SESSION_ID = 'test-session-abc';
const USER_ID = 42;
const CART_ID = 'cart-uuid-1';
const SESSION_CART_ID = 'cart-uuid-session';
const USER_CART_ID = 'cart-uuid-user';
const ITEM_ID = 'item-hash-001';
const PRODUCT_ID = 101;
const VARIANT_ID = 'variant-uuid-001';

/** Build a mock DynamoDB cart item (as stored in DynamoDB) */
function makeDdbCart(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: `CART#${CART_ID}`,
    SK: 'METADATA',
    id: CART_ID,
    session_id: SESSION_ID,
    user_id: undefined,
    discount_code: undefined,
    discount_amount: 0,
    created_at: NOW,
    updated_at: NOW,
    expires_at: TTL_30_DAYS,
    ...overrides,
  };
}

/** Build a mock DynamoDB cart item record */
function makeDdbItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: `CART#${CART_ID}`,
    SK: `ITEM#${ITEM_ID}`,
    id: ITEM_ID,
    cart_id: CART_ID,
    product_id: PRODUCT_ID,
    variant_id: undefined,
    quantity: 2,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

/** Build a mock DynamoDB product record */
function makeDdbProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: `PRODUCT#${PRODUCT_ID}`,
    SK: 'METADATA',
    id: PRODUCT_ID,
    slug: 'test-product',
    title: 'Test Product',
    base_price: 50,
    currency: 'USD',
    status: 'published',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

/** Build a mock DynamoDB product variant record */
function makeDdbVariant(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: `VARIANT#${VARIANT_ID}`,
    SK: 'METADATA',
    id: VARIANT_ID,
    product_id: PRODUCT_ID,
    sku: 'SKU-001',
    name: 'Red / Large',
    price_adjustment: 10,
    stock: 10,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

/** Build a mock DynamoDB discount code record */
function makeDdbDiscount(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PK: 'DISCOUNT_CODE#1',
    SK: 'METADATA',
    GSI1PK: 'DISCOUNT_CODE#SAVE10',
    id: 1,
    code: 'SAVE10',
    discount_type: DiscountType.FIXED,
    discount_value: 5,
    times_used: 0,
    is_active: true,
    valid_from: '2020-01-01T00:00:00.000Z',
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────────────────

describe('Cart Service Integration Tests', () => {
  let service: CartService;

  beforeEach(() => {
    ddbMock.reset();

    const dynamoDB = new DynamoDBOptimized({
      tableName: 'test-cart-integration',
      region: 'us-east-1',
    });

    service = new CartService(dynamoDB);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Cart Operations
  // ───────────────────────────────────────────────────────────────────────────

  describe('Cart Operations', () => {
    describe('Create cart', () => {
      it('should create a new cart when no cart exists for the session', async () => {
        // findBySessionId → no cart found; create cart
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        const cart = await service.getOrCreateCart(SESSION_ID);

        expect(cart).toBeDefined();
        expect(cart.session_id).toBe(SESSION_ID);
        expect(cart.id).toBeDefined();
        expect(cart.user_id).toBeUndefined();
      });

      it('should return existing cart for a known session', async () => {
        const existingCart = makeDdbCart();
        // findBySessionId → cart found
        ddbMock.on(QueryCommand).resolves({ Items: [existingCart] });
        ddbMock.on(UpdateCommand).resolves({});

        const cart = await service.getOrCreateCart(SESSION_ID);

        expect(cart.id).toBe(CART_ID);
        expect(cart.session_id).toBe(SESSION_ID);
      });

      it('should find user cart and associate session when authenticated', async () => {
        const userCart = makeDdbCart({ id: USER_CART_ID, user_id: USER_ID, session_id: undefined });

        // findBySessionId → no session cart; findByUserId → user cart found
        ddbMock.on(QueryCommand)
          .resolvesOnce({ Items: [] })         // findBySessionId
          .resolvesOnce({ Items: [userCart] }); // findByUserId
        // update cart to associate session
        ddbMock.on(UpdateCommand).resolves({
          Attributes: { ...userCart, session_id: SESSION_ID },
        });

        const cart = await service.getOrCreateCart(SESSION_ID, USER_ID);

        expect(cart.id).toBe(USER_CART_ID);
      });

      it('should create a new cart for authenticated user with no existing cart', async () => {
        // findBySessionId → no session cart; findByUserId → no user cart
        ddbMock.on(QueryCommand)
          .resolvesOnce({ Items: [] })  // findBySessionId
          .resolvesOnce({ Items: [] }); // findByUserId
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        const cart = await service.getOrCreateCart(SESSION_ID, USER_ID);

        expect(cart).toBeDefined();
        expect(cart.user_id).toBe(USER_ID);
        expect(cart.session_id).toBe(SESSION_ID);
      });
    });

    describe('Add items', () => {
      it('should add a new item to the cart', async () => {
        // productRepo.findById → product; no variant; findByCartId → empty; addItem
        ddbMock.on(GetCommand).resolves({ Item: makeDdbProduct() });
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        const item = await service.addItem(CART_ID, PRODUCT_ID, undefined, 2);

        expect(item).toBeDefined();
        expect(item.cart_id).toBe(CART_ID);
        expect(item.product_id).toBe(PRODUCT_ID);
        expect(item.quantity).toBe(2);
      });

      it('should add item with a variant', async () => {
        const variant = makeDdbVariant();
        // productRepo.findById uses GetCommand; variantRepo.findById uses QueryCommand (GSI1)
        ddbMock.on(GetCommand).resolves({ Item: makeDdbProduct() });
        // variant existence, findByCartId, validateStock variant — all QueryCommand
        ddbMock.on(QueryCommand)
          .resolvesOnce({ Items: [variant] }) // variantRepo.findById (existence)
          .resolvesOnce({ Items: [] })         // cartItemRepo.findByCartId
          .resolvesOnce({ Items: [variant] }); // validateStock: variantRepo.findById
        ddbMock.on(PutCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        const item = await service.addItem(CART_ID, PRODUCT_ID, VARIANT_ID, 1);

        expect(item).toBeDefined();
        expect(item.variant_id).toBe(VARIANT_ID);
        expect(item.quantity).toBe(1);
      });

      it('should reject adding item with invalid quantity', async () => {
        await expect(service.addItem(CART_ID, PRODUCT_ID, undefined, 0))
          .rejects.toThrow('Invalid quantity');

        await expect(service.addItem(CART_ID, PRODUCT_ID, undefined, -1))
          .rejects.toThrow('Invalid quantity');
      });

      it('should reject adding item when product does not exist', async () => {
        // productRepo.findById → product not found
        ddbMock.on(GetCommand).resolves({ Item: undefined });

        await expect(service.addItem(CART_ID, PRODUCT_ID, undefined, 1))
          .rejects.toThrow('Product not found');
      });

      it('should reject adding item when variant does not exist', async () => {
        // productRepo.findById → GetCommand; variantRepo.findById → QueryCommand (GSI1)
        ddbMock.on(GetCommand).resolves({ Item: makeDdbProduct() });
        ddbMock.on(QueryCommand).resolves({ Items: [] }); // variant not found

        await expect(service.addItem(CART_ID, PRODUCT_ID, VARIANT_ID, 1))
          .rejects.toThrow('Variant not found');
      });

      it('should sum quantity when adding existing product/variant combination', async () => {
        const existingItem = makeDdbItem({ quantity: 3 });
        const updatedItem = makeDdbItem({ quantity: 5 }); // 3 + 2

        // no variant → only one GetCommand (product)
        ddbMock.on(GetCommand)
          .resolvesOnce({ Item: makeDdbProduct() }) // productRepo.findById
          .resolvesOnce({ Item: existingItem });     // cartItemRepo.findById (fallback in addItem)
        // findByCartId → item exists; addItem → ConditionalCheckFailed → updateQuantity
        ddbMock.on(QueryCommand).resolves({ Items: [existingItem] });
        const conditionError = new Error('ConditionalCheckFailedException');
        conditionError.name = 'ConditionalCheckFailedException';
        ddbMock.on(PutCommand).rejectsOnce(conditionError);
        ddbMock.on(UpdateCommand)
          .resolvesOnce({ Attributes: updatedItem }) // updateQuantity
          .resolves({});                             // refreshTTL

        const item = await service.addItem(CART_ID, PRODUCT_ID, undefined, 2);

        expect(item.quantity).toBe(5);
      });
    });

    describe('Update quantity', () => {
      it('should update item quantity', async () => {
        const updatedItem = makeDdbItem({ quantity: 5 });

        // updateQuantity then refreshTTL
        ddbMock.on(UpdateCommand)
          .resolvesOnce({ Attributes: updatedItem }) // cartItemRepo.updateQuantity
          .resolves({});                             // refreshTTL

        const item = await service.updateQuantity(CART_ID, ITEM_ID, 5);

        expect(item.quantity).toBe(5);
        expect(item.id).toBe(ITEM_ID);
      });

      it('should reject update with invalid quantity', async () => {
        await expect(service.updateQuantity(CART_ID, ITEM_ID, 0))
          .rejects.toThrow('Invalid quantity');

        await expect(service.updateQuantity(CART_ID, ITEM_ID, -5))
          .rejects.toThrow('Invalid quantity');

        await expect(service.updateQuantity(CART_ID, ITEM_ID, Infinity))
          .rejects.toThrow('Invalid quantity');
      });

      it('should throw when item not found during update', async () => {
        const notFoundError = new Error('ConditionalCheckFailedException');
        notFoundError.name = 'ConditionalCheckFailedException';
        ddbMock.on(UpdateCommand).rejectsOnce(notFoundError);

        await expect(service.updateQuantity(CART_ID, ITEM_ID, 3))
          .rejects.toThrow('Item not found');
      });
    });

    describe('Remove items', () => {
      it('should remove a single item from the cart', async () => {
        ddbMock.on(DeleteCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        await expect(service.removeItem(CART_ID, ITEM_ID)).resolves.toBeUndefined();
      });

      it('should resolve successfully even if item does not exist (idempotent delete)', async () => {
        ddbMock.on(DeleteCommand).resolves({});
        ddbMock.on(UpdateCommand).resolves({});

        await expect(service.removeItem(CART_ID, 'non-existent-item')).resolves.toBeUndefined();
      });
    });

    describe('Clear cart', () => {
      it('should remove all items from the cart', async () => {
        const item1 = makeDdbItem({ id: 'item-1', SK: 'ITEM#item-1' });
        const item2 = makeDdbItem({ id: 'item-2', SK: 'ITEM#item-2' });

        // findByCartId → two items; batchDelete; refreshTTL
        ddbMock.on(QueryCommand).resolves({ Items: [item1, item2] });
        ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} });
        ddbMock.on(UpdateCommand).resolves({});

        await expect(service.clearCart(CART_ID)).resolves.toBeUndefined();
      });

      it('should resolve when cart is already empty', async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });
        ddbMock.on(UpdateCommand).resolves({});

        await expect(service.clearCart(CART_ID)).resolves.toBeUndefined();
      });
    });

    describe('Get cart items', () => {
      it('should return all items in a cart', async () => {
        const item1 = makeDdbItem({ id: 'item-1', SK: 'ITEM#item-1' });
        const item2 = makeDdbItem({ id: 'item-2', SK: 'ITEM#item-2', product_id: 202 });

        ddbMock.on(QueryCommand).resolves({ Items: [item1, item2] });

        const items = await service.getCartItems(CART_ID);

        expect(items).toHaveLength(2);
        expect(items[0].id).toBe('item-1');
        expect(items[1].product_id).toBe(202);
      });

      it('should return empty array for cart with no items', async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });

        const items = await service.getCartItems(CART_ID);

        expect(items).toEqual([]);
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Cart Merge
  // ───────────────────────────────────────────────────────────────────────────

  describe('Cart Merge', () => {
    it('should merge session cart items into user cart', async () => {
      const sessionItem = {
        PK: `CART#${SESSION_CART_ID}`,
        SK: 'ITEM#item-s1',
        id: 'item-s1',
        cart_id: SESSION_CART_ID,
        product_id: PRODUCT_ID,
        variant_id: undefined,
        quantity: 3,
        created_at: NOW,
        updated_at: NOW,
      };

      // mergeItems: source items, dest items (empty), clearCart source items
      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [sessionItem] }) // findByCartId source
        .resolvesOnce({ Items: [] })            // findByCartId dest
        .resolvesOnce({ Items: [sessionItem] }); // findByCartId source (clearCart)
      ddbMock.on(PutCommand).resolves({});        // put session item into user cart
      ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} }); // clear source
      ddbMock.on(DeleteCommand).resolves({});     // delete session cart
      ddbMock.on(UpdateCommand).resolves({});     // refreshTTL

      await expect(service.mergeCarts(SESSION_CART_ID, USER_CART_ID)).resolves.toBeUndefined();
    });

    it('should handle duplicate items by summing quantities', async () => {
      const sessionItem = {
        PK: `CART#${SESSION_CART_ID}`,
        SK: 'ITEM#item-s1',
        id: 'item-s1',
        cart_id: SESSION_CART_ID,
        product_id: PRODUCT_ID,
        variant_id: undefined,
        quantity: 2,
        created_at: NOW,
        updated_at: NOW,
      };
      const userItem = {
        PK: `CART#${USER_CART_ID}`,
        SK: 'ITEM#item-u1',
        id: 'item-u1',
        cart_id: USER_CART_ID,
        product_id: PRODUCT_ID, // same product — duplicate
        variant_id: undefined,
        quantity: 3,
        created_at: NOW,
        updated_at: NOW,
      };
      const mergedItem = { ...userItem, quantity: 5 }; // 3 + 2

      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [sessionItem] }) // findByCartId source
        .resolvesOnce({ Items: [userItem] })    // findByCartId dest
        .resolvesOnce({ Items: [sessionItem] }); // findByCartId source (clearCart)
      // updateQuantity sums quantities; refreshTTL resolves after
      ddbMock.on(UpdateCommand)
        .resolvesOnce({ Attributes: mergedItem }) // updateQuantity dest item
        .resolves({});                            // refreshTTL
      ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} });
      ddbMock.on(DeleteCommand).resolves({});

      await expect(service.mergeCarts(SESSION_CART_ID, USER_CART_ID)).resolves.toBeUndefined();
    });

    it('should preserve non-duplicate items from both carts after merge', async () => {
      const sessionItem = {
        PK: `CART#${SESSION_CART_ID}`,
        SK: 'ITEM#item-s1',
        id: 'item-s1',
        cart_id: SESSION_CART_ID,
        product_id: 111,     // unique product in session cart
        variant_id: undefined,
        quantity: 1,
        created_at: NOW,
        updated_at: NOW,
      };
      const userItem = {
        PK: `CART#${USER_CART_ID}`,
        SK: 'ITEM#item-u1',
        id: 'item-u1',
        cart_id: USER_CART_ID,
        product_id: 222,     // different product in user cart
        variant_id: undefined,
        quantity: 2,
        created_at: NOW,
        updated_at: NOW,
      };

      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [sessionItem] }) // findByCartId source
        .resolvesOnce({ Items: [userItem] })    // findByCartId dest (no match)
        .resolvesOnce({ Items: [sessionItem] }); // findByCartId source (clearCart)
      ddbMock.on(PutCommand).resolves({});       // put session item into user cart
      ddbMock.on(BatchWriteCommand).resolves({ UnprocessedItems: {} });
      ddbMock.on(DeleteCommand).resolves({});
      ddbMock.on(UpdateCommand).resolves({});    // refreshTTL

      await expect(service.mergeCarts(SESSION_CART_ID, USER_CART_ID)).resolves.toBeUndefined();
    });

    it('should handle merge when session cart is empty', async () => {
      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [] })  // findByCartId source (empty)
        .resolvesOnce({ Items: [] })  // findByCartId dest
        .resolvesOnce({ Items: [] }); // findByCartId source (clearCart — empty)
      ddbMock.on(DeleteCommand).resolves({});
      ddbMock.on(UpdateCommand).resolves({});

      await expect(service.mergeCarts(SESSION_CART_ID, USER_CART_ID)).resolves.toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Discount
  // ───────────────────────────────────────────────────────────────────────────

  describe('Discount', () => {
    describe('Apply valid discount', () => {
      it('should apply a fixed discount code', async () => {
        const discount = makeDdbDiscount({
          discount_type: DiscountType.FIXED,
          discount_value: 15,
        });
        const updatedCart = makeDdbCart({ discount_code: 'SAVE10', discount_amount: 15 });

        // findByCode × 2 (applyDiscount + incrementUsage); incrementUsage UpdateCommand; cart update
        ddbMock.on(QueryCommand)
          .resolvesOnce({ Items: [discount] })  // discountRepo.findByCode
          .resolvesOnce({ Items: [discount] }); // incrementUsage: findByCode
        ddbMock.on(UpdateCommand)
          .resolvesOnce({ Attributes: { ...discount, times_used: 1 } }) // incrementUsage
          .resolvesOnce({ Attributes: updatedCart });                    // cartRepo.update

        const cart = await service.applyDiscount(CART_ID, 'SAVE10');

        expect(cart.discount_code).toBe('SAVE10');
        expect(cart.discount_amount).toBe(15);
      });

      it('should apply a percentage discount code', async () => {
        const discount = makeDdbDiscount({
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 20, // 20%
        });
        const cartItem = makeDdbItem({ quantity: 1 });
        // subtotal = base_price(50) * qty(1) = 50; 20% of 50 = 10
        const updatedCart = makeDdbCart({ discount_code: 'SAVE10', discount_amount: 10 });

        ddbMock.on(QueryCommand)
          .resolvesOnce({ Items: [discount] })  // discountRepo.findByCode
          .resolvesOnce({ Items: [discount] })  // incrementUsage: findByCode
          .resolvesOnce({ Items: [cartItem] }); // calculateTotals: cartItemRepo.findByCartId
        ddbMock.on(UpdateCommand)
          .resolvesOnce({ Attributes: { ...discount, times_used: 1 } }) // incrementUsage
          .resolvesOnce({ Attributes: updatedCart });                    // cartRepo.update
        ddbMock.on(GetCommand)
          .resolvesOnce({ Item: makeDdbCart() })    // calculateTotals: cartRepo.findById
          .resolvesOnce({ Item: makeDdbProduct() }); // calculateTotals: productRepo.findById

        const cart = await service.applyDiscount(CART_ID, 'SAVE10');

        expect(cart.discount_code).toBe('SAVE10');
        expect(cart.discount_amount).toBe(10);
      });

      it('should cap percentage discount at max_discount_amount', async () => {
        const discount = makeDdbDiscount({
          discount_type: DiscountType.PERCENTAGE,
          discount_value: 50,     // 50% of 50 = 25
          max_discount_amount: 8, // capped at $8
        });
        const cartItem = makeDdbItem({ quantity: 1 });
        const updatedCart = makeDdbCart({ discount_code: 'SAVE10', discount_amount: 8 });

        ddbMock.on(QueryCommand)
          .resolvesOnce({ Items: [discount] })
          .resolvesOnce({ Items: [discount] })
          .resolvesOnce({ Items: [cartItem] });
        ddbMock.on(UpdateCommand)
          .resolvesOnce({ Attributes: { ...discount, times_used: 1 } })
          .resolvesOnce({ Attributes: updatedCart });
        ddbMock.on(GetCommand)
          .resolvesOnce({ Item: makeDdbCart() })
          .resolvesOnce({ Item: makeDdbProduct() });

        const cart = await service.applyDiscount(CART_ID, 'SAVE10');

        expect(cart.discount_amount).toBe(8);
      });
    });

    describe('Reject invalid discount', () => {
      it('should throw when discount code does not exist', async () => {
        ddbMock.on(QueryCommand).resolves({ Items: [] });

        await expect(service.applyDiscount(CART_ID, 'INVALID'))
          .rejects.toThrow('Invalid discount code');
      });

      it('should throw when discount code is expired or inactive', async () => {
        const discount = makeDdbDiscount();
        const conditionError = new Error('ConditionalCheckFailedException');
        conditionError.name = 'ConditionalCheckFailedException';

        ddbMock.on(QueryCommand)
          .resolvesOnce({ Items: [discount] }) // findByCode
          .resolvesOnce({ Items: [discount] }); // incrementUsage: findByCode
        ddbMock.on(UpdateCommand).rejectsOnce(conditionError); // incrementUsage fails

        await expect(service.applyDiscount(CART_ID, 'SAVE10'))
          .rejects.toThrow('Discount code is expired or no longer active');
      });

      it('should throw when discount code has reached max_uses', async () => {
        const discount = makeDdbDiscount({ max_uses: 5, times_used: 5 });
        const conditionError = new Error('ConditionalCheckFailedException');
        conditionError.name = 'ConditionalCheckFailedException';

        ddbMock.on(QueryCommand)
          .resolvesOnce({ Items: [discount] })
          .resolvesOnce({ Items: [discount] });
        ddbMock.on(UpdateCommand).rejectsOnce(conditionError);

        await expect(service.applyDiscount(CART_ID, 'SAVE10'))
          .rejects.toThrow('Discount code is expired or no longer active');
      });
    });

    describe('Remove discount', () => {
      it('should remove an applied discount from the cart', async () => {
        const cartWithDiscount = makeDdbCart({ discount_code: 'SAVE10', discount_amount: 15 });
        const cartWithoutDiscount = makeDdbCart({ discount_code: undefined, discount_amount: undefined });
        const discount = makeDdbDiscount();

        ddbMock.on(GetCommand).resolves({ Item: cartWithDiscount }); // cartRepo.findById
        ddbMock.on(UpdateCommand)
          .resolvesOnce({ Attributes: cartWithoutDiscount })              // cartRepo.update
          .resolvesOnce({ Attributes: { ...discount, times_used: 0 } }); // decrementUsage
        ddbMock.on(QueryCommand).resolves({ Items: [discount] });         // decrementUsage: findByCode

        const cart = await service.removeDiscount(CART_ID);

        expect(cart.discount_code).toBeUndefined();
        expect(cart.discount_amount).toBeUndefined();
      });

      it('should throw when cart does not exist', async () => {
        ddbMock.on(GetCommand).resolves({ Item: undefined });

        await expect(service.removeDiscount(CART_ID)).rejects.toThrow('Cart not found');
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. TTL
  // ───────────────────────────────────────────────────────────────────────────

  describe('TTL', () => {
    it('should set cart TTL to approximately 30 days from now on creation', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      let capturedPutInput: Record<string, unknown> | undefined;
      ddbMock.on(PutCommand).callsFake(async (input) => {
        capturedPutInput = input;
        return {};
      });
      ddbMock.on(UpdateCommand).resolves({});

      await service.getOrCreateCart(SESSION_ID);

      expect(capturedPutInput).toBeDefined();
      const item = (capturedPutInput as any).Item;
      expect(item).toBeDefined();
      expect(item.expires_at).toBeDefined();

      const expectedTTL = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;
      expect(item.expires_at).toBeGreaterThan(expectedTTL - 5);
      expect(item.expires_at).toBeLessThan(expectedTTL + 5);
    });

    it('should refresh TTL on cart activity (addItem)', async () => {
      let updateCallCount = 0;

      ddbMock.on(GetCommand).resolves({ Item: makeDdbProduct() });
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});
      ddbMock.on(UpdateCommand).callsFake(async () => {
        updateCallCount++;
        return {};
      });

      await service.addItem(CART_ID, PRODUCT_ID, undefined, 1);

      // refreshTTL fires at least once after addItem
      expect(updateCallCount).toBeGreaterThanOrEqual(1);
    });

    it('should refresh TTL on updateQuantity', async () => {
      let updateCallCount = 0;

      ddbMock.on(UpdateCommand).callsFake(async () => {
        updateCallCount++;
        return { Attributes: makeDdbItem({ quantity: 5 }) };
      });

      await service.updateQuantity(CART_ID, ITEM_ID, 5);

      expect(updateCallCount).toBeGreaterThanOrEqual(1);
    });

    it('should refresh TTL on removeItem', async () => {
      let updateCallCount = 0;

      ddbMock.on(DeleteCommand).resolves({});
      ddbMock.on(UpdateCommand).callsFake(async () => {
        updateCallCount++;
        return {};
      });

      await service.removeItem(CART_ID, ITEM_ID);

      expect(updateCallCount).toBeGreaterThanOrEqual(1);
    });

    it('should refresh TTL on clearCart', async () => {
      let updateCallCount = 0;

      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(UpdateCommand).callsFake(async () => {
        updateCallCount++;
        return {};
      });

      await service.clearCart(CART_ID);

      expect(updateCallCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Stock Validation
  // ───────────────────────────────────────────────────────────────────────────

  describe('Stock Validation', () => {
    it('should prevent adding more than available stock', async () => {
      const variantWithLowStock = makeDdbVariant({ stock: 3 });

      // productRepo uses GetCommand; variantRepo.findById uses QueryCommand (GSI1)
      ddbMock.on(GetCommand).resolves({ Item: makeDdbProduct() });
      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [variantWithLowStock] }) // variantRepo.findById (existence)
        .resolvesOnce({ Items: [] })                    // cartItemRepo.findByCartId
        .resolvesOnce({ Items: [variantWithLowStock] }); // validateStock (stock=3, qty=5 → error)

      // Requesting 5 when stock is 3 (finalQty = 0 + 5 = 5 > 3)
      await expect(service.addItem(CART_ID, PRODUCT_ID, VARIANT_ID, 5))
        .rejects.toThrow('Insufficient stock available');
    });

    it('should allow adding exactly the available stock quantity', async () => {
      const variantWithStock = makeDdbVariant({ stock: 5 });

      ddbMock.on(GetCommand).resolves({ Item: makeDdbProduct() });
      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [variantWithStock] }) // existence
        .resolvesOnce({ Items: [] })                  // cartItemRepo.findByCartId
        .resolvesOnce({ Items: [variantWithStock] }); // validateStock (finalQty=5 == stock=5 → OK)
      ddbMock.on(PutCommand).resolves({});
      ddbMock.on(UpdateCommand).resolves({});

      const item = await service.addItem(CART_ID, PRODUCT_ID, VARIANT_ID, 5);

      expect(item.quantity).toBe(5);
    });

    it('should validate combined quantity against stock when item already in cart', async () => {
      // Existing qty=3 + incoming qty=3 = 6 > stock=5
      const variantWithStock = makeDdbVariant({ stock: 5 });
      const existingItem = makeDdbItem({ variant_id: VARIANT_ID, quantity: 3 });

      ddbMock.on(GetCommand).resolves({ Item: makeDdbProduct() });
      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [variantWithStock] }) // existence
        .resolvesOnce({ Items: [existingItem] })     // cartItemRepo.findByCartId (qty=3)
        .resolvesOnce({ Items: [variantWithStock] }); // validateStock (finalQty=3+3=6 > 5)

      await expect(service.addItem(CART_ID, PRODUCT_ID, VARIANT_ID, 3))
        .rejects.toThrow('Insufficient stock available');
    });

    it('should allow adding more items when combined quantity is within stock', async () => {
      // Existing qty=3 + incoming qty=4 = 7 ≤ stock=10 → OK
      const variantWithStock = makeDdbVariant({ stock: 10 });
      const existingItem = makeDdbItem({ variant_id: VARIANT_ID, quantity: 3 });
      const updatedItem = makeDdbItem({ variant_id: VARIANT_ID, quantity: 7 });
      const conditionError = new Error('ConditionalCheckFailedException');
      conditionError.name = 'ConditionalCheckFailedException';

      ddbMock.on(GetCommand)
        .resolvesOnce({ Item: makeDdbProduct() })  // productRepo.findById
        .resolvesOnce({ Item: existingItem });      // cartItemRepo.findById (after ConditionalCheck)
      // variant existence, findByCartId, validateStock stock check — all QueryCommand
      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [variantWithStock] }) // variantRepo.findById (existence)
        .resolvesOnce({ Items: [existingItem] })     // cartItemRepo.findByCartId
        .resolvesOnce({ Items: [variantWithStock] }); // validateStock (finalQty=7 ≤ 10)
      ddbMock.on(PutCommand).rejectsOnce(conditionError); // item exists → fallback to update
      ddbMock.on(UpdateCommand)
        .resolvesOnce({ Attributes: updatedItem }) // updateQuantity
        .resolves({});                             // refreshTTL

      const item = await service.addItem(CART_ID, PRODUCT_ID, VARIANT_ID, 4);

      expect(item.quantity).toBe(7);
    });

    it('should skip stock validation for items without a variant', async () => {
      // No variant → validateStock returns immediately without a DB call
      ddbMock.on(GetCommand).resolves({ Item: makeDdbProduct() });
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(PutCommand).resolves({});
      ddbMock.on(UpdateCommand).resolves({});

      const item = await service.addItem(CART_ID, PRODUCT_ID, undefined, 999);

      expect(item.quantity).toBe(999);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Calculate Totals
  // ───────────────────────────────────────────────────────────────────────────

  describe('Calculate Totals', () => {
    it('should calculate correct totals with product price and tax', async () => {
      const cartItem = makeDdbItem({ quantity: 2 }); // 50 * 2 = 100

      ddbMock.on(GetCommand)
        .resolvesOnce({ Item: makeDdbCart() })    // cartRepo.findById
        .resolvesOnce({ Item: makeDdbProduct() }); // productRepo.findById
      ddbMock.on(QueryCommand).resolves({ Items: [cartItem] }); // cartItemRepo.findByCartId

      const totals = await service.calculateTotals(CART_ID);

      // subtotal=100; tax=10; discount=0; total=110
      expect(totals.subtotal).toBe(100);
      expect(totals.tax).toBeCloseTo(10);
      expect(totals.discount).toBe(0);
      expect(totals.total).toBeCloseTo(110);
    });

    it('should include variant price adjustment in totals', async () => {
      const cartItem = makeDdbItem({ variant_id: VARIANT_ID, quantity: 1 });
      // base_price=50 + price_adjustment=10 = 60 per unit
      // cartRepo.findById and cartItemRepo.findByCartId run in parallel (GetCommand + QueryCommand)
      // productRepo.findById and variantRepo.findById run in parallel (GetCommand + QueryCommand)
      ddbMock.on(GetCommand)
        .resolvesOnce({ Item: makeDdbCart() })    // cartRepo.findById
        .resolvesOnce({ Item: makeDdbProduct() }); // productRepo.findById
      ddbMock.on(QueryCommand)
        .resolvesOnce({ Items: [cartItem] })          // cartItemRepo.findByCartId
        .resolvesOnce({ Items: [makeDdbVariant()] }); // variantRepo.findById (GSI1)

      const totals = await service.calculateTotals(CART_ID);

      // subtotal=60; tax=6; total=66
      expect(totals.subtotal).toBe(60);
      expect(totals.tax).toBeCloseTo(6);
      expect(totals.total).toBeCloseTo(66);
    });

    it('should apply discount when cart has a discount code', async () => {
      const cartWithDiscount = makeDdbCart({ discount_code: 'SAVE10', discount_amount: 15 });
      const cartItem = makeDdbItem({ quantity: 2 }); // subtotal=100

      ddbMock.on(GetCommand)
        .resolvesOnce({ Item: cartWithDiscount }) // cartRepo.findById
        .resolvesOnce({ Item: makeDdbProduct() }); // productRepo.findById
      ddbMock.on(QueryCommand).resolves({ Items: [cartItem] });

      const totals = await service.calculateTotals(CART_ID);

      // subtotal=100; tax=10; discount=15; total=95
      expect(totals.subtotal).toBe(100);
      expect(totals.discount).toBe(15);
      expect(totals.total).toBeCloseTo(95);
    });

    it('should return zero totals for empty cart', async () => {
      ddbMock.on(GetCommand).resolves({ Item: makeDdbCart() });
      ddbMock.on(QueryCommand).resolves({ Items: [] });

      const totals = await service.calculateTotals(CART_ID);

      expect(totals.subtotal).toBe(0);
      expect(totals.tax).toBe(0);
      expect(totals.discount).toBe(0);
      expect(totals.total).toBe(0);
    });
  });
});
