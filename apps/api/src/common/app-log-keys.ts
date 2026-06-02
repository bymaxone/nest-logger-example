/**
 * Canonical list of application log keys emitted by the demo domain.
 *
 * Every key follows the `MODULE_ACTION_RESULT` convention validated against
 * `LOG_KEYS_CONVENTION_REGEX`. None may equal a value in `RESERVED_LOG_KEYS`.
 *
 * This file is the single source of truth for the `audit-log-keys.mjs`
 * CI gate and the PII-redaction test assertions.
 *
 * @module
 */

/** Every application log key emitted by the demo domain. `MODULE_ACTION_RESULT` format. */
export const APP_LOG_KEYS = [
  'ORDER_CREATE_SUCCESS',
  'ORDER_LOOKUP_SUCCESS',
  'ORDER_LOOKUP_MISS',
  'ORDER_SLOW_SUCCESS',
  'PAYMENT_CHARGE_ATTEMPT',
  'PAYMENT_CHARGE_FAILED',
  'USER_SIGNUP_ATTEMPT',
  'PII_NESTED_ATTEMPT',
  'PII_HEADERS_ECHO',
  'PII_HUGE_ATTEMPT',
  'DOWNSTREAM_DISPATCH_START',
  'DOWNSTREAM_DISPATCH_MANUAL',
  'DOWNSTREAM_DISPATCH_SUCCESS',
  'DOWNSTREAM_DISPATCH_DEGRADED',
  'TRIGGER_LEVEL_FIRED',
  'TRIGGER_FAULT_REQUESTED',
  'TRIGGER_BURST_TICK',
  'ADMIN_LOG_LEVEL_CHANGED',
  'DOMAIN_VALIDATION_FAILED',
] as const

/** Union type of every demo-domain application log key. */
export type AppLogKey = (typeof APP_LOG_KEYS)[number]
