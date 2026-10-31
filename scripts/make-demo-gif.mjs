// Render docs/demo.gif from real audits of the two demo pages.
//
//   node scripts/make-demo-gif.mjs            (needs ffmpeg on PATH, or FFMPEG=/path/to/ffmpeg)
//
// Every number and rule name in the animation comes from running the audit;
// the screenshots are the audit's own --screenshot output.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { audit } from "../src/audit.mjs";
import { groupFindings } from "../src/report.mjs";

const FPS = 12;
const W = 960, H = 540;
const tmp = mkdtempSync(join(tmpdir(), "a11y-gif-"));

const viewport = { width: 760, height: 600 }; // narrow, so the screenshot stays legible in the panel
const broken = await audit("demo/broken-shop/index.html", { screenshot: join(tmp, "broken.png"), viewport });
const fixed = await audit("demo/fixed-shop/index.html", { screenshot: join(tmp, "fixed.png"), viewport });
const img = (p) => `data:image/png;base64,${readFileSync(p).toString("base64")}`;
const s = broken.summary;
const top = groupFindings(broken.findings)
  .filter((g) => g.impact === "critical" || g.impact === "serious")
  .slice(0, 6)
  .map((g) => `✗ ${g.id}${g.count > 1 ? ` ×${g.count}` : ""}${g.wcag.length ? `  (${g.wcag[0]})` : ""}`);

const scene = {
  cmd1: "npx a11y-audit shop.html --screenshot",
  out1: `${s.total} issues (${s.critical} critical, ${s.serious} serious)`,
  top,
  cmd2: "npx a11y-audit shop.html  # fixed",
  out2: `${fixed.summary.total} issues ✓`,
  brokenImg: img(join(tmp, "broken.png")),
  fixedImg: img(join(tmp, "fixed.png")),
};

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; width: ${W}px; height: ${H}px; background: #0d1117; color: #e6edf3; font-family: system-ui, sans-serif; overflow: hidden; }
  .cap { height: 56px; display: flex; align-items: center; gap: 12px; padding: 0 24px; font-size: 21px; font-weight: 600; }
  .cap b { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: #58a6ff; color: #0d1117; font-size: 14px; }
  .row { display: flex; gap: 16px; padding: 0 24px; height: ${H - 76}px; }
  .term { width: 400px; background: #010409; border: 1px solid #30363d; border-radius: 10px; padding: 16px; font: 15px/24px Consolas, Menlo, monospace; white-space: pre-wrap; }
  .p { color: #3fb950; } .bad { color: #ff7b72; } .ok { color: #3fb950; font-weight: 700; } .dim { color: #7d8590; }
  .shot { flex: 1; position: relative; background: #fff; border: 1px solid #30363d; border-radius: 10px; overflow: hidden; }
  .shot .bar { height: 26px; background: #e9ecef; border-bottom: 1px solid #ccc; display: flex; align-items: center; gap: 6px; padding: 0 10px; }
  .shot .bar i { width: 10px; height: 10px; border-radius: 50%; background: #ccc; display: inline-block; }
  .shot img { position: absolute; top: 26px; left: 0; width: 100%; transition: none; }
  .badge { position: absolute; right: 12px; bottom: 12px; padding: 6px 12px; border-radius: 16px; font-weight: 700; font-size: 15px; color: #fff; }
</style></head><body>
  <div class="cap" id="cap"></div>
  <div class="row">
    <div class="term" id="term"></div>
    <div class="shot"><div class="bar"><i></i><i></i><i></i></div>
      <img id="b" src="${scene.brokenImg}"><img id="f" src="${scene.fixedImg}">
      <div class="badge" id="badge"></div>
    </div>
  </div>
<script>
  const S = ${JSON.stringify({ ...scene, brokenImg: undefined, fixedImg: undefined })};
  const typed = (text, t, start, cps = 32) => text.slice(0, Math.max(0, Math.floor((t - start) * cps)));
  const clamp = (x) => Math.max(0, Math.min(1, x));
  window.render = (t) => {
    const lines = [];
    lines.push('<span class="p">$</span> ' + typed(S.cmd1, t, 0.4));
    if (t >= 1.9) lines.push('<span class="bad">' + S.out1 + '</span>', '');
    S.top.forEach((l, i) => { if (t >= 2.3 + i * 0.35) lines.push('<span class="bad">' + l + '</span>'); });
    if (t >= 5.6) lines.push('', '<span class="p">$</span> ' + typed(S.cmd2, t, 5.6));
    if (t >= 7.2) lines.push('<span class="ok">' + S.out2 + '</span>');
    document.getElementById('term').innerHTML = lines.join('\\n');
    const step = t < 5.4 ? 1 : 2;
    document.getElementById('cap').innerHTML = step === 1
      ? '<b>1</b> Audit in a real browser: WCAG rules, keyboard walk, screen-reader view'
      : '<b>2</b> Fix in source, then re-run to prove it';
    document.getElementById('b').style.opacity = clamp((t - 1.9) / 0.4) * (1 - clamp((t - 7.2) / 0.5));
    document.getElementById('f').style.opacity = clamp((t - 7.2) / 0.5);
    const badge = document.getElementById('badge');
    if (t < 1.9) { badge.style.opacity = 0; }
    else if (t < 7.2) { badge.style.opacity = 1; badge.style.background = '#d1242f'; badge.textContent = S.out1.split(':')[0]; }
    else { badge.style.opacity = 1; badge.style.background = '#1a7f37'; badge.textContent = S.out2; }
  };
  render(0);
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(html);
const frames = join(tmp, "frames");
execFileSync(process.platform === "win32" ? "cmd" : "mkdir", process.platform === "win32" ? ["/c", "mkdir", frames] : ["-p", frames]);
const total = Math.round(10 * FPS);
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.render(t), i / FPS);
  await page.screenshot({ path: join(frames, `f${String(i).padStart(4, "0")}.png`) });
}
await browser.close();

const ffmpeg = process.env.FFMPEG || "ffmpeg";
const input = ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", join(frames, "f%04d.png")];
execFileSync(ffmpeg, [...input, "-vf", "palettegen=max_colors=128:stats_mode=full", join(tmp, "palette.png")]);
execFileSync(ffmpeg, [...input, "-i", join(tmp, "palette.png"), "-lavfi", "paletteuse=dither=none:diff_mode=rectangle", "docs/demo.gif"]);
rmSync(tmp, { recursive: true, force: true });
console.log(`docs/demo.gif: ${total} frames, ${total / FPS}s; broken ${s.total} issues -> fixed ${fixed.summary.total}`);
