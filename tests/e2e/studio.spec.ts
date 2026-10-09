import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { objectNamed, openStudio, selectRow, silentWav, snap } from './helpers';

const SHOTS = process.env.BITE_SCREENSHOT_DIR ?? join(process.cwd(), 'docs', 'screenshots');

test.beforeAll(() => mkdirSync(SHOTS, { recursive: true }));

test('loads the starter project with no console errors and no remote requests', async ({ page, baseURL }) => {
  const errors: string[] = [];
  const remote: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(baseURL!) && !u.startsWith('data:') && !u.startsWith('blob:')) remote.push(u);
  });
  await openStudio(page);
  const s = await snap(page);
  expect(s.projectName).toBe('My first project');
  expect(s.mode).toBe('edit');
  expect(objectNamed(s, 'Cube').position).toEqual([0, 3, 0]);
  expect(s.backend).toBe('indexeddb');
  await page.getByTestId('tab-code').click();
  await expect(page.getByTestId('code-editor')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Blocks workspace.' })).toBeVisible();
  await page.getByTestId('tab-scene').click();
  expect(errors).toEqual([]);
  expect(remote).toEqual([]);
});

test('adds, renames and moves an object; the change is marked unsaved until saved', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('add-cube').click();
  await expect.poll(async () => (await snap(page)).objects.length).toBe(4);
  expect((await snap(page)).selection).not.toBeNull();

  const name = page.getByTestId('object-name-input');
  await name.fill('Crate');
  await name.press('Enter');
  await expect(page.getByTestId('row-Crate')).toBeVisible();

  await page.getByTestId('pos-y-input').fill('5');
  await page.getByTestId('pos-y-input').press('Enter');
  await expect.poll(async () => objectNamed(await snap(page), 'Crate').position[1]).toBe(5);

  await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes (autosaved)');
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
});

test('an empty number is rejected and the previous value is restored', async ({ page }) => {
  await openStudio(page);
  await selectRow(page, 'Cube');
  const field = page.getByTestId('pos-x-input');
  await field.fill('');
  await field.press('Enter');
  await expect(field).toHaveValue('0');
  await expect(field).toHaveAttribute('title', 'Enter a number');
  expect((await snap(page)).objects.find((o) => o.name === 'Cube')!.position[0]).toBe(0);
});

test('a number outside the allowed range is rejected and the previous value is kept', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('row-stage').click();
  const field = page.getByTestId('master-volume-input');
  await field.fill('40');
  await field.press('Enter');
  await expect.poll(async () => (await snap(page)).saveState).not.toBe('');
  await expect(field).toHaveValue('40');
  await field.fill('250');
  await field.press('Enter');
  await expect(field).toHaveValue('40');
  await expect(field).toHaveAttribute('title', 'Must be between 0 and 100');
});

test('Run: the cube falls, Space makes it jump and speak, Stop freezes, Reset restores the authored scene', async ({ page }) => {
  await openStudio(page);
  await expect.poll(async () => (await snap(page)).selection).toBeNull();
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('mode-status')).toHaveText('Running');
  await expect(page.getByTestId('pos-y-input')).toHaveCount(0);

  // Gravity: the cube falls from y=3 to rest on the ground.
  await expect.poll(async () => objectNamed(await snap(page), 'Cube').position[1], { timeout: 15_000 }).toBeLessThan(1.5);

  // Space: "when space key pressed" applies an upward impulse and says "Boing!".
  await page.locator('[data-testid=viewport]').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Space');
  await expect.poll(async () => objectNamed(await snap(page), 'Cube').says, { timeout: 5_000 }).toBe('Boing!');
  await expect.poll(async () => objectNamed(await snap(page), 'Cube').position[1], { timeout: 5_000 }).toBeGreaterThan(1.6);

  await page.screenshot({ path: join(SHOTS, 'running.png') });

  await page.getByTestId('stop-button').click();
  await expect(page.getByTestId('mode-status')).toHaveText('Stopped');
  const frozen = objectNamed(await snap(page), 'Cube').position[1];
  await page.waitForTimeout(600);
  expect(objectNamed(await snap(page), 'Cube').position[1]).toBe(frozen);

  await page.getByTestId('reset-button').click();
  await expect(page.getByTestId('mode-status')).toHaveText('Editing');
  const reset = objectNamed(await snap(page), 'Cube');
  expect(reset.position).toEqual([0, 3, 0]);
  expect(reset.says).toBeNull();
});

test('Run reports nothing in the console for the starter project', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('run-button').click();
  await expect(page.getByTestId('mode-status')).toHaveText('Running');
  await page.waitForTimeout(1000);
  await expect(page.getByTestId('log-entry')).toHaveCount(0);
  await page.getByTestId('reset-button').click();
});

