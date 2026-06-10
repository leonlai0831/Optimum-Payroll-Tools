import { PDFDocument, StandardFonts, rgb, type Color, type PDFFont } from "pdf-lib";
import { rm } from "@/lib/utils";

/** A free-form additional allowance line, flattened for the payslip. */
export interface PayslipOtherItem {
  reason: string;
  center: string;
  amount: number;
}

/** Everything one coach's monthly payslip renders. Display-ready strings only. */
export interface PayslipData {
  companyName: string;
  /** Period label as saved on the run, e.g. "2026-04". */
  period: string;
  generatedAt: Date;
  coach: {
    name: string;
    center: string;
    /** Humanized role label (e.g. "Instructor"). */
    jobRole: string;
    /** Humanized employment label (e.g. "Full-time"). */
    employmentType: string;
    tier: string | null;
  };
  /** KPI bonus for the period, or null if no run covered this coach that month. */
  kpi: {
    finalScore: number;
    grade: string;
    students: number;
    bonus: number;
  } | null;
  /** Teaching allowance for the period, or null if none was saved. */
  allowance: {
    tier: string;
    /** Attendance ratio in [0, 1]. */
    attendancePct: number;
    attendance: number;
    teaching: number;
    other: number;
    otherItems: PayslipOtherItem[];
    grandTotal: number;
  } | null;
}

/** At most this many "other allowance" lines are itemized; the rest collapse. */
const MAX_OTHER_LINES = 8;

/** Whole-RM amounts as printed on the payslip (see `payslipAmounts`). */
export interface PayslipAmounts {
  /** KPI bonus line, or null when the section is absent. */
  bonus: number | null;
  attendance: number | null;
  teaching: number | null;
  other: number | null;
  /** Allowance total = attendance + teaching + other (already-rounded lines). */
  allowanceTotal: number | null;
  /** Grand total = bonus + allowanceTotal, absent sections counting as 0. */
  total: number;
}

/**
 * Compute the whole-RM amounts the payslip prints. Each money line is rounded
 * ONCE (the `rm()` whole-ringgit convention), and every total is the SUM of the
 * already-rounded lines — never a rounding of the raw sum — so the printed
 * lines always add up to the printed totals (10.5 + 10.5 → 11 + 11 = 22, not 21).
 */
