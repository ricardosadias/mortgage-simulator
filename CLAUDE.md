# Coding Guidelines

This project is a client-only React + TypeScript SPA using Mantine, Zustand and Vitest, deployed to GitHub Pages. There is no backend: all data lives in the browser's `localStorage`.
These principles are drawn from *Clean Code* (Martin) and *A Philosophy of Software Design* (Ousterhout).

## Naming

- Names must reveal intent. `getUserExpensesByMonth` beats `getData`.
- Boolean names answer a yes/no question: `isLoading`, `hasError`, `canSubmit`.
- Avoid encodings and noise: no `IExpense`, `expenseData`, `expenseList` — just `Expense`, `expenses`.
- Consistency beats creativity: pick one word per concept and use it everywhere (`fetch` vs `get` vs `load` — pick one).

## Functions and Components

- A function does one thing. If you need "and" to describe it, split it.
- Prefer fewer arguments. More than 2 params usually signals a missing concept — extract an object or a type.
- No boolean flags as arguments (`render(true)` — true what?). Use two named functions instead.
- Command/Query separation: a function either changes state or returns a value, not both.
- Components should be shallow callers of deep modules. Push complexity down into hooks, utils, or the store — not into JSX.

## Modules and Interfaces (deep over shallow)

- Deep modules: small, stable public surface; complex implementation hidden inside. A hook that encapsulates all store interaction + derived state is deeper than five separate selectors exposed raw.
- Shallow modules are a design smell. A component that just wraps one Mantine component with no added behavior is not worth the indirection.
- Hide information by default. Only export what callers need. Internal helpers stay unexported.
- Pull complexity down. If every caller has to do the same null-check or date format conversion, move it inside the module and let callers stay simple.

## Complexity and Abstraction

- Be strategic, not tactical. Tactical code (the quickest thing that works) compounds complexity. Before adding, ask: does this make the system simpler or harder to understand overall?
- Never add complexity to solve a problem that doesn't exist yet. No speculative abstractions, no "we might need this".
- Three similar lines is better than a premature abstraction. Abstract only when the pattern is stable and the duplication is genuinely harmful.
- When a piece of code is hard to name, it probably has unclear responsibilities. Rename by clarifying what it does; if you can't, redesign it.

## Comments

- No comments that restate the code. `// increment counter` above `count++` is noise.
- Comments explain the WHY (a hidden constraint, a non-obvious invariant, a workaround for a specific bug).
- Don't reference the current task, PR, or caller in comments — that belongs in the commit message.
- Interface-level comments (on exported functions and types) describe *what* the abstraction does and any non-obvious contracts. Implementation comments explain *why* a particular approach was chosen.

## Error Handling

- Prefer defining errors out of existence. Design types and APIs so that invalid states are unrepresentable.
- Don't return `null` for "not found" from a function that's always called in a context that requires a value — that forces every caller to null-check. Return a typed result or throw.
- Handle errors at the boundary (file import, browser API), not scattered through internal logic.

## Security

There is no server, so there are no endpoints, identities or secrets to protect. What remains:

- **Never trust a file.** Imported JSON is untrusted input. Validate every field (type, range, length, allowed keys) and rebuild objects field by field before they reach the store (see `src/utils/parseMortgages.ts`). Do not spread parsed input into state.
- **Never commit secrets.** Everything in the bundle is public.
- **Namespace storage keys** (`mortgage-simulator:…`). Every GitHub Pages project on the account shares one origin, and so one `localStorage`.
- **Pin third-party code.** Pin GitHub Actions to a commit SHA, and keep `yarn.lock` committed and installed with `--immutable`.

## Tests

- Tests must be readable: Arrange → Act → Assert, clearly separated.
- One concept per test. A test that asserts five things is testing five things.
- Test behaviour, not implementation. Tests that break when you rename an internal variable are not useful.
- No mocks of internal modules — only mock at true system boundaries (browser APIs, chart rendering).
- A flaky test is a bug. Don't skip it; fix it or delete it.
- When a new test fails because the code is wrong, never edit the assertion to match the buggy output — that ships the bug with a test guarding it. Assert the correct behaviour, then split by fix type. A **mechanical** defect with one right answer (a wrong date calculation, an off-by-one) gets fixed in the same change, with a regression test naming the cause. A defect whose fix is a **design choice** (which of several sensible behaviours is wanted, an API or UX change) does not: cover the intended path only, leave the broken path untested rather than pinned, and report it. Picking one reasonable fix silently is a decision that belongs to the person who owns the behaviour.

## Debugging and Verification

- Find the root cause before fixing. Reproduce the failure deterministically first — a fix for a cause you have not confirmed is a guess. If you cannot pin the exact cause, say so and stop rather than ship a speculative change.
- Reproduce the *reported* symptom, not a plausibly-related one. "A test passes now" is not the same as "the test that was failing passes now, for the original reason."
- Verify against the source of truth, never from memory. Dependency versions, config values, library APIs — read the registry, the file, the docs. Recall is not a source.
- Verify against committed state, not just your working tree. "Green on my machine" often relies on uncommitted or gitignored files (a local `.env.test`, an untracked fixture) a clean CI checkout will not have. Confirm from a clean tree before calling it done.
- A change is not done until it is verified the way it will actually run — CI, a clean checkout, the real flow — not only via the commands you happened to run locally.

### Verification loop

Run the cheap, self-repairing gates *before* the expensive one.

1. After editing: `yarn verify`. It auto-fixes prettier, eslint and stylelint, then typechecks.
2. Then run only the affected tests: `yarn vitest:changed`, or name the files directly (`yarn vitest src/utils/specs/mortgage.test.ts`).
3. Run the full `yarn test` **once**, before committing. It is what CI runs, and it includes the production build.

`yarn vitest` already expands to `vitest run`. Append filters directly; do **not** add a second `run` (`yarn vitest run --changed` is parsed as a filename filter, matches nothing, and exits 0).

## TypeScript

- Prefer precise types over `any`. If you reach for `any`, write a proper type instead.
- Avoid non-null assertions (`!`) unless the non-nullability is structurally guaranteed and obvious to a reader.
- Use discriminated unions to make impossible states unrepresentable rather than optional fields that may or may not co-exist.
- Derive types from their sources of truth: `ReturnType<>`, `Parameters<>`, `typeof`, `as const`.

## React specifics

- Keep components focused. A component that fetches, transforms, and renders is doing three things.
- Co-locate state with the narrowest owner that needs it. Don't lift state higher than necessary.
- Custom hooks are the primary unit of logic reuse — not HOCs or render props.
- Memoize (`useMemo`, `useCallback`, `React.memo`) only when a measured performance problem exists, not speculatively.
