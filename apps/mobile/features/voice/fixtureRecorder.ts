/**
 * Fixture-mode recorder. Used when `EXPO_PUBLIC_USE_FIXTURES === 'true'`.
 *
 * Bypasses the iOS-simulator microphone (which records silence and yields
 * unhelpfully-tiny m4a files) by returning a pre-recorded canned audio
 * file. Honours the AGENTS.md promise: "fixture mode … stubs the
 * iOS-simulator audio recorder".
 *
 * The canned file lives at `apps/mobile/assets/fixtures/voice-sample.m4a`
 * (a 2-second 16 kHz mono AAC clip). It is bundled into the Metro asset
 * tree via `require()` so it gets a real file:// URI at runtime via
 * `expo-asset`.
 *
 * Behaviour:
 *   • permission is always 'granted' (no native prompt)
 *   • `start()` flips to 'recording' and animates a fake amplitude
 *     waveform so the meter looks alive
 *   • `pause/resume` work the obvious way
 *   • `stop()` resolves the asset's URI + a fixed durationSec=2
 *
 * Refs: docs/v4/arch-voice-pipeline.md §D6 (fixture contract).
 */
import { Asset } from 'expo-asset';
import type {
  PermissionState,
  RecorderFactory,
  RecorderHandle,
  RecorderResult,
  RecorderSnapshot,
} from './recorder-types';

const FIXTURE_DURATION_SEC = 2;
const FIXTURE_SIZE_BYTES = 1089;
const TICK_MS = 100;

async function resolveFixtureUri(): Promise<string> {
  // Defer the import of the binary asset module to call-time so that
  // node-only test environments (vitest) which can't resolve the m4a
  // via metro can stub the dynamic import without exploding at module
  // load. In production Metro processes this import and the resulting
  // module object hits `Asset.loadAsync` below.
  const mod = (await import('@/assets/fixtures/voice-sample.m4a')) as {
    default: number | string;
  };
  const [asset] = await Asset.loadAsync(mod.default ?? mod);
  if (!asset?.localUri && !asset?.uri) {
    throw new Error('fixtureRecorder: failed to resolve voice-sample.m4a');
  }
  return (asset.localUri ?? asset.uri)!;
}

function createFixtureHandle(): RecorderHandle {
  let snapshot: RecorderSnapshot = { status: 'idle', durationMs: 0, amplitude: 0 };
  let timer: ReturnType<typeof setInterval> | null = null;
  let startedAt = 0;
  let baseDurationMs = 0;
  const listeners = new Set<(s: RecorderSnapshot) => void>();

  function emit(next: Partial<RecorderSnapshot>) {
    snapshot = { ...snapshot, ...next };
    for (const l of listeners) l(snapshot);
  }

  function tick() {
    const liveMs = baseDurationMs + (Date.now() - startedAt);
    // Synthesised meter — a slow sine so the UI's amplitude bar moves.
    const phase = (liveMs / 250) % (Math.PI * 2);
    const amp = 0.3 + Math.abs(Math.sin(phase)) * 0.5;
    emit({ durationMs: liveMs, amplitude: amp });
  }

  function clearTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return {
    subscribe(l) {
      listeners.add(l);
      l(snapshot);
      return () => {
        listeners.delete(l);
      };
    },
    getSnapshot() {
      return snapshot;
    },
    async start() {
      if (snapshot.status === 'recording') return;
      baseDurationMs = 0;
      startedAt = Date.now();
      emit({ status: 'recording', durationMs: 0, amplitude: 0, error: undefined });
      timer = setInterval(tick, TICK_MS);
    },
    async pause() {
      if (snapshot.status !== 'recording') return;
      clearTimer();
      baseDurationMs += Date.now() - startedAt;
      emit({ status: 'paused', durationMs: baseDurationMs, amplitude: 0 });
    },
    async resume() {
      if (snapshot.status !== 'paused') return;
      startedAt = Date.now();
      emit({ status: 'recording' });
      timer = setInterval(tick, TICK_MS);
    },
    async stop(): Promise<RecorderResult> {
      clearTimer();
      const finalMs =
        snapshot.status === 'recording' ? baseDurationMs + (Date.now() - startedAt) : baseDurationMs;
      emit({ status: 'stopped', durationMs: finalMs, amplitude: 0 });
      const uri = await resolveFixtureUri();
      // Always report the canned duration so downstream code (queue +
      // aggregator) sees the same value the asset actually contains.
      return {
        uri,
        mimeType: 'audio/m4a',
        sizeBytes: FIXTURE_SIZE_BYTES,
        durationSec: FIXTURE_DURATION_SEC,
      };
    },
    async cancel() {
      clearTimer();
      baseDurationMs = 0;
      emit({ status: 'idle', durationMs: 0, amplitude: 0, error: undefined });
    },
    release() {
      clearTimer();
      listeners.clear();
    },
  };
}

export const fixtureRecorderFactory: RecorderFactory = {
  name: 'fixture',
  async getPermission(): Promise<PermissionState> {
    return 'granted';
  },
  async requestPermission(): Promise<PermissionState> {
    return 'granted';
  },
  create: createFixtureHandle,
};
