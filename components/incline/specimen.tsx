import { ArrowUpRight, Plus, MoreHorizontal } from 'lucide-react';
import type { Context, Variant } from '@/lib/taste';
export function Specimen({
  variant,
  context,
  small = false,
}: {
  variant: Variant;
  context: Context;
  small?: boolean;
}) {
  const dashboard = context === 'dashboard';
  const brand = context === 'brand';
  return (
    <div
      className={`specimen style-${variant.style} density-${variant.density ?? 'balanced'} type-${variant.type ?? 'default'} color-${variant.color ?? 'default'} ${small ? 'specimen-small' : ''}`}
      aria-label={`${variant.style} ${context} design example`}
    >
      <div className="spec-nav">
        <span className="spec-wordmark">
          {dashboard ? 'orbit' : brand ? 'FORM / FIELD' : 'Alex Morgan'}
        </span>
        <span>
          {dashboard ? 'Workspace' : brand ? 'Our studio' : 'Selected work'}{' '}
          <ArrowUpRight size={14} />
        </span>
      </div>
      <div className="spec-content">
        <div className="spec-eyebrow">
          {dashboard
            ? 'YOUR WORK, IN VIEW'
            : brand
              ? 'INDEPENDENT DESIGN STUDIO'
              : 'DESIGNER & CREATIVE PARTNER'}
        </div>
        <h3>
          {dashboard ? (
            <>
              A good week,
              <br />
              in the making.
            </>
          ) : brand ? (
            <>
              Good things.
              <br />
              Thoughtfully made.
            </>
          ) : (
            <>
              A little clarity.
              <br />A lot of possibility.
            </>
          )}
        </h3>
        <p className="spec-description">
          {dashboard
            ? 'A clear view of your projects, progress, and what comes next.'
            : brand
              ? 'We bring considered ideas to life through strategy, identity, and digital design.'
              : 'I turn complex ideas into thoughtful digital experiences. Based everywhere.'}
        </p>
        <span className="spec-cta">
          {dashboard
            ? 'View your projects'
            : brand
              ? 'Discover our work'
              : 'Explore selected work'}{' '}
          <ArrowUpRight size={16} />
        </span>
        {dashboard ? (
          <div className="spec-stats">
            <div>
              <span>Active projects</span>
              <strong>12</strong>
              <small>4 in review</small>
            </div>
            <div>
              <span>Tasks completed</span>
              <strong>38</strong>
              <small>This week</small>
            </div>
            <div>
              <span>Team capacity</span>
              <strong>84%</strong>
              <small>On track</small>
            </div>
          </div>
        ) : (
          <div className="spec-projects">
            <div className="spec-project">
              <span>01 / {brand ? 'IDENTITY' : 'PRODUCT DESIGN'}</span>
              <strong>{brand ? 'Common Ground' : 'A clearer everyday'}</strong>
              <div className="spec-project-bottom">
                <span>
                  {brand ? 'Strategy · Identity' : 'Research · Design'}
                </span>
                <ArrowUpRight size={21} />
              </div>
            </div>
            <div className="spec-project">
              <span>02 / DIGITAL EXPERIENCE</span>
              <strong>{brand ? 'Room to grow' : 'Making space'}</strong>
              <div className="spec-project-bottom">
                <span>
                  {brand ? 'Web · Experience' : 'Systems · Interaction'}
                </span>
                <ArrowUpRight size={21} />
              </div>
            </div>
          </div>
        )}
        <div className="spec-bottom">
          <span>
            {dashboard
              ? 'Upcoming · Brand refresh'
              : brand
                ? 'Have something in mind?'
                : 'Available for thoughtful projects'}
          </span>
          {dashboard ? <MoreHorizontal size={18} /> : <Plus size={18} />}
        </div>
      </div>
    </div>
  );
}
