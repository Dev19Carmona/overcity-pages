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

`create-next-app` project (App Router, TypeScript, Tailwind v4, React 19) that serves the OverCity links page and an admin panel to edit it.

- `/` (`app/page.tsx`) renders `app/_components/site-view.tsx` with `getPublicContent()` (`"use cache"`, tag `content`). Falls back to `DEFAULT_CONTENT` in `lib/links.ts` if Redis is empty or fails.
- `/admin` (`app/admin/`) asks for a password and, with a session, shows the same page in edit mode (`app/admin/_components/editor.tsx`). `saveContent` (`app/admin/actions.ts`) validates, writes to Redis and calls `updateTag("content")`.
- `app/api/logo/route.ts` uploads and removes the logo in Vercel Blob.
- Social networks are a list (`socials`, max 8) chosen from the fixed catalog in `lib/socials.ts`, rendered as a horizontal row of icons (`app/_components/social-icon.tsx`). In the editor each icon is selected to edit its URL, reorder (← →) or remove it.
- Content lives in Redis under `overcity:content:v2`. If it does not exist, `overcity:content:v1` (the SPEC 02 shape with `instagramUrl`) is read and converted in memory; `v1` is never modified.
- `lib/content.ts` holds the `SiteContent` types, validation and Redis access; `lib/auth.ts` holds the signed session cookie and login rate limit; `lib/redis.ts` is the shared Upstash client.
- Content that changes over time (texts, links, images) must live in `SiteContent` and be editable from the panel (see `specs/02-admin-de-contenido.md`).

## Environment variables

Copy `.env.example` to `.env.local` for local development. In Vercel, `KV_REST_API_*` and `BLOB_READ_WRITE_TOKEN` come from the Upstash Redis and Blob integrations; `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` are added by hand in Settings → Environment Variables.

- `ADMIN_PASSWORD`: password for `/admin`.
- `ADMIN_SESSION_SECRET`: secret that signs the `overcity_admin` session cookie.
- `KV_REST_API_URL`, `KV_REST_API_TOKEN`: Upstash Redis (content and login attempt counter).
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob (logo).

Without Redis the public page still works with the defaults, but in production `/admin` refuses logins.

Non-default setup worth knowing:

- `next.config.ts` enables `cacheComponents` and `partialPrefetching`, plus `experimental.agentFeedback`. `cacheComponents` changes the caching/rendering model, so consult the bundled docs before using data fetching, `"use cache"`, or dynamic APIs.
- Tailwind is wired through Turbopack: `turbopack.rules` in `next.config.ts` runs `*.css` through `@tailwindcss/turbopack`.
- The root layout uses the globally generated `LayoutProps<"/">` type (no import needed); route types come from `.next/types` / `.next/dev/types`, included in `tsconfig.json`.
- Path alias `@/*` maps to the repo root (not `src/`).
- `tsconfig` has `strict: true`.
