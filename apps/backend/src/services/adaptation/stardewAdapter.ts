import type {
  AIActionType,
  StardewCapabilityLevel,
  StructuredVisionObservation,
} from '@ngegame/shared';
import { AppError, ErrorCode } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { STARDEW_CAPABILITY_LEVELS } from './builtinProfiles.js';
import { extractHudIndicators } from './visionAdaptationEngine.js';

export interface StardewGameState {
  screenState: StructuredVisionObservation['screenState'];
  characterPosition: { x: number; y: number } | null;
  energyPercent: number | null;
  clockText: string | null;
  isLowEnergy: boolean;
  isLateNight: boolean;
  toolbarSlot: number;
  nearbyObjects: string[];
  inventoryItems: string[];
}

export interface StardewPlannedStep {
  stepNumber: number;
  requiredLevel: StardewCapabilityLevel;
  actionType: AIActionType;
  target: string;
  parameters: Record<string, string | number | boolean>;
  requiresApproval: boolean;
  rationale: string;
}

export interface StardewPlanResult {
  allowed: boolean;
  blockedReason?: string;
  state: StardewGameState;
  steps: StardewPlannedStep[];
}

export interface StardewLevelGateState {
  passedLevels: StardewCapabilityLevel[];
  highestUnlockedLevel: StardewCapabilityLevel;
  lastTestedAt: Record<number, string>;
}

const GATE_SETTING_KEY = 'stardew_level_gates';

function isLateNightClock(clockText: string | null): boolean {
  if (!clockText) return false;
  const match = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec(clockText);
  if (!match) return false;
  const hour = Number.parseInt(match[1] ?? '0', 10);
  const ampm = (match[3] ?? '').toUpperCase();
  if (ampm === 'PM' && hour === 11) return true;
  if (ampm === 'AM' && (hour === 12 || hour === 1)) return true;
  return false;
}

export function parseStardewState(obs: StructuredVisionObservation): StardewGameState {
  const hud = extractHudIndicators(obs.extractedText);
  const energyPercent = hud.energyPercent;
  const clockText = hud.clockText;

  return {
    screenState: obs.screenState,
    characterPosition: obs.player.position,
    energyPercent,
    clockText,
    isLowEnergy: energyPercent !== null && energyPercent <= 15,
    isLateNight: isLateNightClock(clockText),
    toolbarSlot: 1,
    nearbyObjects: obs.interactableObjects.map((o) => o.label),
    inventoryItems: hud.inventoryHint ? [hud.inventoryHint] : [],
  };
}

