// In-page checks for tools/check.mjs. Each function runs inside the browser via page.evaluate,
// so it must be self-contained. Each returns [{ type, level, text }].

// Widows, element overflow and horizontal page overflow.
// A widow is a block whose last line holds one word while the line above holds more. Words joined
// with &nbsp; count as one word, so intentional joins never trip it.
export function layout() {
  const out = [];
  const inline = el => getComputedStyle(el).display.startsWith('inline');
  const blockOf = el => { while (el && inline(el)) el = el.parentElement; return el; };
  const blocks = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) if (n.textContent.trim()) blocks.add(blockOf(n.parentElement));

  for (const block of blocks) {
    // Code samples (<pre>) are not prose: their line breaks are fixed, so widows do not apply.
    if (!block || block.closest('svg, script, style, pre, [aria-hidden="true"]') || block.querySelector('br')) continue;
    const words = [];
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let t; (t = w.nextNode());) {
      if (blockOf(t.parentElement) !== block) continue;
      for (const m of t.textContent.matchAll(/[^ \n\t\r]+/g)) {
        const r = document.createRange();
        r.setStart(t, m.index); r.setEnd(t, m.index + m[0].length);
        const rects = [...r.getClientRects()].filter(x => x.width > 0);
        if (rects.length) words.push({ word: m[0], top: rects.at(-1).top, h: rects.at(-1).height });
      }
    }
    if (words.length < 2) continue;
    const lines = [];
    for (const word of words) {
      let line = lines.find(l => Math.abs(l.top - word.top) < word.h * 0.5);
      if (!line) lines.push(line = { top: word.top, words: [] });
      line.words.push(word.word);
    }
    if (lines.length < 2) continue;
    lines.sort((a, b) => a.top - b.top);
    const count = l => l.words.join(' ').split(/\s+/).filter(x => x && !/^[→·/|–—]$/.test(x)).length;
    if (count(lines.at(-1)) === 1 && count(lines.at(-2)) > 1) {
      out.push({ type: 'widow', level: 'error', text: `<${block.tagName.toLowerCase()}> …${block.textContent.trim().replace(/\s+/g, ' ').slice(-60)}` });
    }
  }

  for (const el of document.querySelectorAll('h1, h2, h3, p, li, a, span, dd, dt, label, button')) {
    const parent = el.parentElement;
    const details = el.closest('details');
    if (!parent || (details && !details.open && !el.closest('summary'))) continue;
    const r = el.getBoundingClientRect(), pr = parent.getBoundingClientRect();
    if (r.width && r.right > pr.right + 2 && getComputedStyle(parent).overflow === 'visible') {
      out.push({ type: 'overflow', level: 'error', text: `<${el.tagName.toLowerCase()}> ${el.textContent.trim().slice(0, 50)}` });
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    out.push({ type: 'page-overflow', level: 'error', text: `scrollWidth ${document.documentElement.scrollWidth} > ${innerWidth}` });
  }
  return out;
}

