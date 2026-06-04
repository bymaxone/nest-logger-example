# Phase 11 — `apps/web` Skeleton + Design System — Tasks

> **Source:** [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system) §Phase 11
> **Total tasks:** 7
> **Progress:** 🟢 7 / 7 done (100%)
>
> **Status legend:** 🔴 Not Started · 🟡 In Progress · 🔵 In Review · 🟢 Done · ⚪ Blocked

## Task index

| ID    | Task                                                                          | Status | Priority | Size | Depends on   |
| ----- | ----------------------------------------------------------------------------- | ------ | -------- | ---- | ------------ |
| P11-1 | Scaffold `apps/web` (Next.js ^16.2 + React ^19.2 + Tailwind v4 + shadcn)      | 🟢     | High     | M    | Phase 0      |
| P11-2 | `app/globals.css` — verbatim v4 token block (DASHBOARD §15)                   | 🟢     | High     | S    | P11-1        |
| P11-3 | `app/layout.tsx` + `app/providers.tsx` — Geist, forced dark, NuqsAdapter      | 🟢     | High     | S    | P11-1, P11-2 |
| P11-4 | `lib/utils.ts` (`cn`) + scaffold the shadcn `new-york` component set          | 🟢     | High     | M    | P11-1, P11-2 |
| P11-5 | `components/layout/` — Topbar (64px) + Sidebar (250px) app shell + logger nav | 🟢     | High     | M    | P11-3, P11-4 |
| P11-6 | `lib/log-keys.ts` (`LOG_KEYS_CONVENTION_REGEX`) + `lib/severity.ts`           | 🟢     | High     | S    | P11-1, P11-4 |
| P11-7 | Verification gate — shell renders the orange/glass dark theme; `web build` ok | 🟢     | High     | S    | P11-1..P11-6 |

---

## P11-1 — Scaffold `apps/web` (Next.js ^16.2 + React ^19.2 + Tailwind v4 + shadcn `new-york`)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90 min–½ day)
- **Depends on:** `Phase 0`

### Description

Create the third workspace package — `apps/web` — the first-class observability dashboard. This task lays down only the **build toolchain and configuration shell** so later tasks (P11-2..P11-6) fill in tokens, layout, components, and lib helpers. The stack is pinned **1:1 to `nest-auth-example/apps/web`** so the two reference apps are visually one product: Next.js `^16.2` (App Router) + React `^19.2` + Tailwind CSS **v4** (`@tailwindcss/postcss` only — **no `autoprefixer`, no `postcss-import`**, v4 does both) + shadcn/ui `new-york`. The four design files (`components.json`, `postcss.config.mjs`, the optional `tailwind.config.ts`, and `app/globals.css`) are seeded here; `globals.css` content is finalised in P11-2. `apps/*` is already registered in `pnpm-workspace.yaml` (Phase 0), so pnpm picks the package up automatically.

### Acceptance Criteria

- [x] `apps/web/package.json` exists with `"name": "web"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=24" }` and scripts `dev`/`build`/`start`/`typecheck`/`lint`.
- [x] Declares `@bymax-one/nest-logger` via the local link `"link:../../../nest-logger"` (consumes the isomorphic `/shared` subpath in the browser; switch to `^0.1.0` after publish).
- [x] Runtime deps pinned to `nest-auth-example`: `next@^16.2`, `react@^19.2`, `react-dom@^19.2`, `geist@^1.7`, `lucide-react`, `sonner@^2`, `class-variance-authority`, `clsx`, `tailwind-merge`, plus the data libs `@tanstack/react-query`, `@tanstack/react-table`, `@tanstack/react-virtual`, `nuqs`, `@uiw/react-json-view`, `recharts`.
- [x] Dev deps: `tailwindcss@^4.2`, `@tailwindcss/postcss@^4.2`, `@types/node`, `@types/react`, `@types/react-dom`, `eslint-config-next@^16.2`.
- [x] **No** `next-themes`, **no** `autoprefixer`, **no** `postcss-import` anywhere in `apps/web`.
- [x] `apps/web/components.json` = shadcn `new-york` (`rsc: true`, `tsx: true`, `tailwind.baseColor: "neutral"`, `cssVariables: true`, `iconLibrary: "lucide"`, aliases `@/components · @/lib/utils · @/components/ui · @/lib · @/hooks`).
- [x] `apps/web/postcss.config.mjs` exports only `{ plugins: { '@tailwindcss/postcss': {} } }`.
- [x] `apps/web/tailwind.config.ts` (optional) holds only `darkMode: 'class'`, `content` globs, and `keyframes`/`animation` (`glow-float`, `glow-drift`, `fade-in`); it is bridged into `globals.css` via `@config` in P11-2.
- [x] `apps/web/tsconfig.json` extends `../../tsconfig.base.json`, adds `jsx: "preserve"`, `lib: ["ES2023","DOM","DOM.Iterable"]`, `paths: { "@/*": ["./*"] }`, and the `{ "name": "next" }` plugin; **no** `experimentalDecorators`/`emitDecoratorMetadata` (Next must not inherit them — see P0-3).
- [x] `apps/web/next.config.mjs` exists (minimal; ESM default export).

### Files to create / modify

- `apps/web/package.json` — web workspace manifest (local link + pinned stack).
- `apps/web/components.json` — shadcn `new-york` config.
- `apps/web/postcss.config.mjs` — `@tailwindcss/postcss` only.
- `apps/web/tailwind.config.ts` — optional v4 keyframes config (bridged in P11-2).
- `apps/web/tsconfig.json` — extends the base; Next/JSX/DOM options.
- `apps/web/next.config.mjs` — minimal Next config.

### Agent Execution Prompt

