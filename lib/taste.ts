import {
  validCollection,
  collectionHasContent,
  collectionMarkdown,
  type Collection,
} from './collection.ts';
export type Choice = 'a' | 'b' | 'both' | 'neither' | 'depends';
export type Context = 'portfolio' | 'dashboard' | 'brand';
export type Exploration = 'familiar' | 'stretch' | 'surprise';
export type Style =
  | 'minimal'
  | 'editorial'
  | 'bold'
  | 'playful'
  | 'swiss'
  | 'brutalist'
  | 'terminal'
  | 'cinematic'
  | 'deco'
  | 'bento'
  | 'organic'
  | 'kinetic';
export type Variant = {
  style: Style;
  layout?: 'classic' | 'split' | 'centered';
  motion?: 'still' | 'animated';
  density?: 'compact' | 'balanced' | 'airy' | 'expansive';
  type?: 'sans' | 'serif';
  color?: 'neutral' | 'accent';
};
export type Round = {
  id: string;
  title: string;
  prompt: string;
  dimension: string;
  a: Variant;
  b: Variant;
  labels: [string, string];
  tags: [string, string];
};
export type Answer = { roundId: string; choice: Choice; reason: string };
export type Session = {
  collection?: Collection;
  catalogVersion?: 1 | 2;
  id: string;
  name: string;
  context: Context;
  exploration: Exploration;
  answers: Answer[];
  keep: Style[];
  explore: Style[];
  notes: string;
  complete: boolean;
  createdAt: string;
};
export type Evidence = {
  tag: string;
  preferred: number;
  welcomed: number;
  rejected: number;
  conditional: number;
  rounds: string[];
};
export const styles: Style[] = [
  'minimal',
  'editorial',
  'bold',
  'playful',
  'swiss',
  'brutalist',
  'terminal',
  'cinematic',
  'deco',
  'bento',
  'organic',
  'kinetic',
];
export const styleNames: Record<Style, string> = {
  minimal: 'Quiet precision',
  editorial: 'Editorial warmth',
  bold: 'Bold expression',
  playful: 'Playful structure',
  swiss: 'Swiss grid',
  brutalist: 'Brutalist poster',
  terminal: 'Terminal / technical',
  cinematic: 'Cinematic image-led',
  deco: 'Art deco / luxury',
  bento: 'Modular bento',
  organic: 'Organic / field notes',
  kinetic: 'Kinetic typography',
};
export const contexts: Record<Context, string> = {
  portfolio: 'Personal portfolio',
  dashboard: 'Work dashboard',
  brand: 'Brand website',
};
const base: Variant = {
  style: 'minimal',
  density: 'balanced',
  type: 'sans',
  color: 'neutral',
};
function getLegacyRounds(answers: Answer[]): Round[] {
  const density = answers.find((a) => a.roundId === 'density')?.choice;
  const boundary: Round =
    density === 'b'
      ? {
          id: 'boundary-airy',
          title: 'How much breathing room?',
          prompt:
            'Does more space still feel better, or does it start to feel too spread out?',
          dimension: 'Spacing boundary',
          a: { ...base, density: 'airy' },
          b: { ...base, density: 'expansive' },
          labels: ['Room to breathe', 'An open canvas'],
          tags: ['airy', 'expansive'],
        }
      : {
          id: 'boundary-compact',
          title:
            density === 'a'
              ? 'Where does compact become crowded?'
              : 'Find your comfortable middle.',
          prompt:
            'The same information, with a different amount of space around it.',
          dimension: 'Spacing boundary',
          a: { ...base, density: 'compact' },
          b: { ...base, density: 'balanced' },
          labels: ['Close together', 'A little more room'],
          tags: ['compact', 'balanced'],
        };
  return [
    {
      id: 'direction-1',
      title: 'Which feels more like your direction?',
      prompt:
        'Imagine these as a starting point for this project. Both can belong in your taste.',
      dimension: 'Overall direction',
      a: base,
      b: { style: 'editorial' },
      labels: ['Quiet precision', 'Editorial warmth'],
      tags: ['minimal', 'editorial'],
    },
    {
      id: 'direction-2',
      title: 'Make room for a different mood.',
      prompt:
        'You can like these as well as the previous pair. There is no single style to land on.',
      dimension: 'Overall direction',
      a: { style: 'bold' },
      b: { style: 'playful' },
      labels: ['Bold expression', 'Playful structure'],
      tags: ['bold', 'playful'],
    },
    {
      id: 'density',
      title: 'How much space feels right?',
      prompt: 'Look at the space between the same pieces of information.',
      dimension: 'Information density',
      a: { ...base, density: 'compact' },
      b: { ...base, density: 'airy' },
      labels: ['Closer together', 'More breathing room'],
      tags: ['compact', 'airy'],
    },
    {
      id: 'typography',
      title: 'Let the type set the tone.',
      prompt:
        'The layout and colours stay the same. Only the heading style changes.',
      dimension: 'Typography',
      a: base,
      b: { ...base, type: 'serif' },
      labels: ['Clean sans serif', 'Expressive serif'],
      tags: ['sans', 'serif'],
    },
    {
      id: 'colour',
      title: 'A little colour, or keep it quiet?',
      prompt: 'Compare the same layout with and without an accent colour.',
      dimension: 'Colour',
      a: base,
      b: { ...base, color: 'accent' },
      labels: ['Neutral palette', 'Colour accents'],
      tags: ['neutral', 'accent'],
    },
    {
      id: 'direction-3',
      title: 'Two directions, one project.',
      prompt:
        'Think about what you would actually use here, not just what you admire.',
      dimension: 'Overall direction',
      a: { style: 'editorial' },
      b: { style: 'bold' },
      labels: ['Editorial warmth', 'Bold expression'],
      tags: ['editorial', 'bold'],
    },
    boundary,
    {
      id: 'direction-4',
      title: 'Leave the door open.',
      prompt:
        'Would either direction deserve a place in this project? A new favourite need not replace an old one.',
      dimension: 'Overall direction',
      a: { style: 'minimal' },
      b: { style: 'playful' },
      labels: ['Quiet precision', 'Playful structure'],
      tags: ['minimal', 'playful'],
    },
  ];
}
export function deriveProfile(session: Session): Evidence[] {
  const evidence = new Map<string, Evidence>();
  const rounds = getRounds(session.answers, session.catalogVersion);
  for (const answer of session.answers) {
    const round = rounds.find((r) => r.id === answer.roundId);
    if (!round) continue;
    round.tags.forEach((tag, i) => {
      const row = evidence.get(tag) ?? {
        tag,
        preferred: 0,
        welcomed: 0,
        rejected: 0,
        conditional: 0,
        rounds: [],
      };
      if (answer.choice === 'both') row.welcomed++;
      if (answer.choice === (i === 0 ? 'a' : 'b')) row.preferred++;
      if (answer.choice === 'neither') row.rejected++;
      if (answer.choice === 'depends') row.conditional++;
      row.rounds.push(round.id);
      evidence.set(tag, row);
    });
  }
  return [...evidence.values()];
}
export function reviseAnswer(session: Session, index: number): Session {
  return {
    ...session,
    answers: session.answers.slice(0, Math.max(0, index)),
    complete: false,
  };
}
export function parseSaved(raw: string | null): Session[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.sessions)) return [];
    return data.sessions.filter((s: Session) => {
      if (
        !s ||
        typeof s.id !== 'string' ||
        (s.catalogVersion !== undefined &&
          s.catalogVersion !== 1 &&
          s.catalogVersion !== 2) ||
        typeof s.name !== 'string' ||
        !Object.hasOwn(contexts, s.context) ||
        !['familiar', 'stretch', 'surprise'].includes(s.exploration) ||
        typeof s.notes !== 'string' ||
        typeof s.complete !== 'boolean' ||
        typeof s.createdAt !== 'string' ||
        !Array.isArray(s.answers) ||
        s.answers.length > 12 ||
        !Array.isArray(s.keep) ||
        !Array.isArray(s.explore) ||
        ![...s.keep, ...s.explore].every((x) => styles.includes(x))
      )
        return false;
      if (
        !s.answers.every(
          (a) =>
            a &&
            typeof a.roundId === 'string' &&
            typeof a.reason === 'string' &&
            ['a', 'b', 'both', 'neither', 'depends'].includes(a.choice),
        )
      )
        return false;
      if (s.collection !== undefined && !validCollection(s.collection))
        return false;
      const rounds = getRounds(s.answers, s.catalogVersion);
      return (
        s.answers.every((a, i) => rounds[i]?.id === a.roundId) &&
        (!s.complete ||
          s.answers.length === rounds.length ||
          (s.collection !== undefined && collectionHasContent(s.collection)))
      );
    });
  } catch {
    return [];
  }
}
export function exportMarkdown(session: Session): string {
  const rounds = getRounds(session.answers, session.catalogVersion);
  return `# Incline · ${session.name}\n\nContext: ${session.collection ? session.collection.projectContext || 'Not specified' : session.context}\nExploration: ${session.exploration}\n\n${session.collection ? collectionMarkdown(session.collection) : ''}## Explicit project instructions\nKeep: ${session.keep.join(', ') || 'Not specified'}\nExplore: ${session.explore.join(', ') || 'Not specified'}\n\n${session.notes || 'No preservation notes yet.'}\n\n## Provisional evidence\nThese preferences apply to this project. A/B choices are relative preferences, not absolute endorsements. Both welcomes both shown examples; neither rejects these examples, not an entire style. Unmentioned qualities are unknown. Preserve multiple directions; do not collapse this into one type.\n\n${
    session.answers
      .map((a) => {
        const r = rounds.find((r) => r.id === a.roundId);
        return `- ${r?.dimension}: ${r?.labels.join(' / ')} → ${a.choice}${a.reason ? ` — ${a.reason}` : ''}`;
      })
      .join('\n') || 'No comparisons taken. No style preference inferred.'
  }\n\nThis is a curated calibration, not a validated prediction of taste. Confirm directions with the user on a new design.\n`;
}

