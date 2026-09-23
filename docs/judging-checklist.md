# Judging evidence and release gates

This maps the organizer's technical requirements and 100-point rubric to the integrated application. It records evidence and limitations; the jury awards the score. Follow the [README](../README.md) for one-click/one-command setup, the [launcher verification](launcher-verification.md) for the latest fresh-clone results (152 Python tests, 265 subtests, 13 real E2E flows), and the [release review](release-review.md) for the separate Demo Day rubric. Older numeric results below are explicitly historical measurements of the named revisions, not the latest run.

## Five judging criteria

| Criterion | Points | Implemented evidence | How to demonstrate or reproduce |
| --- | ---: | --- | --- |
| Compliance with the task and functionality | 25 | Required five inputs and optional language/duration; hard constraints; up to three grounded cards; venues use the same calendar; short results and both empty outcomes | Run the six requirement checks below, eight real-browser acceptance tests and the independent HTTP checker |
| Technical implementation | 25 | Validated bundled catalog; separate filtering/ranking/explanation layers; typed API and client; deterministic order and content-derived evidence version; startup rejects stale evidence; bounded, optional offline AI proposals | Explain `validation → city/category pool → hard filters → ranking → grounded cards`; inspect evidence; run Python/client/localization/browser suites and production build |
| README and reproducibility | 25 | One-click Windows launcher / one Python command; explicit one-time prerequisites; locked dependencies; bundled dataset; current screenshots; nontechnical verification steps, limitations and measurements | [Fresh local Git clone at `6ee3714`](launcher-verification.md) automatically installed/built and passed 152 Python tests, 13 production-browser flows and 160 HTTP requests without provider credentials; [earlier GitHub clone](reproducibility.md) is retained as historical evidence |
| Value and applicability | 15 | Reduces a long city catalog to a small inspectable shortlist; explains exclusions; retains starting-price and calendar uncertainty; Russian and English interfaces preserve original source evidence | Compare repeat/date-change results, inspect a profile-specific reason, and show the one-florist case and actionable empty result |
| Development potential and originality | 10 | Versioned extractive evidence with semantic review; exact-quote validation; reviewed bilingual evidence; cached and capped offline proposals; deterministic results can be audited | Show the evidence artifact and proposal review boundary. Future work: fresh availability, confirmed quotations, a reviewed ingestion workflow and ranking evaluation on larger catalogs |

AI is used during development and in an optional offline proposal tool. Production matching makes no model calls. One paid OpenAI workflow check used 501 tokens; a source-exact but unsuitable statistic was rejected during agent review and not promoted. This demonstrates why structural checks and semantic review have different responsibilities. See [offline evidence workflow](offline-evidence.md).

## All six task requirements

| Requirement | Concrete evidence | Check |
| --- | --- | --- |
| 1. City, date, event type, category and budget; optional duration/language | Metadata-driven form; canonical request values; API validation; optional inputs remain null when blank | Client and request-normalization tests; real-browser optional-filter scenario |
| 2. At most three cards with name, category, city, price and 1–2 factual sentences | Deterministic top three; structured fit facts plus an attributed exact source quote or fallback; evidence expander | Dense host result and hidden-name audit in [demo](demo.md); ranking and explanation tests |
| 3. Booked contractors and venues excluded | Availability is a hard filter, repeated at ranking/card construction boundaries | Host date pair and Astana venue date pair; HTTP and browser acceptance |
| 4. Return fewer when fewer qualify and explain why | Eligible count, returned count and mutually exclusive first-failure exclusions; no padding or silently relaxed constraints | Almaty florist returns only `HK-39372`; December host request returns only `HK-44923` |
| 5. Same request gives the same card order | Score descending, price ascending, ID ascending; fixed dataset/evidence versions; no random or clock-dependent ranking | Repeated requests, shuffled-source unit tests, 160 independent domain runs and 160 actual HTTP runs |
| 6. Three clearly distinct outcomes | `matches_found`, `category_absent`, `no_eligible_contractors`; transport failures have a separate error state | Astana decorator absent vs Astana florist booked on 2026-10-11; browser retry check |

## Live Definition of Done

- **Response target under ten seconds:** 160 real local HTTP requests had p95 21.521 ms and maximum 53.115 ms; 20 browser submit-to-visible results had p95 65.88 ms and maximum 90.76 ms. Browser numbers include automation overhead. These are local measurements, not production load or internet latency claims.
- **Distinct explanations with hidden names:** the dense host shortlist cites different profile-specific experience alongside differing structured price facts. Source quotes are inspectable. Sparse descriptions can limit distinction in other pools; generic praise is not invented to fill the gap.
- **Repeatable ordering:** the dense 2026-10-11 request returns `HK-42352 → HK-44923 → HK-27222` every time for the recorded versions.
- **Date-sensitive results explained by availability:** changing only the date to 2026-10-10 returns `HK-27222 → HK-77838 → HK-72938`; the first two profiles from the other date are booked. Each card names the requested available date and the summary reports exclusions.
- **Busy, rare and empty requests:** all have frozen inputs and expected IDs/counts in the demo. The venue pair provides an additional calendar check.
- **Empty results in words:** both business empty states render readable explanations; API failure is never turned into a false empty result.
- **Explain the pipeline:** the README includes a diagram, repository map, exact scoring formula, provenance and actual AI role.

## Verification record and limits

Final integrated checks at `190696c`: **91 Python tests and 218 subtests**, **49 client tests**, **16 localization tests**, strict client TypeScript, production frontend build, **six isolated browser UI checks** with explicitly mocked responses, and **eight browser acceptance flows against the actual API**. The isolated suite is not backend evidence. Tests and measurements require no paid API calls.

The dataset contains 66 organizer-supplied profiles, including 13 supplied synthetic profiles, 8 imputed cities and 18 imputed prices. Flags are shown; the team has not added demo profiles to the catalog. Availability is only a snapshot from 2026-09-23 through 2026-12-31. Prices are starting prices; the app makes recommendations and does not confirm bookings.

Recorded runtime: Windows 11, Python 3.12.10, Node 26.7.0, npm 11.19.0, Chromium 153.0.8010.12. CSV SHA-256: `6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d`. Algorithm: `explainable-v1:2553919e464d7030`.

## Release gates

- [x] Real API/UI integration, Russian/English switching, source evidence, short and empty outcomes implemented.
- [x] Local automated suites, production build, built-preview/API proxy and measured response target checked.
- [x] Source data and locked dependencies bundled; provider keys remain outside Git.
- [x] Final integrated clean-clone installation and regression [completed and recorded](reproducibility.md) at `1292b65`.
- [ ] Cloud workflow green after the organizer's GitHub billing lock is resolved. The [inspected run](https://github.com/BAITC-Hacks/hack-890ebfb3-orbit-digital-icarus/actions/runs/35842404798) ran zero test steps, so the workflow is manual-only until then.
- [x] BBL, Enjoy, spectra and the concurrent main update are combined; the current release review records integrated regression checks.
- [ ] Rehearse the live demo and submit the repository/demo links through the tournament portal before its actual deadline.

A hosted deployment is optional future work for this local deliverable. No public deployment, confirmed booking, independently verified contractor claims or guaranteed judging score is claimed.
