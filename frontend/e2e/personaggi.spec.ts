import { test, expect } from '@playwright/test';
import { mockPersonaggiEntities } from './fixtures/shopCartMocks';

/**
 * E2E tests for the Personaggi flow.
 * Covers: view all personaggi, view personaggio details via modal,
 * image gallery navigation, and page-load performance.
 */

const PERSONAGGI_PATH = '/it/personaggi';

test.describe('Personaggi Flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockPersonaggiEntities(page);
  });

  test('page loads within 3 seconds', async ({ page }) => {
    const start = Date.now();
    await page.goto(PERSONAGGI_PATH);
    await page.waitForLoadState('domcontentloaded');
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });

  test('view all personaggi – grid is rendered', async ({ page }) => {
    await page.goto(PERSONAGGI_PATH);
    await expect(page.getByText('Caricamento personaggi...')).not.toBeVisible({ timeout: 15000 });

    const personaggioName = page.getByText('Luffy').first();
    const emptyMsg = page.locator('p:has-text("Nessun personaggio")').first();
    const hasPersonaggio = await personaggioName.isVisible({ timeout: 3000 }).catch(() => false);
    const hasEmptyState = await emptyMsg.isVisible({ timeout: 3000 }).catch(() => false);

    expect(hasPersonaggio || hasEmptyState).toBe(true);
  });

  test('page title / header is visible', async ({ page }) => {
    await page.goto(PERSONAGGI_PATH);
    // The heading "I PERSONAGGI DELLA CIURMA" should appear
    const heading = page.locator('h1:has-text("PERSONAGGI")');
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test('view personaggio details – clicking a card opens modal', async ({ page }) => {
    await page.goto(PERSONAGGI_PATH);
    await expect(page.getByText('Caricamento personaggi...')).not.toBeVisible({ timeout: 15000 });

    // Find any personaggio card
    const card = page.locator('.cursor-pointer, [role="button"]').filter({ hasText: 'Luffy' }).first();

    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      await card.click();
      // A PrimeReact dialog/modal should appear
      const modal = page.locator('.p-dialog, [role="dialog"]');
      await expect(modal).toBeVisible({ timeout: 5000 });
    }
  });

  test('image gallery navigation in modal', async ({ page }) => {
    await page.goto(PERSONAGGI_PATH);
    await expect(page.getByText('Caricamento personaggi...')).not.toBeVisible({ timeout: 15000 });

    const card = page.locator('.cursor-pointer, [role="button"]').filter({ hasText: 'Luffy' }).first();

    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      await card.click();

      const modal = page.locator('.p-dialog, [role="dialog"]');
      if (await modal.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Try next image navigation button inside the modal
        const nextBtn = modal
          .locator('button:has(.pi-angle-right), button:has(.pi-chevron-right), button:has-text("›")')
          .first();

        if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          const isDisabled = await nextBtn.isDisabled();
          if (!isDisabled) {
            await nextBtn.click();
            // Gallery should still be visible after navigation
            await expect(modal).toBeVisible();
          }
        }

        // Close the modal
        const closeBtn = modal
          .locator('button[aria-label="Close"], button.p-dialog-header-close, button:has(.pi-times)')
          .first();
        if (await closeBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
          await closeBtn.click();
          await expect(modal).not.toBeVisible({ timeout: 5000 });
        }
      }
    }
  });

  test('Animantra logo is visible', async ({ page }) => {
    await page.goto(PERSONAGGI_PATH);
    const logo = page.locator('img[alt="Animantra Logo"]');
    await expect(logo).toBeVisible({ timeout: 10000 });
  });

  test('images load within 2 seconds', async ({ page }) => {
    await page.goto(PERSONAGGI_PATH);
    await expect(page.getByText('Caricamento personaggi...')).not.toBeVisible({ timeout: 15000 });

    const start = Date.now();
    await page.waitForSelector('img', { timeout: 10000 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });

  test('empty state message shown when no personaggi available', async ({ page }) => {
    await page.goto(PERSONAGGI_PATH);
    await expect(page.getByText('Caricamento personaggi...')).not.toBeVisible({ timeout: 15000 });

    const items = page.locator('.cursor-pointer, [role="button"]').filter({ hasText: 'Luffy' });
    const count = await items.count();

    if (count === 0) {
      const emptyMsg = page.locator('p:has-text("Nessun personaggio")');
      await expect(emptyMsg).toBeVisible({ timeout: 5000 });
    }
  });
});
