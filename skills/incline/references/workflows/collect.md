# Collect

**Use for:** exploring directions, saving descriptions and references, importing guides, and resuming a collection draft.
**Result:** a contextual collection, or an explicitly unfinished draft. This workflow does not itself implement a frontend or establish approval of an inferred design.

Follow [shared evidence rules](../evidence.md). If the user already supplied a direction, carry it forward; comparisons are optional. For an existing unfinished collection, resume without `--input` so a new draft does not replace the resume flow. Resolve the installed skill directory from `SKILL.md`, not this nested reference directory.

## Collect or refine taste

The package contains a standalone local UI and server. Node 22 or newer is required; no account, cloud deployment, API key, or package installation is needed.

1. Resolve this skill's directory and use the user's active project as the working directory. Start the bundled script in a retained terminal session:

   `node <skill-directory>/scripts/incline.mjs`

   The launcher detects the nearest repository root, or uses the working directory outside Git. Use `--project <absolute-project-directory>` when the task targets a different directory; do not launch from the skill's installation directory. The user should not need to locate the script or type paths. Project and global skill installations use the same workflow.

2. Read the JSON `ready` event and open its exact `url` in the user's available browser or browser panel. The URL contains a temporary token in its fragment; do not publish or reuse it for other sessions. If opening a browser is unavailable, show that localhost link to the user.
3. Let the user describe a direction, add references, or explore comparisons. Descriptions and references can be saved without completing a quiz. Do not invent answers or mark references as a chosen direction on their behalf. Notes are optional; an unexplained reference is exploratory evidence.
4. After the user selects **Finish & return to agent**, read the JSON `completed` event. Confirm the reported `profilePath` exists, read that Markdown and the relevant session evidence from `statePath`, and continue the user's design work. The server shuts down automatically. The page says it is safe to close.

Closing the tab early does not approve a profile change. When “Draft saved” appears, the latest changes are in `.incline/draft.json`; restart against the same project and open **Your collections** to resume. A session also exits after 30 idle minutes. If the user abandons the session, stop its retained process. A lock prevents two simultaneous sessions writing the same project; do not remove a live lock to start another.

## Bring existing conversation context

If the user already gave a description, images or links, carry them into the session. Write a temporary UTF-8 JSON file with their actual wording and available local image paths, then start with `--input <absolute-json-path>` in addition to `--project`. Each invocation with `--input` creates a new draft; omit it when resuming an existing one.

```json
{
  "name": "Portfolio direction",
  "description": "Newspaper columns with handwritten notes in the margins",
  "projectContext": "My personal writing website",
  "references": [
    {
      "file": "/absolute/path/to/reference.png",
      "note": "Keep the paper texture"
    },
    {
      "url": "https://example.com/reference",
      "title": "A reference from our conversation"
    }
  ]
}
```

All fields are optional. Each reference needs exactly one `file` or `url`; optional `title` and `note` retain user wording. Relative files resolve from the JSON file's directory. PNG, JPEG, WebP and GIF are supported, up to 8 MB each and 24 references per collection. Imports copy images into the project and mark them as inspiration. URLs must be HTTP(S); they are saved as links without automatically fetching previews. The opened page starts at the imported collection for the user to review. If conversation images are unavailable as local files, preserve the description and explain the missing attachment instead of inventing a substitute.

The image drop area accepts files and web-image drags, including embedded thumbnails. A remote image must permit browser access; if copying is blocked, ask the user to save the image and choose the local file. Google Images may provide a thumbnail rather than the full-resolution source. Never claim the full-size original was retrieved solely because a thumbnail imported successfully.

Markdown design guides can also be imported as `file` (UTF-8 `.md` or `.markdown`, up to 200 KB), with an optional `sourceUrl`. The local editor supports uploading or pasting them. For finding and importing public getdesign.md references, guide interpretation, optional provider access, or writing a project-specific `DESIGN.md`, read [Design guides as references](../design-guides.md).

## Finish and handoff

After completion, use the returned profile/state paths as the handoff. If the original request also asked to build or improve a frontend, continue in [Design](design.md) with the selected session and explicit notes. A request only to collect ends after saving or preserving the draft; do not initiate implementation or personal-library export.

## Optional discovery detail

New sessions use catalog v3: six broad composition pairs followed by density, typography, colour and layout (ten main comparisons). After those, the user can finish or choose an isolated spacing and/or motion follow-up. Do not force a narrower preference after “both” or “depends.” The spacing probe adapts to the density answer; a bold/kinetic composition choice does not establish a motion preference.

Selections persist when resuming. Changing an earlier answer or removing a probe discards dependent answers; only the current question plan contributes to the profile. Reduced-motion users see that the motion comparison is unavailable and can skip without supplying preference evidence. A skipped answer is retained as a gap, not a preference for stillness. Existing v1/v2 sessions retain their original question plans and answers.
