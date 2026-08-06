# Trunk development and production promotion

> **Status:** Proposed and unapproved. This document is design work only.
> Merging it does not approve implementation, change the release policy, or
> authorize a provider, branch, workflow, credential, or production change.
>
> **Re-evaluated:** 2026-08-07 (Asia/Shanghai) against `origin/dev` at
> `7aec0fce3c79470c15682a5b29929e006c9b3e60`, the current repository
> workflows and operations docs, live read-only GitHub settings, and current
> official provider documentation.
>
> **Related docs:** [Observability and operations](arch-ops.md),
> [CI/CD and migrations](arch-cicd-and-migrations.md),
> [Databases](arch-database.md),
> [Storage](arch-storage.md), and
> [Cloudflare Pages Git
> deployments](design-cloudflare-pages-git-deployments.md).

## Conclusion

Keep the target direction, but do not perform a direct branch cutover.

The recommended end state is:

- `main` is the only branch used by developers for normal pull requests;
- relevant `main` merges deploy the shared development environment;
- production changes only through one manual workflow that selects and
  verifies one full `main` commit SHA;
- routine hosted pull request deployments are removed;
- production and development keep separate databases, storage buckets,
  deployment identities, mobile channels, and credentials; and
- Cloudflare remains the tokenless Pages publisher.

The safe sequence is different from the recovered July proposal:

1. Decouple production from ordinary pushes while the current `dev` to
   `main` model still exists.
2. Prove one exact-SHA manual release and the rollback evidence.
3. Replace and then remove routine hosted pull request deployments.
4. Move shared development and normal pull requests to `main`.
5. Retire Git `dev` only after an observation window and separate approval.

Manual exact-SHA production promotion is recommended for implementation
planning. The `main`-as-development switch is conditional on the production
interlock, Cloudflare ref design, replacement test coverage, and branch
protection all passing first.

## Approval boundary

This document does not authorize any of the following:

- editing or enabling deployment workflows;
- changing Cloudflare branch controls or custom domains;
- creating, moving, locking, or deleting Git branches or refs;
- changing GitHub branch protection, rulesets, or environments;
- creating, deleting, or migrating Neon projects or branches;
- creating, emptying, renaming, or deleting R2 buckets;
- creating or destroying Fly applications or Machines;
- publishing an EAS update or native store build;
- rotating or deleting credentials; or
- deploying or rolling back production.

Each implementation phase needs its own reviewed change. Destructive cleanup
and the first production release need explicit approval at execution time.

## Current state