> Role: Senior TypeScript / Next.js engineer scaffolding a pnpm workspace package for a Next.js 16 + React 19 + Tailwind v4 app.
> Context: Repo `nest-logger-example` is the reference app for `@bymax-one/nest-logger@0.1.0` (see [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system) §Phase 11 + §2 Global Conventions, and [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 + §16). This is task P11-1. The canonical UI guide is [`../design_system.html`](../design_system.html) (open it in a browser; its §10 lists the recreation steps). The design system is **forced-dark, brand `#ff6224`, Geist + mono, shadcn `new-york`** and is copied **verbatim** from `~/Documents/MyApps/nest-auth-example/apps/web` so both example apps look identical. `apps/web` consumes only the isomorphic `@bymax-one/nest-logger/shared` subpath (types + `LOG_KEYS_CONVENTION_REGEX`) — **never** the server `.` subpath in the browser. `apps/*` is already registered in `pnpm-workspace.yaml` (Phase 0); the library is a sibling repo three levels up from `apps/web/`.
> Objective: Create the `apps/web` package manifest + the four design-system config files (`components.json`, `postcss.config.mjs`, `tailwind.config.ts`, `tsconfig.json`) + a minimal `next.config.mjs`. `globals.css`, `layout.tsx`, components, and lib helpers land in P11-2..P11-6.
> Steps:
>
> 1. Create `apps/web/package.json` (pin the stack to `nest-auth-example`; the library is a local link until published):
>    ```jsonc
>    {
>      "name": "web",
>      "version": "0.0.0",
>      "private": true,
>      "type": "module",
>      "engines": { "node": ">=24" },
>      "scripts": {
>        "dev": "next dev",
>        "build": "next build",
>        "start": "next start",
>        "typecheck": "tsc --noEmit",
>        "lint": "eslint app components lib",
>      },
>      "dependencies": {
>        // pnpm symlink to the sibling checkout (≈ `npm link`); switch to "^0.1.0" after publish.
>        // Browser code imports ONLY from "@bymax-one/nest-logger/shared".
>        "@bymax-one/nest-logger": "link:../../../nest-logger",
>        "@tanstack/react-query": "^5",
>        "@tanstack/react-table": "^8",
>        "@tanstack/react-virtual": "^3",
>        "@uiw/react-json-view": "^2",
>        "class-variance-authority": "^0.7.1",
>        "clsx": "^2.1.1",
>        "geist": "^1.7.0",
>        "lucide-react": "^1.8.0",
>        "next": "^16.2.4",
>        "nuqs": "^2",
>        "react": "^19.2.5",
>        "react-dom": "^19.2.5",
>        "recharts": "^3",
>        "sonner": "^2.0.7",
>        "tailwind-merge": "^3.5.0",
>      },
>      "devDependencies": {
>        "@tailwindcss/postcss": "^4.2.2",
>        "@types/node": "^25.6.0",
>        "@types/react": "^19.2.14",
>        "@types/react-dom": "^19.2.3",
>        "eslint-config-next": "^16.2.4",
>        "tailwindcss": "^4.2.2",
>      },
>    }
>    ```
> 2. Create `apps/web/components.json` (shadcn `new-york`, copied 1:1 from `nest-auth-example`):
>    ```json
>    {
>      "$schema": "https://ui.shadcn.com/schema.json",
>      "style": "new-york",
>      "rsc": true,
>      "tsx": true,
>      "tailwind": {
>        "config": "tailwind.config.ts",
>        "css": "app/globals.css",
>        "baseColor": "neutral",
>        "cssVariables": true,
>        "prefix": ""
>      },
>      "aliases": {
>        "components": "@/components",
>        "utils": "@/lib/utils",
>        "ui": "@/components/ui",
>        "lib": "@/lib",
>        "hooks": "@/hooks"
>      },
>      "iconLibrary": "lucide"
>    }
>    ```
> 3. Create `apps/web/postcss.config.mjs` — **only** the v4 plugin (NO `autoprefixer`; v4 auto-prefixes):
>
>    ```js
>    /** @type {import('postcss').Config} */
>    const config = {
>      plugins: {
>        '@tailwindcss/postcss': {},
>      },
>    }
>
>    export default config
>    ```
>
> 4. Create `apps/web/tailwind.config.ts` — optional in v4; keep it ONLY for `keyframes`/`animation` (bridged into `globals.css` via `@config` in P11-2). Brand/radius/font tokens are NOT put here (v4 does not auto-load this file — they live in the `@theme inline` block in P11-2):
>
>    ```ts
>    import type { Config } from 'tailwindcss'
>
>    const config: Config = {
>      darkMode: 'class' as const,
>      content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
>      theme: {
>        extend: {
>          keyframes: {
>            'glow-float': {
>              '0%, 100%': { transform: 'translate(0, 0)' },
>              '50%': { transform: 'translate(20px, -20px)' },
>            },
>            'glow-drift': {
>              '0%, 100%': { transform: 'translate(0, 0)' },
>              '50%': { transform: 'translate(-15px, 15px)' },
>            },
>            'fade-in': {
>              from: { opacity: '0', transform: 'translateY(16px)' },
>              to: { opacity: '1', transform: 'translateY(0)' },
>            },
>          },
>          animation: {
>            'glow-float': 'glow-float 10s ease-in-out infinite',
>            'glow-drift': 'glow-drift 12s ease-in-out infinite',
>            'fade-in': 'fade-in 0.5s ease-out forwards',
>          },
>        },
>      },
>    }
>
>    export default config
>    ```
>
> 5. Create `apps/web/tsconfig.json` (extends the base; adds Next/JSX/DOM — never the Nest decorator pair):
>    ```json
>    {
>      "extends": "../../tsconfig.base.json",
>      "compilerOptions": {
>        "noEmit": true,
>        "jsx": "preserve",
>        "module": "esnext",
>        "moduleResolution": "bundler",
>        "lib": ["ES2023", "DOM", "DOM.Iterable"],
>        "allowJs": true,
>        "paths": { "@/*": ["./*"] },
>        "plugins": [{ "name": "next" }]
>      },
>      "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
>      "exclude": ["node_modules"]
>    }
>    ```
> 6. Create `apps/web/next.config.mjs` (minimal ESM default export):
>
>    ```js
>    /** @type {import('next').NextConfig} */
>    const nextConfig = {}
>
>    export default nextConfig
>    ```
>
> 7. Run `pnpm install` from the repo root to link the workspace + materialise the lockfile. Do NOT create `app/globals.css`, `app/layout.tsx`, `lib/`, or `components/` yet — those are P11-2..P11-6.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (pnpm 10.8.0 workspaces `apps/*`, Node >=24, ESM everywhere, TS 5.9 strict).
> - Pin the stack to `nest-auth-example/apps/web` (Next `^16.2`, React `^19.2`, Tailwind `^4.2`). Do NOT add `next-themes`, `autoprefixer`, or `postcss-import` (per [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 and [`../design_system.html`](../design_system.html) §10).
> - Consume `@bymax-one/nest-logger` via `link:../../../nest-logger` (NOT a `workspace:` protocol — the library is a separate sibling repo). In the browser import ONLY from the `/shared` subpath.
> - Do NOT add `paths` aliases beyond `@/*`; do NOT add the Nest decorator options to this tsconfig (P0-3 keeps them out of the base for exactly this reason).
>   Verification:
> - `node -p "require('./apps/web/package.json').name"` — expected: `web`.
> - `node -p "require('./apps/web/package.json').dependencies['@bymax-one/nest-logger']"` — expected: `link:../../../nest-logger`.
> - `node -e "const p=require('./apps/web/package.json'); if (p.dependencies.autoprefixer||p.devDependencies.autoprefixer||p.dependencies['next-themes']) throw new Error('banned dep present')"` — expected: exits 0 (no banned deps).
> - `node -p "require('./apps/web/components.json').style"` — expected: `new-york`.
> - `node -e "const c=require('fs').readFileSync('apps/web/postcss.config.mjs','utf8'); if (c.includes('autoprefixer')) throw new Error('autoprefixer present')"` — expected: exits 0.
> - `pnpm --filter web exec tsc --noEmit` — expected: exits 0 (no app source yet → clean).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P11-1 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P11-2 — `app/globals.css` — Verbatim v4 Token Block (DASHBOARD §15)

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P11-1`

### Description

Author `apps/web/app/globals.css` — the **single source of design truth**. It reproduces the **verbatim token block from [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15** (the v4-corrected version, also mirrored in [`../design_system.html`](../design_system.html) §4): `@import 'tailwindcss'`, the class-based `@custom-variant dark`, `:root` (light) + `.dark` (the always-active near-black orange theme) at **top level** (NOT inside `@layer base` — this is the shadcn-v4 convention), an `@theme inline` block mapping the brand/orange `#ff6224` tokens + radius + fonts to Tailwind utilities, and a small `@layer base` for the global resets (border colour, body bg/fg, mono headings). The optional `tailwind.config.ts` (P11-1, keyframes only) is bridged in via `@config` at the top. **Note:** the live `nest-auth-example/apps/web/app/globals.css` still ships the older **v3-style** layout (tokens inside `@layer base`, no `@custom-variant`, no `@theme inline`); the DASHBOARD §15 audit fix supersedes it — author the **v4** block below, not a literal copy of that older file.

### Acceptance Criteria

- [x] `apps/web/app/globals.css` starts with `@import 'tailwindcss';`.
- [x] Bridges the optional keyframes config via `@config './tailwind.config.ts';` near the top.
- [x] Declares the class-based dark variant: `@custom-variant dark (&:is(.dark *));`.
- [x] `:root` (full light set) **and** `.dark` (full dark/live set) live at **top level**, NOT inside `@layer base`.
- [x] `--primary` and `--ring` = `20.5 90.2% 57.8%` (the `#ff6224` brand orange) in both `:root` and `.dark`; `--radius: 0.75rem`.
- [x] Dark glass tokens present: `--glass-bg`, `--glass-bg-raised`, `--glass-bg-hover`, `--glass-card-bg`, `--glass-border`, plus `--color-bg-primary: #0a0a0a`, `--shadow-primary: 0 0 24px rgba(255,98,36,0.4)`, `--color-secondary: #60a5fa`, `--color-accent: #f97316`.
- [x] An `@theme inline` block maps `--color-background/foreground/primary/primary-foreground/border/ring` to `hsl(var(--…))`, exposes the brand scale (`--color-brand-50 … --color-brand-500 #ff6224 … --color-brand-900`), the radius scale (`--radius-lg/md/sm`), and the fonts (`--font-sans` = `var(--font-geist-sans)…`, `--font-mono` = the Cascadia/Source-Code mono stack).
- [x] An `@layer base` sets `* { border-color: hsl(var(--border)); }`, `body` bg/fg + `font-family: var(--font-sans)`, and `h1..h6 { font-family: var(--font-mono); }`.
- [x] No `autoprefixer`-style vendor prefixing is hand-written (v4 handles it).

### Files to create / modify

- `apps/web/app/globals.css` — the verbatim v4 token block + `@theme inline` + base resets.

### Agent Execution Prompt

> Role: Senior front-end engineer fluent in Tailwind CSS v4 (CSS-first config) and shadcn/ui.
> Context: Task P11-2 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system) §Phase 11. The design tokens come **verbatim** from [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 (the v4-corrected block) and [`../design_system.html`](../design_system.html) §4/§10. The system is forced-dark (`.dark` is always applied to `<html>` in P11-3) with brand orange `#ff6224`. Tailwind v4 maps CSS variables to utilities via `@theme inline` — it does NOT auto-load `tailwind.config.ts`, so the keyframes file from P11-1 must be bridged with `@config`. Put `:root`/`.dark` at TOP LEVEL (shadcn-v4), declare the dark variant with `@custom-variant`, and DROP `autoprefixer`/`postcss-import`. ⚠️ The live `nest-auth-example/apps/web/app/globals.css` is still the older v3-style file (tokens inside `@layer base`, no `@theme inline`); the DASHBOARD §15 audit fix supersedes it — author the v4 block, do not copy that older file literally.
> Objective: Write `apps/web/app/globals.css` exactly as below.
> Steps:
>
> 1. Create `apps/web/app/globals.css`:
>
>    ```css
>    @import 'tailwindcss';
>
>    /* Optional JS config — keyframes/animation only — bridged into v4 (v4 does NOT auto-load it). */
>    @config './tailwind.config.ts';
>
>    /* v4 class-based dark variant (no next-themes — `dark` is forced on <html> in layout.tsx). */
>    @custom-variant dark (&:is(.dark *));
>
>    /* Tokens at TOP LEVEL (shadcn-v4 puts :root/.dark OUTSIDE @layer base). */
>    :root {
>      --background: 0 0% 100%;
>      --foreground: 20 14.3% 4.1%;
>      --card: 0 0% 100%;
>      --card-foreground: 20 14.3% 4.1%;
>      --popover: 0 0% 100%;
>      --popover-foreground: 20 14.3% 4.1%;
>      --primary: 20.5 90.2% 57.8%; /* #ff6224 — brand orange */
>      --primary-foreground: 60 9.1% 97.8%;
>      --secondary: 60 4.8% 95.9%;
>      --secondary-foreground: 24 9.8% 10%;
>      --muted: 60 4.8% 95.9%;
>      --muted-foreground: 25 5.3% 44.7%;
>      --accent: 60 4.8% 95.9%;
>      --accent-foreground: 24 9.8% 10%;
>      --destructive: 0 72.2% 50.6%;
>      --destructive-foreground: 60 9.1% 97.8%;
>      --border: 20 5.9% 90%;
>      --input: 20 5.9% 90%;
>      --ring: 20.5 90.2% 57.8%; /* matches --primary */
>      --radius: 0.75rem;
>
>      /* Brand design tokens (light) */
>      --color-bg-primary: #fafaf9;
>      --glass-bg: rgba(0, 0, 0, 0.03);
>      --glass-bg-raised: rgba(0, 0, 0, 0.05);
>      --glass-bg-hover: rgba(0, 0, 0, 0.07);
>      --glass-card-bg: rgba(0, 0, 0, 0.03);
>      --glass-border: rgba(0, 0, 0, 0.08);
>      --color-primary: #ff6224;
>      --color-secondary: #60a5fa;
>      --color-accent: #f97316;
>      --color-success: #22c55e;
>      --color-danger: #ef4444;
>      --shadow-primary: 0 0 24px rgba(255, 98, 36, 0.4);
>      --radius-sm: 8px;
>      --radius-md: 12px;
>      --radius-lg: 16px;
>      --radius-xl: 24px;
>      --radius-pill: 9999px;
>    }
>
>    .dark {
>      --background: 20 14.3% 4.1%;
>      --foreground: 60 9.1% 97.8%;
>      --card: 20 14.3% 4.1%;
>      --card-foreground: 60 9.1% 97.8%;
>      --popover: 20 14.3% 4.1%;
>      --popover-foreground: 60 9.1% 97.8%;
>      --primary: 20.5 90.2% 57.8%; /* #ff6224 — brand orange */
>      --primary-foreground: 20 14.3% 4.1%;
>      --secondary: 12 6.5% 15.1%;
>      --secondary-foreground: 60 9.1% 97.8%;
>      --muted: 12 6.5% 15.1%;
>      --muted-foreground: 24 5.4% 63.9%;
>      --accent: 12 6.5% 15.1%;
>      --accent-foreground: 60 9.1% 97.8%;
>      --destructive: 0 62.8% 30.6%;
>      --destructive-foreground: 60 9.1% 97.8%;
>      --border: 12 6.5% 15.1%;
>      --input: 12 6.5% 15.1%;
>      --ring: 20.5 90.2% 57.8%;
>
>      /* Brand design tokens (dark — the live/forced theme) */
>      --color-bg-primary: #0a0a0a;
>      --glass-bg: rgba(255, 255, 255, 0.05);
>      --glass-bg-raised: rgba(255, 255, 255, 0.08);
>      --glass-bg-hover: rgba(255, 255, 255, 0.1);
>      --glass-card-bg: rgba(255, 255, 255, 0.06);
>      --glass-border: rgba(255, 255, 255, 0.1);
>      --color-primary: #ff6224;
>      --color-secondary: #60a5fa;
>      --color-accent: #f97316;
>      --color-success: #22c55e;
>      --color-danger: #ef4444;
>      --shadow-primary: 0 0 24px rgba(255, 98, 36, 0.4);
>    }
>
>    /* Map tokens → Tailwind utilities so `bg-background`, `from-brand-500`, `rounded-lg`,
>       `font-mono` actually generate. In v4 this REPLACES tailwind.config theme.extend. */
>    @theme inline {
>      --color-background: hsl(var(--background));
>      --color-foreground: hsl(var(--foreground));
>      --color-card: hsl(var(--card));
>      --color-card-foreground: hsl(var(--card-foreground));
>      --color-popover: hsl(var(--popover));
>      --color-popover-foreground: hsl(var(--popover-foreground));
>      --color-primary: hsl(var(--primary));
>      --color-primary-foreground: hsl(var(--primary-foreground));
>      --color-secondary: hsl(var(--secondary));
>      --color-secondary-foreground: hsl(var(--secondary-foreground));
>      --color-muted: hsl(var(--muted));
>      --color-muted-foreground: hsl(var(--muted-foreground));
>      --color-accent: hsl(var(--accent));
>      --color-accent-foreground: hsl(var(--accent-foreground));
>      --color-destructive: hsl(var(--destructive));
>      --color-destructive-foreground: hsl(var(--destructive-foreground));
>      --color-border: hsl(var(--border));
>      --color-input: hsl(var(--input));
>      --color-ring: hsl(var(--ring));
>      --color-brand-50: #fff5f0;
>      --color-brand-100: #ffe8d6;
>      --color-brand-200: #ffd0ad;
>      --color-brand-300: #ffb07d;
>      --color-brand-400: #ff8748;
>      --color-brand-500: #ff6224;
>      --color-brand-600: #e5511b;
>      --color-brand-700: #c44113;
>      --color-brand-800: #9d320d;
>      --color-brand-900: #7a2609;
>      --radius-lg: var(--radius);
>      --radius-md: calc(var(--radius) - 2px);
>      --radius-sm: calc(var(--radius) - 4px);
>      --font-sans: var(--font-geist-sans), system-ui, sans-serif;
>      --font-mono:
>        ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'DejaVu Sans Mono',
>        monospace;
>    }
>
>    @layer base {
>      * {
>        border-color: hsl(var(--border));
>      }
>      html {
>        scroll-behavior: smooth;
>      }
>      body {
>        background-color: hsl(var(--background));
>        color: hsl(var(--foreground));
>        font-family: var(--font-sans);
>        -webkit-font-smoothing: antialiased;
>        -moz-osx-font-smoothing: grayscale;
>      }
>      h1,
>      h2,
>      h3,
>      h4,
>      h5,
>      h6 {
>        font-family: var(--font-mono);
>      }
>    }
>    ```
>
>    Constraints:
>
> - Reproduce the [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 token values **exactly** (`#ff6224` → `--primary`/`--ring` = `20.5 90.2% 57.8%`; `--shadow-primary: 0 0 24px rgba(255,98,36,0.4)`). If a value ever diverges, the `nest-auth-example` token VALUES win — but the v4 STRUCTURE (`@theme inline`, `@custom-variant`, top-level `:root`/`.dark`) is mandatory here.
> - Keep `:root`/`.dark` at top level (NOT in `@layer base`); declare the dark variant with `@custom-variant`; bridge keyframes with `@config`.
> - Do NOT hand-write vendor prefixes and do NOT add `autoprefixer` — Tailwind v4 prefixes automatically.
>   Verification:
> - `grep -c "@custom-variant dark" apps/web/app/globals.css` — expected: `1`.
> - `grep -c "@theme inline" apps/web/app/globals.css` — expected: `1`.
> - `grep "20.5 90.2% 57.8%" apps/web/app/globals.css` — expected: matches (brand orange on `--primary`/`--ring`).
> - `grep "@config './tailwind.config.ts';" apps/web/app/globals.css` — expected: match.
> - `pnpm --filter web exec tsc --noEmit` — expected: exits 0 (CSS does not affect tsc; confirms no regression).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P11-2 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P11-3 — `app/layout.tsx` + `app/providers.tsx` — Geist, Forced Dark, NuqsAdapter

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P11-1`, `P11-2`

### Description

Wire the root App-Router layout. `app/layout.tsx` is a **Server Component** (never `'use client'`) that loads `GeistSans` + `GeistMono`, forces the `dark` class on `<html>` (the design system is dark-only — **no `next-themes`**), imports `./globals.css`, and wraps `{children}` in `<NuqsAdapter>` (mandatory in nuqs v2 for the shareable-deep-link filters) → `<Providers>`. `app/providers.tsx` is the single `'use client'` boundary: a TanStack Query `QueryClientProvider` + the Sonner `<Toaster/>` (dark glass). This mirrors [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 (layout.tsx block) and [`../design_system.html`](../design_system.html) §10 step 3. The Sonner `<Toaster/>` is rendered by `Providers`; the actual `sonner` shadcn primitive component is scaffolded in P11-4 (forward-reference is fine — both land before P11-5 builds the shell).

### Acceptance Criteria

- [x] `apps/web/app/layout.tsx` is a Server Component (no `'use client'`).
- [x] Imports `GeistSans` from `geist/font/sans` and `GeistMono` from `geist/font/mono`.
- [x] `<html lang="en" className={\`${GeistSans.variable} ${GeistMono.variable} dark\`} suppressHydrationWarning>`— the`dark` class is hard-coded (forced dark).
- [x] Imports `./globals.css`.
- [x] Wraps children in `<NuqsAdapter>` (from `nuqs/adapters/next/app`) → `<Providers>`.
- [x] Exports `metadata` (title/description for the logger dashboard).
- [x] `apps/web/app/providers.tsx` begins with `'use client'`; renders `<QueryClientProvider client={...}>{children}<Toaster /></QueryClientProvider>` with a stable `QueryClient` (created once via `useState`).
- [x] The Sonner `<Toaster/>` uses `theme="dark"` + `position="bottom-right"` (glass styling lives in the P11-4 `sonner.tsx` primitive).
- [x] No `next-themes` import anywhere.

### Files to create / modify

- `apps/web/app/layout.tsx` — root Server Component layout (Geist + forced dark + adapters).
- `apps/web/app/providers.tsx` — `'use client'` QueryClientProvider + Sonner Toaster.

### Agent Execution Prompt

> Role: Senior Next.js 16 engineer (App Router, RSC boundaries).
> Context: Task P11-3 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system) §Phase 11. The layout block is specified in [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 and [`../design_system.html`](../design_system.html) §10 step 3. The design system is **forced dark** — hard-code `dark` on `<html>`; do NOT add `next-themes`. nuqs v2 made `<NuqsAdapter>` MANDATORY (without it every `useQueryState()` throws at runtime, breaking the shareable filters). Keep `layout.tsx` a Server Component and isolate the one `'use client'` boundary in `providers.tsx` (TanStack Query + Sonner Toaster). The `<Toaster/>` shadcn primitive is created in P11-4 — importing `@/components/ui/sonner` here is a fine forward reference.
> Objective: Create `app/layout.tsx` (server) + `app/providers.tsx` (client).
> Steps:
>
> 1. Create `apps/web/app/layout.tsx`:
>
>    ```tsx
>    import type { Metadata } from 'next'
>    import { GeistSans } from 'geist/font/sans'
>    import { GeistMono } from 'geist/font/mono'
>    import { NuqsAdapter } from 'nuqs/adapters/next/app' // REQUIRED in nuqs v2 (App Router)
>    import './globals.css'
>    import Providers from './providers'
>
>    export const metadata: Metadata = {
>      title: 'nest-logger-example — Log Observability',
>      description:
>        'A first-class log observability dashboard for @bymax-one/nest-logger — fire, stream, and explore logs.',
>    }
>
>    export default function RootLayout({ children }: { children: React.ReactNode }) {
>      return (
>        <html
>          lang="en"
>          className={`${GeistSans.variable} ${GeistMono.variable} dark`}
>          suppressHydrationWarning
>        >
>          <body>
>            {/* nuqs v2 made the adapter MANDATORY — without it every useQueryState() throws
>                at runtime, breaking the shareable-deep-link filters. */}
>            <NuqsAdapter>
>              <Providers>{children}</Providers>
>            </NuqsAdapter>
>          </body>
>        </html>
>      )
>    }
>    ```
>
> 2. Create `apps/web/app/providers.tsx` (the only `'use client'` boundary in the layout tree):
>
>    ```tsx
>    'use client'
>
>    import { type ReactNode, useState } from 'react'
>    import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
>    import { Toaster } from '@/components/ui/sonner'
>
>    interface ProvidersProps {
>      /** Page or nested layout content rendered inside the provider tree. */
>      children: ReactNode
>    }
>
>    /**
>     * Root client provider — TanStack Query cache + the Sonner toast portal.
>     *
>     * The QueryClient is created once per browser tab (lazy useState init) so it
>     * survives re-renders without being recreated.
>     */
>    export default function Providers({ children }: ProvidersProps) {
>      const [queryClient] = useState(
>        () =>
>          new QueryClient({
>            defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
>          }),
>      )
>
>      return (
>        <QueryClientProvider client={queryClient}>
>          {children}
>          <Toaster />
>        </QueryClientProvider>
>      )
>    }
>    ```
>
>    Constraints:
>
> - Follow [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 + [`../design_system.html`](../design_system.html) §10 step 3 exactly: Geist Sans/Mono, `dark` hard-coded on `<html>`, `<NuqsAdapter>` wrapping `<Providers>`.
> - `layout.tsx` MUST stay a Server Component (no `'use client'`); only `providers.tsx` is a client component (per the Next.js Bymax convention: `'use client'` only in leaves, never in layouts).
> - Do NOT add `next-themes` or any theme toggle — the system is dark-only.
> - The `@/components/ui/sonner` import is a forward reference to the P11-4 primitive; it resolves once P11-4 runs.
>   Verification:
> - `grep -L "use client" apps/web/app/layout.tsx` — expected: prints the path (layout.tsx is NOT a client component).
> - `grep -c "} dark\`" apps/web/app/layout.tsx`— expected:`1`(forced dark on`<html>`).
> - `grep -c "NuqsAdapter" apps/web/app/layout.tsx` — expected: `2` (import + usage).
> - `grep -c "next-themes" apps/web/app/layout.tsx apps/web/app/providers.tsx` — expected: `0`.
> - `pnpm --filter web exec tsc --noEmit` — expected: exits 0 once P11-4's `sonner.tsx` exists (run after P11-4 if needed).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P11-3 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P11-4 — `lib/utils.ts` (`cn`) + Scaffold the shadcn `new-york` Component Set

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90 min–½ day)
- **Depends on:** `P11-1`, `P11-2`

### Description

Add `lib/utils.ts` (the `cn()` Tailwind-merge helper every primitive needs) and scaffold the shadcn `new-york` component set listed in [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 (the superset of `nest-auth-example`'s 14). Two primitives are overridden to the house style: **Button** → pill + brand-gradient variants (`rounded-full`, `from-brand-500 to-brand-600`, glow on hover), **Card** → glass variant (`bg-(--glass-card-bg)`, `border-(--glass-border)`, `rounded-2xl`, `backdrop-blur-md`, mono `CardTitle`). The Sonner `Toaster` primitive uses the dark glass style. These primitives are the raw building blocks for Phases 12–13; this task only scaffolds + restyles them, it does not build pages.

### Acceptance Criteria

- [x] `apps/web/lib/utils.ts` exports `cn(...inputs: ClassValue[]): string` = `twMerge(clsx(inputs))`.
- [x] The full shadcn set exists under `apps/web/components/ui/`: `alert-dialog, avatar, badge, button, card, dialog, dropdown-menu, form, input, label, select, sonner, table, tabs, tooltip, popover, scroll-area, skeleton, command`.
- [x] `button.tsx` is overridden to the pill + brand-gradient CVA: base `rounded-full`; `default` = `bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm hover:shadow-(--shadow-primary) hover:scale-[1.02] active:scale-[0.98]`; sizes `h-10 px-6` / `sm h-8 px-4 text-xs` / `lg h-12 px-8` / `icon h-10 w-10`.
- [x] `card.tsx` is overridden to the glass variant: `border-(--glass-border) bg-(--glass-card-bg) rounded-2xl border shadow-sm backdrop-blur-md`; `CardTitle` = `font-mono text-xl font-bold`.
- [x] `badge.tsx` supports the brand pill (`bg-brand-500 text-white rounded-full`) used for `logKey` mono badges + level chips.
- [x] `sonner.tsx` Toaster uses `theme="dark"`, `position="bottom-right"`, glass background (`var(--glass-card-bg)` + `1px var(--glass-border)` + `backdropFilter: blur(16px)` + `font-mono`).
- [x] Every primitive imports `cn` from `@/lib/utils` and uses the `@/*` alias.
- [x] The required Radix peer deps for the chosen primitives are installed (e.g. `@radix-ui/react-*` for dialog/dropdown/avatar/label/tabs/tooltip/select/popover/scroll-area, `@radix-ui/react-slot`, plus `cmdk` for command and `react-hook-form` + `@hookform/resolvers` + `zod` for form).
- [x] `pnpm --filter web exec tsc --noEmit` passes (all primitives type-clean).

### Files to create / modify

- `apps/web/lib/utils.ts` — the `cn` helper.
- `apps/web/components/ui/*.tsx` — the shadcn `new-york` primitive set (19 components).
- `apps/web/package.json` — add the Radix / cmdk / form peer deps the primitives need.

### Agent Execution Prompt

> Role: Senior front-end engineer fluent in shadcn/ui (`new-york`) + Tailwind v4 + Radix.
> Context: Task P11-4 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system) §Phase 11. The component set + the Button/Card/Badge/Toaster overrides are specified in [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 ("Glass-morphism & component recipes" + "shadcn/ui set to scaffold") and [`../design_system.html`](../design_system.html) §10 step 4. `components.json` (P11-1) is already `new-york` with `cssVariables: true` + `iconLibrary: lucide`, and `app/globals.css` (P11-2) already exposes the brand/glass utilities (`from-brand-500`, `bg-(--glass-card-bg)`, `shadow-(--shadow-primary)`). Reuse `nest-auth-example/apps/web/components/ui/*` as the reference for the 14 it ships; add `popover, scroll-area, skeleton, command` from upstream shadcn to reach the §15 superset.
> Objective: Create `lib/utils.ts` + the full `components/ui/` primitive set, with Button/Card/Badge/Toaster restyled to the house glass+pill theme.
> Steps:
>
> 1. Create `apps/web/lib/utils.ts`:
>
>    ```ts
>    import { type ClassValue, clsx } from 'clsx'
>    import { twMerge } from 'tailwind-merge'
>
>    /**
>     * Merges Tailwind CSS class names, deduplicating conflicting utilities.
>     *
>     * @param inputs - Any number of class values (strings, objects, arrays).
>     * @returns Merged class string with Tailwind conflicts resolved.
>     */
>    export function cn(...inputs: ClassValue[]): string {
>      return twMerge(clsx(inputs))
>    }
>    ```
>
> 2. Scaffold the shadcn `new-york` set. Either run the CLI (`pnpm dlx shadcn@latest add alert-dialog avatar badge button card dialog dropdown-menu form input label select sonner table tabs tooltip popover scroll-area skeleton command`) or copy the matching files from `nest-auth-example/apps/web/components/ui/` for the 14 it already ships and add the remaining four (`popover, scroll-area, skeleton, command`). Install the Radix/cmdk/form peers the CLI reports (or that the copied files import).
> 3. Override `apps/web/components/ui/button.tsx` to the pill + brand-gradient CVA (base `rounded-full`, brand-gradient `default`, glow-on-hover):
>
>    ```tsx
>    import * as React from 'react'
>    import { Slot } from '@radix-ui/react-slot'
>    import { cva, type VariantProps } from 'class-variance-authority'
>    import { cn } from '@/lib/utils'
>
>    const buttonVariants = cva(
>      'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
>      {
>        variants: {
>          variant: {
>            default:
>              'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-sm hover:shadow-(--shadow-primary) hover:scale-[1.02] active:scale-[0.98]',
>            outline: 'border border-(--glass-border) bg-(--glass-bg) hover:bg-(--glass-bg-hover)',
>            ghost: 'hover:bg-(--glass-bg-hover)',
>            destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
>          },
>          size: {
>            default: 'h-10 px-6',
>            sm: 'h-8 px-4 text-xs',
>            lg: 'h-12 px-8',
>            icon: 'h-10 w-10',
>          },
>        },
>        defaultVariants: { variant: 'default', size: 'default' },
>      },
>    )
>
>    function Button({
>      className,
>      variant,
>      size,
>      asChild = false,
>      ...props
>    }: React.ComponentProps<'button'> &
>      VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
>      const Comp = asChild ? Slot : 'button'
>      return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />
>    }
>
>    export { Button, buttonVariants }
>    ```
>
> 4. Override `apps/web/components/ui/card.tsx` to the glass variant — root `border-(--glass-border) bg-(--glass-card-bg) rounded-2xl border shadow-sm backdrop-blur-md`, and `CardTitle` → `font-mono text-xl font-bold`.
> 5. Ensure `apps/web/components/ui/badge.tsx` exposes a brand pill variant (`bg-brand-500 text-white rounded-full`) for the `logKey` badge + level chips.
> 6. Override `apps/web/components/ui/sonner.tsx` Toaster to the dark glass style:
>
>    ```tsx
>    'use client'
>
>    import { Toaster as Sonner } from 'sonner'
>
>    type ToasterProps = React.ComponentProps<typeof Sonner>
>
>    function Toaster(props: ToasterProps) {
>      return (
>        <Sonner
>          theme="dark"
>          position="bottom-right"
>          toastOptions={{
>            style: {
>              background: 'var(--glass-card-bg)',
>              border: '1px solid var(--glass-border)',
>              backdropFilter: 'blur(16px)',
>              fontFamily: 'var(--font-mono)',
>            },
>          }}
>          {...props}
>        />
>      )
>    }
>
>    export { Toaster }
>    ```
>
>    Constraints:
>
> - Match [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 recipes verbatim (pill button, glass card, mono CardTitle, brand badge, glass dark Toaster). Use the v4 token utilities (`from-brand-500`, `bg-(--glass-card-bg)`, `shadow-(--shadow-primary)`) — these resolve because P11-2's `@theme inline` mapped them.
> - Every component imports `cn` from `@/lib/utils`; never hardcode `twMerge`/`clsx` inline in a component.
> - Scaffold the FULL 19-component superset; do not skip `popover`/`scroll-area`/`skeleton`/`command` (Phases 12–13 need them for the query bar, facet popovers, skeleton loaders, and the command palette).
> - This task does NOT build pages or the shell (that is P11-5) — primitives only.
>   Verification:
> - `cat apps/web/lib/utils.ts | grep -c "twMerge(clsx"` — expected: `1`.
> - `ls apps/web/components/ui | wc -l` — expected: `>= 19` (the full set).
> - `grep -c "rounded-full" apps/web/components/ui/button.tsx` — expected: `>= 1` (pill base).
> - `grep -c "from-brand-500" apps/web/components/ui/button.tsx` — expected: `>= 1` (brand gradient).
> - `grep -c "glass-card-bg" apps/web/components/ui/card.tsx` — expected: `>= 1` (glass card).
> - `pnpm --filter web exec tsc --noEmit` — expected: exits 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P11-4 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P11-5 — `components/layout/` — Topbar (64px) + Sidebar (250px) App Shell + Logger Nav

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** M (90 min–½ day)
- **Depends on:** `P11-3`, `P11-4`

### Description

Build the app shell — the chrome that makes `nest-logger-example` indistinguishable from `nest-auth-example`. Reuse `nest-auth-example`'s **Topbar + Sidebar Tailwind classes verbatim** (see [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 "App shell" + [`../design_system.html`](../design_system.html) §5/§10 step 5); change only the **wordmark** (`nest-logger-example`) and the **nav items** (the logger destinations). The Topbar is a fixed 64px dark-glass bar with the orange-bordered brand mark (3-line stacked-layers SVG, stroke `#ff6224`) + gradient mono wordmark. The Sidebar is a 250px glass rail whose **active** item is orange (`border-l-[#ff6224] bg-[rgba(255,98,36,0.1)] text-[#ff6224]`). An `AppShell` composes them around `{children}`. Since `apps/web` has no auth, drop the `useSession`-driven bits (user footer/avatar/tenant switcher) — render the static brand + nav only; the global controls (time/source/tenant/live) are wired in Phase 12.

### Acceptance Criteria

- [x] `apps/web/components/layout/topbar.tsx` is a fixed `h-16` (64px) header: `z-200 fixed left-0 right-0 top-0 … border-b border-[rgba(255,255,255,0.07)] bg-[rgba(10,10,10,0.85)] … backdrop-blur-md`.
- [x] Topbar left: orange-bordered brand badge (`rounded-lg border border-[rgba(255,98,36,0.4)] bg-[rgba(255,98,36,0.15)]`) holding the 3-line stacked-layers SVG (`stroke="#ff6224"`) + gradient mono wordmark `bg-linear-to-r from-[#ff6224] to-amber-200 bg-clip-text … text-transparent` reading **`nest-logger-example`**.
- [x] Topbar right: a hamburger `Button` (mobile only, `lg:hidden`) calling `onMenuOpen` (placeholder slot for the Phase-12 global controls).
- [x] `apps/web/components/layout/sidebar.tsx` is `w-[250px] … border-r border-[rgba(255,255,255,0.08)] bg-[rgba(12,12,12,0.98)]`, `lg:sticky lg:top-16 lg:h-[calc(100vh-64px)]`, mobile fixed overlay (`fixed left-0 top-16 …`) toggled by an `isOpen` prop.
- [x] Sidebar item base = `flex items-center gap-3 rounded-lg border-l-2 px-3 py-[10px] text-sm transition-all duration-150`; **active** = `border-l-[#ff6224] bg-[rgba(255,98,36,0.1)] font-semibold text-[#ff6224]`; inactive = `border-l-transparent text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.05)]`. Active detection via `usePathname()` (`exact` for `/`).
- [x] The logger nav items + lucide icons are exactly: Overview `/` `LayoutDashboard`, Explorer `/explorer` `Search`, Trigger Center `/trigger` `Zap`, Alerts `/alerts` `BellRing`, Maintenance `/maintenance` `Settings2`, Settings `/settings` `Cog`.
- [x] `apps/web/components/layout/app-shell.tsx` composes `<Topbar/>` + `<Sidebar/>` + `<main className="min-w-0 flex-1 px-6 py-8"><div className="mx-auto max-w-7xl">{children}</div></main>` inside `<div className="flex pt-16">…`.
- [x] Topbar/Sidebar/AppShell are `'use client'` (they use `usePathname`/state) and import `cn` from `@/lib/utils` + the `Button` primitive.

### Files to create / modify

- `apps/web/components/layout/topbar.tsx` — fixed 64px brand bar (logger wordmark).
- `apps/web/components/layout/sidebar.tsx` — 250px nav rail (orange active, logger nav).
- `apps/web/components/layout/app-shell.tsx` — composes topbar + sidebar + main.

### Agent Execution Prompt

> Role: Senior Next.js / front-end engineer recreating a shared design-system app shell.
> Context: Task P11-5 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system) §Phase 11. The shell is specified in [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 ("App shell — identical structure, logger nav" + the Topbar/Sidebar/Main class strings + the logger nav table) and [`../design_system.html`](../design_system.html) §5/§10 step 5. **Reuse `nest-auth-example/apps/web/components/layout/{topbar,sidebar}.tsx` classes VERBATIM** — change ONLY the wordmark (`nest-logger-example`) and the nav items (the logger destinations). `apps/web` has no auth, so REMOVE the `useSession`/`TenantSwitcher`/`SignOutButton`/user-footer/avatar bits — render the static brand + nav. The global controls (time/source/tenant/live) are added in Phase 12; leave a hamburger `onMenuOpen` slot for them now.
> Objective: Create `topbar.tsx`, `sidebar.tsx`, and `app-shell.tsx` under `components/layout/`.
> Steps:
>
> 1. Create `apps/web/components/layout/topbar.tsx` (verbatim chrome, logger wordmark, no auth):
>
>    ```tsx
>    'use client'
>
>    import { Menu } from 'lucide-react'
>    import { Button } from '@/components/ui/button'
>
>    interface TopbarProps {
>      /** Called when the hamburger button is pressed to toggle the sidebar. */
>      onMenuOpen: () => void
>    }
>
>    /** Fixed 64px dark-glass top bar — brand identity (left) + controls slot (right). */
>    export function Topbar({ onMenuOpen }: TopbarProps) {
>      return (
>        <header className="z-200 fixed left-0 right-0 top-0 flex h-16 items-center justify-between border-b border-[rgba(255,255,255,0.07)] bg-[rgba(10,10,10,0.85)] px-4 backdrop-blur-md lg:px-6">
>          {/* ── Left: brand ── */}
>          <div className="flex items-center gap-3">
>            <div
>              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(255,98,36,0.4)] bg-[rgba(255,98,36,0.15)]"
>              aria-hidden="true"
>            >
>              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
>                <path
>                  d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"
>                  stroke="#ff6224"
>                  strokeWidth="1.5"
>                  strokeLinecap="round"
>                  strokeLinejoin="round"
>                />
>              </svg>
>            </div>
>            <span className="bg-linear-to-r select-none from-[#ff6224] to-amber-200 bg-clip-text font-mono text-sm font-bold leading-tight text-transparent">
>              nest-logger-example
>            </span>
>          </div>
>
>          {/* ── Right: hamburger (mobile) + Phase-12 global-controls slot ── */}
>          <div className="flex items-center gap-2">
>            <Button
>              variant="ghost"
>              size="icon"
>              aria-label="Open navigation menu"
>              className="flex lg:hidden"
>              onClick={onMenuOpen}
>            >
>              <Menu className="h-4 w-4 text-[rgba(255,255,255,0.7)]" />
>            </Button>
>          </div>
>        </header>
>      )
>    }
>    ```
>
> 2. Create `apps/web/components/layout/sidebar.tsx` (verbatim rail classes, logger nav, orange active state, no auth/role gating):
>
>    ```tsx
>    'use client'
>
>    import Link from 'next/link'
>    import { usePathname } from 'next/navigation'
>    import { LayoutDashboard, Search, Zap, BellRing, Settings2, Cog } from 'lucide-react'
>    import { cn } from '@/lib/utils'
>
>    const NAV_ITEM_BASE_CLASS =
>      'flex items-center gap-3 rounded-lg border-l-2 px-3 py-[10px] text-sm transition-all duration-150'
>    const NAV_ITEM_ACTIVE_CLASS =
>      'border-l-[#ff6224] bg-[rgba(255,98,36,0.1)] font-semibold text-[#ff6224]'
>    const NAV_ITEM_INACTIVE_CLASS =
>      'border-l-transparent font-normal text-[rgba(255,255,255,0.55)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.8)]'
>    const ICON_BASE_CLASS = 'h-4 w-4 shrink-0'
>    const ICON_ACTIVE_CLASS = 'text-[#ff6224]'
>    const ICON_INACTIVE_CLASS = 'text-[rgba(255,255,255,0.4)]'
>    const NAV_BASE_CLASSES = [
>      'flex w-[250px] shrink-0 flex-col border-r border-[rgba(255,255,255,0.08)] bg-[rgba(12,12,12,0.98)]',
>      'z-100 fixed left-0 top-16 h-[calc(100vh-64px)] overflow-y-auto',
>      'lg:sticky lg:top-16 lg:h-[calc(100vh-64px)]',
>    ] as const
>
>    interface NavItem {
>      label: string
>      href: string
>      icon: React.ComponentType<{ className?: string }>
>      exact?: boolean
>    }
>
>    const NAV_ITEMS: NavItem[] = [
>      { label: 'Overview', href: '/', icon: LayoutDashboard, exact: true },
>      { label: 'Explorer', href: '/explorer', icon: Search },
>      { label: 'Trigger Center', href: '/trigger', icon: Zap },
>      { label: 'Alerts', href: '/alerts', icon: BellRing },
>      { label: 'Maintenance', href: '/maintenance', icon: Settings2 },
>      { label: 'Settings', href: '/settings', icon: Cog },
>    ]
>
>    interface SidebarProps {
>      /** Controls mobile overlay visibility. */
>      isOpen: boolean
>      /** Closes the mobile overlay on navigation. */
>      onNavClick?: () => void
>    }
>
>    /** 250px glass nav rail — orange active item, logger destinations. */
>    export function Sidebar({ isOpen, onNavClick }: SidebarProps) {
>      const pathname = usePathname()
>      return (
>        <nav
>          aria-label="Main navigation"
>          className={cn(...NAV_BASE_CLASSES, isOpen ? 'flex' : 'hidden lg:flex')}
>        >
>          <div className="flex h-full flex-col gap-0 px-4 py-6">
>            <div className="flex flex-1 flex-col gap-1">
>              {NAV_ITEMS.map((item) => {
>                const isActive = item.exact
>                  ? pathname === item.href
>                  : pathname.startsWith(item.href)
>                const Icon = item.icon
>                return (
>                  <Link
>                    key={item.href}
>                    href={item.href}
>                    onClick={onNavClick}
>                    className={cn(
>                      NAV_ITEM_BASE_CLASS,
>                      isActive ? NAV_ITEM_ACTIVE_CLASS : NAV_ITEM_INACTIVE_CLASS,
>                    )}
>                    aria-current={isActive ? 'page' : undefined}
>                  >
>                    <Icon
>                      className={cn(
>                        ICON_BASE_CLASS,
>                        isActive ? ICON_ACTIVE_CLASS : ICON_INACTIVE_CLASS,
>                      )}
>                    />
>                    {item.label}
>                  </Link>
>                )
>              })}
>            </div>
>          </div>
>        </nav>
>      )
>    }
>    ```
>
> 3. Create `apps/web/components/layout/app-shell.tsx` (composes the shell around page content; owns the mobile-open state):
>
>    ```tsx
>    'use client'
>
>    import { type ReactNode, useState } from 'react'
>    import { Topbar } from './topbar'
>    import { Sidebar } from './sidebar'
>
>    /** App chrome — fixed topbar + sticky sidebar + the page content well. */
>    export function AppShell({ children }: { children: ReactNode }) {
>      const [isOpen, setIsOpen] = useState(false)
>      return (
>        <>
>          <Topbar onMenuOpen={() => setIsOpen(true)} />
>          <div className="flex pt-16">
>            <Sidebar isOpen={isOpen} onNavClick={() => setIsOpen(false)} />
>            <main className="min-w-0 flex-1 px-6 py-8">
>              <div className="mx-auto max-w-7xl">{children}</div>
>            </main>
>          </div>
>        </>
>      )
>    }
>    ```
>
>    Constraints:
>
> - Reuse the `nest-auth-example` Topbar/Sidebar class strings VERBATIM (per [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 + [`../design_system.html`](../design_system.html) §10 step 5); change ONLY the wordmark + nav items. The active arm MUST keep `text-[#ff6224]` (brand orange) — that fragment is the visual signature.
> - Remove ALL auth coupling (`useSession`, `TenantSwitcher`, `SignOutButton`, user footer, avatar) — `apps/web` has no auth. Keep the hamburger `onMenuOpen` slot for the Phase-12 global controls.
> - Nav items + lucide icons MUST match the §15 logger nav table exactly (Overview/Explorer/Trigger Center/Alerts/Maintenance/Settings).
> - Use `max-w-7xl` for the content well (chart-heavy Overview/Explorer), per §15.
>   Verification:
> - `grep -c "h-16" apps/web/components/layout/topbar.tsx` — expected: `>= 1` (64px topbar).
> - `grep -c "nest-logger-example" apps/web/components/layout/topbar.tsx` — expected: `1` (wordmark swapped).
> - `grep -c "w-\[250px\]" apps/web/components/layout/sidebar.tsx` — expected: `>= 1` (250px rail).
> - `grep -c "border-l-\[#ff6224\]" apps/web/components/layout/sidebar.tsx` — expected: `>= 1` (orange active arm).
> - `grep -c "useSession\|TenantSwitcher\|SignOutButton" apps/web/components/layout/*.tsx` — expected: `0` (auth fully removed).
> - `pnpm --filter web exec tsc --noEmit` — expected: exits 0.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P11-5 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P11-6 — `lib/log-keys.ts` (`LOG_KEYS_CONVENTION_REGEX`) + `lib/severity.ts`

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P11-1`, `P11-4`

### Description

Add the two browser-safe lib helpers that consume the library's **isomorphic `/shared` subpath**. `lib/log-keys.ts` imports `LOG_KEYS_CONVENTION_REGEX` (and the `LogEntry` type) from `@bymax-one/nest-logger/shared` and exposes a small validator the Explorer's query bar uses to flag typo'd `logKey`s inline (DASHBOARD §6/§12 + §15 lib table). `lib/severity.ts` imports the `LogLevel` type from the same subpath and maps each level → `{ color, icon, label }` (accessible: colour **+** lucide icon **+** text), reused by log rows, the level donut, and toasts (DASHBOARD §15 "Severity mapping" + [`../design_system.html`](../design_system.html) §8/§10 step 6). **Critical:** import ONLY from the `/shared` subpath — the server `.` subpath pulls in Pino/Nest/Node built-ins and will break the browser bundle.

### Acceptance Criteria

- [x] `apps/web/lib/log-keys.ts` imports `LOG_KEYS_CONVENTION_REGEX` and `type LogEntry` from `@bymax-one/nest-logger/shared` (the `/shared` subpath, NOT the `.` root).
- [x] It exports `isValidLogKey(key: string): boolean` (= `LOG_KEYS_CONVENTION_REGEX.test(key)`, reset `lastIndex` if the regex is global) and re-exports the regex + `LogEntry` for query-bar use.
- [x] `apps/web/lib/severity.ts` imports `type LogLevel` from `@bymax-one/nest-logger/shared`.
- [x] It exports a `SEVERITY: Record<LogLevel, { color: string; icon: LucideIcon; label: string }>` map covering all six levels with the §15 palette: `trace` muted-blue, `debug` blue, `info` green/neutral, `warn` amber, `error` red, `fatal` purple — each with a lucide icon + label.
- [x] It exports a `getSeverity(level: LogLevel)` accessor returning the entry.
- [x] Neither file imports from `@bymax-one/nest-logger` (the bare `.` root) — only `/shared`.
- [x] `pnpm --filter web exec tsc --noEmit` passes (the `/shared` types resolve in the browser tsconfig).

### Files to create / modify

- `apps/web/lib/log-keys.ts` — `LOG_KEYS_CONVENTION_REGEX` import + `isValidLogKey`.
- `apps/web/lib/severity.ts` — `LogLevel` → `{ color, icon, label }` accessible map.

### Agent Execution Prompt

> Role: Senior TypeScript / front-end engineer wiring a library's isomorphic subpath into a Next.js client.
> Context: Task P11-6 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system) §Phase 11. `@bymax-one/nest-logger/shared` is the library's **isomorphic** subpath — the only browser-safe surface (types + `LOG_KEYS_CONVENTION_REGEX` + `LogLevel`/`LogEntry`). The server `.` subpath imports Pino/Nest/Node built-ins and MUST NEVER be imported in the browser. The query-bar validation + severity map are specified in [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 (lib table + "Severity mapping") and §6/§12, and [`../design_system.html`](../design_system.html) §8/§10 step 6. `lucide-react` (P11-1) supplies the icons.
> Objective: Create `lib/log-keys.ts` + `lib/severity.ts`, both importing ONLY from `@bymax-one/nest-logger/shared`.
> Steps:
>
> 1. Create `apps/web/lib/log-keys.ts`:
>
>    ```ts
>    // Isomorphic subpath ONLY — never import "@bymax-one/nest-logger" (the server `.` root) in the browser.
>    import { LOG_KEYS_CONVENTION_REGEX, type LogEntry } from '@bymax-one/nest-logger/shared'
>
>    export { LOG_KEYS_CONVENTION_REGEX }
>    export type { LogEntry }
>
>    /**
>     * Validates a `logKey` against the library convention (`MODULE_ACTION_RESULT`).
>     *
>     * Used by the Explorer query bar to flag a typo'd key inline. Resets the regex
>     * `lastIndex` defensively in case the exported pattern carries the global flag.
>     *
>     * @param key - The candidate log key (e.g. `ORDER_CREATE_SUCCESS`).
>     * @returns `true` when the key matches the convention.
>     */
>    export function isValidLogKey(key: string): boolean {
>      LOG_KEYS_CONVENTION_REGEX.lastIndex = 0
>      return LOG_KEYS_CONVENTION_REGEX.test(key)
>    }
>    ```
>
> 2. Create `apps/web/lib/severity.ts` (accessible — colour + icon + text — for all six levels):
>
>    ```ts
>    import {
>      type LucideIcon,
>      Bug,
>      Info,
>      TriangleAlert,
>      CircleX,
>      Skull,
>      Microscope,
>    } from 'lucide-react'
>    // Isomorphic subpath ONLY.
>    import { type LogLevel } from '@bymax-one/nest-logger/shared'
>
>    /** Visual descriptor for a log level — colour token + lucide icon + label. */
>    export interface SeverityMeta {
>      /** CSS colour (hex or token) for the left-border accent / pill / chart slice. */
>      color: string
>      /** Leading lucide icon (accessibility: never colour alone). */
>      icon: LucideIcon
>      /** Human label for the level pill. */
>      label: string
>    }
>
>    /** Level → accessible severity descriptor (DASHBOARD §15 palette). */
>    export const SEVERITY: Record<LogLevel, SeverityMeta> = {
>      trace: { color: '#93c5fd', icon: Microscope, label: 'Trace' },
>      debug: { color: '#60a5fa', icon: Bug, label: 'Debug' },
>      info: { color: '#22c55e', icon: Info, label: 'Info' },
>      warn: { color: '#f59e0b', icon: TriangleAlert, label: 'Warn' },
>      error: { color: '#ef4444', icon: CircleX, label: 'Error' },
>      fatal: { color: '#a855f7', icon: Skull, label: 'Fatal' },
>    }
>
>    /**
>     * Returns the accessible severity descriptor for a log level.
>     *
>     * @param level - The log level from `@bymax-one/nest-logger/shared`.
>     * @returns The `{ color, icon, label }` descriptor.
>     */
>    export function getSeverity(level: LogLevel): SeverityMeta {
>      return SEVERITY[level]
>    }
>    ```
>
>    Constraints:
>
> - Import ONLY from `@bymax-one/nest-logger/shared` (the isomorphic subpath). NEVER import the bare `@bymax-one/nest-logger` root in the browser — it would pull server-only deps into the client bundle and break the build.
> - Cover ALL SIX levels (`trace`/`debug`/`info`/`warn`/`error`/`fatal`) with the [`../DASHBOARD.md`](../DASHBOARD.md#15-frontend-tech-stack--design-system) §15 palette (trace muted-blue, debug blue, info green, warn amber, error red, fatal purple); severity MUST be colour **+** icon **+** text (accessibility).
> - If the exact `LogLevel` union differs from the six names above, align the map keys to the union the library exports (the union is the source of truth) — `tsc` will fail on a missing/extra key, which is the intended guardrail.
> - Keep these as pure browser-safe modules (no `'use client'` needed — they export values/types, not components).
>   Verification:
> - `grep -c "@bymax-one/nest-logger/shared" apps/web/lib/log-keys.ts apps/web/lib/severity.ts` — expected: `2` (one import each, both from `/shared`).
> - `grep -c "from '@bymax-one/nest-logger'" apps/web/lib/log-keys.ts apps/web/lib/severity.ts` — expected: `0` (the bare `.` root is never imported).
> - `grep -c "LOG_KEYS_CONVENTION_REGEX" apps/web/lib/log-keys.ts` — expected: `>= 2` (import + use/export).
> - `node -e "const c=require('fs').readFileSync('apps/web/lib/severity.ts','utf8'); ['trace','debug','info','warn','error','fatal'].forEach(l=>{if(!c.includes(l+':'))throw new Error('missing level '+l)})"` — expected: exits 0 (all six levels mapped).
> - `pnpm --filter web exec tsc --noEmit` — expected: exits 0 (the `/shared` types resolve).

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P11-6 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

If phase reaches 100%, switch its row status in `DEVELOPMENT_PLAN.md` to 🟢.

⚠️ Never mark done with failing verification.

---

## P11-7 — Verification Gate — Shell Renders the Orange/Glass Dark Theme; `web build` Succeeds

- **Status:** 🟢 Done
- **Priority:** High
- **Size:** S (30–90 min)
- **Depends on:** `P11-1`, `P11-2`, `P11-3`, `P11-4`, `P11-5`, `P11-6`

### Description

Phase 11 "Definition of done" gate per [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system): prove the `apps/web` skeleton renders the **orange/glass dark theme + brand mark + logger nav** and that **`pnpm --filter web build` succeeds**. Add a minimal `app/page.tsx` (Overview placeholder) wrapped in the `AppShell` so the shell is actually mounted and the production build has a route to compile. The acceptance bar (per [`../design_system.html`](../design_system.html) §10) is visual: a screenshot of `nest-logger-example` placed beside `nest-auth-example` must be indistinguishable in chrome (topbar, sidebar, cards, buttons, fonts, orange brand, glass) — only the content differs. Closes the phase.

### Acceptance Criteria

- [x] `apps/web/app/page.tsx` exists, wraps a small placeholder (e.g. a glass `Card` "Overview — coming in Phase 12" + an action-oriented empty state) in `<AppShell>`.
- [x] `pnpm --filter web build` exits 0 (Next 16 production build; no `next-themes`, no `autoprefixer` resolution errors).
- [x] `pnpm --filter web exec tsc --noEmit` exits 0.
- [x] `pnpm --filter web lint` exits 0.
- [x] `pnpm --filter web dev` boots and `GET /` renders the **forced-dark** shell: 64px topbar with the orange-bordered brand mark + `nest-logger-example` gradient wordmark, the 250px sidebar with the six logger nav items, and the orange active state on `/`.
- [x] The brand orange (`#ff6224`) is visibly applied (active nav arm + brand badge + button gradient) and the glass surfaces render (cards/sidebar/topbar backdrop-blur) — confirming P11-2's `@theme inline` tokens generated.
- [x] No console errors about a missing `<NuqsAdapter>` or an undefined CSS utility (`from-brand-500` / `bg-(--glass-card-bg)` resolve).

### Files to create / modify

- `apps/web/app/page.tsx` — Overview placeholder mounted in `AppShell` (gives the build a route + lets the shell render).

### Agent Execution Prompt

> Role: Senior Next.js engineer closing out a skeleton phase with a build + render gate.
> Context: Task P11-7 of [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#phase-11--appsweb-skeleton--design-system) §Phase 11. DoD: the shell renders the orange/glass dark theme + brand mark + logger nav, and `pnpm --filter web build` succeeds. The visual acceptance bar is [`../design_system.html`](../design_system.html) §10 — indistinguishable chrome next to `nest-auth-example`. This task adds the minimal `app/page.tsx` that mounts the `AppShell` (P11-5) so there is a route to build and a shell to see. Real Overview content lands in Phase 12.
> Objective: Add the Overview placeholder page, then run the full verification suite and close the phase.
> Steps:
>
> 1. Create `apps/web/app/page.tsx` (mount the shell + a glass placeholder with an action-oriented empty state, per [`../DASHBOARD.md`](../DASHBOARD.md#5-page--overview-health) §5/§9):
>
>    ```tsx
>    import { AppShell } from '@/components/layout/app-shell'
>    import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
>    import { Button } from '@/components/ui/button'
>
>    export default function OverviewPage() {
>      return (
>        <AppShell>
>          <Card>
>            <CardHeader>
>              <CardTitle>Overview</CardTitle>
>            </CardHeader>
>            <CardContent className="flex flex-col items-start gap-4 text-sm text-[rgba(255,255,255,0.6)]">
>              <p>Health, RED metrics, and breakdowns arrive in Phase 12.</p>
>              <p>
>                No logs yet — fire one from the Trigger Center to see the dashboard come alive.
>              </p>
>              <Button>Go to Trigger Center</Button>
>            </CardContent>
>          </Card>
>        </AppShell>
>      )
>    }
>    ```
>
> 2. Run the verification suite below. All must pass.
> 3. Start `pnpm --filter web dev`, open `http://localhost:3003/`, and confirm visually: forced-dark background, 64px topbar + orange brand mark + `nest-logger-example` gradient wordmark, 250px sidebar with the six logger nav items, orange active state on Overview, glass cards/buttons. Compare side-by-side with a `nest-auth-example` screenshot — the chrome must be indistinguishable.
> 4. If any check fails, fix it in the corresponding earlier task file (P11-1..P11-6), then return here. Do NOT silence a failure with `@ts-ignore`/`eslint-disable`/`--no-verify` or by lowering a threshold.
>    Constraints:
>
> - Follow [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#2-global-conventions) §2 (no shortcuts: no `@ts-ignore`, no `eslint-disable` to pass a gate, no `--no-verify`).
> - Keep `app/page.tsx` a thin placeholder — real Overview panels (charts, RED, breakdowns) are Phase 12; do NOT build them here.
> - The acceptance is BOTH `pnpm --filter web build` green AND the shell rendering the orange/glass dark theme + brand + nav.
>   Verification:
> - `pnpm --filter web exec tsc --noEmit` — expected: exit 0.
> - `pnpm --filter web lint` — expected: exit 0.
> - `pnpm --filter web build` — expected: exit 0 (Next 16 production build succeeds).
> - `pnpm --filter web dev` then `curl -sSf http://localhost:3003/ >/dev/null` — expected: 200 (the route renders); visually confirm the forced-dark orange/glass shell + brand + the six nav items.

### Completion Protocol

1. ✅ Edit this task's `Status` line → `🟢 Done`.
2. ✅ Tick every box in **Acceptance Criteria**.
3. ✅ Update this task's row in the **Task index**.
4. ✅ Increment the **Progress** counter in the file header.
5. ✅ Update the matching row in [`../DEVELOPMENT_PLAN.md`](../DEVELOPMENT_PLAN.md#progress-summary) (Done / Total, %, Status).
6. ✅ Recompute "Overall progress" in `DEVELOPMENT_PLAN.md` (sum / 133).
7. ✅ Append `- P11-7 ✅ YYYY-MM-DD — <one-line summary>` to **Completion log**.

When this task is 🟢, Phase 11 is 7/7 — switch the Phase 11 row in `DEVELOPMENT_PLAN.md` Progress Summary to 🟢 Done.

⚠️ Never mark done with failing verification.

---

## Completion log

_(Agents append one line per finished task, newest at the bottom.)_

- P11-1 ✅ 2026-06-03 — Scaffolded `apps/web` package manifest + 4 design-system config files + minimal `next.config.mjs`; `pnpm install` links the workspace.
- P11-2 ✅ 2026-06-03 — Authored `app/globals.css` with verbatim v4 token block: `@custom-variant dark`, `:root`/`.dark` at top level, `@theme inline` brand/glass scale, `@layer base` resets.
- P11-3 ✅ 2026-06-03 — Created `app/layout.tsx` (Geist + forced `dark` on `<html>` + `<NuqsAdapter>`) and `app/providers.tsx` (`'use client'` QueryClient + Sonner Toaster).
- P11-4 ✅ 2026-06-03 — Created `lib/utils.ts` (`cn`) + scaffolded 19-component shadcn `new-york` set with overridden Button (pill+gradient), Card (glass), Badge (brand pill), Toaster (dark glass), plus 4 new primitives (popover, scroll-area, skeleton, command).
- P11-5 ✅ 2026-06-03 — Built `components/layout/` app shell: fixed 64px Topbar (orange-bordered brand mark + gradient wordmark), 250px Sidebar (orange active arm + logger nav), and AppShell compositor.
- P11-6 ✅ 2026-06-03 — Added `lib/log-keys.ts` (`isValidLogKey` + re-exports) and `lib/severity.ts` (6-level SEVERITY map with colour+icon+label), both importing only from `@bymax-one/nest-logger/shared`.
- P11-7 ✅ 2026-06-03 — Added `app/page.tsx` Overview placeholder in AppShell; `tsc --noEmit`, `lint`, and `next build` all exit 0; dev server serves HTTP 200 on `/`.
