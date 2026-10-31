# a11y-audit-skill

[![test](https://github.com/Necromancervbh/a11y-audit-skill/actions/workflows/test.yml/badge.svg)](https://github.com/Necromancervbh/a11y-audit-skill/actions/workflows/test.yml)

**Your coding agent can find and fix accessibility bugs, and prove they're fixed.**

An accessibility audit skill for Claude Code, Codex and Cursor. It runs your page in a real browser, checks it against WCAG 2.2 A/AA, tabs through it like a keyboard-only user, and reads it like a screen reader. Your agent fixes the findings in your source code, then re-runs the audit to verify each fix.

The EU Accessibility Act has been enforced since June 2025, and US ADA lawsuits over inaccessible websites run in the thousands every year. AI-generated UIs are full of `<div onclick>` buttons, missing labels and invisible focus. This catches them before your users or a lawyer do.

## What it checks

| Check | Finds | WCAG |
|---|---|---|
| **axe-core rules**, in real Chromium | Missing alt text, unlabeled inputs and buttons, low contrast, missing page language, ARIA misuse, heading order, and 90+ more rules | 1.1.1, 1.3.1, 1.4.3, 2.4.4, 3.1.1, 4.1.2, … |
| **Keyboard walk**: presses Tab through the page | Focus you can't see; keyboard traps; controls that only work with a mouse | 2.4.7, 2.1.2, 2.1.1 |
| **Accessibility tree** | What a screen reader announces: names, roles, headings, landmarks, for the agent to sanity-check | — |

Audit the states that matter, not just the first paint: `--click` opens dialogs, menus and drawers first. That's where keyboard traps live.

## Use it from your coding agent

```bash
git clone https://github.com/Necromancervbh/a11y-audit-skill
cp -r a11y-audit-skill/skills/a11y-audit ~/.claude/skills/      # Claude Code; point other agents at the same SKILL.md
```

Then ask: *"Run an accessibility audit on localhost:3000 and fix what you find."*

The [skill](skills/a11y-audit/SKILL.md) makes the agent:

1. Audit every important state.
2. Fix critical issues first, in your components rather than the built output, preferring native HTML over ARIA.
3. Re-run the audit, and report before → after counts. A finding counts as fixed only when it disappears from the new report.

It's also told never to game the audit: no `aria-hidden` to silence findings, and no claiming the site is "fully compliant".

## Use it directly

```bash
npm install --save-dev github:Necromancervbh/a11y-audit-skill
npx playwright install chromium

npx a11y-audit http://localhost:3000                        # writes a11y-report/report.md + report.json
npx a11y-audit http://localhost:3000 --click "#open-signin" # audit the sign-in dialog, open
npx a11y-audit ./dist/index.html --fail-on critical         # local files work too
```

Exit code 1 means issues at or above `--fail-on` (default `serious`), so it drops straight into CI:

```yaml
- run: npx playwright install --with-deps chromium
- run: npx a11y-audit http://localhost:3000 --fail-on serious
```

## Try it on the demo

`demo/broken-shop` is a small shop page with 11 deliberate, common bugs, and `demo/fixed-shop` is the same page fixed:

```
$ npx a11y-audit demo/broken-shop/index.html --click ".top .btn"
…/broken-shop/index.html: 30 issues (5 critical, 11 serious, 14 moderate, 0 minor)

$ npx a11y-audit demo/fixed-shop/index.html
…/fixed-shop/index.html: 0 issues (0 critical, 0 serious, 0 moderate, 0 minor)
```

The report groups issues by rule, with the WCAG criterion, a fix, and the exact elements:

```markdown
### CRITICAL: Keyboard trap: Tab cycles between #pass, #user and never leaves (`keyboard-trap`, WCAG 2.1.2, 1×)
**Fix:** Let Tab move focus out, or give the component an obvious exit (Escape closes a dialog and returns focus to what opened it).

### SERIOUS: "Sign in" works with a mouse but can't be reached with a keyboard (`click-only-control`, WCAG 2.1.1, 3×)
**Fix:** Use a real <button> (or <a href> for navigation). …
```

## Limits

Automated tools find roughly a third to half of real accessibility problems. The report ends with what still needs a human: alt text that exists but says nothing useful, captions, whether focus order *makes sense*, error messages, zoom and reflow, and reduced motion. Passing this audit means "no known automatically detectable issues", not "compliant".

## Development

```bash
npm install && npx playwright install chromium
npm test          # unit tests + real-browser runs against both demo pages
```

MIT licensed. Rules by [axe-core](https://github.com/dequelabs/axe-core) (MPL-2.0), browser by [Playwright](https://playwright.dev).
