export type PromptTag = { facet: string; value: string; provenance: string };

export function tagsFromText(
  value: string,
  previous: PromptTag[] = [],
): PromptTag[] {
  const unmatched = [...previous];
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf(':');
      if (index < 1 || index === line.length - 1)
        throw new Error('Write each tag as facet: value.');
      const facet = line.slice(0, index).trim();
      const label = line.slice(index + 1).trim();
      const match = unmatched.findIndex(
        (tag) => tag.facet === facet && tag.value === label,
      );
      return match < 0
        ? { facet, value: label, provenance: 'user' }
        : unmatched.splice(match, 1)[0];
    });
}