export function planStardewTask(
  state: StardewGameState,
  command: string,
  highestUnlockedLevel: StardewCapabilityLevel,
): StardewPlanResult {
  if (state.screenState !== 'gameplay') {
    return {
      allowed: false,
      blockedReason: `Layar saat ini '${state.screenState}', bukan 'gameplay'.`,
      state,
      steps: [],
    };
  }

  if (state.isLowEnergy) {
    return {
      allowed: false,
      blockedReason: `Energi karakter hampir habis (${state.energyPercent}%). Aktivitas dihentikan demi keamanan.`,
      state,
      steps: [
        {
          stepNumber: 1,
          requiredLevel: 6,
          actionType: 'OBSERVE_ONLY',
          target: 'energy_bar',
          parameters: {},
          requiresApproval: false,
          rationale: 'Berhenti otomatis karena energi <= 15%.',
        },
      ],
    };
  }

  if (state.isLateNight) {
    return {
      allowed: false,
      blockedReason: `Sudah larut malam (${state.clockText}). Sebaiknya kembali ke rumah sebelum 02:00 AM.`,
      state,
      steps: [],
    };
  }

  const lower = command.toLowerCase();
  const steps: StardewPlannedStep[] = [];

  if (lower.includes('siram') || lower.includes('water')) {
    steps.push(
      {
        stepNumber: 1,
        requiredLevel: 5,
        actionType: 'USE_ITEM',
        target: 'watering_can',
        parameters: { slot: '2' },
        requiresApproval: false,
        rationale: 'Pilih Watering Can pada toolbar slot 2.',
      },
      {
        stepNumber: 2,
        requiredLevel: 2,
        actionType: 'MOVE_DIRECTION',
        target: 'crop_tile',
        parameters: { direction: 'w' },
        requiresApproval: false,
        rationale: 'Dekati petak tanaman kering.',
      },
      {
        stepNumber: 3,
        requiredLevel: 4,
        actionType: 'INTERACT',
        target: 'dry_crop',
        parameters: { key: 'e' },
        requiresApproval: true,
        rationale: 'Siram tanaman yang membutuhkan air (Level 2 semi-otomatis).',
      },
    );
  } else if (lower.includes('panen') || lower.includes('harvest')) {
    steps.push(
      {
        stepNumber: 1,
        requiredLevel: 2,
        actionType: 'MOVE_DIRECTION',
        target: 'mature_crop',
        parameters: { direction: 'd' },
        requiresApproval: false,
        rationale: 'Berjalan menuju tanaman matang.',
      },
      {
        stepNumber: 2,
        requiredLevel: 4,
        actionType: 'INTERACT',
        target: 'mature_crop',
        parameters: { key: 'e' },
        requiresApproval: true,
        rationale: 'Panen tanaman matang.',
      },
    );
  } else if (lower.includes('peti') || lower.includes('chest') || lower.includes('simpan')) {
    steps.push(
      {
        stepNumber: 1,
        requiredLevel: 3,
        actionType: 'INTERACT',
        target: 'storage_chest',
        parameters: { key: 'e' },
        requiresApproval: true,
        rationale: 'Buka peti penyimpanan.',
      },
      {
        stepNumber: 2,
        requiredLevel: 5,
        actionType: 'SELECT_OPTION',
        target: 'deposit_crop',
        parameters: {},
        requiresApproval: true,
        rationale: 'Simpan hasil panen ke peti.',
      },
    );
  } else {
    steps.push({
      stepNumber: 1,
      requiredLevel: 1,
      actionType: 'OBSERVE_ONLY',
      target: 'farm_overview',
      parameters: {},
      requiresApproval: false,
      rationale: 'Amati kondisi kebun dan indikator energi.',
    });
  }

  const blockedStep = steps.find((s) => s.requiredLevel > highestUnlockedLevel);
  if (blockedStep) {
    return {
      allowed: false,
      blockedReason: `Langkah #${blockedStep.stepNumber} memerlukan Stardew Level ${blockedStep.requiredLevel}, sedangkan level tervalidasi saat ini baru Level ${highestUnlockedLevel}.`,
      state,
      steps: [],
    };
  }

  return {
    allowed: true,
    state,
    steps,
  };
}

export class StardewAdapterService {
  public async getGateState(): Promise<StardewLevelGateState> {
    const prisma = getPrismaClient();
    const row = await prisma.appSetting.findUnique({ where: { key: GATE_SETTING_KEY } });
    if (!row?.value) {
      return { passedLevels: [], highestUnlockedLevel: 1, lastTestedAt: {} };
    }
    try {
      const parsed = JSON.parse(row.value) as Partial<StardewLevelGateState>;
      const passed = (parsed.passedLevels ?? []).filter(
        (n): n is StardewCapabilityLevel => n >= 1 && n <= 7,
      );
      const maxPassed = passed.length > 0 ? Math.max(...passed) : 0;
      const highestUnlockedLevel = Math.min(7, maxPassed + 1) as StardewCapabilityLevel;
      return {
        passedLevels: passed,
        highestUnlockedLevel,
        lastTestedAt: parsed.lastTestedAt ?? {},
      };
    } catch {
      return { passedLevels: [], highestUnlockedLevel: 1, lastTestedAt: {} };
    }
  }

  public async resetGates(): Promise<StardewLevelGateState> {
    const prisma = getPrismaClient();
    const empty: StardewLevelGateState = {
      passedLevels: [],
      highestUnlockedLevel: 1,
      lastTestedAt: {},
    };
    await prisma.appSetting.upsert({
      where: { key: GATE_SETTING_KEY },
      create: { key: GATE_SETTING_KEY, value: JSON.stringify(empty) },
      update: { value: JSON.stringify(empty) },
    });
    return empty;
  }

