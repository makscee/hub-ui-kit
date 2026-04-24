# @hub/ui-kit

Canonical design system for every hub frontend (voidnet portal, animaya dashboard, homelab admin, future apps). Source of truth alongside `knowledge/standards/ui-style-spec.md` and `knowledge/standards/frontend-stack-spec.md` (both locked).

This README is also the ingest target for Claude Design (`claude.ai/design`, Anthropic Labs research preview). Paths below are stable so the design-time UI can reliably surface tokens + components. When Claude Design produces a change, follow the round-trip in `knowledge/standards/claude-design-workflow.md`.

## Repo map

| Artifact | Path |
|---|---|
| Tokens (source, DTCG) | `knowledge/standards/tokens.json` |
| Tokens (generated CSS) | `workspace/ui-kit/registry/styles/globals.css` |
| Primitives | `workspace/ui-kit/registry/components/ui/` |
| Blocks | `workspace/ui-kit/registry/blocks/` |
| Helpers | `workspace/ui-kit/registry/lib/` |
| UI style spec (locked) | `knowledge/standards/ui-style-spec.md` |
| Frontend stack spec (locked) | `knowledge/standards/frontend-stack-spec.md` |
| VRT harness | `workspace/ui-kit/scripts/vrt.mjs` |
| VRT baselines | `workspace/ui-kit/vrt-baseline/` |

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

## Install

`@hub/ui-kit` is a Yarn/Bun workspace package. Install from the workspace root, never from a nested repo:

```bash
cd /Users/admin/hub/workspace
yarn install          # or: bun install
```

Yarn 1.22 requires the dep to be declared as `"@hub/ui-kit": "*"` in consumers, not `"workspace:*"` (tracked as HUB-1).

## Consume

### Install a primitive via shadcn local registry

```bash
bunx shadcn@latest add @hub/button
```

### Import directly (workspace symlink)

```tsx
import { Button } from "@hub/ui-kit/components/ui/button";
import { AlertCard } from "@hub/ui-kit/blocks/AlertCard";
```

### Tokens

Import the generated token CSS once in your app's `globals.css`, BEFORE the `tailwindcss` entry (Tailwind v4 reads `@theme` before compiling layers):

```css
@import '@hub/ui-kit/registry/styles/globals.css';
@import 'tailwindcss';
```

Regenerate the CSS after a token edit:

```bash
cd workspace/ui-kit
yarn build-tokens
```

## Adding a component

- **Primitive** — stateless, from shadcn or equivalent, no domain knowledge → `registry/components/ui/<name>.tsx` + add to `registry/components/ui/index.ts`.
- **Block** — uses multiple primitives + carries product-specific layout/behavior → `registry/blocks/<Name>.tsx` + add to `registry/blocks/index.ts`. Import primitives via `@hub/ui-kit/components/ui/<name>` (NOT relative paths — keep ingest-friendly).
- **Tokens only** — edit `knowledge/standards/tokens.json`; run `yarn build-tokens`; commit both files.
- Match `knowledge/standards/ui-style-spec.md` (spacing, radius, typography) — locked spec.

## Claude Design ingest

The design-time UI at `claude.ai/design` should surface:

1. The token file: `knowledge/standards/tokens.json`
2. The generated CSS: `workspace/ui-kit/registry/styles/globals.css`
3. Primitive source: `workspace/ui-kit/registry/components/ui/*.tsx`
4. Block source: `workspace/ui-kit/registry/blocks/*.tsx`

Workflow doc: `knowledge/standards/claude-design-workflow.md`.

## No versioning, no build step (D-22-05)

`@hub/ui-kit` is shared source — not a published package. No semver, no changelog. Breakage risk is managed by each consumer's test suite + the VRT harness here. If you make a breaking change to a primitive, grep consumers (`rg "from.*@hub/ui-kit"`) and update them in the same commit.
