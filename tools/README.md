# Tools

Development tools. None of them ship with the site. They use Node built-ins plus
`@playwright/test`, the project's only devDependency.

| Tool | Command | What it does |
|---|---|---|
| `check.mjs` | `npm run check` | Builds (HTML and PDF), then runs the launch checks on every page in `dist/` (see below). Exits 1 on any error. |
| `check-dom.mjs` | (used by `check.mjs`) | The in-browser checks: widows, overflow, headings, landmarks, names, contrast, touch targets |
| `serve.mjs` | `npm run serve` | Zero-dependency static server for `dist/` on http://127.0.0.1:8000 |
| `map-hit-areas.mjs` | `node tools/map-hit-areas.mjs` | Gives map links in `src/pages` and `src/partials` `role="group"` on their `<svg>`, readable names and transparent 44×44 hit rects, sized at the smallest scale on any page showing the map and kept apart. Maps are matched by `aria-label`, so each must be unique. Idempotent: re-run after editing a map |
| `pdf.mjs` | `npm run build` (after `build.mjs`) | Prints every page with front matter `pdf:` from `dist/` to that path with Chromium, links rewritten to the production site; fails past `pdf_pages` (1) |
| `images.mjs` | `node tools/images.mjs encode [name]` | Encodes a new photo placed in `source-images/` into AVIF, WebP and JPEG variants in `src/assets/img/` (macOS `sips` + Playwright Chromium) |
| `placeholders.mjs` | `node tools/placeholders.mjs` | Lists content still waiting on the client and writes `docs/CLIENT-QUESTIONS.md` |

## check.mjs

```
node tools/check.mjs [--build] [--external] [--json] [Page ...]
```

- `--build` runs the full build first, `build.mjs` then `tools/pdf.mjs` (`npm run check` passes it).
- `--external` HEAD-requests every external link (`npm run check:external`).
- `--json` writes `test-results/check.json`.

File checks: internal links and `#fragments` resolve; no root-relative links; no links to the
site's own domain outside the canonical link and JSON-LD; no placeholder `href="#"`; no
`style=""` outside SVG; no class names with a two-digit number (`value-class`); CSS `url()`s resolve; title, description, canonical and og:image present
(warning only).

Browser checks at 1440 and 390: widows (words joined with `&nbsp;` count as one), element and
page overflow, one `h1` and no skipped heading levels, landmarks, `lang`, duplicate ids, names
for links, buttons and form controls, `alt` on images, no links inside `role="img"`, text
contrast (4.5:1, or 3:1 for large text; text over images or gradients is listed for manual
review in `--json`), and 44×44 touch targets. Each target finding says where it is: breadcrumb,
map, header, footer, form or content.

Touch targets are measured as the effective hit area: a control smaller than 44×44 passes when
every point of a 44×44 square centred on it hits the control (so `.hit` areas and map hit rects
count, and a neighbour that steals part of the square fails it). Links inside running text are
exempt. A map link that cannot reach 44px is listed as `target-size-equivalent` (info) when the
same page links to the same place with a full-size target (WCAG 2.5.8). `target-covered` fails
when any hit area covers part of another control's visible box. Honeypot fields
(`aria-hidden`, `tabindex="-1"`) and the content of closed `<details>` are skipped.

Interaction checks on `index.html`: the first Tab reaches a visible skip link that jumps to
`#main`; the first 15 focusable elements show a focus style; the Services dropdown sets
`aria-expanded` and closes on Escape.