// Document structure: headings, landmarks, names, images, contrast and touch targets.
export function audit() {
  const out = [];
  const add = (type, level, text) => out.push({ type, level, text });
  const visible = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && +s.opacity > 0;
  };
  const describe = el => `<${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}> ${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)}`;

  // Headings
  const h1s = document.querySelectorAll('h1');
  if (h1s.length !== 1) add('headings', 'error', `${h1s.length} <h1> elements`);
  let prev = 0;
  for (const h of document.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const level = +h.tagName[1];
    if (prev && level > prev + 1) add('headings', 'error', `h${prev} -> h${level}: ${describe(h)}`);
    prev = level;
  }

  // Document and landmarks
  if (!document.documentElement.lang) add('lang', 'error', '<html> has no lang');
  for (const sel of ['header', 'nav', 'main', 'footer']) if (!document.querySelector(sel)) add('landmarks', 'error', `no <${sel}>`);
  const ids = new Map();
  for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) || 0) + 1);
  for (const [id, n] of ids) if (n > 1) add('duplicate-id', 'error', `#${id} x${n}`);

  // Accessible names
  const textName = el => (el.getAttribute('aria-label') || '').trim()
    || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join('').trim()
    || el.textContent.trim()
    || [...el.querySelectorAll('img[alt]')].map(i => i.alt).join('').trim()
    || (el.getAttribute('title') || '').trim();
  for (const el of document.querySelectorAll('a[href], button, summary')) {
    if (!textName(el)) add('empty-control', 'error', `${el.outerHTML.slice(0, 80)}`);
  }
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea')) {
    const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.closest('label')
      || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.getAttribute('title');
    if (!named) add('form-name', 'error', el.outerHTML.slice(0, 80));
  }
  for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) add('img-alt', 'error', img.getAttribute('src'));
  // role="img" makes its children presentational, so links inside it vanish for screen readers.
  for (const el of document.querySelectorAll('[role="img"] a[href], [role="img"] button')) {
    add('hidden-control', 'error', `inside role="img" (${el.closest('[role="img"]').getAttribute('aria-label') || ''}): ${describe(el)}`);
  }

  // Contrast: rendered text colour against the first solid background up the tree.
  const rgba = c => (c.match(/[\d.]+/g) || []).map(Number).concat(1).slice(0, 4);
  const lum = ([r, g, b]) => {
    const f = v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (top, bottom) => top.slice(0, 3).map((v, i) => v * top[3] + bottom[i] * (1 - top[3]));
  const backdrop = el => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none') return null;
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] === 1) break; }
    }
    return layers.reduceRight((acc, c) => over(c, acc), [255, 255, 255]);
  };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = walker.nextNode());) {
    const el = n.parentElement;
    if (!n.textContent.trim() || seen.has(el) || el.closest('svg, script, style, [aria-hidden="true"], .visually-hidden') || !visible(el)) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const bg = backdrop(el);
    if (!bg) { add('contrast-manual', 'info', `text over an image or gradient: ${describe(el)}`); continue; }
    const fg = over(rgba(s.color), bg);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
    if (ratio < (large ? 3 : 4.5)) add('contrast', 'error', `${ratio.toFixed(2)}:1 (${s.color} on rgb(${bg.map(Math.round)})) ${describe(el)}`);
  }

  // Touch targets: 44x44 (client rule). Links inside running text are exempt (WCAG 2.5.8 inline exception).
  const inText = el => {
    if (!getComputedStyle(el).display.startsWith('inline') || el.tagName !== 'A') return false;
    const block = el.closest('p, li, dd, td, figcaption, blockquote, address, label');
    return block && block.textContent.trim().length > el.textContent.trim().length + 2;
  };
  // A box smaller than 44x44 still passes when every point of a 44x44 square centred on it hits
  // the control: that covers invisible hit areas (::after boxes, transparent SVG rects) and fails
  // when a neighbouring target steals part of the square.
  const hitArea = el => {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const hit = document.elementFromPoint(cx - 21.5 + i * 10.75, cy - 21.5 + j * 10.75);
      if (!hit || !el.contains(hit)) return false;
    }
    return true;
  };
  // Invisible hit areas must never cover another control's visible box (a tap on its text
  // would open the neighbour). Sample a 3x3 grid inside every fragment of the control.
  const covered = el => {
    if (el.closest('svg')) return null; // map links: hit rects are laid out without overlap
    el.scrollIntoView({ block: 'center', inline: 'center' });
    for (const r of el.getClientRects()) {
      if (r.width < 3 || r.height < 3) continue;
      for (let i = 1; i <= 3; i++) for (let j = 1; j <= 3; j++) {
        const hit = document.elementFromPoint(r.left + r.width * i / 4, r.top + r.height * j / 4);
        const owner = hit?.closest('a[href], button, summary, input, select, textarea, label, [role=button]');
        if (owner && owner !== el && !owner.contains(el) && !el.contains(owner)) return owner;
      }
    }
    return null;
  };
  const big = el => { const r = el.getBoundingClientRect(); return (r.width >= 44 - 0.5 && r.height >= 44 - 0.5) || hitArea(el); };
  for (const el of document.querySelectorAll('a[href], button, summary, input:not([type=hidden]), select, textarea, [role=button]')) {
    if (el.classList.contains('skip-link') || !visible(el)) continue;
    // Content of a closed <details> is laid out but neither painted nor hit-testable.
    if (el.closest('details:not([open])') && !el.closest('summary')) continue;
    // Honeypot fields: hidden from assistive tech and out of the tab order on purpose.
    if (el.closest('[aria-hidden="true"]') && el.tabIndex < 0) continue;
    const where = el.closest('svg') ? 'map' : el.closest('.breadcrumb') ? 'breadcrumb' : el.closest('footer') ? 'footer'
      : el.closest('header') ? 'header' : el.closest('form') ? 'form' : 'content';
    const thief = covered(el);
    if (thief) add('target-covered', 'error', `${where}: ${describe(el)} is partly covered by ${describe(thief)}`);
    if (inText(el) || big(el)) continue;
    const r = el.getBoundingClientRect();
    const size = `${Math.round(r.width)}x${Math.round(r.height)} ${describe(el)}`;
    // A map label too close to its neighbours passes when the same page links to the same place
    // with a full-size target (WCAG 2.5.8 "equivalent" exception).
    const href = el.getAttribute('href');
    const twin = where === 'map' && href && [...document.querySelectorAll('a[href]')]
      .some(o => o !== el && !o.closest('svg') && o.getAttribute('href') === href && visible(o) && big(o));
    if (twin) add('target-size-equivalent', 'info', `${where}: ${size} (same link at full size elsewhere on the page)`);
    else add('target-size', 'error', `${where}: ${size}`);
  }
  scrollTo(0, 0);
  return out;
}
