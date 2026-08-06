# 2026-08-06 — Local Maestro reused stale Compose migrations

> See [`README.md`](README.md) for the index of all bug entries and patterns.

**Symptom.** A fresh-volume Android photo flow rendered the generated report
but never exposed its placement control. The API repeatedly returned 500 while
creating the photo upload lease because `app.file_upload_leases` did not exist.

**Root cause.** `docker compose down -v && docker compose up -d` replaced the
database volume but reused a local API/migrate image built on 2026-06-26. API
source was current through bind mounts, while image-only SQL migrations stopped
at 0019; current upload code requires migration 0022. Compose also declared
0025 as its required head while the checkout's actual head was 0028. Once the
image was rebuilt, its empty `ADMIN_MIGRATIONS_REQUIRED_HEAD` environment value
also failed Zod parsing in the local account-seed process.

**Fix.** Local Maestro setup commands now include `docker compose up -d
--build`, and `mo up` performs that reconciliation even when the existing
stack is healthy. Both Compose services pin application head 0028 and override
the image with the current admin head. Rebuilding once before a suite keeps
subsequent fresh-volume flows on the current image through Docker cache.

**Test.** `release-confidence-gates.test.sh` derives the newest checked-in API
and admin migrations and requires both local Compose service pins to match
them. `test_up.py` requires `mo up` to pass `--build` and to reconcile a
running stack with a dedicated 15-minute build budget. The repaired
photo-placement flow is the behavioral check because it exercises account
seeding and the upload lease before placing the photo.

**Pattern.** A fresh database is not a fresh schema when migrations live only
inside a cached image. Any local E2E reset that consumes image-baked inputs must
rebuild after fast-forwarding the checkout.
