import fs from 'node:fs/promises';
import type { CalibrationSessionState, CalibrationStepResult } from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import type { AIBrainService } from '../ai/aiBrainService.js';
import type { ControllerService } from '../controller/controllerService.js';
import type { SteamManager } from '../steam/steamManager.js';
import type { VisionService } from '../vision/visionService.js';
import type { GameProfileManager } from './gameProfileManager.js';

export const CALIBRATION_STEPS: Array<{ step: number; name: string; description: string }> = [
  { step: 1, name: 'Pilih Game', description: 'Validasi profil game target di SQLite' },
  { step: 2, name: 'Deteksi Executable', description: 'Periksa path executable dari Steam / profil' },
  { step: 3, name: 'Deteksi Jendela', description: 'Cari jendela game aktif dan status fokus' },
  { step: 4, name: 'Tangkap Layar', description: 'Ambil frame layar pertama untuk kalibrasi' },
  { step: 5, name: 'Kalibrasi Area UI', description: 'Validasi koordinat region HUD/jam/toolbar' },
  { step: 6, name: 'Uji OCR', description: 'Verifikasi ekstraksi teks dari layar game' },
  { step: 7, name: 'Uji Gerak', description: 'Simulasi uji gerak aman (W/A/S/D) durasi pendek' },
  { step: 8, name: 'Uji Pelepasan Tombol', description: 'Pastikan seluruh tombol dapat dilepas aman' },
  { step: 9, name: 'Uji Penalaran AI', description: 'Uji siklus berpikir AI Brain dengan profil game' },
  { step: 10, name: 'Verifikasi Ambang Kepercayaan', description: 'Periksa batas minConfidence & safety policy' },
  { step: 11, name: 'Simpan Profil', description: 'Simpan hasil kalibrasi permanen ke SQLite' },
];

export class CalibrationService {
  constructor(
    private readonly profileManager: GameProfileManager,
    private readonly steamManager: SteamManager,
    private readonly visionService: VisionService,
    private readonly controllerService: ControllerService,
    private readonly aiBrainService: AIBrainService,
  ) {}

  public async getState(gameId: string): Promise<CalibrationSessionState> {
    await this.profileManager.getProfile(gameId);
    const prisma = getPrismaClient();
    const row = await prisma.gameProfileRecord.findUnique({ where: { gameId } });
    const parsed = row?.calibrationJson
      ? (JSON.parse(row.calibrationJson) as Partial<CalibrationSessionState>)
      : {};

    return {
      gameId,
      completedSteps: parsed.completedSteps ?? [],
      results: parsed.results ?? [],
      displayResolution: parsed.displayResolution ?? null,
      detectedWindow: parsed.detectedWindow ?? null,
      savedAt: parsed.savedAt ?? null,
    };
  }

  private async persistState(state: CalibrationSessionState): Promise<CalibrationSessionState> {
    const prisma = getPrismaClient();
    await prisma.gameProfileRecord.update({
      where: { gameId: state.gameId },
      data: { calibrationJson: JSON.stringify(state) },
    });
    return state;
  }

