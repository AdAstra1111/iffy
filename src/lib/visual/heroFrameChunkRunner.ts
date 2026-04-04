export type HeroFrameChunkFailureCode =
  | 'invoke_transport_failure'
  | 'timeout'
  | 'edge_http_error'
  | 'relay_error'
  | 'malformed_payload'
  | 'empty_result_set'
  | 'unknown_error';

export interface HeroFrameChunkFailure {
  code: HeroFrameChunkFailureCode;
  message: string;
  detail?: string;
  retryable: boolean;
  httpStatus: number | null;
}

export interface HeroFrameChunkResultRow {
  status?: string;
  image_id?: string;
  error?: string | null;
}

export interface HeroFrameChunkResponse {
  results: HeroFrameChunkResultRow[];
}

export interface HeroFrameChunkInvokeSuccess {
  ok: true;
  data: HeroFrameChunkResponse;
  attempts: number;
  elapsedMs: number;
  returnedCount: number;
}

export interface HeroFrameChunkInvokeFailure {
  ok: false;
  failure: HeroFrameChunkFailure;
  attempts: number;
  elapsedMs: number;
}

export type HeroFrameChunkInvokeResult = HeroFrameChunkInvokeSuccess | HeroFrameChunkInvokeFailure;

type InvokeResponse = { data: unknown; error: unknown | null };

type LoggerLike = Pick<Console, 'info' | 'warn' | 'error'>;

export interface HeroFrameSlotFailureState {
  status: 'pending' | 'generating' | 'ready' | 'failed' | 'deferred';
  error?: string;
  errorCode?: string;
  attempts?: number;
}

function sanitizeSnippet(raw: string, maxLen = 180): string {
  return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function getErrorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error && typeof (error as { name?: unknown }).name === 'string'
    ? (error as { name: string }).name
    : 'Error';
}

function getErrorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : '';
}

async function readErrorContext(context: unknown): Promise<{ httpStatus: number | null; detail?: string }> {
  if (!context || typeof context !== 'object') return { httpStatus: null };

  const maybeResponse = context as {
    status?: unknown;
    text?: () => Promise<string>;
    json?: () => Promise<unknown>;
    clone?: () => unknown;
  };
  const httpStatus = typeof maybeResponse.status === 'number' ? maybeResponse.status : null;

  try {
    if (typeof maybeResponse.clone === 'function') {
      const cloned = maybeResponse.clone() as { text?: () => Promise<string>; json?: () => Promise<unknown> };
      if (typeof cloned.text === 'function') {
        const text = await cloned.text();
        const snippet = sanitizeSnippet(text);
        return { httpStatus, detail: snippet || undefined };
      }
      if (typeof cloned.json === 'function') {
        const json = await cloned.json();
        return { httpStatus, detail: sanitizeSnippet(JSON.stringify(json)) || undefined };
      }
    }
  } catch {
    // ignore context parsing failures
  }

  return { httpStatus };
}

export async function classifyHeroFrameInvokeFailure(error: unknown): Promise<HeroFrameChunkFailure> {
  const name = getErrorName(error);
  const message = getErrorMessage(error);
  const context = typeof error === 'object' && error !== null && 'context' in error
    ? (error as { context?: unknown }).context
    : undefined;
  const { httpStatus, detail } = await readErrorContext(context);
  const normalized = `${name} ${message} ${detail ?? ''}`.toLowerCase();

  if (/timeout|timed out|abort|aborted/.test(normalized)) {
    return {
      code: 'timeout',
      message: 'Hero Frames request timed out',
      detail: detail || message || undefined,
      retryable: true,
      httpStatus,
    };
  }

  if (name === 'FunctionsFetchError' || /failed to send a request to the edge function|failed to fetch|networkerror|load failed/.test(normalized)) {
    return {
      code: 'invoke_transport_failure',
      message: 'Transport failure contacting Hero Frames generator',
      detail: detail || message || undefined,
      retryable: true,
      httpStatus,
    };
  }

  if (name === 'FunctionsRelayError' || /relay/.test(normalized)) {
    return {
      code: 'relay_error',
      message: 'Hero Frames relay error',
      detail: detail || message || undefined,
      retryable: true,
      httpStatus,
    };
  }

  if (name === 'FunctionsHttpError' || httpStatus !== null) {
    return {
      code: 'edge_http_error',
      message: httpStatus ? `Hero Frames generator returned HTTP ${httpStatus}` : 'Hero Frames generator returned an HTTP error',
      detail: detail || message || undefined,
      retryable: httpStatus == null || httpStatus >= 500 || httpStatus === 429,
      httpStatus,
    };
  }

  return {
    code: 'unknown_error',
    message: 'Unknown Hero Frames generator error',
    detail: detail || message || undefined,
    retryable: true,
    httpStatus,
  };
}

