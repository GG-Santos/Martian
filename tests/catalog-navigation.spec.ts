import { test, expect } from '@playwright/test';

test('catalog opens a dedicated quest briefing', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByRole('heading', { name: 'Survey the surface contact' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Quest catalog' }).getByRole('link', { name: /Survey the surface contact/ })).toHaveCount(1);
  await page.getByRole('link', { name: /Survey the surface contact/ }).click();
  await expect(page).toHaveURL(/\/board\/builtin-A$/);
  await expect(page.getByRole('heading', { name: 'Mission brief' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Requirements' })).toBeVisible();
});
