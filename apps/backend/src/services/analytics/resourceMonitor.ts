import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import type { ResourceMetricsSnapshot, ThrottlingConfig } from '@ngegame/shared';

const execFileAsync = promisify(execFile);

interface CpuTotals {
  idle: number;
  total: number;
}

function readCpuTotals(): CpuTotals {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.idle +
      cpu.times.irq;
  }
  return { idle, total };
}

export class SystemResourceMonitor {
  private prevCpu: CpuTotals = readCpuTotals();
  private cachedGpuName: string | null = null;
  private config: ThrottlingConfig = {
    autoThrottleEnabled: true,
    cpuThresholdPercent: 85,
    ramThresholdPercent: 85,
  };

  public getThrottlingConfig(): ThrottlingConfig {
    return { ...this.config };
  }

  public updateThrottlingConfig(partial: Partial<ThrottlingConfig>): ThrottlingConfig {
    if (typeof partial.autoThrottleEnabled === 'boolean') {
      this.config.autoThrottleEnabled = partial.autoThrottleEnabled;
    }
    if (typeof partial.cpuThresholdPercent === 'number') {
      this.config.cpuThresholdPercent = Math.min(Math.max(partial.cpuThresholdPercent, 40), 99);
    }
    if (typeof partial.ramThresholdPercent === 'number') {
      this.config.ramThresholdPercent = Math.min(Math.max(partial.ramThresholdPercent, 40), 99);
    }
    return this.getThrottlingConfig();
  }

  private sampleCpuPercent(): number {
    const current = readCpuTotals();
    const idleDiff = current.idle - this.prevCpu.idle;
    const totalDiff = current.total - this.prevCpu.total;
    this.prevCpu = current;
    if (totalDiff <= 0) return 0;
    const used = ((totalDiff - idleDiff) / totalDiff) * 100;
    return Number(Math.min(Math.max(used, 0), 100).toFixed(1));
  }

  private async detectGpuName(): Promise<string> {
    if (this.cachedGpuName) return this.cachedGpuName;
    try {
      if (process.platform === 'darwin') {
        const { stdout } = await execFileAsync(
          'system_profiler',
          ['SPDisplaysDataType'],
          { timeout: 2500 },
        );
        const match = /Chipset Model:\s*(.+)/i.exec(stdout);
        this.cachedGpuName = match?.[1]?.trim() || 'Apple Silicon / macOS GPU';
        return this.cachedGpuName;
      }
      if (process.platform === 'win32') {
        const { stdout } = await execFileAsync(
          'nvidia-smi',
          ['--query-gpu=name', '--format=csv,noheader'],
          { timeout: 2000 },
        );
        const name = stdout.trim().split(/\r?\n/)[0];
        if (name) {
          this.cachedGpuName = name;
          return name;
        }
      }
    } catch {
      // ignore if system_profiler or nvidia-smi unavailable
    }
    this.cachedGpuName = process.platform === 'darwin' ? 'macOS Unified GPU' : 'System GPU';
    return this.cachedGpuName;
  }

  public evaluateThrottling(cpuPercent: number, ramPercent: number): {
    active: boolean;
    reason: string | null;
    recommendedVisionIntervalMs: number;
  } {
    if (!this.config.autoThrottleEnabled) {
      return {
        active: false,
        reason: null,
        recommendedVisionIntervalMs: 1000,
      };
    }

    const reasons: string[] = [];
    if (cpuPercent >= this.config.cpuThresholdPercent) {
      reasons.push(`CPU ${cpuPercent}% >= ${this.config.cpuThresholdPercent}%`);
    }
    if (ramPercent >= this.config.ramThresholdPercent) {
      reasons.push(`RAM ${ramPercent}% >= ${this.config.ramThresholdPercent}%`);
    }

    if (reasons.length > 0) {
      return {
        active: true,
        reason: `Auto-throttling aktif (${reasons.join(', ')})`,
        recommendedVisionIntervalMs: 2500,
      };
    }

    return {
      active: false,
      reason: null,
      recommendedVisionIntervalMs: 1000,
    };
  }

  public async sample(): Promise<ResourceMetricsSnapshot> {
    const cpuPercent = this.sampleCpuPercent();
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;

    const ramTotalGb = Number((totalMemBytes / 1024 ** 3).toFixed(2));
    const ramUsedGb = Number((usedMemBytes / 1024 ** 3).toFixed(2));
    const ramPercent = Number(((usedMemBytes / totalMemBytes) * 100).toFixed(1));

    const ifaces = os.networkInterfaces();
    let activeInterfaces = 0;
    for (const entries of Object.values(ifaces)) {
      if (entries?.some((e) => !e.internal)) {
        activeInterfaces += 1;
      }
    }

    const gpuName = await this.detectGpuName();
    const throttling = this.evaluateThrottling(cpuPercent, ramPercent);

    return {
      cpuPercent,
      ramUsedGb,
      ramTotalGb,
      ramPercent,
      gpuName,
      gpuLoadPercent: null,
      vramUsedMb: null,
      vramTotalMb: null,
      networkOnline: activeInterfaces > 0,
      activeInterfaces,
      throttlingActive: throttling.active,
      throttlingReason: throttling.reason,
      recommendedVisionIntervalMs: throttling.recommendedVisionIntervalMs,
      capturedAt: new Date().toISOString(),
    };
  }
}
