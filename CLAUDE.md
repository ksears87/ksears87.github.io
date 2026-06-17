# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A static personal portfolio/blog site for Keelan Sears, hosted on GitHub Pages (custom domain via `CNAME`: www.keelansears.com). No build step, no package manager, no framework — just hand-written HTML/CSS/JS served directly.

## Commands

There is no build, lint, or test tooling. To preview locally, just open the HTML files directly in a browser, or serve the directory with any static file server (e.g. `python3 -m http.server`).

## Architecture

- `index.html` — homepage. Single page with anchor-linked sections: hero, `#writing` (cards linking to the long-form pieces below), `#work` (career timeline), `#now`, and a contact band.
- `expense-management.html`, `who-is-martha-richter.html`, `reading-the-footnotes.html` — standalone long-form article pages, each a full HTML document (not includes/partials). Each defines its own `<title>` and wraps its body content in `<article class="section">` or `<section class="section">`, matching the visual rhythm of the homepage sections.
- `nav.js` — single shared script loaded by every page (`<script src="nav.js?v=N">`). Handles: closing nav dropdowns (`details.nav-dropdown`) on outside click/Escape/item-click, custom eased smooth-scrolling for in-page `#anchor` links (with a `prefers-reduced-motion` bypass), scroll-spy nav highlighting via `IntersectionObserver` (homepage only, harmless elsewhere), and an injected contact modal wired to a Formspree endpoint (`data-open-contact` triggers open it).
- `styles.css` — single shared stylesheet for all pages, loaded via `<link href="styles.css?v=N">`. Uses CSS custom properties defined on `:root` for theme colors (`--ink`, `--paper`, `--rule`, `--accent`, `--accent-light`, `--highlight`) and font stacks (`--font-serif`, `--font-mono`, `--font-sans`).
- `crumple-transition.js` — single shared script loaded by every page (`<script src="crumple-transition.js?v=N" data-base="/assets/" data-sound="on">`). A self-contained, dependency-free newspaper "crumple-and-toss" page transition: it intercepts clicks on internal page-to-page links, crumples the current page into a paper ball, throws it off-screen, then navigates. Runs in `reload` mode (animate, then normal navigation) — required because pages boot their own JS via `nav.js`. Leaves in-page `#anchor` links, downloads (the résumé link), external links, and modified-clicks (cmd/ctrl/new-tab) alone, so there's no conflict with `nav.js`'s smooth-scroll. Respects `prefers-reduced-motion` (skips straight to a normal navigation).
- `assets/` — assets for the crumple transition only: `ball.png` (the paper-ball photo the page crumples into), `paper.avif` (crumple texture overlay), `crumple.mp3` (the crumple sound, played on every transition).
- `images/` — static image assets referenced by pages.

## Conventions to follow

- When editing `nav.js`, `styles.css`, or `crumple-transition.js`, bump the `?v=N` query string on the corresponding `<script>`/`<link>` tag in **every** HTML file that references it, to bust GitHub Pages' cache.
- New article pages should follow the existing pattern: own HTML file at the repo root, own `<title>`, content wrapped in a `.section`-styled container, and a link added from `index.html`'s `#writing` nav dropdown and writing-grid card.
- Nav and contact-modal markup/behavior live entirely in `nav.js`/`styles.css` and are shared across pages — don't duplicate that logic into individual page files.
