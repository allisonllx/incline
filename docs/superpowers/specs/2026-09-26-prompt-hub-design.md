# Curated prompt hub and component prompt authoring

Date: 2026-09-26. Status: design proposal, not implemented.

The user agreed to a source-attributed prompt hub and a focused prompt-authoring workflow, then added faceted tags, lightweight retrieval, possible Jev review, component-level generation, and visible testing status. This document records that direction and the proposed boundaries. It does not update the installed skill, enable external calls, or collect new personal evidence.

## Purpose

Help Incline translate design intent into specific execution instructions. Preserve useful prompts together with the references, requirements, adaptations, and outcomes that make them usable. Reuse should remain contextual: collecting a prompt is interest, not an aesthetic endorsement or a universal preference.

The product interaction can resemble a personal reference board such as Folio: save, preview, organise, find, and reuse. No integration with or changes to the Folio project are part of this proposal.

## Starting evidence and implementation fit

- The [source motion prompt](https://x.com/twoclipping/status/2103273003555402193) was readable in the browser on 2026-09-26. It specifies inputs, visual direction, choreography, implementation techniques, rendering checks, and failure cases. Its embedded video did not play, so its visual result and reproducibility were not verified.
- Existing [collections](../../../lib/collection.ts) support images, links, and Markdown guides; [personal collections](../../../skills/incline/references/personal-library.md) preserve immutable copies with source attribution. These are useful foundations, but there is no current prompt entity, faceted prompt search, or automatic prompt retrieval.
- Existing [Jev review](../../../skills/incline/references/jev-review.md) is an optional text-based review of selected insights. It sends no images and does not generate prompts or execute recommendations. Prompt routing would require a separate rubric and adapter; it is not enabled by the current integration.
- [Exploration](../../../skills/incline/references/exploration.md) already preserves alternative interpretations, attempts, and linked reactions. Prompt usage can connect to this history rather than introducing a second preference-learning system.

## Approaches considered

| Approach | Benefit | Limitation |
| --- | --- | --- |
| Bookmark prompts as existing guides | Smallest initial change; original text and source can already be retained | Weak component matching, adaptation lineage, and testing status |
| Add structured prompt entries to the existing library experience | Supports lightweight retrieval, reproduction context, and linked outcomes | Needs an additive data model and focused workflow; recommended |
| Build an independent public prompt platform | Supports community discovery and publishing | Adds hosting, moderation, and distribution before personal usefulness is established |

Start with personal curation for frontend components and interface motion. Record the intended output medium explicitly so a rendered motion demo is not mistaken for a functioning application component. Broader image/video prompt workflows can share the model later without expanding the first implementation into a general media platform.

## Save and curate

Users can provide a source link, paste a prompt, or save a prompt authored during a project. Required reproduction information can remain unknown; saving a reference must not require an exhaustive annotation exercise.

An entry retains:

- Stable entry identity and immutable revisions; original prompt bytes and language.
- Origin: published, user-authored, agent-authored, or agent-reconstructed. A reconstruction is never presented as the original author's prompt.
- Source URL, author when known, capture time, available attribution/license information, and any unavailable source content.
- Optional source embed and durable permitted captures. An embed or URL alone is not retained visual evidence. Store a useful whole view and details where needed; motion-dependent claims require motion evidence or an explicit gap.
- Intended effect, component/task roles, output medium, required inputs, assets, tools/runtime, and known limitations. Unknown requirements remain unknown.
- Original user notes and their scope, separate from generated descriptions or tags.
- Explicit adaptable slots and essential relationships, with provenance for the agent's interpretation. Preserve the full original so a later interpretation can differ.
- Parent entry/revision for adaptations, the actual adapted prompt, and links to local runs and any deliberately shared results.

Imported prompt text is reference material. Its instructions cannot change permissions, override project constraints, install dependencies, or trigger execution on their own. Preserve original material separately from project-specific adaptations.

## Faceted tags and lightweight retrieval

Generate editable tags in separate facets rather than one undifferentiated list:

| Facet | Example values |
| --- | --- |
| Output medium | live frontend, rendered UI motion, image asset |
| Task/component role | hero illustration, navigation transition, loader, data chart |
| Visual treatment | technical drawing, monochrome, editorial, botanical |
| Motion/interaction | continuous morph, spring response, direct manipulation, looping |
| Technique/runtime | glyph rendering, SVG, canvas, deterministic timeline |
| Inputs and constraints | needs reference image, needs audio, reduced-motion variant unknown |

Record whether a tag came from source text, inspected visuals, an agent hypothesis, or the user. Source-explicit properties and inferred style labels must remain distinguishable. Generated tags describe an entry; they do not update a user's taste profile. Keep free-text notes and previews available so a taxonomy does not erase combinations or hard-to-name qualities.

The first index is a rebuildable local projection over entry metadata. Use faceted filters plus text matching and a small bounded shortlist. Inspect the selected source and original prompt on demand instead of loading the whole hub into context. No embedding service, remote index, or fixed aesthetic similarity score is required initially. A no-match result continues the normal authoring workflow.

Match the requested effect, task role, medium, technical constraints, and project context. Colour or a single shared object is insufficient evidence of suitability. Related techniques can remain candidates across different style tags. Unknown metadata should be exposed, not silently treated as incompatible.

Project-local entries are available within the task's scope. A user can enable automatic lookup in a selected personal prompt library for a project; that setting permits read/retrieval without repeated permission questions. It does not enable uploads, external Jev calls, automatic saving to the personal library, or scanning unrelated repositories. Local-only mode disables personal-library access and external routing.

## Jev's proposed role

Routing has three distinct stages:

1. Local code performs deterministic checks on declared medium, assets, runtime, explicit exclusions, and the enabled library scope. A verified hard incompatibility can exclude a candidate from direct use while leaving it discoverable for deliberate adaptation.
2. Optional Jev review assesses a small selected shortlist against a scoped task: relevant, needs adaptation, unrelated, or uncertain. It can flag declared conflicts, missing requirements, and the component a recipe might support. These semantic judgments are model assessments, not deterministic truth.
3. The main agent inspects relevant visuals, chooses or adapts a candidate in context, and explains its intended use. User reactions to actual outputs determine preference evidence.

Jev is not the prompt writer, a screenshot evaluator, a measure of taste, or an authority to run a candidate. Uncertain candidates remain visible; a low confidence value must not silently discard useful material. Testing status informs the available evidence, not whether a different user will like the result.

Default retrieval works without Jev or an API key. A routing request uses its own versioned rubric and an offline exact-payload preview. Send only the selected task description, relevant constraints, and selected recipe metadata/excerpts within an authorised scope. Exclude unrelated history, credentials, local paths, and media bytes. Retain the request hash, recipe revisions, model/rubric version, and advisory response. Existing authorisation for another Jev use case does not automatically cover a new payload. API failure falls back to local retrieval and agent review.

## Component-level prompt authoring and execution

Keep one owner for the user's overall design task. Design owns a finished frontend; a focused Prompt workflow produces or adapts execution prompts; Collect/Library support curation and retrieval. A request to write or save a prompt alone does not execute it.

The workflow:

1. Read the project brief, explicit keep/avoid instructions, relevant evidence, and available tools. Establish a shared page/composition direction: hierarchy, type, palette roles, spacing, motion rhythm, and task usability.
2. Identify only the distinctive or uncertain components that need a dedicated generation brief. Keep tightly coupled elements together: the tree and headline may be one composition problem. Ordinary controls and small edits do not require separate prompt generation.
3. For each selected component, define its role, inputs/outputs, layout bounds, neighbouring relationships, applicable interaction states, responsive behaviour, accessibility requirements, and dependencies. Rendered-video studies and functioning UI have different contracts.
4. Retrieve suitable recipes and inspect their relevant originals. Preserve source instructions as provenance; adapt their mechanism to the shared direction. Avoid combining every candidate or copying a source palette merely because a technique is useful.
5. Produce a specific execution prompt with required inputs, intended observable effect, essential relationships, adaptable choices, relevant implementation technique, known failure cases, and inspection checks. Use source-grounded values or label proposed defaults. Do not inflate prompts with unsupported precision or generic superlatives.
6. When generation is requested, run with the available appropriate tools and the task's budget. Respect dependencies and do not silently install missing tools. Save the actual prompt revision and available tool/model/settings with the resulting artifact. Preserve a failed or incomplete result with its limitations.
7. Inspect the component and then the assembled composition. Check boundary spacing, hierarchy, type, colour roles, motion, real states and relevant viewports. A set of individually attractive components is not evidence that the full interface works.
8. Record the user's actual reaction within active recording scope. Refine the execution, reconsider the recipe, or return to another interpretation using the existing exploration workflow. End on selection, a scoped completed edit, stop, or budget; do not keep generating until a favourable verdict appears.

Repeated generation must not require the user to restate existing constraints or fill every template input. Ask only for missing information that materially affects the result; use clearly identified reversible defaults where appropriate.

## Testing status and provenance

Avoid a single unqualified tested=true field. Derive readable badges from linked evidence on the specific prompt revision:

| Dimension | Meaning |
| --- | --- |
| Execution evidence | Untested here, attempted, or rendered/executed with a linked result |
| Inspection coverage | What was actually checked, such as desktop only; technical checks can pass while visual fit remains unreviewed |
| Tester | Author-reported, agent-run, or user-reported/observed; distinguish external claims from local evidence |
| User review | Not reviewed, acceptable, preferred in this comparison, rejected, or mixed, with original evidence and scope |

“Tested by you” means that the user explicitly reported testing or interacted with/evaluated an identified result; merely receiving a generated output is insufficient. “User reviewed an agent-generated result” is available as a more precise label. Testing and preference are separate: a user-tested recipe may be disliked, and an untested recipe may still be useful.

Tests belong to the exact prompt revision, adapted inputs, model/tool when known, artifacts, and project context. A modified prompt does not inherit successful testing as its own result; show the parent's history separately. “Push” is not proof of aesthetic success. A visual inspection is not a user verdict. Record contextual exceptions rather than a universal quality score.

The trajectory connects source prompt → adapted prompt → input assets → resulting component → assembled result → original reaction. It should be possible to revisit that evidence without relying entirely on a distilled summary. Missing captures remain explicit; later renders do not replace the exact versions the user saw. Stopping recording also stops new feedback capture through prompt run records.

## Storage and compatibility

Use an additive prompt model with JSON metadata, original prompt text, and versioned assets; expose it through the existing collection/library experience. Proposed locations are project `.incline/prompts/` and a separately configured personal `~/.incline/prompt-library/`. These are sibling stores, not new directories inside the existing library scanner's entry namespace. Keep legacy version-1 collections and personal snapshots unchanged and readable.

Personal saves and imports are explicit immutable copies with source receipts. Project adaptations remain independent. A rebuilt tag index is disposable; authoritative entry revisions and run evidence are not. Existing feedback remains the source of original reactions, and exploration attempts can reference prompt files/results. Use typed, revision-specific links for the new prompt data instead of burying relationships in growing context prose.

Reuse the current bounded-file, path-validation, hash, immutable-publication, and selected-evidence patterns. UI previews render imported text safely. Resolve unavailable embeds to a source card with retained evidence and an honest gap, rather than breaking the entry or pretending to retain a video. Supported media sizes/formats must be explicit in implementation and errors must not silently truncate source material.

## First delivery and evaluation

Begin with source-preserving prompt entries, editable facets, local query/shortlist, explicit project reuse, revision-specific run/review evidence, and the focused authoring workflow. Surface these in the existing library UI with source/result previews. Add the optional Jev routing adapter after comparing its decisions with ordinary local retrieval plus agent review on a fresh labelled set. Do not make Jev a prerequisite for the hub.

Curate three to five representative recipes, including the linked motion prompt as unverified source material until its result is inspected or reproduced. Use a real project task to compare the prior workflow against recipe-assisted generation with matched inputs, tools, and budget. Keep human preference, successful feature transfer, integration quality, explanation effort, repeated corrections, and cost separate. Test component generation both in isolation and in its surrounding composition.

Deterministic acceptance checks should cover old collection compatibility, source-byte preservation, editable tag provenance, read-only local queries, explicit scope, missing media, independent imports, immutable revisions, stale testing claims, Jev failure/uncertainty, and no external request before the authorised payload. Workflow checks should cover a misleading stylistic tag, a technically suitable but visually unsuitable recipe, a coupled tree/headline composition, stop-recording, and integration drift across individually generated components.

Defer a public marketplace, broad scraping, universal taste ranking, automatic personal promotion, remote semantic infrastructure, and a fully autonomous generation controller. Broaden only when real use identifies a specific need.
