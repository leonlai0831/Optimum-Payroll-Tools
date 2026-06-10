import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont, type PDFPage } from "pdf-lib";
import type {
  LessonPlanData,
  LessonPlanStatus,
  LessonPlanType,
  LevelType,
} from "@/lib/lesson-plan/types";
import {
  LEVEL_TYPE_LABELS,
  REPLACEMENT_SECTIONS,
  SELF_EVAL_GROUPS,
} from "@/lib/lesson-plan/templates";

/** Everything the lesson-plan PDF renders (a flattened `LessonPlanRecord`). */
export interface LessonPlanPdfInput {
  type: LessonPlanType;
  status: LessonPlanStatus;
  createdByName: string;
  instructorName: string;
  actualInstructorName: string;
  center: string;
  lessonDate: Date;
  timeLabel: string;
  levelType: LevelType | null;
  classLevel: string;
  ageGroup: string;
  data: LessonPlanData;
}

const PUNCT: Record<string, string> = {
  "—": "-",
  "–": "-",
  "‒": "-",
  "−": "-",
  "’": "'",
  "‘": "'",
  "“": '"',
  "”": '"',
  "•": "-",
  "→": "->",
  "…": "...",
};

/**
 * Make text safe for the standard (WinAnsi) fonts: map common typographic
 * punctuation to ASCII, strip diacritics, then replace anything still outside
 * the encodable range with "?". (Same rule as the payslip; the standard fonts
 * have no ✓ glyph either, which is why checked skills print as "[x]".)
 */
function safe(input: string): string {
  const mapped = (input ?? "").replace(/[—–‒−’‘“”•→…]/g, (c) => PUNCT[c] ?? c);
  const stripped = mapped.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  let out = "";
  for (const ch of stripped) {
    const c = ch.charCodeAt(0);
    out += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ? ch : "?";
  }
  return out;
}

