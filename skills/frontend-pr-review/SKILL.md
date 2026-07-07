---
name: frontend-pr-review
description: Use when reviewing a frontend branch or PR before merge — checking for code duplication, shadcn/ui primitive compliance, oversized components, missing loading/empty/error states, and performance issues in the owner app.
---

# Frontend PR Review

Five passes, in order. Report findings as **Blocker** (must fix before merge), **Warning** (should fix), or **Nit** (nice-to-have). Cite `file:line` for every finding.

Start by scoping the diff:

```bash
git diff main...HEAD --name-only
git diff main...HEAD --stat
```

Focus the review on changed files; pull in unchanged files only when they are direct callers or shared dependencies of the changed code.

---

## Pass 1 — Duplicate Code & Shared Components

Find patterns that already exist and should be reused, not re-rolled.

**Grep for near-duplicate JSX or logic:**
- Same structure >~10 lines appearing 2+ times → extract to a shared component or hook.
- Utility functions (formatters, validators, date helpers) defined more than once → the second copy moves to `src/lib/`. CI gate `canonical-constants-no-duplicates.test.ts` enforces this for known constants; expand it if a new shared constant lands.

**Check against the existing component kits — never hand-roll an equivalent:**

Shared components (`@/components/shared`):
`PageContainer`, `SectionCard`, `CardGrid`, `StatCard`, `Button`, `FieldRow`, `FormRow`, `TextField`, `TextArea`, `SelectField`, `Checkbox`, `RadioCard`, `SaveBar`, `DataTable`, `ListRow`, `SearchInput`, `SegmentedControl`, `FilterBar`, `Skeleton` / `SkeletonText` / `SkeletonCard` / `LoadingAnnouncement`.

shadcn primitives (`@/components/ui`):
`Button` (variants: `default | brand | outline | secondary | ghost | destructive | link`), `Card` (`variant="surface"` for translucent panels), `Sheet`, `Dialog`, `Select` (inside modals/sheets — never native `<select>`), `Tabs`, `Popover`, `Dropdown`, `Tooltip`, `AlertDialog`, `Badge`, `Avatar`, `Eyebrow`, `InlineFeedback`, `StatusPill`, `CountBadge`, `SelectionChip`, `IconBadge`, `CheckboxField`, `SwitchField`, `ChoiceField`.

**Flag as Blocker:**
- Any hand-rolled equivalent of the above (a custom card, badge, input, or button).
- Retired brand-CSS classes: `.btn-primary`, `.btn-*`, `.content-sheet`, `.surface`, `.eyebrow` as a raw class, `.dashboard-floating-toggle` — these were retired 2026-05-23.
- Raw `<button>` outside of the three documented exceptions (`<DropZones>`, `<CalendarEvent>`, `<ClassEvent>`, and the HTML impersonation route).
- Hardcoded hex colors or magic-number sizes (`text-[15px]`, `#ffd700`) — use design tokens via `bg-[var(--color-NAME)]` or Tailwind scale values.

---

## Pass 2 — Component Responsibility

Identify components that are doing too much.

**Signs of a god component:**
- >~200 lines mixing data-fetching, business logic, and layout in one file.
- A Server Component that also handles client interaction without a clear RSC→client boundary.
- A form that manages its own fetch state alongside RHF state.

**Expected layering:**
| Concern | Where it lives |
|---|---|
| Server state (API data) | TanStack Query hooks (`useQuery` / `useMutation`) |
| Deep-linkable UI state (filters, open record) | URL search params |
| Transient UI flags (modal open, loading) | Zustand (`src/lib/*-store.ts`) |
| Form state | react-hook-form + zod; no `useState` form fields |
| Business logic | Custom hooks or `src/lib/` pure helpers |

**Flag as Warning:**
- Any `useState` managing form field values instead of RHF `register` / `Controller`.
- Zustand holding filter values or entity IDs that belong in the URL.
- Inline anonymous arrow functions passed as stable callbacks to heavy child components (prefer `useCallback`).

---

## Pass 3 — Loading, Empty & Error States

For every new route, page, or async data surface, verify all three states are handled.

### Loading

- **`loading.tsx` required.** Every `app/` route that fetches data needs a `loading.tsx`. It must import and render `<LoadingAnnouncement>Cargando X…</LoadingAnnouncement>` — CI gate `loading-announcement-coverage.test.ts` enforces this; a missing announcement fails the build.
- **Skeleton geometry must match.** `Skeleton` / `SkeletonText` / `SkeletonCard` placeholders must mirror the real component's layout (column count, heights, header band). Drifted skeletons reintroduce CLS. The skeleton file should have a header comment naming the component it mirrors.
- **Buttons with async actions** need a `loading` prop/state disabled during the mutation to prevent double-submit. The shared `<Button loading>` covers this — don't roll a manual `disabled` flag alone.

