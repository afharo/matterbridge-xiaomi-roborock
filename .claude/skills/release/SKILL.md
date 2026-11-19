---
name: release
description: Prepare and publish a new version of the plugin (changelog, version bump, release PR, auto-merge, version branch restore, GitHub release). Use when asked to release, cut, or prepare a new version (patch, minor or major).
argument-hint: '[patch|minor|major]'
---

# Release a new version

Argument: the version level (`patch`, `minor` or `major`). If it's missing, propose one based on the `[Next]` section of
`CHANGELOG.md` (new features → `minor`, only fixes → `patch`) and ask before going on.

## Before starting

- Start from an up-to-date, clean `main` (`git checkout main && git pull --ff-only`, `git status` clean).
- Work out:
  - `PREV`: the current version in `package.json` (previous tag = `v$PREV`).
  - `NEXT`: the version after applying the level to `PREV`.
  - `DATE`: today, as `YYYY-MM-DD`.
- Check `CHANGELOG.md` has entries under `## [Next] - ??`. If it's empty, stop and ask.

## 1. Changelog commit

```sh
git checkout -b $NEXT            # the branch is named after the bare version, e.g. 0.9.0
```

In `CHANGELOG.md`, keep `## [Next] - ??` and add the version heading right below it, so all the unreleased entries move under the new version:

```md
## [Next] - ??

## [v$NEXT] - $DATE
```

```sh
npx prettier --check CHANGELOG.md
git commit -am "Prepare for v$NEXT"
git push -u origin $NEXT         # needed: npm's postversion runs a bare `git push`
```

## 2. Version bump

```sh
npm version <level>
```

- `preversion` runs `npm run runMeBeforePublish` (lint, format, test, build). If it fails, fix that first: don't skip it.
- It creates the `$NEXT` commit and the `v$NEXT` tag, and `postversion` **pushes both**. So the tag is published before the PR merges.
  If the PR needs more changes, the tag has to be moved.

## 3. Release PR

Title `$NEXT`, base `main`, label `release` (`.github/release.yml` excludes it from the release notes). Body, like the previous release PRs:

```md
## Description

<!-- Provide an explanation of the changes, the motivation, and link it to any issue if it exists (e.g. fixes #321). -->

Prepare for release of v$NEXT. It's a new <level> because:

- <the main changes, linking their PRs>

## Checklist

<!--
  Make sure to check the following and tick the boxes once they are done.
  Strike them through (wrap them in between ~) if you don't think that these are necessary for this PR.
-->

- [x] Update the CHANGELOG.md file, including a description of the changes, following the convention commented at the
      top of the file.
- [x] ~Add tests for the new code that you just changed. We'd like to keep the coverage as close to 100% as possible.~ (version bump only)
- [x] Add the appropriate labels to the PR.
```

Then enable auto-merge (release PRs are squash-merged):

```sh
gh pr merge <number> --auto --squash
```

## 4. After the merge

Wait for the PR to be `MERGED` (`gh pr view <number> --json state`): it can be immediate, or wait for CI. Use a Monitor rather than repeated polling.

1. **Restore the version branch.** The maintainer keeps every version branch, but GitHub deletes it after the merge:

   ```sh
   git ls-remote --heads origin $NEXT || true    # empty = deleted
   git push origin $NEXT:refs/heads/$NEXT
   ```

2. **Create the GitHub release** from the `.github/release.yml` template. **Always pass `--notes-start-tag`.** Because of the squash merges,
   the tags sit on the version branches, not on `main`, so no previous tag is an ancestor of the new one. Without the flag,
   GitHub starts the notes from a much older point.

   ```sh
   gh release create v$NEXT --title "v$NEXT - $DATE" --generate-notes --notes-start-tag v$PREV --verify-tag
   ```

   Check the result: `gh release view v$NEXT` should list only the PRs merged since `v$PREV`.

3. Sync the local checkout: `git checkout main && git pull --ff-only`.

Report the PR and release links to the user.
