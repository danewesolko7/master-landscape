// Launch checks for the built site in dist/. Exits 1 if any error is found.
// Usage: node tools/check.mjs [--build] [--external] [--json] [Page ...]   (no pages = all)
//   --build     run the full build first (build.mjs, then tools/pdf.mjs)
//   --external  HEAD-request every external link (off by default: slow, needs network)
//   --json      also write test-results/check.json
// File checks: links, #fragments, root-relative and domain links, inline styles, CSS url()s, meta.
// Browser checks at 1440 and 390: widows, overflow, headings, landmarks, names, contrast, targets.
// Interaction checks on index.html: skip link, focus ring, Services dropdown.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { audit, layout } from './check-dom.mjs';
import { serve } from './serve.mjs';
const WIDTHS = { 1440: 900, 390: 844 }; // viewport width: height

const DIST = 'dist';
const args = process.argv.slice(2);
const flag = name => args.includes(`--${name}`);
if (flag('build')) for (const step of ['build.mjs', 'tools/pdf.mjs']) execFileSync('node', [step], { stdio: 'inherit' });
if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/ is empty: run npm run build or pass --build'); process.exit(1); }

const domain = new URL(JSON.parse(readFileSync('site.config.json', 'utf8')).url).hostname.replace(/^www\./, '');
const all = readdirSync(DIST).filter(f => f.endsWith('.html')).map(f => f.slice(0, -5)).sort();
const pages = args.filter(a => !a.startsWith('--')).map(a => a.replace(/\.html$/, ''));
const names = pages.length ? pages : all;

const findings = new Map(); // page -> [{ type, level, text, width? }]
const report = (page, f) => { if (!findings.has(page)) findings.set(page, []); findings.get(page).push(f); };
const external = new Map(); // url -> [pages]

// ---------- File checks ----------
const html = Object.fromEntries(all.map(n => [n, readFileSync(join(DIST, `${n}.html`), 'utf8')]));
const idsOf = src => new Set([...src.matchAll(/\s(?:id|name)="([^"]+)"/g)].map(m => m[1]));
const ids = Object.fromEntries(all.map(n => [n, idsOf(html[n])]));

function checkRef(page, ref, from, attr) {
  if (/^(mailto|tel|data|javascript):/.test(ref)) return;
  if (/^https?:\/\//.test(ref) || ref.startsWith('//')) {
    const host = new URL(ref, 'https://x').hostname.replace(/^www\./, '');
    if (host === domain) report(page, { type: 'domain-link', level: 'error', text: `${attr}="${ref}" (use a relative link)` });
    else (external.get(ref) || external.set(ref, []).get(ref)).push(page);
    return;
  }
  if (ref.startsWith('/')) return report(page, { type: 'root-relative', level: 'error', text: `${attr}="${ref}"` });
  const [path, hash] = ref.split('#');
  if (ref === '#' || ref === '') return report(page, { type: 'placeholder-link', level: 'error', text: `${attr}="${ref}"` });
  const file = path ? normalize(join(dirname(from), path.split('?')[0])) : from;
  if (path && !existsSync(file)) return report(page, { type: 'broken-link', level: 'error', text: `${attr}="${ref}"` });
  if (hash && file.endsWith('.html')) {
    const target = file.slice(DIST.length + 1, -5);
    const targetIds = ids[target] ?? idsOf(readFileSync(file, 'utf8'));
    if (!targetIds.has(decodeURIComponent(hash))) report(page, { type: 'broken-fragment', level: 'error', text: `${attr}="${ref}"` });
  }
}

for (const name of names) {
  const src = html[name];
  if (!src) { report(name, { type: 'missing-page', level: 'error', text: `${DIST}/${name}.html does not exist` }); continue; }
  const file = join(DIST, `${name}.html`);
  // The canonical link is the one place an absolute same-domain href belongs.
  const body = src.replace(/<link rel="canonical"[^>]*>/g, '').replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  for (const [, attr, value] of body.matchAll(/\s(href|src)="([^"]*)"/g)) checkRef(name, value, file, attr);
  for (const [, value] of body.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const candidate of value.split(',')) checkRef(name, candidate.trim().split(/\s+/)[0], file, 'srcset');
  }
  if (/\sstyle="/.test(src.replace(/<svg[\s\S]*?<\/svg>/g, ''))) {
    report(name, { type: 'inline-style', level: 'error', text: 'style="" outside <svg>' });
  }
  // Class names describe what something is, not a pixel value: use the named scales instead.
  const sized = new Set([...body.matchAll(/\sclass="([^"]*)"/g)].flatMap(([, v]) => v.split(/\s+/)).filter(c => /\d{2,}/.test(c)));
  if (sized.size) report(name, { type: 'value-class', level: 'error', text: [...sized].join(' ') });
  const meta = {
    title: /<title>[^<]+<\/title>/, description: /<meta name="description" content="[^"]+"/,
    canonical: /<link rel="canonical" href="[^"]+"/, 'og:image': /<meta property="og:image" content="[^"]+"/,
  };
  for (const [key, re] of Object.entries(meta)) if (!re.test(src)) report(name, { type: 'meta', level: 'warn', text: `missing ${key}` });
}

