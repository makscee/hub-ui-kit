#!/usr/bin/env node
/**
 * Visual regression test harness for hub design-system-v1.
 *
 * Usage:
 *   node scripts/vrt.mjs              # diff mode: compare current renders vs baselines, fail if any exceed threshold
 *   node scripts/vrt.mjs --update     # update baselines from current renders
 *   node scripts/vrt.mjs --app voidnet-portal   # only run one app
 *   node scripts/vrt.mjs --dry-run    # list what would be captured, don't boot servers
 *
 * Produces artefacts under vrt-baseline/<app>/<slug>.png (committed)
 * and vrt-current/<app>/<slug>.png + vrt-diff/<app>/<slug>.png (gitignored).
 *
 * Config: vrt.config.json at the ui-kit root.
 *
 * Design principles:
 *  - Read-only against workspace apps (we spawn their `next dev`, nothing else).
 *  - Best-effort boot: if an app refuses to serve `readyPath` within bootTimeoutMs,
 *    log it, skip its routes, don't fail the whole run.
 *  - Disable animations + force system fonts (close-to-deterministic screenshots).
 *  - pixelmatch threshold is per-pixel colour tolerance (0.1 default).
 *  - diffThreshold is % of total pixels allowed to differ before failing.
 */

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONFIG_PATH = path.join(ROOT, "vrt.config.json");
const BASELINE_DIR = path.join(ROOT, "vrt-baseline");
const CURRENT_DIR = path.join(ROOT, "vrt-current");
const DIFF_DIR = path.join(ROOT, "vrt-diff");

const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update");
const DRY_RUN = args.has("--dry-run");
const APP_FILTER = (() => {
  const idx = process.argv.indexOf("--app");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const DEFAULTS = config.defaults;

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function slugify(s) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "root";
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      // Any 2xx/3xx = server is responsive enough
      if (res.status < 500) return true;
      lastErr = new Error(`status ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for ${url}: ${lastErr?.message ?? "unknown"}`);
}

async function bootApp(appName, appCfg) {
  const cwd = path.resolve(ROOT, appCfg.cwd);
  const [cmd, ...cmdArgs] = appCfg.bootCmd;
  const env = {
    ...process.env,
    ...appCfg.env,
    // Prevent Next telemetry noise
    NEXT_TELEMETRY_DISABLED: "1",
    // Force a stable locale for date formatting etc.
    LANG: "en_US.UTF-8",
    TZ: "UTC",
  };
  console.log(`[${appName}] spawning: ${cmd} ${cmdArgs.join(" ")} (cwd=${cwd})`);
  const proc = spawn(cmd, cmdArgs, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const logLines = [];
  const capture = (s) => {
    const line = s.toString();
    logLines.push(line);
    if (logLines.length > 200) logLines.splice(0, logLines.length - 200);
  };
  proc.stdout.on("data", capture);
  proc.stderr.on("data", capture);
  const readyUrl = `${appCfg.baseUrl}${appCfg.readyPath}`;
  try {
    await waitForHttp(readyUrl, appCfg.bootTimeoutMs ?? DEFAULTS.bootTimeoutMs);
    return { proc, logLines, ok: true };
  } catch (e) {
    return { proc, logLines, ok: false, error: e };
  }
}

function killProc(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.killed) return resolve();
    proc.once("exit", () => resolve());
    try {
      proc.kill("SIGTERM");
    } catch {}
    // force-kill after 5s
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
      resolve();
    }, 5000);
  });
}

