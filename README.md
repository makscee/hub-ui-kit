# hub-standards ui-kit

Shared UI primitives + design tokens consumed by every frontend in `workspace/` (animaya, voidnet, homelab apps/admin, etc.). Locked source of truth alongside `ui-style-spec.md` and `frontend-stack-spec.md`.

## Installation

`@hub/ui-kit` is a yarn/bun workspace package. It MUST be installed from the root workspace at `/Users/admin/hub/workspace/`, NOT from inside a nested workspace repo (`workspace/homelab/`, `workspace/voidnet/`, `workspace/animaya/`). Running `bun install` or `yarn install` from a nested repo will NOT create the `@hub/ui-kit` symlink in its `node_modules`.

```bash
cd /Users/admin/hub/workspace && yarn install   # or: bun install
```

## Usage

Import primitives via the `@hub/ui-kit` workspace package:

```ts
// Canonical form — resolves through the yarn/bun workspace symlink
import { Button } from "@hub/ui-kit/registry/primitives";
```

No build step. No package publish. Consumers import `.tsx` source directly and Vite/Next/tsc handle transpilation.

## Tokens

Each consumer's `app/globals.css` must import tokens **before** the `tailwindcss` entry so Tailwind v4 reads `@theme` before compiling layers:

```css
@import "@hub/ui-kit/registry/tokens/tokens.css";
@import "tailwindcss";
```

`tokens.css` contains:
- `@custom-variant dark`
- `@theme { … }` color + radius token mappings
- `:root { --background … --radius }` shadcn slate variables (dark-as-default per D-12-21)
- Tailwind v4 border-compat `@layer base` rule
- Global `* { @apply border-border }` + body background/foreground

## No versioning, no build step

Per **D-22-05**, ui-kit is shared **source** — not a published package. There is no semver, no changelog, no package.json. Breakage risk is managed by each consumer's test suite. If you make a breaking change to a primitive, search consumers (`rg "from.*ui-kit/primitives"`) and update them in the same commit.

## Layout

```
ui-kit/
├── tokens/        # Global CSS + @theme tokens (import once in consumer globals.css)
├── primitives/    # Leaf shadcn components (Button, Card, Input, Table, Badge, Dialog, Select, Toaster/sonner)
├── molecules/     # Homelab/animaya-specific composites (future — populated by downstream plans)
└── lib/           # cn() + any pure helpers shared across primitives
```

## Adding a component

- **Leaf primitive** (stateless, from shadcn or equivalent, no domain knowledge) → `primitives/<name>.tsx` and add to `primitives/index.ts` barrel.
- **Composite** (uses multiple primitives and carries product-specific layout/behavior) → `molecules/<name>.tsx`. Follow the relative import pattern: primitives via `../primitives`, utils via `../lib/utils`.
- Every primitive MUST import `cn` from `../lib/utils` (not `@/lib/utils`) so the file is consumer-agnostic.
- Match conventions in `ui-style-spec.md` (spacing, radius, typography) — that spec is locked.
