import { ArrowUpRight, ArrowLeft } from 'lucide-react';
import { styles, styleNames, type Context, type Variant } from '@/lib/taste';
import { Specimen } from './specimen';
export const descriptions: Record<string, string> = {
  minimal: 'Asymmetric whitespace, a quiet index, and restrained type.',
  editorial: 'A masthead, image column, and the rhythm of a printed journal.',
  bold: 'Oversized stacked type, a vertical rail, and an electric colour field.',
  playful: 'Tilted cards, cheerful colour, tactile outlines, and softer forms.',
  swiss:
    'An ordered grid, clear rules, large numerals, and functional hierarchy.',
  brutalist:
    'A poster-sized headline, hard borders, and uncompromising contrast.',
  terminal: 'Monospaced readouts, compact rows, and a functional chart.',
  cinematic: 'Full-bleed photography, layered type, and a slow visual reveal.',
  deco: 'A framed centre, ornamental lines, and a formal typographic rhythm.',
  bento:
    'Modules of different sizes, mixed information, and contained surfaces.',
  organic: 'An off-grid photograph, field-note details, and irregular rhythm.',
  kinetic: 'Type in motion, a running text strip, and a darker stage.',
};
export function Catalog({
  context,
  onInspect,
  onBack,
}: {
  context: Context;
  onInspect: (v: Variant, title: string) => void;
  onBack: () => void;
}) {
  return (
    <section className="catalog-view">
      <button className="text-button" onClick={onBack}>
        <ArrowLeft size={15} />
        Back to exploration
      </button>
      <div className="profile-top">
        <div>
          <div className="eyebrow" style={{ marginTop: 25 }}>
            A WIDER FIELD OF POSSIBILITIES
          </div>
          <h1>
            Twelve starting points.
            <br />
            <span className="serif-word">No single destination.</span>
          </h1>
          <p>
            Open a composition to look closer. You don’t have to pick a
            favourite here.
          </p>
        </div>
      </div>
      <div className="catalog-grid">
        {styles.map((style) => (
          <button
            className="catalog-card"
              aria-label={`View ${styleNames[style]}`}
            key={style}
            onClick={() => onInspect({ style }, styleNames[style])}
          >
            <Specimen variant={{ style }} context={context} small />
            <span className="catalog-caption">
              <strong>{styleNames[style]}</strong>
              <span>{descriptions[style]}</span>
              <small>
                Open composition <ArrowUpRight size={15} />
              </small>
            </span>
          </button>
        ))}
      </div>
      <p className="fine-print">
        These are illustrative design families, not an exhaustive map of taste.
        The quiz separates broad composition choices from controlled typography,
        spacing, layout and motion comparisons.
      </p>
    </section>
  );
}
