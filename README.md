# Master Landscape & Maintenance: website

The website for Master Landscape & Maintenance, Inc., a commercial landscape maintenance
contractor in Westminster, CA. It's a static site in semantic vanilla HTML, CSS and two small
scripts, built from shared components by a zero-dependency Node script. The design is
client-approved.

## Quick start

```
npm ci                  # installs @playwright/test, used only by the checks
npm run build           # src/ -> dist/, then the capabilities statement PDF
npm run serve           # http://127.0.0.1:8000
```

Or open `dist/index.html` straight from disk: every link is relative.

`SITE_URL=http://localhost:8000 npm run build` points canonical URLs at a local or staging host.
Production uses `https://masterlandscapemaintenance.com` from `site.config.json`.

## Checks

```
npx playwright install chromium   # once
npm run check            # build + links, HTML, accessibility, widows (tools/check.mjs)
npm run check:external   # also requests every external link
```

CI runs `npm run check` on every pull request and on pushes to `main`.

## Layout

| Path | Contents |
|---|---|
| `src/pages/` | One file per page: front matter and the page's sections |
| `src/partials/`, `src/layouts/` | Shared head, header, footer and components |
| `src/assets/` | CSS (layered, one file in `dist/`), `nav.js`, fonts, images |
| `build.mjs`, `site.config.json` | The build and site-wide values (URL, phone, address) |
| `dist/` | Build output, the only thing deployed (git-ignored) |
| `docs/CONVENTIONS.md` | How pages, components and CSS work. Read before editing. |
| `tools/` | Build checks, visual diff, local server, image and map helpers. See `tools/README.md`. |
