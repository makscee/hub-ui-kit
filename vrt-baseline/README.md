# Visual Regression Baselines

Pixel baselines for `yarn vrt` (actually `bun run vrt` or `node scripts/vrt.mjs`).
Captured against the **pre-retrofit state** of three hub apps so HUB-4 (voidnet)
and HUB-5 (animaya) design-token unification can be reviewed mechanically.

## What these capture

Each PNG is a full-page screenshot of one route, rendered by that app's
`next dev` against the current hub `main` branch. Settings:

- Viewport: 1280x800, `deviceScaleFactor: 1`, `colorScheme: light`, `reducedMotion: reduce`.
- Animations/transitions/blink caret disabled via injected CSS (determinism).
- Waits for `networkidle` + 250 ms settle before screenshot.
- No authenticated routes — see `DEFERRED-ROUTES.md` for the list.

Baseline paths: `vrt-baseline/<app>/<slug>.png`.

## How to run

From `workspace/ui-kit/`:

```bash
bun run vrt           # diff current renders against baselines; exit 1 on fail
bun run vrt:update    # regenerate baselines from current renders (after expected change)
bun run vrt:dry       # just list routes that would be captured, no server boots
node scripts/vrt.mjs --app voidnet-portal   # one app only
```

Requires Chromium in `~/Library/Caches/ms-playwright/` (installed via
`bunx playwright install chromium`).

## When to update baselines

1. After an **expected** visual change is reviewed + approved by an operator
   (e.g. HUB-4/5 land their token retrofit and the new pixels are correct).
2. Run `bun run vrt:update` on a clean branch, commit the resulting
   `vrt-baseline/**` PNGs in the same change set as the code.
3. Note the reason in the commit message.

## Threshold tuning

`vrt.config.json` → `defaults.diffThreshold` is the % of pixels allowed to
differ before a route fails. Default `0.1%` (1 in 1000 pixels). Per-route
overrides via `routes[].diffThreshold`:

```json
{ "slug": "landing", "path": "/", "diffThreshold": 0.5 }
```

`defaults.threshold` (default `0.001`) is the per-pixel colour tolerance
passed to pixelmatch. Raise this for fonts that subpixel-antialias slightly
differently between runs; lower for strict comparisons.

## Deferred routes

Not all app routes are captured here. Many require authenticated sessions,
database rows, or external services. See `DEFERRED-ROUTES.md` for the full
inventory and what fixture work would be needed to enable them.

## Artefacts

- `vrt-baseline/<app>/*.png` — committed, source of truth.
- `vrt-current/<app>/*.png` — gitignored, the most recent run.
- `vrt-diff/<app>/*.png` — gitignored, pixel diffs (red = mismatched pixels).

## How this integrates with HUB-4/5

1. Before HUB-4 work starts: baseline captured on current `main` (this commit).
2. HUB-4 retrofits voidnet to canonical `@hub/ui-kit` tokens.
3. `bun run vrt` on the HUB-4 branch will show pixel diffs — that is expected.
4. Reviewer inspects `vrt-diff/voidnet-portal/*.png`; confirms the change is
   intentional (e.g. unified border-radius, darker primary).
5. Reviewer runs `bun run vrt:update` and commits new baseline PNGs in the
   same branch that lands the retrofit.
6. Subsequent runs on the branch now pass, and any further drift is caught.

Same flow for HUB-5 / animaya.
