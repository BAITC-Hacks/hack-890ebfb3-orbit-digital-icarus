# Reproducible demo and explanation audit

Open the root URL for the home page, then click **Начать подбор / Start matching** or a category. The form's direct link is `/#/match`. Categories only prefill; search is explicit. Each returned card has an honest inquiry draft that can be copied but is never sent. The dataset has no verified contact directory. See the [three-minute pitch and Q&A](release-review.md) for the separate Demo Day rubric. The inputs below remain authoritative; historical timing/count records identify older revisions.

These scenarios are verified against the bundled 66-profile CSV, the integrated production API and the React interface. The current suite has 13 real-application browser tests and 13 isolated UI tests. Follow the [root setup](../README.md#run-from-a-fresh-checkout) and keep both services running. Leave `VITE_API_MODE` unset so the interface uses the real API.

From the repository root:

```bash
python scripts/matching_acceptance.py --repeat 20
python scripts/matching_acceptance.py --repeat 20 --json
```

The first command prints ordered IDs, explanations, versions, counts and timings. The second includes full card/evidence payloads. The reference adapter in this tool applies the agreed hard filters; it is independent acceptance tooling rather than the production HTTP service.

## Frozen scenarios

All requests use event format **`свадьба`**. Optional `duration_hours` and `language` are null unless stated. Budgets are integer KZT for one contractor's service. The table records **ordered returned IDs**, not just eligible sets.

| Scenario | City | Category | Date | Budget | Pool / eligible / returned | Outcome and returned order |
| --- | --- | --- | --- | ---: | --- | --- |
| Dense autumn | Алматы | Ведущий | 2026-10-11 | 3,000,000 | 10 / 5 / 3 | `matches_found`: HK-42352 → HK-44923 → HK-27222 |
| Change only date | Алматы | Ведущий | 2026-10-10 | 3,000,000 | 10 / 3 / 3 | `matches_found`: HK-27222 → HK-77838 → HK-72938 |
| Rare florist | Алматы | Флорист | 2026-10-10 | 300,000 | 2 / 1 / 1 | `matches_found`: HK-39372 |
| Absent category | Астана | Декоратор | 2026-10-10 | 3,000,000 | 0 / 0 / 0 | `category_absent`; no cards |
| All florists booked | Астана | Флорист | 2026-10-11 | 300,000 | 1 / 0 / 0 | `no_eligible_contractors`; no cards |
| Venue available | Астана | Банкетный зал | 2026-10-10 | 3,000,000 | 1 / 1 / 1 | `matches_found`: HK-90012 |
| Same venue booked | Астана | Банкетный зал | 2026-10-11 | 3,000,000 | 1 / 0 / 0 | `no_eligible_contractors`; no cards |
| December scarcity | Алматы | Ведущий | 2026-12-26 | 3,000,000 | 10 / 1 / 1 | `matches_found`: HK-44923 |

Frozen with dataset SHA-256 `6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d`, evidence `curated-v1`, algorithm `explainable-v1:2553919e464d7030`. Changing source facts, evidence tags or ranking rules may legitimately change the order; update this document after rerunning the oracle rather than adding demo-specific logic.

### Expected exclusions

Exclusion counters use the first failed condition in the fixed order `booked`, `over_budget`, `unsupported_format`, `unsupported_language`, `duration_exceeded`.

| Scenario | Nonzero exclusions |
| --- | --- |
| Dense autumn, 11 October | `booked: 4`, `unsupported_format: 1` |
| Date change, 10 October | `booked: 4`, `unsupported_format: 3` |
| Rare florist | `booked: 1` |
| Absent category | None; the original pool is empty |
| All florists booked | `booked: 1` |
| Venue available | None |
| Venue booked | `booked: 1` |
| December scarcity | `booked: 9` |

The equal booked totals on the two dense dates do not mean the same people are booked. HK-42352 and HK-44923 are available on 11 October and booked on 10 October; other profiles differ too. The visible list really changes while every request field except the date stays fixed.

## Short presentation sequence

1. **Enter the dense autumn request.** Explain that five contractors pass the constraints and the service returns the first three from a reproducible ordering. Expand evidence on at least one card. Switch to English and inspect the translated claim and its original Russian quote; the card order and request stay the same. Switch back to Russian for the following steps if desired.
2. **Repeat the same request.** Show the same IDs, order and explanations. Ranking is a transparent heuristic with a fixed evidence version.
3. **Change only the date to 10 October.** Show two previously displayed hosts disappearing because their supplied calendars mark that date busy. No constraint is silently relaxed.
4. **Run the rare florist request.** Explain that only two florists exist in the Алматы pool and one is booked, so only HK-39372 is returned. Point out the visible imputed-price note beside its 200,000 KZT starting price; this is not a confirmed quote.
5. **Show the two empty results.** Астана/Декоратор is absent from the city catalog; Астана/Флорист on 11 October exists but is entirely booked. These are different outcomes with different useful explanations.
6. **Show the venue date pair.** HK-90012 is available on 10 October and booked on 11 October. The same calendar rules apply to venues and people. Point out this organizer-supplied profile's synthetic and imputed-price notices.
7. **Mention the calendar boundary and price caveat.** The snapshot supports 23 September–31 December 2026. Starting prices and snapshot availability require confirmation before a real booking.

Optional short additions: December scarcity demonstrates honest one-card output in a busy season; the venue request with English as the **contractor's working language** and 10 hours passes, while 11 hours or Kazakh fails the respective optional constraint. The interface-language switch is independent of this filter. The florist still passes a 12-hour request because duration is not tied to attendance for that service.

### Russian and English explanation behavior

Russian cards render the API's explanation. English cards render the same typed date, format, starting price, budget, optional language and duration facts with reviewed translations of the exact description quotes. The source-to-English dictionary covers all 93 usable quotes; each evidence expander retains the original Russian text. A future unknown quote remains labeled as original Russian, and a profile without a usable quote uses structured catalog facts. No online translation or model call occurs during matching.

Locale preference persists locally and changes the document language. It does not send a second match request, reorder cards or change canonical Russian select values. The isolated UI checks verify these behaviors, including keyboard interaction and the 375px layout.

## Hidden-name explanation audit

The dense autumn output was inspected without relying on names. Each second sentence provides a different reason, grounded in the correct profile:

| Profile | Distinguishing source fact in the rendered explanation |
| --- | --- |
| HK-42352 | `Опыт ведения свадеб 13 лет` |
| HK-44923 | `DJ и современная танцевальная музыка и мультимедийное оборудование` |
| HK-27222 | Work across the named television channels and radio stations in its own description |

After changing the date, HK-77838 adds acting and teaching experience; HK-72938 adds participation in a named KVN team. These are distinguishable capabilities or self-reported experience claims even with contractor names hidden. Claims are introduced with `В профиле`, not presented as independently verified credentials.

The florist explanation cites author floral design; the venue explanation cites corporate conferences/weddings/anniversaries and presentation equipment. The date, starting price and budget are taken from typed request/catalog facts, with exact quotes carried alongside them.

Automated tests check distinct demo explanations after removing names and validate quote containment. This inspection is a coding-assistant review, not a human usability study. Some non-demo descriptions are too sparse for a useful quote; six weak records are excluded from prose and structured-fact fallback is used where necessary. See [evidence decisions](evidence-review.md).

## API and browser rehearsal

After starting the actual integrated backend and frontend:

```bash
python scripts/check_api.py --base-url http://127.0.0.1:8000 --repeat 20
npm run test:e2e
npm run measure:browser
```

The HTTP checker compares the live service with these expected statuses, counts, exclusions, order and explanations. It also expects HTTP 422 for 1 January 2027. All **eight real-browser tests passed**, covering the form, real results, deliberate network failure/retry, delayed-response protection and a 375px viewport. The strengthened delayed-response check holds a response obtained from the real API, edits the date while the search is loading, completes a newer search, then releases the old response and verifies it cannot replace the new result.

`npm run test:ui` runs **six additional tests with explicit API mocks**. Those check locale persistence, canonical values, preserved order, English evidence/original Russian, retry versus business-empty outcomes and keyboard/mobile behavior. They are isolated interface checks; the eight-test application suite obtains actual backend results. Detailed hooks, test scope and setup are in the [browser contract](browser-contract.md).

Real screenshots are available in [Russian](images/interface-ru.png) and [English](images/interface-en.png). Rehearse the request sequence before presenting. The frontend build and its local port 4173 preview were also checked against the real backend; see [build and preview](../README.md#build-and-preview). [Complete integrated fresh-clone verification passed at `1292b65`](reproducibility.md), including all suites and 160 real HTTP requests. No internet deployment is claimed.

## Measured scope

Measurements on **23 September 2026** used Windows 11, Python **3.12.10**, Node **26.7.0**, npm **11.19.0** and Chromium **153.0.8010.12**, with the dataset/evidence/algorithm versions above.

| Scope | Command | Runs | p95 | Maximum |
| --- | --- | ---: | ---: | ---: |
| Real local HTTP, eight frozen scenarios | `python scripts/check_api.py --base-url http://127.0.0.1:8000 --repeat 20` | 160 | **21.521 ms** | **53.115 ms** |
| Real browser submit-to-visible result, five representative scenarios | `npm run measure:browser` | 20 | **65.88 ms** | **90.76 ms** |

The browser script uses dense, changed-date, rare, absent and booked requests, four times each, and writes `artifacts/browser-latency.json`. It makes no fixture substitutions. Browser time includes automation click/wait overhead; both measurements exclude installation and server startup. These are local results, not hosted throughput or network guarantees. Every measured flow was below the task's ten-second target.

The first dense request in the HTTP run took **53.115 ms**. In the separate browser run, the first dense submission took **90.76 ms**, and its first repeated submission took **60.95 ms**. Both runs used already-started services; these observations do not measure process cold start. Reports preserve the per-scenario first requests and individual browser repeats so reviewers can inspect more than an aggregate percentile.

The independent domain command remains useful for repeatability and pure matching checks. Its earlier 160-run measurement was p95 0.083 ms / maximum 0.095 ms, excluding CSV loading, HTTP and rendering; it is a different scope from the integrated measurements above. Rerun each tool to obtain current figures on the presentation machine.
