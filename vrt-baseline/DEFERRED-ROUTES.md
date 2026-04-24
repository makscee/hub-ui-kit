# Deferred routes — operator follow-up

Routes NOT covered by the HUB-3 VRT baseline, and what fixture work each
would need before it can be captured. Generated from `vrt.config.json` §
`apps.<name>.deferred`.

Until these are wired, HUB-4 / HUB-5 pixel-diff coverage is limited to the
**public / unauthenticated** surface of each app. That's still enough to
catch token-unification regressions in headers, forms, buttons, and global
styles — which is where design-system drift shows up first.

## homelab/apps/admin

Session: next-auth v5 + GitHub OAuth, 8h JWT cookie
`__Secure-authjs.session-token` (prod) / `authjs.session-token` (dev).
Allowlist gate in `lib/auth-allowlist.server.ts`.

| Route | Blocker |
|---|---|
| `/` | requires GitHub OAuth session |
| `/voidnet/users` | requires auth |
| `/proxmox` | requires auth + proxmox service reachable |
| `/proxmox/[vmid]` | requires auth + proxmox service + vmid fixture |
| `/alerts` | requires auth + alert data |
| `/audit` | requires auth + populated `audit.db` |
| `/tokens` | requires auth |
| `/tokens/[id]` | requires auth + token-id fixture |

**Fixture path:** sign a JWT with `AUTH_SECRET` + a stub `login` claim that
passes the allowlist. Inject as `authjs.session-token` via Playwright
`context.addCookies(...)` before navigation.

## voidnet/apps/portal

Session: bespoke `voidnet_session` cookie (email OTP flow). Admin pages also
require Tailscale CGNAT IP via `x-tailscale-ip` header (middleware checks
`100.64.0.0/10`).

| Route | Blocker |
|---|---|
| `/join/verify` | requires pending invite row + email OTP state |
| `/dashboard` | requires authenticated `voidnet_session` cookie |
| `/topup` | requires auth + billing fixtures |
| `/profile` | requires auth |
| `/invites` | requires auth |
| `/username` | requires auth |
| `/services/vpn` | requires auth + `services_catalog` row |
| `/services/claude-key` | requires auth + `services_catalog` row |
| `/services/[slug]` | requires auth + dynamic slug fixture |
| `/admin` | requires Tailscale CGNAT header + admin role |
| `/admin/animaya-versions` | admin + fixture |
| `/admin/agents` | admin + fixture |
| `/admin/usage` | admin + fixture |
| `/admin/requests` | admin + fixture |
| `/admin/claude-key` | admin + fixture |
| `/admin/users` | admin + fixture |
| `/admin/peers` | admin + fixture |
| `/admin/servers` | admin + fixture |
| `/admin/credits` | admin + fixture |
| `/admin/services` | admin + fixture |
| `/admin/media` | admin + fixture |

**Fixture path:** stand up a disposable voidnet Postgres (docker-compose),
seed a test user + services_catalog, mint a `voidnet_session` cookie,
Playwright injects it. For `/admin/*`, set
`extraHTTPHeaders: { 'x-tailscale-ip': '100.100.0.1' }` in context options.

## animaya/dashboard

Session: next-auth v5 + Telegram credentials provider; signIn rejects any
`user.id` not matching `OWNER_TELEGRAM_ID`.

| Route | Blocker |
|---|---|
| `/` | requires owner Telegram auth |
| `/chat` | requires auth + `animaya-engine` running |
| `/bridge` | requires auth + voidnet HMAC pairing |
| `/modules` | requires auth + modules registry |
| `/modules/[name]` | requires auth + module fixture |

**Fixture path:** mint a JWT with `AUTH_SECRET` whose `telegramId` matches
`OWNER_TELEGRAM_ID`, inject as `authjs.session-token` cookie. Stub
`ANIMAYA_ENGINE_URL` with a static-response mock server for `/chat`.

## Suggested task for operator

Split into three follow-ups (one per app) once the token retrofit lands and
we know which authenticated routes actually changed. Filed as part of
HUB-3 Work Log; no separate backlog entry until then.
