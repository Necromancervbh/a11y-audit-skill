// Audit one page for accessibility in a real browser: axe-core rules, a
// keyboard-only walk, and the accessibility tree a screen reader announces.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const IMPACTS = ["critical", "serious", "moderate", "minor"];

/** "wcag143" -> "1.4.3", "wcag2411" -> "2.4.11"; level tags like "wcag2aa" -> null. */
export function wcagCriterion(tag) {
  const m = /^wcag(\d)(\d)(\d+)$/.exec(tag);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

/** A URL, or a local file path turned into a file:// URL. */
export function toUrl(target) {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(target)) return target;
  const path = resolve(target);
  if (!existsSync(path)) throw new Error(`not a URL and no such file: ${target}`);
  return pathToFileURL(path).href;
}

/**
 * options.clicks: selectors to click first, to audit a state such as an open
 * dialog or menu. options.maxTabs: how many Tab presses the keyboard walk makes.
 */
export async function audit(target, { clicks = [], maxTabs = 80, viewport = { width: 1280, height: 800 } } = {}) {
  const url = toUrl(target);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport });
    await page.goto(url, { waitUntil: "load" });
    for (const selector of clicks) {
      await page.click(selector);
      await page.waitForTimeout(150);
    }
    const findings = [...(await runAxe(page)), ...(await clickOnlyControls(page))];
    const keyboard = await walkKeyboard(page, maxTabs, Boolean(clicks.length));
    findings.push(...keyboard.findings);
    const tree = await page.locator("body").ariaSnapshot();
    findings.sort((a, b) => IMPACTS.indexOf(a.impact) - IMPACTS.indexOf(b.impact));
    return {
      url, clicks, auditedAt: new Date().toISOString(),
      summary: summarize(findings),
      findings, keyboard: { stops: keyboard.stops, trapped: keyboard.trapped }, tree,
    };
  } finally {
    await browser.close();
  }
}

async function runAxe(page) {
  await page.addScriptTag({ path: AXE });
  const result = await page.evaluate(
    (tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] }),
    AXE_TAGS,
  );
  return result.violations.flatMap((v) => v.nodes.map((n) => ({
    id: v.id,
    source: "axe",
    impact: n.impact || v.impact || "minor",
    wcag: v.tags.map(wcagCriterion).filter(Boolean),
    title: v.help,
    selector: n.target.join(" "),
    html: n.html.slice(0, 200),
    fix: n.failureSummary.replace(/\s+/g, " ").trim(),
    helpUrl: v.helpUrl,
  })));
}

/** Elements that react to clicks but can't be reached or used with a keyboard (WCAG 2.1.1). */
async function clickOnlyControls(page) {
  await installSelectorHelper(page);
  const found = await page.evaluate(() => {
    const native = "a[href],button,input,select,textarea,summary,[contenteditable='true']";
    return [...document.querySelectorAll("[onclick],[role=button],[role=link],[role=tab],[role=menuitem]")]
      .filter((el) => !el.matches(native) && !el.hasAttribute("tabindex") && el.getClientRects().length)
      .map((el) => ({ selector: window.__a11ySelector(el), html: el.outerHTML.slice(0, 200), text: el.innerText.trim().slice(0, 60) }));
  });
  return found.map((f) => ({
    id: "click-only-control",
    source: "keyboard",
    impact: "serious",
    wcag: ["2.1.1"],
    title: `"${f.text || "Control"}" works with a mouse but can't be reached with a keyboard`,
    selector: f.selector,
    html: f.html,
    fix: "Use a real <button> (or <a href> for navigation). If it must stay a div, add role, tabindex=\"0\" and Enter/Space key handlers.",
    helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html",
  }));
}

/**
 * Press Tab like a keyboard-only user. At each stop, check the focus is visible
 * (something about the element looks different from when it isn't focused),
 * and notice when Tab stops moving forward: a keyboard trap.
 */
async function walkKeyboard(page, maxTabs, startFromFocus) {
  await installSelectorHelper(page);
  if (!startFromFocus) {
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  }
  const stops = [];
  const findings = [];
  const unseen = new Set();
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const look = (e) => {
        const s = getComputedStyle(e);
        return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.color, s.textDecorationLine].join("|");
      };
      const focused = look(el);
      el.blur();
      const blurred = look(el);
      el.focus({ preventScroll: true });
      return {
        selector: window.__a11ySelector(el),
        role: el.getAttribute("role") || el.tagName.toLowerCase(),
        name: (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("placeholder") || el.getAttribute("title") || "").trim().slice(0, 60),
        visible: focused !== blurred,
        html: el.outerHTML.slice(0, 200),
      };
    });
    if (!stop) {
      if (stops.length) break; // focus left the page: the walk is complete
      continue;
    }
    stops.push({ selector: stop.selector, role: stop.role, name: stop.name, focusVisible: stop.visible });
    if (!stop.visible && !unseen.has(stop.selector)) {
      unseen.add(stop.selector);
      findings.push({
        id: "focus-not-visible",
        source: "keyboard",
        impact: "serious",
        wcag: ["2.4.7"],
        title: `No visible focus indicator on ${stop.role}${stop.name ? ` "${stop.name}"` : ""}`,
        selector: stop.selector,
        html: stop.html,
        fix: "Don't remove the outline. Add a clear :focus-visible style, e.g. outline: 3px solid; outline-offset: 2px.",
        helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html",
      });
    }
  }
  const trapped = detectTrap(stops);
  if (trapped) {
    findings.push({
      id: "keyboard-trap",
      source: "keyboard",
      impact: "critical",
      wcag: ["2.1.2"],
      title: `Keyboard trap: Tab cycles between ${trapped.join(", ")} and never leaves`,
      selector: trapped[0],
      html: "",
      fix: "Let Tab move focus out, or give the component an obvious exit (Escape closes a dialog and returns focus to what opened it).",
      helpUrl: "https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html",
    });
  }
  return { stops, findings, trapped: Boolean(trapped) };
}

/**
 * A keyboard trap: Tab keeps cycling among the same one to three elements and
 * never leaves the page. (On a normal page the walk ends when focus leaves the
 * last element, so it never collects that many repeats.)
 */
export function detectTrap(stops, window = 12) {
  if (stops.length < window) return null;
  const distinct = [...new Set(stops.slice(-window).map((s) => s.selector))];
  return distinct.length <= 3 ? distinct : null;
}

async function installSelectorHelper(page) {
  await page.evaluate(() => {
    if (window.__a11ySelector) return;
    window.__a11ySelector = (el) => {
      if (el.id) return `#${CSS.escape(el.id)}`;
      const parts = [];
      for (let node = el; node && node.nodeType === 1 && node !== document.body && parts.length < 5; node = node.parentElement) {
        if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
        const tag = node.tagName.toLowerCase();
        const same = node.parentElement ? [...node.parentElement.children].filter((c) => c.tagName === node.tagName) : [];
        parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
      }
      return parts.join(" > ");
    };
  });
}

export function summarize(findings) {
  const summary = Object.fromEntries(IMPACTS.map((i) => [i, 0]));
  for (const f of findings) summary[f.impact] = (summary[f.impact] || 0) + 1;
  summary.total = findings.length;
  return summary;
}
