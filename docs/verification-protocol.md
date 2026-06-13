# Verification Protocol

Use this checklist after implementation is done. The goal is to prove the
change without spending verification time on unrelated app flows or flaky
browser automation.

## Default Order

1. Run the automatic checks first.

   ```powershell
   npm.cmd run build
   ```

2. Run focused tests only when the change touches covered logic, shared
   utilities, or behavior that already has nearby tests.

   ```powershell
   npm.cmd run test:run
   ```

   Prefer a targeted Vitest file when that gives the same confidence faster.

3. Check the changed-file surface before doing UI work.

   ```powershell
   git diff --name-only
   ```

   Confirm the diff only contains files that match the intended task. If the
   branch already has unrelated work, keep the final report scoped to the
   behavior verified in this pass.

4. For every UI behavior, write one sentence before opening the browser:

   ```text
   I am verifying that <specific change> is observable through <DOM/text/state>.
   ```

5. Stop browser exploration when the same entry, click, or modal step fails
   twice. Switch to code, DOM, state, or console evidence instead of repeating
   coordinates or trying the whole user journey again.

## Repeated Waste Patterns

- Scope creep: checking the whole product flow instead of the changed behavior.
- Browser automation overconfidence: retrying a click that is not reaching the
  app event handler.
- Entry-flow traps: losing time in onboarding, modals, first-run state, or demo
  setup before reaching the feature under test.
- Ambiguous signals: mixing up "the UI is absent" with "the app state did not
  change."
- Session leftovers: leaving dev servers, browser tabs, or local state in a
  condition that makes the next verification less reliable.

## UI Verification Checklist

- Start with one concrete verification goal per changed behavior.
- If the target state is behind onboarding or first-run setup, look for an
  existing fixture, localStorage value, route, or state initializer before
  walking the whole flow manually.
- If a click fails, do not keep trying coordinates. Inspect the button state,
  accessible name, DOM event target, and browser console.
- For UI that should no longer exist, verify both code references and DOM
  absence when possible.
- For UI that should appear, verify the render condition and the actual text,
  role, or state that proves it appeared.
- If the in-app Browser cannot start or bootstrap, follow
  `docs/codex-verification.md`: try once, then fall back to static checks and
  report that visual verification was skipped.

## Done Criteria

A verification pass is complete when all applicable items are true:

- `npm.cmd run build` passes.
- Relevant tests pass, or the final report explains why no runtime test was
  needed.
- `git diff --name-only` has been checked for intended file scope.
- Each user-visible behavior has at least one direct piece of evidence.
- Any blocked browser check includes the blocker and the substitute evidence in
  the final report.

## Reporting Template

Use a short final report that separates verified facts from skipped checks.

```text
Verified:
- Build: npm.cmd run build passed.
- Scope: git diff --name-only checked; only <relevant files/areas> were used for this task.
- UI behavior: <direct evidence>.

Skipped or blocked:
- <Browser/test check> was not completed because <reason>. Substitute evidence: <evidence>.
```
