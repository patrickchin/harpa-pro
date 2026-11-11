# Design — workflow ownership and transition repairs

Harpa Pro must preserve edits, captured input, and operation identity when
requests overlap, users navigate, or the app restarts. The state-machine
audit found missing ownership boundaries in these paths despite passing
baseline tests. This design fixes those boundaries with local state owners,
revision IDs, and database authority. It adds no state-machine dependency.

The finding IDs below refer to the November 2026 state-machine audit. A
finding is complete only when its regression passes with the real owning
hook, component, or service and its surrounding wiring remains covered.

## Scope and existing authority

Keep separate owners for report edits, generation admission, upload jobs,
photo batches, recorder startup, and voice ingestion. Owners exchange
explicit results and guards; they do not become one application-wide machine.

Retain the dashboard save reducer, mobile upload synchronization reducer,
camera capture guards, auth cache-scope barrier, storage leases, and HTTP
idempotency leases. Report lifecycle and authorization remain database-owned.
Small forms, native dialogs, and gesture state remain local.

Relevant baselines are [mobile architecture](arch-mobile.md),
[report editing](design-p3x-generate-update-finalize.md),
[storage](arch-storage.md), [voice](arch-voice-pipeline.md), and
[usage limits](arch-usage-limits.md). Pitfalls 6, 8, 13, and 18 still apply.

## First slice — reports

### Mobile edit acknowledgements — F1

The route owns a monotonically increasing edit revision, local body, and
acknowledged server version. User edits advance the revision synchronously;
programmatic hydration does not pretend to be a user edit.

Autosave captures report identity, revision, body, and `expectedUpdatedAt`.
It permits one active save. Edits made during that save remain queued as the
latest dirty revision. A success advances the known server version but only
acknowledges the revision sent by that request. It cannot mark newer edits
clean. The next save uses the returned version rather than an older refetch.

Save failure preserves the body and dirty revision. Conflict stops automatic
writes until explicit recovery. Report identity change or disposal fences
late callbacks. Generation and finalization cannot start while unsaved edits
or their save are pending; pausing a debounce is not cancellation of a write.

### Shared command admission — F5 and F8

One pure helper derives eligibility and named blocked reasons. The route
uses it in handlers, automatic generation, and rendered controls. Blockers
include missing report/version, insufficient permission, pending or failed
input synchronization, unsaved edits, active body writes, failed placement,
and a terminal generation failure such as quota exhaustion.

Finalization additionally requires a persisted body and the applicable
freshness policy. Automatic generation requires a stale draft and no active
blocker. Manual retry is explicit; an informational dialog closing must not
silently clear a quota block and re-arm automatic generation.

Keep the queue/refetch synchronization derivation as the source of input
readiness. The E2E generation marker observes this state but is not itself
an admission API. A manually authored report can legitimately lack an AI
generation timestamp, so admission must not require that marker to be current.

Admission is checked again when a confirmation submits its command. The
server still enforces role, report lifecycle, and version preconditions.

### Dashboard report identity — F2

An inner workspace is keyed by project and report identity. Its local body,
save promise, conflict, and confirmations belong to that identity. Navigating
to report B cannot reuse report A's pending local save state.

Persist the departing unsaved draft on unmount. Late responses may update the
cache for the report captured by their request; they cannot dirty, reset, or
save the newly mounted workspace. Retain the existing reducer behavior that
keeps a newer edit dirty when an older save succeeds.

### First-slice verification

- Save A, edit B, then acknowledge A: B remains dirty and is saved next.
- A conflict preserves the draft and cannot trigger a request loop.
- Switch reports during save: the old response sends no write for the new one.
- Pending uploads or note reconciliation disable finalization and its handler.
- Dirty manual edits block automatic generation and are not overwritten.
- A quota rejection remains blocked across mutation settlement and dialog close.
- Existing role, freshness, placement, generation, and dashboard tests stay green.

## Second slice — upload and batch recovery

### Local creation ownership — F6

A batch has a stable logical identity and a confirmed note checkpoint. Its
current creation attempt has exclusive ownership. Rejection clears that
attempt only if it is still current, allowing retry without clearing a
confirmed note or another attempt's ownership.

### Durable checkpoints — F7

Persist and restore `batchKey`, registered file/thumbnail checkpoints, and
shared note identity before resuming jobs. Rebuild all batches before the
queue driver starts. A registered file can be resumed without its local
source; a missing source is terminal only when bytes still need uploading.

The shared note checkpoint must survive removal of the first completed job.
Version and validate persisted records so an older or malformed snapshot
cannot manufacture a runnable job. Preserve existing account namespaces.

### Server identity caveat

A stable HTTP idempotency header alone does not guarantee one logical batch:
existing middleware also hashes the body. A changed creator file therefore
produces a different scoped key. The current append path also lacks file
membership uniqueness, so an uncertain append response can be repeated.

Before claiming crash-safe one-note-per-batch behavior, design and prove a
server-enforced logical batch identity and idempotent file membership. Any
schema change is expand-only, accepts legacy callers, retains author/RLS
checks, and updates contracts, generated clients, and docs together. Inspect
existing data before introducing an attachment uniqueness constraint.

Verification includes failed creation followed by retry, restart before and
after the first note commits, missing local bytes after registration, lost
create/append responses, cancellation, and a new user's isolated recovery.

## Third slice — recorder and voice ownership

For F4, acquire a synchronous starting owner before permission lookup. Every
continuation checks attempt generation and disposal. Cancel and unmount
invalidate ownership before release. Superseded native handles are reclaimed.

For F3, keep immutable operation context containing operation ID, report ID,
capture, and uploaded file ID. The current single-slot UI admits one active
ingestion. A failed capture remains retryable until retry or explicit discard;
a newer capture cannot silently replace its retry identity.

Test double start, cancel/unmount during permission or native startup,
delayed stop, overlapping capture attempts, retry after upload, and reset
before a stale result. Preserve default-wired fixture and route coverage.

## Fourth slice — atomic count admission

F9 needs a separate database design and real concurrency proof. Reserve count
capacity in a short transaction, release its connection during provider work,
then atomically settle successful usage and reservation ownership. Two
requests cannot both consume the final slot. Token limits retain their
separately documented post-accounting semantics.

Specify release on known failure, uncertain provider/settlement outcomes,
request identity, expiry, month rollover, and in-flight deadline behavior.
An initial `SELECT FOR UPDATE` whose transaction ends before the provider
call does not close the admission race. Current best-effort accounting
swallows recording failures; uncertain settlement must not discard admission
capacity and admit duplicate work.

Use an expand-only migration with scoped grants and tests using two real
Postgres connections. No rollout, production mutation, or hard-cap guarantee
is implied by a controlled unit-test snapshot alone.

## Bounded follow-up repairs

- F10: invalidate PDF operation generation on close, replacement, and unmount.
- F11: derive native audio mode from all owners and serialize mode writes.
- F12: remove the unused imperative dialog layer; retain `AppDialogSheet`.
- F13: preserve the return route, then remove an uncommitted cancelled session.

Each repair keeps its existing UI contract and adds its own failing regression
before production edits. Update the recurring-bug log with shipped fixes.
Keep these commits bounded; browser, native-device, and database verification
remain explicit gates for the respective affected boundaries.
