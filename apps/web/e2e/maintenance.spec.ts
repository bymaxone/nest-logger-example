/**
 * @fileoverview Maintenance & Governance end-to-end journey (definition-of-done:
 * export downloads the filtered set; role gates actions; the scoped-demo callouts
 * render).
 *
 * Verifies the CSV export header is exactly the documented column order, that a
 * Viewer cannot export (the control is disabled), and that every scoped-demo
 * surface (retention, RBAC, export) renders its scoped-demo callout. Requires the
 * live stack (`pnpm infra:up` + `apps/api`).
 *
 * @module e2e/maintenance.spec
 */
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

/** The fixed CSV column order the export service emits. */
const CSV_HEADER = 'time,level,logKey,service,requestId,traceId,tenantId,msg'

test.describe('Maintenance & Governance', () => {
  test('CSV export downloads the documented column header', async ({ page }) => {
    // An operator's CSV export must emit the exact documented column order on the first row —
    // the header is a contract downstream tooling parses, so any drift in column names/order breaks it.
    await page.goto('/maintenance?role=operator')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download CSV' }).click()
    const file = await download
    const contents = readFileSync(await file.path(), 'utf8')
    expect(contents.split('\n')[0]?.trim()).toBe(CSV_HEADER)
  })

  test('a Viewer cannot export', async ({ page }) => {
    // RBAC gate: the Viewer role lacks export rights, so the Download CSV control must be disabled
    // and explain why — proves the UI enforces the role grant matrix, not just the API.
    await page.goto('/maintenance?role=viewer')
    await expect(page.getByRole('button', { name: 'Download CSV' })).toBeDisabled()
    await expect(page.getByText('Viewers cannot export.')).toBeVisible()
  })

  test('every scoped-demo surface renders its callout', async ({ page }) => {
    // Each governance surface (retention, export, RBAC) must render its scoped-demo callout so the
    // demo boundary is always disclosed — protects against a surface shipping without its disclaimer.
    await page.goto('/maintenance?role=admin')
    await expect(page.getByText('Scoped demo of tiered retention')).toBeVisible()
    await expect(page.getByText('Scoped demo of exporting filtered logs')).toBeVisible()
    await expect(page.getByText('Scoped demo of query-based RBAC')).toBeVisible()
  })

  test('the RBAC panel reflects the active role and the redaction hero is present', async ({
    page,
  }) => {
    // The RBAC panel must reflect the active role (admin column flagged "(active)") and the
    // redaction hero must be present — proves role context and the redact-at-source guarantee
    // are surfaced to the operator on the governance page.
    await page.goto('/maintenance?role=admin')
    await expect(page.getByText('Redacted at source — never stored raw')).toBeVisible()
    // The active-role marker highlights the admin column in the grant matrix.
    await expect(page.getByText('(active)')).toBeVisible()
  })
})
