export interface ResourceMetricsSnapshot {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  ramPercent: number;
  gpuName: string;
  gpuLoadPercent: number | null;
  vramUsedMb: number | null;
  vramTotalMb: number | null;
  networkOnline: boolean;
  activeInterfaces: number;
  throttlingActive: boolean;
  throttlingReason: string | null;
  recommendedVisionIntervalMs: number;
  capturedAt: string;
}

export interface AnalyticsSummaryReport {
  resources: ResourceMetricsSnapshot;
  aiStats: {
    totalDecisions: number;
    avgConfidence: number;
    avgLatencyMs: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  visionStats: {
    totalCaptures: number;
    avgProcessingMs: number;
    avgSamplingIntervalMs: number;
  };
  voiceStats: {
    totalSpeeches: number;
    avgLatencyMs: number;
    fallbackCount: number;
  };
  controllerStats: {
    totalActions: number;
    executedOrSimulated: number;
    blockedOrRejected: number;
  };
  streamingStats: {
    totalSessions: number;
    avgBitrateKbps: number;
    totalDroppedFrames: number;
  };
  recentErrors: Array<{
    id: number;
    level: string;
    source: string;
    message: string;
    createdAt: string;
  }>;
  resourceHistory: ResourceMetricsSnapshot[];
}

export interface ThrottlingConfig {
  autoThrottleEnabled: boolean;
  cpuThresholdPercent: number;
  ramThresholdPercent: number;
}
