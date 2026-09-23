# web-reference

Design references for the Evergreen landing site and dashboard.

| File | What it is |
|---|---|
| [`EVERGREEN-PRODUCT-AND-DESIGN-SPEC.md`](EVERGREEN-PRODUCT-AND-DESIGN-SPEC.md) | The product and design spec: information architecture, UX rules and page specifications. Authoritative for behaviour, states and honesty. |
| [`evergreen_protocol/DESIGN.md`](evergreen_protocol/DESIGN.md) | The design-token file that came with the page exports. Adopted for typefaces, the surface colour and the status label tones only; its header says where the spec governs instead. |

## The page exports are not in this repository

Decided on 2026-09-17. They carry placeholder data and claims the project never made, and a public repository cannot attach a disclaimer to a file someone opens directly. They stay on Fatih's machine, and the [`.gitignore`](.gitignore) in this folder keeps them out of any commit. `git add -f` still overrides it, so it stops accidents, not decisions.

Where the spec and the exports disagree on appearance, the exports win; on behaviour, states and honesty, the spec wins. Because the exports are not public, **every web pull request attaches a render of the page it built**, and reviewers compare against the thing that ships.
