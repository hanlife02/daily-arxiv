export type PaperStatePatch = {
  favorited?: boolean;
  read?: boolean;
  ignored?: boolean;
};

export type ExistingPaperState = {
  favorited: boolean;
  read: boolean;
  ignored: boolean;
  recommendedAt?: Date | null;
};

export function normalizePaperIds(input: unknown, max = 200) {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? [input] : [];
  return [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))].slice(0, max);
}

export function normalizePaperStatePatch(input: PaperStatePatch) {
  const patch: PaperStatePatch = {};
  if (typeof input.favorited === "boolean") patch.favorited = input.favorited;
  if (typeof input.read === "boolean") patch.read = input.read;
  if (typeof input.ignored === "boolean") patch.ignored = input.ignored;
  return patch;
}

export function hasPaperStatePatch(patch: PaperStatePatch) {
  return patch.favorited !== undefined || patch.read !== undefined || patch.ignored !== undefined;
}

export function applyPaperStatePatch(existing: ExistingPaperState | null | undefined, patch: PaperStatePatch) {
  return {
    favorited: patch.favorited ?? existing?.favorited ?? false,
    read: patch.read ?? existing?.read ?? false,
    ignored: patch.ignored ?? existing?.ignored ?? false,
    recommendedAt: existing?.recommendedAt ?? null
  };
}
