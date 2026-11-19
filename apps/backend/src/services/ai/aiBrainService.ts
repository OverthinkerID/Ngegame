import type {
  AIBrainConfig,
  AIBrainDecisionResult,
  AIBrainThinkRequest,
  AIProviderHealth,
  AIProviderType,
  GameGenreTemplate,
} from '@ngegame/shared';
import { getPrismaClient, recordSystemLog } from '../../db/prisma.js';
import { Logger } from '../../utils/logger.js';
import { extractJsonObject, validateAIOutput } from './actionValidator.js';
import { buildSystemPrompt, buildUserPrompt } from './promptTemplates.js';
import {
  calculateTokenUsage,
  callOllama,
  callOpenAI,
  checkOllamaHealth,
} from './providers.js';

export class AIBrainService {
  private readonly logger: Logger;
  private config: AIBrainConfig;
  private sessionMemory: string[] = [];

  constructor(logger = new Logger('ai-brain')) {
    this.logger = logger;
    this.config = {
      primaryProvider: 'ollama',
      fallbackProvider: 'openai',
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
      ollamaModel: process.env.OLLAMA_MODEL ?? 'llama3.1:8b',
      openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      genre: 'Universal',
      temperature: 0.3,
    };
  }

  public getConfig(): AIBrainConfig {
    return {
      ...this.config,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    };
  }

  public updateConfig(partial: Partial<AIBrainConfig>): AIBrainConfig {
    if (partial.primaryProvider === 'ollama' || partial.primaryProvider === 'openai') {
      this.config.primaryProvider = partial.primaryProvider;
    }
    if (
      partial.fallbackProvider === 'ollama' ||
      partial.fallbackProvider === 'openai' ||
      partial.fallbackProvider === null
    ) {
      this.config.fallbackProvider = partial.fallbackProvider;
    }
    if (typeof partial.ollamaBaseUrl === 'string' && partial.ollamaBaseUrl.trim()) {
      this.config.ollamaBaseUrl = partial.ollamaBaseUrl.trim();
    }
    if (typeof partial.ollamaModel === 'string' && partial.ollamaModel.trim()) {
      this.config.ollamaModel = partial.ollamaModel.trim();
    }
    if (typeof partial.openaiModel === 'string' && partial.openaiModel.trim()) {
      this.config.openaiModel = partial.openaiModel.trim();
    }
    if (partial.genre) {
      this.config.genre = partial.genre;
    }
    if (typeof partial.temperature === 'number' && !Number.isNaN(partial.temperature)) {
      this.config.temperature = Math.min(Math.max(partial.temperature, 0), 1);
    }
    return this.getConfig();
  }

  public async getProvidersHealth(): Promise<AIProviderHealth> {
    const ollama = await checkOllamaHealth(this.config.ollamaBaseUrl);
    return {
      ollamaAvailable: ollama.available,
      ollamaModels: ollama.models,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    };
  }

