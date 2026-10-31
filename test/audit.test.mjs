import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { audit, detectTrap, formatFix, wcagCriterion } from "../src/audit.mjs";
import { main } from "../src/cli.mjs";
import { groupFindings } from "../src/report.mjs";

const BROKEN = "demo/broken-shop/index.html";
const FIXED = "demo/fixed-shop/index.html";
const stops = (...selectors) => selectors.map((selector) => ({ selector }));

test("wcag tags become success criteria", () => {
  assert.equal(wcagCriterion("wcag111"), "1.1.1");
  assert.equal(wcagCriterion("wcag143"), "1.4.3");
  assert.equal(wcagCriterion("wcag2411"), "2.4.11");
  assert.equal(wcagCriterion("wcag2aa"), null);
  assert.equal(wcagCriterion("best-practice"), null);
});

test("a trap is Tab cycling among a few elements", () => {
  assert.deepEqual(detectTrap(stops(...Array(12).fill(null).flatMap(() => ["#a", "#b"]))), ["#a", "#b"]);
  assert.equal(detectTrap(stops("#a", "#b", "#c")), null); // walk ended: focus left the page
  assert.equal(detectTrap(stops(...Array.from({ length: 30 }, (_, i) => `#e${i}`))), null);
});

test("findings are grouped by rule with a few example places", () => {
  const f = (id, selector) => ({ id, selector, html: "", impact: "moderate", wcag: [], title: id, fix: "", helpUrl: "" });
  const groups = groupFindings([f("region", "a"), f("region", "b"), f("image-alt", "img"), ...Array.from({ length: 6 }, (_, i) => f("region", `x${i}`))]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].count, 8);
  assert.equal(groups[0].places.length, 5);
});

test("every planted bug in the broken shop is found", async () => {
  const r = await audit(BROKEN);
  const ids = new Set(r.findings.map((f) => f.id));
  for (const id of ["image-alt", "input-button-name", "color-contrast", "html-has-lang", "link-name",
    "heading-order", "click-only-control", "focus-not-visible"]) {
    assert.ok(ids.has(id), `missing ${id}; found ${[...ids].join(", ")}`);
  }
  assert.equal(r.findings.filter((f) => f.id === "click-only-control").length, 3);
  assert.equal(r.keyboard.trapped, false);
  assert.match(r.tree, /heading "Spring sale"/);
});

test("the sign-in dialog's keyboard trap is found once it's open", async () => {
  const r = await audit(BROKEN, { clicks: [".top .btn"] });
  const trap = r.findings.find((f) => f.id === "keyboard-trap");
  assert.ok(trap, "no keyboard-trap finding");
  assert.equal(trap.impact, "critical");
  assert.deepEqual(trap.wcag, ["2.1.2"]);
  assert.equal(r.keyboard.trapped, true);
});

test("the fixed shop is clean, dialog included", async () => {
  assert.deepEqual((await audit(FIXED)).findings, []);
  assert.deepEqual((await audit(FIXED, { clicks: [".top .btn"] })).findings, []);
});

test("cli writes both reports and fails on serious issues", async () => {
  const out = mkdtempSync(join(tmpdir(), "a11y-"));
  assert.equal(await main([BROKEN, "--out", out]), 1);
  const md = readFileSync(join(out, "report.md"), "utf8");
  assert.match(md, /CRITICAL: Images must have alternative text/);
  assert.ok(md.includes("**How to fix:** Fix any one of these:\n- Element does not have an alt attribute"), "fix advice isn't a list");
  assert.equal(JSON.parse(readFileSync(join(out, "report.json"), "utf8"))[0].summary.critical, 4);
  assert.equal(await main([BROKEN, "--out", out, "--fail-on", "none"]), 0);
  assert.equal(await main([FIXED, "--out", out]), 0);
});

test("axe's fix advice becomes short bulleted lists", () => {
  assert.equal(formatFix("Fix any of the following:\n  Element does not have an alt attribute\n  Element has no title attribute"),
    "Fix any one of these:\n- Element does not have an alt attribute\n- Element has no title attribute");
  assert.equal(formatFix("Fix all of the following:\n  A\n\nFix any of the following:\n  B\n  C"),
    "Fix all of these:\n- A\nFix any one of these:\n- B\n- C");
  assert.equal(formatFix("Use a real button"), "Use a real button");
});
