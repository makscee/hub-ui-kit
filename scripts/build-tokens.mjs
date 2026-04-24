#!/usr/bin/env node
/**
 * Deterministic DTCG -> globals.css generator.
 *
 * Source:  hub/knowledge/standards/tokens.json   (DTCG format)
 * Output:  workspace/ui-kit/registry/styles/globals.css
 *
 * Built on Style Dictionary v4 with the built-in `dtcg` preprocessor
 * (DTCG gotcha from HUB-1 spike: custom formats must dereference token.$value, not token.value).
 *
 * The generator preserves the shadcn/Tailwind-v4 token pattern already in use:
 *   - Raw HSL triples (no hsl() wrapper) land in `:root { --background: H S% L%; ... }`
 *   - `@theme` composes `hsl(var(--X))` so Tailwind utility classes (bg-background etc.) resolve
 *   - Radii land directly on --radius-{lg,md,sm} via calc() aliases
 *
 * Re-running yields byte-identical output (validated by `cmp` per HUB-2 acceptance).
 */

import StyleDictionary from 'style-dictionary';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';

// --check mode: regenerate in-memory, compare byte-for-byte against committed
// globals.css, exit 1 if they diverge. Non-destructive: never writes to the
// committed output file. Used by the CI drift guard.
const CHECK_MODE = process.argv.includes('--check');

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = resolve(__dirname, '..', '..', '..');
const TOKENS_SRC = resolve(REPO_ROOT, 'knowledge', 'standards', 'tokens.json');
const OUT_DIR    = resolve(__dirname, '..', 'registry', 'styles');
const OUT_FILE   = resolve(OUT_DIR, 'globals.css');

// --- helpers ---------------------------------------------------------------

/** Extract the `H S% L%` triple from `hsl(H S% L%)` (no hsl()/hsla()/commas supported). */
function hslTriple(value) {
  const m = /^hsl\(\s*([0-9.]+)\s+([0-9.]+%)\s+([0-9.]+%)\s*\)$/.exec(value);
  if (!m) throw new Error(`build-tokens: non-HSL color value not supported: ${value}`);
  return `${m[1]} ${m[2]} ${m[3]}`;
}

// --- Style Dictionary wire-up ---------------------------------------------

// Use Style Dictionary v4 with the built-in `dtcg` preprocessor so we get
// DTCG `$value` normalisation + alias expansion. We deliberately skip the
// `css` transformGroup because it rewrites `hsl(H S% L%)` to hex; we want
// raw color strings here so the emitted shadcn `:root` block keeps its
// space-separated HSL triple pattern (required by the `hsl(var(--X))`
// indirection in `@theme`).
const sd = new StyleDictionary({
  source: [TOKENS_SRC],
  preprocessors: ['dtcg'],
  platforms: {
    raw: {
      // No transformGroup/transforms — we consume the DTCG-normalised tree directly.
      files: [],
    },
  },
});

await sd.hasInitialized;
const dict = await sd.exportPlatform('raw');

// --- extract values --------------------------------------------------------
// After DTCG preprocessing, values land on `.$value` for DTCG-native tokens,
// but exportPlatform() normalises to a flat object keyed by dotted path with
// `value`/`$value` both present. Be defensive — use $value if defined.

function getValue(path) {
  const node = path.reduce((acc, p) => acc && acc[p], dict);
  if (!node) throw new Error(`build-tokens: missing token ${path.join('.')}`);
  // DTCG normalisation: $value preferred, value fallback.
  return node.$value ?? node.value;
}

const COLOR_KEYS = [
  'background', 'foreground',
  'card', 'card-foreground',
  'popover', 'popover-foreground',
  'primary', 'primary-foreground',
  'secondary', 'secondary-foreground',
  'muted', 'muted-foreground',
  'accent', 'accent-foreground',
  'destructive', 'destructive-foreground',
  'border', 'input', 'ring',
];

const colors = Object.fromEntries(
  COLOR_KEYS.map(k => [k, hslTriple(getValue(['color', k]))])
);

const radiusBase = getValue(['radius', 'base']); // e.g. "0.5rem"

// --- emit ------------------------------------------------------------------

const lines = [];
lines.push('/* Generated from knowledge/standards/tokens.json by workspace/ui-kit/scripts/build-tokens.mjs. Do not edit. */');
lines.push('');
lines.push('@custom-variant dark (&:is(.dark *));');
lines.push('');
lines.push('@theme {');

