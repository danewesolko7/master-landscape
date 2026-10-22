// Gives every link on the inline SVG maps an accessible role and a 44x44 touch target.
// Usage: node tools/map-hit-areas.mjs   (re-run after regenerating maps; it is idempotent)
// For each <svg class="map"> in src/pages or src/partials that contains links:
//   - role="img" becomes role="group" (role="img" hides the links from assistive tech)
//   - links whose label is several <text> lines get an aria-label ("Westminster, main office")
//   - a transparent <rect class="map__hit"> is inserted as the link's first child, sized to
//     44x44 CSS px at the smallest rendered scale (1440 and 390 viewports, on every page that
//     shows the map), kept inside the map's viewBox and shrunk where neighbouring hit areas would
//     overlap. Maps are matched between source and dist by their aria-label, which must be unique.
// Nothing is painted, so the maps look the same. Labels that cannot reach 44px are listed.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { serve } from './serve.mjs';
const WIDTHS = { 1440: 900, 390: 844 }; // viewport width: height

const SOURCES = ['src/pages', 'src/partials'].flatMap(dir => readdirSync(dir).filter(f => f.endsWith('.html')).map(f => `${dir}/${f}`));
const SVG = /<svg\b[^>]*\bclass="map\b[^>]*>[\s\S]*?<\/svg>/g;
const LINK = /<a\b[^>]*\bhref="[^"]*"[^>]*>[\s\S]*?<\/a>/g;
const HIT = /<rect class="map__hit"[^>]*\/>/g;
const MIN = 44;

const mapLabel = svg => svg.match(/^<svg\b[^>]*\baria-label="([^"]*)"/)?.[1];
const decode = s => s.replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"');
const label = a => {
  const lines = [...a.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => decode(m[1]).trim().replace(/\s*\+\s*/g, ' and '));
  return lines.length > 1 ? [lines[0], ...lines.slice(1).map(l => l.toLowerCase())].join(', ') : null;
};

// Pass 1: roles, names, and remove old hit areas so measurement sees only the visible label.
const maps = new Set(); // aria-labels of linked maps
for (const file of SOURCES) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(SVG, svg => {
    if (!LINK.test(svg)) return svg;
    LINK.lastIndex = 0;
    const key = mapLabel(svg);
    if (!key) throw new Error(`${file}: a linked map needs an aria-label`);
    maps.add(key);
    return svg.replace(/^<svg\b[^>]*>/, tag => tag.replace('role="img"', 'role="group"')).replace(HIT, '').replace(LINK, a => {
      const name = label(a);
      return name && !/^<a [^>]*aria-label=/.test(a) ? a.replace(/^<a /, `<a aria-label="${name.replace(/"/g, '&quot;')}" `) : a;
    });
  });
  if (out !== src) writeFileSync(file, out);
}
execFileSync('node', ['build.mjs'], { stdio: 'ignore' });

