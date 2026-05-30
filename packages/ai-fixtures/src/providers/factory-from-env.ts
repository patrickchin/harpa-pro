/**
 * realProviderFactoryFromEnv — builds the real-provider factory the
 * @harpa/ai-fixtures `createProvider()` requires for live + record
 * modes. Reads the per-vendor API keys from the API env so route
 * handlers don't need to plumb anything; replay mode never calls
 * this factory and never reads these keys.
 *
 * Routing:
 *   openai → createOpenAiProvider (chat + report generation)
 *   groq   → createGroqProvider   (transcription)
 *   kimi   → createKimiProvider   (chat via Moonshot REST)
 *
 * See docs/v4/arch-ai-fixtures.md §Live mode and Pitfall 13.
 */
import {
  type AiProvider,
  type Vendor,
  LiveAdapterMissingError,
} from '../index.js';
import { createOpenAiProvider } from './openai.js';
import { createGroqProvider } from './groq.js';
import { createKimiProvider } from './kimi.js';

export interface RealProviderFactoryConfig {
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  groqApiKey?: string;
  groqBaseUrl?: string;
  kimiApiKey?: string;
  kimiBaseUrl?: string;
  /** Override fetch (test-only — forwarded to whichever adapter is built). */
  fetchImpl?: typeof fetch;
}

export function realProviderFactoryFromEnv(
  cfg: RealProviderFactoryConfig,
): (vendor: Vendor) => AiProvider {
  return (vendor: Vendor): AiProvider => {
    switch (vendor) {
      case 'openai': {
        if (!cfg.openaiApiKey) {
          throw new LiveAdapterMissingError('openai', 'chat');
        }
        return createOpenAiProvider({
          apiKey: cfg.openaiApiKey,
          baseUrl: cfg.openaiBaseUrl,
          fetchImpl: cfg.fetchImpl,
        });
      }
      case 'groq': {
        if (!cfg.groqApiKey) {
          throw new LiveAdapterMissingError('groq', 'transcribe');
        }
        return createGroqProvider({
          apiKey: cfg.groqApiKey,
          baseUrl: cfg.groqBaseUrl,
          fetchImpl: cfg.fetchImpl,
        });
      }
      case 'kimi': {
        if (!cfg.kimiApiKey) {
          throw new LiveAdapterMissingError('kimi', 'chat');
        }
        return createKimiProvider({
          apiKey: cfg.kimiApiKey,
          baseUrl: cfg.kimiBaseUrl,
          fetchImpl: cfg.fetchImpl,
        });
      }
      default: {
        const _exhaustive: never = vendor;
        throw new LiveAdapterMissingError(_exhaustive as string, 'chat');
      }
    }
  };
}
