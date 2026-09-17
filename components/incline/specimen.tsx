import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Activity,
  Command,
  Circle,
  Grid2X2,
} from 'lucide-react';
import type { Context, Variant } from '@/lib/taste';
import { ClassicSpecimen } from './classic-specimen';

const data = {
  portfolio: {
    name: 'Alex Morgan',
    eyebrow: 'INDEPENDENT DESIGNER',
    title: 'Make room for possibility.',
    intro: 'Thoughtful digital experiences, shaped by curiosity.',
    items: ['A clearer everyday', 'Making space', 'Common ground'],
    meta: 'Selected work · 2026',
    cta: 'Explore the work',
  },
  brand: {
    name: 'Fieldwork',
    eyebrow: 'STRATEGY / DESIGN / DIGITAL',
    title: 'Make room for possibility.',
    intro: 'An independent studio for ideas worth bringing to life.',
    items: ['A clearer everyday', 'Making space', 'Common ground'],
    meta: 'Selected projects · 2026',
    cta: 'Explore the work',
  },
  dashboard: {
    name: 'Orbit',
    eyebrow: 'YOUR WORKSPACE / OVERVIEW',
    title: 'Make room for possibility.',
    intro: 'Your projects, progress, and what comes next, in one place.',
    items: ['Brand refresh', 'Digital experience', 'Design system'],
    meta: 'Project overview · This week',
    cta: 'Explore the projects',
  },
};
const ticks = [28, 44, 34, 61, 47, 72, 56, 81, 66, 92, 78, 100];
export function Specimen({
  variant,
  context,
  small = false,
}: {
  variant: Variant;
  context: Context;
  small?: boolean;
}) {
  if (variant.layout === 'classic')
    return (
      <ClassicSpecimen variant={variant} context={context} small={small} />
    );
  const d = data[context];
  const s = variant.style;
  const footer = (
    <div className="scene-footer">
      <span>{d.meta}</span>
      <ArrowUpRight size={17} />
    </div>
  );
  const projects = (
    <div className="scene-project-list">
      {d.items.map((item, i) => (
        <div key={item}>
          <span>0{i + 1}</span>
          <strong>{item}</strong>
          <ArrowUpRight size={15} />
        </div>
      ))}
    </div>
  );
  // Bundled offline UI has no Next image endpoint; this asset is shipped locally.
  const photo = (
    // oxlint-disable-next-line nextjs/no-img-element
    <img
      src="/images/ridge.png"
      alt="Volcanic ridge above a misty blue ocean"
      loading="lazy"
    />
  );
  return (
    <div
      className={`scene scene-${s} scene-density-${variant.density ?? 'balanced'} scene-type-${variant.type ?? 'default'} scene-color-${variant.color ?? 'default'} scene-layout-${variant.layout ?? 'native'} ${small ? 'scene-small' : ''} ${variant.motion === 'still' ? 'motion-still' : ''}`}
      aria-label={`${s} design example`}
    >
      {s === 'swiss' ? (
        <>
          <div className="swiss-top">
            <b>{d.name}®</b>
            <span>
              Design with
              <br />
              intention.
            </span>
            <ArrowUpRight size={25} />
          </div>
          <div className="swiss-grid">
            <div className="swiss-number">
              01<span>↗</span>
            </div>
            <div>
              <span className="scene-kicker">{d.eyebrow}</span>
              <h3>{d.title}</h3>
            </div>
          </div>
          <p className="scene-intro">{d.intro}</p>
          {projects}
          {footer}
        </>
      ) : s === 'editorial' ? (
        <>
          <div className="editorial-mast">
            <span>NOTES ON WHAT COMES NEXT</span>
            <h4>{d.name}</h4>
            <span>VOL. 01 / 2026</span>
          </div>
          <div className="editorial-columns">
            <div className="editorial-lead">
              <span className="scene-kicker">A PRACTICE IN CURIOSITY</span>
              <h3>{d.title}</h3>
              <p>{d.intro}</p>
              <span className="scene-link">{d.cta} ↗</span>
            </div>
            <figure>
              {photo}
              <figcaption>01 / New perspectives</figcaption>
            </figure>
          </div>
          <div className="editorial-bottom">
            <span>INSIDE THIS EDITION</span>
            {d.items.map((i, n) => (
              <p key={i}>
                <b>0{n + 1}</b>
                {i}
              </p>
            ))}
          </div>
          {footer}
        </>
      ) : s === 'brutalist' ? (
        <>
          <div className="brutal-strip">
            {d.eyebrow} ↗ {d.meta}
          </div>
          <div className="brutal-mast">
            <span>{d.name}</span>
            <span>NO.01</span>
          </div>
          <h3 className="brutal-title">
            MAKE
            <br />
            <span>ROOM.</span>
          </h3>
          <div className="brutal-intro">
            <b>FOR POSSIBILITY.</b>
            <p>{d.intro}</p>
          </div>
          <div className="brutal-work">{projects}</div>
          {footer}
        </>
      ) : s === 'cinematic' ? (
        <>
          <div className="cinema-image">{photo}</div>
          <div className="cinema-top">
            <b>{d.name}</b>
            <span>
              INDEX <Plus size={15} />
            </span>
          </div>
          <div className="cinema-body">
            <span className="scene-kicker">{d.eyebrow}</span>
            <h3>{d.title}</h3>
            <p>{d.intro}</p>
            <span className="cinema-cta">
              {d.cta} <ArrowRight size={18} />
            </span>
          </div>
          <div className="cinema-bottom">
            <span>01 — 03</span>
            <span>{d.items[0]}</span>
            <ArrowUpRight size={24} />
          </div>
        </>
      ) : s === 'terminal' ? (
        <>
          <div className="terminal-top">
            <span>● ● ●</span>
            <b>{d.name.toLowerCase()} / workspace</b>
            <span>_ □ ×</span>
          </div>
          <div className="terminal-content">
            <p className="terminal-command">~ / overview --all</p>
            <div className="terminal-status">
              <span>● SYSTEM ONLINE</span>
              <span>UTC 09:41</span>
            </div>
            <h3>
              MAKE ROOM
              <br />
              FOR POSSIBILITY<span className="terminal-cursor">_</span>
            </h3>
            <p className="terminal-intro">{d.intro}</p>
            <div className="terminal-stats">
              <div>
                PROJECTS<strong>12</strong>
              </div>
              <div>
                COMPLETE<strong>38</strong>
              </div>
              <div>
                CAPACITY<strong>84%</strong>
              </div>
            </div>
            <div className="terminal-bars" aria-label="Project progress chart">
              {ticks.map((t, i) => (
                <span key={i} style={{ height: `${t}%` }} />
              ))}
            </div>
            {projects}
            <p className="terminal-prompt">
              &gt; {d.cta.toLowerCase()} <span>↵</span>
            </p>
          </div>
        </>
      ) : s === 'deco' ? (
        <>
          <div className="deco-frame">
            <div className="deco-name">{d.name}</div>
            <div className="deco-lines">
              <span />✧<span />
            </div>
            <span className="scene-kicker">A CONSIDERED PERSPECTIVE</span>
            <h3>
              Make room
              <br />
              <em>for possibility.</em>
            </h3>
            <p>{d.intro}</p>
            <div className="deco-button">
              {d.cta}
              <ArrowRight size={17} />
            </div>
            <div className="deco-columns">
              {d.items.map((item, i) => (
                <div key={item}>
                  <span>{['I', 'II', 'III'][i]}</span>
                  <strong>{item}</strong>
                </div>
              ))}
            </div>
            <span className="deco-end">EST. MMXXVI</span>
          </div>
        </>
      ) : s === 'playful' ? (
        <>
          <div className="playful-top">
            <span>
              {d.name}
              <span>®</span>
            </span>
            <span>
              GOOD IDEAS LIVE HERE <Spark />
            </span>
          </div>
          <div className="playful-body">
            <span className="playful-note">a little different ✳</span>
            <h3>
              Make room
              <br />
              for <em>possibility.</em>
            </h3>
            <p>{d.intro}</p>
          </div>
          <div className="playful-cards">
            {d.items.map((item, i) => (
              <div key={item}>
                <span>0{i + 1}</span>
                <strong>{item}</strong>
                <ArrowUpRight size={22} />
              </div>
            ))}
          </div>
          <div className="playful-cta">
            {d.cta}
            <ArrowRight size={21} />
          </div>
        </>
      ) : s === 'bento' ? (
        <>
          <div className="bento-nav">
            <b>
              <Grid2X2 size={17} />
              {d.name}
            </b>
            <span>Overview</span>
            <Circle size={16} />
          </div>
          <div className="bento-grid">
            <div className="bento-welcome">
              <span className="scene-kicker">{d.eyebrow}</span>
              <h3>{d.title}</h3>
              <p>{d.intro}</p>
            </div>
            <div className="bento-stat">
              <Activity size={17} />
              <strong>
                84<span>%</span>
              </strong>
              <span>Room to grow</span>
            </div>
            <div className="bento-image">
              {photo}
              <span>New perspectives ↗</span>
            </div>
            <div className="bento-work">
              <span>
                IN PROGRESS <Plus size={13} />
              </span>
              {d.items.map((i, n) => (
                <p key={i}>
                  <span className={`project-dot dot-${n}`} />
                  {i}
                  <ArrowUpRight size={12} />
                </p>
              ))}
            </div>
            <div className="bento-bottom">
              <span>{d.cta}</span>
              <ArrowRight size={21} />
            </div>
          </div>
        </>
      ) : s === 'organic' ? (
        <>
          <div className="organic-top">
            <span>FIELD NOTES / 001</span>
            <b>{d.name}</b>
            <span>↗</span>
          </div>
          <div className="organic-content">
            <figure>
              {photo}
              <figcaption>
                Somewhere between an idea
                <br />
                and a new beginning.
              </figcaption>
            </figure>
            <div className="organic-text">
              <span className="scene-kicker">GROW AT YOUR OWN PACE</span>
              <h3>{d.title}</h3>
              <p>{d.intro}</p>
              <span className="organic-cta">{d.cta} ↗</span>
            </div>
          </div>
          <div className="organic-bottom">
            {d.items.map((i, n) => (
              <div key={i}>
                <span>0{n + 1}.</span>
                {i}
              </div>
            ))}
          </div>
          {footer}
        </>
      ) : s === 'bold' ? (
        <>
          <div className="bold-top">
            <b>{d.name}®</b>
            <span>
              INDEPENDENT
              <br />
              BY DESIGN.
            </span>
          </div>
          <div className="bold-layout">
            <div className="bold-side">{d.eyebrow}</div>
            <div className="bold-center">
              <h3>
                MAKE
                <br />
                ROOM
                <br />
                <span>↗</span>
              </h3>
              <p>FOR POSSIBILITY.</p>
            </div>
            <div className="bold-caption">
              <span>01 / NEXT</span>
              <p>{d.intro}</p>
            </div>
          </div>
          <div className="bold-bottom">
            <span>{d.cta}</span>
            <span>LET’S GO ↗</span>
          </div>
          {footer}
        </>
      ) : s === 'kinetic' ? (
        <>
          <div className="kinetic-top">
            <b>{d.name}</b>
            <span>
              WORDS IN MOTION <Command size={13} />
            </span>
          </div>
          <div className="kinetic-stage">
            <span className="kinetic-small">{d.eyebrow}</span>
            <h3>
              <span>MAKE ROOM</span>
              <span>FOR</span>
              <span>POSSIBILITY</span>
            </h3>
            <p>{d.intro}</p>
          </div>
          <div className="kinetic-ticker" aria-hidden="true">
            <span>
              EXPLORE / EXPERIMENT / REPEAT / EXPLORE / EXPERIMENT / REPEAT /
            </span>
          </div>
          <div className="kinetic-footer">
            <span>{d.cta}</span>
            <ArrowUpRight size={27} />
          </div>
        </>
      ) : (
        <>
          <div className="minimal-top">
            <b>{d.name}</b>
            <span>{d.meta}</span>
          </div>
          <div className="minimal-layout">
            <div className="minimal-head">
              <span className="scene-kicker">{d.eyebrow}</span>
              <h3>{d.title}</h3>
              <p>{d.intro}</p>
              <span className="minimal-cta">
                {d.cta}
                <ArrowUpRight size={16} />
              </span>
            </div>
            <div className="minimal-index">
              <span>SELECTED / 01—03</span>
              {projects}
            </div>
          </div>
          {footer}
        </>
      )}
    </div>
  );
}
function Spark() {
  return (
    <span className="spark-symbol" aria-hidden="true">
      ✳
    </span>
  );
}
