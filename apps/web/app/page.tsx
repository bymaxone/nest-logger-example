/**
 * @fileoverview Overview page — placeholder rendered inside AppShell while the
 * real dashboard panels (health, RED metrics, breakdowns) are being built.
 *
 * @module app/page
 */

import Link from 'next/link'
import { AppShell } from '@/components/layout/app-shell'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

/**
 * Overview placeholder page. Real panels (charts, RED metrics, breakdowns)
 * are wired in the next iteration.
 *
 * @returns The overview card inside the AppShell.
 */
export default function OverviewPage() {
  return (
    <AppShell>
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4 text-sm text-muted-foreground">
          <p>Health, RED metrics, and breakdowns are on the way.</p>
          <p>No logs yet — fire one from the Trigger Center to see the dashboard come alive.</p>
          <Button asChild>
            <Link href="/trigger">Go to Trigger Center</Link>
          </Button>
        </CardContent>
      </Card>
    </AppShell>
  )
}
