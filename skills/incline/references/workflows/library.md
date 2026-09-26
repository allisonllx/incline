# Library

**Use for:** explicitly listing, saving or reusing personal collections or curated insight snapshots across projects.
**Result:** a chosen reusable snapshot or a project-local imported draft with its source context intact. A library lookup alone does not authorize importing or applying a collection.

For prompt recipes, use [prompt operations](../prompts.md). They use the separate personal prompt store, source-preserving copies and revision-specific results. An explicitly enabled project setting permits read-only prompt lookup within that selected library; it does not enable automatic personal saves or change collection/insight access.

Follow [shared evidence rules](../evidence.md), then read [personal library](../personal-library.md) for storage, UI and API operations. If a local browser session is required, use the launch/recovery procedure in [Collect](collect.md) without forcing a quiz, replacing an existing draft or running a new discovery interview.

Global installation does not make library access automatic. Respect `--local-only`; access the configured personal library only within the user's requested scope. Preserve separate contexts and alternative styles. Imports are inspiration until the user chooses what should guide the new project; copying a collection does not approve every inherited preference.

After a save, verify and report the returned entry. After reuse, continue the imported draft through Collect if the user wants to refine it, or support Design if applying the chosen evidence was requested. Pass the entry/session IDs and provenance rather than restarting intake. The reference collection library exports collections, not the separate iteration journal. Automatic suggestions and a dedicated multi-collection mixing interface remain planned.

For curated findings, follow [personal insight operations](../insights.md#explicit-personal-insight-snapshots) instead of collection export. Preview the precise finding, scope, exceptions, selected source revisions and event/artifact bundles; save only within explicit user authorization. Use the separate `--personal-dir` store; `--library-dir` retains its collection-only meaning. Preserve differing source contexts and contradictory evidence. Import requires a relevance note for the new brief and creates a tentative project draft with a portable provenance receipt. It does not create an explicit instruction or automatically apply the finding. No broad repository scan or automatic promotion is part of this workflow.
