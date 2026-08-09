# Task 2 Report: Settings Domain and Accessible Route Transitions

## Outcome

Implemented the versioned settings domain, application-level settings provider, first-release settings controls, cache summary/confirmation clear action, image-quality and prefetch-intensity consumers, and an accessible three-state route transition.

The public Task 1 contracts remain unchanged: `AppShell` is still exported under the same name, and neither `appRoutes`, `mainNavigation`, nor the official knowledge paths were changed. No animation dependency or API/server behavior was added.

## Behavior delivered

- `gal-toolbox-settings-v1` stores only complete, validated preference records; absent, malformed, obsolete/partial, or invalid records fall back to a fresh default object.
- Full motion lasts 500 ms total (250 ms cover plus 250 ms reveal), with the cyan layer completing after a 70 ms delayed start. Reduced motion is a 120 ms fade (60 ms plus 60 ms) with no large sweep. Off uses zero timing.
- System reduced-motion wins over the default full-motion preference until `allowFullMotion` is explicitly enabled.
- `SettingsProvider` tracks browser reduced-motion changes, persists updates, applies density metadata, and can reset state without immediately rewriting the removed storage record.
- `RouteTransition` uses the finite `idle -> covering -> revealing -> idle` reducer. Internal link navigation is intercepted before router navigation; the resolved outlet element remains unchanged until the stage is covered. History/redirect changes retain the previous outlet until their cover point.
- Target detail-query readiness is checked by the destination's existing React Query key. Cache hits reveal immediately after cover; pending detail data receives an entity-specific label. Query success and failure both reveal, and a 10-second defensive fallback guarantees a terminal state if query/animation notifications are unavailable.
- The live announcement (`aria-live="polite"`) is separate from the duplicate visual loading label inside the `aria-hidden` curtains.
- Settings page exposes labelled radio groups for motion, image quality, prefetch strength, and density, plus an explicit full-motion override, cache counts, and a confirmation-gated action that clears both React Query cache and versioned local preferences.
- Image quality changes only browser image URL/loading hints: high uses the existing full URL, balanced uses the existing thumbnail when present, and data saver also forces lazy loading. It does not alter an API request.
- Prefetch strength changes only client-side triggers: data saver keeps pointer-down, balanced preserves pointer-enter/focus/pointer-down, and aggressive additionally starts when an entity card mounts. `prefetchEntity` and all API page-size/query contracts remain unchanged.

## Strict TDD evidence

### RED 1: missing interfaces

Command:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/app/settings.test.ts src/app/RouteTransition.test.tsx
```

Result: exit 1. Both suites failed to import the intentionally absent `./settings` and `./RouteTransition` modules. Minimal non-behavioral interface stubs were then added so RED could be verified at assertion level.

### RED 2: domain and transition behavior

Same command after interface stubs.

Result: exit 1; 2 files failed, 6 tests failed and 3 passed. Assertion failures demonstrated:

- settings did not round-trip;
- system reduced-motion did not override default full motion;
- reducer remained `idle` instead of entering `covering`;
- full timing returned zeros instead of 250/250/70;
- destination labels were generic;
- rendered markup had no live region or hidden curtains.

### GREEN 1: domain and transition behavior

Command:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/app/settings.test.ts src/app/RouteTransition.test.tsx
```

Result: exit 0; 2 files passed, 9 tests passed.

### RED 3: settings controls and image preference consumer

Command:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/app/settings.test.ts
```

Result: exit 1; 2 tests failed and 5 passed. The placeholder page lacked every preference group/cache action, and high-quality eager rendering still emitted the thumbnail URL.

### RED 4: shell integration

Command:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/app/settings.test.ts src/app/RouteTransition.test.tsx
```

Result: exit 1; 1 test failed and 11 passed. Real `appRoutes`/`AppShell` server rendering contained no route-transition boundary.

### Focused GREEN and regression check

Command:

```powershell
npm.cmd run test -w @gal-toolbox/web -- src/app/settings.test.ts src/app/RouteTransition.test.tsx src/queries.test.ts src/buffered-pages.test.ts
```

Result: exit 0; 4 files passed, 18 tests passed. Settings/transition cases and existing prefetch/buffering invariants were green together.

## Final verification

```powershell
npm.cmd run test -w @gal-toolbox/web
```

Exit 0: 7 test files passed, 24 tests passed.

```powershell
npm.cmd run typecheck -w @gal-toolbox/web
```

Exit 0: `tsc -b --pretty false` completed without diagnostics.

```powershell
npm.cmd run build -w @gal-toolbox/web
```

Exit 0: TypeScript build and Vite production build completed; 110 modules transformed.

## Files

- `apps/web/src/app/settings.ts`
- `apps/web/src/app/settings.test.ts`
- `apps/web/src/app/RouteTransition.tsx`
- `apps/web/src/app/RouteTransition.test.tsx`
- `apps/web/src/pages/SettingsPage.tsx`
- `apps/web/src/app/AppShell.tsx`
- `apps/web/src/queries.ts`
- `apps/web/src/components.tsx`

## Concerns / follow-up

- Styling is intentionally structural and inline for the new transition/settings surfaces because Task 2 does not own the stylesheet files. Task 3 can apply the planned visual-system classes without changing these state or accessibility contracts.
- Unit tests cover reducer terminal paths, exact timing, destination labels, rendered accessibility separation, shell mounting, persistence validation, controls, cache summary, and image hints. Browser-level fake-timer/history/network checks remain appropriate for the later integration/Playwright task already defined in the project plan.
