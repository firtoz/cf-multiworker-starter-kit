---
name: form-submissions
description: Form submission patterns using useDynamicSubmitter, await submitJson, and formAction. Use when implementing forms, handling form submissions, or processing form data in React Router routes.
---

# Form Submissions with `useDynamicSubmitter` (v9+)

Always use **`await submitter.submitJson(...)`** (or `await submitter.submit(...)`) instead of React Router's `<Form>` for programmatic submissions. In **v9**, the object from `useDynamicSubmitter` is **stable** and does **not** expose reactive `state` / `data` — use **local `useState`** (or `useDynamicSubmitterFetcher`, see below) for UI that depends on loading or last result.

For internal React UI submissions, prefer `formAction` + `useDynamicSubmitter`. Do not reach for plain HTML forms unless you intentionally want browser-native form behavior.

**Default stack:** route exports `route`, `formSchema`, and `formAction({ schema, handler })`; components call `useDynamicSubmitter<typeof import("./route")>("/path")` and `await submitter.submitJson(...)`. After a mutation that should refresh server data, call `useRevalidator().revalidate()`.

## Anti-patterns (do not add new code like this)

- ❌ `useFetcher()` + `fetcher.data as { success: ... }` — untyped casts; use `useDynamicSubmitter` so action results infer from the route module.
- ❌ Plain `<form method="post">` while reading `useFetcher()` / `fetcher.Form` without wiring them together — submissions never hit the fetcher you observe.
- ❌ Manual `request.formData()` + stringly `intent` parsing in actions when the route can use `formAction` + a Zod schema (including `z.discriminatedUnion("intent", [...])` for multi-intent routes).
- ❌ Relying on route `actionData` when children submit via fetcher/submitter — parent `actionData` is not updated; revalidate the loader or lift state from the settled submit promise.

When several components on the **same route** each call `useDynamicSubmitter`, pass a distinct **`keySuffix`** so fetcher keys do not collide.

## Loaders use `MaybeError` too

Match actions: **loaders** should return `Promise<MaybeError<LoaderData>>` with `success` / `fail`, not a bare object. That keeps `loaderData` typed the same way as submitter/fetcher results and avoids ambiguous error shapes. See [routing/SKILL.md](../routing/SKILL.md).

## Route Setup

### 1. Define Route and Form Schema

```typescript
import { formAction, type RoutePath, useDynamicSubmitter } from "@firtoz/router-toolkit";
import { success } from "@firtoz/maybe-error";
import { z } from "zod";

export const route: RoutePath<"/admin/settings"> = "/admin/settings";

export const formSchema = z.object({
  siteName: z.string().optional(),
  siteUrl: z.string().optional(),
  // ... other fields
});
```

### 2. Wrap Action with formAction

```typescript
export const action = formAction({
  schema: formSchema,
  handler: async ({ request }, formData) => {
    // formData is typed and validated by Zod
    await updateSettings(formData);

    // Return success() for successful operations
    return success();

    // Throw for redirects
    // throw redirect("/somewhere");
  },
});
```

### 3. Component Implementation (default: promise + local state)

Use controlled inputs with React state. Track **busy** and **last result** yourself; `await` the submitter. Use a **sequence ref** (flight counter) if overlapping submits are possible, so a slower response does not overwrite a newer one. In `catch`, ignore **`SubmitterSupersededError`** and **`SubmitterUnmountedError`**.

```typescript
import {
  SubmitterSupersededError,
  SubmitterUnmountedError,
  type SubmitterSettledData,
  useDynamicSubmitter,
} from "@firtoz/router-toolkit";
import { useCallback, useRef, useState } from "react";

type RouteMod = typeof import("./my-route");

export default function MyForm() {
  const submitter = useDynamicSubmitter<RouteMod>("/my-route");
  const submitSeq = useRef(0);
  const [busy, setBusy] = useState(false);
  const [actionResult, setActionResult] = useState<SubmitterSettledData<RouteMod> | null>(null);
  const [field1, setField1] = useState("");
  const [field2, setField2] = useState("");

  const handleSubmit = useCallback(async () => {
    const id = ++submitSeq.current;
    setBusy(true);
    try {
      const data = await submitter.submitJson({ field1, field2 });
      if (id !== submitSeq.current) return;
      setActionResult(data);
    } catch (err) {
      if (err instanceof SubmitterSupersededError || err instanceof SubmitterUnmountedError) {
        return;
      }
      if (id !== submitSeq.current) return;
      throw err;
    } finally {
      if (id === submitSeq.current) setBusy(false);
    }
  }, [field1, field2, submitter]);

  return (
    <div>
      <Input value={field1} onChange={(e) => setField1(e.target.value)} />
      <Input value={field2} onChange={(e) => setField2(e.target.value)} />
      <Button onClick={() => void handleSubmit()} disabled={busy}>
        {busy ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}
```

