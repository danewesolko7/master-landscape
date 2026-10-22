// Image pipeline, run by hand (not part of the build). macOS + the Playwright Chromium; no packages.
//
//   node tools/images.mjs encode [name ...] [--force]
//     For each original in source-images/<name>.jpg, writes to src/assets/img/:
//       <name>.{avif,webp,jpg}         at the source width
//       <name>-<w>.{avif,webp,jpg}     for each w in WIDTHS below the source width
//     sips resizes (lossless PNG intermediate) and encodes AVIF + JPEG; Chromium's canvas
//     encodes WebP (sips cannot write WebP). Skips outputs newer than their source unless --force.
//
// Then write the <picture> by hand following docs/CONVENTIONS.md (Images).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const SRC = 'source-images', OUT = 'src/assets/img', TMP = 'test-results/images-tmp';
export const WIDTHS = [480, 800, 1200];
// AVIF below ~40 visibly smears grass texture; JPEG is only the fallback for browsers without AVIF/WebP.
const Q = { avif: 45, webp: 0.78, jpg: 62 };

const sips = (...args) => execFileSync('sips', args, { stdio: 'pipe' });
const size = file => {
  const out = sips('-g', 'pixelWidth', '-g', 'pixelHeight', file).toString();
  return { w: +out.match(/pixelWidth: (\d+)/)[1], h: +out.match(/pixelHeight: (\d+)/)[1] };
};

// Every variant of one source: [{ w, h, stem }] where stem is the output path without extension.
// Images with height:auto take the loaded file's aspect ratio, so a variant whose rounded height
// skews the ratio moves layout by a fraction of a pixel. When the ratio allows it, widths snap to
// the nearest exact multiple of w / gcd(w, h); one that rounds up to the full width is dropped.
// Sources with no exact smaller width (gcd 1) keep the plain targets.
export function variants(name) {
  const { w, h } = size(join(SRC, `${name}.jpg`));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a), step = w / gcd(w, h);
  const exact = x => (step >= w ? x : Math.max(step, Math.round(x / step) * step));
  const ws = [...new Set(WIDTHS.filter(x => x < w).map(exact))].filter(x => x < w);
  return [...ws.map(x => ({ w: x, h: Math.round((h * x) / w), stem: join(OUT, `${name}-${x}`) })), { w, h, stem: join(OUT, name) }];
}

async function encode(names, force) {
  mkdirSync(TMP, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const name of names) {
    const src = join(SRC, `${name}.jpg`), mtime = statSync(src).mtimeMs;
    const vs = variants(name), keep = new Set(vs.map(v => v.stem.slice(OUT.length + 1)));
    // Drop variants from an earlier width list.
    for (const f of readdirSync(OUT)) {
      const m = f.match(/^(.+-\d+)\.(avif|webp|jpg)$/);
      if (m && m[1].replace(/-\d+$/, '') === name && !keep.has(m[1])) rmSync(join(OUT, f));
    }
    for (const v of vs) {
      const fresh = ext => !force && existsSync(`${v.stem}.${ext}`) && statSync(`${v.stem}.${ext}`).mtimeMs > mtime;
      if (['avif', 'webp', 'jpg'].every(fresh)) continue;
      const png = join(TMP, `${name}-${v.w}.png`);
      sips('-s', 'format', 'png', '--resampleWidth', String(v.w), src, '--out', png);
      sips('-s', 'format', 'avif', '-s', 'formatOptions', String(Q.avif), png, '--out', `${v.stem}.avif`);
      sips('-s', 'format', 'jpeg', '-s', 'formatOptions', String(Q.jpg), png, '--out', `${v.stem}.jpg`);
      // At full width the original JPEG is often already smaller than a re-encode: keep it then.
      if (!v.stem.match(/-\d+$/) && statSync(src).size < statSync(`${v.stem}.jpg`).size) copyFileSync(src, `${v.stem}.jpg`);
      const webp = await page.evaluate(async ([b64, q]) => {
        const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        c.getContext('2d').drawImage(bmp, 0, 0);
        const buf = new Uint8Array(await (await c.convertToBlob({ type: 'image/webp', quality: q })).arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(s);
      }, [readFileSync(png).toString('base64'), Q.webp]);
      writeFileSync(`${v.stem}.webp`, Buffer.from(webp, 'base64'));
      console.log(`${name} ${v.w}w`);
    }
  }
  await browser.close();
  rmSync(TMP, { recursive: true, force: true });
}

const [cmd, ...rest] = process.argv.slice(2);
const names = rest.filter(a => !a.startsWith('--'));
if (cmd === 'encode') await encode(names.length ? names : readdirSync(SRC).filter(f => f.endsWith('.jpg')).map(f => f.slice(0, -4)), rest.includes('--force'));
else console.log('usage: node tools/images.mjs encode [name ...] [--force]');
