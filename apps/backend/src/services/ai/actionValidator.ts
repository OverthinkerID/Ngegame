import {
  ALLOWED_AI_ACTIONS,
  type AIActionType,
  type AIPlannedAction,
} from '@ngegame/shared';

export interface ValidatedAIOutput {
  gameStateSummary: string;
  strategyPlan: string;
  reasoning: string;
  confidence: number;
  actions: AIPlannedAction[];
  rejectedActions: string[];
}

const ALLOWED_SET = new Set<string>(ALLOWED_AI_ACTIONS);

function clamp(num: number, min: number, max: number): number {
  if (Number.isNaN(num)) return min;
  return Math.min(Math.max(num, min), max);
}

export function extractJsonObject(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidate = fenceMatch?.[1]?.trim() ?? trimmed;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('AI response does not contain a valid JSON object');
  }

  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
}

export function validateAIOutput(rawJson: Record<string, unknown>): ValidatedAIOutput {
  const gameStateSummary =
    typeof rawJson.gameStateSummary === 'string' && rawJson.gameStateSummary.trim()
      ? rawJson.gameStateSummary.trim()
      : 'Ringkasan state tidak tersedia';

  const strategyPlan =
    typeof rawJson.strategyPlan === 'string' && rawJson.strategyPlan.trim()
      ? rawJson.strategyPlan.trim()
      : 'Observasi lanjutan';

  const reasoning =
    typeof rawJson.reasoning === 'string' && rawJson.reasoning.trim()
      ? rawJson.reasoning.trim()
      : 'Tidak ada penjelasan tambahan';

  const confidence = clamp(
    typeof rawJson.confidence === 'number' ? rawJson.confidence : 0.5,
    0,
    1,
  );

  const rawActions = Array.isArray(rawJson.actions) ? rawJson.actions : [];
  const actions: AIPlannedAction[] = [];
  const rejectedActions: string[] = [];

  for (const item of rawActions) {
    if (typeof item !== 'object' || item === null) {
      rejectedActions.push('INVALID_ACTION_OBJECT');
      continue;
    }

    const rec = item as Record<string, unknown>;
    const actionType = typeof rec.actionType === 'string' ? rec.actionType.trim() : '';

    if (!ALLOWED_SET.has(actionType)) {
      rejectedActions.push(actionType || 'EMPTY_ACTION_TYPE');
      continue;
    }

    const rawParams =
      typeof rec.parameters === 'object' && rec.parameters !== null
        ? (rec.parameters as Record<string, unknown>)
        : {};
    const safeParams: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(rawParams)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        safeParams[k] = v;
      }
    }

    actions.push({
      actionType: actionType as AIActionType,
      target: typeof rec.target === 'string' ? rec.target : 'scene',
      parameters: safeParams,
      durationMs: clamp(
        typeof rec.durationMs === 'number' ? Math.round(rec.durationMs) : 300,
        50,
        5000,
      ),
      confidence: clamp(
        typeof rec.confidence === 'number' ? rec.confidence : confidence,
        0,
        1,
      ),
      rationale: typeof rec.rationale === 'string' ? rec.rationale : '',
    });
  }

  if (actions.length === 0) {
    actions.push({
      actionType: 'OBSERVE_ONLY',
      target: 'screen',
      parameters: {},
      durationMs: 500,
      confidence: Math.min(confidence, 0.7),
      rationale: 'Fallback aman karena tidak ada tindakan valid yang lolos validasi.',
    });
  }

  return {
    gameStateSummary,
    strategyPlan,
    reasoning,
    confidence,
    actions,
    rejectedActions,
  };
}
