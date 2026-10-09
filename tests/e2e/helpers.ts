import { expect, type Page } from '@playwright/test';

export interface SnapObject {
  id: string;
  name: string;
  kind: string;
  visible: boolean;
  position: number[];
  rotation: number[];
  scale: number[];
  says: string | null;
}

export interface Snap {
  mode: 'edit' | 'running' | 'stopped';
  tab: 'scene' | 'code';
  projectId: string | null;
  projectName: string | null;
  saveState: string;
  dirty: boolean;
  selection: string | null;
  objects: SnapObject[];
  messages: { level: string; message: string; targetId: string | null }[];
  viewObjectCount: number;
  backend: string | null;
}

export async function snap(page: Page): Promise<Snap> {
  return page.evaluate(() => (window as unknown as { __BITE__: { snapshot(): unknown } }).__BITE__.snapshot()) as Promise<Snap>;
}

export function objectNamed(s: Snap, name: string): SnapObject {
  const o = s.objects.find((x) => x.name === name);
  if (!o) throw new Error(`no object named ${name}`);
  return o;
}

/** Opens the studio and waits until the starter project is loaded and the 3D view is mounted. */
export async function openStudio(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.waitForFunction(() => Boolean((window as unknown as { __BITE__?: unknown }).__BITE__));
  await expect.poll(async () => (await snap(page)).projectName).not.toBeNull();
  await expect.poll(async () => (await snap(page)).viewObjectCount).toBeGreaterThan(0);
}

export async function selectRow(page: Page, name: string): Promise<void> {
  await page.getByTestId(`row-${name}`).click();
}

/** Builds a minimal valid PCM WAV file (silence) for sound-import tests. */
export function silentWav(samples = 4410, sampleRate = 44100): Buffer {
  const dataBytes = samples * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}