const themeColorPairs = [
  ['--color-background',           '--background'],
  ['--color-foreground',           '--foreground'],
  ['',                             ''],
  ['--color-card',                 '--card'],
  ['--color-card-foreground',      '--card-foreground'],
  ['',                             ''],
  ['--color-popover',              '--popover'],
  ['--color-popover-foreground',   '--popover-foreground'],
  ['',                             ''],
  ['--color-primary',              '--primary'],
  ['--color-primary-foreground',   '--primary-foreground'],
  ['',                             ''],
  ['--color-secondary',            '--secondary'],
  ['--color-secondary-foreground', '--secondary-foreground'],
  ['',                             ''],
  ['--color-muted',                '--muted'],
  ['--color-muted-foreground',     '--muted-foreground'],
  ['',                             ''],
  ['--color-accent',               '--accent'],
  ['--color-accent-foreground',    '--accent-foreground'],
  ['',                             ''],
  ['--color-destructive',          '--destructive'],
  ['--color-destructive-foreground','--destructive-foreground'],
  ['',                             ''],
  ['--color-border',               '--border'],
  ['--color-input',                '--input'],
  ['--color-ring',                 '--ring'],
];

for (const [themeVar, rootVar] of themeColorPairs) {
  if (!themeVar) { lines.push(''); continue; }
  lines.push(`  ${themeVar}: hsl(var(${rootVar}));`);
}

lines.push('');
lines.push('  --radius-lg: var(--radius);');
lines.push('  --radius-md: calc(var(--radius) - 2px);');
lines.push('  --radius-sm: calc(var(--radius) - 4px);');
lines.push('}');
lines.push('');
lines.push('/*');
lines.push('  The default border color has changed to `currentcolor` in Tailwind CSS v4,');
lines.push('  so we\'ve added these compatibility styles to make sure everything still');
lines.push('  looks the same as it did with Tailwind CSS v3.');
lines.push('');
lines.push('  If we ever want to remove these styles, we need to add an explicit border');
lines.push('  color utility to any element that depends on these defaults.');
lines.push('*/');
lines.push('@layer base {');
lines.push('  *,');
lines.push('  ::after,');
lines.push('  ::before,');
lines.push('  ::backdrop,');
lines.push('  ::file-selector-button {');
lines.push('    border-color: var(--color-gray-200, currentcolor);');
lines.push('  }');
lines.push('}');
lines.push('');
lines.push('@layer base {');
lines.push('  :root {');
lines.push('    /* Dark theme as default (D-12-21) — shadcn slate CSS variables */');

const rootPairs = [
  ['--background',             'background'],
  ['--foreground',             'foreground'],
  ['',                         ''],
  ['--card',                   'card'],
  ['--card-foreground',        'card-foreground'],
  ['',                         ''],
  ['--popover',                'popover'],
  ['--popover-foreground',     'popover-foreground'],
  ['',                         ''],
  ['--primary',                'primary'],
  ['--primary-foreground',     'primary-foreground'],
  ['',                         ''],
  ['--secondary',              'secondary'],
  ['--secondary-foreground',   'secondary-foreground'],
  ['',                         ''],
  ['--muted',                  'muted'],
  ['--muted-foreground',       'muted-foreground'],
  ['',                         ''],
  ['--accent',                 'accent'],
  ['--accent-foreground',      'accent-foreground'],
  ['',                         ''],
  ['--destructive',            'destructive'],
  ['--destructive-foreground', 'destructive-foreground'],
  ['',                         ''],
  ['--border',                 'border'],
  ['--input',                  'input'],
  ['--ring',                   'ring'],
];

for (const [cssVar, key] of rootPairs) {
  if (!cssVar) { lines.push(''); continue; }
  lines.push(`    ${cssVar}: ${colors[key]};`);
}

lines.push('');
lines.push(`    --radius: ${radiusBase};`);
lines.push('  }');
lines.push('}');
lines.push('');
lines.push('@layer base {');
lines.push('  * {');
lines.push('    @apply border-border;');
lines.push('  }');
lines.push('  body {');
lines.push('    @apply bg-background text-foreground;');
lines.push('  }');
lines.push('}');
lines.push('');

const generated = lines.join('\n');

if (CHECK_MODE) {
  if (!existsSync(OUT_FILE)) {
    console.error(`build-tokens --check: committed output missing at ${OUT_FILE}`);
    console.error('Regenerate: run `bun run build-tokens` in workspace/ui-kit/ and commit.');
    process.exit(1);
  }
  const committed = readFileSync(OUT_FILE, 'utf8');
  if (committed !== generated) {
    console.error('build-tokens --check: DRIFT DETECTED');
    console.error(`  Committed file:  ${OUT_FILE}`);
    console.error('  does NOT match regenerated output from knowledge/standards/tokens.json');
    console.error('');
    console.error('Regenerate globals.css: run `bun run build-tokens` in workspace/ui-kit/ and commit.');
    process.exit(1);
  }
  console.log(`build-tokens --check: OK (${OUT_FILE} matches regenerated output)`);
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, generated, 'utf8');
console.log(`build-tokens: wrote ${OUT_FILE} (${lines.length} lines)`);
