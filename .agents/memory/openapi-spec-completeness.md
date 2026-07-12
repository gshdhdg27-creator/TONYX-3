---
name: openapi-spec-completeness
description: A reduced/stub lib/api-spec/openapi.yaml breaks the app at runtime, not at codegen time — always verify the spec is complete before trusting a clean codegen run.
---

`lib/api-spec/openapi.yaml` is the single source of truth for `@workspace/api-zod` (server-side validation) and `@workspace/api-client-react` (frontend hooks) via Orval codegen.

If the spec has been reduced to a stub (e.g. only a health-check endpoint) while the actual server routes and frontend still reference a much larger contract (many resources/schemas), **codegen itself succeeds** — it just generates a smaller, incomplete client/schema set. The failure shows up later as missing exports (e.g. a route file importing a Zod schema like `CompleteTaskResponse` that no longer exists) during typecheck or at runtime `.parse()` calls.

**Why this matters:** a "codegen succeeded" signal is not sufficient evidence the spec is correct — it only proves the YAML is syntactically valid, not that it's complete.

**How to apply:** when porting/recovering a project where `openapi.yaml` looks suspiciously small relative to the number of routes/features in the server and frontend, check for a backup/original copy of the spec (e.g. in a migration backup directory) and diff line counts / endpoint coverage before assuming the current spec is authoritative. Restore the full spec if the backup has significantly more content.
