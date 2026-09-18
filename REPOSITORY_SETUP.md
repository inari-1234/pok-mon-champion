# Repository setup

Champion Coach is designed to use the GitHub repository as the source of truth.

## Initial repository setup

1. Create an empty GitHub repository named `pokemon-champions-coach`.
2. Use `main` as the default branch.
3. Put the files in this package at the repository root.
4. In GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
5. Push to `main`.

The `Deploy Champion Coach to Pages` workflow validates the app first and only deploys after the validation job passes.

## Normal update workflow

1. Start from the current `main`.
2. Make changes on a work branch.
3. Run syntax checks, regression tests, runtime smoke tests, and static consistency checks.
4. Merge or fast-forward only a passing revision into `main`.
5. Re-fetch `main` and verify the committed files/version/cache.
6. Confirm the Pages workflow succeeded and the deployed app reports the expected version.

## Important files

- `index.html` — app shell
- `styles.css` — UI
- `pokemon-data.js` — selectable Pokémon data
- `competitive-data.js` — bundled Regulation M-C competitive snapshot
- `core.js` — pure analysis/recommendation logic
- `app.js` — UI/state/persistence
- `manifest.webmanifest` / `sw.js` — PWA/offline support
- `version.json` — deployed-build identity
- `tests/` — regression/static/runtime tests
- `.github/workflows/validate.yml` — CI validation
- `.github/workflows/pages.yml` — Pages deployment after validation

Do not add ad-hoc `fix-v*.js` patch files. Integrate fixes into the owning module and add regression coverage.
