# Incline: local agent workflow and wider exploration

User steering: invoke from Codex/Cursor/Claude Code, temporarily open localhost, save taste evidence on disk, then close the visual surface and continue agent work. Explore substantially different styles and layouts, informed by Fable's range rather than copying its designs.

## Decisions
- Deliver a portable `skills/incline` package containing stable instructions, a bundled zero-dependency Node server, and built static UI.
- Run `node <skill>/scripts/incline.mjs --project <project>`; bind only to loopback on an OS-assigned port, print structured ready/completed events, and exit after explicit Finish. The browser receives a session token in its URL fragment. No hosted service is needed.
- Canonical data lives under `<project>/.incline/`: immutable revision JSON, current state JSON, per-project profile Markdown, and a resumable draft. Keep instructions outside mutable evidence. Explicit completion writes a new revision atomically before updating current state; ordinary drafts cannot overwrite committed instructions. A previous revision remains available to the agent.
- Reject external origins and unauthenticated API calls; never accept arbitrary filesystem paths from browser payloads. Bound request size and validate all session fields before saving. Use a lock for concurrent sessions; existing malformed state fails closed.
- New sessions use a versioned 12-comparison catalog: six broad pairs spanning twelve design families, then density, typography, colour, layout, an adaptive spacing boundary, and motion. Each family has its own composition. Old eight-round sessions remain interpretable with their original catalog.
- Inline enlargement lets users inspect a candidate without changing their vote. A reference gallery exposes the full range before starting; selecting multiple directions remains possible in the final profile.
- No global profile inference yet. An agent reads all relevant project sessions and explicit notes; silence and losing comparisons remain unknown. Candidate summaries are provisional and free text is preserved verbatim.

## Validation
Tests cover catalog coverage and legacy compatibility; real HTTP + temporary directory tests cover token/origin enforcement, draft persistence, append-only revision history, invalid payload rejection, restart resume, locking, finish acknowledgement and shutdown. Build a portable package and smoke-test that bundled package, not only source modules. Existing inference tests stay intact.

## Delivery
Local-only per this request. Keep the previously hosted demonstration unchanged. The deliverable is the self-contained skill package and an active localhost preview, not a cloud redeployment. No global agent configuration is changed without an installation request.

## Verification result

18 behavioral tests pass; TypeScript and application lint pass. The static UI and portable server bundle build successfully. A smoke test of the bundled CLI loaded all entry assets and the image, submitted a twelve-round session, verified the profile and immutable revision, observed the completed event, and confirmed clean process exit. The local gallery was opened in the existing browser tab. Full visual and browser-interaction QA was not performed.
