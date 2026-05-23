/**
 * FlagSource — synchronous, fail-safe feature flag reader.
 *
 * Design constraints (see docs/v4/pitfalls.md Pitfall 17):
 *   - Synchronous. Routes/factories call `getBooleanFlag(key, default)`
 *     in the hot path; no awaits, no per-request network.
 *   - Never throws. Any error (PostHog down, malformed cache, missing
 *     key) returns the supplied default + logs.
 *   - Uses posthog-node's LOCAL evaluation: a Personal API key polls
 *     flag definitions, evaluation is in-process.
 *   - On cold boot before the first poll completes, hydrates from a
 *     disk cache. If no cache, returns fail-safe defaults from
 *     @harpa/analytics-events/flags.
 *
 * The flags here are GLOBAL (environment-scoped, not per-user). We
 * evaluate against a fixed system distinct ID per environment so
 * PostHog's release-condition rules can target by env tag.
 */
import { PostHog } from 'posthog-node';
import fs from 'node:fs';
import path from 'node:path';
import {
  FLAG_FAILSAFE_DEFAULTS,
  type BooleanFlagKey,
  type VariantFlagKey,
} from '@harpa/analytics-events';
import { env } from '../env.js';

export interface FlagSource {
  getBooleanFlag(key: BooleanFlagKey, defaultValue?: boolean): boolean;
  getVariantFlag<V extends string>(key: VariantFlagKey, defaultVariant: V): V;
  /** Test/diagnostic — true when no real PostHog is wired. */
  isStub(): boolean;
  /** Graceful shutdown — flushes the poller. No-op for stub. */
  shutdown(): Promise<void>;
}

/** Returns the system distinct ID used for global env-scoped flag eval. */
export function systemDistinctId(nodeEnv: string = env.NODE_ENV): string {
  return `system:harpa-api-${nodeEnv}`;
}

// ---------- In-memory test source ----------

export class InMemoryFlagSource implements FlagSource {
  private readonly booleans = new Map<string, boolean>();
  private readonly variants = new Map<string, string>();

  setBoolean(key: BooleanFlagKey, value: boolean): this {
    this.booleans.set(key, value);
    return this;
  }
  setVariant(key: VariantFlagKey, value: string): this {
    this.variants.set(key, value);
    return this;
  }
  getBooleanFlag(key: BooleanFlagKey, defaultValue?: boolean): boolean {
    if (this.booleans.has(key)) return this.booleans.get(key)!;
    if (defaultValue !== undefined) return defaultValue;
    return failsafeBoolean(key);
  }
  getVariantFlag<V extends string>(key: VariantFlagKey, defaultVariant: V): V {
    const v = this.variants.get(key);
    return (v as V | undefined) ?? defaultVariant;
  }
  isStub(): boolean {
    return true;
  }
  async shutdown(): Promise<void> {}
}

// ---------- Disk cache ----------

interface FlagCacheShape {
  booleans: Record<string, boolean>;
  variants: Record<string, string>;
  updatedAt: number;
}

function readCache(file: string): FlagCacheShape | null {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw) as FlagCacheShape;
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.booleans &&
      parsed.variants
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(file: string, cache: FlagCacheShape): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(cache), 'utf8');
  } catch {
    // disk write failed — non-fatal, next poll will retry
  }
}

// ---------- Real source backed by posthog-node ----------

export interface PostHogFlagSourceOptions {
  apiKey: string;
  personalApiKey: string;
  host?: string;
  distinctId?: string;
  /** Refresh cadence for flag definitions. Default 30s. */
  featureFlagsPollingInterval?: number;
  /** Disk cache path. Default $HARPA_FLAG_CACHE or /tmp/harpa-flags.json. */
  cachePath?: string;
}

export class PostHogFlagSource implements FlagSource {
  private readonly client: PostHog;
  private readonly distinctId: string;
  private readonly cachePath: string;
  private cache: FlagCacheShape;

