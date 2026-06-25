export function paperHasAnyCategory(recordCategories: string[], categories: string[]) {
  const target = new Set(categories);
  return recordCategories.some((category) => target.has(category));
}
