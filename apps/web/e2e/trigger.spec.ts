/**
 * @fileoverview Trigger Center end-to-end journey (definition-of-done: each
 * playground trigger produces its documented logKey, surfaced in the Explorer).
 *
 * Asserts the twelve-card grid renders, a fire echoes correlation ids and
 * deep-links into the Explorer pre-filtered to the produced request, and the
 * cross-service fire pivots by the shared traceId.
 *
 * The Explorer keyset table is the durable `warn`+ Postgres tier, so the
 * "row appears" proof uses an error trigger (`PAYMENT_CHARGE_FAILED`); an
 * info-only trigger (`ORDER_CREATE_SUCCESS`) is verified through its pivot
 * wiring (it lives in the Loki / live-tail `info`+ tier, not the durable table).
 *
 * Requires the live stack (`pnpm infra:up` + `apps/api` + `apps/worker`).
 *
 * @module e2e/trigger.spec
 */
import { expect, test } from '@playwright/test'

test.describe('Trigger Center → Explorer', () => {
  test('renders the twelve trigger cards', async ({ page }) => {
    await page.goto('/trigger')
    // The grid must expose exactly the twelve documented playground triggers — a drifted count
    // means a trigger was added/removed without updating the catalog the Explorer pivots rely on.
    await expect(page.getByRole('heading', { name: 'Trigger Center' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Fire' })).toHaveCount(12)
  })

  test('firing structured success pivots the Explorer to its requestId', async ({ page }) => {
    await page.goto('/trigger')
    const card = page.getByTestId('trigger-order')
    await card.getByRole('button', { name: 'Fire' }).click()

    // A successful fire reveals the result line (echoed requestId) + the Explorer link.
    await expect(card.getByText(/HTTP 2\d\d/)).toBeVisible()
    const link = card.getByRole('link', { name: /View in Explorer/ })
    await expect(link).toBeVisible()
    await link.click()
    // The pivot pre-applies the produced requestId (the info-tier row surfaces via live tail).
    await expect(page).toHaveURL(/\/explorer\?.*requestId=/)
  })

  test('firing the error path shows PAYMENT_CHARGE_FAILED in the Explorer table', async ({
    page,
  }) => {
    await page.goto('/trigger')
    const card = page.getByTestId('trigger-payment')
    await card.getByRole('button', { name: 'Fire' }).click()

    const link = card.getByRole('link', { name: /View in Explorer/ })
    await expect(link).toBeVisible()
    await link.click()

    await expect(page).toHaveURL(/\/explorer\?.*requestId=/)
    // Error-level rows land in the durable Postgres tier, so the keyset table shows them.
    // The table refetches when the relative-range window advances (~30s cadence), so allow
    // margin beyond it for the freshly-fired row to surface.
    await expect(page.getByText('PAYMENT_CHARGE_FAILED').first()).toBeVisible({ timeout: 50_000 })
  })

  test('cross-service fire pivots by the shared traceId', async ({ page }) => {
    await page.goto('/trigger')
    const card = page.getByTestId('trigger-dispatch')
    await card.getByRole('button', { name: 'Fire' }).click()

    const link = card.getByRole('link', { name: /View in Explorer/ })
    await expect(link).toBeVisible()
    await link.click()
    // A cross-service trigger spans multiple requestIds, so its Explorer pivot must key off the
    // shared traceId — proving correlation stitches the distributed call together, not per-request.
    await expect(page).toHaveURL(/traceId=/)
  })
})
