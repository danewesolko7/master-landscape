// Finds content still waiting on the client: "To confirm" notes, [bracketed] fill-ins,
// image placeholders, links without a destination and an unset form endpoint.
//   node tools/placeholders.mjs   prints counts and writes docs/CLIENT-QUESTIONS.md
// build.mjs imports scan(): a normal build warns, --prod fails while anything is left.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const TYPES = {
  form: 'Form delivery',
  todo: 'Details to confirm',
  bracket: 'Text to fill in',
  image: 'Photos needed',
  link: 'Links without a destination',
};

const decode = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#39;|&rsquo;/g, '’').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
const clean = s => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const blank = m => m.replace(/[^\n]/g, ' ');
const lineOf = (src, i) => src.slice(0, i).split('\n').length;

// Context for a match: the text of the nearest element that holds it (a <dd> gets its <dt> label).
const TEXT_TAGS = /<(p|li|dd|dt|h[1-6]|figcaption|td|th|blockquote|label|summary|a|span)\b[^>]*>/g;
function context(src, at) {
  const opens = [...src.slice(0, at).matchAll(TEXT_TAGS)].reverse();
  for (const m of opens) {
    const close = src.indexOf(`</${m[1]}>`, m.index);
    if (close < at) continue;
    let text = clean(src.slice(m.index + m[0].length, close));
    if (m[1] === 'dd') {
      const dt = src.slice(0, m.index).match(/<dt\b[^>]*>((?:(?!<dt\b)[\s\S])*?)<\/dt>\s*$/);
      if (dt) text = `${clean(dt[1])}: ${text}`;
    }
    return text.length > 220 ? `${text.slice(0, 217)}…` : text;
  }
  return '';
}

function scanFile(file, src) {
  const items = [], add = (type, i, text, context) => items.push({ file, type, line: lineOf(src, i), text, context });
  let masked = src.replace(/<!--[\s\S]*?-->|<script[\s\S]*?<\/script>/g, blank);
  for (const m of masked.matchAll(/<p class="todo">([\s\S]*?)<\/p>/g)) add('todo', m.index, clean(m[1]));
  masked = masked.replace(/<p class="todo">[\s\S]*?<\/p>/g, blank);
  for (const m of masked.matchAll(/class="placeholder[ "][\s\S]*?class="placeholder__label[^"]*">([\s\S]*?)</g)) add('image', m.index, clean(m[1]));
  masked = masked.replace(/(class="placeholder__label[^"]*">)([^<]*)/g, (_, open, label) => open + blank(label));
  for (const m of masked.matchAll(/<a [^>]*href="#"[^>]*>([\s\S]*?)<\/a>/g)) add('link', m.index, clean(m[1]));
  const text = masked.replace(/<[^>]*>/g, blank);
  for (const m of text.matchAll(/\[[^\]\n]{1,120}\]/g)) add('bracket', m.index, clean(m[0]), context(src, m.index));
  return items;
}

export function scan(config) {
  const items = [];
  if (!config.formAction) items.push({ file: 'site.config.json', type: 'form', text: 'Choose where the proposal and RFP forms send submissions (a form service or email handler), then set "formAction".' });
  for (const dir of ['pages', 'partials']) {
    for (const f of readdirSync(join('src', dir)).filter(f => f.endsWith('.html')).sort()) {
      const src = readFileSync(join('src', dir, f), 'utf8');
      // "placeholders: example" in front matter: the page demonstrates placeholders (the style guide).
      if (/^<!--\n[\s\S]*?^placeholders:\s*example\s*$[\s\S]*?\n-->/m.test(src)) continue;
      items.push(...scanFile(`src/${dir}/${f}`, src));
    }
  }
  return items;
}

export const counts = items => Object.keys(TYPES).map(t => [t, items.filter(i => i.type === t).length]).filter(([, n]) => n);

// Page names for the report: the page title without the site name.
function pageNames() {
  const names = {};
  for (const f of readdirSync('src/pages')) {
    const title = readFileSync(join('src/pages', f), 'utf8').match(/^title: (.*)$/m)?.[1] ?? f;
    names[`src/pages/${f}`] = `${title.split(' | ')[0]} (${f})`;
  }
  return names;
}

function partialUse(name) {
  return readdirSync('src/pages').filter(f => readFileSync(join('src/pages', f), 'utf8').includes(`@include ${name}`)).length;
}

function report(items) {
  const names = pageNames();
  const out = ['# Questions for the client', '',
    'The new website is built. Before it goes live, we need the details below from Master Landscape & Maintenance.',
    'Each item shows the page it appears on and the sentence around it, so you can answer in a reply or a marked-up copy of this list.',
    'Line numbers are for the web team.', '', '## Summary', ''];
  for (const [t, n] of counts(items)) out.push(`- **${TYPES[t]}:** ${n}`);

  const repeated = new Map();
  for (const i of items.filter(i => i.type === 'bracket')) repeated.set(i.text, (repeated.get(i.text) ?? new Set()).add(i.file));
  const common = [...repeated].filter(([, files]) => files.size > 2).sort((a, b) => b[1].size - a[1].size);
  if (common.length) {
    out.push('', 'Fill-ins that repeat across pages (answer once per page, since the value usually differs):', '', '| Fill-in | Pages |', '|---|---|');
    for (const [text, files] of common) out.push(`| ${text} | ${files.size} |`);
  }

  out.push('', '## Site-wide', '');
  for (const i of items.filter(i => i.type === 'form')) out.push(`- **${TYPES.form}:** ${i.text}`);
  for (const file of [...new Set(items.filter(i => i.file.startsWith('src/partials/')).map(i => i.file))]) {
    const name = file.slice(13, -5);
    out.push(`- **Shared block "${name}"** (appears on ${partialUse(name)} pages; answer once):`);
    for (const i of items.filter(i => i.file === file)) out.push(`  - ${i.context ?? i.text} _(line ${i.line})_`);
  }

  out.push('', '## By page', '');
  for (const file of [...new Set(items.filter(i => i.file.startsWith('src/pages/')).map(i => i.file))]) {
    out.push(`### ${names[file]}`, '');
    for (const type of Object.keys(TYPES)) {
      const list = items.filter(i => i.file === file && i.type === type);
      if (!list.length) continue;
      out.push(`**${TYPES[type]}**`, '');
      for (const i of list) {
        const what = type === 'bracket' ? (i.context && i.context !== i.text ? `${i.text} in: “${i.context}”` : i.text)
          : type === 'image' ? `Photo: ${i.text}`
          : type === 'link' ? `“${i.text}” needs a destination`
          : i.text;
        out.push(`- ${what} _(line ${i.line})_`);
      }
      out.push('');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const items = scan(JSON.parse(readFileSync('site.config.json', 'utf8')));
  writeFileSync('docs/CLIENT-QUESTIONS.md', report(items));
  for (const [t, n] of counts(items)) console.log(`${String(n).padStart(4)}  ${TYPES[t]}`);
  console.log(`Wrote docs/CLIENT-QUESTIONS.md (${items.length} items)`);
}