export function validateHeroFrameChunkPayload(data: unknown): HeroFrameChunkFailure | null {
  if (!data || typeof data !== 'object') {
    return {
      code: 'malformed_payload',
      message: 'Hero Frames generator returned malformed payload',
      detail: 'Payload was empty or not an object',
      retryable: false,
      httpStatus: null,
    };
  }

  const results = (data as { results?: unknown }).results;
  if (!Array.isArray(results)) {
    return {
      code: 'malformed_payload',
      message: 'Hero Frames generator returned malformed payload',
      detail: 'Payload.results was missing or not an array',
      retryable: false,
      httpStatus: null,
    };
  }

  if (results.length === 0) {
    return {
      code: 'empty_result_set',
      message: 'Hero Frames generator returned no results',
      detail: 'Payload.results was an empty array',
      retryable: true,
      httpStatus: null,
    };
  }

  return null;
}

export async function invokeHeroFrameChunkWithRetry(params: {
  chunkIndex: number;
  requestedCount: number;
  invoke: () => Promise<InvokeResponse>;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  logger?: LoggerLike;
}): Promise<HeroFrameChunkInvokeResult> {
  const {
    chunkIndex,
    requestedCount,
    invoke,
    maxAttempts = 3,
    baseDelayMs = 700,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    logger = console,
  } = params;

  const startedAt = Date.now();
  let lastFailure: HeroFrameChunkFailure | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStartedAt = Date.now();

    try {
      const { data, error } = await invoke();
      const elapsedMs = Date.now() - attemptStartedAt;

      if (error) {
        const failure = await classifyHeroFrameInvokeFailure(error);
        lastFailure = failure;

        const logPayload = {
          chunkIndex: chunkIndex + 1,
          requestedCount,
          attempt,
          elapsedMs,
          invokeStatus: 'error',
          failureCode: failure.code,
          failureReason: failure.message,
          detail: failure.detail,
          httpStatus: failure.httpStatus,
        };

        if (failure.retryable && attempt < maxAttempts) {
          logger.warn('[hero-frames][chunk] retrying failed invoke', logPayload);
          await sleep(baseDelayMs * attempt);
          continue;
        }

        logger.error('[hero-frames][chunk] invoke failed', logPayload);
        return {
          ok: false,
          failure,
          attempts: attempt,
          elapsedMs: Date.now() - startedAt,
        };
      }

      const payloadFailure = validateHeroFrameChunkPayload(data);
      if (payloadFailure) {
        lastFailure = payloadFailure;
        const logPayload = {
          chunkIndex: chunkIndex + 1,
          requestedCount,
          attempt,
          elapsedMs,
          invokeStatus: 'invalid_payload',
          failureCode: payloadFailure.code,
          failureReason: payloadFailure.message,
          detail: payloadFailure.detail,
        };

        if (payloadFailure.retryable && attempt < maxAttempts) {
          logger.warn('[hero-frames][chunk] retrying invalid payload', logPayload);
          await sleep(baseDelayMs * attempt);
          continue;
        }

        logger.error('[hero-frames][chunk] payload validation failed', logPayload);
        return {
          ok: false,
          failure: payloadFailure,
          attempts: attempt,
          elapsedMs: Date.now() - startedAt,
        };
      }

      const response = data as HeroFrameChunkResponse;
      logger.info('[hero-frames][chunk] invoke succeeded', {
        chunkIndex: chunkIndex + 1,
        requestedCount,
        attempt,
        elapsedMs,
        invokeStatus: 'ok',
        returnedCount: response.results.length,
      });

      return {
        ok: true,
        data: response,
        attempts: attempt,
        elapsedMs: Date.now() - startedAt,
        returnedCount: response.results.length,
      };
    } catch (error) {
      const failure = await classifyHeroFrameInvokeFailure(error);
      lastFailure = failure;
      const elapsedMs = Date.now() - attemptStartedAt;
      const logPayload = {
        chunkIndex: chunkIndex + 1,
        requestedCount,
        attempt,
        elapsedMs,
        invokeStatus: 'thrown',
        failureCode: failure.code,
        failureReason: failure.message,
        detail: failure.detail,
        httpStatus: failure.httpStatus,
      };

      if (failure.retryable && attempt < maxAttempts) {
        logger.warn('[hero-frames][chunk] retrying thrown invoke error', logPayload);
        await sleep(baseDelayMs * attempt);
        continue;
      }

      logger.error('[hero-frames][chunk] invoke threw error', logPayload);
      return {
        ok: false,
        failure,
        attempts: attempt,
        elapsedMs: Date.now() - startedAt,
      };
    }
  }

  return {
    ok: false,
    failure: lastFailure ?? {
      code: 'unknown_error',
      message: 'Unknown Hero Frames generator error',
      retryable: true,
      httpStatus: null,
    },
    attempts: maxAttempts,
    elapsedMs: Date.now() - startedAt,
  };
}

export function applyChunkFailureToSlots<T extends HeroFrameSlotFailureState>(
  slots: T[],
  startIndex: number,
  count: number,
  failure: Pick<HeroFrameChunkFailure, 'code' | 'message'>,
  attempts: number,
): T[] {
  const next = [...slots];
  for (let offset = 0; offset < count; offset++) {
    const slotIndex = startIndex + offset;
    if (slotIndex < next.length) {
      next[slotIndex] = {
        ...next[slotIndex],
        status: 'failed',
        error: failure.message,
        errorCode: failure.code,
        attempts,
      } as T;
    }
  }
  return next;
}