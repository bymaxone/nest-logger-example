/**
 * Demo seed script for `apps/api`.
 *
 * Populates two demo tenants with sample orders and payments so the dashboard has
 * realistic domain data to display. Clears existing `Payment` and `Order` rows before
 * inserting so the script is safe to re-run and always produces a consistent dataset.
 * `ApplicationLog` rows are produced organically by the running application, so the
 * redaction guarantee is exercised end-to-end.
 */
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

const url = process.env['DATABASE_URL']
if (!url) throw new Error('DATABASE_URL is required to run the seed script')

const adapter = new PrismaPg({ connectionString: url })
const prisma = new PrismaClient({ adapter })

const TENANTS = ['tenant-acme', 'tenant-globex'] as const

/**
 * Clear existing demo orders/payments, then insert fresh rows for each tenant.
 *
 * @returns A promise that resolves once all seed data is written.
 */
async function main(): Promise<void> {
  // Clear in dependency order: payments reference orders, so payments go first.
  await prisma.payment.deleteMany()
  await prisma.order.deleteMany()

  for (const tenantId of TENANTS) {
    for (let i = 0; i < 5; i++) {
      const order = await prisma.order.create({
        data: { tenantId, amount: 1000 * (i + 1), status: i % 2 ? 'paid' : 'pending' },
      })
      if (order.status === 'paid') {
        await prisma.payment.create({
          data: { orderId: order.id, amount: order.amount, status: 'succeeded' },
        })
      }
    }
  }
  console.log(`Seeded ${TENANTS.length} tenants with sample orders/payments.`)
}

main()
  .catch((err: unknown) => {
    // Redact connection strings from error messages before printing.
    const raw = err instanceof Error ? err.message : String(err)
    const sanitized = raw.replace(/postgr(?:es(?:ql)?):\/\/[^\s"']*/gi, '[redacted]')
    console.error('Seed failed:', sanitized)
    // Set exitCode instead of calling process.exit(1) so the .finally() cleanup
    // (prisma.$disconnect) can complete before the process terminates.
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
