import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { VisionAnalysisResult } from '@ngegame/shared';
import { STARDEW_VALLEY_PROFILE } from '../src/services/adaptation/builtinProfiles.js';
import {
  extractHudIndicators,
  VisionAdaptationEngine,
  type LabeledVisionSample,
} from '../src/services/adaptation/visionAdaptationEngine.js';

function makeVisionFrame(overrides: Partial<VisionAnalysisResult>): VisionAnalysisResult {
  return {
    windowTitle: 'Stardew Valley',
    platform: 'darwin',
    width: 1280,
    height: 720,
    imageBase64: '',
    sceneLabel: 'static_hud_or_idle',
    motionScore: 0.01,
    brightness: 0.5,
    processingMs: 18,
    samplingIntervalMs: 900,
    ocrText: '',
    hud: [],
    objects: [],
    events: [],
    capabilities: {
      platform: 'darwin',
      captureBackend: 'macos-screencapture',
      opencvAvailable: false,
      ocrAvailable: false,
      pillowAvailable: false,
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Phase 12F.5 — Vision Adaptation Engine', () => {
  it('extracts energy, clock, gold, and inventory indicators from OCR text', () => {
    const hud = extractHudIndicators('Fri 10:20 AM • Energy 84% • Gold 1,250 • Toolbar: Watering Can');
    assert.equal(hud.energyPercent, 84);
    assert.equal(hud.clockText, '10:20 AM');
    assert.equal(hud.goldAmount, 1250);
    assert.ok(hud.inventoryHint?.includes('Watering Can'));
  });

  it('achieves >= 90% accuracy on labeled Level 1 screen recognition dataset', () => {
    const engine = new VisionAdaptationEngine();
    const dataset: LabeledVisionSample[] = [
      { id: 's1', expectedScreenState: 'title_screen', vision: makeVisionFrame({ ocrText: 'New Load Co-op Exit' }) },
      { id: 's2', expectedScreenState: 'title_screen', vision: makeVisionFrame({ ocrText: 'Stardew Valley Title Screen New Game Load' }) },
      { id: 's3', expectedScreenState: 'gameplay', vision: makeVisionFrame({ sceneLabel: 'active_gameplay', motionScore: 0.12, ocrText: '6:30 AM Energy 100%' }) },
      { id: 's4', expectedScreenState: 'gameplay', vision: makeVisionFrame({ sceneLabel: 'static_hud_or_idle', motionScore: 0.05, ocrText: '11:40 AM Farm' }) },
      { id: 's5', expectedScreenState: 'pause_menu', vision: makeVisionFrame({ ocrText: 'Options Exit to Title Resume' }) },
      { id: 's6', expectedScreenState: 'pause_menu', vision: makeVisionFrame({ ocrText: 'Game Pause Menu' }) },
      { id: 's7', expectedScreenState: 'inventory', vision: makeVisionFrame({ ocrText: 'Inventory Crafting Skills Social' }) },
      { id: 's8', expectedScreenState: 'inventory', vision: makeVisionFrame({ ocrText: 'Backpack Slot 1-12' }) },
      { id: 's9', expectedScreenState: 'dialogue', vision: makeVisionFrame({ sceneLabel: 'bright_ui_or_dialog', ocrText: 'Robin: Welcome to Pelican Town!' }) },
      { id: 's10', expectedScreenState: 'gameplay', vision: makeVisionFrame({ sceneLabel: 'active_gameplay', motionScore: 0.09, ocrText: '2:10 PM Energy 60%' }) },
    ];

    const evaluation = engine.evaluateLabeledDataset(STARDEW_VALLEY_PROFILE, dataset);
    assert.equal(evaluation.totalSamples, 10);
    assert.ok(evaluation.accuracy >= 0.9, `Expected >= 0.90, got ${evaluation.accuracy}`);
    assert.equal(evaluation.passedTarget90, true);
  });

  it('detects state and visual changes between before and after frames', () => {
    const engine = new VisionAdaptationEngine();
    const before = makeVisionFrame({ sceneLabel: 'active_gameplay', motionScore: 0.02, ocrText: '10:00 AM Energy 90%' });
    const after = makeVisionFrame({ sceneLabel: 'inventory', motionScore: 0.08, ocrText: 'Inventory Crafting' });

    const diff = engine.detectStateChange(before, after, STARDEW_VALLEY_PROFILE);
    assert.equal(diff.changed, true);
    assert.equal(diff.screenStateChanged, true);
    assert.equal(diff.ocrChanged, true);
  });
});