test('unsaved edits are autosaved, offered for recovery after reload, and can be discarded', async ({ page }) => {
  await openStudio(page);
  await selectRow(page, 'Cube');
  await page.getByTestId('object-name-input').fill('Dice');
  await page.getByTestId('object-name-input').press('Enter');
  await expect(page.getByTestId('row-Dice')).toBeVisible();
  await expect(page.getByTestId('save-state')).toHaveText('Unsaved changes (autosaved)');
  await page.waitForTimeout(1200);

  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await expect(page.getByTestId('recovery-banner')).toBeVisible();
  await expect(page.getByTestId('row-Dice')).toBeVisible();

  await page.getByTestId('recovery-banner').getByRole('button', { name: 'Discard changes' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('row-Cube')).toBeVisible();
  await expect(page.getByTestId('row-Dice')).toHaveCount(0);
  await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
});

test('the code editor shows the cube script and loads Blockly locally', async ({ page }) => {
  await openStudio(page);
  await selectRow(page, 'Cube');
  await page.getByTestId('tab-code').click();
  await expect(page.getByRole('region', { name: 'Blocks workspace.' }).locator('.blocklyBlockCanvas')).toBeVisible();
  await expect(page.locator('.blocklyText', { hasText: 'Boing!' })).toBeVisible();
  await page.screenshot({ path: join(SHOTS, 'code-editor.png') });
  await page.getByTestId('tab-scene').click();
});

test('projects: create, rename, duplicate, and delete with a typed confirmation', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('projects-button').click();
  await expect(page.getByTestId('projects-dialog')).toBeVisible();
  await page.getByTestId('new-project-name').fill('Second level');
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('projects-dialog')).toHaveCount(0);
  await expect(page.getByTestId('projects-button')).toHaveText('Second level');

  await page.getByTestId('projects-button').click();
  await page.getByTestId('project-row-Second level').getByRole('button', { name: 'Rename' }).click();
  const box = page.getByLabel('Rename project');
  await box.fill('Level two');
  await box.press('Enter');
  await expect(page.getByTestId('project-row-Level two')).toBeVisible();

  await page.getByTestId('project-row-Level two').getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByTestId('projects-button')).toHaveText('Level two (copy)');

  await page.getByTestId('projects-button').click();
  await page.getByTestId('project-row-Level two (copy)').getByRole('button', { name: 'Delete' }).click();
  const ok = page.getByTestId('confirm-ok');
  await expect(ok).toBeDisabled();
  await page.getByTestId('confirm-text').fill('Level two');
  await expect(ok).toBeDisabled();
  await page.getByTestId('confirm-text').fill('Level two (copy)');
  await expect(ok).toBeEnabled();
  await ok.click();
  await expect(page.getByTestId('projects-button')).toHaveText('Level two');
  // Opening a project closes the dialog, so there is nothing to close here.
  await expect(page.getByTestId('projects-dialog')).toHaveCount(0);
});

test('export then import round-trips the project as a new project', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('add-sphere').click();
  await expect.poll(async () => (await snap(page)).objects.length).toBe(4);
  await page.waitForTimeout(900);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-button').click()]);
  expect(download.suggestedFilename()).toMatch(/\.bite$/);
  const path = await download.path();
  expect(path).toBeTruthy();

  await page.getByTestId('import-file-input').setInputFiles(path!);
  await expect.poll(async () => (await snap(page)).objects.length, { timeout: 15_000 }).toBe(4);
  await expect(page.getByTestId('toast').filter({ hasText: 'Imported' })).toBeVisible();
  const s = await snap(page);
  expect(s.objects.some((o) => o.kind === 'sphere')).toBe(true);
});

test('a malformed .bite file is refused with a message and nothing is changed', async ({ page }) => {
  await openStudio(page);
  const before = (await snap(page)).projectId;
  await page.getByTestId('projects-button').click();
  const rows = await page.getByTestId('projects-dialog').locator('tbody tr').count();
  await page.getByTestId('projects-dialog').getByRole('button', { name: 'Close projects' }).click();

  await page.getByTestId('import-file-input').setInputFiles({
    name: 'broken.bite',
    mimeType: 'application/zip',
    buffer: Buffer.from('PK\u0003\u0004 this is not a real archive'),
  });
  await expect(page.getByTestId('toast').filter({ hasText: 'could not be imported' })).toBeVisible();
  expect((await snap(page)).projectId).toBe(before);
  await page.getByTestId('projects-button').click();
  await expect(page.getByTestId('projects-dialog').locator('tbody tr')).toHaveCount(rows);
});

test('sounds: a WAV file is added, listed, persisted across reload, and removable', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('tab-sounds').click();
  await page.getByTestId('sound-file-input').setInputFiles({ name: 'blip.wav', mimeType: 'audio/wav', buffer: silentWav() });
  await expect(page.getByTestId('sound-blip')).toBeVisible();
  await page.waitForTimeout(900);
  await page.reload();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.getByTestId('tab-sounds').click();
  await expect(page.getByTestId('sound-blip')).toBeVisible();

  await page.getByTestId('sound-blip').getByRole('button', { name: 'Remove' }).click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('sound-blip')).toHaveCount(0);
  await page.getByTestId('tab-console').click();
});

test('a file that is not an audio file is refused', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('tab-sounds').click();
  await page.getByTestId('sound-file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByTestId('toast').filter({ hasText: 'could not be added' })).toBeVisible();
  await page.getByTestId('tab-console').click();
});

test('captures the main screens for the record', async ({ page }) => {
  await openStudio(page);
  await selectRow(page, 'Cube');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SHOTS, 'scene-edit.png') });
  await page.getByTestId('projects-button').click();
  await page.screenshot({ path: join(SHOTS, 'projects.png') });
  await page.getByTestId('projects-dialog').getByRole('button', { name: 'Close projects' }).click();
});
