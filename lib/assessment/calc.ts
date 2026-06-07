// Instructor Assessment scoring engine. Pure + deterministic, driven entirely
// by ASSESSMENT_FORM. Faithful to the owner's Google Sheet: each criterion earns
// a fraction (All=1, Most=2/3, Part=1/3, none=0), a sub-category earns
// avg(criteria) × weight, the parts/total are sums of those, and grades come
// from the percentage bands.

import {
  ASSESSMENT_FORM,
  GRADE_BANDS,
  RATING_VALUE,
  type GradeKey,
  type RatingMap,
  type SubCategory,
} from "./types";

export interface SubScore {
  key: string;
  label: string;
  weight: number;
  /** Earned points, out of `weight`. */
  score: number;
}

export interface PartScore {
  key: string;
  label: string;
  subScores: SubScore[];
  /** Earned points (sum of subScores). */
  score: number;
  /** Maximum points (sum of sub-category weights). */
  max: number;
  /** score / max as a 0–100 percentage. */
  percent: number;
  grade: GradeKey;
}

export interface AssessmentResult {
  parts: PartScore[];
  /** Overall percentage 0–100 (sub-category weights sum to 100). */
  totalPercent: number;
  finalGrade: GradeKey;
}

/** The grade band a 0–100 percentage falls into. */
export function gradeFor(percent: number): GradeKey {
  for (const band of GRADE_BANDS) {
    if (percent >= band.min) return band.key;
  }
  return GRADE_BANDS[GRADE_BANDS.length - 1].key; // unreachable (lowest band min = 0)
}

/** A sub-category's earned points: avg(criteria value, unrated = 0) × weight. */
function subCategoryScore(sub: SubCategory, ratings: RatingMap): number {
  if (sub.criteria.length === 0) return 0;
  const sum = sub.criteria.reduce((acc, c) => {
    const r = ratings[c.key];
    return acc + (r ? RATING_VALUE[r] : 0);
  }, 0);
  return (sum / sub.criteria.length) * sub.weight;
}

/** Score a whole observation: per sub-category, per part (with grade), and final. */
export function computeAssessment(ratings: RatingMap): AssessmentResult {
  const parts: PartScore[] = ASSESSMENT_FORM.map((part) => {
    const subScores = part.subCategories.map<SubScore>((sub) => ({
      key: sub.key,
      label: sub.label,
      weight: sub.weight,
      score: subCategoryScore(sub, ratings),
    }));
    const score = subScores.reduce((s, x) => s + x.score, 0);
    const max = part.subCategories.reduce((s, x) => s + x.weight, 0);
    const percent = max > 0 ? (score / max) * 100 : 0;
    return { key: part.key, label: part.label, subScores, score, max, percent, grade: gradeFor(percent) };
  });
  const totalPercent = parts.reduce((s, p) => s + p.score, 0);
  return { parts, totalPercent, finalGrade: gradeFor(totalPercent) };
}
