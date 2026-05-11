import {
  type AiProvider,
  type ChatRequest,
  type ChatResponse,
  type FixtureMode,
  type ProviderConfig,
  type TranscribeRequest,
  type TranscribeResponse,
  type Vendor,
  FixtureMissError,
  LiveModeForbiddenError,
} from './index.js';
import { FixtureStore, type FixtureFile } from './fixture-store.js';
import { hashRequest } from './hash.js';
import { redact } from './redact.js';

/**
 * Build an AI provider with fixture-mode behaviour.
 *
 * In `replay` mode (default), the configured fixtureName is loaded from disk
 * and returned verbatim if its requestHash matches the canonical hash of the
 * incoming request. Mismatches throw FixtureMissError.
 *
 * In `record` mode, the request is forwarded to a real implementation
 * (constructed by `realProviderFactory` in tests / scripts), redacted, and
 * written to disk under the fixtureName.
 *
 * In `live` mode, the request is forwarded to the real implementation with no
 * fixture interaction. Live mode is gated by AI_LIVE=1 — this is the
 * production deploy path.
 *
 * Tests inject `realProviderFactory` to keep the package free of provider SDKs.
 */
export function createProvider(
  cfg: ProviderConfig,
  realProviderFactory?: (vendor: Vendor) => AiProvider,
): AiProvider {
  const mode: FixtureMode = (cfg.fixtureMode ?? 'replay') as FixtureMode;
  const store = new FixtureStore(cfg.fixturesDir);

  const real = (): AiProvider => {
    if (mode !== 'replay' && !realProviderFactory) {
      throw new Error(
        `[ai-fixtures] mode="${mode}" requires a realProviderFactory; only "replay" works without one.`,
      );
    }
    return realProviderFactory!(cfg.vendor);
  };

  if (mode === 'live' && process.env.AI_LIVE !== '1') {
    throw new LiveModeForbiddenError();
  }

  const handle = async <Req, Res>(
    kind: 'chat' | 'transcribe',
    req: Req,
    callReal: () => Promise<Res>,
  ): Promise<Res> => {
    const fixtureName = cfg.fixtureName ?? `${kind}.default`;
    const requestHash = hashRequest({ kind, vendor: cfg.vendor, ...(req as object) });

    if (mode === 'replay') {
      const fx = store.read(fixtureName);
      if (!fx) {
        throw new FixtureMissError(fixtureName, requestHash, 'fixture file not found');
      }
      if (fx.requestHash !== requestHash) {
        throw new FixtureMissError(
          fixtureName,
          requestHash,
          `request hash mismatch (recorded ${fx.requestHash}); re-record with: pnpm fixtures:record ${fixtureName}`,
        );
      }
      return fx.response as Res;
    }

    if (mode === 'live') {
      return callReal();
    }

    // record
    const response = await callReal();
    const file: FixtureFile = {
      vendor: cfg.vendor,
      model: 'unknown',
      fixtureName,
      recordedAt: new Date().toISOString(),
      requestHash,
      request: redact(req),
      response: redact(response),
    };
    store.write(fixtureName, file);
    return response;
  };

  return {
    vendor: cfg.vendor,
    chat: (req: ChatRequest) => handle('chat', req, () => real().chat(req)) as Promise<ChatResponse>,
    transcribe: (req: TranscribeRequest) =>
      handle('transcribe', req, () => real().transcribe(req)) as Promise<TranscribeResponse>,
  };
}
