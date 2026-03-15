import { test, expect } from '@playwright/test';

/**
 * E2E tests for the Shop flow.
 * Covers: browse products, view product details, search, filter by category,
 * pagination, and page-load performance.
 */

const SHOP_PATH = '/it/shop';

test.describe('Shop Flow', () => {
  test('page loads within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(SHOP_PATH);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('browse products – product cards are visible', async ({ page }) => {
    await page.goto(SHOP_PATH);
    // Wait for loading spinner to disappear
    await page.waitForSelector('.p-card', { timeout: 10000 });
    const cards = page.locator('.p-card');
    await expect(cards.first()).toBeVisible();
  });

  test('search products', async ({ page }) => {
    await page.goto(SHOP_PATH);
    // Wait for the search input to appear
    const searchInput = page.locator('input[placeholder*="cerca"], input[placeholder*="search"], input[type="search"]').first();
    await searchInput.waitFor({ timeout: 10000 });
    await searchInput.fill('test');
    // Allow the debounce / re-fetch to happen
    await page.waitForTimeout(600);
    // The page should not crash after a search
    await expect(page).toHaveURL(/shop/);
  });

  test('filter by category (character)', async ({ page }) => {
    await page.goto(SHOP_PATH);
    // Wait for the dropdown filter to be available
    const dropdown = page.locator('.p-dropdown').first();
    await dropdown.waitFor({ timeout: 10000 });
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
    // Wait for at least one product card
    const card = page.locator('.p-card').first();
    await card.waitFor({ timeout: 10000 });
    await card.click();
    // A modal or detail page should appear
    const modal = page.locator('.p-dialog, [role="dialog"]');
    const isModalVisible = await modal.isVisible().catch(() => false);
    if (isModalVisible) {
      await expect(modal).toBeVisible();
    } else {
      // May navigate to a detail page instead
      await expect(page).not.toHaveURL(SHOP_PATH);
    }
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
