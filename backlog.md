# OpenSEO backlog

Ordered execution backlog derived from the 41 open issues on
[every-app/open-seo](https://github.com/every-app/open-seo/issues), cross-checked against the code
on this working tree and against the public roadmap in `web/content/marketing/roadmap.md`.

Items are listed in the order they should be worked. Issue IDs are given where an upstream issue
exists; items marked *(no issue)* are proposals that came out of reading the code, not the tracker.

**Guiding theme:** OpenSEO is a reporting tool that stops one step short of being an SEO agent. It
finds opportunities and then the user retypes them somewhere else. Most high-value items below are
a variation of closing that loop. The second theme is surfacing work that is already 80% built
server-side — AI-search services with no MCP tools, Discover data with no UI control, a local rank
grid tool with no page.

---



## Already shipped — close upstream

- **#30 — Add Google Analytics support to the common MCP server.** Shipped.
`src/server/mcp/tools/google-analytics-tools.ts` registers ten GA4 tools including
`get_search_opportunities`.
- **#125 — MCP write access to rank tracking.** Shipped. `add-rank-tracking-keywords.ts`,
`remove-rank-tracking-keywords.ts`, `create-rank-tracker.ts`, and `run-rank-tracker.ts` all exist
under `src/server/mcp/tools/`.
- **#234, #199** — not actionable.

---



## P0 — Security and data loss



### 1. Stop session replay from capturing a new MCP API key — [#233](https://github.com/every-app/open-seo/issues/233)

The one-time key reveal in `src/client/features/settings/ApiKeySettings.tsx` renders the plaintext
key as text. `src/client/lib/posthog.ts` masks with `maskAllInputs: true` and
`maskTextSelector: "[data-ph-mask], .ph-mask"`; the reveal element is not an input and carries
neither selector. Keys do not expire by default, so a recorded key stays valid until revoked.

- [x] The key reveal element is excluded from session recordings via the existing mask selector.
- [x] Any network response body containing the plaintext key is excluded from capture.
- [x] A test or lint guard prevents the reveal from being re-rendered unmasked.
- [x] Verified against a deployment with `POSTHOG_PUBLIC_KEY` / `POSTHOG_HOST` set.
- [x] Self-hosted deployments without PostHog remain unaffected.



### 2. Self-host deploy silently deletes a hand-attached custom domain — [#226](https://github.com/every-app/open-seo/issues/226)

`alchemy.run.ts` only sets the Worker `domain` prop for the hosted-prod stage; every other stage
deploys with `domain: undefined`, which the provider's reconcile treats as "zero desired domains"
and deletes the attached domain along with its DNS record. Deploy log shows
`Reconciling custom domains (0)`.

- [ ] An optional `CUSTOM_DOMAIN` env var is read like the other optional vars.
- [ ] Non-prod stages pass `CUSTOM_DOMAIN` to the Worker `domain` prop when set.
- [ ] Hosted prod keeps its hardcoded domains, unchanged.
- [ ] A self-host deploy with `CUSTOM_DOMAIN` set reports `Reconciling custom domains (1)` and the
  ```
  hostname survives repeat deploys.
  ```
- [ ] Documented in `docs/SELF_HOSTING_CLOUDFLARE.md` and `.env.selfhost.example`.



### 3. Lighthouse audit fails mid-run, charges credits, discards completed reports — [#222](https://github.com/every-app/open-seo/issues/222)

Reported case: crawl completed 25/25, Lighthouse reached 8/20 with zero sample failures, workflow
ended `failed` / `workflow_internal`, 70 credits charged, and `get_audit_pages` did not expose the
eight completed Lighthouse reports.

- [ ] Completed Lighthouse samples are persisted as they finish, not only on workflow success.
- [ ] `get_audit_pages` and the audit UI expose partial Lighthouse results when the workflow fails.
- [ ] A sample or provider failure surfaces a concrete per-sample error code, not
  ```
  `workflow_internal`.
  ```
- [ ] Credit handling is retry-safe: a failed run does not charge for samples never produced, and a
  ```
  retry does not double-charge for samples already stored.
  ```
- [ ] The failure state in the UI tells the user what they were and were not charged for.



### 4. Orphaned GSC OAuth grant cannot be unlinked or re-linked — [#221](https://github.com/every-app/open-seo/issues/221)

A Google account linked to an older user with no project mapping blocks the correct user from
connecting: consent completes, then OpenSEO returns `account_already_linked_to_different_user`. The
project-level disconnect only removes a grant after deleting an existing project connection, so a
grant with no mapping is unreachable.

- [ ] An account-level "Disconnect Search Console grant" action exists independent of any project
  ```
  mapping.
  ```
- [ ] After disconnecting, a different user owning the correct project can complete consent and
  ```
  select their verified `sc-domain` property.
  ```
- [ ] The action is scoped so a user can only release grants for Google accounts they can
  ```
  re-authenticate as.
  ```
- [ ] `account_already_linked_to_different_user` surfaces a message pointing at the recovery path
  ```
  rather than dead-ending.
  ```
- [ ] Same treatment applied to the GA4 grant path, which shares the connector model.



### 5. Add a private vulnerability reporting channel — *(no issue; raised inside #233)*

The repo has GitHub private vulnerability reporting disabled and no `SECURITY.md`, so there is no
non-public way to send a report like #233.

- [ ] `SECURITY.md` exists with a supported-versions statement and a reporting address.
- [ ] GitHub private vulnerability reporting is enabled on the repository.
- [ ] `SECURITY.md` is referenced from `README.md` and `docs/CONTRIBUTING.md`.

---



## P1 — Self-host front door

New self-hosters hit these before they see any feature. #190 is the most-commented issue in the
repo.

### 6. `AUTH_MODE=local_noauth` does not work — [#190](https://github.com/every-app/open-seo/issues/190)

Reported on Coolify with the env var confirmed present inside the container. `src/server.ts:171`
branches on `authMode === "cloudflare_access" || authMode === "local_noauth"`.

- [ ] Root cause identified and stated in the issue (env plumbing, middleware order, or
  ```
  `ALLOWED_HOST` / reverse-proxy interaction).
  ```
- [ ] A container started with only `AUTH_MODE=local_noauth` reaches the dashboard as the injected
  ```
  admin user.
  ```
- [ ] Startup fails loudly with an actionable message when `AUTH_MODE` is set to an unrecognized
  ```
  value, instead of falling through to a generic auth error.
  ```
- [ ] Reproduced and verified behind a reverse proxy, since that is the reported environment.
- [ ] `docs/SELF_HOSTING_DOCKER.md` documents the working minimal env set.



### 7. Auth failures despite correct variables and secrets — [#132](https://github.com/every-app/open-seo/issues/132)

- [ ] Reproduced against the documented self-host env set.
- [ ] Misconfiguration produces a specific error naming the missing or mismatched variable.
- [ ] A preflight check validates the auth-mode-specific variable set at boot.
- [ ] Docs updated with the failure modes found.

---



## P2 — Close the loop



### 8. AI-search / AEO MCP tools — [#126](https://github.com/every-app/open-seo/issues/126)

`src/server/features/ai-search/services/` ships `brandLookup.ts`, `citedSources.ts`,
`promptExplorer.ts`, and `shareOfVoice.ts`, fully tested and UI-only. Of the 40+ registered MCP
tools, none touch AEO — so an agent cannot answer "who is winning share of voice in AI answers for
this domain." Thin wrappers, no new DataForSEO integration.

- [ ] `get_ai_search_visibility` wraps `shareOfVoice.ts` + `brandLookup.ts` and returns brand
  ```
  mention count and share of voice against named competitors.
  ```
- [ ] `get_ai_search_cited_sources` wraps `citedSources.ts` and returns cited URLs and domains.
- [ ] `get_ai_search_prompt_results` wraps `promptExplorer.ts` and returns per-prompt answers plus
  ```
  citations.
  ```
- [ ] One file per tool under `src/server/mcp/tools/`, each registered individually in
  ```
  `src/server/mcp/server.ts` per the comment at the top of that file.
  ```
- [ ] Handlers call the feature services, not the raw DataForSEO client.
- [ ] Project-scoped auth via `withMcpProjectAuth`, following `get-domain-overview.ts`.
- [ ] All three are `readOnlyHint: true`; no AI-search config mutation.
- [ ] Tool descriptions state the credit cost explicitly, since the LLM endpoints are pricier than
  ```
  Labs/SERP.
  ```
- [ ] Output schemas validated by the existing `output-schema-validation.test.ts` harness.



### 9. Per-keyword target URL, tags, notes, and cannibalization detection — [#207](https://github.com/every-app/open-seo/issues/207)

`rankTrackingKeywords` records no intent, so the tracker knows which page actually ranks but never
which page was supposed to. Adding intent turns the tracker from descriptive to diagnostic using
data already in `rank_snapshots`.

- [ ] Nullable `targetUrl`, `tag`, and `note` columns added to `rankTrackingKeywords` in both
  ```
  `src/db/app.schema.ts` and `src/db/pg/app.schema.ts`, with matching SQLite and Postgres
  migrations.
  ```
- [ ] Existing rows and existing flows are unaffected when the columns are null.
- [ ] The keyword table lets a user set and clear all three, individually and for a selection.
- [ ] When a snapshot's ranking URL differs from `targetUrl`, the row surfaces a "ranking with a
  ```
  different page" signal showing both URLs.
  ```
- [ ] URL comparison normalizes scheme, trailing slash, and `www` before deciding they differ.
- [ ] Keywords can be filtered by tag, and aggregates can exclude a tag (branded terms skew
  ```
  averages).
  ```
- [ ] The three fields are included in CSV and Sheets exports.
- [ ] Tests cover the differ/match decision including the normalization edge cases.



### 10. Extract competitor positions from the SERP response already being paid for — *(no issue)*

A rank check receives the full ranked list from DataForSEO and discards everything except the
tracked domain. Storing positions for a few declared competitor domains from the same response
gives competitor rank trends at zero additional API cost and zero additional credits — a strong
answer to the cost objection in #210.

- [ ] A rank tracking config accepts a small set of competitor domains (suggest a cap of five).
- [ ] `RankCheckWorkflow` extracts competitor positions from the existing SERP response with no
  ```
  additional request.
  ```
- [ ] Competitor snapshots are stored alongside the tracked domain's snapshot for the same run.
- [ ] Credit estimates and charges are unchanged when competitors are configured.
- [ ] The keyword trend view can overlay competitor positions.
- [ ] Competitor columns appear in rank tracking exports.
- [ ] Tests assert that adding competitors issues no extra provider call.



### 11. Add striking-distance / opportunity keywords straight to the rank tracker — [#206](https://github.com/every-app/open-seo/issues/206)

Search Performance surfaces striking-distance queries and `get_search_opportunities` scores them
against GA4, but there is no `addTrackingKeywords` reference anywhere under
`src/client/features/search-performance/`. Users retype by hand, so in practice they skip it and
never verify whether a fix landed.

- [ ] Rows in the striking-distance table are selectable.
- [ ] An "Add to rank tracker" action targets an existing config via the existing picker.
- [ ] When the project has no config, the same flow offers "create a tracker for `<domain>` and add
  ```
  these" in one step.
  ```
- [ ] The confirm step shows the credit cost from `estimateRankCheckCost` before committing.
- [ ] Existing `addTrackingKeywords` behaviour is reused: dedupe, `MAX_KEYWORDS_PER_CONFIG`,
  ```
  first-check trigger, metrics refresh.
  ```
- [ ] Already-tracked queries show a "tracked" marker and are excluded from the add.
- [ ] Tests cover the no-tracker path and the dedupe path.



### 12. Surface Discover and News in Search Performance — [#205](https://github.com/every-app/open-seo/issues/205)

`GSC_SEARCH_TYPES` in `src/server/features/gsc/searchAnalytics.ts` already includes `discover` and
`googleNews`, and `get_search_console_performance` exposes `type`. An agent can read a publisher's
Discover data today; a human in the dashboard cannot. Not a plain dropdown — Discover has no
`query` dimension and returns no `position`.

- [ ] `searchType` added to `searchPerformanceFilterShape`, defaulting to `web`.
- [ ] `web` behaviour is byte-for-byte unchanged.
- [ ] For `discover` / `googleNews` the dimension list is page + country + date; the query table is
  ```
  hidden.
  ```
- [ ] Striking distance is hidden for position-less search types rather than rendering zeros.
- [ ] Overview tiles drop average position for those types and keep clicks, impressions, CTR.
- [ ] `sumSearchTotals` does not emit an impression-weighted average position of 0.
- [ ] Exports carry the selected search type and its applicable columns only.
- [ ] The page's dimension list and scorecards are a function of search type, not constants.



### 13. IndexNow: key management, submission, ledger, deploy hook, MCP tool — [#231](https://github.com/every-app/open-seo/issues/231), [#101](https://github.com/every-app/open-seo/issues/101)

Roadmap "Highest Priority"; proof of concept in PR #197. Free, no credits, and directly relevant to
this project because Bing's index feeds Copilot and ChatGPT search — the engines Prompt Explorer
measures.

- [ ] A project stores an IndexNow host, key, and key-file URL.
- [ ] A verify action fetches the key file and reports plainly whether it serves the key, so a bad
  ```
  setup fails at setup time.
  ```
- [ ] URLs can be submitted in batches from an Indexing page, with retry on rate limiting.
- [ ] A ledger records URL, status, HTTP response, attempt count, and timestamp, and answers "did
  ```
  Bing accept this page?" without leaving OpenSEO.
  ```
- [ ] A deploy webhook accepts changed URLs without a browser session, authenticated by a shared
  ```
  secret and constrained by a host allowlist.
  ```
- [ ] Repeated deploys do not resubmit unchanged URLs.
- [ ] `submit_urls_indexnow(projectId, urls[])` exposes the same capability to the agent.
- [ ] Submissions consume no DataForSEO credits.
- [ ] Out of scope: OpenSEO detecting changed URLs on its own. URLs come from the user, the agent,
  ```
  or the hook payload, falling back to sitemap discovery.
  ```

---



## P3 — Self-host cost and privacy



### 14. Pluggable SERP provider for rank checking only — [#210](https://github.com/every-app/open-seo/issues/210)

`src/server/lib/dataforseo/serp.ts` is reached directly from the rank-check path, so there is no
seam. Cost is the main thing stopping self-hosters from tracking as often as they want. Keep the
interface to one operation — everything else DataForSEO returns has no scraper equivalent and an
abstraction covering it would be mostly holes.

- [ ] A single-method provider interface: keyword + location + language + device returns ranked
  ```
  URLs with positions.
  ```
- [ ] DataForSEO is the default implementation and the default path is behaviourally unchanged.
- [ ] `SERP_PROVIDER=dataforseo|custom` and `SERP_PROVIDER_URL` configure the opt-in path.
- [ ] Keyword metrics, backlinks, domain overview, and local SERP remain DataForSEO-only.
- [ ] With a custom provider, `estimateRankCheckCredits` reports zero and the paid-plan gate does
  ```
  not apply.
  ```
- [ ] Custom provider responses are validated with Zod at the boundary and a malformed response
  ```
  fails the run with a clear error rather than recording phantom positions.
  ```
- [ ] The custom endpoint URL is subject to the same SSRF policy as the crawler
  ```
  (`src/server/lib/audit/url-policy.ts`).
  ```
- [ ] Documented in the self-hosting docs with a worked example of the expected response shape.



### 15. Optional additional data providers — [#219](https://github.com/every-app/open-seo/issues/219), [#224](https://github.com/every-app/open-seo/issues/224)

Both ask for provider choice; #224 is GoAnyAPI offering integration support. Blocked on item 14 —
once the seam exists these become configuration rather than integrations.

- [ ] Depends on the interface from #210 being merged.
- [ ] A provider is added only for operations the interface covers; no per-vendor branch in feature
  ```
  code.
  ```
- [ ] Credit accounting reflects the selected provider.
- [ ] Vendor-supplied test credentials are used for verification but never committed.



### 16. Local / OpenAI-compatible chat model for self-hosters — [#102](https://github.com/every-app/open-seo/issues/102)

`buildChatAgentModel` in `src/server/lib/openrouter.ts` calls `createOpenRouter` against a fixed
endpoint. For a self-hoster running on their own hardware to keep client data in-house, the chat
agent is the one place data still leaves the box — prompts carry domains, keywords, and
GSC-derived context.

- [ ] A `CHAT_BASE_URL` env var points the chat agent at any OpenAI-compatible endpoint.
- [ ] When set, OpenRouter-specific request options are dropped: `usage: { include: true }`, the
  ```
  `provider` routing block, and the OpenRouter reasoning channel.
  ```
- [ ] OpenRouter usage-cost metering is skipped on that path and the `agent` credit charge reflects
  ```
  it.
  ```
- [ ] Unset `CHAT_BASE_URL` leaves hosted behaviour identical.
- [ ] Docs state that SAM is tool-calling, so a local model needs OpenAI-style function calling
  ```
  (for vLLM, launching with tool-call support enabled).
  ```
- [ ] Documented in `docs/SELF_HOSTING_DOCKER.md` with a vLLM and an Ollama example.



### 17. Multiple users per instance — [#87](https://github.com/every-app/open-seo/issues/87)

Roadmap "Highest Priority" as "Add teammates to an account." The schema already exists — Better
Auth's organization plugin gives `organization`, `member`, and `invitation` tables today. The gap is
exposure and role enforcement, not modeling.

- [ ] Additional users can be invited to an existing workspace and sign in with their own
  ```
  credentials.
  ```
- [ ] Owner and member roles are distinguished and enforced server-side, not only in the UI.
- [ ] Works under Docker self-hosting, which is where the request originates.
- [ ] Project and billing scoping respect membership.
- [ ] Existing single-user installs migrate without manual intervention.

---



## P4 — Audit differentiators



### 18. Treat SQLite rank-tracking timestamps as UTC — [#94](https://github.com/every-app/open-seo/issues/94)

SQLite `current_timestamp` emits `YYYY-MM-DD HH:mm:ss` with no timezone marker, so browsers parse it
as local time. Postgres is unaffected, which makes it easy to miss. The fix pattern already exists
in `src/client/features/dashboard/cardParts.tsx::formatDay` and needs extracting.

- [ ] One shared parser treats the SQLite shape as UTC and leaves ISO timestamps intact.
- [ ] SQLite and Postgres timestamps resolve to the same UTC instant.
- [ ] Chart points and date labels do not shift with browser timezone in
  ```
  `RankTrackingDetailHeader.tsx`, `RankTrackingDomainList.tsx`, `KeywordTrendModal.tsx`,
  `RankTrackingOverview.tsx`, and `RankTrackingHistoryMatrix.tsx`.
  ```
- [ ] Invalid timestamps degrade safely rather than throwing during render.
- [ ] Exports use the same parser.
- [ ] Tests cover both forms including a value near UTC midnight under a non-UTC `TZ`.
- [ ] Storage and scheduling formats are unchanged.



### 19. Query-parameter handling in the site-audit crawler — [#154](https://github.com/every-app/open-seo/issues/154)

`normalizeUrl` in `src/server/lib/audit/url-utils.ts` strips the fragment and sorts query params but
never drops one, and `shouldQueueCrawlLink` in `src/server/workflows/siteAuditWorkflowCrawl.ts`
filters only on origin, SSRF policy, robots, and the visited/queued sets. Tracking parameters are
never disallowed by robots.txt, so `?utm_source=` variants become distinct pages.

- [ ] Known tracking parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`) are stripped before the
  ```
  dedup key is computed.
  ```
- [ ] Stripping affects the dedup key and crawl budget, not the URL reported to the user.
- [ ] Duplicate-content and duplicate-title findings no longer fire on parameter-only variants.
- [ ] Parameter sprawl is reportable as its own finding rather than as false duplicates.
- [ ] Robots.txt handling via `robots-parser` is unchanged.
- [ ] `badseo/` gains a fixture covering parameter variants and the audit E2E asserts on it.



### 20. AEO / agent-readiness checks in the site audit — [#99](https://github.com/every-app/open-seo/issues/99)

Roadmap "Soon." All 30 current issue codes in `src/shared/audit-issues.ts` are classic on-page SEO;
nothing asks whether the site is readable by an agent. Each check is a cheap HTTP fetch on plumbing
the crawler already has, and costs no credits.

- [ ] robots.txt is parsed against the known AI user agents (GPTBot, OAI-SearchBot, ChatGPT-User,
  ```
  ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot,
  Meta-ExternalAgent, Amazonbot, Bytespider) and reports which are blocked.
  ```
- [ ] The report distinguishes training, search-grounding, and user-browse purposes, so blocking
  ```
  Google-Extended while wanting AI Overview visibility is called out as a distinct finding.
  ```
- [ ] `llms.txt` presence plus structural validation per llmstxt.org: H1 title, blockquote summary,
  ```
  `##` sections with markdown links.
  ```
- [ ] Markdown alternates detected via `<link rel="alternate" type="text/markdown">`, per-page `.md`
  ```
  URLs, or `Accept: text/markdown` content negotiation.
  ```
- [ ] JSON-LD graph quality: flat isolated blocks flagged against a linked `@graph` with resolvable
  ```
  `@id` references, plus trust properties (`publishingPrinciples`, `copyrightHolder`,
  `knowsAbout`, `SearchAction`).
  ```
- [ ] New issue codes registered in `src/shared/audit-issues.ts` with severities and fix copy.
- [ ] No DataForSEO credits consumed by any of these checks.
- [ ] `badseo/` fixtures cover each new check.



### 21. Generate `llms.txt`, not just check for it — *(no issue; extends #99)*

The crawl already knows every page, its title, and its position in the link graph — exactly the
input an `llms.txt` needs.

- [ ] A completed audit can produce a draft `llms.txt` from crawled pages.
- [ ] Output validates against the same structural checks added in item 20.
- [ ] Sections are derived from site structure and are editable before download.
- [ ] Available as a download and through the agent.



### 22. Audit diffs and scheduled audits — *(no issue)*

`audits`, `audit_pages`, and `audit_issues` store every run and cron already fires every five
minutes, but there is no "what regressed since last time" view. Regression detection is the reason
people schedule audits, and both halves exist.

- [ ] An audit can be scheduled on a recurring interval per project.
- [ ] A completed run can be compared against the previous run for the same project.
- [ ] The diff reports issues introduced, issues resolved, and pages added or removed.
- [ ] Credit cost of the schedule is shown before it is enabled.
- [ ] Scheduled runs reuse the existing `SiteAuditWorkflow` and the stale-audit reconciler.
- [ ] The diff is readable through the agent as well as the UI.



### 23. Internal linking recommendations from the crawl graph — *(no issue)*

The crawler already builds enough of a link graph to detect orphan pages and broken internal links.
Joining that graph with GSC query data yields "this page ranks for X, and these three pages mention
X without linking to it" — derived, no credits.

- [ ] Recommendations are computed from the existing crawl link graph plus GSC query data.
- [ ] Each recommendation names the source page, the target page, and the anchor rationale.
- [ ] Existing links are excluded so nothing already linked is recommended.
- [ ] No DataForSEO credits consumed.
- [ ] Exposed as an audit view and readable by the agent.

---



## P5 — Product surface for work already built



### 24. Geo-grid local rank tracking UI — [#60](https://github.com/every-app/open-seo/issues/60)

Roadmap "Soon," and the MCP tool `get_local_rank_grid` already exists. The data path is built; there
is no page. There is no credible open-source option for this and local agencies pay for it.

- [ ] A project can define a business, a keyword set, a grid centre, and a grid size or radius.
- [ ] The grid renders positions per point on a map.
- [ ] Runs reuse the existing `get_local_rank_grid` data path.
- [ ] Credit cost is estimated and shown before a run.
- [ ] Grid runs are stored so they can be compared over time.
- [ ] Results are exportable.



### 25. Client-facing shareable read-only reports — [#209](https://github.com/every-app/open-seo/issues/209)

Roadmap "Soon." Everything a client report needs is in the database and all of it is behind
org-scoped login. Server-side PDF is rejected deliberately: Puppeteer does not run on workerd, so it
would mean a second runtime and a queue for a format the browser's print dialog already produces.

- [ ] A `reportShares` row: `{ id, projectId, token, sections, createdAt, expiresAt, revokedAt }`.
- [ ] An unauthenticated `/r/$token` route renders a report composed from existing repositories, no
  ```
  new data collection.
  ```
- [ ] The owner selects which sections appear (audit / rank / GSC / GA4) at share time.
- [ ] The token resolves to the fixed section set captured at share time, so later data additions
  ```
  cannot silently widen exposure.
  ```
- [ ] Tokens are long and random, expire by default rather than opt-in, and are revocable from the
  ```
  project.
  ```
- [ ] The route is `noindex`.
- [ ] Only project-scoped queries are reachable from the token; no org-wide data.
- [ ] A print stylesheet makes `Cmd-P → Save as PDF` produce a clean document.
- [ ] Decision recorded on snapshot vs live rendering.



### 26. Bing Webmaster Tools integration — [#150](https://github.com/every-app/open-seo/issues/150), [#232](https://github.com/every-app/open-seo/issues/232)

Roadmap "Soon"; working fork and proof of concept in PR #197. Bing gets its own page rather than a
source toggle, because its API has no date-range parameter, no device or country dimension, and no
paging — the asymmetry with GSC is permanent, not something Bing grows out of.

- [ ] OAuth connect for hosted, plus a pasted Bing Webmaster API key for self-hosters, mirroring the
  ```
  Search Console split.
  ```
- [ ] A `bing_connections` table mirroring `gsc_connections`, with SQLite and Postgres migrations.
- [ ] Per-project site mapping selected from project settings.
- [ ] A Bing page showing daily clicks and impressions, plus Bing crawl issues for the site.
- [ ] A read-only `get_bing_performance` MCP tool, project-scoped like the Search Console tools, so
  ```
  "compare how this page does on Google and Bing" works in chat.
  ```
- [ ] Reads are unmetered, matching the GSC treatment.
- [ ] Layered client → repository → service → server function → MCP tool per `CLAUDE.md`.
- [ ] Out of scope: submitting or managing anything through Bing. URL submission belongs to
  ```
  IndexNow (item 13).
  ```



### 27. Rank change alerts by webhook, then email — [#208](https://github.com/every-app/open-seo/issues/208)

Checks run, results are stored, trends are computed, and nothing tells anyone. The only
webhook/notification code in `src/server/` is billing (`autumn-webhook.ts`, `svix.ts`).

- [ ] Opt-in per rank-tracking config, evaluated when a scheduled run completes and both current and
  ```
  previous snapshots are known.
  ```
- [ ] Events: entered/left top 3, entered/left top 10, dropped more than N positions (configurable,
  ```
  default 5), and lost ranking entirely (outside `serpDepth`).
  ```
- [ ] Webhook delivery first: one POST with a small JSON payload, composable with Slack, Discord,
  ```
  n8n, or a self-hoster's script.
  ```
- [ ] One digest notification per completed run, not one per keyword.
- [ ] The user-supplied webhook URL is validated against the crawler's SSRF policy
  ```
  (`src/server/lib/audit/url-policy.ts` `BLOCKED_HOSTS`), not a reinvented check.
  ```
- [ ] Delivery failures are retried with backoff and a persistently dead endpoint is disabled with a
  ```
  visible reason.
  ```
- [ ] Email second, gated on `LOOPS_API_KEY` so hosted has a path and self-hosters are not forced
  ```
  into SMTP config.
  ```
- [ ] Decision recorded on config JSON column vs separate table.

---



## P6 — UX bugs



### 28. Site audit tabs unresponsive while the Export menu is open — [#223](https://github.com/every-app/open-seo/issues/223)

daisyUI 5.5.5 focus dropdown next to the tab list in
`src/client/features/audit/results/ResultsTables.tsx`. The same markup in isolation does not
reproduce, so the cause is specific to the audit page.

- [ ] Clicking a tab while the Export menu is open switches the tab and dismisses the menu in one
  ```
  click.
  ```
- [ ] Issues, Pages, and Performance tabs all behave the same.
- [ ] Keyboard dismissal and focus order still work.



### 29. Cannot stop a long chat generation — [#200](https://github.com/every-app/open-seo/issues/200)

Reported alongside responses exceeding 30 seconds where a page reload revealed the answer had
completed.

- [ ] A visible stop control cancels an in-flight generation.
- [ ] Cancelling aborts the upstream request rather than only hiding the UI.
- [ ] Partial output remains visible and the session stays usable.
- [ ] A cancelled turn's billing reflects only tokens actually consumed.
- [ ] Long-running generations stream progress instead of appearing hung.



### 30. Sam writes a strategy for sites it could not read — [#228](https://github.com/every-app/open-seo/issues/228)

The onboarding read strips tags from raw HTML. On a JS-rendered site there is almost nothing there —
excalidraw.com yields 32 characters — and that counts as success, because a page is only dropped at
zero characters and the read is only marked blocked when every page is empty. The "keep the advice
high-level" note never fires. Note the roadmap lists JS rendering as not planned for *site audit*;
this is the onboarding/SAM read, a different path.

- [ ] A read returning less than a meaningful content threshold is treated as a failure, not a
  ```
  success, regardless of whether rendering is added.
  ```
- [ ] On a failed read, Sam asks the user to describe the site instead of producing a Positioning /
  ```
  Themes / Target keywords table.
  ```
- [ ] The "Read site" badge does not flip on a failed read.
- [ ] Optionally, a rendering service sits behind the existing interface with the current fetch path
  ```
  as fallback (proof of concept in PR #145).
  ```
- [ ] Verified against excalidraw.com and one other SPA marketing site.
- [ ] Server-rendered sites behave exactly as today.

---



## P7 — Scoped enhancements



### 31. Billing usage by project — [#217](https://github.com/every-app/open-seo/issues/217)

- [ ] A "Usage by project" section on the Billing page covering the last 30 days.
- [ ] Each project shows total usage and expands to the features that generated it.
- [ ] Archived projects remain visible when they have usage in the period.
- [ ] Usage that cannot be attributed to a project appears as workspace usage.
- [ ] Follows the existing billing page layout.



### 32. Page-path and metric filters on GSC Insights — [#68](https://github.com/every-app/open-seo/issues/68) *(good first issue, status:ready)*

Spans `SearchPerformancePage.tsx`, `src/types/schemas/search-performance.ts`, and
`src/serverFunctions/searchPerformance.ts`.

- [ ] Users can filter by a path prefix or documented wildcard form such as `/blogs/*`.
- [ ] Users can set min/max ranges for impressions, clicks, and average position.
- [ ] Metric thresholds are applied before pagination and export, not only to the visible page.
- [ ] Table, pagination, sorting, and export use the same effective filters.
- [ ] Overview-card behaviour is consistent, or any exception is stated in the UI.
- [ ] Tests cover filter translation, validation, and empty results.



### 33. Paginated domain keyword discovery on the rank tracking page — [#50](https://github.com/every-app/open-seo/issues/50) *(status:ready)*

Domain Overview already has a paginated ranked-keywords endpoint
(`src/server/features/domain/services/domainKeywordsPage.ts`); the rank tracking detail page only
has a manual textarea in `AddKeywordsPanel.tsx`, and `KeywordSuggestionStep.tsx` uses the
non-paginated top-100 `getSuggestedKeywords`.

- [ ] A "Find domain keywords" action on the rank tracking domain detail page.
- [ ] Results are paginated with the same sorting and filtering as Domain Overview.
- [ ] Users select which keywords to track from the paginated list.
- [ ] Selection flows into the existing add path with dedupe and limit enforcement.
- [ ] Credit cost is shown before fetching.
- [ ] The non-paginated suggestion flow is retired where it is the wrong fit.



### 34. Per-keyword rank tracking intervals — [#37](https://github.com/every-app/open-seo/issues/37) *(status:spec-first)*

`scheduleInterval` and `nextCheckAt` live on `rankTrackingConfigs`; subset checks via `keywordIds`
already exist in `RankTrackingService` and `RankCheckWorkflow`.

- [ ] Spec written first, per the issue label.
- [ ] Config interval remains the default; per-keyword overrides are optional (inherit, daily,
  ```
  weekly, manual/paused).
  ```
- [ ] Existing trackers behave identically when no override is set.
- [ ] Overrides can be set and reset individually and for a selection.
- [ ] Scheduled checks only run keywords due under their effective interval.
- [ ] The UI shows each keyword's effective interval and next scheduled check.
- [ ] Tests cover inherited intervals, overrides, due-keyword selection, and subset runs.



### 35. Multi-select country in keyword research — [#149](https://github.com/every-app/open-seo/issues/149)

- [ ] Multiple countries can be selected for one keyword research query.
- [ ] Results are comparable across the selected markets.
- [ ] Credit cost scales visibly with the number of markets and is shown before running.
- [ ] The selected market set persists between sessions.
- [ ] Existing single-country behaviour is the default.



### 36. Multi-select keyword research types and autocomplete ideas — [#32](https://github.com/every-app/open-seo/issues/32) *(status:spec-first)*

- [ ] Spec written first, per the issue label.
- [ ] Multiple research types can be selected in one query.
- [ ] Autocomplete-sourced ideas are included as a selectable type.
- [ ] Results indicate which type produced each keyword.
- [ ] Credit cost reflects the selected types and is shown before running.



### 37. Include rank check date in Rank Tracking exports — [#70](https://github.com/every-app/open-seo/issues/70) *(good first issue, status:ready)*

The timestamp already exists: `rankTrackingResults.ts` returns it and
`RankTrackingDomainDetail.tsx` already receives `lastCheckedAt`. Only the export path in
`RankTrackingTableParts.tsx` needs to carry it. Should use the shared UTC parser from item 18.

- [ ] Full-table and selected-row CSV exports include a `Last checked at` column.
- [ ] Sheets exports include the same field and value.
- [ ] The format is machine-sortable in common spreadsheet tools.
- [ ] Existing export columns and filtered-row behaviour are unchanged.



### 38. Cited pages tab in Prompt Explorer — [#66](https://github.com/every-app/open-seo/issues/66) *(status:ready)*

`promptExplorer.ts` already extracts and deduplicates citation URL, domain, title, and brand match
per model, and `src/types/schemas/ai-search.ts` already exposes it. No provider or schema change
needed.

- [ ] `Responses` and `Cited pages` tabs appear after a search.
- [ ] Citations are aggregated client-side by URL across models.
- [ ] Each row shows source, citing models, brand match, and citation count.
- [ ] Brand matches are preserved; empty and partial citation states are explicit.
- [ ] The existing response comparison remains available.
- [ ] Reuses Brand Lookup citation-table patterns where practical.
- [ ] Tests cover URL dedupe, multi-model attribution, and brand-match preservation.



### 39. Support Macao (2446) as a Google Ads-only keyword market — [#90](https://github.com/every-app/open-seo/issues/90)

- [ ] Macao (location code 2446) is selectable in keyword research.
- [ ] Requests route to the Google Ads keyword path per
  ```
  `specs/0004-keyword-data-source-routing.md`, since Labs does not cover it.
  ```
- [ ] The UI communicates which metrics are unavailable for Google Ads-only markets.
- [ ] A test covers the routing decision for this market.

---



## Sequencing rationale

Items 1–7 first: a self-hoster who cannot log in never sees any feature, and a leaked API key or a
deleted production domain is not recoverable by the user.

Items 8–9 next because they are small, use data that already exists, and make the product visibly
smarter — 8 is thin wrappers over tested services, 9 is three nullable columns and a comparison.

Items 11–13 are the first time the tool completes a full find → fix → announce → verify cycle, which
is the difference between a dashboard and an agent.

Item 14 before 15 because the pluggable SERP seam is what makes the self-host cost story credible
and turns two vendor requests into configuration.

The through-line for anything added later: this project's edge is that it is agent-native and holds
GSC, GA4, rank, crawl, and AI-visibility data in one place. Features that exploit joins across those
datasets — cannibalization, opportunity-to-tracker, AEO audit, competitor extraction from SERP calls
already paid for — are things the incumbents structurally cannot do. Features that add another data
source are ones they already do better.