The repository still implements the branch model described in
[arch-ops.md](arch-ops.md#deploy-flow):

| Git event | Current result |
| --- | --- |
| Pull request to `dev` | CI plus hosted API, Pages, Neon, Fly, and OTA previews |
| Push to `dev` | Shared development API, Pages verification, and preview OTA |
| Pull request from `dev` to `main` | Exact development SHA and live journey gate |
| Push to `main` | Production API, Pages verification, and production OTA |

The current implementation has changed materially since the July design:

- `origin/main` is `1ca389ac8f28c6cf8fbf0c7f5eca072f8670c129`.
- `origin/dev` is `7aec0fce3c79470c15682a5b29929e006c9b3e60`.
- Git reports 8 commits unique to `main` and 46 unique to `dev`.
  They are not identical and cannot be treated as a no-op cutover.
- Application and administrator data now use two independent Neon projects.
  Each project has `main`, `dev`, preview branches, and its own migration
  stream and recovery history.
- Production deploys already create blocking recovery branches in both Neon
  projects before Fly applies migrations.
- Production and development already use separate R2 buckets:
  `harpa-pro` and `harpa-pro-dev`.
- Public, administrator, and dashboard Pages projects now use native
  Cloudflare Git publication. GitHub Actions verifies exact-SHA markers but
  holds no Cloudflare credential.
- The office dashboard exists in development. Its automatic production build
  and `app.harpapro.com` activation remain separately unapproved.
- Mobile OTA publication now requires environment-specific native-runtime
  readiness tags and exact API compatibility checks.
- The automatic per-merge version-bump workflow no longer exists.
- Production and development each have an always-on storage lifecycle worker.
  Pull request Fly previews intentionally do not.

### Live GitHub policy snapshot

Read-only GitHub checks on 2026-08-07 found:

- `main` is the default branch;
- `dev` and `main` both require pull requests and up-to-date branches;
- `dev` requires `unit`, `lint-typecheck`, `api-integration`, `cli`,
  `Maestro testID gate`, `Metro bundle leakage gate`,
  `Maestro Android launch smoke`, and `dependency-review`;
- `main` requires the same checks plus `journeys`;
- zero approving reviews are required;
- administrator enforcement is enabled and conversation resolution is
  disabled;
- force pushes and deletion are disabled;
- no repository ruleset exists.

The repository has eight GitHub environments. None has a reviewer or branch
policy. This is observed state, not the target policy.

### Provider-state boundary

Repository configuration does not prove the current provider plan, billing
state, resource inventory, restore window, deployment setting, or bucket
policy. Unless an implementation preflight reads it, that state is
`UNKNOWN`.

The earlier proposal's provider inventory and quota readings are historical
evidence only. They must not be used as current authorization or proof.

## Why simplify

There is one developer and no users. The current `dev` to `main` promotion
pull request repeats already-completed review and creates release-only merge
history without adding an independent approver.

Routine hosted pull request environments also have a poor cost-to-value ratio
for this context. They create or exercise:

- two Neon preview branches;
- one Fly preview application;
- three Cloudflare Pages preview builds;
- a generated Git ref;
- a mobile EAS update; and
- multiple cleanup and policy paths.

Those previews provide real value: isolated browser authentication, CORS and
cookie checks, exact-SHA remote verification, and a reviewable deployed URL.
Removing them is therefore a test-contract change, not housekeeping.

The design should remove ceremony only after moving the useful checks to
credential-free CI and the shared development environment.

## Target topology

The target keeps two hosted runtime environments.

| Boundary | Development | Production |
| --- | --- | --- |
| Source commit | Latest protected `main` merge | One selected `main` SHA |
| Trigger | Automatic | Manual |
| Fly API | `harpa-pro-api-dev` | `harpa-pro-api` |
| App Neon | Application project, `dev` branch | Application project, `main` branch |
| Admin Neon | `harpa-pro-admin`, `dev` branch | `harpa-pro-admin`, `main` branch |
| R2 | `harpa-pro-dev` | `harpa-pro` |
| EAS channel | `preview` | `production` |
| Public Pages source | `main` preview deployment | `production-pages` provider ref |
| Admin Pages source | `main` preview deployment | `production-pages` provider ref |
| Dashboard Pages source | Existing `dev` deployment, frozen at cutover | Disabled until separate approval |

The Neon branch names and R2 bucket suffixes describe environments. They do
not need to match Git branch names.

The public and administrator development aliases change from
`dev.<project>.pages.dev` to `main.<project>.pages.dev` at trunk cutover.
Exact administrator CORS, cookie, public-site, and test configuration must
change in the same implementation phase. Production hostnames do not change.

The dashboard is excluded from trunk cutover. Its provider configuration
still reserves `main` as a disabled production branch, so `main` cannot also
be its development preview without a separate provider design. The existing
`dev` deployment may remain as a frozen reference, but it is not exact-SHA
release evidence after cutover. Dashboard development uses local production
builds and browser tests until a separately approved design gives it a safe
hosted source.

## Cloudflare Pages decision

Preserve native Cloudflare Git publication and do not reintroduce a
Cloudflare API token into GitHub Actions.

Cloudflare requires a configured production branch. A `main` commit cannot be
both the development preview and the manually selected production deployment
in one Pages project. The target therefore keeps one machine-owned provider
ref:

`refs/heads/production-pages`

This is a deliberate exception to the earlier literal "one long-lived Git
ref" goal. `main` remains the only collaboration branch. The provider ref:

- is never a pull request base or source;
- contains no promotion commit;
- points directly at a commit already reachable from `main`;
- moves forward only;
- is updated only by the production release workflow;
- may not be force-pushed or deleted by the workflow; and
- is not production approval by itself.

Cloudflare configures `production-pages` as the public and administrator
production branch and `main` as their only automatic preview branch. The
release workflow advances `production-pages` only after the production API
passes.

This keeps Cloudflare's GitHub App as the publisher and preserves provider
deployment history and rollback. Official Pages documentation confirms that
Git-integrated projects can choose a different production branch and control
automatic production and preview builds:
[Git integration][cloudflare-git] and
[branch controls][cloudflare-branches].

The exact writer is a dedicated GitHub App installed only on this repository.
It receives `Contents: read and write` plus mandatory metadata access, and no
Actions, administration, deployments, environments, or secrets permission.
The release job mints a short-lived installation token from credentials held
only by the production release environment. It does not use the default
`GITHUB_TOKEN` for this update.

An active branch ruleset targets only `production-pages`. It restricts
creation, updates, deletion, and force pushes, requires linear history, and
lists that GitHub App as its only always-allowed bypass actor. The job uses a
normal non-force push of the selected commit and proves the update is a
fast-forward from the prior ref.

GitHub documents GitHub Apps as eligible ruleset bypass actors; see
[creating repository rulesets][github-rulesets].

Before production configuration changes, test the same App and rule shape on
a disposable non-provider ref, including rejected human, deletion, force-push,
and non-fast-forward attempts. If the current repository plan or ownership
cannot support the GitHub App bypass, reject this topology and keep the
current `dev` to `main` model. Do not leave the provider ref unprotected or
substitute a personal access token.

### Rejected Pages alternative

Disabling Git publication and deploying all three projects through Wrangler
would make one Git branch easier, but it would restore long-lived Cloudflare
credentials and duplicate build and preview behavior that the current
tokenless migration deliberately removed.

That trade is not justified for one developer. A machine-owned provider ref
is narrower and easier to audit.

## Production release contract

Add one orchestrator, proposed as:

`.github/workflows/release-production.yml`

No existing production workflow may remain independently push-triggered or
manually dispatchable after the interlock is active.

### Compatibility invariant

The production API deploys before browser and OTA clients, so every release
must keep the new API backward-compatible with the currently deployed public,
administrator, dashboard, and mobile clients. This is the API equivalent of
the existing expand-contract migration rule.

The prepare gate must compare the selected API contract with the recorded
production contract and reject removed or narrowed operations, request fields,
response fields, auth behavior, or enum values that an old client can still
use. Behavioral changes that cannot be proved mechanically need an explicit
compatibility test against the current production client builds.

A breaking change must first add a versioned route, dual behavior, or another
compatibility bridge. Removing the old behavior is a later release after the
old clients are no longer served. There is no normal release mode that permits
an incompatible API-first partial state.

### Inputs

The first version accepts:

| Input | Type | Default | Contract |
| --- | --- | --- | --- |
| `mode` | choice | `plan` | `plan`, `release`, or `ota-only` |
| `release_sha` | string | empty | Full 40-character `main` SHA |
| `publish_mobile_ota` | boolean | `false` | Release-mode OTA selection |
| `release_note` | string | empty | Operator context |
| `confirm_production` | string | empty | Exact production confirmation |

An empty `release_sha` resolves once to the `main` SHA frozen when the run
starts. A supplied value must be exactly 40 hexadecimal characters.

`release` is the only mode that changes API or Pages production.
`ota-only` can publish an omitted or retried OTA only for the exact current
production release SHA. `plan` is read-only.

The initial version has no operator-selected `site-only` mode. A single Pages
provider ref releases the public and administrator artifacts together, and a
newer static commit can contain unreleased API assumptions. Keeping `main`
releasable and performing a full release is safer than trusting a manual path
classification.

A guarded static-only mode may be designed later if a real urgent legal or
documentation release requires it.

### Prepare gate

Before any mutation, the workflow must:

1. fetch `main` and resolve the selected SHA once;
2. prove that SHA is reachable from `origin/main`;
3. require it to equal the current `origin/main` tip;
4. re-check that equality immediately before the first production mutation;
5. verify the required checks succeeded on that exact SHA;
6. prove the selected API remains compatible with deployed clients;
7. verify no other production release is running;
8. read current API and Pages release identities;
9. read the current `production-pages` ref;
10. verify the selected SHA is a descendant of that ref;
11. display all planned provider and resource targets; and
12. require the exact confirmation input for `release` or `ota-only`.

Selecting only the current tip is intentional in the first version. It avoids
testing newer development code while deploying an older commit. Rollback uses
the explicit rollback playbook, not a normal release of an arbitrary ancestor.

Use one non-cancelling concurrency group:

`production-release`

Do not merge another change to `main` while a release is between its final
tip check and completion. The workflow still fails closed when it detects
drift; this operator rule covers the remaining single-developer interval.

### Exact development rehearsal

A production release first rehearses the selected SHA in development.

1. Call the reusable development API workflow with the selected SHA.
2. Apply both development migration streams.
3. Deploy the development API from that exact checkout.
4. verify `/healthz.gitCommit` equals the full selected SHA;
5. verify `/readyz` and `/admin/readyz`;
6. verify the storage-worker topology and lifecycle rollout state;
7. wait for public and administrator `main` Pages preview markers to report
   the selected SHA;
8. build the dashboard from the exact checkout and run its local browser
   journeys against the development API; and
9. run the remaining development journey suite, including live-provider paths
   that production promotion requires.

A healthy source-equivalent ancestor is not sufficient for this rehearsal.
The workflow intentionally produces exact-SHA development evidence before
production.

`plan` reports missing evidence but does not deploy development.

### Production order

`release` runs in this order:

1. Create uniquely named recovery branches from production `main` in both
   Neon projects.
2. Stop before Fly when either recovery branch fails.
3. Check out the selected SHA and deploy through `infra/fly/deploy.sh`.
4. Let Fly apply application and admin migrations serially.
5. Repair and verify the exact storage-worker topology.
6. Require the lifecycle arming confirmation marker.
7. Verify `/healthz.gitCommit` equals the selected SHA.
8. Verify `/readyz` and `/admin/readyz`.
9. Run the production journey suite.
10. Fast-forward `production-pages` to the selected SHA.
11. Wait for the public and administrator production markers and custom
    domains to serve that SHA.
12. Publish a production OTA only when explicitly selected and eligible.
13. Write the complete release summary.

The dashboard is not included in step 11 while its automatic production build
and custom domain remain unapproved. Future dashboard activation must be a
separate design and provider change. Once approved, it joins the same exact
Pages ref and verification phase.

### Snapshot identity and retries

A recovery branch must identify the release attempt, selected SHA, source
project, and creation time. Application and administrator snapshots are a
pair but remain independently restorable.

A failed-job retry must reuse the recovery pair created before the first
production mutation. It must never replace that evidence with a new branch
created after migrations ran.

The implementation must test these cases:

- failure before either snapshot;
- one snapshot succeeds and the other fails;
- Fly fails before migration;
- Fly fails after migration;
- API succeeds and Pages fails;
- Pages succeeds and OTA fails; and
- GitHub "re-run failed jobs" preserves the selected SHA and snapshot pair.

A new dispatch that tries to resume a partial release must provide and verify
the original run identity. Otherwise it stops and instructs the operator to
use the failed-job retry.

### Release record

The final summary records:

- selected SHA and commit title;
- prior `production-pages` SHA;
- operator and release note;
- start and finish times;
- required check links;
- exact development API and Pages identities;
- exact dashboard build and local-browser test evidence;
- both Neon recovery branch names;
- Fly release ID and image identity;
- API served SHA and both migration heads;
- storage-worker topology and lifecycle arming result;
- public and administrator Pages markers and URLs;
- dashboard status as `not selected` until activation;
- EAS runtime, update group ID, and prior group ID when OTA runs; and
- every component as `not selected`, `succeeded`, `failed`, or
  `not started`.

A release is not green merely because `/healthz` returns 200.

## Hosted pull request preview decision

Remove routine hosted pull request deployments after replacement coverage is
green.

The target removes:

- per-pull-request Fly applications;
- application and admin Neon `pr-<n>` branches;
- generated `pr-<n>` Git refs;
- native Pages `pr-<n>` builds;
- mobile pull request EAS updates; and
- preview-only GitHub environments and credentials that become unused.

Keep credential-free pull request tests and local browser builds. Existing
preview workflow files may be narrowed or renamed; they must not continue to
wait for or create hosted resources.

### Replacement coverage

| Removed evidence | Required replacement |
| --- | --- |
| Fly/Neon API preview | Testcontainers route and migration tests |
| Exact remote API SHA | Exact shared-development SHA before release |
| Pages preview artifact | Local production build and Playwright checks |
| Admin cross-site cookie flow | Integration tests plus live development journey |
| Dashboard authenticated journey | Exact local build and browser tests against the development API |
| Public-site remote smoke | Local Playwright plus exact development marker |
| PR mobile OTA | Local dev-client testing plus `preview` OTA after merge |

This changes failure timing: provider and cross-origin failures may be found
after merge to `main`. That is acceptable for one developer with no users
because `main` first changes development, not production. Production remains
blocked until the exact development rehearsal passes.

Reintroduce an opt-in hosted preview only after a measured need, such as
several concurrent developers or stakeholder review of unmerged work.

### Preview cleanup order

Cleanup is a later destructive phase:

1. Merge the workflow changes that stop resource creation.
2. Observe one complete pull request lifecycle without a hosted deployment.
3. List open pull requests and every generated `pr-<n>` Git ref.
4. List Fly `harpa-pro-api-pr-*` applications.
5. List `pr-<n>` branches in both Neon projects.
6. List EAS preview branches and recent update groups.
7. Map each exact resource to a closed or superseded pull request.
8. Request explicit approval for the resulting deletion list.
9. Delete only the approved resources.
10. Read each provider again and record the final inventory.

Do not infer R2 cleanup from preview branch deletion. Preview deployments may
have used the shared development bucket. No workflow may empty
`harpa-pro-dev` or delete an object solely because a Neon branch disappeared.
Object cleanup requires a database-reference and upload-lease proof.

## Neon and R2 decision

Keep the current data topology during this migration.

### Neon

Keep two projects, not one project per environment:

- the application project preserves product and Better Auth data; and
- `harpa-pro-admin` preserves independent administrator identity and session
  recovery.

Each project keeps `main` for production and `dev` for shared development.
Removing `pr-<n>` branches provides most branch-count relief without creating
two additional projects and another set of endpoints, migrations, secrets,
restore windows, and usage ledgers.

A future requirement for stronger development-versus-production blast-radius
or billing isolation can justify four projects. One developer, no users, and
no measured cross-environment incident do not justify that expansion now.

Keep the current recovery policy unless live plan evidence requires a change:
up to three `snapshot-*` branches per project and a 30-day maximum age.
The count cap normally controls retention first. Do not reduce recovery
evidence merely to match an old proposal.

Before implementation, verify separately for both projects:

- active plan and branch limit;
- branch and endpoint inventory;
- configured restore window;
- logical storage and compute use;
- latest successful recovery branch; and
- whether a restore drill has ever passed.

### R2

Keep:

- `harpa-pro` for production; and
- `harpa-pro-dev` for development.

Do not create `harpa-pro-development` merely to rename the environment.
Cloudflare's R2 free allowance is account-level usage; another bucket does
not create a new allowance. A bucket migration would add object-copy,
database-reference, credential, and rollback risk without reducing stored
bytes.

A clean development reset may still be useful, but it is a separate design.
If approved later, switch the development database and R2 bucket as one
atomic boundary. Never pair a fresh database with an old bucket or an old
database with an empty bucket.

Neon recovery does not restore R2. Any database restore must inspect file
rows, upload leases, and objects that lifecycle jobs may already have
deleted.

### Storage lifecycle worker

The active development and production workers are not preview debt. They
execute delayed account and upload cleanup while HTTP Machines sleep.

The release workflow must continue to use the current deploy, repair, verify,
and arm sequence. Removing or suspending a worker needs a separate lifecycle
design. Trunk migration does not authorize it.

## Mobile OTA decision

Keep the existing native/runtime safety model.

- `development` remains the local dev-client channel.
- `preview` remains the automatic shared-development channel.
- `production` remains the installed production channel.
- `mobile-preview-runtime-v<version>` and
  `mobile-production-runtime-v<version>` remain separate attestations.
- A root app-version change still requires a matching native build and manual
  registration.
- Native-sensitive changes after the tagged build still block OTA.
- Production builds continue to hard-disable API override.

Both readiness tags may point to commits on `main` after trunk cutover. The
registration script must stop assuming that preview means Git `dev`. The tag
environment, native artifact, runtime version, and commit ancestry remain the
security boundary.

Production OTA defaults to off. When selected, the release workflow must:

1. prove the production API serves the exact release SHA;
2. prove public and administrator Pages completed that release;
3. resolve the runtime version;
4. validate the production readiness tag and recorded native artifact;
5. publish from the exact selected checkout with the production EAS
   environment;
6. record the new and previous update group IDs; and
7. fail the release summary without hiding an already successful API or Pages
   phase.

`ota-only` is allowed only when the requested SHA equals
`production-pages`, the API reports the same SHA, production Pages markers
match it, and the readiness tag is valid.

Native EAS Build, TestFlight, App Store, and Play Store submission remain
outside this workflow.

## Branch and release protection

Before `main` becomes the development trunk, preserve its current policy and
adapt its required-check set to the post-cutover workflow. The target policy
must:

- require pull requests;
- retain `unit`, `lint-typecheck`, `api-integration`, `cli`, the three
  always-report mobile gates, `dependency-review`, and `journeys` unless a
  reviewed replacement provides the same coverage;
- require branches to be up to date before merge;
- require conversation resolution;
- enforce protection for administrators;
- keep force pushes and deletion disabled; and
- keep required approvals at zero while there is one developer.

Zero approvals is a deliberate single-developer setting. It does not remove
required checks, exact-SHA rehearsal, or manual production confirmation.

Do not keep `main-gate` as a required pull request check after trunk cutover.
Its current contract assumes that the pull request head already runs on Git
`dev`. The production orchestrator replaces that release gate after merge by
rehearsing the exact `main` SHA in development.

The `production-pages` ruleset described above must enforce:

- no force push;
- no deletion;
- no pull requests;
- no human direct update; and
- only the repository-scoped GitHub App may create or fast-forward it.

The App credentials belong only to a production release environment whose
deployment branch policy permits protected `main`. The environment has no
peer reviewer while there is one developer, so exact typed confirmation,
current-tip selection, required checks, and the ruleset remain mandatory.

Git `dev` remains active under its current protection until the trunk workflow
passes. Then:

1. stop accepting new pull requests to `dev`;
2. lock it against pushes;
3. observe at least seven days and three normal `main` merges;
4. verify one manual production release after trunk cutover; and
5. request explicit approval before deleting it.

Neon `dev` branches and `harpa-pro-dev` remain active after Git `dev` is
deleted.

## Free-tier and cost assessment

Provider limits are volatile. The values below were checked against official
documentation on 2026-08-07 (Asia/Shanghai); live account plan and usage
remain `UNKNOWN` until preflight.

| Provider | Current published constraint | Design consequence |
| --- | --- | --- |
| Neon Free | 10 branches per project; limited restore history | Removing `pr-<n>` branches creates useful headroom |
| Cloudflare Pages Free | 500 builds/month and one concurrent build | Removing three PR builds reduces queue and monthly use |
| Cloudflare R2 Standard | 10 GB-month, 1M Class A, 10M Class B included | A new bucket does not create another allowance |
| EAS Update Free | 1,000 monthly active installations | With no users, PR OTA removal is mainly complexity cleanup |
| Fly.io | No general free tier; started and stopped Machines are billed | Removing preview apps saves clutter and residual cost, not worker cost |

Cloudflare allows unlimited active Pages preview deployments, so the relevant
constraint is build count and queueing, not preview-record count. With three
browser projects, every automatic branch wave can consume three builds.

The largest continuous Fly cost in the checked-in topology is the
development and production storage workers. This proposal intentionally keeps
both hosted environments and their lifecycle guarantees, so it does not claim
to remove that cost.

References:

- [Neon pricing][neon-pricing]
- [Cloudflare Pages limits][cloudflare-pages-limits]
- [Cloudflare R2 pricing][cloudflare-r2-pricing]
- [Expo plans][expo-plans] and [billing FAQ][expo-billing-faq]
- [Fly cost management][fly-costs]
- [GitHub rulesets][github-rulesets] and
  [available rules][github-ruleset-rules]

## Migration phases

### Phase 0: approve the design

This documentation pull request completes analysis only.

Implementation may start only after the owner explicitly approves:

- the target branch model;
- the `production-pages` provider ref;
- the dedicated GitHub App, branch ruleset, and release-environment secret;
- removal of routine hosted previews;
- retention of the current Neon projects and R2 buckets;
- exclusion of hosted dashboard development and production from cutover;
- zero required peer approvals; and
- full API plus Pages release scope with OTA off by default.

### Phase 1: decouple production while `dev` still integrates

Repository work:

- add the manual release orchestrator;
- make API production reusable with an explicit SHA input;
- remove API production `push` and direct dispatch triggers;
- make public and administrator production Pages verification reusable with
  explicit SHA and `production-pages` inputs, callable only by the
  orchestrator;
- remove public and administrator Pages verification `push` and direct
  dispatch triggers;
- disable the dashboard production verifier until dashboard production is
  separately approved;
- make production OTA callable only by the orchestrator;
- remove production OTA `push` and direct dispatch triggers;
- teach the Pages build wrapper that `production-pages` is production;
- add API backward-compatibility, exact-SHA, current-tip, ref, snapshot-pair,
  partial-retry, and summary policy tests; and
- update operations and CI/CD docs in the same implementation change.

External cutover, separately approved:

1. install the approved repository-scoped App and prove its ruleset bypass on
   a disposable ref;
2. under explicit recorded approval, have the owner create
   `production-pages` once at the current verified production SHA before
   Cloudflare uses it, then activate the exact App-only ruleset;
3. configure public and admin Pages production branches to that ref;
4. keep dashboard automatic production disabled;
5. verify current production domains and markers are unchanged;
6. after development serves the exact candidate SHA and all current gates
   pass, use the existing protected `dev` to `main` promotion to land the
   production interlock;
7. verify the new `main` commit cannot trigger API, Pages, or OTA production;
   and
8. run the orchestrator in `plan` mode only.

Exit gate:

- an ordinary push to `main` cannot deploy API, Pages, or OTA production;
- the provider ref initially changes no artifact;
- only the orchestrator can start a release; and
- the old `dev` integration path still works.

Rollback before the first release restores the saved workflow and Cloudflare
branch-control configuration. Do not guess provider settings.

### Phase 2: prove manual release and rollback evidence

With explicit production approval:

1. release the current `main` tip with OTA off;
2. verify both Neon recovery branches;
3. verify exact development and production API identities;
4. verify public and admin production markers;
5. verify lifecycle arming and journeys;
6. verify the summary contains every rollback identifier; and
7. perform read-only rollback drills for API image, Neon, Pages, and OTA
   selection.

Do not simulate a destructive database restore in production.

Exit gate:

- at least one full release succeeds;
- a failed-stage retry preserves its original recovery pair; and
- production remains unchanged by later ordinary `main` pushes.

### Phase 3: retire routine hosted previews

Repository work:

- move required preview checks to credential-free CI;
- remove Fly and Neon preview creation and destruction;
- remove generated `pr-<n>` ref automation;
- remove deployed Pages preview waits and comments;
- remove pull request OTA publication;
- update changed-path and trust-boundary policy tests; and
- update all active preview documentation.

Provider cleanup follows the exact inventory and approval sequence above.

Exit gate:

- pull requests remain fully testable without provider credentials;
- a merged change deploys no pull request resource;
- shared development runs all in-scope cross-origin and live checks;
- exact local dashboard builds replace its removed hosted preview evidence;
  and
- no creator can recreate a deleted preview resource.

### Phase 4: move development to `main`

Preflight:

- freeze merges;
- export GitHub protection and environment settings;
- export Cloudflare branch controls;
- reconcile the 8/46 commit divergence;
- prove all intended `dev` content is in a protected `main` commit;
- prove production auto-deploy is already disabled; and
- save the old `dev` SHA and all development resource identities.

Repository work:

- change development API and OTA triggers from `dev` to `main`;
- make the development API reusable for exact-SHA rehearsal;
- map public and administrator Cloudflare `main` builds to development URLs
  and configuration;
- change public and administrator Pages verification aliases from `dev` to
  `main`;
- update exact admin CORS and cookie origins;
- leave dashboard provider controls unchanged and remove it from hosted
  exact-SHA development evidence;
- change normal pull request guidance to `main`;
- remove the old `dev` to `main` gate; and
- update every branch diagram and runbook in the same change.

External cutover:

- configure `main` as the only public and administrator Pages preview branch;
- keep dashboard automatic production disabled and its hosted development
  deployment frozen;
- apply the target `main` protection;
- retarget or replace active `dev` pull requests; and
- lock `dev` only after the first exact development deployment succeeds.

Exit gate:

- a protected `main` merge updates development only;
- production does not change;
- API, public, administrator, and mobile development report the selected
  `main` SHA;
- the dashboard passes its exact local build and browser suite; and
- a manual production plan can consume that evidence.

Rollback restores `dev` triggers, Pages preview controls, CORS origins, and
pull request guidance. Manual production remains in place.

### Phase 5: observe and clean up

Observe at least seven days, three normal `main` merges, and one manual
production release after Phase 4.

Then, with separate approval:

- delete Git `dev`;
- remove stale local refs;
- remove unused preview GitHub environments and secrets;
- delete only inventoried orphan preview resources; and
- record the final GitHub, Neon, Fly, R2, Cloudflare, and EAS inventory.

Do not delete Neon `dev` or `harpa-pro-dev`. They are the active development
data and storage resources.

Deleting Git `dev` does not authorize dashboard production or make dashboard
`main` builds automatic. Its last hosted development deployment remains only
as historical evidence. Resuming hosted dashboard development needs the
separate provider design required above.

## Rollback playbook

### Workflow or trunk cutover

Before production is manually released, revert the implementation change and
restore the saved branch and Pages controls.

After manual production is active, keep it active during a trunk rollback.
Restore Git `dev` integration without restoring automatic production.

### API code rollback

Normal repair is a revert pull request to `main`, exact development rehearsal,
and a new manual release.

An emergency prior-image deploy bypasses the protected flow and requires
explicit owner approval. Use the current [CI/CD rollback
procedure](arch-cicd-and-migrations.md#code-rollback-no-data-change), including
current Fly configuration, topology repair, lifecycle arming, and both
readiness checks.

Never assume that deploying an older Git SHA is safe after forward-only
migrations.

### Database rollback

Use the paired pre-release Neon branches or the verified restore window.
Restore the application and administrator projects independently unless both
were damaged.

A database restore does not restore R2. Verify file rows and objects before
reopening writes.

### Pages rollback

Cloudflare can roll back only to a successful production deployment, not a
preview deployment. Use the production deployment history, then verify the
exact marker, routes, and API compatibility.

After rollback, pause production ref updates until a fix-forward release is
ready. Do not move `production-pages` backward or force-update it.

See [Cloudflare Pages rollbacks][cloudflare-rollbacks].

### Mobile OTA rollback

Record the bad and prior group IDs. Use EAS Update's rollback or republish
flow for the affected runtime, then verify a real production build downloads
the intended group.

Do not change the native app version during OTA rollback. If no compatible
prior group exists, roll back to the embedded update or fix forward.

See [EAS Update rollbacks][expo-rollbacks].

### Partial release

Do not hide partial success.

- If API fails, Pages and OTA do not start.
- If API succeeds and Pages fails, keep the compatible API live and retry the
  failed Pages phase from the same run and SHA. If monitoring disproves the
  compatibility invariant, stop and use the approved prior-image rollback;
  do not continue to Pages.
- If Pages succeeds and OTA fails, production web and API remain released;
  retry `ota-only` for the same current production SHA.
- If a data incident occurs, stop releases and use the database procedure.

## Risks and controls

| Risk | Control |
| --- | --- |
| `main` publishes production during cutover | Decouple production before trunk work |
| Wrong SHA reaches production | Resolve once, require current tip, pin every checkout |
| Development tests different code | Rehearse exact SHA before production |
| Pages Git automatically publishes `main` | Use `production-pages` as production source |
| Machine ref becomes a hidden release branch | No PRs, fast-forward only, release actor only |
| New API breaks still-deployed clients | Enforce expand-contract compatibility before API deploy |
| Preview removal loses auth/CORS evidence | Replacement matrix and live development journeys |
| Snapshot is created after migration | Paired branches before Fly, reused on retry |
| App and admin restores become coupled | Preserve separate Neon projects and evidence |
| R2 is assumed to follow a DB restore | Explicit object and lease verification |
| OTA targets the wrong binary | Runtime tags, native-sensitive diff, OTA default off |
| Dashboard is accidentally activated | Exclude its provider project from trunk cutover |
| One developer bypasses protection | Enforce admins and require checks; approvals stay zero |
| Free-tier numbers drift | Re-read account and official limits before writes |
| Cleanup removes active data | Exact inventory, observation window, separate approval |

## Alternatives considered

### Keep `dev` and `main` permanently

This is the lowest implementation risk and remains the rollback position. It
does not solve the repeated promotion ceremony or separate integration from
release timing.

### Switch `main` first

Rejected. Current API, public site, admin site, dashboard verifier, and
production OTA all treat `main` as production. A branch-first change can
publish ordinary development to production.

### Restore credentialed Pages direct upload

Rejected. It weakens the current tokenless publisher model and duplicates
Cloudflare Git behavior.

### Add separate Neon projects for development

Rejected for this migration. Correct isolation would require separate
application and admin development projects, not only one new project. Removing
preview branches gives most quota relief with much less migration risk.

### Keep routine hosted previews

Rejected for the present one-developer, no-user phase. Their useful checks
must move before deletion. Reconsider after measured collaboration or review
needs.

### Add site-only release immediately

Rejected. The first release contract favors one exact API and Pages SHA.
Add a calculated static-only path only after a real need and a proven
cross-surface compatibility guard.

## Proposed implementation pull requests

All feature implementation pull requests target protected `dev` until Phase 4
changes policy. They must use an up-to-date base and pass the current required
checks. Phase 1 still needs one separately approved, protected `dev` to `main`
promotion to activate the interlock under the old model. This design pull
request neither opens nor authorizes that promotion, and it does not authorize
bypassing or reducing any check.

### Pull request A: production interlock

- manual exact-SHA orchestrator;
- reusable production API, public/admin Pages verification, and OTA
  workflows;
- disabled dashboard production verification;
- `production-pages` build contract;
- paired snapshot and retry policy;
- exact-SHA tests; and
- matching operations docs.

### Pull request B: preview retirement

- credential-free replacement coverage;
- hosted preview workflow removal;
- provider cleanup inventory tooling; and
- matching testing and operations docs.

### Pull request C: trunk cutover

- development triggers on `main`;
- public and administrator Cloudflare `main` preview mapping;
- explicit dashboard hosted-development exclusion;
- exact development rehearsal;
- branch protection and pull request policy;
- `main-gate` removal; and
- matching repository instructions and runbooks.

### Pull request D: post-observation cleanup

- Git `dev` deletion, separately approved;
- obsolete environment and credential removal;
- exact orphan-resource deletion, separately approved; and
- final provider inventory documentation.

## Final acceptance

The migration is complete only when all are true:

- [ ] The owner approved implementation after this design-only pull request.
- [ ] Normal pull requests target protected `main`.
- [ ] `main` requires current checks, up-to-date branches, resolved
      conversations, and administrator enforcement.
- [ ] Relevant `main` merges deploy development and cannot deploy production.
- [ ] One orchestrator owns every normal production mutation.
- [ ] Production release selects the current full `main` SHA.
- [ ] Development rehearses that exact SHA before production.
- [ ] The new API remains compatible with every still-deployed client.
- [ ] Both Neon projects create pre-migration recovery branches.
- [ ] Fly reports the exact SHA and both readiness routes pass.
- [ ] Storage-worker topology and lifecycle arming are proven.
- [ ] `production-pages` fast-forwards only after the API passes.
- [ ] Public and admin production markers report the selected SHA.
- [ ] Dashboard production remains disabled until separately approved.
- [ ] Dashboard hosted development remains excluded until separately
      designed.
- [ ] Production OTA is explicit, runtime-safe, and recorded.
- [ ] Routine hosted pull request resources are gone.
- [ ] Lost preview coverage exists in CI, exact local dashboard tests, and
      shared development.
- [ ] Application and admin Neon projects remain independent.
- [ ] Production and development R2 buckets remain separate.
- [ ] Git `dev` is locked or deleted only after the observation window.
- [ ] Every deleted provider resource had an approved exact inventory.
- [ ] API, database, Pages, and OTA rollback identifiers are recorded.

[cloudflare-git]: https://developers.cloudflare.com/pages/configuration/git-integration/
[cloudflare-branches]: https://developers.cloudflare.com/pages/configuration/branch-build-controls/
[cloudflare-rollbacks]: https://developers.cloudflare.com/pages/configuration/rollbacks/
[cloudflare-pages-limits]: https://developers.cloudflare.com/pages/platform/limits/
[cloudflare-r2-pricing]: https://developers.cloudflare.com/r2/pricing/
[neon-pricing]: https://neon.com/pricing
[expo-plans]: https://docs.expo.dev/billing/plans/
[expo-billing-faq]: https://docs.expo.dev/billing/faq/
[expo-rollbacks]: https://docs.expo.dev/eas-update/rollbacks/
[fly-costs]: https://fly.io/docs/about/cost-management/
[github-rulesets]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository
[github-ruleset-rules]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
