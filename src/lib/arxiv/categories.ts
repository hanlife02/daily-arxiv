export type ArxivCategory = {
  code: string;
  group: string;
  name: string;
};

export const ARXIV_CATEGORIES: ArxivCategory[] = [
  { code: "cs.AI", group: "Computer Science", name: "Artificial Intelligence" },
  { code: "cs.CL", group: "Computer Science", name: "Computation and Language" },
  { code: "cs.CV", group: "Computer Science", name: "Computer Vision and Pattern Recognition" },
  { code: "cs.IR", group: "Computer Science", name: "Information Retrieval" },
  { code: "cs.LG", group: "Computer Science", name: "Machine Learning" },
  { code: "cs.RO", group: "Computer Science", name: "Robotics" },
  { code: "stat.ML", group: "Statistics", name: "Machine Learning" },
  { code: "stat.AP", group: "Statistics", name: "Applications" },
  { code: "math.OC", group: "Mathematics", name: "Optimization and Control" },
  { code: "eess.IV", group: "Electrical Engineering and Systems Science", name: "Image and Video Processing" },
  { code: "eess.SP", group: "Electrical Engineering and Systems Science", name: "Signal Processing" }
];

const knownCodes = new Set(ARXIV_CATEGORIES.map((category) => category.code));
const arxivCodePattern = /^[a-z-]+(\.[A-Z]{2})?$/;

export function isValidArxivCategory(code: string, allowAdvanced = true) {
  const trimmed = code.trim();
  if (knownCodes.has(trimmed)) return true;
  return allowAdvanced && arxivCodePattern.test(trimmed);
}

export function validateArxivCategories(codes: string[], allowAdvanced = true) {
  const unique = Array.from(new Set(codes.map((code) => code.trim()).filter(Boolean)));
  const invalid = unique.filter((code) => !isValidArxivCategory(code, allowAdvanced));
  return {
    ok: invalid.length === 0,
    valid: unique.filter((code) => !invalid.includes(code)),
    invalid
  };
}

export function getSubscriptionUnion(userCategoryLists: string[][]) {
  return Array.from(new Set(userCategoryLists.flat().map((code) => code.trim()).filter(Boolean))).sort();
}
