import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { GameAdapterDefinition } from '@ngegame/shared';
import { AdapterRegistry } from '../src/services/adapters/adapterRegistry.js';

describe('Game Adapter System', () => {
  it('registers all 7 initial genres, Universal fallback, and Stardew Valley PoC', () => {
    const registry = new AdapterRegistry();
    const list = registry.list();
    const genres = new Set(list.map((a) => a.metadata.genre));

    for (const requiredGenre of [
      'FPS',
      'RPG',
      'Survival',
      'Simulation',
      'Strategy',
      'Racing',
      'Platformer',
      'Universal',
    ] as const) {
      assert.ok(genres.has(requiredGenre), `Missing genre ${requiredGenre}`);
    }

    const stardew = registry.getById('stardew-valley-poc');
    assert.equal(stardew.compatibilityStatus, 'verified');
    assert.ok(stardew.gameIdentification.steamAppIds.includes(413150));
  });

  it('resolves by Steam AppID, window title, genre, and falls back to Universal', () => {
    const registry = new AdapterRegistry();

    const byAppId = registry.resolve({ steamAppId: 413150 });
    assert.equal(byAppId.metadata.id, 'stardew-valley-poc');

    const byTitle = registry.resolve({ windowTitle: 'Slay the Spire - Run 1' });
    assert.equal(byTitle.metadata.id, 'genre-strategy');

    const byGenre = registry.resolve({ genre: 'Racing' });
    assert.equal(byGenre.metadata.id, 'genre-racing');

    const fallback = registry.resolve({ windowTitle: 'Unknown Indie Game' });
    assert.equal(fallback.metadata.id, 'universal-adapter');
  });

  it('allows registering a new custom adapter dynamically without modifying AI Brain Core', () => {
    const registry = new AdapterRegistry();
    const custom: GameAdapterDefinition = {
      metadata: {
        id: 'custom-factorio',
        name: 'Factorio Custom',
        version: '1.0.0',
        author: 'Community',
        genre: 'Strategy',
        description: 'Custom factory adapter',
      },
      gameIdentification: { steamAppIds: [427520], windowTitlePatterns: ['Factorio'] },
      controlMapping: [
        { actionType: 'MOVE_DIRECTION', key: 'w/a/s/d', defaultDurationMs: 250, notes: 'Walk' },
      ],
      screenLayout: [],
      objectiveDefinition: [
        { id: 'fac-1', title: 'Automate Iron', priority: 'high', description: 'Build smelters' },
      ],
      actionLibrary: ['OBSERVE_ONLY', 'MOVE_DIRECTION', 'INTERACT'],
      strategyRules: ['Prioritaskan suplai batu bara untuk boiler.'],
      visionConfig: { targetIntervalMs: 800, motionThreshold: 0.05, enableOcr: true },
      compatibilityStatus: 'verified',
    };

    registry.register(custom);
    const resolved = registry.resolve({ steamAppId: 427520 });
    assert.equal(resolved.metadata.id, 'custom-factorio');
  });
});
