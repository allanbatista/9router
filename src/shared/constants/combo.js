export const COMBO_DEFAULT_EFFORT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Xhigh" },
  { value: "max", label: "Max" },
  { value: "ultra", label: "Ultra" },
];

export function normalizeComboDefaultEffort(value) {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return COMBO_DEFAULT_EFFORT_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : undefined;
}
