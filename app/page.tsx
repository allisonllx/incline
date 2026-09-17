'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Check,
  Download,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useSessionStore } from '@/components/incline/use-session-store';
import { CollectionEditor } from '@/components/incline/collection-editor';
import { emptyCollection } from '@/lib/collection';
import { Catalog } from '@/components/incline/catalog';
import { Specimen } from '@/components/incline/specimen';
import {
  contexts,
  styles,
  sessionStyles,
  styleNames,
  getRounds,
  deriveProfile,
  reviseAnswer,
  exportMarkdown,
  type Session,
  type Context,
  type Exploration,
  type Choice,
  type Style,
  type Variant,
} from '@/lib/taste';

const choiceLabels: Record<Choice, string> = {
  a: 'I lean toward A',
  b: 'I lean toward B',
  both: 'I like both',
  neither: 'Neither feels right',
  depends: 'It depends',
};
const explorationLabels: Record<Exploration, string> = {
  familiar: 'Keep it familiar',
  stretch: 'Stretch a little',
  surprise: 'Surprise me',
};
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Home() {
  const {
    sessions,
    setSessions,
    ready,
    error: storageError,
    connection,
    finishing,
    result,
    finish,
    initialId,
    saveState,
  } = useSessionStore();
  const [inspection, setInspection] = useState<{
    variant: Variant;
    title: string;
    context: Context;
  } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<
    | 'welcome'
    | 'setup'
    | 'quiz'
    | 'profile'
    | 'library'
    | 'catalog'
    | 'collection'
  >('welcome');
  const [collectingImages, setCollectingImages] = useState(false);
  const imported = useRef(false);
  const [context, setContext] = useState<Context>('portfolio');
  const [exploration, setExploration] = useState<Exploration>('stretch');
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const active = sessions.find((s) => s.id === activeId);
  const rounds = getRounds(active?.answers ?? [], active?.catalogVersion ?? 2);
  const step = active?.answers.length ?? 0;
  const round = rounds[Math.min(step, rounds.length - 1)];
  useEffect(() => {
    heading.current?.focus();
  }, [view, step]);
  useEffect(() => {
    if (ready && initialId && !imported.current) {
      imported.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- opens a server-imported collection once after boot
      setActiveId(initialId);
      setView('collection');
    }
  }, [ready, initialId]);
  function beginCollection() {
    const session: Session = {
      id: crypto.randomUUID(),
      catalogVersion: 2,
      name: '',
      context: 'portfolio',
      exploration: 'stretch',
      answers: [],
      keep: [],
      explore: [],
      notes: '',
      complete: false,
      createdAt: new Date().toISOString(),
      collection: emptyCollection(),
    };
    setSessions((previous) => [session, ...previous]);
    setActiveId(session.id);
    setView('collection');
    setStatus('');
  }
  function collectFromProfile() {
    if (!active) return;
    if (!active.collection)
      update({
        ...active,
        collection: {
          ...emptyCollection(),
          projectContext: contexts[active.context],
        },
      });
    setView('collection');
  }
  async function finishCollection(next: Session) {
    const snapshot = sessions.map((session) =>
      session.id === next.id ? next : session,
    );
    setSessions(snapshot);
    if (connection) await finish(next.id, snapshot);
    else {
      setView('library');
      setStatus('Collection saved in this browser.');
    }
  }
  function update(next: Session) {
    setSessions((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  }
  function begin() {
    const s: Session = {
      id: crypto.randomUUID(),
      catalogVersion: 2,
      name: name.trim() || contexts[context],
      context,
      exploration,
      answers: [],
      keep: [],
      explore: [],
      notes: '',
      complete: false,
      createdAt: new Date().toISOString(),
    };
    setSessions((prev) => [s, ...prev]);
    setActiveId(s.id);
    setChoice(null);
    setReason('');
    setView('quiz');
    setStatus('');
  }
  function next() {
    if (!active || !choice) return;
    const answers = [
      ...active.answers,
      { roundId: round.id, choice, reason: reason.trim() },
    ];
    update({ ...active, answers, complete: answers.length === rounds.length });
    setChoice(null);
    setReason('');
    if (answers.length === rounds.length)
      setView(active.collection ? 'collection' : 'profile');
  }
  function back() {
    if (!active) return;
    if (step === 0) {
      setView(active.collection ? 'collection' : 'library');
      return;
    }
    const prior = active.answers[step - 1];
    update(reviseAnswer(active, step - 1));
    setChoice(prior.choice);
    setReason(prior.reason);
  }
  function editAnswer(index: number) {
    if (!active) return;
    const prior = active.answers[index];
    update(reviseAnswer(active, index));
    setChoice(prior.choice);
    setReason(prior.reason);
    setView('quiz');
  }
  function toggle(field: 'keep' | 'explore', style: Style, checked: boolean) {
    if (!active) return;
    update({
      ...active,
      [field]: checked
        ? [...active[field], style]
        : active[field].filter((s) => s !== style),
    });
  }
  const evidence = active ? deriveProfile(active) : [];
  return (
    <div className="app-shell">
      <header className="site-header">
        <button
          className="wordmark"
          disabled={!!result || finishing || collectingImages}
          onClick={() => {
            setView('welcome');
            setStatus('');
          }}
          aria-label="Incline home"
        >
          <span className="brand-mark">
            <ArrowUpRight size={23} />
          </span>
          incline<span className="beta">EARLY EXPLORATION</span>
        </button>
        <nav
          aria-label="Main navigation"
          style={result ? { visibility: 'hidden' } : undefined}
        >
          <button
            disabled={finishing || collectingImages}
            className={
              (!result && ['welcome', 'setup', 'collection'].includes(view)) ||
              view === 'quiz'
                ? 'nav-active'
                : ''
            }
            onClick={() => setView('welcome')}
          >
            Discover
          </button>
          <button
            disabled={finishing || collectingImages}
            className={
              view === 'profile' || view === 'library' ? 'nav-active' : ''
            }
            onClick={() => setView('library')}
          >
            Your collections{' '}
            {sessions.length > 0 && (
              <span className="nav-count">{sessions.length}</span>
            )}
          </button>
        </nav>
        <span className="header-note">
          <span /> A little more you.
        </span>
      </header>
      {storageError && (
        <output className="storage-warning">{storageError}</output>
      )}
      <main>
        {result && (
          <div className="done-view">
            <div className="done-symbol">
              <Check size={30} />
            </div>
            <div className="eyebrow">SAVED TO YOUR PROJECT</div>
            <h1>
              Your agent can take it{' '}
              <span className="serif-word">from here.</span>
            </h1>
            <p>
              Your collection and evidence are saved, and the temporary server
              has stopped. You can close this tab and return to your
              conversation.
            </p>
            <div className="saved-path">
              <span>PROFILE</span>
              <code>{result.profilePath}</code>
            </div>
            <p className="fine-print">
              Earlier revisions are preserved. Your taste still has room to
              change.
            </p>
          </div>
        )}
        {!result && view === 'welcome' && (
          <div className="welcome-view">
            <div className="welcome-heading">
              <div className="eyebrow">
                <span className="tiny-line" /> YOUR TASTE HAS RANGE
              </div>
              <h1>
                A place for what
                <br />
                you <span className="serif-word">lean toward.</span>
                <span className="heading-dot">↗</span>
              </h1>
              <p>
                Collect the things that catch your eye.
                <br />
                Find the words, explore the possibilities, make something that
                feels like you.
              </p>
            </div>
            <div className="entry-choices">
              <button
                className="entry-card"
                aria-label="I have something in mind"
                disabled={!ready}
                onClick={() => beginCollection()}
              >
                <div className="entry-art entry-pictures" aria-hidden="true">
                  <div className="paper-one">
                    a detail
                    <br />
                    <em>worth keeping.</em>
                  </div>
                  <div className="paper-two">✳</div>
                  <span>pieces of the picture</span>
                </div>
                <div className="entry-copy">
                  <span className="eyebrow">BRING YOUR IDEAS</span>
                  <h2>
                    I have something in mind <ArrowUpRight size={21} />
                  </h2>
                  <p>
                    Describe a feeling, bring images and links, or mix them
                    together. A rough idea is enough.
                  </p>
                </div>
              </button>
              <button
                className="entry-card"
                aria-label="Help me discover"
                disabled={!ready}
                onClick={() => setView('setup')}
              >
                <div className="entry-art entry-explore" aria-hidden="true">
                  <span>Aa</span>
                  <i>Aa</i>
                  <small>this, that, or a little of both.</small>
                </div>
                <div className="entry-copy">
                  <span className="eyebrow">FOLLOW YOUR CURIOSITY</span>
                  <h2>
                    Help me discover <ArrowUpRight size={21} />
                  </h2>
                  <p>
                    Compare visual directions and notice what resonates. Both is
                    always an answer.
                  </p>
                </div>
              </button>
            </div>
            <div className="welcome-footer">
              <p>Start with what you have. Explore whenever you like.</p>
              <button
                className="text-button"
                onClick={() => setView('catalog')}
              >
                Browse the example gallery <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
        )}
        {!result && view === 'collection' && active?.collection && (
          <CollectionEditor
            key={active.id}
            session={active}
            connection={connection}
            finishing={finishing}
            saveState={saveState}
            onChange={update}
            onBusyChange={setCollectingImages}
            onBack={() => setView('library')}
            onQuiz={() => {
              setChoice(null);
              setReason('');
              setView(step === rounds.length ? 'profile' : 'quiz');
            }}
            onFinish={(session) => void finishCollection(session)}
          />
        )}
        {!result && view === 'catalog' && (
          <Catalog
            context={context}
            onBack={() => setView('welcome')}
            onInspect={(variant, title) =>
              setInspection({ variant, title, context })
            }
          />
        )}
        {!result && view === 'setup' && (
          <div className="setup-layout">
            <section className="setup-main">
              <div className="eyebrow">
                <span className="tiny-line" /> YOUR TASTE HAS RANGE
              </div>
              <h1 ref={heading} tabIndex={-1}>
                Find what
                <br />
                you <span className="serif-word">lean toward.</span>
                <span className="heading-dot">↗</span>
              </h1>
              <p className="intro">
                A few visual choices. A clearer sense of what feels right.
                <br className="desktop-break" /> No style boxes. Plenty of room
                to change your mind.
              </p>
              <div className="setup-form">
                <fieldset>
                  <legend>
                    01 <span>What are you making?</span>
                  </legend>
                  <RadioGroup
                    className="context-options"
                    value={context}
                    onValueChange={(v) => setContext(v as Context)}
                  >
                    {(Object.keys(contexts) as Context[]).map((c) => (
                      <label
                        key={c}
                        className={`context-option ${context === c ? 'selected' : ''}`}
                      >
                        <RadioGroupItem value={c} />
                        {contexts[c]}
                      </label>
                    ))}
                  </RadioGroup>
                </fieldset>
                <label className="name-label" htmlFor="project-name">
                  Give this project a name <span>optional</span>
                </label>
                <input
                  id="project-name"
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My next chapter"
                />
                <fieldset>
                  <legend>
                    02 <span>How adventurous are you feeling?</span>
                  </legend>
                  <RadioGroup
                    value={exploration}
                    onValueChange={(v) => setExploration(v as Exploration)}
                    className="exploration-options"
                  >
                    {(Object.keys(explorationLabels) as Exploration[]).map(
                      (e, i) => (
                        <label
                          key={e}
                          className={`exploration-option ${exploration === e ? 'selected' : ''}`}
                        >
                          <RadioGroupItem value={e} />
                          <span>
                            {explorationLabels[e]}
                            <small>
                              {
                                [
                                  'Stay close to what I know',
                                  'Find something a little different',
                                  'Make room for unexpected ideas',
                                ][i]
                              }
                            </small>
                          </span>
                          {i === 2 && <Sparkles size={17} />}
                        </label>
                      ),
                    )}
                  </RadioGroup>
                </fieldset>
                <div className="start-line">
                  <Button
                    className="primary-button"
                    disabled={!ready}
                    onClick={begin}
                  >
                    Find my inclinations <ArrowRight size={18} />
                  </Button>
                  <span>12 comparisons · about 5 minutes</span>
                </div>
              </div>
              <button
                className="catalog-toggle"
                onClick={() => setView('catalog')}
              >
                Browse all 12 directions <ArrowUpRight size={15} />
              </button>
              {connection && (
                <p className="fine-print">
                  Working locally with your agent. Finish to save into this
                  project’s .incline folder.
                </p>
              )}
            </section>
            <aside className="setup-preview">
              <div className="preview-caption">
                <span>A RANGE, NOT A LABEL</span>
                <Layers size={16} />
              </div>
              <div className="preview-stack">
                <div className="preview-sheet back-sheet">
                  <Specimen
                    variant={{ style: 'brutalist' }}
                    context={context}
                    small
                  />
                </div>
                <div className="preview-sheet front-sheet">
                  <Specimen
                    variant={{ style: 'editorial' }}
                    context={context}
                    small
                  />
                </div>
                <span className="floating-note">
                  <span>✳</span> You can love both.
                </span>
              </div>
              <div className="preview-footer">
                <span className="preview-index">01 — ∞</span>
                <p>
                  Quiet today.
                  <br />
                  Expressive tomorrow.
                  <br />
                  <strong>Still very much you.</strong>
                </p>
              </div>
            </aside>
          </div>
        )}
        {!result && view === 'quiz' && active && (
          <div className="quiz-view">
            <div className="quiz-meta">
              <button className="text-button" onClick={back}>
                <ArrowLeft size={16} />
                {step === 0 ? 'Save & leave' : 'Previous'}
              </button>
              <span>
                {active.name} <span className="meta-divider">/</span>{' '}
                {explorationLabels[active.exploration]}
              </span>
              <span className="step-count">
                {String(step + 1).padStart(2, '0')}{' '}
                <span>/ {String(rounds.length).padStart(2, '0')}</span>
              </span>
            </div>
            {active.collection && (
              <button
                className="text-button return-collection"
                onClick={() => setView('collection')}
              >
                <Layers size={15} /> Return to your collection · comparisons are
                optional
              </button>
            )}
            <Progress
              aria-label="Quiz completion"
              value={(step / rounds.length) * 100}
            />
            <div className="quiz-heading">
              <div className="eyebrow">
                {round.dimension} <span className="round-dot">·</span>{' '}
                {round.id.startsWith('boundary')
                  ? 'A FOLLOW-UP FOR YOU'
                  : 'FOLLOW YOUR INSTINCT'}
              </div>
              <h1 ref={heading} tabIndex={-1}>
                {round.title}
              </h1>
              <p>{round.prompt}</p>
            </div>
            <div className="comparison-grid">
              {(['a', 'b'] as const).map((side, i) => (
                <div
                  className={`comparison-card ${choice === side || choice === 'both' ? 'chosen' : ''}`}
                  key={`${round.id}-${side}`}
                >
                  <div className="candidate-label">
                    <span>
                      <b>{side.toUpperCase()}</b>
                      {round.labels[i]}
                    </span>
                    {(choice === side || choice === 'both') && (
                      <Check size={18} />
                    )}
                  </div>
                  <Specimen variant={round[side]} context={active.context} />
                  <div className="candidate-tools">
                    <Button
                      variant="ghost"
                      className="candidate-choice"
                      onClick={() => setChoice(side)}
                      aria-pressed={choice === side}
                    >
                      {choice === side ? (
                        <Check size={16} />
                      ) : (
                        <ArrowUpRight size={16} />
                      )}{' '}
                      {choiceLabels[side]}
                    </Button>
                    <Button
                      variant="ghost"
                      className="inspect-button"
                      onClick={() =>
                        setInspection({
                          variant: round[side],
                          title: round.labels[i],
                          context: active.context,
                        })
                      }
                    >
                      View larger <ArrowUpRight size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="choice-area">
              <RadioGroup
                aria-label="Your preference"
                value={choice ?? ''}
                onValueChange={(v) => setChoice(v as Choice)}
                className="choice-options"
              >
                {(['a', 'b', 'both', 'neither', 'depends'] as Choice[]).map(
                  (c) => (
                    <label
                      className={`choice-option ${choice === c ? 'selected' : ''} ${c === 'a' || c === 'b' ? 'mobile-pair-choice' : ''}`}
                      key={c}
                    >
                      <RadioGroupItem value={c} />
                      {choiceLabels[c]}
                    </label>
                  ),
                )}
              </RadioGroup>
              <div className="reason-row">
                <label htmlFor="reason">
                  What tipped the balance? <span>optional</span>
                </label>
                <input
                  id="reason"
                  value={reason}
                  maxLength={600}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    choice === 'depends'
                      ? 'What would it depend on?'
                      : 'The headings, the spacing, the overall feeling…'
                  }
                />
              </div>
              <div className="quiz-actions">
                <p>
                  <span>↗</span> One choice won’t define your taste.
                </p>
                <Button
                  className="primary-button"
                  disabled={!choice}
                  onClick={next}
                >
                  {step === rounds.length - 1
                    ? 'See my profile'
                    : 'Next comparison'}
                  <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          </div>
        )}
        {!result && view === 'profile' && active && (
          <div className="profile-view">
            <div className="profile-top">
              <div>
                <div className="eyebrow">
                  YOUR PROJECT PROFILE{' '}
                  <span className="provisional">PROVISIONAL</span>
                </div>
                <h1 ref={heading} tabIndex={-1}>
                  More than <span className="serif-word">one direction.</span>
                </h1>
                <p>
                  {active.name} <span className="meta-divider">/</span>{' '}
                  {contexts[active.context]}{' '}
                  <span className="meta-divider">/</span>{' '}
                  {explorationLabels[active.exploration]}
                </p>
              </div>
              <Button
                variant="outline"
                className="secondary-button"
                onClick={() => {
                  download(
                    'incline-profile.md',
                    exportMarkdown(active),
                    'text/markdown',
                  );
                  setStatus('Profile exported as Markdown.');
                }}
              >
                <Download size={16} />
                Export profile
              </Button>
            </div>
            <button
              className="text-button profile-collect"
              onClick={collectFromProfile}
            >
              <Plus size={16} />{' '}
              {active.collection
                ? 'Return to your collection'
                : 'Add your own direction & references'}
            </button>
            <div className="profile-note">
              <Sparkles size={20} />
              <p>
                These are starting points for <strong>this project</strong>.
                Multiple directions can fit. Tell Incline what to keep and where
                you’d like to explore.
              </p>
            </div>
            <div className="style-grid">
              {sessionStyles(active).map((style) => {
                const e = evidence.find((e) => e.tag === style);
                return (
                  <article className="style-profile" key={style}>
                    <Specimen
                      variant={{
                        style,
                        ...(active.catalogVersion !== 2
                          ? { layout: 'classic' as const }
                          : {}),
                      }}
                      context={active.context}
                      small
                    />
                    <div className="style-detail">
                      <h2>{styleNames[style]}</h2>
                      <p>
                        {e?.welcomed
                          ? `Welcomed in ${e.welcomed} “both” ${e.welcomed === 1 ? 'choice' : 'choices'}. `
                          : ''}
                        {e?.preferred
                          ? `Preferred in ${e.preferred} ${e.preferred === 1 ? 'comparison' : 'comparisons'}. `
                          : ''}
                        {!e?.welcomed && !e?.preferred
                          ? 'No positive signal yet. '
                          : ''}
                        {e?.rejected ? 'Some examples didn’t fit. ' : ''}
                        {e?.conditional ? 'Context matters to you here.' : ''}
                      </p>
                      <div className="style-checks">
                        <label htmlFor={`keep-${style}`}>
                          <Checkbox
                            id={`keep-${style}`}
                            checked={active.keep.includes(style)}
                            onCheckedChange={(c) => toggle('keep', style, !!c)}
                          />
                          Keep in the mix
                        </label>
                        <label htmlFor={`explore-${style}`}>
                          <Checkbox
                            id={`explore-${style}`}
                            checked={active.explore.includes(style)}
                            onCheckedChange={(c) =>
                              toggle('explore', style, !!c)
                            }
                          />
                          Explore further
                        </label>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="profile-lower">
              <section className="profile-panel">
                <div className="panel-title">
                  <SlidersHorizontal size={18} />
                  <h2>The details you leaned toward</h2>
                </div>
                {evidence.filter(
                  (e) =>
                    !styles.includes(e.tag as Style) &&
                    (e.preferred || e.welcomed),
                ).length ? (
                  <div className="trait-list">
                    {evidence
                      .filter(
                        (e) =>
                          !styles.includes(e.tag as Style) &&
                          (e.preferred || e.welcomed),
                      )
                      .map((e) => (
                        <div key={e.tag}>
                          <span>
                            {
                              (
                                {
                                  compact: 'Compact spacing',
                                  airy: 'Airy spacing',
                                  expansive: 'Very open spacing',
                                  balanced: 'Balanced spacing',
                                  sans: 'Sans-serif headings',
                                  serif: 'Serif headings',
                                  neutral: 'Neutral palette',
                                  accent: 'Colour accents',
                                  split: 'Split composition',
                                  centered: 'Centred composition',
                                  still: 'Still typography',
                                  animated: 'Moving typography',
                                } as Record<string, string>
                              )[e.tag]
                            }
                          </span>
                          <span>
                            {e.preferred + e.welcomed}{' '}
                            {e.preferred + e.welcomed === 1
                              ? 'signal'
                              : 'signals'}
                          </span>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p>No clear lean yet. That is useful information too.</p>
                )}
                <p className="fine-print">
                  A lean is relative to the other example. These choices are
                  early evidence, not rules for every project.
                </p>
              </section>
              <section className="profile-panel">
                <div className="panel-title">
                  <Layers size={18} />
                  <h2>What should always survive an edit?</h2>
                </div>
                <label className="sr-only" htmlFor="preserve">
                  Preservation notes
                </label>
                <textarea
                  id="preserve"
                  maxLength={3000}
                  value={active.notes}
                  onChange={(e) => update({ ...active, notes: e.target.value })}
                  placeholder="e.g. Keep the clear hierarchy. I like expressive headings, but the body text must stay easy to read."
                />
                <p className="fine-print">
                  Your own instructions. Saved separately from what the quiz
                  suggests.
                </p>
              </section>
            </div>
            <details className="evidence-details">
              <summary>
                See the choices behind this profile{' '}
                <span>{active.answers.length} comparisons</span>
              </summary>
              <p>
                Editing an earlier choice removes later answers so follow-up
                comparisons can adapt again. Your notes and explicit selections
                stay.
              </p>
              {active.answers.map((a, i) => (
                <div className="evidence-row" key={a.roundId}>
                  <span className="evidence-number">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>{rounds[i].dimension}</strong>
                    <p>
                      {rounds[i].labels.join(' / ')} · {choiceLabels[a.choice]}
                    </p>
                    {a.reason && <p className="answer-reason">“{a.reason}”</p>}
                  </div>
                  <button className="text-button" onClick={() => editAnswer(i)}>
                    Revise <RotateCcw size={14} />
                  </button>
                </div>
              ))}
            </details>
            {connection && (
              <div className="local-savebar">
                <p>
                  Ready to bring this back to your agent?
                  <span>
                    Saves the profile and a new revision, then closes the local
                    server.
                  </span>
                </p>
                <Button
                  className="primary-button"
                  disabled={finishing}
                  onClick={() => {
                    if (active.collection)
                      void finishCollection({ ...active, complete: true });
                    else void finish(active.id);
                  }}
                >
                  {finishing ? 'Saving…' : 'Finish & return to agent'}
                  <ArrowRight size={17} />
                </Button>
              </div>
            )}
            <div className="profile-bottom">
              <Button
                variant="outline"
                className="secondary-button"
                onClick={() => {
                  setName('');
                  setView('welcome');
                }}
              >
                <Plus size={16} />
                Explore another project
              </Button>
              <button
                className="text-button"
                onClick={() => {
                  download(
                    'incline-evidence.json',
                    JSON.stringify(
                      { version: 1, session: active, evidence },
                      null,
                      2,
                    ),
                    'application/json',
                  );
                  setStatus('Evidence exported as JSON.');
                }}
              >
                Download full evidence <Download size={15} />
              </button>
            </div>
          </div>
        )}
        {!result && view === 'library' && (
          <div className="library-view">
            <div className="profile-top">
              <div>
                <div className="eyebrow">ROOM FOR DIFFERENT SIDES OF YOU</div>
                <h1 ref={heading} tabIndex={-1}>
                  Your collections.
                </h1>
                <p>
                  Different projects, moods and possibilities. All part of your
                  range.
                </p>
              </div>
              <Button
                className="primary-button"
                onClick={() => {
                  setName('');
                  setView('welcome');
                }}
              >
                <Plus size={17} />
                New collection
              </Button>
            </div>
            {sessions.length === 0 ? (
              <div className="empty-state">
                <Layers size={35} />
                <h2>Start with whatever catches your eye.</h2>
                <p>A description, a reference, or a few visual choices.</p>
                <Button
                  className="primary-button"
                  onClick={() => setView('welcome')}
                >
                  Start a collection <ArrowRight size={17} />
                </Button>
              </div>
            ) : (
              <div className="session-list">
                {sessions.map((s) => (
                  <button
                    className="session-row"
                    key={s.id}
                    onClick={() => {
                      setActiveId(s.id);
                      setChoice(null);
                      setReason('');
                      setView(
                        s.collection
                          ? 'collection'
                          : s.complete
                            ? 'profile'
                            : 'quiz',
                      );
                      setStatus('');
                    }}
                  >
                    <span className="session-icon">
                      <Layers size={22} />
                    </span>
                    <span>
                      <strong>{s.name || 'Untitled collection'}</strong>
                      <small>
                        {s.collection
                          ? `${s.collection.projectContext || 'Open direction'} · ${s.collection.references.length} references`
                          : `${contexts[s.context]} · ${explorationLabels[s.exploration]}`}
                      </small>
                    </span>
                    <span className="session-state">
                      {s.collection
                        ? s.complete
                          ? 'Open collection'
                          : 'Continue collecting'
                        : s.complete
                          ? 'View profile'
                          : `${s.answers.length}/${getRounds(s.answers, s.catalogVersion).length} · Continue`}
                    </span>
                    <ArrowUpRight size={20} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <Dialog
        open={!!inspection}
        onOpenChange={(open) => {
          if (!open) setInspection(null);
        }}
      >
        <DialogContent className="specimen-dialog">
          <DialogTitle>{inspection?.title}</DialogTitle>
          <DialogDescription>
            Inspect the composition. Closing this preview does not change your
            choice.
          </DialogDescription>
          {inspection && (
            <Specimen
              variant={inspection.variant}
              context={inspection.context}
            />
          )}
        </DialogContent>
      </Dialog>
      <output className="status-message">{status}</output>
      <footer className="site-footer">
        <span>
          incline <span className="footer-slash">/</span> Taste is a spectrum.
        </span>
        <span>
          {connection
            ? 'Local session · Saved in your project’s .incline folder on Finish.'
            : 'Browser demo · Launch the Incline skill to save directly to your project.'}
        </span>
      </footer>
    </div>
  );
}
