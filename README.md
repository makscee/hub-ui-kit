# @hub/ui-kit

Canonical design system for every hub frontend (voidnet portal, animaya dashboard, homelab admin, future apps). Source of truth alongside hub's locked specs at `knowledge/standards/ui-style-spec.md` and `knowledge/standards/frontend-stack-spec.md` (in `github.com/makscee/hub`).

This README is also the ingest target for Claude Design (`claude.ai/design`, Anthropic Labs research preview). Paths below are stable so the design-time UI can reliably surface tokens + components.

History: extracted from `github.com/makscee/hub` (path `workspace/ui-kit/`) on 2026-04-25 as part of HUB-13. The yarn workspace root in hub still resolves `@hub/ui-kit` via a clone of this repo at `workspace/ui-kit/`.

## Repo map

| Artifact | Path |
|---|---|
| Tokens (source, DTCG) | `tokens/tokens.json` |
| Tokens (generated CSS) | `registry/styles/globals.css` |
| Primitives | `registry/components/ui/` |
| Blocks | `registry/blocks/` |
| Helpers | `registry/lib/` |
| UI style spec (locked) | hub: `knowledge/standards/ui-style-spec.md` |
| Frontend stack spec (locked) | hub: `knowledge/standards/frontend-stack-spec.md` |
| VRT harness | `scripts/vrt.mjs` |
| VRT baselines | `vrt-baseline/` |

## Component inventory

### Primitives (`registry/components/ui/`)

| Name | Purpose | Path |
|---|---|---|
| Badge | Status + label pill | `components/ui/badge.tsx` |
| Button | Primary interactive button (variants) | `components/ui/button.tsx` |
| Card | Surfaced content container | `components/ui/card.tsx` |
| Dialog | Radix-based modal shell | `components/ui/dialog.tsx` |
| Input | Text input field | `components/ui/input.tsx` |
| Select | Radix-based select dropdown | `components/ui/select.tsx` |
| Sonner (Toaster) | Toast notification host | `components/ui/sonner.tsx` |
| Table | Data-table primitive set | `components/ui/table.tsx` |

### Blocks (`registry/blocks/`)

| Name | Purpose | Path |
|---|---|---|
| AlertCard | Inline alert card with severity + action | `blocks/AlertCard.tsx` |
| AuditRow | Audit-log row for admin tables | `blocks/AuditRow.tsx` |
| HostTile | Infra host-status tile | `blocks/HostTile.tsx` |
| NavAlertBadge | Badge-variant for nav unread counts | `blocks/NavAlertBadge.tsx` |

## Install (current: yarn workspace via hub)

`@hub/ui-kit` is consumed today as a Yarn/Bun workspace package via hub's `workspace/package.json`. Clone hub, then this repo lives at `workspace/ui-kit/`:

```bash
cd /Users/admin/hub/workspace
yarn install          # or: bun install
```

Yarn 1.22 requires the dep to be declared as `"@hub/ui-kit": "*"` in consumers, not `"workspace:*"` (HUB-1).

A future migration (HUB-15/16/17) moves consumers to vendored shadcn copies and retires the hub workspace root (HUB-18).

## Consume

### Install a primitive via shadcn local registry

shadcn resolves `@hub/*` names from `registry.json` — pass `--registry` so it doesn't look at the public shadcn registry:

```bash
# Run from a consumer app directory; relative path resolves to the local clone at workspace/ui-kit/
bunx shadcn@latest add --registry ../../../../ui-kit/registry.json @hub/button
```

### Import directly (workspace symlink)

```tsx
import { Button } from "@hub/ui-kit/components/ui/button";
import { AlertCard } from "@hub/ui-kit/blocks/AlertCard";
```

### Tokens

Import `tailwindcss` first, then the generated token CSS. Tailwind v4 establishes its layer cascade on the first import, and subsequent `@theme` declarations merge into `@layer theme`. Reversing the order splits the tokens into a bare `:root` block, which compiles to a structurally different stylesheet (verified against voidnet portal, HUB-8).

```css
@import 'tailwindcss';
@import '@hub/ui-kit/registry/styles/globals.css';
```

Regenerate the CSS after a token edit:

```bash
# from this repo's root
yarn build-tokens
```

## Adding a component

- **Primitive** — stateless, from shadcn or equivalent, no domain knowledge → `registry/components/ui/<name>.tsx` + add to `registry/components/ui/index.ts`.
- **Block** — uses multiple primitives + carries product-specific layout/behavior → `registry/blocks/<Name>.tsx` + add to `registry/blocks/index.ts`. Import primitives via `@hub/ui-kit/components/ui/<name>` (NOT relative paths — keep ingest-friendly).
- **Tokens only** — edit `tokens/tokens.json`; run `yarn build-tokens`; commit both files.
- Match `knowledge/standards/ui-style-spec.md` in hub (spacing, radius, typography) — locked spec.

## Claude Design ingest

The design-time UI at `claude.ai/design` should surface:

1. The token file: `tokens/tokens.json`
2. The generated CSS: `registry/styles/globals.css`
3. Primitive source: `registry/components/ui/*.tsx`
4. Block source: `registry/blocks/*.tsx`

## No versioning, no build step (D-22-05)

`@hub/ui-kit` is shared source — not a published package. No semver, no changelog. Breakage risk is managed by each consumer's test suite + the VRT harness here. If you make a breaking change to a primitive, grep consumers (`rg "from.*@hub/ui-kit"` across hub's `workspace/`) and update them in the same commit.