**Validation and handler errors** from `formAction` arrive on the **resolved** value: `!data.success` with `data.error.type === "validation"` (field errors live under `data.error.error.properties`) or `data.error.type === "handler"`. Only treat the promise as failed when the **network** or router throws, not when the action returns `fail(...)`.

## Optional: `useDynamicSubmitterFetcher`

Use **`useDynamicSubmitterFetcher(submitter)`** when you need **reactive** `fetcher.state` / `fetcher.data` (e.g. a declarative form that still uses `submitter.Form` and disables the button from `fetcher.state === "submitting"`). Prefer the promise + local state pattern for new work unless you have a clear need for fetcher-driven render updates.

## Key Points

### Don't Use

- ❌ `<Form>` from react-router for type-safe `formAction` flows (use submitter + JSON or the submitter’s `Form` with fetcher if needed)
- ❌ `submitter.state` / `submitter.data` on the v9 `useDynamicSubmitter` return value (not reactive)
- ❌ `useFetcher()` with manual `as` casts on `fetcher.data` for app forms (see **Anti-patterns** above)
- ❌ Plain `<form method="post">` paired with `useFetcher()` unless the form is actually `fetcher.Form` or you submit via `submitter.submitJson`

### Do Use

- ✅ Controlled inputs with React state (`value` + `onChange`)
- ✅ `useDynamicSubmitter` for the typed `submitJson` / `submit` / `Form` / `fetcherKey`
- ✅ `await submitter.submitJson({ ... })` and local state for results and loading
- ✅ `SubmitterSettledData` (or the resolved shape) for typing the last action payload
- ✅ Export `route`, `formSchema`, and wrap `action` with `formAction()`
- ✅ Return `success()` from action handlers for successful operations
- ✅ `throw` (don't return) redirects and responses

## Index route actions

React Router index actions require an explicit `?index` target for external clients, terminal tests, non-router-aware callers, and plain HTML forms.

- Internal app flow: `useDynamicSubmitter<RouteMod>("/some-route").submitJson(...)`
- Plain form to an index route: `action="/?index"`
- Terminal smoke test: `POST /?index`, not `POST /`

Avoid teaching new app features to post plain forms to index routes. If an endpoint must be called externally, prefer a non-index resource route such as `/sessions/new`. If a home/index route intentionally has an action for plain forms, add a nearby comment and explicit `action="/?index"`.

## Programmatic navigation after an action (internal flows)

`formAction` + `useDynamicSubmitter` work best for **in-app** flows when the action returns **structured** data the UI can use:

- Prefer **`return success({ ... })`** (or a typed code/slug) and **navigate in the component** with the router (e.g. `href(...)` from `@firtoz/router-toolkit` or your app’s `useNavigate` pattern) after `await submitter.submitJson(...)` resolves and `data.success` is true.
- Use **`throw redirect(…)`** when you want a full **server-driven** redirect response (e.g. external URL, or when you truly need a `Location` response). Redirects in actions are handled on the **fetcher/submitter** code path, which differs from a full **document** navigation; for SPA-style “create then go to detail,” **`success` + client navigate** is often clearer.
- For **internal** create/join/settings flows, default to **controlled state + `submitJson` + `success` + explicit client navigation**; reserve raw `<form method="post">` for cases that need native form semantics.

See also [routing/SKILL.md](../routing/SKILL.md) for `RoutePath` and patterns.

## Multi-intent routes (one action, many forms)

When one route handles several mutations (e.g. account settings), define a **discriminated union** schema and export it as `formSchema`:

```typescript
export const formSchema = z.discriminatedUnion("intent", [
  saveDisplayNameBodySchema,
  setNotificationEmailPatchSchema,
  // ...
]);

export const action = formAction({
  schema: formSchema,
  handler: async ({ request }, body) => {
    switch (body.intent) {
      case "saveDisplayName":
        // body.displayName is typed
        return success({ ok: true as const });
      // ...
    }
  },
});
```

Each section component submits its branch with `await submitter.submitJson({ intent: "...", ... })`. Use **`keySuffix`** per section when multiple submitters target the same URL.

## Benefits

This approach provides:

- Full TypeScript type safety for form data
- Automatic Zod validation
- Clear loading and result handling aligned with v9’s promise-first submitter
- Consistent patterns across the codebase
