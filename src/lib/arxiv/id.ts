const newArxivIdPattern = /(\d{4}\.\d{4,5})(?:v\d+)?/;
const oldArxivIdPattern = /([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?/;

export function parseArxivMainId(input: string) {
  const normalized = input.trim();
  const newMatch = normalized.match(newArxivIdPattern);
  if (newMatch?.[1]) return newMatch[1];
  const oldMatch = normalized.match(oldArxivIdPattern);
  if (oldMatch?.[1]) return oldMatch[1];
  throw new Error(`Invalid arXiv id: ${input}`);
}

export function sameMainArxivId(a: string, b: string) {
  return parseArxivMainId(a) === parseArxivMainId(b);
}
