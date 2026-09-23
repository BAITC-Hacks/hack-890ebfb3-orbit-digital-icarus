# Reproducible demo and explanation audit

These scenarios are verified against the bundled 66-profile CSV and Enjoy's implemented matching core. They are a runnable **domain demonstration today**. The real browser demonstration awaits integration of bbl's API and spectra's UI; the planned browser steps below are not a claim of completed browser testing.

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

## Short presentation sequence after integration

1. **Enter the dense autumn request.** Explain that five contractors pass the constraints and the service returns the first three from a reproducible ordering. Expand evidence on at least one card.
2. **Repeat the same request.** Show the same IDs, order and explanations. Ranking is a transparent heuristic with a fixed evidence version.
3. **Change only the date to 10 October.** Show two previously displayed hosts disappearing because their supplied calendars mark that date busy. No constraint is silently relaxed.
4. **Run the rare florist request.** Explain that only two florists exist in the Алматы pool and one is booked, so only HK-39372 is returned. Its 200,000 KZT starting price is imputed and must have a visible note; it is not a confirmed quote.
5. **Show the two empty results.** Астана/Декоратор is absent from the city catalog; Астана/Флорист on 11 October exists but is entirely booked. These are different outcomes with different useful explanations.
6. **Show the venue date pair.** HK-90012 is available on 10 October and booked on 11 October. The same calendar rules apply to venues and people. This organizer-supplied synthetic profile and its imputed price must be labeled.
7. **Mention the calendar boundary and price caveat.** The snapshot supports 23 September–31 December 2026. Starting prices and snapshot availability require confirmation before a real booking.

Optional short additions: December scarcity demonstrates honest one-card output in a busy season; the venue request with English and 10 hours passes, while 11 hours or Kazakh fails the respective optional constraint. The florist still passes a 12-hour request because duration is not tied to attendance for that service.

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

## API and browser rehearsal gate

After starting the actual integrated backend and frontend:

```bash
python scripts/check_api.py --base-url http://127.0.0.1:8000 --repeat 20
npm run test:e2e
```

The HTTP checker compares the live service with these expected statuses, counts, exclusions, order and explanations. It also expects HTTP 422 for 1 January 2027. Playwright drives the real form for these flows, network failure/retry, delayed-response protection and a 375px viewport. Test discovery succeeded for eight tests; **actual browser execution is still pending**. Detailed frontend hooks and setup are in [browser contract](browser-contract.md).

Before the final presentation, record a real screenshot or video backup from the integrated app, verify visible synthetic/imputed notes, use keyboard navigation and rehearse the complete request sequence. Do not substitute mock-only results or the reference script for a claimed live browser demo.

## Measured scope

A fresh local domain run on 23 September 2026 used Python 3.12.10 on Windows 11 `10.0.26200`, the versions above, and 20 repetitions of each of eight scenarios. It produced 160 identical-order evaluations with **p95 0.083 ms**, **maximum 0.095 ms**, and per-scenario first evaluations of **0.008–0.175 ms**. Loading/CSV parsing preceded measurement. These figures describe the reference filtering plus matching/explanation core only.

HTTP latency, browser submit-to-render latency, the clean-clone full-app launch and production build remain unmeasured until integration. The task target is below ten seconds for the complete user flow. Capture HTTP and browser timings separately over representative runs and attach environment/data/algorithm versions when reporting them.
