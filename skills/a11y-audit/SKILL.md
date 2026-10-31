---
name: a11y-audit
description: Audit a web page or app for accessibility (WCAG 2.2 A/AA) in a real browser, fix what it finds in the source, and re-run the audit to verify each fix. Use when the user asks for an accessibility or a11y audit, WCAG or ADA or EAA compliance, screen-reader or keyboard support, or to make a site or UI accessible.
---

# Accessibility audit, fix, verify

The audit runs the page in Chromium and reports three kinds of findings, each with a severity, a WCAG success criterion, and a CSS selector:

- **axe-core rules:** missing alt text, unlabeled controls, contrast, ARIA misuse, page language, heading order and more.
- **Keyboard walk:** it presses Tab like a keyboard-only user. It flags focus that isn't visible (WCAG 2.4.7), keyboard traps (2.1.2), and controls that only work with a mouse (2.1.1).
- **Accessibility tree:** what a screen reader announces. Use it to check that names, roles and structure make sense.

It never changes code. You do that, then prove each fix by re-running it.

## Workflow

0. **Install once** (if `npx a11y-audit --help` fails): `npm install --save-dev github:Necromancervbh/a11y-audit-skill && npx playwright install chromium`.

1. **Get a URL.** Use the dev server if the project has one (`npm run dev`), or a built HTML file path. Ask the user if neither is obvious.

2. **Audit every important state**, not just the first paint. Use `--click` to open dialogs, menus and drawers first:

   ```bash
   npx a11y-audit http://localhost:3000 --out a11y-report
   npx a11y-audit http://localhost:3000 --click "button.open-signin" --out a11y-report/signin
   ```

   Exit code 1 means critical or serious issues; `--fail-on` changes the threshold. Read `a11y-report/report.md`. Add `--screenshot` to also get `page-N.png` with each critical and serious issue outlined; it helps you match findings to components. `report.json` has the same findings for scripting.

3. **Fix in priority order:** critical, then serious, then moderate. For each finding:
   - Find the source of the element from its selector and HTML snippet: the component, template or stylesheet, not the built output.
   - Prefer native HTML: `<button>`, `<a href>`, `<label for>`, `<main>`/`<nav>`, real headings. Reach for ARIA only when no native element fits; wrong ARIA is worse than none.
   - Fix the cause, not the symptom. A div button becomes a `<button>`; don't bolt `tabindex` and key handlers onto it.
   - Alt text describes what the image means in context. Purely decorative images get `alt=""`.
   - Contrast fixes change the color token in the design system, not a one-off override.

4. **Verify.** Re-run the same commands. A finding is fixed only when it's gone from the new report. If a fix created a new finding, fix that too. Don't report something as fixed from reading the code alone.

5. **Report to the user:**
   - before → after counts per severity, per page and state
   - what you changed, grouped by kind of fix
   - anything left, and why: needs design input, third-party widget, and so on
   - the "Still needs a human" list from the report. Automated checks catch only part of what matters, so never call a site "fully accessible" or "compliant".

## Rules

- **Read-only on the page:** only click what's needed to reach a state. Never submit forms that send data, make purchases, or post content.
- **Don't game the audit:** never hide elements with `aria-hidden` or `display: none` just to silence a finding, and never add `role="presentation"` to meaningful content.
- **Keep the visual design** unless a fix requires a change (contrast, focus outlines). Say which visual changes you made.
- **Protect focus styles:** if the project removes outlines globally (`*:focus { outline: none }`), replace it with a visible `:focus-visible` style rather than deleting it per element.
