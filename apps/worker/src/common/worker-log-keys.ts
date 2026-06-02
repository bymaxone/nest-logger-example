/**
 * Canonical list of application log keys emitted by `apps/worker`.
 *
 * Every key follows the `MODULE_ACTION_RESULT` convention validated against
 * `LOG_KEYS_CONVENTION_REGEX`. None may equal a value in `RESERVED_LOG_KEYS`.
 *
 * @module
 */

/** Every application log key emitted by the worker. `MODULE_ACTION_RESULT` format. */
export const WORKER_LOG_KEYS = ['WORKER_TASK_RECEIVED', 'WORKER_TASK_PROCESSED'] as const

/** Union type of every worker application log key. */
export type WorkerLogKey = (typeof WORKER_LOG_KEYS)[number]