  constructor(opts: PostHogFlagSourceOptions) {
    this.distinctId = opts.distinctId ?? systemDistinctId();
    this.cachePath =
      opts.cachePath ?? process.env.HARPA_FLAG_CACHE ?? '/tmp/harpa-flags.json';

    const seeded = readCache(this.cachePath);
    this.cache = seeded ?? { booleans: {}, variants: {}, updatedAt: 0 };

    this.client = new PostHog(opts.apiKey, {
      host: opts.host ?? env.POSTHOG_HOST,
      personalApiKey: opts.personalApiKey,
      featureFlagsPollingInterval: opts.featureFlagsPollingInterval ?? 30_000,
    });
  }

  getBooleanFlag(key: BooleanFlagKey, defaultValue?: boolean): boolean {
    try {
      // posthog-node's getFeatureFlag is async over the network unless we use
      // the LOCAL evaluation form, which is `isFeatureEnabled` with
      // `onlyEvaluateLocally: true`. That returns a Promise too but resolves
      // synchronously if definitions are cached. We don't await — instead we
      // keep our own warm cache that is updated by a fire-and-forget refresh
      // and read synchronously here.
      void this.refreshBoolean(key);
      if (this.cache.booleans[key] !== undefined) {
        return this.cache.booleans[key];
      }
      if (defaultValue !== undefined) return defaultValue;
      return failsafeBoolean(key);
    } catch (err) {
      console.warn('[flags] boolean flag read failed', key, err);
      return defaultValue ?? failsafeBoolean(key);
    }
  }

  getVariantFlag<V extends string>(key: VariantFlagKey, defaultVariant: V): V {
    try {
      void this.refreshVariant(key);
      const cached = this.cache.variants[key];
      if (cached !== undefined) return cached as V;
      return defaultVariant;
    } catch (err) {
      console.warn('[flags] variant flag read failed', key, err);
      return defaultVariant;
    }
  }

  private async refreshBoolean(key: BooleanFlagKey): Promise<void> {
    try {
      const v = await this.client.isFeatureEnabled(key, this.distinctId, {
        onlyEvaluateLocally: true,
      });
      if (typeof v === 'boolean' && this.cache.booleans[key] !== v) {
        this.cache.booleans[key] = v;
        this.cache.updatedAt = Date.now();
        writeCache(this.cachePath, this.cache);
      }
    } catch {
      // swallow — defaults will be used
    }
  }

  private async refreshVariant(key: VariantFlagKey): Promise<void> {
    try {
      const v = await this.client.getFeatureFlag(key, this.distinctId, {
        onlyEvaluateLocally: true,
      });
      if (typeof v === 'string' && this.cache.variants[key] !== v) {
        this.cache.variants[key] = v;
        this.cache.updatedAt = Date.now();
        writeCache(this.cachePath, this.cache);
      }
    } catch {
      // swallow
    }
  }

  isStub(): boolean {
    return false;
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown();
  }
}

// ---------- Helpers ----------

function failsafeBoolean(key: BooleanFlagKey): boolean {
  const v = FLAG_FAILSAFE_DEFAULTS[key];
  return typeof v === 'boolean' ? v : false;
}

// ---------- Module singleton ----------

let singleton: FlagSource | null = null;

export function createFlagSource(): FlagSource {
  if (env.NODE_ENV === 'test') return new InMemoryFlagSource();
  if (!env.POSTHOG_API_KEY || !env.POSTHOG_PERSONAL_API_KEY) {
    // No keys configured — return a stub that always serves defaults.
    // Boot-time warn so this isn't silent in dev.
    console.warn(
      '[flags] POSTHOG_API_KEY or POSTHOG_PERSONAL_API_KEY missing — ' +
        'flag evaluation will return failsafe defaults. See ' +
        'docs/v4/arch-analytics.md.',
    );
    return new InMemoryFlagSource();
  }
  return new PostHogFlagSource({
    apiKey: env.POSTHOG_API_KEY,
    personalApiKey: env.POSTHOG_PERSONAL_API_KEY,
    host: env.POSTHOG_HOST,
  });
}

export function getFlagSource(): FlagSource {
  if (!singleton) singleton = createFlagSource();
  return singleton;
}

export function __setFlagSourceForTests(src: FlagSource): void {
  singleton = src;
}

export function __resetFlagSourceForTests(): void {
  singleton = null;
}
