# Contributing

Thank you for looking at this. Bug reports, false positives and ideas are as welcome as code.

## How a change gets in

1. **Issue first, for anything bigger than a small fix.** A bug with a reproduction, an idea for an option or a rule: open an [issue](https://github.com/leonkrix/playwright-layout-guard/issues) and say what you test. It saves you from writing code that does not fit.
2. **Small fixes and documentation: straight to a pull request.** A typo, a wrong sentence in the README, a clear bug with a test.
3. **Fork, branch, pull request.** Fork the repository, make a branch, and open a pull request against `main`. You do not need write access, and nobody has to add you.
4. **The CI runs.** The first time you contribute, a maintainer has to approve the run (GitHub asks for that for every new contributor, because workflows run code). The check `CI passed` has to be green.
5. **The maintainer reviews and merges.** Only a maintainer can merge. Pull requests are squash-merged, so the title of the pull request becomes the commit message: write it as a Conventional Commit.
6. **The change is released** with the next version. A pull request that users can see carries a changeset (see below); the maintainer collects them into a release.

Nobody merges their own pull request without the CI. While there is one maintainer, the maintainer's own pull requests need no second approval; that changes as soon as there is a second maintainer.

## Reporting a false positive

The most useful report is a page where the guard fails a test but nothing visibly jumps (or the other way round). Please include:

- the message of the failed test (it names the element and how far it moved),
- the HTML and CSS that reproduce it, as small as you can make it,
- the browser and the versions of Playwright and this package.

A small page for `test/fixtures/` that shows the problem is the best report there is.

## Development

You need Node 24 (see `.nvmrc`) and [pnpm](https://pnpm.io) (the version is pinned in `package.json`, Corepack picks it up: `corepack enable`).

```bash
pnpm install
pnpm exec playwright install chromium   # firefox and webkit are optional, see below
pnpm check                              # lint, format, types, unit tests, build, package lint, browser tests
```

- `pnpm test` runs the browser tests in Chromium. `pnpm test:all-browsers` also runs Firefox and WebKit (install them first with `pnpm exec playwright install firefox webkit`). The CI runs all three.
- `pnpm test:unit` runs the unit tests (Vitest).
- `pnpm survey` opens a list of public pages and compares the guard with the browser's own layout shift measurement. It needs the network and takes about ten minutes, and it is not part of the checks.

### How the code is organised

- `src/page-script.ts` is the part that runs in the page. Playwright sends it to the browser as text, so it has to be **self-contained**: no imports, no helpers from other files, no variables from outside the function. It is compiled with plain `tsc` for that reason.
- `src/install.ts` connects that script to a Playwright page or context, `src/fixture.ts` is the `test` with the guard switched on.
- Every behaviour has a small page in `test/fixtures/` and a test in `test/guard.spec.ts`. A change in what counts as a shift starts with such a page.

### Pull requests

- One topic per pull request. Add or change a test.
- Add a changeset for anything users can see: `pnpm changeset` (choose patch, minor or major and write one sentence). Documentation and CI changes do not need one.
- The pull request title is a [Conventional Commit](https://www.conventionalcommits.org) (`fix: ...`, `feat: ...`, `docs: ...`, `chore: ...`).
- The check `CI passed` has to be green.

By contributing you agree that your contribution is licensed under the MIT license of this project.
