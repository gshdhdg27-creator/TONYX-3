---
name: artifact-registration-recovery
description: How to recover platform artifact registration when a directory has real content but is missing from listArtifacts()/workflows (e.g. after a failed prior migration).
---

If `artifacts/<slug>/.replit-artifact/artifact.toml` exists on disk with real content but `listArtifacts()` doesn't show it and no workflow exists, the platform's registry lost track of it. There is no "repair/re-register existing directory" API — `createArtifact()` refuses to run if the target directory already exists.

**Recovery pattern:**
1. Temporarily `mv artifacts/<slug>` to `artifacts/<slug>-real` (or similar) so the target path is free.
2. Call `createArtifact({ artifactType, slug, previewPath, title })` — for `react-vite` this scaffolds a fresh directory.
3. `createArtifact` triggers a full workspace rescan: it also auto-registers *other* pre-existing `.replit-artifact/artifact.toml` files it finds on disk (e.g. `api-server`, `mockup-sandbox`), including the renamed `-real` directory, as long as their `id` field matches the expected artifact id. Don't be alarmed by seeing the same `artifactId` show up under two directory names in `listArtifacts()` — that's just the same artifact visible at two paths.
4. `rm -rf` the fresh scaffold directory, `mv` the `-real` directory back to the original path — its original `artifact.toml` (matching `id`, `previewPath`, ports, build/serve config) is preserved and now correctly picked up.
5. Re-run `pnpm install` and restart the workflow.

**Why:** `createArtifact` only fails on a directory-already-exists check for the *target* slug; it doesn't stop it from also (re-)registering unrelated pre-existing artifact directories it discovers during its scan — that scan is what actually fixes the "lost" registrations for other artifacts (api-server, mockup-sandbox) for free.
