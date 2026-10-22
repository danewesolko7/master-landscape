# Conventions

How the Master Landscape site is built and how to add or change pages. The visual design is
client-approved: review visual changes at 1440 and 390 before committing.

## Dependencies

Use as few as possible, only what is strictly needed.

- Runtime: none. The site is plain HTML, CSS and one small script.
- Build: Node built-ins only (`build.mjs`, `tools/*.mjs`).
- Dev: `@playwright/test` is the single devDependency (checks, the PDF step, image encoding).
  Do not add any other package (no sharp, PostCSS, frameworks) without asking.

## Folder layout

```
build.mjs              src/ -> dist/ (Node built-ins, no dependencies)
tools/pdf.mjs          prints pages with front matter `pdf:` to PDF (npm run build runs it)
site.config.json       site-wide values: url, phone, email, address, license
src/
  layouts/base.html    document shell: head, header, <main id="main">{{content}}</main>, footer
  layouts/document.html  print pages: head, a screen-only bar, <main>; no header, footer or quick bar
  partials/            head, header, footer (+ quick-action bar), logo, cta, service-areas,
                       procurement-card, facilities-map
  pages/<Page>.html    one file per URL; front matter + the page's sections
  assets/css/          site.css entry + layered files; components/<page-type>.css
  assets/js/nav.js     the only script (dropdown ARIA + Escape)
  assets/fonts/        self-hosted WOFF2
  assets/img/          generated photo variants (AVIF, WebP, JPEG); see Images
dist/                  build output (git-ignored); the only thing deployed
tools/images.mjs       photo variants + <picture> markup (run by hand, not by the build)
```

## Commands

```
npm run build                         # node build.mjs && node tools/pdf.mjs
node build.mjs                        # HTML only (quick); PDF links 404 until tools/pdf.mjs runs
SITE_URL=http://localhost:8000 npm run build   # local/staging absolute URLs
node build.mjs --prod                 # launch build: fails on placeholders or an unset formAction
node tools/placeholders.mjs           # list client placeholders, write docs/CLIENT-QUESTIONS.md
npm run serve                         # http://127.0.0.1:8000 from dist/
node tools/images.mjs encode <name>   # photo variants from source-images/<name>.jpg
```

In a fresh checkout or worktree run `npm ci` and `npx playwright install chromium` first.

