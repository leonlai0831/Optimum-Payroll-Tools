/** Output filename per spec: optimum_fit_<month>_all_sales_combined.xlsx (e.g. april_2026). */
export function commissionFileName(monthLabel: string): string {
  const slug =
    monthLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "sales";
  return `optimum_fit_${slug}_all_sales_combined.xlsx`;
}