const STATUS_LABEL: Record<LessonPlanStatus, string> = {
  draft: "Draft",
  submitted: "Submitted for review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

/** Greedy word-wrap of already-sanitized text to a width, in font points. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Render one lesson plan as a faithful one-or-two page A4 PDF mirroring the
 * paper template: header, meta grid, prior knowledge, objectives, procedure,
 * remarks, and (replacement plans) the yes/no self-evaluation table.
 */
export async function buildLessonPlanPdf(plan: LessonPlanPdfInput): Promise<Uint8Array> {
  const title =
    plan.type === "actual"
      ? "Optimum Swim School Lesson Plan"
      : "Optimum Train Swim School Replacement Lesson Plan";

  const doc = await PDFDocument.create();
  doc.setTitle(`${title} — ${plan.instructorName} — ${plan.lessonDate.toISOString().slice(0, 10)}`);
  doc.setProducer("Optimum Payroll Tools");

  const pageSize: [number, number] = [595.28, 841.89]; // A4 portrait, points
  const margin = 50;
  const width = pageSize[0];
  const rightEdge = width - margin;
  const contentWidth = rightEdge - margin;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.11, 0.13, 0.17);
  const muted = rgb(0.45, 0.48, 0.53);
  const brand = rgb(0, 0.38, 1);
  const hairline = rgb(0.85, 0.87, 0.9);
  const bandFill = rgb(0.95, 0.96, 0.99);

  let page: PDFPage = doc.addPage(pageSize);
  let y = pageSize[1] - margin;

  /** Start a new page when fewer than `space` points remain above the footer. */
  const ensure = (space: number) => {
    if (y - space < margin + 24) {
      page = doc.addPage(pageSize);
      y = pageSize[1] - margin;
    }
  };

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
  /** Draw a wrapped paragraph at `x`, advancing y; em-dash for empty text. */
  const paragraph = (text: string, x: number, opts: TextOpts & { lineHeight?: number } = {}) => {
    const size = opts.size ?? 10;
    const lineHeight = opts.lineHeight ?? 14;
    const lines = wrap(safe(text || "-"), opts.font ?? font, size, rightEdge - x);
    for (const line of lines) {
      ensure(lineHeight);
      draw(line, x, opts);
      y -= lineHeight;
    }
  };
  const section = (heading: string) => {
    ensure(60); // never strand a section band at the very bottom of a page
    y -= 8;
    page.drawRectangle({ x: margin, y: y - 5, width: contentWidth, height: 19, color: bandFill });
    draw(heading, margin + 6, { font: bold, size: 11, color: brand });
    y -= 26;
  };
  /** Two-column meta row: label in grey, value in ink. */
  const metaRow = (label: string, value: string, col: 0 | 1) => {
    const x = col === 0 ? margin : margin + contentWidth / 2;
    draw(label, x, { size: 8, color: muted });
    y -= 12;
    draw(value || "-", x, { font: bold, size: 10 });
  };
  /** Ticked-skill list as "[x] skill" entries flowed over two columns. */
  const skillChecklist = (skills: string[]) => {
    if (skills.length === 0) {
      paragraph("None ticked", margin, { color: muted });
      return;
    }
    const colWidth = contentWidth / 2;
    const rows = Math.ceil(skills.length / 2);
    for (let r = 0; r < rows; r++) {
      ensure(14);
      const left = skills[r];
      const right = skills[r + rows];
      draw(`[x] ${left}`, margin);
      if (right) draw(`[x] ${right}`, margin + colWidth);
      y -= 14;
    }
  };
  const labelled = (label: string, value: string) => {
    ensure(14);
    draw(`${label}: `, margin + 10, { size: 9, color: muted });
    const offset = font.widthOfTextAtSize(safe(`${label}: `), 9);
    const lines = wrap(safe(value || "-"), font, 9, rightEdge - margin - 10 - offset);
    draw(lines[0] ?? "-", margin + 10 + offset, { size: 9 });
    y -= 13;
    for (const line of lines.slice(1)) {
      ensure(13);
      draw(line, margin + 10 + offset, { size: 9 });
      y -= 13;
    }
  };

  // ── Header ────────────────────────────────────────────────────────────────
  paragraph(title, margin, { font: bold, size: 16, lineHeight: 20 });
  y -= 2;
  draw(`Status: ${STATUS_LABEL[plan.status]}  ·  Prepared by ${plan.createdByName || "-"}`, margin, {
    size: 9,
    color: muted,
  });
  y -= 14;
  page.drawLine({
    start: { x: margin, y },
    end: { x: rightEdge, y },
    thickness: 0.75,
    color: hairline,
  });
  y -= 20;

  // ── Meta grid ─────────────────────────────────────────────────────────────
  const dateLabel = plan.lessonDate.toISOString().slice(0, 10);
  const metaPairs: [string, string][] =
    plan.type === "actual"
      ? [
          ["Instructor", plan.instructorName],
          ["Branch", plan.center],
          ["Date", dateLabel],
          ["Time", plan.timeLabel],
          ["Class level", plan.classLevel],
          ["Age group", plan.ageGroup],
        ]
      : [
          ["Actual class instructor", plan.actualInstructorName],
          ["Replacement instructor", plan.instructorName],
          ["Branch", plan.center],
          ["Date", dateLabel],
          ["Time", plan.timeLabel],
          [
            "Level type / class level",
            `${plan.levelType ? LEVEL_TYPE_LABELS[plan.levelType] : "-"} · Level ${plan.classLevel || "-"}`,
          ],
        ];
  for (let i = 0; i < metaPairs.length; i += 2) {
    ensure(30);
    const rowTop = y;
    metaRow(metaPairs[i][0], metaPairs[i][1], 0);
    if (metaPairs[i + 1]) {
      y = rowTop;
      metaRow(metaPairs[i + 1][0], metaPairs[i + 1][1], 1);
    }
    y -= 18;
  }

  const d = plan.data;

  // ── Students' prior knowledge ─────────────────────────────────────────────
  section(plan.type === "actual" ? "Students' Prior Knowledge" : "Student Prior Knowledge");
  if (plan.type === "actual") paragraph(d.priorKnowledge, margin);
  else skillChecklist(d.priorSkills);

  // ── Lesson objectives ─────────────────────────────────────────────────────
  section("Lesson Objectives");
  d.objectives.forEach((obj, i) => {
    const tag = plan.type === "actual" ? `${i + 1}.` : `(${"abc"[i] ?? i + 1})`;
    ensure(14);
    draw(tag, margin, { font: bold });
    const x = margin + 22;
    const lines = wrap(safe(obj || "-"), font, 10, rightEdge - x);
    for (const [j, line] of lines.entries()) {
      if (j > 0) ensure(14);
      draw(line, x);
      y -= 14;
    }
  });

  // ── Procedure ─────────────────────────────────────────────────────────────
  section("Procedure");
  if (plan.type === "actual") {
    if (d.procedure.length === 0) paragraph("No procedure rows.", margin, { color: muted });
    d.procedure.forEach((row, i) => {
      ensure(40);
      draw(`${i + 1}.`, margin, { font: bold });
      const x = margin + 22;
      const lines = wrap(safe(row.activity || "-"), font, 10, rightEdge - x);
      for (const [j, line] of lines.entries()) {
        if (j > 0) ensure(14);
        draw(line, x);
        y -= 14;
      }
      labelled("Time", row.time);
      labelled("Materials", row.materials);
      labelled("Advance preparation", row.advancePreparation);
      y -= 6;
    });
  } else {
    for (const def of REPLACEMENT_SECTIONS) {
      const s = d.sections.find((x) => x.key === def.key);
      ensure(56);
      draw(def.label, margin, { font: bold, size: 10.5 });
      y -= 15;
      if (s?.intro) paragraph(s.intro, margin + 10, { size: 9.5, lineHeight: 13 });
      const skills = [...(s?.skills ?? []), ...(s?.otherSkill ? [s.otherSkill] : [])];
      if (skills.length > 0) {
        paragraph(skills.map((sk) => `[x] ${sk}`).join("   "), margin + 10, {
          size: 9.5,
          lineHeight: 13,
        });
      }
      labelled("Time", s?.time ?? "");
      labelled("Materials", s?.materials ?? "");
      labelled("Advanced preparation", s?.advancedPreparation ?? "");
      y -= 6;
    }
  }

  if (plan.type === "replacement") {
    // ── Remarks ─────────────────────────────────────────────────────────────
    section("Remarks");
    paragraph(d.remarks, margin);

    // ── Self-evaluation ─────────────────────────────────────────────────────
    section("Teaching Performance Self-Evaluation");
    for (const group of SELF_EVAL_GROUPS) {
      ensure(34);
      draw(group.title, margin, { font: bold, size: 10 });
      y -= 16;
      for (const q of group.questions) {
        ensure(14);
        const answer = d.selfEval[q.key];
        const label = answer === "yes" ? "Yes" : answer === "no" ? "No" : "-";
        const lines = wrap(safe(q.label), font, 9.5, contentWidth - 50);
        draw(lines[0], margin + 10, { size: 9.5 });
        const w = bold.widthOfTextAtSize(label, 9.5);
        draw(label, rightEdge - w, { font: bold, size: 9.5, color: answer ? ink : muted });
        y -= 13;
        for (const line of lines.slice(1)) {
          ensure(13);
          draw(line, margin + 10, { size: 9.5 });
          y -= 13;
        }
      }
      y -= 4;
    }
  }

  // ── Footer (every page) ───────────────────────────────────────────────────
  const stamp = new Date().toISOString().slice(0, 10);
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText(
      safe(`Generated ${stamp} - Optimum Payroll Tools - Page ${i + 1} of ${pages.length}`),
      { x: margin, y: margin - 18, size: 8, font, color: muted },
    );
  });

  return doc.save();
}
