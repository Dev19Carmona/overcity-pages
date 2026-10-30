# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Next.js version warning

`AGENTS.md` states this is a Next.js version (16.x) with breaking changes relative to common training data. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices.

## Commands

```bash
npm run dev     # next dev (http://localhost:3000)
npm run build   # next build
npm run start   # next start (after build)
npm run lint    # eslint (flat config in eslint.config.mjs)
```

No test runner is configured.

## Architecture

Freshly bootstrapped `create-next-app` project (App Router, TypeScript, Tailwind v4, React 19). Currently only `app/layout.tsx` (root layout with Geist fonts via `next/font/google`), `app/page.tsx` (default template page), and `app/globals.css` exist.

Non-default setup worth knowing:

- `next.config.ts` enables `cacheComponents` and `partialPrefetching`, plus `experimental.agentFeedback`. `cacheComponents` changes the caching/rendering model, so consult the bundled docs before using data fetching, `"use cache"`, or dynamic APIs.
- Tailwind is wired through Turbopack: `turbopack.rules` in `next.config.ts` runs `*.css` through `@tailwindcss/turbopack`.
- The root layout uses the globally generated `LayoutProps<"/">` type (no import needed); route types come from `.next/types` / `.next/dev/types`, included in `tsconfig.json`.
- Path alias `@/*` maps to the repo root (not `src/`).
- `tsconfig` has `strict: true`.
