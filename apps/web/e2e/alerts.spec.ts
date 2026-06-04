/**
 * @fileoverview Alerts & Incidents end-to-end journey (definition-of-done: an
 * alert fires an incident that can be acknowledged/snoozed/resolved with an
 * appended immutable timeline).
 *
 * Creates rules via presets, verifies the `DASHBOARD.md` §9 scoped-demo callout + ruler YAML,
 * test-fires a channel, and drives an incident through its lifecycle. The
 * heartbeat-absence preset breaches deterministically (the Postgres tier never
 * holds info-level `HTTP_REQUEST_SUCCESS`, so `count == 0` always fires), so the
 * cron opens an incident without needing to manufacture a traffic spike. Requires
 * the live stack (`pnpm infra:up` + `apps/api`).
 *
 * @module e2e/alerts.spec
 */
import { expect, test } from '@playwright/test'

test.describe('Alerts & Incidents', () => {
  test('shows the scoped-demo callout and a live ruler-YAML preview', async ({ page }) => {
    // Selecting a preset must render its compiled ruler YAML live — the editor mirrors the
    // backend rule shape (`count_over_time(...)` query + `severity` label) so operators preview
    // exactly what gets persisted.
    await page.goto('/alerts?role=admin')
    await expect(page.getByText('Scoped demo of log-based alerting + on-call')).toBeVisible()
    await page.getByRole('button', { name: 'Error spike' }).click()
    await expect(page.getByText('count_over_time(')).toBeVisible()
    await expect(page.getByText('severity: critical')).toBeVisible()
  })

  test('creating a rule from a preset adds it to the rule list', async ({ page }) => {
    // Creating a rule from a preset must persist it and surface it in the rule list — the
    // create round-trip is the invariant (preset → POST → rule appears), not just the UI form.
    await page.goto('/alerts?role=admin')
    await page.getByRole('button', { name: 'Any FATAL' }).click()
    await page.getByRole('button', { name: 'Create rule' }).click()
    await expect(page.getByText('Any fatal log').first()).toBeVisible({ timeout: 15_000 })
  })

  test('a channel can be test-fired', async ({ page }) => {
    // Each notification channel must be test-firable on demand — pressing "Send test" dispatches
    // a delivery and confirms it, proving channel wiring works before a real incident relies on it.
    await page.goto('/alerts?role=admin')
    const sendTest = page.getByRole('button', { name: 'Send test' }).first()
    await expect(sendTest).toBeVisible({ timeout: 15_000 })
    await sendTest.click()
    await expect(page.getByText(/Test delivery dispatched/)).toBeVisible()
  })

  test('an absence rule fires an incident that can be acknowledged and resolved', async ({
    page,
  }) => {
    // Full incident lifecycle: an absence rule that always breaches must open an incident the
    // operator can acknowledge then resolve, with each transition recorded on the immutable
    // timeline — this protects the alert → incident → on-call response contract end to end.
    await page.goto('/alerts?role=admin')
    // Heartbeat-absence breaches every cron tick (no info-tier rows in Postgres).
    await page.getByRole('button', { name: 'Heartbeat / absence' }).click()
    await page.getByRole('button', { name: 'Create rule' }).click()

    // The cron runs every 30s; poll the Incidents section until one opens.
    const acknowledge = page.getByRole('button', { name: 'Acknowledge' }).first()
    await expect(acknowledge).toBeEnabled({ timeout: 75_000 })
    await acknowledge.click()
    await expect(page.getByText('acknowledged').first()).toBeVisible({ timeout: 15_000 })

    // The immutable timeline records the system trigger + the operator acknowledge.
    await expect(page.getByText('acknowledge', { exact: true }).first()).toBeVisible()

    await page.getByRole('button', { name: 'Resolve' }).first().click()
    await expect(page.getByText('resolved').first()).toBeVisible({ timeout: 15_000 })
  })
})
