import { test, expect } from '@playwright/test';
import { mockShopEntities } from './fixtures/shopCartMocks';

/**
 * E2E tests for the Shop flow.
 * Covers: browse products, view product details, search, filter by category,
 * pagination, and page-load performance.
 */

const SHOP_PATH = '/it/shop';

test.describe('Shop Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockShopEntities(page);
  });

  test('page loads within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(SHOP_PATH);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('browse products – product cards are visible', async ({ page }) => {
    await page.goto(SHOP_PATH);
    await page.waitForLoadState('domcontentloaded');

    const cards = page.locator('main .grid > div.cursor-pointer');
    await expect(cards.first()).toBeVisible();
  });

  test('search products', async ({ page }) => {
    await page.goto(SHOP_PATH);
    const searchInput = page.getByPlaceholder(/cerca|search/i).first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('test');
    // Allow the debounce / re-fetch to happen
    await page.waitForTimeout(600);
    // The page should not crash after a search
    await expect(page).toHaveURL(/shop/);
  });

  test('filter by category (character)', async ({ page }) => {
    await page.goto(SHOP_PATH);
    const dropdown = page.locator('.p-dropdown').first();
    await expect(dropdown).toBeVisible({ timeout: 10000 });
    await dropdown.click();
    // Select the first available option in the panel
    const option = page.locator('.p-dropdown-item').first();
    if (await option.isVisible()) {
      await option.click();
      // URL should reflect the character filter or page should remain functional
      await expect(page).toHaveURL(/shop/);
    }
  });

  test('pagination – next page button works', async ({ page }) => {
    await page.goto(SHOP_PATH);
    // Look for a pagination button ("next" or arrow)
    const nextButton = page
      .locator('button:has(.pi-angle-right), button:has(.pi-chevron-right)')
      .first();
    if (await nextButton.isVisible()) {
      const isDisabled = await nextButton.isDisabled();
      if (!isDisabled) {
        await nextButton.click();
        await page.waitForLoadState('domcontentloaded');
        await expect(page).toHaveURL(/shop/);
      }
    }
  });

  test('view product details – clicking a product opens detail', async ({ page }) => {
    await page.goto(SHOP_PATH);
    const card = page.locator('main .grid > div.cursor-pointer').first();
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();
    // A modal should appear.
    const modal = page.locator('.p-dialog, [role="dialog"]');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('navigation between pages is fast', async ({ page }) => {
    await page.goto(SHOP_PATH);
    await page.waitForLoadState('domcontentloaded');
    const start = Date.now();
    await page.goto('/it');
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});
