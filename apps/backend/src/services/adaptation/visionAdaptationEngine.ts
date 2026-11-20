import type {
  GameProfile,
  StructuredVisionObservation,
  VisionAnalysisResult,
} from '@ngegame/shared';

export interface LabeledVisionSample {
  id: string;
  expectedScreenState: StructuredVisionObservation['screenState'];
  expectedEnergyPercent?: number | null;
  expectedClockText?: string | null;
  vision: VisionAnalysisResult;
}

export interface VisionDatasetEvaluationResult {
  totalSamples: number;
  correctPredictions: number;
  accuracy: number;
  passedTarget90: boolean;
  details: Array<{
    id: string;
    expected: string;
    predicted: string;
    matched: boolean;
    confidence: number;
  }>;
}

export interface VisionStateChangeReport {
  changed: boolean;
  screenStateChanged: boolean;
  ocrChanged: boolean;
  motionDelta: number;
  summary: string;
}

export interface ExtractedHudIndicators {
  energyPercent: number | null;
  clockText: string | null;
  goldAmount: number | null;
  inventoryHint: string | null;
}

export function extractHudIndicators(ocrText: string): ExtractedHudIndicators {
  const text = ocrText || '';
  const energyMatch = /(?:energy|stamina|energi)\s*[:=]?\s*(\d{1,3})\s*%?/i.exec(text);
  const clockMatch = /(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i.exec(text);
  const goldMatch = /(?:gold|emas|g)\s*[:=]?\s*(\d[\d,]*)/i.exec(text);
  const invMatch = /(?:inventory|toolbar|slot|item)\s*[:=]?\s*([a-z0-9 _-]{2,30})/i.exec(text);

  return {
    energyPercent: energyMatch?.[1] ? Math.min(100, Number.parseInt(energyMatch[1], 10)) : null,
    clockText: clockMatch?.[1]?.trim() ?? null,
    goldAmount: goldMatch?.[1] ? Number.parseInt(goldMatch[1].replace(/,/g, ''), 10) : null,
    inventoryHint: invMatch?.[1]?.trim() ?? null,
  };
}

export function classifyAdaptedScreenState(
  ocrText: string,
  sceneLabel: string,
  motionScore: number,
  brightness = 0.5,
): { screenState: StructuredVisionObservation['screenState']; confidence: number } {
  const lower = `${ocrText} ${sceneLabel}`.toLowerCase();

  if (
    (lower.includes('new') && lower.includes('load')) ||
    lower.includes('title screen') ||
    lower.includes('press any key') ||
    lower.includes('co-op')
  ) {
    return { screenState: 'title_screen', confidence: 0.93 };
  }

  if (
    lower.includes('pause') ||
    lower.includes('resume') ||
    lower.includes('exit to title') ||
    lower.includes('options')
  ) {
    return { screenState: 'pause_menu', confidence: 0.92 };
  }

  if (
    lower.includes('inventory') ||
    lower.includes('crafting') ||
    lower.includes('backpack') ||
    lower.includes('skills')
  ) {
    return { screenState: 'inventory', confidence: 0.9 };
  }

  if (
    lower.includes('dialogue') ||
    lower.includes('dialog') ||
    lower.includes('npc:') ||
    sceneLabel === 'bright_ui_or_dialog'
  ) {
    return { screenState: 'dialogue', confidence: 0.86 };
  }

  if (
    sceneLabel === 'active_gameplay' ||
    motionScore >= 0.03 ||
    /\d{1,2}:\d{2}\s*(am|pm)/i.test(lower) ||
    lower.includes('energy') ||
    lower.includes('farm')
  ) {
    const conf = Math.min(0.95, 0.78 + Math.min(0.14, motionScore) + (ocrText ? 0.03 : 0));
    return { screenState: 'gameplay', confidence: Number(conf.toFixed(2)) };
  }

  if (sceneLabel === 'dark_menu_or_loading' && brightness < 0.15) {
    return { screenState: 'unknown', confidence: 0.42 };
  }

  return { screenState: 'unknown', confidence: 0.45 };
}

export class VisionAdaptationEngine {
  public observe(
    profile: GameProfile,
    vision: VisionAnalysisResult | null,
  ): StructuredVisionObservation {
    if (!vision) {
      return {
        gameId: profile.gameId,
        screenState: 'unknown',
        player: { position: null, confidence: 0 },
        visibleObjects: [],
        interactableObjects: [],
        uiElements: [],
        extractedText: '',
        confidence: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const { screenState, confidence } = classifyAdaptedScreenState(
      vision.ocrText,
      vision.sceneLabel,
      vision.motionScore,
      vision.brightness,
    );
    const indicators = extractHudIndicators(vision.ocrText);

    const uiElements = profile.uiProfile.regions.map((region) => {
      let textValue = `${Math.round((region.widthPercent / 100) * vision.width)}x${Math.round((region.heightPercent / 100) * vision.height)}px`;
      if (region.purpose === 'clock' && indicators.clockText) {
        textValue = indicators.clockText;
      } else if (region.purpose === 'hud_bar' && indicators.energyPercent !== null) {
        textValue = `Energy ${indicators.energyPercent}%`;
      } else if (region.purpose === 'inventory' && indicators.inventoryHint) {
        textValue = indicators.inventoryHint;
      } else if ((region.purpose === 'ocr' || region.purpose === 'dialog') && vision.ocrText) {
        textValue = vision.ocrText.slice(0, 80);
      }

      return {
        regionId: region.id,
        label: region.label,
        textValue,
      };
    });

    const visibleObjects = [
      ...vision.objects.map((o) => ({
        label: o.label,
        confidence: o.confidence,
        region: 'detected_bbox',
      })),
      ...profile.visionProfile.objectDetectors.map((detector) => ({
        label: detector,
        confidence: Number((confidence * 0.85).toFixed(2)),
        region: 'profile_detector',
      })),
    ];

    const interactableObjects =
      screenState === 'gameplay'
        ? [
            {
              label: profile.gameId === 'stardew-valley' ? 'farm_tile_or_crop' : 'scene_object',
              actionHint: 'INTERACT',
              confidence: Number((confidence * 0.9).toFixed(2)),
            },
          ]
        : [];

    return {
      gameId: profile.gameId,
      screenState,
      player: {
        position:
          screenState === 'gameplay'
            ? { x: Math.round(vision.width / 2), y: Math.round(vision.height / 2) }
            : null,
        confidence: screenState === 'gameplay' ? confidence : 0,
      },
      visibleObjects,
      interactableObjects,
      uiElements,
      extractedText: vision.ocrText,
      confidence,
      timestamp: vision.createdAt,
    };
  }

  public detectStateChange(
    before: VisionAnalysisResult | null,
    after: VisionAnalysisResult | null,
    profile: GameProfile,
  ): VisionStateChangeReport {
    if (!before || !after) {
      return {
        changed: false,
        screenStateChanged: false,
        ocrChanged: false,
        motionDelta: 0,
        summary: 'Frame pembanding belum lengkap.',
      };
    }

    const obsBefore = this.observe(profile, before);
    const obsAfter = this.observe(profile, after);
    const screenStateChanged = obsBefore.screenState !== obsAfter.screenState;
    const ocrChanged = before.ocrText.trim() !== after.ocrText.trim();
    const motionDelta = Number(Math.abs(after.motionScore - before.motionScore).toFixed(4));
    const changed = screenStateChanged || ocrChanged || after.motionScore >= 0.02 || motionDelta >= 0.01;

    return {
      changed,
      screenStateChanged,
      ocrChanged,
      motionDelta,
      summary: changed
        ? `Perubahan terdeteksi (state: ${obsBefore.screenState}->${obsAfter.screenState}, ocrChanged=${ocrChanged}, motion=${after.motionScore}).`
        : 'Tidak ada perubahan visual signifikan setelah aksi.',
    };
  }

  public evaluateLabeledDataset(
    profile: GameProfile,
    samples: LabeledVisionSample[],
  ): VisionDatasetEvaluationResult {
    const details = samples.map((sample) => {
      const obs = this.observe(profile, sample.vision);
      const matched = obs.screenState === sample.expectedScreenState;
      return {
        id: sample.id,
        expected: sample.expectedScreenState,
        predicted: obs.screenState,
        matched,
        confidence: obs.confidence,
      };
    });

    const correctPredictions = details.filter((d) => d.matched).length;
    const accuracy = samples.length > 0 ? Number((correctPredictions / samples.length).toFixed(4)) : 0;

    return {
      totalSamples: samples.length,
      correctPredictions,
      accuracy,
      passedTarget90: accuracy >= 0.9,
      details,
    };
  }
}