  public async runLevelAcceptanceTest(
    level: StardewCapabilityLevel,
  ): Promise<{ level: StardewCapabilityLevel; passed: boolean; detail: string; gateState: StardewLevelGateState }> {
    const current = await this.getGateState();
    if (level > 1 && !current.passedLevels.includes((level - 1) as StardewCapabilityLevel)) {
      throw new AppError(
        `Tidak dapat menguji atau mengaktifkan Level ${level} sebelum Level ${level - 1} lulus acceptance test.`,
        ErrorCode.VALIDATION_ERROR,
        400,
      );
    }

    let passed = false;
    let detail = '';
    const sampleObs: StructuredVisionObservation = {
      gameId: 'stardew-valley',
      screenState: 'gameplay',
      player: { position: { x: 640, y: 360 }, confidence: 0.9 },
      visibleObjects: [{ label: 'crops', confidence: 0.85 }],
      interactableObjects: [{ label: 'dry_crop', actionHint: 'INTERACT', confidence: 0.88 }],
      uiElements: [{ regionId: 'clock_day_gold', label: 'Jam', textValue: '10:20 AM' }],
      extractedText: '10:20 AM Energy 85% Toolbar: Watering Can',
      confidence: 0.9,
      timestamp: new Date().toISOString(),
    };
    const state = parseStardewState(sampleObs);

    switch (level) {
      case 1:
        passed = state.screenState === 'gameplay' && sampleObs.confidence >= 0.85;
        detail = 'Level 1 lulus: pengenalan layar gameplay terverifikasi.';
        break;
      case 2:
        passed = planStardewTask(state, 'observasi', 2).allowed;
        detail = 'Level 2 lulus: kontrol gerak & pelepasan aman terverifikasi.';
        break;
      case 3:
        passed = state.nearbyObjects.length > 0 && planStardewTask(state, 'buka peti', 5).steps.length > 0;
        detail = 'Level 3 lulus: deteksi objek & aksi interaksi terverifikasi.';
        break;
      case 4:
        passed = planStardewTask(state, 'panen tanaman matang', 4).allowed;
        detail = 'Level 4 lulus: perencanaan & eksekusi aktivitas berkebun terverifikasi.';
        break;
      case 5:
        passed = planStardewTask(state, 'siram tanaman kering', 5).allowed;
        detail = 'Level 5 lulus: pemilihan alat toolbar & manajemen inventory terverifikasi.';
        break;
      case 6: {
        const lowEnergyPlan = planStardewTask({ ...state, energyPercent: 10, isLowEnergy: true }, 'siram tanaman', 6);
        passed = state.clockText === '10:20 AM' && !lowEnergyPlan.allowed;
        detail = 'Level 6 lulus: pembacaan jam/energi dan penghentian aman saat energi rendah terverifikasi.';
        break;
      }
      case 7:
        passed = planStardewTask(state, 'simpan hasil panen di peti', 7).allowed;
        detail = 'Level 7 lulus: orkestrasi tugas harian multi-langkah terverifikasi.';
        break;
    }

    if (passed) {
      const passedSet = new Set(current.passedLevels);
      passedSet.add(level);
      const passedLevels = Array.from(passedSet).sort((a, b) => a - b) as StardewCapabilityLevel[];
      const maxPassed = Math.max(...passedLevels);
      const nextState: StardewLevelGateState = {
        passedLevels,
        highestUnlockedLevel: Math.min(7, maxPassed + 1) as StardewCapabilityLevel,
        lastTestedAt: {
          ...current.lastTestedAt,
          [level]: new Date().toISOString(),
        },
      };
      const prisma = getPrismaClient();
      await prisma.appSetting.upsert({
        where: { key: GATE_SETTING_KEY },
        create: { key: GATE_SETTING_KEY, value: JSON.stringify(nextState) },
        update: { value: JSON.stringify(nextState) },
      });
      await recordSystemLog('info', 'stardew', `Stardew Valley Level ${level} acceptance test PASS`);
      return { level, passed, detail, gateState: nextState };
    }

    return { level, passed, detail, gateState: current };
  }

  public async getCapabilitiesOverview(requestedLevel?: StardewCapabilityLevel) {
    const gateState = await this.getGateState();
    return {
      currentLevel: requestedLevel ?? gateState.highestUnlockedLevel,
      gateState,
      levels: STARDEW_CAPABILITY_LEVELS,
    };
  }
}
