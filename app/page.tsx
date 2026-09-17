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
import { Specimen } from '@/components/incline/specimen';
import {
  contexts,
  styles,
  styleNames,
  getRounds,
  deriveProfile,
  reviseAnswer,
  parseSaved,
  exportMarkdown,
  type Session,
  type Context,
  type Exploration,
  type Choice,
  type Style,
} from '@/lib/taste';

const storageKey = 'incline.sessions.v1';
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'setup' | 'quiz' | 'profile' | 'library'>(
    'setup',
  );
  const [context, setContext] = useState<Context>('portfolio');
  const [exploration, setExploration] = useState<Exploration>('stretch');
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const active = sessions.find((s) => s.id === activeId);
  const rounds = getRounds(active?.answers ?? []);
  const step = active?.answers.length ?? 0;
  const round = rounds[Math.min(step, 7)];
  // Browser storage must be hydrated after SSR; this effect synchronizes an external store.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const saved = parseSaved(raw);
      // Browser-only hydration from an external store is intentional.
      // oxlint-disable-next-line react/react-compiler
      setSessions(saved);
      if (
        raw &&
        saved.length === 0 &&
        raw !== JSON.stringify({ version: 1, sessions: [] })
      )
        setStorageError(
          'Saved data could not be read. Your new session will replace it when you begin.',
        );
    } catch {
      setStorageError(
        'Browser storage is unavailable. You can still take the quiz and export your profile.',
      );
    }
    setReady(true);
  }, []);
  // A failed external storage write is reported to the user.
  useEffect(() => {
    if (!ready || sessions.length === 0) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, sessions }),
      );
    } catch {
      // Report failure of the external persistence operation.
      // oxlint-disable-next-line react/react-compiler
      setStorageError(
        'Changes could not be saved in this browser. Export your profile to keep a copy.',
      );
    }
  }, [sessions, ready]);
  useEffect(() => {
    heading.current?.focus();
  }, [view, step]);
  function update(next: Session) {
    setSessions((prev) => prev.map((s) => (s.id === next.id ? next : s)));
  }
  function begin() {
    const s: Session = {
      id: crypto.randomUUID(),
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
    update({ ...active, answers, complete: answers.length === 8 });
    setChoice(null);
    setReason('');
    if (answers.length === 8) setView('profile');
  }
  function back() {
    if (!active) return;
    if (step === 0) {
      setView('library');
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
          onClick={() => {
            setView('setup');
            setStatus('');
          }}
          aria-label="Incline home"
        >
          <span className="brand-mark">
            <ArrowUpRight size={23} />
          </span>
          incline<span className="beta">EARLY EXPLORATION</span>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={view === 'setup' || view === 'quiz' ? 'nav-active' : ''}
            onClick={() =>
              setView(active && !active.complete ? 'quiz' : 'setup')
            }
          >
            Discover
          </button>
          <button
            className={
              view === 'profile' || view === 'library' ? 'nav-active' : ''
            }
            onClick={() => setView('library')}
          >
            Your profiles{' '}
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
        {view === 'setup' && (
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
                  <span>8 comparisons · about 3 minutes</span>
                </div>
              </div>
            </section>
            <aside className="setup-preview">
              <div className="preview-caption">
                <span>A RANGE, NOT A LABEL</span>
                <Layers size={16} />
              </div>
              <div className="preview-stack">
                <div className="preview-sheet back-sheet">
                  <Specimen
                    variant={{ style: 'bold' }}
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
        {view === 'quiz' && active && (
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
                {String(step + 1).padStart(2, '0')} <span>/ 08</span>
              </span>
            </div>
            <Progress aria-label="Quiz completion" value={(step / 8) * 100} />
            <div className="quiz-heading">
              <div className="eyebrow">
                {round.dimension} <span className="round-dot">·</span>{' '}
                {step === 6 ? 'A FOLLOW-UP FOR YOU' : 'FOLLOW YOUR INSTINCT'}
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
                  {step === 7 ? 'See my profile' : 'Next comparison'}
                  <ArrowRight size={18} />
                </Button>
              </div>
            </div>
          </div>
        )}
        {view === 'profile' && active && (
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
            <div className="profile-note">
              <Sparkles size={20} />
              <p>
                These are starting points for <strong>this project</strong>.
                Multiple directions can fit. Tell Incline what to keep and where
                you’d like to explore.
              </p>
            </div>
            <div className="style-grid">
              {styles.map((style) => {
                const e = evidence.find((e) => e.tag === style);
                return (
                  <article className="style-profile" key={style}>
                    <Specimen
                      variant={{ style }}
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
            <div className="profile-bottom">
              <Button
                variant="outline"
                className="secondary-button"
                onClick={() => {
                  setName('');
                  setView('setup');
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
        {view === 'library' && (
          <div className="library-view">
            <div className="profile-top">
              <div>
                <div className="eyebrow">ROOM FOR DIFFERENT SIDES OF YOU</div>
                <h1 ref={heading} tabIndex={-1}>
                  Your project profiles.
                </h1>
                <p>Separate contexts. All part of your range.</p>
              </div>
              <Button
                className="primary-button"
                onClick={() => {
                  setName('');
                  setView('setup');
                }}
              >
                <Plus size={17} />
                New exploration
              </Button>
            </div>
            {sessions.length === 0 ? (
              <div className="empty-state">
                <Layers size={35} />
                <h2>Your range starts with a few choices.</h2>
                <p>Take the first quiz to make a profile for your project.</p>
                <Button
                  className="primary-button"
                  onClick={() => setView('setup')}
                >
                  Find my inclinations <ArrowRight size={17} />
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
                      setView(s.complete ? 'profile' : 'quiz');
                      setStatus('');
                    }}
                  >
                    <span className="session-icon">
                      <Layers size={22} />
                    </span>
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {contexts[s.context]} ·{' '}
                        {explorationLabels[s.exploration]}
                      </small>
                    </span>
                    <span className="session-state">
                      {s.complete
                        ? 'View profile'
                        : `${s.answers.length}/8 · Continue`}
                    </span>
                    <ArrowUpRight size={20} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      <output className="status-message">{status}</output>
      <footer className="site-footer">
        <span>
          incline <span className="footer-slash">/</span> Taste is a spectrum.
        </span>
        <span>
          Profiles stay in this browser. Export to take them with you.
        </span>
      </footer>
    </div>
  );
}
