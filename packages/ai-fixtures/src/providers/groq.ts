/**
 * Groq provider adapter — transcription only (whisper-large-v3-turbo).
 *
 * Groq exposes an OpenAI-compatible REST surface at
 * `https://api.groq.com/openai/v1` — same `/audio/transcriptions`
 * multipart contract as OpenAI's Whisper endpoint. We use Groq because
 * `whisper-large-v3-turbo` is roughly an order of magnitude cheaper and
 * faster than OpenAI Whisper-1 with no quality regression on English
 * site-notes audio (see docs/v4/arch-ai-fixtures.md §Transcription).
 *
 * Chat throws `LiveAdapterMissingError` — chat goes through the
 * OpenAI adapter.
 *
 * No SDK dependency: we POST `multipart/form-data` via global `fetch`.
 * The audio is fetched from R2 first (the URL we receive is a signed
 * R2 URL, not a Groq URL) and forwarded as a file part — Groq does not
 * accept remote URLs for transcription, only inline file bytes.
 */
import {
  type AiProvider,
  type TranscribeRequest,
  type TranscribeResponse,
  LiveAdapterMissingError,
} from '../index.js';
import { AdapterError } from './error.js';

const DEFAULT_MODEL = 'whisper-large-v3-turbo';

export interface GroqAdapterConfig {
  apiKey: string;
  /** Override base URL — defaults to `https://api.groq.com/openai/v1`. */
  baseUrl?: string;
  /** Override the Whisper model id (default `whisper-large-v3-turbo`). */
  model?: string;
  /** Override the global fetch (test-only). */
  fetchImpl?: typeof fetch;
}

interface TranscriptionResponse {
  text?: string;
  duration?: number;
}

export function createGroqProvider(cfg: GroqAdapterConfig): AiProvider {
  const baseUrl = (cfg.baseUrl ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
  const model = cfg.model ?? DEFAULT_MODEL;
  const fetchFn = cfg.fetchImpl ?? fetch;

  return {
    vendor: 'groq',
    chat() {
      throw new LiveAdapterMissingError('groq', 'chat');
    },
    async transcribe(req: TranscribeRequest): Promise<TranscribeResponse> {
      // Pull audio bytes from the signed R2 URL the caller supplied.
      // We need the bytes inline — Groq's REST API doesn't fetch URLs.
      let audioRes: Response;
      try {
        audioRes = await fetchFn(req.audioUrl);
      } catch (err) {
        throw new AdapterError('groq', 'failed to fetch audio source', err);
      }
      if (!audioRes.ok) {
        throw new AdapterError(
          'groq',
          `audio source HTTP ${audioRes.status}`,
          req.audioUrl,
        );
      }
      const audioBlob = await audioRes.blob();

      // `file` is required and MUST be a real File/Blob — Groq rejects
      // a bare Buffer without a filename. The extension just needs to
      // be plausible audio; the actual format is autodetected.
      const form = new FormData();
      form.append('file', audioBlob, 'audio.m4a');
      form.append('model', model);
      if (req.language) form.append('language', req.language);
      form.append('response_format', 'verbose_json');

      let res: Response;
      try {
        res = await fetchFn(`${baseUrl}/audio/transcriptions`, {
          method: 'POST',
          headers: { authorization: `Bearer ${cfg.apiKey}` },
          body: form,
        });
      } catch (err) {
        throw new AdapterError('groq', 'network error', err);
      }

      if (!res.ok) {
        const detail = await safeText(res);
        throw new AdapterError('groq', `HTTP ${res.status}`, detail);
      }

      let json: TranscriptionResponse;
      try {
        json = (await res.json()) as TranscriptionResponse;
      } catch (err) {
        throw new AdapterError('groq', 'malformed JSON response', err);
      }

      if (typeof json.text !== 'string') {
        throw new AdapterError('groq', 'missing `text` field in response');
      }

      return {
        text: json.text,
        durationSec: typeof json.duration === 'number' ? json.duration : undefined,
      };
    },
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '<no body>';
  }
}