export function payslipAmounts(data: Pick<PayslipData, "kpi" | "allowance">): PayslipAmounts {
  const bonus = data.kpi ? Math.round(data.kpi.bonus) : null;
  const a = data.allowance;
  const attendance = a ? Math.round(a.attendance) : null;
  const teaching = a ? Math.round(a.teaching) : null;
  const other = a ? Math.round(a.other) : null;
  const allowanceTotal = a ? (attendance ?? 0) + (teaching ?? 0) + (other ?? 0) : null;
  return {
    bonus,
    attendance,
    teaching,
    other,
    allowanceTotal,
    total: (bonus ?? 0) + (allowanceTotal ?? 0),
  };
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
 * the encodable range with "?". Without this, pdf-lib throws on names or notes
 * that contain CJK / emoji / smart quotes.
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

/** Render one coach's monthly payslip as a single-page A4 PDF. */
export async function buildPayslipPdf(data: PayslipData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Payslip — ${data.coach.name} — ${data.period}`);
  doc.setProducer("Optimum Payroll Tools");

  const page = doc.addPage([595.28, 841.89]); // A4 portrait, points
  const { width, height } = page.getSize();
  const margin = 50;
  const rightEdge = width - margin;

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ink = rgb(0.11, 0.13, 0.17);
  const muted = rgb(0.45, 0.48, 0.53);
  const brand = rgb(0, 0.38, 1);
  const hairline = rgb(0.85, 0.87, 0.9);
  const bandFill = rgb(0.95, 0.96, 0.99);

  let y = height - margin;

  // Single source for every printed money line/total so the document reconciles.
  const amounts = payslipAmounts(data);

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
  const drawRight = (text: string, opts: TextOpts = {}) => {
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    const w = f.widthOfTextAtSize(safe(text), size);
    draw(text, rightEdge - w, opts);
  };
  const rule = () =>
    page.drawLine({
      start: { x: margin, y },
      end: { x: rightEdge, y },
      thickness: 0.75,
      color: hairline,
    });
  const row = (label: string, value: string, valueBold = false) => {
    draw(label, margin, { color: muted });
    drawRight(value, { font: valueBold ? bold : font, color: ink });
    y -= 18;
  };
  const section = (title: string) => {
    y -= 8;
    page.drawRectangle({ x: margin, y: y - 5, width: rightEdge - margin, height: 19, color: bandFill });
    draw(title, margin + 6, { font: bold, size: 11, color: brand });
    y -= 26;
  };

  // ── Header ────────────────────────────────────────────────────────────────
  draw(data.companyName, margin, { font: bold, size: 20 });
  drawRight("PAYSLIP", { font: bold, size: 16, color: brand });
  y -= 22;
  draw(`Period: ${data.period}`, margin, { color: muted });
  y -= 14;
  rule();
  y -= 22;

  // ── Employee ────────────────────────────────────────────────────────────────
  draw("EMPLOYEE", margin, { font: bold, size: 9, color: muted });
  y -= 17;
  draw(data.coach.name, margin, { font: bold, size: 14 });
  y -= 20;
  row("Role", data.coach.jobRole);
  row("Employment", data.coach.employmentType);
  row("Center", data.coach.center || "-");
  row("Pay tier", data.coach.tier ?? "-");

  // ── KPI bonus ────────────────────────────────────────────────────────────────
  section("KPI Bonus");
  if (data.kpi) {
    row("Final score", data.kpi.finalScore.toFixed(3));
    row("Grade", data.kpi.grade);
    row("Students", String(data.kpi.students));
    row("Bonus payout", rm(amounts.bonus ?? 0), true);
  } else {
    draw("No KPI bonus recorded for this period.", margin, { color: muted });
    y -= 18;
  }

  // ── Teaching allowance ───────────────────────────────────────────────────────
  section("Teaching Allowance");
  if (data.allowance) {
    const a = data.allowance;
    row("Pay tier", a.tier);
    row("Attendance", `${Math.round(a.attendancePct * 100)}%`);
    row("Attendance allowance", rm(amounts.attendance ?? 0));
    row("Teaching", rm(amounts.teaching ?? 0));
    row("Other", rm(amounts.other ?? 0));
    const shown = a.otherItems.slice(0, MAX_OTHER_LINES);
    for (const it of shown) {
      const where = it.center ? ` (${it.center})` : "";
      const reason = it.reason || "Other";
      draw(`   - ${reason}${where}`, margin, { size: 9, color: muted });
      drawRight(rm(it.amount), { size: 9, color: muted });
      y -= 15;
    }
    const extra = a.otherItems.length - shown.length;
    if (extra > 0) {
      draw(`   - (+${extra} more)`, margin, { size: 9, color: muted });
      y -= 15;
    }
    // Sum of the three printed lines above (not the stored grandTotal), so the
    // section always adds up on paper.
    row("Allowance total", rm(amounts.allowanceTotal ?? 0), true);
  } else {
    draw("No allowance recorded for this period.", margin, { color: muted });
    y -= 18;
  }

  // ── Total ────────────────────────────────────────────────────────────────────
  y -= 6;
  rule();
  y -= 24;
  draw(`TOTAL FOR ${data.period}`, margin, { font: bold, size: 12 });
  drawRight(rm(amounts.total), { font: bold, size: 14, color: brand });

  // ── Footer ────────────────────────────────────────────────────────────────────
  const stamp = data.generatedAt.toISOString().slice(0, 10);
  page.drawText(
    safe(`Generated ${stamp} - ${data.companyName} - System-generated from saved monthly records.`),
    { x: margin, y: margin, size: 8, font, color: muted },
  );

  return doc.save();
}
