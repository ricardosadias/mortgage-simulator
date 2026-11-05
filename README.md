# Mortgage simulator

Track a mortgage, see its full amortisation schedule, simulate early repayments, and compare
offers from other banks. Built for Portuguese loans: Euribor + spread, fixed and mixed rates,
spread cashback campaigns, 4% stamp duty on bank fees.

It runs entirely in your browser and has no backend. Your loans are saved in this browser's
`localStorage` and go nowhere else.

**Live:** https://ricardosadias.github.io/mortgage-simulator/

## Your data

- Loans are stored per browser and per device. Clearing site data deletes them.
- **Export** downloads every loan as a JSON file. Keep one as a backup.
- **Import** loads a file exported by this app and replaces all current loans, after asking
  for confirmation. The file is validated field by field first, and an invalid file changes
  nothing.

### Moving loans over from our-house

our-house caches the house's loans in its own `localStorage`. With our-house open and the
Mortgages page loaded, run this in the devtools console:

```js
copy(JSON.stringify(JSON.parse(localStorage['mortgages-cache']).state.mortgages));
```

Paste the result into a `.json` file and **Import** it here. The our-house `houseId` field is
dropped on import.

## Development

Requires Node (see `.nvmrc`) and Yarn 4 (bundled in `.yarn/releases`).

```sh
yarn install
yarn dev            # http://localhost:5173/mortgage-simulator/
yarn verify         # auto-fix formatting and lint, then typecheck
yarn vitest         # unit and component tests
yarn test           # everything CI runs, including the production build
```

## Deployment

`.github/workflows/deploy.yml` runs `yarn test` on every push and pull request. A push to
`main` then publishes `dist/` to GitHub Pages. In the repo, set
**Settings → Pages → Build and deployment → Source** to **GitHub Actions**.

The site is served from `/mortgage-simulator/`, which is set as `base` in `vite.config.mjs`.
Change it there if the repo is renamed.