  private async invokeProvider(
    provider: AIProviderType,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<{ rawText: string; model: string; promptTokens: number; completionTokens: number }> {
    if (provider === 'ollama') {
      const res = await callOllama(
        this.config.ollamaBaseUrl,
        this.config.ollamaModel,
        systemPrompt,
        userPrompt,
        this.config.temperature,
      );
      return { ...res, model: this.config.ollamaModel };
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }
    const res = await callOpenAI(
      apiKey,
      this.config.openaiModel,
      systemPrompt,
      userPrompt,
      this.config.temperature,
    );
    return { ...res, model: this.config.openaiModel };
  }

  private buildDeterministicFallbackJson(
    request: AIBrainThinkRequest,
    genre: GameGenreTemplate,
  ): Record<string, unknown> {
    const { sceneLabel, motionScore, ocrText } = request.visionState;
    const isActive = sceneLabel === 'active_gameplay' || motionScore >= 0.08;

    return {
      gameStateSummary: `Scene terdeteksi: ${sceneLabel} (motion=${motionScore}) pada ${request.visionState.windowTitle}.`,
      strategyPlan: isActive
        ? `Pertahankan observasi ${genre} dan siapkan langkah interaksi aman.`
        : 'Tunggu transisi layar atau lakukan observasi pasif.',
      reasoning:
        'Menggunakan deterministic safe fallback karena provider LLM lokal/cloud tidak aktif atau belum dikonfigurasi.',
      confidence: isActive ? 0.68 : 0.55,
      actions: [
        {
          actionType: isActive ? 'INTERACT' : 'OBSERVE_ONLY',
          target: ocrText ? ocrText.slice(0, 32) : 'active_scene',
          parameters: { genre },
          durationMs: 300,
          confidence: isActive ? 0.68 : 0.55,
          rationale: 'Rencana aman berstatus planned_only menunggu persetujuan manusia.',
        },
      ],
    };
  }

  public async think(request: AIBrainThinkRequest): Promise<AIBrainDecisionResult> {
    const started = Date.now();
    const genre = request.genre ?? this.config.genre;
    const systemPrompt = buildSystemPrompt(genre);
    const userPrompt = buildUserPrompt(request, this.sessionMemory);

    let providerUsed: AIProviderType | 'deterministic-fallback' = this.config.primaryProvider;
    let modelUsed =
      this.config.primaryProvider === 'ollama'
        ? this.config.ollamaModel
        : this.config.openaiModel;
    let fallbackUsed = false;
    let promptTokens = 0;
    let completionTokens = 0;
    let rawJson: Record<string, unknown> | null = null;

    try {
      const primary = await this.invokeProvider(
        this.config.primaryProvider,
        systemPrompt,
        userPrompt,
      );
      rawJson = extractJsonObject(primary.rawText);
      modelUsed = primary.model;
      promptTokens = primary.promptTokens;
      completionTokens = primary.completionTokens;
    } catch (primaryErr) {
      this.logger.warn('Primary AI provider failed, checking fallback', {
        provider: this.config.primaryProvider,
        error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
      });

      if (
        this.config.fallbackProvider &&
        this.config.fallbackProvider !== this.config.primaryProvider
      ) {
        try {
          const secondary = await this.invokeProvider(
            this.config.fallbackProvider,
            systemPrompt,
            userPrompt,
          );
          rawJson = extractJsonObject(secondary.rawText);
          providerUsed = this.config.fallbackProvider;
          modelUsed = secondary.model;
          fallbackUsed = true;
          promptTokens = secondary.promptTokens;
          completionTokens = secondary.completionTokens;
        } catch (fallbackErr) {
          this.logger.warn('Fallback AI provider failed, using deterministic safe fallback', {
            provider: this.config.fallbackProvider,
            error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
          });
        }
      }
    }

    if (!rawJson) {
      providerUsed = 'deterministic-fallback';
      modelUsed = 'rule-based-safe-v1';
      fallbackUsed = true;
      rawJson = this.buildDeterministicFallbackJson(request, genre);
    }

    const validated = validateAIOutput(rawJson);
    const tokenUsage = calculateTokenUsage(
      providerUsed,
      modelUsed,
      promptTokens,
      completionTokens,
    );
    const latencyMs = Date.now() - started;

    this.sessionMemory.push(
      `[${genre}] ${validated.gameStateSummary} -> ${validated.actions[0]?.actionType ?? 'OBSERVE_ONLY'}`,
    );
    if (this.sessionMemory.length > 10) {
      this.sessionMemory = this.sessionMemory.slice(-10);
    }

    const prisma = getPrismaClient();
    const saved = await prisma.aIDecision.create({
      data: {
        providerUsed,
        modelUsed,
        fallbackUsed,
        genre,
        gameStateSummary: validated.gameStateSummary,
        strategyPlan: validated.strategyPlan,
        reasoning: validated.reasoning,
        confidence: validated.confidence,
        actionsJson: JSON.stringify(validated.actions),
        rejectedJson: JSON.stringify(validated.rejectedActions),
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        estimatedCostUsd: tokenUsage.estimatedCostUsd,
        latencyMs,
        executionStatus: 'planned_only',
      },
    });

    await recordSystemLog('info', 'ai-brain', `AI plan generated (${providerUsed}:${modelUsed})`, {
      decisionId: saved.id,
      confidence: validated.confidence,
      actionsCount: validated.actions.length,
    });

    return {
      id: saved.id,
      providerUsed,
      modelUsed,
      fallbackUsed,
      genre,
      gameStateSummary: validated.gameStateSummary,
      strategyPlan: validated.strategyPlan,
      reasoning: validated.reasoning,
      confidence: validated.confidence,
      actions: validated.actions,
      rejectedActions: validated.rejectedActions,
      tokenUsage,
      latencyMs,
      executionStatus: 'planned_only',
      createdAt: saved.createdAt.toISOString(),
    };
  }

  public async getHistory(limit = 15): Promise<AIBrainDecisionResult[]> {
    const prisma = getPrismaClient();
    const rows = await prisma.aIDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50),
    });

    return rows.map((row) => ({
      id: row.id,
      providerUsed: row.providerUsed as AIBrainDecisionResult['providerUsed'],
      modelUsed: row.modelUsed,
      fallbackUsed: row.fallbackUsed,
      genre: row.genre as GameGenreTemplate,
      gameStateSummary: row.gameStateSummary,
      strategyPlan: row.strategyPlan,
      reasoning: row.reasoning,
      confidence: row.confidence,
      actions: JSON.parse(row.actionsJson) as AIBrainDecisionResult['actions'],
      rejectedActions: JSON.parse(row.rejectedJson) as string[],
      tokenUsage: {
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        estimatedCostUsd: row.estimatedCostUsd,
      },
      latencyMs: row.latencyMs,
      executionStatus: 'planned_only',
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
