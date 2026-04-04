/**
 * costumeParallelConfig.ts — Single canonical configuration surface for governed parallel generation.
 *
 * All concurrency limits, retry policies, and ordering rules live here.
 * No other file may define its own concurrency constants.
 *
 * v1.0.0
 */

// ── Concurrency Limits ──

export interface CostumeParallelLimits {
  /** Maximum global in-flight generation requests across all projects */
  globalMax: number;
  /** Maximum in-flight generation requests per project */
  perProjectMax: number;
  /** Maximum in-flight generation requests per character within a project */
  perCharacterMax: number;
  /** Maximum in-flight generation attempts per slot (prevents duplicate canonical writes) */
  perSlotMax: number;
}

export const DEFAULT_PARALLEL_LIMITS: Readonly<CostumeParallelLimits> = {
  globalMax: 8,
  perProjectMax: 6,
  perCharacterMax: 2,
  perSlotMax: 1,
};

// ── Retry Policy ──

export interface CostumeRetryPolicy {
  /** Max retries for a failed generation request (network/edge-function failures) */
  maxGenerationRetries: number;
  /** Backoff base in ms between retries */
  retryBackoffMs: number;
  /** Whether to retry when convergence score is below min_viable */
  retryOnLowScore: boolean;
}

export const DEFAULT_RETRY_POLICY: Readonly<CostumeRetryPolicy> = {
  maxGenerationRetries: 1,
  retryBackoffMs: 500,
  retryOnLowScore: false,
};

// ── Job Priority Ordering ──

/**
 * Deterministic ordering rules for the job queue.
 * Lower sort key = higher priority.
 * Order: character sort key → state priority → required before optional → attempt index
 */
export type JobSortField = 'character_key' | 'state_priority' | 'slot_required_first' | 'attempt_index';

export const DEFAULT_JOB_SORT_ORDER: readonly JobSortField[] = [
  'character_key',
  'state_priority',
  'slot_required_first',
  'attempt_index',
];

// ── Worker Pool Config ──

export interface WorkerPoolConfig {
  limits: CostumeParallelLimits;
  retryPolicy: CostumeRetryPolicy;
  /** Interval (ms) to poll for completed jobs and schedule new ones */
  schedulerTickMs: number;
  /** Whether to use the processing tracker for UI visibility */
  registerWithProcessingTracker: boolean;
}

export const DEFAULT_WORKER_POOL_CONFIG: Readonly<WorkerPoolConfig> = {
  limits: DEFAULT_PARALLEL_LIMITS,
  retryPolicy: DEFAULT_RETRY_POLICY,
  schedulerTickMs: 200,
  registerWithProcessingTracker: true,
};

/**
 * Resolve final config, merging any overrides with defaults.
 */
export function resolveWorkerPoolConfig(
  overrides?: Partial<WorkerPoolConfig>
): WorkerPoolConfig {
  return {
    ...DEFAULT_WORKER_POOL_CONFIG,
    ...overrides,
    limits: { ...DEFAULT_PARALLEL_LIMITS, ...(overrides?.limits) },
    retryPolicy: { ...DEFAULT_RETRY_POLICY, ...(overrides?.retryPolicy) },
  };
}
