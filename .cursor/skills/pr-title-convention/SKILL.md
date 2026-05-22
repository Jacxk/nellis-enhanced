---
name: pr-title-convention
description: Apply this repository's pull request title convention. Use when creating, renaming, reviewing, or suggesting GitHub PR titles for this repo.
---

# PR Title Convention

## Rule

Use concise conventional PR titles:

```text
type(scope): summary
```

Prefer a scope that names the user-facing area, feature area, or behavior being changed. Avoid generic implementation scopes like `chromium` when a clearer scope exists.

## Types

- `feat`: new capability or user-facing enhancement.
- `fix`: bug fix or behavioral correction.
- `refactor`: restructuring without intended behavior change.
- `chore`: maintenance, release, dependency, or workflow upkeep.
- `docs`: documentation-only changes.

## Scope Guidance

Choose the narrowest meaningful scope from the PR's purpose:

- `item`: item pages, item cards, item data, Amazon item search, non-refundable item UI.
- `cart`: cart, checkout, fees, save-for-later behavior.
- `ui`: broad visual or interaction polish that is not tied to one feature area.
- `dark-mode`: dark mode styling and contrast fixes.
- `notifications`: browser notifications, alarms, notification toggles.
- `api`: network behavior, request throttling, retries, background API calls.
- `theme`: theme-level styling when broader than dark mode.
- `deps-dev`: development dependency updates.

Only use an implementation location as the scope if it communicates the actual product area better than the alternatives.

## Examples

Good:

```text
feat(item): use Remix item title for Amazon search
feat(notifications): add auction browser notifications
fix(api): reduce too-many-requests errors
feat(item): preload carousel images on hover
feat(cart): show per-item total with fees
fix(dark-mode): cancellation screen CSS module surfaces
```

Avoid:

```text
feat(chromium): use Remix item title for Amazon search
feat(chromium): add auction browser notifications
Preload carousel images on item hover
Reduce too-many-requests errors
```

## Workflow

When creating or renaming PRs:

1. Check recent closed or merged PR titles with `gh pr list --state closed --limit 20 --json number,title,headRefName`.
2. Match the local convention, prioritizing `type(scope): summary`.
3. If an open PR uses a vague scope, rename it to a clearer feature or behavior scope.
