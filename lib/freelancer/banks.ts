/** Malaysian banks accepted in the bank-transfer file, with their transfer codes. */
export const MALAYSIAN_BANKS: { name: string; code: string }[] = [
  { name: "AFFIN BANK", code: "PABB" },
  { name: "AL RAJHI BANK", code: "RJHI" },
  { name: "ALLIANCE BANK", code: "ALBB" },
  { name: "AMBANK", code: "AMBB" },
  { name: "BANK ISLAM", code: "BIMB" },
  { name: "BANK OF CHINA", code: "BOCM" },
  { name: "BANK RAKYAT", code: "BKRM" },
  { name: "BANK SIMPANAN NASIONAL", code: "BSNB" },
  { name: "CIMB BANK", code: "CIMB" },
  { name: "CITIBANK", code: "CITI" },
  { name: "HONG LEONG BANK", code: "HLBB" },
  { name: "HSBC BANK", code: "HSBC" },
  { name: "MAYBANK", code: "MBBB" },
  { name: "OCBC BANK", code: "OCBC" },
  { name: "PUBLIC BANK", code: "PBBB" },
  { name: "RHB BANK", code: "RHBB" },
  { name: "STANDARD CHARTERED BANK", code: "SCBB" },
  { name: "UOB BANK", code: "UOBB" },
];

/** Transfer code for a bank name ("" when unknown). Case/whitespace tolerant. */
export function bankCode(name: string): string {
  const key = (name ?? "").trim().toUpperCase();
  if (!key) return "";
  return MALAYSIAN_BANKS.find((b) => b.name === key)?.code ?? "";
}
