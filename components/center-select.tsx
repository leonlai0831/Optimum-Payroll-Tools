import { Select } from "@/components/ui";
import { CENTERS } from "@/lib/allowance/types";

/**
 * Dropdown for picking an operating center from the canonical {@link CENTERS}
 * list. Any pre-existing value not in the list is preserved as an extra option,
 * so legacy/free-form data is never silently dropped on edit.
 */
export function CenterSelect({
  value,
  onChange,
  className,
  placeholder = "Center",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  const isKnown = (CENTERS as readonly string[]).includes(value);
  return (
    <Select id={id} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {CENTERS.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      {value && !isKnown && <option value={value}>{value}</option>}
    </Select>
  );
}
