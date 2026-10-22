// Prints every page whose front matter has "pdf: <path>" from dist/ to dist/<path> with Chromium.
// Run after build.mjs; `npm run build` runs both. A PDF has no base URL, so relative links are
// rewritten to the production site from site.config.json (SITE_URL does not apply). A print page
// must fit on one sheet: the run fails if the PDF has more pages than front matter "pdf_pages" (1).
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serve } from './serve.mjs';

const site = JSON.parse(readFileSync('site.config.json', 'utf8')).url.replace(/\/$/, '');
const frontMatter = file => readFileSync(join('src/pages', file), 'utf8').match(/^<!--\n([\s\S]*?)\n-->/)?.[1] ?? '';
const field = (fm, key) => fm.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'))?.[1];
const jobs = readdirSync('src/pages').filter(f => f.endsWith('.html'))
  .map(file => ({ file, fm: frontMatter(file) }))
  .filter(({ fm }) => field(fm, 'pdf'))
  .map(({ file, fm }) => ({ file, out: field(fm, 'pdf'), pages: Number(field(fm, 'pdf_pages') ?? 1) }));

const server = await serve('dist');
const browser = await chromium.launch();
const failed = [];
try {
  const page = await browser.newPage();
  for (const { file, out, pages } of jobs) {
    await page.goto(`http://127.0.0.1:${server.address().port}/${file}`, { waitUntil: 'networkidle' });
    await page.evaluate(async base => {
      await document.fonts.ready;
      for (const a of document.querySelectorAll('a[href]')) {
        const href = a.getAttribute('href');
        // setAttribute, not a.href: SVG map links expose href as an animated string.
        if (!/^([a-z]+:|#)/i.test(href)) a.setAttribute('href', href === 'index.html' ? `${base}/` : new URL(href, `${base}/`).href);
      }
    }, site);
    const pdf = await page.pdf({ printBackground: true, preferCSSPageSize: true, tagged: true });
    const count = (pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
    if (count > pages) failed.push(`${file}: ${count} pages, expected ${pages}`);
    mkdirSync(dirname(join('dist', out)), { recursive: true });
    writeFileSync(join('dist', out), pdf);
    console.log(`${file} -> dist/${out} (${count} page${count === 1 ? '' : 's'})`);
  }
} finally {
  await browser.close();
  server.close();
}
if (failed.length) {
  console.error(`PDF too long:\n  ${failed.join('\n  ')}`);
  process.exit(1);
}
