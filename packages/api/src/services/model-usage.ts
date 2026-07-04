import { settings } from '@harpa/api-contract';

export interface TokenMultiplier {
  input: number;
  output: number;
}

export const MODEL_TOKEN_MULTIPLIERS = {
  'openai:gpt-4.1-nano': { input: 0.25, output: 0.25 },
  'openai:gpt-4.1-mini': { input: 1, output: 1 },
  'openai:gpt-4.1': { input: 5, output: 5 },
} as const satisfies Readonly<Record<string, TokenMultiplier>>;

type ModelCatalogue = Readonly<Record<string, readonly { id: string }[]>>;

export function assertMultiplierCoverage(
  catalogue: ModelCatalogue = settings.AI_MODELS,
): void {
  const missing: string[] = [];
  for (const [vendor, models] of Object.entries(catalogue)) {
    for (const model of models) {
      const key = `${vendor}:${model.id}`;
      if (!(key in MODEL_TOKEN_MULTIPLIERS)) missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing token multipliers: ${missing.join(', ')}`);
  }
}

export interface RawTokenGroup {
  vendor: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function weightTokenGroups(
  groups: readonly RawTokenGroup[],
): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const group of groups) {
    const key = `${group.vendor}:${group.model}`;
    const multiplier: TokenMultiplier = MODEL_TOKEN_MULTIPLIERS[
      key as keyof typeof MODEL_TOKEN_MULTIPLIERS
    ] ?? { input: 1, output: 1 };
    inputTokens += group.inputTokens * multiplier.input;
    outputTokens += group.outputTokens * multiplier.output;
  }
  return {
    inputTokens: Math.ceil(inputTokens),
    outputTokens: Math.ceil(outputTokens),
  };
}