`dist/` works opened from disk (file://), on localhost and on any domain. On file:// Chrome logs
CORS errors for the two font `<link rel="preload">`s; the fonts still load via @font-face. Expected.

## Pages

A page is front matter followed by its sections. The layout adds the document shell,
header, `<main>` and footer.

```html
<!--
title: Commercial Landscaping in Westminster | Master Landscape & Maintenance
description: Commercial, HOA, apartment and public agency landscaping in Westminster and across Orange County from our headquarters at 14600 Goldenwest St.
nav: areas
-->
<section aria-labelledby="page-title">
  ...
</section>
<!-- @include service-areas class="section section--soft" -->
<!-- @include cta heading="Need a proposal in&nbsp;<em>Westminster?</em>" text="..." img="palm-turf-hedge.jpg" alt="..." -->
```

Front matter keys (`key: value`, one per line, inside the leading `<!-- -->`):

| Key | Meaning |
|---|---|
| `title` | required. `<title>` and `og:title`: `<Topic> \| Master Landscape & Maintenance`, about 60 characters |
| `description` | required. Meta and `og:description`, 140–160 characters, specific to the page |
| `nav` | active header item: `services`, `clients`, `areas`, `about`, `contact`; omit for none |
| `schema` | JSON-LD type: `business` (home, About, Contact), `service` (pillar and sub-pages), `article` (guides); omit for none |
| `robots` | e.g. `noindex` (NotFound, ThankYou); such pages are left out of sitemap.xml |
| `layout` | layout file in `src/layouts/` (default `base`; `document` for print pages) |
| `parent` | parent page for the Sitemap page's tree when the page has no breadcrumb (e.g. `Certifications.html`) |
| `pdf` | output path of a print page's PDF (e.g. `assets/docs/capabilities-statement.pdf`); `tools/pdf.mjs` renders it and the build accepts links to it |
| `pdf_pages` | maximum PDF pages (default 1); `tools/pdf.mjs` fails if the page prints longer |
| `scripts` | extra scripts for this page only, comma-separated names from `src/assets/js/` (e.g. `forms` on index and Contact); `nav.js` loads everywhere |

Write `title` and `description` as plain text (`&`, `"`); the build escapes them. The build fails
if either is missing.

Any front matter key is available as `{{key}}`. Also available: every `site.config.json` key
(`{{phone}}`, `{{phone_tel}}`, `{{email}}`, `{{url}}`...), `{{domain}}` (the production host, for
printed text), `{{path}}` (`Westminster.html`, empty for
home), `{{canonical}}` and `{{form_action}}` / `{{form_method}}` (see Forms).

New pages are written by hand from the component catalog below. Reuse shared components first;
add page-type CSS only for something no other page type needs.

## Includes and variables

- `<!-- @include name key="value" -->` inserts `src/partials/name.html`. `{{key}}` inside the
  partial is filled from the attributes first, then from page and site variables. Values may
  contain HTML; use single quotes if the value contains `"`. Includes may nest.
- The build fails on a missing partial, an unresolved `{{var}}`, a broken relative link, a
  root-relative link (`/x`) or a link containing the site domain.
- Active nav: partial links carry `data-nav="x"`; the build turns the one matching the page's
  `nav` into `aria-current="page"` and strips the rest.

### Partials

| Partial | Used by | Variables |
|---|---|---|
| `head` | layout | page and site variables |
| `header` | layout | `nav` (front matter) |
| `footer` | layout (includes the mobile quick-action bar) | site variables |
| `cta` | closing dark band on most pages | `heading`, `text`, `img`, `alt` |
| `service-areas` | 30 pages: Services, pillars, audience pages, sub-pages, About, Certifications, Clients, Contact (home has its own variant without office notes) | `class`: `"section"` or `"section section--soft"` |
| `procurement-card` | PublicAgencies, Certifications | none |
| `logo` | header, StyleGuide, Capabilities | `size` |
| `facilities-map` | Contact, Capabilities (the three-facility map) | none |

## Links and URLs

- Every internal link and asset reference is relative: `Irrigation.html`, `assets/img/x.jpg`.
  Never `/x` and never `https://masterlandscapemaintenance.com/x`.
- The absolute URL (`{{url}}`, overridable with `SITE_URL`) is used only in the head partial
  (canonical, og:url, og:image), JSON-LD, sitemap.xml, robots.txt and the forms' hidden
  `_next` redirect value (form handlers need an absolute URL there).
- Phone numbers and emails in page text are links: `<a href="tel:{{phone_tel}}" class="link-quiet">{{phone}}</a>`,
  `<a href="mailto:{{email}}" class="link-quiet">{{email}}</a>`. `.link-quiet` keeps the surrounding
  text style. Not inside include attributes (`text="…"`): those stay plain text.

## SEO output

- Head partial: title, meta description, optional robots, canonical, Open Graph
  (`og:type` is `article` for `schema: article`, otherwise `website`), Twitter card, then JSON-LD.
- JSON-LD is one `@graph` per page, built in `build.mjs` from front matter `schema`, the page's
  `<h1>`, its `description`, `site.config.json`, and the breadcrumb `<nav aria-label="Breadcrumb">`
  (which becomes a BreadcrumbList). The business is a `HomeAndConstructionBusiness` with
  `@id` `{{url}}/#business`; Service pages name it as provider.
- Only facts the site already states go into JSON-LD. No ratings, opening hours, founding date,
  author or publish date until the client confirms them; add them to `site.config.json` or front
  matter and extend `structuredData()` then.
- The build writes `dist/sitemap.xml` (every page without `robots: noindex`) and `dist/robots.txt`.

## Forms

The proposal (home) and RFP (Contact) forms are handler-agnostic: no backend is chosen yet.

- `site.config.json` `formAction` is the endpoint. Empty (the default) means dev mode: the forms
  submit with GET to `ThankYou.html` so the flow works locally. When set, forms POST to it.
  `node build.mjs --prod` fails while it is empty.
- Every field has a `name`: `name`, `company`, `email`, `phone`, `property_type`, plus on Contact
  `property_city`, `services` and `attachment` (file; the form is `multipart/form-data`). Required:
  name, email, and services on Contact. A hidden `form` field says which form sent it
  (`home-proposal`, `contact-rfp`).
- Spam: a honeypot `website` field inside a `.visually-hidden`, `aria-hidden` label with
  `tabindex="-1"`. The handler must drop submissions where it is filled.
- Redirect: hidden `_next` = `{{url}}/ThankYou.html`. `_next` is Formspree's name; Netlify Forms
  uses the form's `action` path instead, and other handlers have their own field. Rename it when
  the handler is chosen.

### Form states (`src/assets/js/forms.js`)

Pages with a form set `scripts: forms`. The script enhances every `<form data-form>`; without it
the forms keep native browser validation and submit normally. All copy lives in the page as
`data-msg-*` attributes, so wording changes never touch the script.

| Attribute | On | Copy (from the design) |
|---|---|---|
| `data-msg-required` | each required field | Name "Enter your name." · Email "Enter your email address so we can reply." · Services "Tell us what the property needs, even in a sentence." |
| `data-msg-format` | field with a format (`pattern`, `type=email`) | Phone "Enter a 10-digit phone number." (falls back to `data-msg-required`) |
| `data-msg-sending`, `-sent`, `-failed` | `<form>` | "Sending your request…" · "Request received. Taking you to the confirmation page." · "We couldn't send your request. Check your connection and try again, or call 714.531.0549." |
| `data-max-mb`, `data-msg-size`, `data-msg-type` | file input | 25 · "That file is over 25 MB. Email it to info@… instead." · "Attach a PDF, Word document or ZIP file." (types come from `accept`) |

Behaviour:
- Validation runs on submit (the script sets `novalidate`). Each invalid field gets
  `aria-invalid="true"` and an error under it, linked with `aria-describedby`; focus moves to the
  first invalid field and a visually hidden `role="status"` region says how many need attention.
  A field with an error re-checks as it is edited; after the first submit, every field does.
- Phone is optional but must have 10 digits when filled: `pattern="\+?1?(?:\D*\d){10}\D*"`.
- Sending: the button gets `aria-busy` and `aria-disabled="true"` (it keeps focus; repeat
  submits are ignored) and shows the three-square mark. With a `formAction`, the form is sent
  with `fetch` (`FormData`, `Accept: application/json`): success shows the sent banner and goes
  to `ThankYou.html` after 1.2 s; failure restores the button and shows the failed banner. In dev
  (no `formAction`) the form goes straight to `ThankYou.html`.
- Upload: a wrong type or a file over the limit is cleared and gets a field error. A valid file
  replaces the picker with the attached row (name, size, Remove); Remove brings the picker back
  and focuses it. The `<input type="file">` stays the real control throughout.

## Placeholders

`tools/placeholders.mjs` scans `src/pages` and `src/partials` for content waiting on the client:
`.todo` notes, `[bracketed]` fill-ins, image placeholders, `href="#"` links and an empty
`formAction`. It writes `docs/CLIENT-QUESTIONS.md` (non-technical, grouped by page). Every build
prints the counts; `--prod` fails while any remain. Mark new unknowns the same way so they are
caught.

## CSS

`src/assets/css/site.css` declares the layers and imports each file; the build inlines the
imports into one `dist/assets/css/site.css` (one request, no @import waterfall).

```
@layer reset, tokens, base, layout, components, utilities;
```

Later layers win over earlier ones whatever the selector specificity, so component rules beat
the global `a`, `a:hover` and `:focus-visible` rules without extra specificity. Utilities win
over components.

| File | Contains |
|---|---|
| `reset.css` | margin resets, form font inherit |
| `tokens.css` | @font-face; color, type, shadow and stripe properties; the spacing, media-height and grid scales |
| `base.css` | body type, links, focus ring, no-widow text-wrap, skip link |
| `layout.css` | `.section`, `.section-head`, `.hero`, `.wrap`, `.split`, `.grid` |
| `components.css` | shared components (catalog below) |
| `components/<feature>.css` | components only one page or page type needs (table below) |
| `utilities.css` | single-purpose helpers (list below) |

Naming: plain BEM-style names (`.block`, `.block__element`, `.block--modifier`) that say what a
thing is (`.jump-nav`, `.toc`, `.form`, `.roster`), never which page group it came from and never a
pixel value. Sizes use named steps (`media--md`, `grid--wide`, `mt-2`); `npm run check` fails on a
class name containing a two-digit number. Use tokens (`var(--ink)`, `var(--space-6)`,
`var(--shadow-md)`...) instead of raw values. Move a page-specific component into `components.css`
as soon as a second page type needs it.

### Scales (`tokens.css`)

| Scale | Steps |
|---|---|
| Spacing `--space-1` … `--space-11` | 6, 10, 14, 18, 22, 28, 36, 44, 56, 64, 76 px |
| Media height `.media--xs/sm/md/lg/xl` | 160, 220, 280, 340, 400 px (`--media-*`) |
| Grid minimum column `.grid--narrow` / `.grid` / `.grid--wide` / `.grid--half` | 220, 280, 340, 520 px: 5, 4, 3, 2 across at 1440 |
| Gutter `--gutter` | `clamp(24px, 2.5vw, 32px)` |

Every gap, padding and margin in layouts and components uses a `--space-*` step. Controls keep
their own fixed sizes (button, input and chip padding, 44px+ heights), as do the header and footer.
Common pairings: section `--space-9` top / `--space-10` bottom, section gap `--space-7`, card
padding `--space-5` `--space-6`, grid gap `--space-6`.

### No-widow rule and element types

`base.css` applies `text-wrap: balance` to `h1, h2, h3, li, a, span, label, dt, figcaption,
button, nav, th, td, strong, em` and `text-wrap: pretty` to `p, dd, blockquote`. Changing an
element's type (e.g. `div` -> `ul/li`, `span` -> `p`) changes how its text wraps. When you make
markup more semantic, check the wrapping at 1440 and 390; if it moves, set `text-wrap` on the class to
match the original element.

## Component catalog

Shared components in `layout.css` / `components.css`. Reuse before adding.

**Section with heading row**
```html
<section aria-labelledby="s1" class="section section--soft">   <!-- or "section" (white) -->
  <div class="section__inner">
    <div class="section-head">
      <h2 id="s1" class="heading">Local&nbsp;<em>Proof</em></h2><p class="subhead">Note on the right</p>
    </div>
    ...
  </div>
</section>
```
`.section__inner--top` (`--space-7` top, first section), `--even` (bottom = top), `--tight`
(`--space-6` gap), `--flush` (block, small bottom). `.section--ruled` adds a bottom rule.

**Page top: breadcrumb + hero**
```html
<section aria-labelledby="page-title">
  <div class="section__inner section__inner--top">
    <nav aria-label="Breadcrumb" class="breadcrumb"><ol><li><a href="index.html">Home</a></li> <li aria-current="page">Page</li></ol></nav>
    <div class="hero">
      <div class="hero__main">
        <p class="eyebrow">Eyebrow</p>
        <h1 id="page-title" class="title">Heading <em>emphasis</em></h1>
        <p class="lede">Intro paragraph.</p>
        <div class="actions mt-2"><a href="Contact.html" class="btn btn--primary">Request a&nbsp;proposal&nbsp;→</a><a href="Contact.html#rfp" class="btn btn--secondary">Submit an&nbsp;RFP</a></div>
      </div>
      <div class="hero__aside"><p class="hero__note">Side note.</p></div>
    </div>
    <div class="frame frame--clip"><img src="assets/img/x.jpg" alt="..." class="media media--xl"></div>
  </div>
</section>
```
Keep the single space between breadcrumb `<li>`s; the separator is CSS.

**Wrap and split rows** (outside `.section__inner`)
```html
<div class="wrap">...</div>                    <!-- max width, --space-10 padding; --sm, --flush-top -->
<div class="split split--center">              <!-- copy beside media; --top, --reverse, --flush-top -->
  <div class="split__body"><h2 class="heading">...</h2><p>...</p></div>
  <img src="assets/img/x.jpg" alt="..." class="cta__media media media--lg">
</div>
```

**Type**: `.eyebrow` (`--muted`, `--sm`), `.title` (h1), `.heading` (h2), `.title-md` (28px:
callouts, forms), `.title-sm` (21px item title), `.label` (sans 14 bold uppercase), `.lede`,
`.subhead` (sans 15 semibold), `.desc` (sans 15/1.55 muted), `.meta` (sans 15 muted), `.text-ui`
(sans 15), `.hero__note`. `em` is always weight 400; inside `.cta` and `.band-dark` it is gold.

**Buttons**: `.btn` + `--primary` (gold, shadow) | `--secondary` (white) | `--sm` (48px, 16px)
| `--block` (full width) | `--on-dark` (with `--primary`, on dark bands) | `--ghost-light`.
`.text-link` (`--sm`) for arrow links.

**Cards**
```html
<ul class="grid grid--narrow">   <!-- grid--narrow (5-up), grid (4-up), grid--wide (3-up), grid--half (2-up); --start -->
  <li><a href="Maintenance.html" class="link-card">   <!-- link-card--roomy: 22/24 padding -->
    <span class="card-title">Title</span><span class="desc">Text</span><span class="card-more">Title&nbsp;→</span>
  </a></li>
</ul>
<article class="card">
  <div role="img" aria-label="Image placeholder: ..." class="placeholder"><span class="placeholder__label">...</span></div>
  <div class="card-body card-body--rule"><p class="eyebrow eyebrow--sm">Kind</p><h3 class="card-name">Name</h3><p class="meta">Text</p></div>
</article>
```
`.card-title` 19px, `--md` 20px, `--lg` 22px. `.card-body` modifiers: `--rule` (top border), `--sm`,
`--lg`, `--grow` (fills the card). `.card-head` (title row with a value at the end), `.num-title`
(number beside a title), `.card-text`. `.tag` + `--soft`/`--gold`, `.badge`. `.review-card`
(+ `__stars`, `__quote`, `__score`), `.review-summary`, `.card-more--flush`.

**Service areas**: use the `service-areas` partial. The pieces, for other layouts:
```html
<li class="area-card">
  <h3 class="card-title card-title--md"><a href="OrangeCounty.html" class="no-underline">Orange&nbsp;County</a></h3>
  <ul class="chips"><li><a href="Westminster.html" class="chip">Westminster<span class="chip__note">· Main&nbsp;office</span></a></li></ul>
</li>
```

**Callout** (pale gold box, e.g. AB 1572 or emergency)
```html
<section aria-labelledby="ab-title" class="section">
  <div class="wrap wrap--sm">
    <div class="callout">
      <div class="callout__body"><h2 id="ab-title" class="title-md">Title</h2><p class="callout__text">Text</p></div>
      <a href="GuideAB1572.html" class="btn btn--primary callout__btn">Read the&nbsp;guide&nbsp;→</a>
    </div>
  </div>
</section>
```

**Dark bands**: `.cta` (closing band with top rule; use the `cta` partial) and `.band-dark`
(no rule). On dark: `.stats` (+ `--rule`, `__value`, `__value--lg`, `__label`; items are plain
`<li>`s, the first has no left rule), `.dark-list` (ruled checklist), `.text-gold-pale`.
```html
<section aria-label="At a glance" class="band-dark">
  <ul class="stats"><li><span class="stats__value">40+</span><span class="stats__label">years</span></li>...</ul>
</section>
<section aria-labelledby="why-title" class="cta">
  <div class="split split--center">
    <div class="split__body"><p class="eyebrow text-gold-pale">Why us</p><h2 id="why-title" class="heading">...</h2>
      <ul class="dark-list"><li>Point</li></ul></div>
    <img src="assets/img/x.jpg" alt="..." class="cta__media media media--lg">
  </div>
</section>
```

**Procurement**: `.procure-intro` (+ `__text`) beside the `procurement-card` partial in a `.split`.
`.facts-dark` is its `dl` of label/value rows on dark.

**Media**: `.frame` (border + 8px shadow) + `--md` (6px shadow), `--clip`; `img.media` + height
`--xs/sm/md/lg/xl` + `--rule` (bottom border). Heights also size a `.placeholder`, the striped
stand-in for missing photos (`--dark` on dark bands, with `.placeholder__label--dark`).
`.cover` fills a positioned frame (`position: absolute; inset: 0; object-fit: cover`).

**Lists**: `ul.points` (numbered rules in 280px+ columns;
`<li><span class="points__num">01</span><h3 class="title-sm">..</h3><p class="desc">..</p></li>`),
`dl.faq` (`<div><dt>Q</dt><dd>A</dd></div>`).

**Notes**: `.todo` marks client "To confirm" notes; `build --prod` must fail while any remain.

**CTA band** (closing dark section): use the partial.
```html
<!-- @include cta heading="Need a proposal in&nbsp;<em>City?</em>" text="..." img="palm-turf-hedge.jpg" alt="..." -->
```

**Utilities** (`utilities.css`, win over components): `.self-start`, `.mt-1`, `.mt-2`, `.mt-auto`,
`.flex-none`, `.nowrap`, `.no-underline`, `.link-offset`, `.measure`, `.measure--wide`,
`.text-white`, `.text-gold-pale`, `.visually-hidden`, `.hit`.

**Touch targets** (client rule: 44×44). A small standalone link gets `.hit`: an invisible
`::after` hit area of at least 44×44 centred on it, with no layout or paint change. Breadcrumb
links get the same area from 720px up (they wrap below that). Use `.hit` only where the area
cannot reach another control; `npm run check` reports `target-covered` if it does (stacked
links closer than 44px need more spacing instead, which is a visible change). Map links get
transparent `<rect class="map__hit">` areas from `node tools/map-hit-areas.mjs`.

**Forms** (`components.css`, shared by the home and Contact forms)
```html
<form data-form ... class="form form--rfp">             <!-- --consult (home) or --rfp (Contact) -->
  <label class="field">Name<input type="text" name="name" required class="input input--fill"></label>
  <div class="field-row">                                <!-- fields side by side, 180px min each -->
    <label class="field">Email<input type="email" name="email" required class="input input--fill"></label>
    <label class="field">Phone<input type="tel" name="phone" class="input input--fill"></label>
  </div>
  <label class="field">Property type<select name="property_type" class="input input--fill input--select">...</select></label>
  <label class="field">Services needed<textarea name="services" rows="4" class="input input--fill input--area"></textarea></label>
  <div class="upload"><span class="upload__title">Submitting an&nbsp;RFP?</span>
    <label class="field field--sm">Attach specs<input type="file" name="attachment" class="input-file"></label></div>
  <button type="submit" class="submit">Request my&nbsp;proposal</button>
  <p class="form-note">Customer Satisfaction Guaranteed</p>
</form>
```

**Form states** (`components.css`, set by `forms.js`; the default look is unchanged).
```html
<!-- Field error: inside the field's <label>, after the control -->
<label class="field">Email
  <input type="email" name="email" required class="input"
         aria-invalid="true" aria-describedby="rfp-email-error">
  <span class="field-error" id="rfp-email-error" aria-hidden="true">
    <span class="field-error__text">Enter your email address so we can&nbsp;reply.</span>
  </span>
</label>
```
`input/select/textarea[aria-invalid="true"]` gets the `--error` border. `.field-error::before`
draws the 18px "!" square (CSS content with empty alt text, so it is not read out).
`aria-hidden` keeps the message out of the field's name; `aria-describedby` still reads it.
Disabled fields (`:disabled`) use `--disabled-line`, `--disabled-bg`, `--disabled-text`.

```html
<!-- Submit while sending -->
<button type="submit" class="submit" aria-busy="true" aria-disabled="true">
  <span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>Sending your&nbsp;request…
</button>

<!-- Whole-form result, inserted before the submit button (hidden until used) -->
<div class="form-alert form-alert--success" role="status">
  <span class="form-alert__icon" aria-hidden="true">✓</span>
  <span class="form-alert__text">Request received. Taking you to the confirmation&nbsp;page.</span>
</div>
<div class="form-alert form-alert--error" role="alert">
  <span class="form-alert__icon" aria-hidden="true">!</span>
  <span class="form-alert__text">We couldn't send your request. …</span>
</div>

<!-- RFP panel with a file attached: the picker label is [hidden] -->
<div class="upload upload--attached">
  <span class="upload__title">Submitting an&nbsp;RFP?</span>
  <label class="field field--sm" hidden>…<input type="file" …></label>
  <div class="upload__file">
    <span class="upload__name"><strong>Bid-package-2027.pdf</strong> · 2.4&nbsp;MB</span>
    <button type="button" class="upload__remove hit">Remove</button>
  </div>
</div>
```
`[hidden]` always wins (`reset.css`), so scripts can hide elements that have their own `display`.

## Style guide

`src/pages/StyleGuide.html` builds to `dist/StyleGuide.html`: the living design system, made
from the real CSS and partials (logo, color and contrast, type, layout, every shared component,
navigation, forms and their error copy, designed-but-unbuilt states, voice and imagery, brand
assets).

- `robots: noindex` keeps it out of search and `sitemap.xml`; it is not linked from the nav or footer.
- `placeholders: example` in its front matter tells `tools/placeholders.mjs` to skip it, so its
  demo `.todo` note and image placeholder never count as client work.
- Its own CSS is `components/styleguide.css` (swatches, specimens, demo frames, code samples
  only). Examples inside it use the site classes unchanged.
- Each example and its `<pre><code>` snippet are the same markup; edit both together.
  Snippets are escaped HTML and must not contain `{{` (the build would try to fill it).
- **A new shared component goes into `components.css`, this file's catalog and the style guide.**
- The logo is `src/partials/logo.html` (`<!-- @include logo size="42" -->`), shared by the header
  and the style guide.

## Images

Photos are wrapped in `<picture>` so browsers pick AVIF, then WebP, then JPEG, at the smallest
width that covers the slot. The component snippets above show a bare `<img>` for brevity; in
pages every photo looks like this (one line in the source):

```html
<picture>
  <source type="image/avif" srcset="assets/img/x-533.avif 533w, assets/img/x.avif 1066w" sizes="(max-width: 900px) calc(100vw - 52px), 600px">
  <source type="image/webp" srcset="assets/img/x-533.webp 533w, assets/img/x.webp 1066w" sizes="(max-width: 900px) calc(100vw - 52px), 600px">
  <img src="assets/img/x.jpg" srcset="assets/img/x-533.jpg 533w, assets/img/x.jpg 1066w" sizes="(max-width: 900px) calc(100vw - 52px), 600px"
       width="1066" height="800" alt="..." class="media media--xl" loading="lazy" decoding="async">
</picture>
```

- **Files**: put a new original in `source-images/<name>.jpg` (create the folder; not deployed).
  The current photos have no originals in the repo, so replace them with real project photos
  rather than re-encoding them.
  `node tools/images.mjs encode <name>` writes `src/assets/img/<name>.{avif,webp,jpg}` at the source
  width plus `<name>-<w>.*` for smaller widths (targets 480/800/1200, snapped to widths that keep the
  aspect ratio exact; images under ~480px get only the full size and a plain `srcset="x.avif"`).
  Encoders: `sips` (AVIF q45, JPEG q62) and Playwright's Chromium canvas (WebP 0.78). No packages.
  AVIF below ~q40 visibly smears grass, so keep it at 45.
- **`sizes`**: the slot's rendered width: `(max-width: 900px) calc(100vw - <gutters>px), <desktop px>`.
  Measure with Playwright at 390 and 1440 if unsure; overestimating is safe, underestimating blurs.
- **`width`/`height`**: the source's pixel size. They reserve the aspect ratio (no layout shift);
  CSS still sets the rendered size (`img { height: auto }` unless a class sets a height).
- **Loading**: `loading="lazy"` for everything below the first viewport at 390 or 1440. Images in the
  first viewport are eager; the first one on the page also gets `fetchpriority="high"`.
  `decoding="async"` on all. The `cta` partial's photo is lazy and fixed in the partial.
- **CSS**: `picture { display: contents }` keeps the `<img>` the flex/grid item it was before, and
  `picture > source { display: none }` stops the sources becoming flex items that take a gap.
  Put classes on the `<img>`, never on `<picture>`.
- **Checking**: compare a re-encoded photo with its original by eye at 2x zoom; AVIF below
  ~q40 smears fine texture first.
- `og-image.png`, favicons and icons are not photos: plain files, no `<picture>`.

## Page-specific CSS

Files are named after what they style. Forms, cards, bands, callouts and lists are shared and live
in `components.css`.

| File | Pages | Components |
|---|---|---|
| `components/home.css` | index | `.home-hero`, `.trust-band`, `.all-services`, `.home-about`, `.features` |
| `components/services.css` | Services | `.jump-nav`, `.service-row`, `.link-list` |
| `components/audience.css` | PublicAgencies, CommercialProperties, HOA | `.roster`, `.quote-card`, `.case-teaser` |
| `components/areas.css` | ServiceAreas, OrangeCounty, InlandEmpire, 9 city pages | `.map`, `.hub-card`, `.region-card`, `.office-card`, `.location__title` |
| `components/articles.css` | 7 guides, Resources | `.article-layout`, `.toc`, `.article`, `.article-summary`, `.steps`, `.checklist`, `.data-table`, `.sources`, `.feature-guide` |
| `components/about.css` | About, Team | `.about-intro`, `.leader`, `.inline-list`, `.process`, `.team-intro` |
| `components/clients.css` | Clients, CaseStudy | `.client-list`, `.facts`, `.case-study` |
| `components/credentials.css` | Certifications | `.cred-card` |
| `components/gallery.css` | Gallery | `.filter-bar`, `.filters`, `.filter`, `.gallery` |
| `components/contact.css` | Contact | `.contact-aside`, `.contact-card`, `.contact-list`, `.emergency-card` |
| `components/prose.css` | Privacy, Sitemap | `.prose`, `.sitemap` |
| `components/styleguide.css` | StyleGuide | swatches, specimens, demo frames, code samples |

The sub-pages (irrigation, tree care, construction, property services) use only shared components.

## Capabilities statement

`src/pages/Capabilities.html` (`layout: document`, `robots: noindex`) is the one-page US Letter
capabilities statement; `tools/pdf.mjs` prints it to `dist/assets/docs/capabilities-statement.pdf`,
which the download links on home, PublicAgencies and Certifications point to. Edit the page, not a
PDF: contact details come from `site.config.json`, its `[to confirm]` values are tracked by
`tools/placeholders.mjs`, and its CSS is `components/capabilities.css` (sizes in `em` of `.sheet`,
an `@page` letter setup and a print block that hides the screen-only bar). In the PDF, relative
links are rewritten to the production site. The PDF step fails if the sheet grows past one page.

## Checks

```
npm run check            # full build (HTML + PDF) + tools/check.mjs on every page (CI runs this)
npm run check:external   # also HEAD-requests external links
node tools/check.mjs --json Page1 Page2   # subset; findings in test-results/check.json
```

`tools/check.mjs` fails on: broken links or `#fragments`, root-relative links, links to the
site's own domain (outside the canonical link and JSON-LD), `href="#"`, `style=""` outside SVG,
class names containing a two-digit number (`value-class`: use the named scales),
broken CSS `url()`s, widows and overflow at 1440 and 390, not exactly one `h1`, skipped heading
levels, missing landmarks or `lang`, duplicate ids, unnamed links, buttons or form controls,
missing `alt`, links inside `role="img"`, text contrast under 4.5:1 (3:1 large), touch targets
under 44×44 measured as the effective hit area (links inside running text are exempt; a map
link with a full-size twin on the same page is listed as `target-size-equivalent`, info only),
hit areas covering another control (`target-covered`), and on `index.html` the skip link, focus
ring and dropdown behaviour. Missing title, description, canonical or og:image only warn.
Details: `tools/README.md`.

## Definition of done (per change)

- `npm run check` passes with no new errors.
- Visual changes reviewed by eye at 1440 and 390, and intended.
- No `style=""` attributes in `src/` except inside inline `<svg>`, and no class names with pixel values.
- One `<h1>`; content inside the layout's `<main>`; sections labelled with `aria-labelledby`.
- `npm run build` finishes with no errors.

