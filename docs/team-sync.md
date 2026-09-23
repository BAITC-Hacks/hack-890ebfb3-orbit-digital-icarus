# Integration observations

## Latest inspected teammate updates, 23 September 2026

- `main` at `8cae379`: bbl's shared backend scaffold and models, incorporated into Enjoy at `0d07a0b`. Matching placeholders were resolved in favor of Enjoy's tested implementation after inspecting each conflict. Backend model objects match the structural matching interfaces. Production catalog loading, filtering and API routes are still placeholders at this source revision.
- `bbl` at `f7f02af`: no subsequent code on that remote branch yet. The scaffold reached `main` instead.
- `feature/sp3ctra` at `e3eb854`: five-screen `design.pdf`. All five pages were visually reviewed. No React package or implementation was present at this revision.
- Enjoy has pushed the matching core, source evidence, typed client, test harness and documentation in separate commits. Consult the current Git history for subsequent updates; these observations are a timestamped handoff, not a live status feed.

## Design-to-data adjustments for spectra

The five screens provide useful layouts for the form, full result, short result and two empty outcomes. Implement the presentation using API data, with these contract details:

1. **Language is one optional value.** The design shows several checkboxes, but v1 request `language` is `string | null`. Use a single select or single-choice chips/radio group with an unselected option. Supporting several requested languages would need an explicit contract and filtering change.
2. **Use counts from the city/category pool.** There are 15 hosts globally but 10 in Алматы; 8 banquet halls globally but 7 in Алматы; 3 florists globally but only 1 in Астана. The example headings in the PDF use global counts as city counts. Read `counts.city_category_total` and `exclusions` from the API.
3. **Display actual returned profiles.** The PDF's sample contractor names and amounts are illustrative. Real demo data is the bundled CSV; do not hardcode the mock names, the 450,000 ₸ host scenario, or a guaranteed three-card result.
4. **Show price uncertainty.** Keep `от`, retain `price_imputed` and `city_imputed` notes, and show supplied synthetic profiles clearly. Starting-price headroom is not a guaranteed final saving. Say that the final price needs confirmation.
5. **Dates may change the result.** Availability changes explain our verified demo pair, but different dates can also produce the same shortlist. Avoid promising a different result for every date change.
6. **Use first-failure counts honestly.** If the API says every candidate failed availability first, do not infer that budget and format would otherwise pass. Only show season percentages if calculated or clearly attributed as source-wide context, rather than as measured results for that request.
7. **Keep outcome logic driven by the response.** Full and short results both use `matches_found`. `category_absent` and `no_eligible_contractors` are separate business outcomes; network failures have a separate error view.
8. **Canonical values can have polished labels.** A visible `Свадьба` label can send the value `свадьба`. Form values must match metadata. The browser test now selects option values, so capitalization of visible labels does not break it.

See [browser contract](browser-contract.md) for test hooks and [matching integration](integration.md) for backend calls. Interface changes should update clients, fixtures and checks in the same increment.

## Cloud check availability

GitHub Actions for Enjoy commit `5530d44` failed before any test step ran. The check annotation states: `The job was not started because your account is locked due to a billing issue.` This is an account-level execution blocker. Local test results are documented separately; no successful GitHub run is claimed. The account owner must resolve the billing lock before cloud checks can execute.