// Pass 2: measure each link's label box and the map's scale on every page, at every viewport width.
// The smallest scale wins, so the hit area is large enough wherever the map appears.
const server = await serve('dist');
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const measured = {}; // aria-label -> { vb, links: [{ href, x, y, w, h, scale }] }
const pages = readdirSync('dist').filter(f => f.endsWith('.html') && /<svg\b[^>]*\bclass="map\b/.test(readFileSync(`dist/${f}`, 'utf8')));
for (const [w, h] of Object.entries(WIDTHS)) {
  const page = await browser.newPage({ viewport: { width: +w, height: h } });
  for (const file of pages) {
    await page.goto(`${base}${file}`);
    await page.evaluate(() => document.fonts.ready);
    const found = await page.evaluate(() => [...document.querySelectorAll('svg.map')].filter(s => s.querySelector('a')).map(svg => {
      const vb = svg.viewBox.baseVal, scale = svg.getScreenCTM()?.a || 0;
      return { key: svg.getAttribute('aria-label'), vb: [vb.x, vb.y, vb.width, vb.height], links: [...svg.querySelectorAll('a')].map(a => {
        // The hit rect goes inside the link, so it must share the svg's user space.
        const rel = svg.getScreenCTM()?.inverse().multiply(a.getScreenCTM());
        if (rel && !rel.isIdentity && Math.abs(rel.a - 1) + Math.abs(rel.e) + Math.abs(rel.f) > 0.001) throw new Error(`transformed map link: ${a.getAttribute('href')}`);
        const b = a.getBBox();
        return { href: a.getAttribute('href'), x: b.x, y: b.y, w: b.width, h: b.height, scale };
      }) };
    }));
    for (const m of found) {
      const prev = measured[m.key];
      measured[m.key] = !prev ? m : { ...prev, links: prev.links.map((l, j) => {
        const s = m.links[j].scale;
        return s > 0 && (l.scale <= 0 || s < l.scale) ? { ...l, scale: s } : l;
      }) };
    }
  }
  await page.close();
}
await browser.close();
server.close();

// Pass 3: size, place and de-overlap the hit rects, then write them into the source.
const r2 = n => Math.round(n * 100) / 100;
const short = [];
const rects = {}; // aria-label -> [<rect>]
for (const [key, { vb: [vx, vy, vw, vh], links }] of Object.entries(measured)) {
  // Each rect must contain its label and stay inside the viewBox (the map clip also clips
  // hit testing). Start centred on the label at full size.
  const lo = { x: vx, y: vy }, hi = { x: vx + vw, y: vy + vh };
  const rs = links.map(l => {
    const need = MIN / (l.scale || 1);
    const r = { l, x: 0, y: 0, w: Math.min(Math.max(l.w, need), vw), h: Math.min(Math.max(l.h, need), vh) };
    for (const [p, s] of [['x', 'w'], ['y', 'h']]) r[p] = Math.min(Math.max(l[p] + l[s] / 2 - r[s] / 2, lo[p]), hi[p] - r[s]);
    return r;
  });
  const overlap = (a, b, p, s) => Math.min(a[p] + a[s], b[p] + b[s]) - Math.max(a[p], b[p]);
  // Resolve overlaps by sliding the two rects apart (sizes kept) along the cheaper axis,
  // as far as their labels and the viewBox allow; shrink only when sliding cannot do it.
  const separate = shrink => {
    let changed = false;
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const ox = overlap(rs[i], rs[j], 'x', 'w'), oy = overlap(rs[i], rs[j], 'y', 'h');
      if (ox <= 0 || oy <= 0) continue;
      for (const [p, s, o] of ox < oy ? [['x', 'w', ox], ['y', 'h', oy]] : [['y', 'h', oy], ['x', 'w', ox]]) {
        const [a, b] = rs[i][p] + rs[i][s] / 2 <= rs[j][p] + rs[j][s] / 2 ? [rs[i], rs[j]] : [rs[j], rs[i]];
        // a moves back (towards lo), b moves forward; each keeps covering its label.
        const ra = Math.min(a[p] + a[s] - (a.l[p] + a.l[s]), shrink ? Infinity : a[p] - lo[p]);
        const rb = Math.min(b.l[p] - b[p], shrink ? Infinity : hi[p] - (b[p] + b[s]));
        if (ra + rb < o + 0.01) { if (!shrink) continue; }
        const need = Math.min(o + 0.01, ra + rb), da = ra + rb ? need * ra / (ra + rb) : 0, db = need - da;
        if (shrink) { a[s] -= da; b[p] += db; b[s] -= db; } else { a[p] -= da; b[p] += db; }
        changed = true;
        break;
      }
    }
    return changed;
  };
  for (let pass = 0; pass < 200 && separate(false); pass++);
  for (let pass = 0; pass < 200 && separate(true); pass++);
  rects[key] = rs.map(r => {
    const px = Math.min(r.w, r.h) * (r.l.scale || 1);
    if (px < MIN - 0.5) short.push(`${key} ${r.l.href}: ${Math.round(r.w * r.l.scale)}x${Math.round(r.h * r.l.scale)} px`);
    return `<rect class="map__hit" x="${r2(r.x)}" y="${r2(r.y)}" width="${r2(r.w)}" height="${r2(r.h)}" fill="transparent"/>`;
  });
}
for (const file of SOURCES) {
  const src = readFileSync(file, 'utf8');
  const out = src.replace(SVG, svg => {
    const list = rects[mapLabel(svg)];
    if (!list || !LINK.test(svg)) return svg;
    LINK.lastIndex = 0;
    let li = 0;
    return svg.replace(LINK, a => a.replace(/^<a [^>]*>/, open => open + list[li++]));
  });
  if (out !== src) writeFileSync(file, out);
}
execFileSync('node', ['build.mjs'], { stdio: 'ignore' });
console.log(`Hit areas on ${Object.keys(rects).length} map(s), measured on ${pages.length} page(s)`);
if (short.length) console.log(`Below 44px (neighbours too close):\n  ${short.join('\n  ')}`);