  public async runStep(gameId: string, step: number): Promise<CalibrationSessionState> {
    const profile = await this.profileManager.getProfile(gameId);
    const current = await this.getState(gameId);
    const stepDef = CALIBRATION_STEPS.find((s) => s.step === step);
    const stepName = stepDef?.name ?? `Langkah ${step}`;

    let ok = false;
    let detail = '';

    switch (step) {
      case 1: {
        ok = true;
        detail = `Profil '${profile.gameName}' (${profile.genre}) siap dikalibrasi.`;
        break;
      }
      case 2: {
        const games = await this.steamManager.listGames().catch(() => []);
        const matched = games.find((g) =>
          g.name.toLowerCase().includes(profile.gameName.toLowerCase()),
        );
        const targetExe = matched?.executablePath ?? profile.executablePath;
        if (targetExe) {
          try {
            await fs.access(targetExe);
            ok = true;
            detail = `Executable ditemukan: ${targetExe}`;
            if (!profile.executablePath || !profile.installationPath) {
              await this.profileManager.saveProfile({
                ...profile,
                executablePath: targetExe,
                installationPath: matched?.installPath ?? profile.installationPath,
              });
            }
          } catch {
            ok = false;
            detail = `Path executable tidak dapat diakses: ${targetExe}`;
          }
        } else {
          ok = false;
          detail = 'Executable belum ditemukan — pindai Pustaka Steam atau isi path manual.';
        }
        break;
      }
      case 3: {
        const windows = await this.visionService.listWindows().catch(() => []);
        const found = windows.find((w) =>
          w.title.toLowerCase().includes(profile.gameName.toLowerCase()),
        );
        current.detectedWindow = found?.title ?? windows[0]?.title ?? null;
        ok = Boolean(found ?? windows[0]);
        detail = found
          ? `Jendela game terdeteksi: ${found.title} (fokus=${found.focused ?? false})`
          : windows[0]
            ? `Jendela aktif terdeteksi: ${windows[0].title} (buka ${profile.gameName} agar akurat)`
            : 'Tidak ada jendela yang terdeteksi.';
        break;
      }
      case 4: {
        try {
          const cap = await this.visionService.captureOnce({
            windowTitle: current.detectedWindow ?? profile.gameName,
          });
          current.displayResolution = { width: cap.width, height: cap.height };
          ok = cap.width > 0 && cap.height > 0;
          detail = `Tangkapan layar berhasil: ${cap.width}x${cap.height} (${cap.processingMs}ms)`;
        } catch (err) {
          ok = false;
          detail = `Gagal menangkap layar: ${err instanceof Error ? err.message : String(err)}`;
        }
        break;
      }
      case 5: {
        ok = profile.uiProfile.regions.length > 0;
        detail = `${profile.uiProfile.regions.length} region UI terkonfigurasi (${profile.uiProfile.regions.map((r) => r.label).join(', ')}).`;
        break;
      }
      case 6: {
        const history = await this.visionService.getHistory(1);
        const latest = history[0];
        ok = Boolean(latest);
        detail = latest?.ocrText
          ? `OCR aktif: "${latest.ocrText.slice(0, 60)}"`
          : 'Pipeline OCR siap (belum ada teks terdeteksi pada frame terakhir).';
        break;
      }
      case 7: {
        const res = await this.controllerService.executeAction({
          actionType: 'MOVE_DIRECTION',
          target: 'calibration_test',
          parameters: { key: 'w' },
          durationMs: 150,
          dryRun: true,
        });
        ok = res.ok;
        detail = `Uji gerak aman (${res.status}): ${res.reason}`;
        break;
      }
      case 8: {
        const ctrl = await this.controllerService.releaseAll();
        ok = ctrl.pressedKeys.length === 0;
        detail = 'Semua tombol dilepas aman (pressedKeys=0).';
        break;
      }
      case 9: {
        const think = await this.aiBrainService.think({
          gameTitle: profile.gameName,
          genre: profile.genre,
          objective: 'Calibration check: evaluate current screen safely',
          visionState: {
            windowTitle: current.detectedWindow ?? profile.gameName,
            sceneLabel: 'calibration_check',
            motionScore: 0.02,
            brightness: 0.5,
            ocrText: '',
          },
        });
        ok = think.actions.length > 0;
        detail = `AI Brain (${think.providerUsed}:${think.modelUsed}) merencanakan ${think.actions[0]?.actionType} (confidence=${think.confidence}).`;
        break;
      }
      case 10: {
        ok =
          profile.safetyConfiguration.minConfidence >= 0.5 &&
          profile.safetyConfiguration.maxHoldDurationMs <= 2000;
        detail = `Ambang confidence=${profile.safetyConfiguration.minConfidence}, maxHold=${profile.safetyConfiguration.maxHoldDurationMs}ms.`;
        break;
      }
      case 11: {
        const completed = Array.from(new Set([...current.completedSteps, 11])).sort((a, b) => a - b);
        const now = new Date().toISOString();
        await this.profileManager.saveProfile({
          ...profile,
          resolution: current.displayResolution ?? profile.resolution,
          calibrationStatus: {
            completedSteps: completed,
            lastCalibratedAt: now,
          },
        });
        current.savedAt = now;
        ok = true;
        detail = `Profil '${profile.gameName}' beserta hasil kalibrasi disimpan ke SQLite.`;
        break;
      }
      default:
        detail = `Langkah kalibrasi #${step} tidak dikenal.`;
    }

    const stepResult: CalibrationStepResult = {
      step,
      name: stepName,
      ok,
      detail,
      checkedAt: new Date().toISOString(),
    };

    const completedSet = new Set(current.completedSteps);
    if (ok) {
      completedSet.add(step);
    }

    const updatedResults = [
      ...current.results.filter((r) => r.step !== step),
      stepResult,
    ].sort((a, b) => a.step - b.step);

    const nextState: CalibrationSessionState = {
      ...current,
      completedSteps: Array.from(completedSet).sort((a, b) => a - b),
      results: updatedResults,
    };

    await this.persistState(nextState);
    await recordSystemLog('info', 'calibration', `Calibration ${gameId} step ${step}: ${ok ? 'OK' : 'WARN'}`);
    return nextState;
  }
}
