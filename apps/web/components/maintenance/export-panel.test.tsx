/**
 * @fileoverview Component tests for {@link ExportPanel} — the viewer role gate,
 * the JSON/CSV export-and-download flow, the truncation banner, the busy-disabled
 * state, and the success / error toasts (including the non-Error reject path).
 *
 * The nuqs URL boundary (`@/lib/filters`) and the network boundary
 * (`@/lib/maintenance-api`) are mocked so each test drives one behaviour; the
 * browser download primitives (`URL.createObjectURL` / blob anchor) are stubbed
 * because jsdom does not implement them.
 *
 * @module components/maintenance/export-panel.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { LogQuery } from '@/lib/types'
import type { LogQueryState } from '@/lib/filters'
import type { ExportResult } from '@/lib/maintenance-api'

/** The query the mocked `useLogQuery` returns; reassigned per test before render. */
let currentQuery: LogQuery = { source: 'loki', role: 'admin' }

vi.mock('@/lib/filters', () => ({
  useLogQuery: (): LogQueryState =>
    ({
      query: currentQuery,
      setQuery: vi.fn(),
      live: false,
      isRelative: true,
    }) as unknown as LogQueryState,
}))

const exportLogsMock = vi.fn<(format: 'json' | 'csv', query: unknown) => Promise<ExportResult>>()

vi.mock('@/lib/maintenance-api', () => ({
  exportLogs: exportLogsMock,
}))

const toastSuccessMock = vi.fn<(message: string, options?: unknown) => void>()
const toastErrorMock = vi.fn<(message: string, options?: unknown) => void>()

vi.mock('sonner', () => ({
  toast: { success: toastSuccessMock, error: toastErrorMock },
}))

// Imported after the mocks so the component binds the mocked modules.
const { ExportPanel } = await import('./export-panel')

beforeEach(() => {
  currentQuery = { source: 'loki', role: 'admin' }
  exportLogsMock.mockReset()
  toastSuccessMock.mockReset()
  toastErrorMock.mockReset()
  // jsdom lacks the object-URL APIs the download helper calls.
  vi.stubGlobal(
    'URL',
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('ExportPanel', () => {
  /** A viewer cannot export — both buttons are disabled and the hint copy renders. */
  it('disables export and shows the hint for a viewer', () => {
    currentQuery = { source: 'loki', role: 'viewer' }
    render(<ExportPanel />)
    expect(screen.getByRole('button', { name: /Download JSON/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeDisabled()
    expect(screen.getByText('Viewers cannot export.')).toBeInTheDocument()
  })

  /**
   * The JSON download calls `exportLogs('json', …)`, saves the blob, and raises
   * the success toast — the happy path that also exercises `saveBlob`.
   */
  it('downloads JSON and toasts success', async () => {
    exportLogsMock.mockResolvedValue({ blob: new Blob(['[]']), truncated: false })
    const user = userEvent.setup()
    render(<ExportPanel />)

    await user.click(screen.getByRole('button', { name: /Download JSON/ }))

    await waitFor(() => expect(exportLogsMock).toHaveBeenCalledWith('json', currentQuery))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Exported JSON'))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1)
  })

  /** The CSV download targets the `csv` format and toasts the CSV success label. */
  it('downloads CSV and toasts success', async () => {
    exportLogsMock.mockResolvedValue({ blob: new Blob([',']), truncated: false })
    const user = userEvent.setup()
    render(<ExportPanel />)

    await user.click(screen.getByRole('button', { name: /Download CSV/ }))

    await waitFor(() => expect(exportLogsMock).toHaveBeenCalledWith('csv', currentQuery))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Exported CSV'))
  })

  /** When the server truncates the result set, the alert banner is revealed. */
  it('reveals the truncation banner when the export was truncated', async () => {
    exportLogsMock.mockResolvedValue({ blob: new Blob(['[]']), truncated: true })
    const user = userEvent.setup()
    render(<ExportPanel />)

    await user.click(screen.getByRole('button', { name: /Download JSON/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('the export was truncated')
    expect(alert).toHaveTextContent('100,000-row cap')
  })

  /** A reject with an Error surfaces the failure toast carrying the message. */
  it('toasts failure with the error message when export rejects with an Error', async () => {
    exportLogsMock.mockRejectedValue(new Error('403 Forbidden'))
    const user = userEvent.setup()
    render(<ExportPanel />)

    await user.click(screen.getByRole('button', { name: /Download JSON/ }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Export failed', {
        description: '403 Forbidden',
      }),
    )
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  /** A non-Error reject still toasts failure but with an undefined description. */
  it('toasts failure with no description when export rejects with a non-Error', async () => {
    exportLogsMock.mockRejectedValue('opaque failure')
    const user = userEvent.setup()
    render(<ExportPanel />)

    await user.click(screen.getByRole('button', { name: /Download JSON/ }))

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Export failed', { description: undefined }),
    )
  })

  /**
   * While an export is in flight both buttons are disabled (the `busy !== null`
   * branch); they re-enable once the promise settles in the `finally` block.
   */
  it('disables both buttons while an export is in flight, re-enabling when done', async () => {
    let resolveExport: ((value: ExportResult) => void) | undefined
    exportLogsMock.mockReturnValue(
      new Promise<ExportResult>((resolve) => {
        resolveExport = resolve
      }),
    )
    const user = userEvent.setup()
    render(<ExportPanel />)

    const jsonButton = screen.getByRole('button', { name: /Download JSON/ })
    const csvButton = screen.getByRole('button', { name: /Download CSV/ })
    await user.click(jsonButton)

    await waitFor(() => expect(jsonButton).toBeDisabled())
    expect(csvButton).toBeDisabled()

    resolveExport?.({ blob: new Blob(['[]']), truncated: false })

    await waitFor(() => expect(jsonButton).toBeEnabled())
    expect(csvButton).toBeEnabled()
  })
})