### Empty state

- Lists, tables, and data-driven sections must render something meaningful when results are empty — not a blank void.
- `<DataTable>` has a built-in empty row; use it. For non-table surfaces, add an explicit empty state with copy.
- Copy is Bolivian Spanish, voseo, sentence case. No exclamation marks.

### Error state

- API errors surface through `<InlineFeedback>` (banner-level) or a short error line under the field (field-level). Never swallow silently.
- Form validation errors come from the zod schema; RHF `mode: "onSubmit"` keeps them silent until the first submit attempt — do not track `submitAttempted` manually.
- Server action errors from optimistic mutations must revert the cache on failure and show a sonner toast (the toast library already wired — don't add a second one).
- Analytics-surface errors route through `analyticsErrorHint(error)` from `src/lib/analytics-error.ts` — never hardcode error copy in a page.

---

## Pass 4 — Performance

- **Re-render hotspots:** `watch()` on the whole form instead of `useWatch({ control, name })` forces a re-render on every keystroke across the entire tree. Use field-scoped `useWatch`.
- **No raw fetch + useState:** all server data goes through TanStack Query. Raw fetch + useState is the bug class that TQ was added to eliminate.
- **`"use client"` discipline:** mark a component client-only if — and only if — it uses hooks, state, or browser APIs directly. Keep RSC boundaries as deep as possible; pushing `"use client"` to the leaf is almost always correct.
- **Next.js image optimization:** `next/image` for every `<img>`; raw `<img>` tags are a Blocker.
- **Timezone drift (silent bug class):** Server Components must not call `new Date().toISOString().slice(0, 10)` to derive today's date — at 9 PM Bolivia time the Vercel host (UTC) is already on tomorrow. Route through `currentDateInTimezone(now, me.timezone)` from `src/lib/time.ts`.
- **Optimistic mutations:** every owner action that modifies server state should feel instant. TanStack Query optimistic updates + cache invalidation is the default pattern; flag any mutation that does a full refetch instead.
- **Tabular numbers:** all numeric values (time, money, counts) must carry `tabular-nums` to prevent layout jitter on updates.

---

## Pass 5 — UX & Premium Bar

Run the four designer questions from AGENTS.md before signing off:

1. **Does this feel premium, or does it just function?** What's the smallest detail — a transition, a piece of microcopy, a moment of restraint — that lifts this from "works" to "delightful"?
2. **Would the owner trust this on first contact?** Hesitation, confusion, and visual noise are design bugs.
3. **Is it consistent with surfaces that already work?** (Calendar, reservations sheet, catalog content sheet.)
4. **Have you actually used it?** Start the dev stack (`scripts/dev.sh`) and click through the feature like an owner would. Tests pass ≠ UX works.

**Surface choice — verify against the matrix:**

| Surface | Correct use |
|---|---|
| Popover / anchored | Tiny, contextual — date pick, filter, `⋯` menu, one-field edit |
| Side sheet (`Sheet side="right"`) | Inspector tied to a list selection where the user bounces between items |
| Centered modal (`Dialog`) | Short, focused, atomic create/edit where the page behind isn't needed; must fork to full-screen takeover on mobile |
| Full-screen takeover | Complex/multi-step work; default for any non-trivial form on mobile |
| Dedicated page / route | Primary, growing, or deep-linkable task |

**Copy discipline:**
- Bolivian Spanish, voseo (`vos tenés`, `guardá`), sentence case.
- `Bs 450` (capital B, space before amount). 24h time: `15:30`.
- No em-dashes, no emoji in UI, no "Hola! 👋", no "Aviso:", no "¡Éxito!".
- `lucide-react` line-stroke icons only — no emoji icons in the UI.

**Mobile-first checklist:**
- Layout holds on a phone (375px viewport). Side sheets and centered modals collapse to full-screen takeovers or bottom sheets on mobile — fork with `useMediaQuery`.
- Every hover state has a tap equivalent.
- No `display: none` hiding the hard parts on small screens.
- No drag, no long-press, no "hold to create" gestures.
- No hidden truncation (`slice(0, N)`) — paginate instead.

---

## Output Format

```
### Blockers
- [file:line] — description + what to use instead

### Warnings
- [file:line] — description

### Nits
- [file:line] — description

### Passed
- Pass 1: no duplicate components found; shared kit used correctly
- Pass 3: loading.tsx + LoadingAnnouncement present; button loading states wired
- (etc.)
```

Findings without a file:line citation are not actionable — always include the location.
