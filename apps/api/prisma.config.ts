/**
 * Prisma CLI configuration for `apps/api`.
 *
 * Provides the datasource URL, schema path, and migrations settings for all
 * Prisma CLI commands (`migrate dev`, `migrate deploy`, `db seed`, etc.).
 * The `PrismaClient` receives the connection via a driver adapter — see
 * `src/prisma/prisma.service.ts`.
 */
import { defineConfig, env } from 'prisma/config'

type Env = { DATABASE_URL: string }

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env<Env>('DATABASE_URL'),
  },
})
