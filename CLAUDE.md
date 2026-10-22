# CLAUDE.md

Context for Claude Code working in this repo.

## Project

Website for Master Landscape & Maintenance, Inc., a commercial landscape maintenance contractor in Southern California (Westminster main office, Irvine facility, Chino facility and nursery). Audience: public agencies, HOAs and property managers, corporate campuses. Goal: a hyperlocal SEO site with service pillars, sub-pages, city pages and guides. Domain: masterlandscapemaintenance.com.

The design is client-approved. **`src/` is the source of truth.** `build.mjs` builds it into `dist/`, which is the only thing deployed.

Read `docs/CONVENTIONS.md` before changing pages, partials or CSS. It holds the component catalog and the definition of done.

## Build rules

- Semantic vanilla HTML, CSS and JS. No frameworks, bundlers or CSS tooling.
- Fewest dependencies possible. Runtime: none. Build: Node built-ins only. Dev: `@playwright/test` is the only package. Ask before adding any other.
- Every internal link and asset path is relative, so `dist/` works from disk, on localhost and on any domain. The site URL (`site.config.json`, or `SITE_URL`) appears only in the canonical link, Open Graph tags, JSON-LD and `sitemap.xml`.
- Check visual changes by eye at 1440 and 390.

## Commands

```
npm ci && npx playwright install chromium
npm run build                                  # src/ -> dist/
SITE_URL=http://localhost:8000 npm run build   # local/staging absolute URLs
node build.mjs --prod                          # launch build with production checks
npm run serve                                  # http://127.0.0.1:8000
npm run check                                  # links, HTML, accessibility, widows, targets
```

## Site map

- Home (`index.html`), Services, Clients, Service Areas, About, Contact
- 5 pillars: Maintenance, Irrigation, TreeCare, Construction, PropertyServices, plus PublicAgencies, CommercialProperties, HOA
- Sub-pages under each pillar (e.g. IrrigationAudits, Pruning, Hardscape, EmergencyService)
- Regional hubs: OrangeCounty, InlandEmpire. City pages: Westminster, Irvine, Anaheim, GardenGrove, LagunaNiguel, SantaAna, Chino, ChinoHills, Corona
- Proof: CaseStudy, Gallery, Certifications, Team. Resources hub plus 7 guides (Guide*.html)
- Utility: Privacy, ThankYou, NotFound

## Design system (see `StyleGuide.html` from `src/pages/StyleGuide.html`, and `src/assets/css/tokens.css`)

- Colors: ink #13281C, deep #1D3B2A, gold #F2B33D, pale gold #F7D58B, soft #F4F6F2, muted #3E4E44, rule #B9C4BC, dark line #2C5440, on-dark #D6E2DA, error #A4262C
- Never put white text on gold (1.9:1). Ink on gold is 8.4:1.
- Type: Source Serif 4 for headings and body copy; IBM Plex Sans for UI, labels, nav and buttons (self-hosted WOFF2)
- Form: 2px ink borders, hard offset shadows (4/6/8px, no blur), square corners, 1320px max width
- Spacing: one `--space-1` … `--space-11` scale (6–76px); named sizes for media heights (`media--xs`…`--xl`) and grids (`grid--narrow`, `grid`, `grid--wide`, `grid--half`). No class names with pixel values (`npm run check` fails on them)
- Hero: shared two-column grid `.hero` (2fr / 1fr), one column under 900px
- Header: Services dropdown (`.dropdown`, ARIA from `nav.js`); under 720px a `<details class="menu">` Menu button replaces the nav
- Maps are inline SVG built from real county boundaries, edited in the page source. `tools/map-hit-areas.mjs` adds their touch targets

## Rules the client cares about

- No widows anywhere: headings use `text-wrap: balance`, paragraphs `text-wrap: pretty`, and the last two words of short items are joined with `&nbsp;`. Check at 1440px and 390px (`npm run check` does).
- Consistent heroes across every page
- Keep it simple. No decorative extras.
- Minimum 44px touch targets; visible focus ring (3px ink outline plus pale-gold halo)

## Next steps

1. Choose hosting and a form endpoint. The forms are handler-agnostic: the action comes from `site.config.json`.
2. Get answers to the placeholder questions in `docs/CLIENT-QUESTIONS.md` (`[to confirm]` values, `[City]`/`[Name]` fill-ins, review dates) and fill them in.
3. Replace the striped image placeholders with real project photos.
4. Resolve the remaining `npm run check` findings: mobile breadcrumb, AB 1572 source-link and Service Areas map touch targets, and the Contact file input. Each needs a visible change and the client's sign-off.
5. Deploy `dist/`.
