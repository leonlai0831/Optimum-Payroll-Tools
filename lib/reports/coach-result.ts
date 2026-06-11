import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont } from "pdf-lib";
import type { BreakdownItem } from "@/lib/kpi/types";
import { safe } from "@/lib/reports/pdf-text";
import type { RunCoach } from "@/lib/types";
import { rm } from "@/lib/utils";

/**
 * Format a metric min/max target for display (percent fractions → "40%").
 * Same rule as the coach drawer's `fmtTarget` in `run-coach-table.tsx`.
 */
function fmtTarget(v: number, type: BreakdownItem["type"]): string {
  if (type === "percent") return `${(v <= 1 ? v * 100 : v).toFixed(0)}%`;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** Greedy word-wrap of already-sanitized text to a width, in font points. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Radar geometry: full marks at score 1.5 (the recharts radar's domain). */
const RADAR_FULL = 1.5;

/**
 * Render one coach's KPI result (the detail drawer: stat boxes, radar, score
 * breakdown, coach data, merged accounts) as a single-page A4 PDF.
 *
 * Isomorphic on purpose — no node-only imports — so the dashboard can build
 * the PDF in the browser from the already-loaded coach object.
 */
export async function buildCoachResultPdf({
  coach,
  periodLabel,
  generatedAt = new Date(),
}: {
  coach: RunCoach;
  /** Period label as shown on the run, e.g. "2026-04". */
  periodLabel: string;
  generatedAt?: Date;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`KPI Result — ${coach.canonicalName} — ${periodLabel}`);
  doc.setProducer("Optimum People Hub");

  const page = doc.addPage([595.28, 841.89]); // A4 portrait, points
  const { width, height } = page.getSize();
  const margin = 50;
  const rightEdge = width - margin;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.11, 0.13, 0.17);
  const muted = rgb(0.45, 0.48, 0.53);
  const brand = rgb(0, 0.38, 1);
  const green = rgb(0.09, 0.5, 0.24);
  const hairline = rgb(0.85, 0.87, 0.9);
  const bandFill = rgb(0.95, 0.96, 0.99);

  let y = height - margin;

  interface TextOpts {
    size?: number;
    font?: PDFFont;
    color?: Color;
  }
  const draw = (text: string, x: number, opts: TextOpts = {}) =>
    page.drawText(safe(text), {
      x,
      y,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? ink,
    });
  const drawRight = (text: string, atX: number, opts: TextOpts = {}) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(safe(text), size);
    draw(text, atX - w, opts);
  };
  const rule = () =>
    page.drawLine({
      start: { x: margin, y },
      end: { x: rightEdge, y },
      thickness: 0.75,
      color: hairline,
    });
  const section = (title: string) => {
    y -= 8;
    page.drawRectangle({ x: margin, y: y - 5, width: rightEdge - margin, height: 19, color: bandFill });
    draw(title, margin + 6, { font: bold, size: 11, color: brand });
    y -= 26;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  draw(coach.canonicalName, margin, { font: bold, size: 18 });
  drawRight("KPI RESULT", rightEdge, { font: bold, size: 16, color: brand });
  y -= 18;
  draw(
    `${coach.position} · ${coach.center || "—"} · ${coach.students} students` +
      (coach.isComplete ? "" : " · incomplete"),
    margin,
    { color: muted },
  );
  drawRight(`Period: ${periodLabel}`, rightEdge, { color: muted });
  y -= 14;
  rule();
  y -= 14;

  // ── Stat boxes: Final Score / Grade / Payout ─────────────────────────────
  const gap = 10;
  const boxW = (rightEdge - margin - gap * 2) / 3;
  const boxH = 48;
  const stats: { label: string; value: string; color: Color }[] = [
    { label: "FINAL SCORE", value: coach.finalScore.toFixed(2), color: brand },
    { label: "GRADE", value: coach.grade, color: ink },
    { label: "PAYOUT", value: rm(coach.payout), color: green },
  ];
  stats.forEach((s, i) => {
    const x = margin + i * (boxW + gap);
    page.drawRectangle({
      x,
      y: y - boxH,
      width: boxW,
      height: boxH,
      color: bandFill,
      borderColor: hairline,
      borderWidth: 0.75,
    });
    page.drawText(safe(s.label), { x: x + 10, y: y - 16, size: 7.5, font, color: muted });
    page.drawText(safe(s.value), { x: x + 10, y: y - 36, size: 15, font: bold, color: s.color });
  });
  y -= boxH + 14;

  if (coach.position === "Pool Supervisor") {
    draw(
      `Supervisor final = (personal ${coach.personalScore.toFixed(2)} + group ${coach.groupScore.toFixed(2)}) / 2.`,
      margin,
      { size: 8.5, color: muted },
    );
    y -= 12;
  }

  // ── Radar profile (needs ≥ 3 axes to make a polygon) ─────────────────────
  const items = coach.breakdown;
  if (items.length >= 3) {
    const R = 74; // radius at full marks (score 1.5)
    const cx = width / 2;
    const cy = y - R - 22; // leave room for the top label
    const pt = (score: number, i: number) => {
      const theta = Math.PI / 2 - (2 * Math.PI * i) / items.length; // start top, clockwise
      const r = (Math.min(Math.max(score, 0), RADAR_FULL) / RADAR_FULL) * R;
      return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
    };
    // Grid rings at 0.5 / 1.0 / 1.5 + spokes.
    for (const level of [0.5, 1.0, RADAR_FULL]) {
      for (let i = 0; i < items.length; i++) {
        page.drawLine({
          start: pt(level, i),
          end: pt(level, (i + 1) % items.length),
          thickness: 0.5,
          color: hairline,
        });
      }
    }
    for (let i = 0; i < items.length; i++) {
      page.drawLine({ start: { x: cx, y: cy }, end: pt(RADAR_FULL, i), thickness: 0.5, color: hairline });
    }
    // Ring level labels along the top spoke.
    for (const level of [0.5, 1.0, RADAR_FULL]) {
      const p = pt(level, 0);
      page.drawText(level.toFixed(1), { x: p.x + 2, y: p.y - 2, size: 5.5, font, color: muted });
    }
    // Score polygon + vertex dots.
    for (let i = 0; i < items.length; i++) {
      page.drawLine({
        start: pt(items[i].score, i),
        end: pt(items[(i + 1) % items.length].score, (i + 1) % items.length),
        thickness: 1.25,
        color: brand,
      });
      page.drawCircle({ ...pt(items[i].score, i), size: 1.75, color: brand });
    }
    // Metric labels just outside the outer ring, anchored by direction.
    items.forEach((b, i) => {
      const theta = Math.PI / 2 - (2 * Math.PI * i) / items.length;
      const lx = cx + (R + 7) * Math.cos(theta);
      const ly = cy + (R + 7) * Math.sin(theta);
      const label = safe(b.name);
      const w = font.widthOfTextAtSize(label, 7);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      const x = cos > 0.25 ? lx : cos < -0.25 ? lx - w : lx - w / 2;
      const ty = sin > 0.25 ? ly + 1 : sin < -0.25 ? ly - 7 : ly - 2.5;
      page.drawText(label, { x, y: ty, size: 7, font, color: muted });
    });
    y = cy - R - 22;
  }

  // ── Score Breakdown ───────────────────────────────────────────────────────
  section("Score Breakdown");
  // Right edges of the numeric columns (Metric is left-aligned at the margin).
  const colActual = margin + 290;
  const colTarget = margin + 375;
  const colWeight = margin + 430;
  const head = (text: string, atX: number) =>
    drawRight(text, atX, { font: bold, size: 8, color: muted });
  draw("METRIC", margin, { font: bold, size: 8, color: muted });
  head("ACTUAL", colActual);
  head("TARGET", colTarget);
  head("WEIGHT", colWeight);
  head("SCORE", rightEdge);
  y -= 14;
  for (const b of items) {
    draw(b.name, margin, { size: 9.5 });
    drawRight(b.displayValue, colActual, { size: 9.5, color: ink });
    drawRight(`${fmtTarget(b.min, b.type)}–${fmtTarget(b.max, b.type)}`, colTarget, {
      size: 9.5,
      color: muted,
    });
    drawRight(`${(b.w * 100).toFixed(0)}%`, colWeight, { size: 9.5, color: muted });
    drawRight(b.score.toFixed(2), rightEdge, { font: bold, size: 9.5, color: brand });
    y -= 5;
    rule();
    y -= 12;
  }
  if (items.length === 0) {
    draw("No metric breakdown recorded.", margin, { color: muted });
    y -= 18;
  }

  // ── Coach Data (two-column grid, mirrors the drawer) ─────────────────────
  section("Coach Data");
  const colGap = 24;
  const colWidth = (rightEdge - margin - colGap) / 2;
  const fields: [string, string][] = [
    ["Center", coach.center || "—"],
    ["Position", coach.position],
    ["Students", String(coach.students)],
    ["Teaching allowance", coach.teachingAllowance ? rm(coach.teachingAllowance) : "—"],
    ["Mgmt assessment", coach.mgmtAssessment != null ? String(coach.mgmtAssessment) : "—"],
    ["Payout", rm(coach.payout)],
  ];
  fields.forEach(([label, value], i) => {
    const x = margin + (i % 2) * (colWidth + colGap);
    page.drawText(safe(label), { x, y, size: 9.5, font, color: muted });
    const w = bold.widthOfTextAtSize(safe(value), 9.5);
    page.drawText(safe(value), { x: x + colWidth - w, y, size: 9.5, font: bold, color: ink });
    page.drawLine({
      start: { x, y: y - 4 },
      end: { x: x + colWidth, y: y - 4 },
      thickness: 0.5,
      color: hairline,
    });
    if (i % 2 === 1) y -= 18;
  });
  if (fields.length % 2 === 1) y -= 18;

  // ── Merged accounts ───────────────────────────────────────────────────────
  if (coach.accounts.length > 0) {
    section(`Merged Accounts (${coach.accounts.length})`);
    const lines = wrap(safe(coach.accounts.join(", ")), font, 9, rightEdge - margin);
    const MAX_LINES = 5;
    for (const line of lines.slice(0, MAX_LINES)) {
      draw(line, margin, { size: 9, color: muted });
      y -= 13;
    }
    if (lines.length > MAX_LINES) {
      draw("…", margin, { size: 9, color: muted });
      y -= 13;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const stamp = generatedAt.toISOString().slice(0, 10);
  page.drawText(
    safe(`Generated ${stamp} - Optimum Swim School - System-generated KPI result for ${periodLabel}.`),
    { x: margin, y: margin, size: 8, font, color: muted },
  );

  return doc.save();
}
