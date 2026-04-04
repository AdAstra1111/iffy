import { describe, expect, it, vi } from 'vitest';
import { applyChunkFailureToSlots, invokeHeroFrameChunkWithRetry } from '../heroFrameChunkRunner';

describe('heroFrameChunkRunner', () => {
  it('retries only the failed chunk invoke until it succeeds', async () => {
    let invokeCalls = 0;
    const sleepCalls: number[] = [];
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    const result = await invokeHeroFrameChunkWithRetry({
      chunkIndex: 1,
      requestedCount: 3,
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep: async (ms) => {
        sleepCalls.push(ms);
      },
      logger,
      invoke: async () => {
        invokeCalls += 1;
        if (invokeCalls < 3) {
          return {
            data: null,
            error: {
              name: 'FunctionsFetchError',
              message: 'Failed to send a request to the Edge Function',
            },
          };
        }

        return {
          data: {
            results: [
              { status: 'ready', image_id: 'img-1' },
              { status: 'ready', image_id: 'img-2' },
              { status: 'ready', image_id: 'img-3' },
            ],
          },
          error: null,
        };
      },
    });

    expect(invokeCalls).toBe(3);
    expect(sleepCalls).toEqual([100, 200]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.attempts).toBe(3);
      expect(result.returnedCount).toBe(3);
    }
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('preserves successful prior slots when a later chunk fails', () => {
    const initialSlots = [
      { status: 'ready' as const, imageId: 'img-1' },
      { status: 'ready' as const, imageId: 'img-2' },
      { status: 'ready' as const, imageId: 'img-3' },
      { status: 'generating' as const },
      { status: 'generating' as const },
      { status: 'generating' as const },
    ];

    const updated = applyChunkFailureToSlots(
      initialSlots,
      3,
      3,
      { code: 'timeout', message: 'Hero Frames request timed out' },
      2,
    );

    expect(updated.slice(0, 3)).toEqual(initialSlots.slice(0, 3));
    expect(updated.slice(3)).toEqual([
      { status: 'failed', error: 'Hero Frames request timed out', errorCode: 'timeout', attempts: 2 },
      { status: 'failed', error: 'Hero Frames request timed out', errorCode: 'timeout', attempts: 2 },
      { status: 'failed', error: 'Hero Frames request timed out', errorCode: 'timeout', attempts: 2 },
    ]);
  });

  it('stops immediately on malformed payload and surfaces the real cause', async () => {
    const result = await invokeHeroFrameChunkWithRetry({
      chunkIndex: 2,
      requestedCount: 3,
      maxAttempts: 3,
      baseDelayMs: 100,
      sleep: async () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      invoke: async () => ({
        data: { ok: true },
        error: null,
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      const failure = result.failure;
      expect(result.attempts).toBe(1);
      expect(failure.code).toBe('malformed_payload');
      expect(failure.message).toBe('Hero Frames generator returned malformed payload');
    }
  });

  it('stores exhausted retry failure reasons on the affected slots', async () => {
    const result = await invokeHeroFrameChunkWithRetry({
      chunkIndex: 3,
      requestedCount: 2,
      maxAttempts: 3,
      baseDelayMs: 50,
      sleep: async () => undefined,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      invoke: async () => ({
        data: null,
        error: {
          name: 'FunctionsFetchError',
          message: 'Failed to send a request to the Edge Function',
        },
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      const failure = result.failure;
      const failedSlots = applyChunkFailureToSlots(
        [
          { status: 'ready' as const, imageId: 'img-1' },
          { status: 'ready' as const, imageId: 'img-2' },
          { status: 'pending' as const },
          { status: 'pending' as const },
        ],
        2,
        2,
        failure,
        result.attempts,
      );

      expect(result.attempts).toBe(3);
      expect(failure.code).toBe('invoke_transport_failure');
      expect(failedSlots).toEqual([
        { status: 'ready', imageId: 'img-1' },
        { status: 'ready', imageId: 'img-2' },
        {
          status: 'failed',
          error: 'Transport failure contacting Hero Frames generator',
          errorCode: 'invoke_transport_failure',
          attempts: 3,
        },
        {
          status: 'failed',
          error: 'Transport failure contacting Hero Frames generator',
          errorCode: 'invoke_transport_failure',
          attempts: 3,
        },
      ]);
    }
  });
});