import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsService } from '../src/services/analytics/analyticsService.js';

describe('Analytics & Optimization', () => {
  it('evaluates automatic resource throttling when CPU or RAM exceeds threshold', () => {
    const analytics = new AnalyticsService();
    analytics.updateThrottlingConfig({
      autoThrottleEnabled: true,
      cpuThresholdPercent: 80,
      ramThresholdPercent: 85,
    });

    const normal = analytics.evaluateThrottling(35, 50);
    assert.equal(normal.active, false);
    assert.equal(normal.recommendedVisionIntervalMs, 1000);

    const highCpu = analytics.evaluateThrottling(92, 50);
    assert.equal(highCpu.active, true);
    assert.equal(highCpu.recommendedVisionIntervalMs, 2500);
  });

  it('generates summary report and exports JSON and CSV', async () => {
    const analytics = new AnalyticsService();
    const summary = await analytics.getSummary();
    assert.ok(summary.resources.ramTotalGb > 0);
    assert.ok(Array.isArray(summary.resourceHistory));

    const csv = await analytics.exportReport('csv');
    assert.ok(csv.startsWith('metric,value'));
    assert.ok(csv.includes('cpuPercent,'));

    const json = await analytics.exportReport('json');
    const parsed = JSON.parse(json) as { resources?: { ramTotalGb?: number } };
    assert.ok((parsed.resources?.ramTotalGb ?? 0) > 0);
  });
});
