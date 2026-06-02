// Optimum Fit gym-staff roster types. The roster gives each gym staff member a
// stable identity (staff_code for commission, name + aliases for coaching) plus
// their position and employment type — the basis for reliable income-report
// matching and (later) attendance-bonus rules.

export type GymPosition = "sales_consultant" | "personal_trainer" | "front_desk";
export type GymEmploymentType = "full_time" | "part_time" | "freelancer";

export const GYM_POSITIONS: { value: GymPosition; label: string }[] = [
  { value: "sales_consultant", label: "Sales Consultant" },
  { value: "personal_trainer", label: "Personal Trainer" },
  { value: "front_desk", label: "Front Desk" },
];

export const GYM_EMPLOYMENT_TYPES: { value: GymEmploymentType; label: string }[] = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "freelancer", label: "Freelancer" },
];

export interface GymStaffInput {
  name: string;
  staffCode: string;
  position: GymPosition;
  employmentType: GymEmploymentType;
  email: string;
  phone: string;
  /** Alternate name spellings, to match coaching exports (e.g. "Kah Hui Fong"). */
  aliases: string[];
  active: boolean;
}

export function gymPositionLabel(p: GymPosition): string {
  return GYM_POSITIONS.find((x) => x.value === p)?.label ?? p;
}

export function gymEmploymentLabel(e: GymEmploymentType): string {
  return GYM_EMPLOYMENT_TYPES.find((x) => x.value === e)?.label ?? e;
}
