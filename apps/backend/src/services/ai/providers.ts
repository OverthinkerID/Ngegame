import type { AIProviderType, AITokenUsage } from '@ngegame/shared';

export interface ProviderCallResult {
  rawText: string;
  promptTokens: number;
  completionTokens: number;
}

export async function checkOllamaHealth(
  baseUrl: string,
): Promise<{ available: boolean; models: string[] }> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      return { available: false, models: [] };
    }
    const data = (await res.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = (data.models ?? [])
      .map((m) => m.name)
      .filter((name): name is string => typeof name === 'string');
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

export async function callOllama(
  baseUrl: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
): Promise<ProviderCallResult> {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model,
      stream: false,
      format: 'json',
      options: { temperature },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama HTTP ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    message?: { content?: string };
    prompt_eval_count?: number;
    eval_count?: number;
  };

  return {
    rawText: data.message?.content ?? '',
    promptTokens: data.prompt_eval_count ?? 0,
    completionTokens: data.eval_count ?? 0,
  };
}

export async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number,
): Promise<ProviderCallResult> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  return {
    rawText: data.choices?.[0]?.message?.content ?? '',
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
  };
}

export function calculateTokenUsage(
  provider: AIProviderType | 'deterministic-fallback',
  model: string,
  promptTokens: number,
  completionTokens: number,
): AITokenUsage {
  const totalTokens = promptTokens + completionTokens;
  if (provider !== 'openai') {
    return {
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: 0,
    };
  }

  // Approximate per-1M token pricing (USD)
  const isMini = model.includes('mini');
  const inputPerMillion = isMini ? 0.15 : 2.5;
  const outputPerMillion = isMini ? 0.6 : 10.0;
  const cost =
    (promptTokens / 1_000_000) * inputPerMillion +
    (completionTokens / 1_000_000) * outputPerMillion;

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: Number(cost.toFixed(6)),
  };
}
