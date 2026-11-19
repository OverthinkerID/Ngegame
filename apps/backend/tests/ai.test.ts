import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonObject, validateAIOutput } from '../src/services/ai/actionValidator.js';
import { AIBrainService } from '../src/services/ai/aiBrainService.js';
import { buildSystemPrompt, buildUserPrompt } from '../src/services/ai/promptTemplates.js';
import { calculateTokenUsage } from '../src/services/ai/providers.js';

describe('AI Brain Engine', () => {
  it('builds genre-specific system and user prompts', () => {
    const sys = buildSystemPrompt('RPG');
    assert.ok(sys.includes('RPG'));
    assert.ok(sys.includes('OBSERVE_ONLY'));

    const usr = buildUserPrompt(
      {
        gameTitle: 'Stardew Valley',
        visionState: {
          windowTitle: 'Stardew Valley',
          sceneLabel: 'active_gameplay',
          motionScore: 0.12,
          brightness: 0.55,
          ocrText: 'Energy 80%',
        },
      },
      ['Langkah sebelumnya: OBSERVE_ONLY'],
    );
    assert.ok(usr.includes('Stardew Valley'));
    assert.ok(usr.includes('Langkah sebelumnya'));
  });

  it('rejects unknown actions and falls back to OBSERVE_ONLY when all actions invalid', () => {
    const parsed = extractJsonObject(
      '```json\n{"gameStateSummary":"Test","strategyPlan":"Safe","reasoning":"Check","confidence":0.9,"actions":[{"actionType":"DELETE_ALL_FILES","target":"disk"},{"actionType":"INTERACT","target":"NPC","durationMs":300}]}\n```',
    );
    const validated = validateAIOutput(parsed);
    assert.equal(validated.rejectedActions.length, 1);
    assert.equal(validated.rejectedActions[0], 'DELETE_ALL_FILES');
    assert.equal(validated.actions.length, 1);
    assert.equal(validated.actions[0]?.actionType, 'INTERACT');

    const allBad = validateAIOutput({
      actions: [{ actionType: 'HACK_MEMORY', target: 'ram' }],
    });
    assert.equal(allBad.rejectedActions[0], 'HACK_MEMORY');
    assert.equal(allBad.actions[0]?.actionType, 'OBSERVE_ONLY');
  });

  it('calculates token cost for OpenAI and zero for local Ollama', () => {
    const local = calculateTokenUsage('ollama', 'llama3.1:8b', 500, 200);
    assert.equal(local.totalTokens, 700);
    assert.equal(local.estimatedCostUsd, 0);

    const cloud = calculateTokenUsage('openai', 'gpt-4o-mini', 1000, 500);
    assert.equal(cloud.totalTokens, 1500);
    assert.ok(cloud.estimatedCostUsd > 0);
  });

  it('runs simulated think pipeline with deterministic safe fallback and SQLite persistence', async () => {
    const service = new AIBrainService();
    service.updateConfig({
      ollamaBaseUrl: 'http://localhost:59999', // unreachable port to test fallback
      fallbackProvider: null,
      genre: 'Simulation',
    });

    const result = await service.think({
      gameTitle: 'Simulated Farm',
      genre: 'Simulation',
      objective: 'Cek energi dan NPC',
      visionState: {
        windowTitle: 'Simulated Farm',
        sceneLabel: 'active_gameplay',
        motionScore: 0.15,
        brightness: 0.6,
        ocrText: 'Energy 90%',
      },
    });

    try {
      assert.ok(typeof result.id === 'number');
      assert.equal(result.fallbackUsed, true);
      assert.equal(result.executionStatus, 'planned_only');
      assert.ok(result.actions.length >= 1);
    } finally {
      if (result.id !== undefined) {
        const { getPrismaClient, disconnectDatabase } = await import('../src/db/prisma.js');
        const prisma = getPrismaClient();
        await prisma.aIDecision.deleteMany({ where: { id: result.id } });
        await disconnectDatabase();
      }
    }
  });
});
