# Public site consent and marketing telemetry design

> **Status: proposed on 2026-08-07.** This is a design-only decision
> document. It does not approve a provider, add a consent manager, enable
> analytics, install Apollo, or authorize sending visitor data. The public
> site remains unchanged until the decisions in
> [Approval gates](#approval-gates) are made explicitly.

## Decision summary

The public site currently has no repository-confirmed analytics or marketing
tracker. The Termly UUID already in the repository opens a hosted privacy
policy; it is not evidence of an installed consent-management platform (CMP)
and must not be reused as a CMP website UUID.

Do not add a provider-neutral runtime in this task. The current repository
does not decide:

- whether to use a CMP or marketing-identification provider;
- which routes are legitimate marketing-measurement surfaces;
- whether any query-bearing page may be measured;
- which consent category a selected provider must use; or
- which production identifiers and deletion process apply.

Adding loaders, flags, or consent state before those choices would encode
product and legal assumptions in code. It would also add JavaScript to a site
whose current rule is to ship no JavaScript unless an island requires it.

If a small Apollo pilot is later approved, the recommended starting point is:

- direct installation rather than Google Tag Manager (GTM);
- company-level matching only;
- explicit, global opt-in under a marketing or advertising category;
- production only, on `/` and `/roadmap` initially;
- no tracking on any URL that contains a query string;
- no waitlist, product-account, CRM, mailbox, or sequence integration; and
- a separate kill switch that defaults to off.

Cloudflare Web Analytics remains a separate aggregate-measurement option. The
repository approves it as the cookieless launch option if analytics is
enabled, but its provider-console state is `UNKNOWN` and this design does not
enable it.

## Goals

- Separate aggregate site measurement from visitor identification and sales
  enrichment.
- Ensure non-essential telemetry cannot load before valid consent.
- Keep token-bearing, legal, support, unknown, and query-bearing URLs outside
  marketing telemetry.
- Give visitors an equally accessible way to reject, change, and withdraw
  consent.
- Define the disclosure, identifier, test, rollout, and deletion contracts
  before any provider code lands.
- Keep every provider disabled in local, preview, and dev environments unless
  a later, explicit test plan says otherwise.

## Non-goals

- Selecting or purchasing Apollo, Termly, GTM, GA4, PostHog, or another
  provider.
- Treating this document as legal advice or legal approval.
- Identifying a named visitor or asserting that a contact at a matched company
  visited the site.
- Enriching waitlist or product-account records.
- Syncing a CRM or mailbox, sending outreach, or starting automated sequences.
- Making marketing telemetry part of mobile-app account deletion.
- Persisting identity-level consent or sharing consent across subdomains.
- Adding any script, pixel, beacon, cookie, local-storage entry, or network
  request in this design PR.

## Current system

`apps/site` is a static Astro site. `src/layouts/Layout.astro` is the shared
HTML shell and currently injects no telemetry or consent code. The only global
browser behavior comes from explicit islands or route-local scripts.

The relevant current surfaces are:

| Surface                   | Current behavior                                 | Design consequence                                      |
| ------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `/`                       | Marketing page with waitlist and demo islands    | Candidate pilot route                                   |
| `/roadmap`                | Public product roadmap                           | Candidate pilot route                                   |
| `/docs` and `/docs/**`    | Task-focused guides; search stays in the browser | Default excluded until docs measurement is approved     |
| `/confirm?token=...`      | Reads a one-time token and posts it to the API   | No non-essential third-party script or request          |
| `/account-deletion`       | Account-deletion instructions                    | No marketing telemetry                                  |
| `/privacy`                | Embeds the existing Termly-hosted policy         | No marketing telemetry; inventory the iframe separately |
| `/404` and unknown routes | Error/support context                            | Default denied                                          |

`src/lib/env.ts` has no consent or telemetry configuration. The Cloudflare
Pages build path injects only the current API, dashboard, and Turnstile public
values. The footer exposes `Privacy`, but no terms page or cookie-preferences
control exists.

The current third-party browser boundaries are not analytics:

- Turnstile loads inside the waitlist flow to prevent abuse.
- The `/privacy` route embeds Termly's hosted policy viewer.
- The waitlist form sends data to Harpa's API only after submission.

The Termly policy iframe must be included in a future cookie and network scan.
Its presence does not prove that Termly CMP, Auto Blocker, consent storage, or
banner configuration exists.

## Provider roles

The implementation must classify purpose before it classifies vendor.

| Purpose                           | Example                              | Default consent treatment                                          |
| --------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| Essential security                | Turnstile on waitlist submission     | Essential; limited to the requested flow                           |
| Aggregate performance measurement | Cloudflare Web Analytics             | Separate approval; no marketing use                                |
| Product or funnel analytics       | A later PostHog or GA4 configuration | Consent depends on the exact data and purpose                      |
| Marketing identification          | Apollo website visitors              | Explicit marketing or advertising opt-in                           |
| Tag orchestration                 | GTM                                  | No independent purpose; inherits every loaded tag's strictest gate |

GTM is not analytics and does not identify visitors. It is a deployment layer.
It should not be introduced for one provider because it adds another control
plane, identifier, and consent configuration without adding a current product
capability.

Apollo's company match is not evidence that a named person visited. Apollo's
current product supports company and, for eligible U.S. traffic, person-level
views. Any contact shown for a matched company may be a likely contact rather
than the visitor. Product copy, operator training, and outreach policy must
preserve that distinction.

## Data flows

### Current flow

1. The browser requests a static page from Cloudflare Pages.
2. No repository-installed analytics or marketing provider receives a page
   event.
3. On `/privacy`, the browser requests the Termly-hosted policy iframe.
4. On waitlist submission, Turnstile returns a challenge token and the form
   sends the entered data to Harpa's API.
5. On `/confirm`, the route-local script sends the one-time token only to
   Harpa's API.

### Proposed consent flow

This flow applies only after a CMP is selected and its identifiers are
approved.

1. A pure, repository-owned policy classifies the route and query state before
   any optional provider loader is rendered.
2. On a CMP-eligible route, the selected CMP initializes before any
   non-essential provider.
3. The initial state is denied for analytics and marketing. Silence, scrolling,
   continued browsing, and preselected controls are not consent.
4. The visitor may accept all, reject all, or choose granular purposes.
5. A provider may load only when all of its gates pass: production deployment,
   explicit feature flag, approved route, safe query state, valid identifier,
   and granted consent category.
6. Consent changes are observed at runtime. A grant may load an eligible
   provider once. A withdrawal stops future provider activity and asks for a
   reload when already-executed JavaScript cannot be safely unloaded.
7. Every HTML route keeps a first-party `Cookie settings` link to a dedicated,
   query-free `/cookie-settings` page. Sensitive routes do not load the CMP;
   the settings page loads it only so the visitor can review or withdraw a
   choice. After the CMP initializes, that page automatically opens the
   preference center through a documented provider mechanism; it does not
   require a second “open settings” action.

Consent state stays browser-scoped. It must not be joined to waitlist email,
Harpa account ID, Apollo contact, or another identity. A new browser, device,
or cleared storage may require a new choice.

### Proposed Apollo flow

This flow applies only if Apollo is selected explicitly.

1. On an approved page, the browser receives no Apollo code before marketing
   consent.
2. After consent, the direct Apollo script may set or read its first-party
   browser identifier and send a tracking request to Apollo.
3. Apollo may receive network and browser signals including IP address,
   device/browser information, referrer, pages visited, and interaction data.
4. Apollo attempts to match those signals to company data and, if a later
   separately approved mode allows it, eligible contact data.
5. Harpa staff view the result in Apollo. Phase one does not export it, join it
   to Harpa data, or trigger outreach automatically.

Apollo states that customer-submitted visitor IP addresses and matched data
may contribute to or enrich its contributor database. Its DPA also describes
some matched data processing as independent-controller processing. This is why
Apollo belongs in the marketing or advertising category rather than a
consent-free aggregate-analytics category.

### Cloudflare Web Analytics flow

Cloudflare documents its Web Analytics beacon as using browser performance
data without cookies or browser storage. It says it does not track individuals,
does not currently log query strings, and discards the source IP at the nearest
Cloudflare data center rather than storing it in core databases or logs. This is
materially different from Apollo.

Enabling Cloudflare Web Analytics is nevertheless a separate change. The
implementation must decide whether Cloudflare injects it at the edge or the
repository renders a tokenized snippet, update the privacy disclosure, and
verify the live provider state. Do not represent an unchecked dashboard or
Pages setting as enabled.

## Route and query policy

The marketing-provider policy is default deny. Unknown routes never inherit a
global allow.

### Recommended phase-one matrix

| Route                     | CMP UI                      | Aggregate measurement | Marketing identification |
| ------------------------- | --------------------------- | --------------------- | ------------------------ |
| `/`                       | Candidate                   | Separate decision     | Candidate after opt-in   |
| `/roadmap`                | Candidate                   | Separate decision     | Candidate after opt-in   |
| `/docs`, `/docs/**`       | Candidate                   | Separate decision     | Deny initially           |
| `/privacy`                | Candidate for settings only | Deny                  | Deny                     |
| future `/terms`           | Candidate for settings only | Deny                  | Deny                     |
| future `/cookie-settings` | Allow for settings only     | Deny                  | Deny                     |
| `/confirm`                | Deny                        | Deny                  | Deny                     |
| `/account-deletion`       | Deny                        | Deny                  | Deny                     |
| `/404` or unknown         | Deny                        | Deny                  | Deny                     |

The final CMP UI column depends on the selected provider's ability to offer a
first-party settings link without adding third-party processing to sensitive
routes. When it cannot, sensitive routes should link to a safe settings page
instead of loading the CMP there.

The footer link itself is always first-party and remains available on denied
routes. The `/cookie-settings` destination is the only guaranteed withdrawal
surface; a CMP-enabled route may additionally open the same preferences inline.

Any query string suppresses marketing identification in phase one, including
on an otherwise approved route. This is safer than assuming an unfamiliar key
or value is harmless and protects future confirmation, support, preview, or
debug links. If attribution later requires `utm_*` or click identifiers, that
must be a new design decision with a value-sanitization contract; an allowlist
of key names alone does not prevent a value from containing personal data.

The provider must never receive:

- the waitlist confirmation token;
- waitlist form fields or confirmation state;
- docs-search text;
- account-deletion request details;
- product account, project, report, note, or file identifiers; or
- a full URL or referrer containing an unapproved query string.

Set and test a restrictive referrer policy as defence in depth. Do not treat it
as a replacement for suppressing provider load.

## Consent behavior

### Opt in

- Marketing and advertising start denied for every visitor, not only visitors
  geolocated to a particular region.
- Accept and reject actions receive equivalent prominence and effort.
- Categories are granular. Marketing identification is not bundled with an
  essential flow or the waitlist agreement.
- The notice names Harpa, the selected provider, the purpose, the important
  data types, and the right to withdraw.
- A provider loads at most once per page lifecycle after all gates pass.

### Opt out and withdrawal

- Rejecting prevents the provider script and its network requests from loading.
- A visible footer control reopens preferences in one step.
- Following the first-party footer link automatically opens the preference
  center on `/cookie-settings`; a generic page that requires another setup
  action does not satisfy this contract.
- Withdrawal immediately blocks future provider activity. If the provider has
  already executed, reload the document into the denied state.
- The implementation clears known provider cookies or site-owned state where
  the selected provider documents a safe mechanism.
- The notice explains that a CMP may stop future processing without deleting
  cookies already stored in the browser. Visitors receive browser-removal
  instructions where needed.
- Withdrawal is not retroactive deletion of provider-held history. That uses
  the data-rights process below.
- Global Privacy Control is treated as a denial wherever the selected CMP can
  honor it. Whether to honor it globally is an approval decision.

Consent must be refreshed when the purpose, provider, data categories,
controller relationship, or policy revision changes materially.

## Disclosure contract

Before a provider is enabled, the public legal surface must include:

- a plain-language banner summary;
- a persistent, first-party `Cookie settings` link on every HTML route;
- a dedicated `/cookie-settings` withdrawal surface that does not load a
  marketing provider;
- a cookie or tracking notice linked from the footer;
- an updated privacy policy and provider list; and
- a reviewed effective date and policy revision.

For each provider, disclose:

- provider and controller/processor roles;
- purpose and consent category;
- browser storage, cookie names, and durations after a live scan;
- data sent, including IP, device/browser, page/referrer, and interaction data;
- matching or profiling behavior;
- countries or transfer safeguards;
- provider and Harpa retention rules;
- how to withdraw consent;
- how to request access, correction, opt-out, or deletion; and
- whether data may be used to enrich a shared or contributory database.

Apollo-specific copy must say that Apollo may attempt company or eligible
contact matching and that a company match does not prove a particular employee
visited. Do not describe it as anonymous analytics.

The existing Termly-hosted privacy policy must be updated in the Termly account
and republished if it remains the policy source. A repository change to the
iframe URL alone cannot prove that the hosted policy text is current. Legal
review and provider-console publication remain external gates.

## Identifier and configuration contract

All browser identifiers below are public configuration, not secrets. They
still require intentional review because they authorize a production data
flow. Add only the variables for the provider combination that is actually
approved; do not make disabled builds declare generic provider enums.

If Termly and Apollo are approved, use a typed, fail-closed contract equivalent
to:

| Identifier                              | Purpose                                    | Required when                       |
| --------------------------------------- | ------------------------------------------ | ----------------------------------- |
| `PUBLIC_TERMLY_WEBSITE_UUID`            | Termly CMP resource-blocker website UUID   | Termly is selected                  |
| `PUBLIC_APOLLO_ENABLED`                 | Audited Apollo production kill switch      | The Apollo loader exists            |
| `PUBLIC_APOLLO_APP_ID`                  | Value from Apollo's generated site snippet | Apollo is enabled                   |
| `PUBLIC_CLOUDFLARE_WEB_ANALYTICS_TOKEN` | Manual beacon token                        | Manual Cloudflare setup is selected |

The implementation must use the exact Apollo-generated snippet as the
reference and extract only a documented public application identifier. Do not
guess or hand-type the snippet. The existing `policyUUID` in
`src/lib/legal.ts` is not `PUBLIC_TERMLY_WEBSITE_UUID`.

Rules for the typed environment parser:

- add no consent or telemetry variables before a provider is approved;
- once an Apollo loader exists, every build declares
  `PUBLIC_APOLLO_ENABLED`, with local, test, preview, and dev set to `false`;
- a selected provider ID is required only in builds that render that provider;
- `PUBLIC_APOLLO_ENABLED=true` with a missing CMP identifier, Apollo app ID, or
  production deployment fails the build;
- malformed UUID/app IDs fail the build; and
- no secret API key, bearer token, CRM credential, or mailbox credential is
  exposed through `PUBLIC_*`.

If Cloudflare edge injection is selected, the repository has no beacon token.
The external Pages setting, hostname, and live beacon then require separate
verification and must remain `UNKNOWN` when inaccessible.

## Implementation shape after approval

Keep the implementation small and specific to the approved combination:

1. A pure route/query policy returns eligible purposes for the current URL.
2. The selected CMP bridge exposes initialized consent state and
   consent-change events.
3. The selected provider has one purpose-specific loader; there is no generic
   provider registry.
4. `Layout.astro` renders only the approved CMP bootstrap or route-local loader
   shell. No provider code is emitted when the build is off or the route is
   denied.
5. Every HTML route renders a first-party link to `/cookie-settings`; only that
   destination or another explicitly CMP-eligible route loads the preferences
   UI. The settings route uses a documented provider mechanism to open the
   preference center as soon as the CMP is initialized.

Do not build a generic plugin framework or provider enum. The first
implementation supports only the exact provider combination that the user
approves. Add another bridge or loader only with another concrete requirement.

If Termly is selected, its Auto Blocker script must execute before any
non-essential script it controls. Apollo should be explicitly categorized as
marketing or advertising rather than left unclassified. Termly's runtime
consent state and consent-change events can drive the gate, but the repository
route/query policy remains an additional boundary.

## Test contract

### Static and unit tests

- The disabled build emits no CMP, Apollo, GTM, GA4, PostHog, or analytics
  provider hostnames.
- The route matrix is table-tested, including unknown routes and trailing
  slash normalization.
- Any query string denies marketing identification.
- Conditional environment parsing fails closed for missing or malformed IDs.
- Provider loaders require deployment, flag, route, query, identifier, and
  consent gates simultaneously.
- A consent change cannot load a provider twice.
- Docs search remains local and emits no search text.

### Playwright tests

Intercept and fail unexpected third-party requests. Assert:

- `/confirm?token=example` sends no request or referrer to any optional
  provider and does not put the token in console output;
- `/account-deletion`, `/privacy`, `/404`, and an unknown route never load a
  marketing provider;
- an approved route loads no marketing provider before a choice;
- reject and Global Privacy Control states load no marketing provider;
- marketing opt-in loads only the selected provider on an approved,
  query-free route;
- a query-bearing approved route remains denied;
- withdrawal followed by reload remains denied; and
- denied and sensitive routes retain a working first-party link to
  `/cookie-settings` without loading the CMP in place;
- the settings destination opens the preference center without a second
  “open settings” action; and
- local, PR-preview, and dev builds remain provider-off.

CI tests use a fake consent adapter and local network assertions. They do not
call a live CMP, Apollo, or analytics ingestion endpoint.

### Manual provider verification

After explicit production approval:

- verify the CMP is the first relevant script and its published policy version
  is current;
- scan every route and classify every storage item and third-party request;
- verify accept, reject, granular choice, preference reopening, withdrawal,
  new-browser behavior, and Global Privacy Control;
- verify no provider request occurs on denied routes or query-bearing URLs;
- for Termly, inspect `Termly.getConsentState()` and published domain rules;
- for Apollo, confirm `assets.apollo.io` and a successful `track_request` only
  after consent on an approved route;
- verify the Apollo dashboard remains company-only; and
- for Cloudflare, verify the exact hostname, beacon/edge setting, absence of
  browser storage, and live dashboard receipt.

Capture network evidence without real confirmation tokens, emails, account
identifiers, or other personal data.

## Rollout and rollback

1. **Design approval.** Resolve every approval gate below. Record the provider
   contracts, legal review owner, IDs, route matrix, and success criteria.
2. **Foundation PR.** Add only the approved route/query policy, typed
   configuration, consent adapter, disclosure surfaces, and offline tests.
   Keep all provider flags off.
3. **Consent-only production verification.** If a CMP is selected, enable the
   CMP with marketing providers still off. Verify blocking, choices,
   withdrawal, accessibility, mobile layout, cookie report, and policy text.
4. **Aggregate measurement decision.** Enable Cloudflare Web Analytics in its
   own change only if selected and live provider access can be verified.
5. **Marketing pilot.** Enable Apollo only on the approved production routes,
   company-only, for a time-bounded pilot. Do not enable GTM, contact-level
   matching, enrichment, exports, or automation.
6. **Review.** Measure consent rate, eligible visits, matched-company rate,
   relevant-contractor rate, false matches, provider cost, opt-outs, and data
   requests. A match count alone is not success.
7. **Expansion decision.** Any added route, query attribution, contact-level
   mode, CRM export, or outreach automation needs a new reviewed change.

Rollback is two steps: set the repository-controlled provider flag to false
and deploy, then deactivate the tracked domain in the provider console. Verify
that provider requests stop. Rollback does not delete historical provider data;
follow the deletion process separately.

## Retention and deletion boundaries

Four actions must remain distinct:

| Action                     | Effect                                                                       | Does not do                                                         |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Reject or withdraw consent | Stops future optional browser processing                                     | Delete an existing browser cookie or provider history automatically |
| Clear browser storage      | Removes device-local state                                                   | Delete data already held by a provider                              |
| Harpa account deletion     | Deletes app account and associated product data under the existing lifecycle | Delete unrelated anonymous marketing history automatically          |
| Data-rights request        | Invokes Harpa and provider access/opt-out/deletion procedures                | Guarantee removal of lawful suppression or retained records         |

Phase one must create no Harpa-side visitor-profile database. Do not copy
Apollo matches into Neon, CSV, CRM, issue trackers, a mailbox, or sequences.
That keeps the provider console as the only new data store and prevents an
unbounded deletion fan-out.

Before enabling Apollo, Harpa must document:

- who receives a visitor-data request;
- how Harpa searches and deletes any data it controls;
- how a request is forwarded to Apollo when Apollo controls the relevant data;
- how Apollo opt-out/deletion notices are applied to any data Harpa retains;
- the contractual retention and backup behavior; and
- what suppression records may remain after deletion.

Apollo currently describes retention in usefulness-based terms and may retain
suppression data. Its DPA describes customer-data purging after termination but
also independent-controller processing for some matched data. Provider-domain
deactivation, subscription cancellation, consent withdrawal, and a data-rights
deletion request are therefore not interchangeable.

If a future phase exports provider data, every destination needs a retention
period, lineage record, and deletion-cascade test before the export ships.

## Approval gates

The user must decide or supply all of the following before implementation:

1. **Aggregate measurement:** remain at no repository-confirmed analytics, or
   enable Cloudflare Web Analytics; if enabled, choose edge injection or a
   repository-managed token.
2. **Consent provider:** Termly CMP, another CMP, or no cookie-based marketing
   telemetry. A hosted Termly policy alone is not a CMP choice.
3. **Marketing provider:** no visitor identification, or a time-bounded Apollo
   pilot.
4. **Apollo mode:** company-only (recommended) or company and eligible people.
   Contact-level mode requires a separate legal and outreach decision.
5. **Route scope:** `/` and `/roadmap` only (recommended), or include docs
   pageviews. Docs-search text remains prohibited.
6. **Query scope:** deny every query string (recommended), or approve a
   provider-specific sanitized attribution design.
7. **Consent geography:** global explicit opt-in (recommended), or a reviewed
   regional configuration; also decide whether Global Privacy Control is
   honored globally.
8. **Identifiers:** the CMP website identifier, the exact Apollo-generated
   application snippet/ID if selected, and the Cloudflare token if manual setup
   is selected.
9. **Disclosure:** approved banner, cookie notice, privacy-policy text,
   provider roles, effective date, and deletion contact/process.
10. **Pilot operations:** owner, start/end date, success threshold, review
    cadence, console access, kill-switch owner, and incident response.

No identifier should be requested from a provider and no provider should be
contacted on the user's behalf without explicit authorization.

## Evidence reviewed

Primary sources current on 2026-08-07:

- [Apollo website visitor tracking](https://knowledge.apollo.io/hc/en-us/articles/20544185285389-Track-Website-Visitors-to-Prioritize-Prospects)
- [Apollo privacy policy](https://www.apollo.io/privacy-policy)
- [Apollo data processing addendum](https://www.apollo.io/dpa)
- [Termly Auto Blocker implementation](https://support.termly.io/hc/en-us/articles/30710482292881-Auto-Blocker-implementation-guide)
- [Termly consent state and events](https://support.termly.io/hc/en-us/articles/30710442081553-Getting-Consent-State-and-Handling-Consent-Changes-with-Termly)
- [Termly preference management](https://support.termly.io/hc/en-us/articles/30710537528977-How-can-I-let-my-users-manage-their-cookie-preferences)
- [Termly withdrawal and stored-cookie behavior](https://support.termly.io/hc/en-us/articles/34205933538705-FAQ-Termly-s-Consent-Management-and-Cookie-Behavior)
- [ICO storage/access rules](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-pecr-rules/)
- [ICO statistical-purpose exceptions](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/)
- [Cloudflare Web Analytics data collection](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
- [Cloudflare Web Analytics RUM beacon privacy](https://developers.cloudflare.com/speed/observatory/rum-beacon/)
- [Cloudflare Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/)

Vendor behavior, pricing, law, regulator guidance, and consent requirements can
change. Revalidate these sources when an implementation is approved.
