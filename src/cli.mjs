#!/usr/bin/env node
// a11y-audit-skill <url-or-file>... [--click <selector>]... [--out <dir>] [--fail-on <impact>] [--max-tabs <n>]
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { audit } from "./audit.mjs";
import { toMarkdown } from "./report.mjs";

const IMPACTS = ["critical", "serious", "moderate", "minor"];
const USAGE = `usage: a11y-audit-skill <url-or-file>... [options]

Audits each page in a real browser: axe-core WCAG 2.2 rules, a keyboard-only
walk (focus visibility, keyboard traps, click-only controls), and the
accessibility tree a screen reader announces.

options:
  --click <selector>   click this first (repeatable), to audit a state like an open dialog
  --out <dir>          write report.md and report.json here (default: a11y-report)
  --fail-on <impact>   exit 1 if any issue is this severe or worse: critical, serious (default),
                       moderate, minor, or none
  --max-tabs <n>       Tab presses in the keyboard walk (default 80)
  --screenshot         also save page-N.png with every issue outlined, and show it in the report
  --json               print the JSON results instead of the summary
`;

export async function main(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      click: { type: "string", multiple: true, default: [] },
      out: { type: "string", default: "a11y-report" },
      "fail-on": { type: "string", default: "serious" },
      "max-tabs": { type: "string", default: "80" },
      json: { type: "boolean", default: false },
      screenshot: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help || !positionals.length) {
    process.stdout.write(USAGE);
    return positionals.length || values.help ? 0 : 2;
  }
  const failOn = values["fail-on"];
  if (failOn !== "none" && !IMPACTS.includes(failOn)) throw new Error(`--fail-on must be one of ${IMPACTS.join(", ")}, none`);

  mkdirSync(values.out, { recursive: true });
  const results = [];
  for (const [i, target] of positionals.entries()) {
    const screenshot = values.screenshot ? join(values.out, `page-${i + 1}.png`) : null;
    results.push(await audit(target, { clicks: values.click, maxTabs: Number(values["max-tabs"]), screenshot }));
  }
  writeFileSync(join(values.out, "report.json"), JSON.stringify(results, null, 2));
  writeFileSync(join(values.out, "report.md"), toMarkdown(results));

  if (values.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  } else {
    for (const r of results) {
      const s = r.summary;
      process.stdout.write(`${r.url}: ${s.total} issues (${s.critical} critical, ${s.serious} serious, ${s.moderate} moderate, ${s.minor} minor)\n`);
    }
    process.stdout.write(`report: ${join(values.out, "report.md")}\n`);
  }
  if (failOn === "none") return 0;
  const worst = IMPACTS.slice(0, IMPACTS.indexOf(failOn) + 1);
  return results.some((r) => worst.some((i) => r.summary[i] > 0)) ? 1 : 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (err) => {
    process.stderr.write(`a11y-audit: ${err.message}\n`);
    process.exit(2);
  });
}