async function captureApp(browser, appName, appCfg) {
  const results = [];
  const context = await browser.newContext({
    viewport: appCfg.viewport ?? DEFAULTS.viewport,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    colorScheme: "light",
  });
  // Determinism: disable all CSS animations + transitions + blink caret.
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.innerHTML = `
      *, *::before, *::after {
        animation-duration: 0ms !important;
        animation-delay: 0ms !important;
        transition-duration: 0ms !important;
        transition-delay: 0ms !important;
        caret-color: transparent !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  });
  const page = await context.newPage();
  for (const route of appCfg.routes) {
    const slug = route.slug || slugify(route.path);
    const url = `${appCfg.baseUrl}${route.path}`;
    const outDir = UPDATE ? BASELINE_DIR : CURRENT_DIR;
    const outPath = path.join(outDir, appName, `${slug}.png`);
    mkdirp(path.dirname(outPath));
    try {
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: appCfg.navTimeoutMs ?? DEFAULTS.navTimeoutMs,
      });
      // extra beat to settle any post-idle paint
      await page.waitForTimeout(250);
      await page.screenshot({ path: outPath, fullPage: true, animations: "disabled" });
      results.push({ app: appName, slug, path: route.path, ok: true, file: outPath });
      console.log(`  [${appName}] captured ${route.path} -> ${path.relative(ROOT, outPath)}`);
    } catch (e) {
      results.push({ app: appName, slug, path: route.path, ok: false, error: e.message });
      console.log(`  [${appName}] FAILED ${route.path}: ${e.message}`);
    }
  }
  await context.close();
  return results;
}

function diffPng(baselinePath, currentPath, diffPath, pixelThreshold) {
  if (!fs.existsSync(baselinePath)) {
    return { missing: "baseline", baselinePath };
  }
  if (!fs.existsSync(currentPath)) {
    return { missing: "current", currentPath };
  }
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
  const current = PNG.sync.read(fs.readFileSync(currentPath));
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      sizeMismatch: true,
      baselineSize: [baseline.width, baseline.height],
      currentSize: [current.width, current.height],
    };
  }
  const { width, height } = baseline;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(
    baseline.data,
    current.data,
    diff.data,
    width,
    height,
    { threshold: pixelThreshold },
  );
  mkdirp(path.dirname(diffPath));
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  const total = width * height;
  return {
    diffPixels,
    totalPixels: total,
    diffPct: (diffPixels / total) * 100,
  };
}

async function main() {
  const appsToRun = Object.entries(config.apps).filter(
    ([name]) => !APP_FILTER || name === APP_FILTER,
  );
  if (appsToRun.length === 0) {
    console.error(`No apps matched filter ${APP_FILTER}`);
    process.exit(2);
  }

  if (DRY_RUN) {
    for (const [name, cfg] of appsToRun) {
      console.log(`${name}: ${cfg.routes.length} route(s), ${cfg.deferred?.length ?? 0} deferred`);
      for (const r of cfg.routes) console.log(`  + ${r.path}`);
      for (const d of cfg.deferred ?? []) console.log(`  - ${d.path}  [${d.reason}]`);
    }
    return;
  }

  // Clean current+diff dirs on a fresh run so leftover files don't confuse diff.
  if (!UPDATE) {
    if (fs.existsSync(CURRENT_DIR)) fs.rmSync(CURRENT_DIR, { recursive: true });
    if (fs.existsSync(DIFF_DIR)) fs.rmSync(DIFF_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const captureReport = [];
  const bootFailures = [];
  for (const [name, cfg] of appsToRun) {
    console.log(`\n=== ${name} ===`);
    const boot = await bootApp(name, cfg);
    if (!boot.ok) {
      console.log(`[${name}] boot FAILED: ${boot.error?.message}`);
      console.log(`[${name}] last log lines:\n${boot.logLines.slice(-20).join("")}`);
      bootFailures.push({ app: name, error: boot.error?.message });
      await killProc(boot.proc);
      continue;
    }
    try {
      const r = await captureApp(browser, name, cfg);
      captureReport.push(...r);
    } finally {
      await killProc(boot.proc);
    }
  }
  await browser.close();

  // Diff pass (only if not updating baselines)
  if (UPDATE) {
    console.log(`\nBaselines written to ${path.relative(ROOT, BASELINE_DIR)}/`);
    return;
  }

  const diffReport = [];
  let failures = 0;
  for (const cap of captureReport) {
    if (!cap.ok) {
      failures++;
      continue;
    }
    const appCfg = config.apps[cap.app];
    const route = appCfg.routes.find((r) => (r.slug || slugify(r.path)) === cap.slug);
    const pixelThreshold = route?.threshold ?? DEFAULTS.threshold;
    const pctAllowed = route?.diffThreshold ?? DEFAULTS.diffThreshold;
    const baselinePath = path.join(BASELINE_DIR, cap.app, `${cap.slug}.png`);
    const currentPath = cap.file;
    const diffPath = path.join(DIFF_DIR, cap.app, `${cap.slug}.png`);
    const r = diffPng(baselinePath, currentPath, diffPath, pixelThreshold);
    const entry = { app: cap.app, slug: cap.slug, path: cap.path, pctAllowed, ...r };
    diffReport.push(entry);
    if (r.missing) {
      console.log(`  [${cap.app}/${cap.slug}] MISSING ${r.missing} — run --update to create baseline`);
      failures++;
    } else if (r.sizeMismatch) {
      console.log(`  [${cap.app}/${cap.slug}] SIZE MISMATCH baseline=${r.baselineSize} current=${r.currentSize}`);
      failures++;
    } else {
      const status = r.diffPct > pctAllowed ? "FAIL" : "pass";
      console.log(
        `  [${cap.app}/${cap.slug}] ${status} diff=${r.diffPct.toFixed(3)}% (allowed ${pctAllowed}%)`,
      );
      if (r.diffPct > pctAllowed) failures++;
    }
  }

  // Summary
  console.log(`\n--- VRT summary ---`);
  console.log(`captured: ${captureReport.filter((c) => c.ok).length}`);
  console.log(`capture failures: ${captureReport.filter((c) => !c.ok).length}`);
  console.log(`boot failures: ${bootFailures.length}`);
  console.log(`diff failures: ${failures}`);
  for (const bf of bootFailures) {
    console.log(`  ! ${bf.app}: ${bf.error}`);
  }

  if (failures > 0 || bootFailures.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
