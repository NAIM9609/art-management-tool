import type { Page } from '@playwright/test';

const baseProduct = {
  id: 101,
  slug: 'mock-art-print',
  title: 'Mock Art Print',
  short_description: 'Mock short description',
  long_description: 'Mock long description',
  base_price: 49.9,
  currency: 'EUR',
  sku: 'MOCK-101',
  status: 'published',
  character_id: 1,
  character_value: 'Luffy',
  etsy_link: 'https://www.etsy.com/listing/mock-art-print',
  images: [
    { id: 1, url: '/assets/logo.svg', alt_text: 'Mock product image', position: 1, is_primary: true },
  ],
  variants: [
    {
      id: 201,
      product_id: 101,
      sku: 'MOCK-101-DEFAULT',
      name: 'Default',
      attributes: '{}',
      price_adjustment: 0,
      stock: 12,
    },
  ],
} as const;

const baseCartResponse = {
  cart: {
    id: 1,
    session_token: 'mock-session-token',
    user_id: undefined,
    discount_code: undefined,
    created_at: '2026-03-15T00:00:00.000Z',
    updated_at: '2026-03-15T00:00:00.000Z',
    items: [
      {
        id: 1,
        cart_id: 1,
        product_id: 101,
        variant_id: 201,
        quantity: 1,
        product: baseProduct,
        variant: {
          id: 201,
          product_id: 101,
          sku: 'MOCK-101-DEFAULT',
          name: 'Default',
          attributes: '{}',
          price_adjustment: 0,
          stock: 12,
        },
      },
    ],
  },
  subtotal: 49.9,
  tax: 4.99,
  discount: 0,
  total: 54.89,
} as const;

export async function mockShopEntities(page: Page): Promise<void> {
  await page.route('**/api/personaggi**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        personaggi: [
          {
            id: 1,
            name: 'Luffy',
            description: 'Mock personaggio',
            images: [],
          },
        ],
        count: 1,
      }),
    });
  });

  await page.route('**/api/shop/products**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        products: [baseProduct],
        total: 1,
        page: 1,
        per_page: 12,
      }),
    });
  });
}

export async function mockCartEntities(page: Page): Promise<void> {
  await page.route('**/api/shop/cart', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(baseCartResponse),
      });
      return;
    }

    if (route.request().method() === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.continue();
  });

  await page.route('**/api/shop/cart/items', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(baseCartResponse),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/shop/cart/items/*', async (route) => {
    const method = route.request().method();

    if (method === 'PATCH') {
      const requestBody = route.request().postDataJSON() as { quantity?: number };
      const quantity = requestBody?.quantity ?? 1;

      const patched = {
        ...baseCartResponse,
        cart: {
          ...baseCartResponse.cart,
          items: [
            {
              ...baseCartResponse.cart.items[0],
              quantity,
            },
          ],
        },
      };

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(patched),
      });
      return;
    }

    if (method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
      return;
    }

    await route.continue();
  });
}
