// Builds src/ into dist/: pages wrapped in a layout, partials included, variables filled,
// CSS @imports inlined into one file. Node built-ins only. See docs/CONVENTIONS.md.
//   node build.mjs            build with the production URL from site.config.json
//   SITE_URL=http://localhost:8000 node build.mjs   override the absolute URL (canonical, og, sitemap)
//   node build.mjs --prod     also run the launch checks (placeholders etc.)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { counts, scan, TYPES } from './tools/placeholders.mjs';

const SRC = 'src', OUT = 'dist';
const PROD = process.argv.includes('--prod');
const config = JSON.parse(readFileSync('site.config.json', 'utf8'));
const siteHosts = [new URL(config.url).host];
config.domain = new URL(config.url).host; // production domain, for printed text (e.g. the capabilities PDF)
config.url = (process.env.SITE_URL || config.url).replace(/\/$/, '');
siteHosts.push(new URL(config.url).host);
const errors = [];
const read = path => readFileSync(path, 'utf8');

// Front matter: a leading <!-- ... --> comment of "key: value" lines.
function parsePage(file) {
  const text = read(join(SRC, 'pages', file));
  const m = text.match(/^<!--\n([\s\S]*?)\n-->\n?/);
  const data = {};
  for (const line of m ? m[1].split('\n') : []) {
    const i = line.indexOf(':');
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { data, body: m ? text.slice(m[0].length) : text };
}

// <!-- @include name key="value" --> inserts src/partials/name.html, filling {{key}} from the attributes.
const INCLUDE = /<!--\s*@include\s+([\w-]+)((?:\s+[\w-]+=(?:"[^"]*"|'[^']*'))*)\s*-->/g;
function includes(html, file, depth = 0) {
  if (depth > 8) throw new Error(`${file}: includes nested too deeply`);
  return html.replace(INCLUDE, (_, name, attrText) => {
    const path = join(SRC, 'partials', `${name}.html`);
    if (!existsSync(path)) { errors.push(`${file}: missing partial "${name}"`); return ''; }
    const attrs = Object.fromEntries([...attrText.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)')/g)].map(a => [a[1], a[2] ?? a[3]]));
    const filled = read(path).replace(/\{\{\s*([\w-]+)\s*\}\}/g, (tag, key) => key in attrs ? attrs[key] : tag);
    return includes(filled.trimEnd(), file, depth + 1);
  });
}

const escape = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const text = html => html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const absolute = href => `${config.url}/${href === 'index.html' ? '' : href}`;

// JSON-LD from front matter "schema" (business | service | article) plus the page's breadcrumb nav.
// Only facts the site states are used; see tools/placeholders.mjs for what is still missing.
function structuredData(data, body, canonical) {
  const business = {
    '@type': 'HomeAndConstructionBusiness', '@id': `${config.url}/#business`,
    name: config.site_name, url: `${config.url}/`,
  };
  const areaServed = config.areas.map(name => ({ '@type': 'AdministrativeArea', name }));
  const image = `${config.url}/assets/og-image.png`;
  const name = text(body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? data.title);
  const graph = [];
  if (data.schema === 'business') graph.push({
    ...business, telephone: config.phone_intl, email: config.email, image,
    address: { '@type': 'PostalAddress', streetAddress: config.street, addressLocality: config.locality,
      addressRegion: config.region, postalCode: config.postal_code, addressCountry: 'US' },
    areaServed,
  });
  if (data.schema === 'service') graph.push({
    '@type': 'Service', name, description: data.description, url: canonical, areaServed, provider: business,
  });
  if (data.schema === 'article') graph.push({
    '@type': 'Article', headline: name, description: data.description, mainEntityOfPage: canonical, image,
    publisher: { '@type': 'Organization', name: config.site_name, url: `${config.url}/` },
  });
  const crumbs = body.match(/<nav aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  if (crumbs) graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [...crumbs.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map(([, li], i) => ({
      '@type': 'ListItem', position: i + 1, name: text(li),
      item: absolute(li.match(/href="([^"]+)"/)?.[1] ?? canonical.slice(config.url.length + 1)),
    })),
  });
  if (!graph.length) return '';
  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

// The Sitemap page's list ({{site_index}}), built from every page's breadcrumb so it never drifts:
// a page's parent is its last linked crumb (or front matter "parent" when it has no breadcrumb), its label is its own current crumb (or its title while
// the crumb is still a [placeholder]). Sections follow the footer nav's order.
function siteIndex(files) {
  const pages = files.map(file => {
    const { data, body } = parsePage(file);
    const crumbs = body.match(/<nav aria-label="Breadcrumb"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
    const parent = file === 'index.html' ? null
      : data.parent ?? [...crumbs.matchAll(/href="([^"]+)"/g)].at(-1)?.[1] ?? 'index.html';
    const current = text(crumbs.match(/<li aria-current="page">([\s\S]*?)<\/li>/)?.[1] ?? '');
    const label = file === 'index.html' ? 'Home' : current && !current.includes('[') ? current : data.title.split(' | ')[0];
    return { file, parent, label: escape(label).replace(/ (\S+)$/, '&nbsp;$1') };
  });
  const order = [...read(join(SRC, 'partials/footer.html')).matchAll(/href="([\w-]+\.html)"/g)].map(m => m[1]);
  const rank = p => (order.includes(p.file) ? order.indexOf(p.file) : order.length);
  const children = file => pages.filter(p => p.parent === file)
    .sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  const item = p => `<li><a href="${p.file}">${p.label}</a>${children(p.file).length ? list(children(p.file)) : ''}</li>`;
  const list = (items, cls = '') => `<ul${cls}>${items.map(item).join('')}</ul>`;
  const section = (id, title, body) =>
    `<section aria-labelledby="${id}" class="sitemap__group"><h2 id="${id}" class="sitemap__title">${title}</h2>${body}</section>`;
  const top = children('index.html');
  const leaves = top.filter(p => !children(p.file).length);
  return [
    ...top.filter(p => children(p.file).length).map(p => section(`map-${p.file.slice(0, -5).toLowerCase()}`,
      `<a href="${p.file}">${p.label}</a>`, list(children(p.file), ' class="sitemap__list"'))),
    section('map-company', 'Company and&nbsp;legal',
      `<ul class="sitemap__list"><li><a href="index.html">Home</a></li>${leaves.map(item).join('')}</ul>`),
  ].join('\n');
}

// Forms post to config.formAction. Until one is set, dev builds send the form to the thank-you page.
const form = config.formAction
  ? { form_action: escape(config.formAction), form_method: 'post' }
  : { form_action: 'ThankYou.html', form_method: 'get' };

// Front matter "scripts: a, b" loads src/assets/js/a.js and b.js on that page only.
function scripts(data, file) {
  return (data.scripts ?? '').split(',').map(s => s.trim()).filter(Boolean).map(name => {
    if (!existsSync(join(SRC, 'assets/js', `${name}.js`))) errors.push(`${file}: missing script "${name}"`);
    return `<script src="assets/js/${name}.js" defer></script>\n`;
  }).join('');
}

function buildPage(file) {
  const { data, body } = parsePage(file);
  const path = file === 'index.html' ? '' : file;
  const canonical = `${config.url}/${path}`;
  for (const key of ['title', 'description']) if (!data[key]) errors.push(`${file}: front matter needs "${key}"`);
  const vars = {
    ...config, ...form, ...data, path, canonical,
    title: escape(data.title ?? ''), description: escape(data.description ?? ''),
    site_name: escape(config.site_name),
    og_type: data.schema === 'article' ? 'article' : 'website',
    robots_meta: data.robots ? `<meta name="robots" content="${escape(data.robots)}">\n` : '',
    jsonld: structuredData(data, body, canonical),
    site_index: SITE_INDEX,
    scripts: scripts(data, file),
  };
  const layout = join(SRC, 'layouts', `${data.layout || 'base'}.html`);
  let html = read(layout).replace('{{content}}', () => body.trim());
  html = includes(html, file);
  html = html.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (tag, key) => {
    if (key in vars) return vars[key];
    errors.push(`${file}: unresolved ${tag}`);
    return tag;
  });
  // Mark the active nav item: data-nav="x" becomes aria-current="page" when the page's nav is x.
  html = html.replace(/ data-nav="([\w-]+)"/g, (_, nav) => (nav === data.nav ? ' aria-current="page"' : ''));
  return html;
}

// Inline @import url("x.css") layer(name); as @layer name { ... } so the browser makes one request.
function buildCss(file) {
  return read(file).replace(/@import url\("([^"]+)"\) layer\(([\w-]+)\);/g, (_, rel, layer) =>
    `@layer ${layer} {\n${buildCss(join(dirname(file), rel)).trim()}\n}`);
}

// Links must be relative so dist/ works from disk, localhost or any domain.
// Absolute URLs are allowed only in canonical, meta tags and JSON-LD.
function checkLinks(file, html) {
  const body = html.replace(/<link rel="canonical"[^>]*>|<meta [^>]*>|<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  for (const [, url] of body.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    if (url.startsWith('/')) errors.push(`${file}: root-relative link ${url}`);
    else if (url.startsWith('mailto:')) continue;
    else if (siteHosts.some(h => url.includes(h))) errors.push(`${file}: absolute site link ${url}`);
    else if (!/^(#|[a-z]+:)/.test(url)) {
      const target = posix.normalize(url.split(/[?#]/)[0]);
      if (target && !existsSync(join(OUT, target)) && !PDFS.has(target)) errors.push(`${file}: broken link ${url}`);
    }
  }
}

// Search engines: every indexable page in the sitemap, robots.txt pointing at it.
function writeSitemap(built) {
  const urls = built.filter(([, , data]) => !/noindex/.test(data.robots ?? '')).map(([file]) => absolute(file)).sort();
  writeFileSync(join(OUT, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map(u => `  <url><loc>${u}</loc></url>\n`).join('') + '</urlset>\n');
  writeFileSync(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${config.url}/sitemap.xml\n`);
  return urls.length;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
for (const dir of readdirSync(SRC)) {
  if (!['pages', 'partials', 'layouts'].includes(dir)) cpSync(join(SRC, dir), join(OUT, dir), { recursive: true });
}
rmSync(join(OUT, 'assets/css'), { recursive: true });
mkdirSync(join(OUT, 'assets/css'));
writeFileSync(join(OUT, 'assets/css/site.css'), buildCss(join(SRC, 'assets/css/site.css')));

const pages = readdirSync(join(SRC, 'pages')).filter(f => f.endsWith('.html'));
const SITE_INDEX = siteIndex(pages);
const built = pages.map(file => [file, buildPage(file), parsePage(file).data]);
// Front matter "pdf: assets/docs/x.pdf" marks a print page; tools/pdf.mjs renders it there after this build.
const PDFS = new Set(built.map(([, , data]) => data.pdf).filter(Boolean));
for (const [file, html] of built) writeFileSync(join(OUT, file), html);
const indexed = writeSitemap(built);
for (const [file, html] of built) checkLinks(file, html);

// Launch check: content still waiting on the client. Warns in dev, fails with --prod.
// The full list is written by `node tools/placeholders.mjs` to docs/CLIENT-QUESTIONS.md.
const pending = counts(scan(config)).map(([type, n]) => `${n} ${TYPES[type].toLowerCase()}`);
if (pending.length) {
  const note = `Placeholders left: ${pending.join(', ')} (node tools/placeholders.mjs for the list)`;
  if (PROD) errors.push(note); else console.warn(note);
}

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`Build failed: ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`Built ${pages.length} page(s) to ${OUT}/ (${config.url}), ${indexed} in sitemap.xml`
  + (PDFS.size ? `; ${PDFS.size} PDF(s) are rendered by tools/pdf.mjs (npm run build runs it)` : ''));
