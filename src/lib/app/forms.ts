export function splitList(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function numberFromForm(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function stringFromForm(value: FormDataEntryValue | null, fallback = "") {
  return String(value ?? fallback).trim();
}

export function booleanFromForm(value: FormDataEntryValue | null) {
  return value === "on" || value === "true" || value === "1";
}
