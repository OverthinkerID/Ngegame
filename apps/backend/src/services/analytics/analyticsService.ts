import type {
  AnalyticsSummaryReport,
  ResourceMetricsSnapshot,
  ThrottlingConfig,
} from '@ngegame/shared';
import { getPrismaClient } from '../../db/prisma.js';
import { SystemResourceMonitor } from './resourceMonitor.js';

export class AnalyticsService {
  private readonly monitor = new SystemResourceMonitor();

  public getThrottlingConfig(): ThrottlingConfig {
    return this.monitor.getThrottlingConfig();
  }

  public updateThrottlingConfig(partial: Partial<ThrottlingConfig>): ThrottlingConfig {
    return this.monitor.updateThrottlingConfig(partial);
  }

  public evaluateThrottling(cpuPercent: number, ramPercent: number) {
    return this.monitor.evaluateThrottling(cpuPercent, ramPercent);
  }

  public async getSummary(): Promise<AnalyticsSummaryReport> {
    const prisma = getPrismaClient();
    const resources = await this.monitor.sample();

    await prisma.resourceSnapshot.create({
      data: {
        cpuPercent: resources.cpuPercent,
        ramPercent: resources.ramPercent,
        ramUsedGb: resources.ramUsedGb,
        ramTotalGb: resources.ramTotalGb,
        throttlingActive: resources.throttlingActive,
      },
    });

    const [
      aiRows,
      visionRows,
      voiceRows,
      ctrlRows,
      streamRows,
      errorRows,
      snapshotRows,
    ] = await Promise.all([
      prisma.aIDecision.findMany({ take: 200 }),
      prisma.visionCapture.findMany({ take: 200 }),
      prisma.voiceSpeechLog.findMany({ take: 200 }),
      prisma.controllerActionLog.findMany({ take: 200 }),
      prisma.streamSessionLog.findMany({ take: 100 }),
      prisma.systemLog.findMany({
        where: { level: { in: ['error', 'warn'] } },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      prisma.resourceSnapshot.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const avg = (nums: number[]): number =>
      nums.length === 0 ? 0 : Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(2));

    const resourceHistory: ResourceMetricsSnapshot[] = snapshotRows
      .reverse()
      .map((s) => ({
        cpuPercent: s.cpuPercent,
        ramUsedGb: s.ramUsedGb,
        ramTotalGb: s.ramTotalGb,
        ramPercent: s.ramPercent,
        gpuName: resources.gpuName,
        gpuLoadPercent: null,
        vramUsedMb: null,
        vramTotalMb: null,
        networkOnline: resources.networkOnline,
        activeInterfaces: resources.activeInterfaces,
        throttlingActive: s.throttlingActive,
        throttlingReason: null,
        recommendedVisionIntervalMs: s.throttlingActive ? 2500 : 1000,
        capturedAt: s.createdAt.toISOString(),
      }));

    return {
      resources,
      aiStats: {
        totalDecisions: aiRows.length,
        avgConfidence: avg(aiRows.map((r) => r.confidence)),
        avgLatencyMs: avg(aiRows.map((r) => r.latencyMs)),
        totalTokens: aiRows.reduce((sum, r) => sum + r.totalTokens, 0),
        totalCostUsd: Number(
          aiRows.reduce((sum, r) => sum + r.estimatedCostUsd, 0).toFixed(6),
        ),
      },
      visionStats: {
        totalCaptures: visionRows.length,
        avgProcessingMs: avg(visionRows.map((r) => r.processingMs)),
        avgSamplingIntervalMs: avg(visionRows.map((r) => r.samplingIntervalMs)),
      },
      voiceStats: {
        totalSpeeches: voiceRows.length,
        avgLatencyMs: avg(voiceRows.map((r) => r.latencyMs)),
        fallbackCount: voiceRows.filter((r) => r.fallbackUsed).length,
      },
      controllerStats: {
        totalActions: ctrlRows.length,
        executedOrSimulated: ctrlRows.filter(
          (r) => r.status === 'executed' || r.status === 'simulated',
        ).length,
        blockedOrRejected: ctrlRows.filter(
          (r) => r.status === 'blocked' || r.status === 'rejected',
        ).length,
      },
      streamingStats: {
        totalSessions: streamRows.length,
        avgBitrateKbps: avg(streamRows.map((r) => r.avgBitrate)),
        totalDroppedFrames: streamRows.reduce((sum, r) => sum + r.droppedFrames, 0),
      },
      recentErrors: errorRows.map((e) => ({
        id: e.id,
        level: e.level,
        source: e.source,
        message: e.message,
        createdAt: e.createdAt.toISOString(),
      })),
      resourceHistory,
    };
  }

  public async exportReport(format: 'json' | 'csv'): Promise<string> {
    const summary = await this.getSummary();
    if (format === 'json') {
      return JSON.stringify(summary, null, 2);
    }

    const lines = [
      'metric,value',
      `cpuPercent,${summary.resources.cpuPercent}`,
      `ramPercent,${summary.resources.ramPercent}`,
      `ramUsedGb,${summary.resources.ramUsedGb}`,
      `ramTotalGb,${summary.resources.ramTotalGb}`,
      `throttlingActive,${summary.resources.throttlingActive}`,
      `aiTotalDecisions,${summary.aiStats.totalDecisions}`,
      `aiAvgConfidence,${summary.aiStats.avgConfidence}`,
      `aiAvgLatencyMs,${summary.aiStats.avgLatencyMs}`,
      `aiTotalTokens,${summary.aiStats.totalTokens}`,
      `visionTotalCaptures,${summary.visionStats.totalCaptures}`,
      `visionAvgProcessingMs,${summary.visionStats.avgProcessingMs}`,
      `voiceTotalSpeeches,${summary.voiceStats.totalSpeeches}`,
      `controllerTotalActions,${summary.controllerStats.totalActions}`,
      `streamingTotalSessions,${summary.streamingStats.totalSessions}`,
    ];
    return lines.join('\n');
  }
}
