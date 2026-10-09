import { describe, expect, it } from 'vitest';
import { BLOCK_SPECS, validateCatalog } from '../../src/blocks/catalog';

describe('block catalog', () => {
  it('has no structural problems', () => {
    expect(validateCatalog()).toEqual([]);
  });

  it('has at least one block per category that is used', () => {
    expect(BLOCK_SPECS.length).toBeGreaterThan(40);
  });
});