// CSS url()s (fonts, icons) resolve.
for (const css of readdirSync(join(DIST, 'assets/css')).filter(f => f.endsWith('.css'))) {
  const file = join(DIST, 'assets/css', css);
  for (const [, ref] of readFileSync(file, 'utf8').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    if (!/^(data:|#|https?:)/.test(ref) && !existsSync(normalize(join(dirname(file), ref)))) {
      report(`assets/css/${css}`, { type: 'broken-link', level: 'error', text: `url(${ref})` });
    }
  }
}

if (flag('external')) {
  for (const [url, from] of external) {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(10000) }).catch(e => ({ ok: false, status: e.name }));
    if (!res.ok) for (const page of new Set(from)) report(page, { type: 'external-link', level: 'error', text: `${res.status} ${url}` });
  }
}

// ---------- Browser checks ----------
const server = await serve(DIST);
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const ready = page => page.evaluate(async () => {
  // Lazy images below the fold never start loading in a headless page, so waiting on them hangs.
  for (const i of document.querySelectorAll('img[loading="lazy"]')) i.loading = 'eager';
  await document.fonts.ready;
  await Promise.all([...document.images].map(i => i.complete || new Promise(r => { i.onload = i.onerror = r; })));
});
try {
  for (const [w, h] of Object.entries(WIDTHS)) {
    const ctx = await browser.newContext({ viewport: { width: +w, height: h }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const name of names.filter(n => html[n])) {
      await page.goto(`${base}/${name}.html`, { waitUntil: 'networkidle' });
      await ready(page);
      const found = [...await page.evaluate(layout), ...await page.evaluate(audit)];
      for (const f of found) report(name, { ...f, width: +w });
    }
    await ctx.close();
  }

  if (names.includes('index')) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const fail = text => report('index', { type: 'interaction', level: 'error', text, width: 1440 });
    await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });

    await page.keyboard.press('Tab');
    const skip = await page.evaluate(() => {
      const el = document.activeElement, r = el.getBoundingClientRect();
      return { skip: el.classList.contains('skip-link'), shown: r.left >= 0 && r.top >= 0 && r.width > 0 };
    });
    if (!skip.skip) fail('first Tab does not focus the skip link');
    else if (!skip.shown) fail('skip link is not visible when focused');
    await page.keyboard.press('Enter');
    if (!(await page.evaluate(() => location.hash === '#main' && !!document.getElementById('main')))) fail('skip link does not jump to #main');

    // Record every focusable's resting style, then Tab through and expect a visible change.
    await page.goto(`${base}/index.html`, { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('a[href], button, input, select, textarea, summary')) {
        const s = getComputedStyle(el);
        el.dataset.rest = `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
      }
    });
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => {
        const el = document.activeElement, s = getComputedStyle(el);
        return {
          changed: el.dataset.rest !== `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`,
          shown: s.outlineStyle !== 'none' || s.boxShadow !== 'none',
          label: `<${el.tagName.toLowerCase()}> ${el.textContent.trim().slice(0, 40)}`,
        };
      });
      if (!f.changed || !f.shown) fail(`no visible focus style: ${f.label}`);
    }

    // Services dropdown: focus opens it, Escape closes it, aria-expanded follows.
    const trigger = page.locator('.dropdown > .nav-link');
    if (await trigger.count()) {
      await trigger.focus();
      await page.waitForTimeout(50);
      if (await trigger.getAttribute('aria-expanded') !== 'true') fail('dropdown: aria-expanded is not "true" when focused open');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(50);
      if (await trigger.getAttribute('aria-expanded') !== 'false') fail('dropdown: Escape does not set aria-expanded="false"');
      if (await page.locator('.dropdown__panel').isVisible()) fail('dropdown: Escape does not close the panel');
    } else fail('dropdown: no .dropdown > .nav-link trigger');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

// ---------- Report ----------
// The same finding at both widths is reported once with both widths.
const totals = {};
let errors = 0;
for (const [page, list] of [...findings].sort()) {
  const merged = new Map();
  for (const f of list) {
    const key = `${f.level}|${f.type}|${f.text}`;
    const m = merged.get(key) || merged.set(key, { ...f, widths: [] }).get(key);
    if (f.width) m.widths.push(f.width);
  }
  const shown = [...merged.values()].filter(f => f.level !== 'info');
  for (const f of merged.values()) totals[`${f.level} ${f.type}`] = (totals[`${f.level} ${f.type}`] || 0) + 1;
  if (!shown.length) continue;
  console.log(`\n${page}`);
  for (const f of shown) {
    if (f.level === 'error') errors++;
    console.log(`  ${f.level.padEnd(5)} ${f.type.padEnd(16)} ${f.widths.length ? `[${f.widths.join(',')}] ` : ''}${f.text}`);
  }
}
console.log(`\n${names.length} page(s), ${external.size} external link(s)${flag('external') ? ' checked' : ' (not fetched; use --external)'}`);
for (const [k, n] of Object.entries(totals).sort()) console.log(`  ${k.padEnd(28)} ${n}`);
if (flag('json')) {
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/check.json', JSON.stringify({ findings: Object.fromEntries(findings), external: Object.fromEntries(external) }, null, 2));
}
console.log(errors ? `\nFAIL: ${errors} error(s)` : '\nPASS');
process.exit(errors ? 1 : 0);