export function getRounds(answers: Answer[], version: 1 | 2 = 1): Round[] {
  const legacy = getLegacyRounds(answers);
  if (version === 1)
    return legacy.map((r) => ({
      ...r,
      a: { ...r.a, layout: 'classic' },
      b: { ...r.b, layout: 'classic' },
    }));
  const pairs: [Style, Style, string][] = [
    ['swiss', 'editorial', 'A precise grid, or an editorial rhythm?'],
    ['brutalist', 'minimal', 'Make a statement, or leave some silence?'],
    ['cinematic', 'terminal', 'An atmosphere, or an instrument?'],
    ['deco', 'playful', 'Ornamental elegance, or playful energy?'],
    ['bento', 'organic', 'A modular system, or something more human?'],
    ['bold', 'kinetic', 'A strong composition, or type that moves?'],
  ];
  return [
    ...pairs.map(
      ([a, b, title], i): Round => ({
        id: `range-${i + 1}`,
        title,
        prompt:
          'Consider the whole composition for your project. Liking one direction never rules out another.',
        dimension: 'Style & composition',
        a: { style: a },
        b: { style: b },
        labels: [styleNames[a], styleNames[b]],
        tags: [a, b],
      }),
    ),
    ...legacy
      .filter((r) => ['density', 'typography', 'colour'].includes(r.id))
      .map((r) => ({
        ...r,
        a: { ...r.a, layout: 'split' as const },
        b: { ...r.b, layout: 'split' as const },
      })),
    {
      id: 'layout',
      title: 'How should the page unfold?',
      prompt:
        'The same content and visual treatment. Compare a divided composition with a centred one.',
      dimension: 'Layout',
      a: { ...base, layout: 'split' },
      b: { ...base, layout: 'centered' },
      labels: ['Split composition', 'Centred composition'],
      tags: ['split', 'centered'],
    },
    {
      ...legacy[6],
      a: { ...legacy[6].a, layout: 'split' },
      b: { ...legacy[6].b, layout: 'split' },
    },
    {
      id: 'motion',
      title: 'Let it move, or let it rest?',
      prompt:
        'Compare the same typographic composition in motion and at rest. Your device’s reduced-motion setting is respected.',
      dimension: 'Motion',
      a: { style: 'kinetic', motion: 'still' },
      b: { style: 'kinetic', motion: 'animated' },
      labels: ['Still composition', 'Moving typography'],
      tags: ['still', 'animated'],
    },
  ];
}
export function sessionStyles(session: Session): Style[] {
  return session.catalogVersion === 2 ? styles : styles.slice(0, 4);
}
