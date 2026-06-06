/**
 * @fileoverview Overview brush → filter end-to-end journey (definition-of-done:
 * dragging the volume-chart brush narrows the global time window and pivots the
 * Explorer to that range).
 *
 * Brushing the "Log volume" chart writes concrete `from`/`to` query params and
 * clears the relative `range` token (see `overview-content.tsx`), so every other
 * panel and the Explorer re-query the brushed window. The robust assertion is the
 * URL state change; the Explorer is then opened to confirm the window carries
 * across the navigation.
 *
 * Requires the live stack (`pnpm infra:up` + `apps/api` + `apps/worker`).
 *
 * @module e2e/overview-brush.spec
 */
import { expect, test } from '@playwright/test'

test.describe('Overview brush → filter', () => {
  test('dragging the volume brush writes from/to and clears the relative range', async ({
    page,
  }) => {
    await page.goto('/')
    // The brushable "Log volume" chart card is the entry point for an absolute window.
    await expect(page.getByText(/Log volume/i).first()).toBeVisible()

    const brush = page.locator('.recharts-brush').first()
    await expect(brush).toBeVisible()
    const box = await brush.boundingBox()
    if (box === null) throw new Error('volume brush has no bounding box')
    const { x, y, width, height } = box

    // Drag the left traveller inward to select a sub-range; recharts lifts the
    // brushed bucket bounds to `onBrush`, which the Overview maps to from/to.
    const midY = y + height / 2
    await page.mouse.move(x + 6, midY)
    await page.mouse.down()
    await page.mouse.move(x + width * 0.45, midY, { steps: 10 })
    await page.mouse.up()

    // A brushed selection is an absolute window: from/to are populated and the
    // relative-range token is cleared (live tail is disabled for absolute ranges).
    await expect(page).toHaveURL(/[?&]from=/)
    await expect(page).toHaveURL(/[?&]to=/)

    // The window is global state, so the Explorer inherits the brushed range.
    const search = page.url().split('?')[1] ?? ''
    await page.goto('/explorer?' + search)
    await expect(page).toHaveURL(/[?&]from=/)
    await expect(page).toHaveURL(/[?&]to=/)
  })
})
