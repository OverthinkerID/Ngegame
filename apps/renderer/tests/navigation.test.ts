import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { NAV_ITEMS } from '../src/data/mockData.ts';
import type { PageId } from '../src/types/dashboard.ts';

describe('@ngegame/renderer navigation', () => {
  it('defines all 11 required dashboard pages without duplicates', () => {
    const expectedPages: PageId[] = [
      'dashboard',
      'library',
      'ai-control',
      'vision',
      'adapters',
      'adaptation-studio',
      'streaming',
      'stream-intelligence',
      'voice',
      'analytics',
      'history',
      'system-monitor',
      'settings',
    ];

    assert.equal(NAV_ITEMS.length, 13);
    const actualIds = NAV_ITEMS.map((item) => item.id);
    assert.deepEqual(actualIds, expectedPages);
    assert.equal(new Set(actualIds).size, 13);
  });

  it('provides non-empty Indonesian labels and descriptions for every page', () => {
    for (const item of NAV_ITEMS) {
      assert.ok(item.label.trim().length > 0);
      assert.ok(item.description.trim().length > 0);
    }
  });
});
