# Releasing

Releases are tags. Versions follow [semantic versioning](https://semver.org); while the version is `0.x` a minor version may contain breaking changes (they are written down in the changelog).

## Every change

A pull request that changes what users see adds a changeset:

```bash
pnpm changeset
```

Choose `patch` (fix), `minor` (new option or rule) or `major` (breaking), and write one sentence for the changelog. The file in `.changeset/` is committed with the pull request.

## A release

1. On `main`, collect the changesets into a version:

   ```bash
   git switch -c release/next
   pnpm version-packages   # bumps package.json and writes CHANGELOG.md
   git commit -am "chore: release"
   ```

   Open a pull request, let `CI passed` go green, squash-merge it.

2. Tag the merge commit and push the tag:

   ```bash
   git switch main && git pull
   git tag v0.2.0      # the version in package.json, with a v in front
   git push origin v0.2.0
   ```

3. The workflow `Release` checks that the tag is on `main`, that it matches `package.json` and that the CI of this very commit passed. It repeats the quick checks (lint, types, unit tests, build, package lint; the browser tests are not repeated, the CI did them), **stages** the version on npm with provenance and creates the GitHub release with the notes of that version from `CHANGELOG.md`.

4. **Approve the version on npm.** The trusted publisher of the package only allows staging ("npm stage publish"), so a version is not public until a maintainer approves it with two-factor authentication: on npmjs.com open the package, the **Staged Packages** tab, check the version and click **Approve**. From the command line: `npm stage list`, then `npm stage approve <stage-id>`. Nothing that went wrong in a build can reach users without this step.

A version with a hyphen (`0.3.0-beta.1`) is published as a pre-release on GitHub. For npm, stage and approve those with a tag by hand, so `latest` does not move.

## One-time setup

### GitHub (repository settings)

1. **Settings, General**: under "Pull Requests" allow only **squash merging**, and switch on "Automatically delete head branches".
2. **Settings, Code security** (or "Advanced Security"): switch on **Private vulnerability reporting**, **Dependabot alerts**, **Dependabot security updates** and **Secret scanning** with **Push protection**. Leave "Code scanning default setup" **off**: CodeQL runs from `.github/workflows/codeql.yml`, and both together conflict.
3. **Settings, Rules, Rulesets, New branch ruleset** named `protect-main`:
   - Enforcement status: Active. Target: Default branch.
   - Restrict deletions, Block force pushes.
   - Require a pull request before merging (0 approvals is fine for a single maintainer), allowed merge methods: Squash.
   - Require status checks to pass: add **`CI passed`** (it appears in the list after the first workflow run), and "Require branches to be up to date".
   - No bypass list.
4. **Settings, Actions, General**: "Workflow permissions" read-only is enough (each workflow asks for what it needs).

### npm (the first version, then trusted publishing)

npm trusted publishing can only be set up for a package that exists. So the name is reserved with the current version `0.0.0` by hand, and the first real release already goes through the pipeline:

1. Create an account on npmjs.com and switch on two-factor authentication.
2. From a clean checkout of `main` (after the first commit is on GitHub):

   ```bash
   pnpm install --frozen-lockfile
   npm login
   npm publish --access public --provenance=false   # the provenance only works from GitHub Actions
   ```

   npm asks for the one-time password of your account.

3. On npmjs.com open the package, **Settings**, **Trusted Publisher**, choose **GitHub Actions** and enter
   - organisation or user: `leonkrix`
   - repository: `playwright-layout-guard`
   - workflow filename: `release.yml`
   - environment: leave empty
   - allowed action: **stage** ("npm stage publish"). The workflow cannot publish directly, a maintainer approves each version. If you choose "publish" instead, replace `npm stage publish` by `npm publish` in `release.yml`.
4. In the same settings choose "Require two-factor authentication and disallow tokens", so that only the workflow can publish from now on.
5. Mark the placeholder: `npm deprecate playwright-layout-guard@0.0.0 "Placeholder, use 0.1.0 or newer"`.
6. Release `0.1.0` as described above ("A release"). The first changeset is already in the repository.
