// Turn audit results into a Markdown report a person or an agent can act on.

const MAX_EXAMPLES = 5;

/** Group findings by rule, keeping the first few places each one occurs. */
export function groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const g = groups.get(f.id) || { ...f, count: 0, places: [] };
    g.count++;
    if (g.places.length < MAX_EXAMPLES) g.places.push({ selector: f.selector, html: f.html });
    groups.set(f.id, g);
  }
  return [...groups.values()];
}

export function toMarkdown(results) {
  const pages = Array.isArray(results) ? results : [results];
  const out = ["# Accessibility audit", ""];
  for (const r of pages) {
    const s = r.summary;
    out.push(`## ${r.url}${r.clicks.length ? ` (after clicking ${r.clicks.map((c) => `\`${c}\``).join(", ")})` : ""}`, "");
    out.push(`**${s.total} issues**: ${s.critical} critical, ${s.serious} serious, ${s.moderate} moderate, ${s.minor} minor. ` +
      `Keyboard walk: ${r.keyboard.stops.length} tab stops${r.keyboard.trapped ? ", **focus is trapped**" : ""}.`, "");
    const groups = groupFindings(r.findings);
    if (!groups.length) out.push("No automatically detectable issues. See the manual checks below.", "");
    for (const g of groups) {
      const sc = g.wcag.length ? `WCAG ${g.wcag.join(", ")}` : "best practice";
      out.push(`### ${g.impact.toUpperCase()}: ${g.title} (\`${g.id}\`, ${sc}, ${g.count}×)`, "");
      out.push(`**Fix:** ${g.fix}`, "");
      for (const p of g.places) out.push(`- \`${p.selector}\`${p.html ? ` — \`${p.html.replace(/`/g, "'").replace(/\s+/g, " ").slice(0, 120)}\`` : ""}`);
      if (g.count > g.places.length) out.push(`- …and ${g.count - g.places.length} more`);
      out.push("", `[Rule details](${g.helpUrl})`, "");
    }
    out.push("<details><summary>What a screen reader announces (accessibility tree)</summary>", "", "```yaml", r.tree.slice(0, 6000), "```", "", "</details>", "");
  }
  out.push("## Still needs a human", "",
    "Automated checks find roughly a third to half of real accessibility problems. Check these by hand:", "",
    "- Alt text that exists but doesn't describe the image (or describes a decorative one)",
    "- Captions and transcripts for video and audio",
    "- Whether the reading and focus order make sense, not just whether they exist",
    "- Error messages: are they announced, and do they say how to fix the problem?",
    "- Zoom to 200% and a 320px-wide window: nothing cut off or overlapping",
    "- Animations respect prefers-reduced-motion", "");
  return out.join("\n");
}
