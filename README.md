# sandbox-api

A stand-in for a real application repo (`tenant-api`, `powergrader-api`, …), used to
exercise the Platform v2 delivery path end to end.

## What an app repo owns

- `src/` — the code
- `helm/` — **its own chart**. The app team owns its templates, including its
  `ExternalSecret` and which secret keys it consumes.
- `.github/workflows/ci.yml` — dev-owned, changes freely.
- `.github/workflows/deploy.yml` — a thin caller. ~15 lines. It dispatches into
  `platform-workflows` and holds no state-repo credential.

## What CI publishes

Two artifacts and **one version string**:

- image → `<registry>/images/sandbox-api:<tag>`
- chart → `oci://<registry>/charts/sandbox-api:<version>`, with that image tag baked
  into the chart's `values.yaml`

One version string is the entire artifact identity. A deployment pins one chart
version and gets a coherent chart plus image — there is no second knob. That is what
makes promotion a matter of moving the same string between environments, and rollback
a matter of moving it back.

The anti-pattern this replaces: pinning `image.tag` while the chart floats on a
branch. Reverting the tag then yields an old image against a new chart — a
combination that was never tested anywhere — and a chart edit reaches production with
no commit in the state repo at all.

## What this repo does not own

CD mechanics. `deploy.yml` chooses *what* and *where*; `platform-workflows` decides
*how*, identically for every app.
