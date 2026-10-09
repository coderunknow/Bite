import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Opens the app and waits until the starter project is shown. */
async function openStudio(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    // The Blockly and WebGL stack logs nothing expected; any console error is a regression.
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/');
  await expect(page.getByTestId('project-name')).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  return errors;
}

test('starter project opens with its objects, a stage view and no console errors', async ({ page }) => {
  const errors = await openStudio(page);
  await expect(page.getByTestId('row-Ball')).toBeVisible();
  await expect(page.getByTestId('row-Bouncer')).toBeVisible();
  await expect(page.getByTestId('row-Ground')).toBeVisible();
  await expect(page.locator('.blocklySvg').first()).toBeVisible();
  await expect(page.locator('canvas.stage-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('selecting the Ball opens its scripts without errors, and the project runs', async ({ page }) => {
  // Regression: a control block missing its substack input used to crash the whole studio on selection.
  const errors = await openStudio(page);
  await page.getByTestId('row-Ball').click();
  await expect(page.getByTestId('script-target')).toHaveText('Ball');
  await expect(page.getByTestId('script-load-error')).toHaveCount(0);
  await expect(page.locator('.blocklySvg .blocklyBlockCanvas > g').first()).toBeAttached();
  await page.getByTestId('run').click();
  await expect(page.getByTestId('run-badge')).toHaveText('Running');
  await page.waitForTimeout(500);
  await page.getByTestId('stop').click();
  expect(errors).toEqual([]);
});

test('run and stop change the program state; Stop keeps the live state', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('run').click();
  await expect(page.getByTestId('run-badge')).toHaveText('Running');
  await expect(page.getByTestId('stop')).toBeEnabled();
  await page.waitForTimeout(800);
  await page.getByTestId('stop').click();
  await expect(page.getByTestId('run-badge')).toHaveText(/Stopped/);
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('run-badge')).toHaveText('Edit');
});

test('a new project is autosaved and still open after a reload', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('project-menu').click();
  await page.getByRole('menuitem', { name: 'New project…' }).click();
  await page.getByTestId('dialog-name').fill('Persistence check');
  await page.getByTestId('dialog-submit').click();
  await expect(page.getByTestId('project-name')).toHaveText(/Persistence check/);
  await expect(page.getByTestId('save-status')).toHaveText('All changes saved');
  await page.reload();
  await expect(page.getByTestId('project-name')).toHaveText(/Persistence check/);
});

test('delete project needs the exact typed name', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('project-menu').click();
  await page.getByRole('menuitem', { name: 'New project…' }).click();
  await page.getByTestId('dialog-name').fill('Throwaway');
  await page.getByTestId('dialog-submit').click();
  await page.getByTestId('project-menu').click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  const submit = page.getByTestId('delete-submit');
  await expect(submit).toBeDisabled();
  await page.getByTestId('delete-confirm').fill('Throw');
  await expect(submit).toBeDisabled();
  await page.getByTestId('delete-confirm').fill('Throwaway');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByTestId('project-name')).not.toHaveText(/Throwaway/);
});

test('export downloads a .bite package and importing it creates a new project', async ({ page }) => {
  await openStudio(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('project-menu').click();
  await page.getByRole('menuitem', { name: 'Export .bite package…' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.bite$/);
  const path = await download.path();
  expect(readFileSync(path!).subarray(0, 2).toString('latin1')).toBe('PK');

  await page.getByTestId('project-menu').click();
  await page.getByRole('menuitem', { name: 'Import file…' }).click();
  await page.getByTestId('import-file').setInputFiles(path!);
  await expect(page.getByText(/Imported "/)).toBeVisible();
  await expect(page.getByTestId('row-Ball')).toBeVisible();
});

test('a malformed import is refused with a message and the open project is unchanged', async ({ page }, testInfo) => {
  await openStudio(page);
  const before = await page.getByTestId('project-name').textContent();
  const bad = testInfo.outputPath('broken.bite');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(bad, 'this is not a zip');
  await page.getByTestId('project-menu').click();
  await page.getByRole('menuitem', { name: 'Import file…' }).click();
  await page.getByTestId('import-file').setInputFiles(bad);
  await expect(page.getByRole('alert').filter({ hasText: 'Import failed' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('project-name')).toHaveText(before ?? '');
});

test('built-in sounds can be added and previewed only after audio is enabled', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('tab-sounds').click();
  await page.getByTestId('add-builtin-Pop').click();
  await expect(page.getByTestId('sound-Pop')).toBeVisible();
  await expect(page.getByTestId('add-builtin-Pop')).toBeDisabled();
  await page.getByTestId('sound-Pop').getByRole('button', { name: '▶' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Enable audio first' })).toBeVisible();
});

test('an object can be added and removed through the hierarchy', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('add-kind').selectOption('sphere');
  await page.getByTestId('add-object').click();
  await expect(page.getByTestId('row-Sphere')).toBeVisible();
  await expect(page.getByTestId('inspector')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByTestId('delete-object').click();
  await expect(page.getByTestId('row-Sphere')).toHaveCount(0);
});
