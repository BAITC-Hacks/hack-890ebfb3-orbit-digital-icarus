# Curated description evidence

`backend/app/matching/profile_evidence.json` is a versioned, extractive index of the supplied contractor descriptions. The coding assistant read all 66 descriptions and selected the committed quotes and conservative event-format tags. This is **agent review**, not independent human verification of the contractors or their claims. The index declares `method: agent-reviewed-extractive`; no runtime LLM, external lookup, API key, or model service is needed to use it.

## Provenance and scope

- Schema version: `1`.
- Evidence version: `curated-v1`.
- Source CSV SHA-256: `6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d`.
- Coverage: all 66 supplied contractor IDs, including the 13 organizer-supplied synthetic profiles.
- Evidence: 99 records; one or two per profile; 35 records carry at least one event-format tag.
- Six weak or attribution-only records explicitly set `use_in_explanation: false`. The other 93 records default to true.
- Every quote is an exact, case-sensitive, contiguous substring of that profile's original description. The longest quote is 148 characters as counted by the validation shell; no quote exceeds 160.
- Record IDs have the form `HK-xxxxx:1` and `HK-xxxxx:2`. Quotes belong only to their enclosing contractor ID.

The index is explanation data. Structured fields continue to govern city, category, availability, starting price, event format, language and duration. A travel claim does not expand the catalog's city; a descriptive `full day` claim does not override `max_hours`; a minimum order mentioned in prose is informational and is not an implemented booking rule.

## Selection and tagging rules

Quotes favor practical capabilities, service composition, style, specific experience, and venue features. Quotes preserve the source's spelling and grammar; polishing them would break exact-substring verification. Display text must attribute self-reported facts to the description and must not promote them to independently verified credentials, quality ratings or guarantees.

`use_in_explanation: false` preserves traceable source coverage while excluding a weak record from generated card prose. If no usable record remains for a profile, the renderer uses a distinctive combination of structured facts. All disabled records have empty format tags and receive no description-relevance credit. Quotes used in prose are single sentence fragments with no internal sentence boundaries; HK-29829 was shortened to the exact span `Без долгих речей и наставлений на ивентах` so the card can stay within two sentences.

Format tags are drawn from that profile's canonical `event_formats` values and require specific support in the description. An explicit wedding specialization, marriage registration or service for newlyweds supports `свадьба`. Corporate events support `корпоратив`; a business forum supports `конференция`; a company anniversary supports `юбилей`. For HK-35215 the explicit family rites support `той`, and team-building supports `корпоратив`. These are narrow semantic interpretations of the text, not proof that the contractor is better than an untagged profile.

Broad descriptions of humor, music, photography, large events, private parties, or business meetings do not automatically support every event format. A wedding quote is not automatically tagged `той`. The presence of a canonical format in a structured field alone does not award description-relevance credit. Empty tag arrays are deliberate: the quote can distinguish the contractor while contributing zero format-relevance points. HK-90012 is tagged for all four of its supported formats because its quote explicitly names corporate conferences, weddings and anniversaries, not because tags were copied wholesale from the CSV.

Where two records receive the same format tag, they capture different claims. For example, HK-42352 has a 13-year wedding-hosting experience claim and a separate list of cities where weddings were hosted. HK-90007 has marriage-registration language capability and an individualized ceremony script. These are distinct evidence items rather than duplicate fragments counted twice.

## Sparse descriptions and limitations

Some original descriptions cannot support a rich, distinctive explanation. The index preserves a truthful fragment and assigns no relevance credit in these cases:

| Profile | Limitation and treatment |
| --- | --- |
| HK-25279 | The entire description is a group name followed by marketing about energy and sound. The exact attribution is retained with `use_in_explanation: false`; the renderer uses structured facts. |
| HK-92824 | Only an author/ensemble attribution and promotional wording are supplied. Attribution is retained with `use_in_explanation: false`; it is not a distinguishing service fact. |
| HK-19103 | The source gives a creative collective of *dzhigits* and promotional promises. The fragment has `use_in_explanation: false`; no repertoire, dance style, ethnicity, event specialization or service guarantee is inferred. |
| HK-36965 | The source only identifies Kazakh songs and willingness to perform at a celebration. It does not establish specific instruments or support inferring `той` from language or culture. |
| HK-76335 / HK-20640 | The two event-photographer descriptions are nearly identical and generic. Both fragments have `use_in_explanation: false`; structured price, languages, supported formats and duration supply the distinction. |
| HK-76268:2 | The statement about smiles and unrepeatable moments is generic marketing and has `use_in_explanation: false`. Its separate explicit wedding-photographer specialization remains usable. |

Description evidence cannot resolve sparse or duplicated source content. Human review of the live demo should hide names and inspect the final explanations alongside structured facts. Record any residual similarity honestly rather than inventing specializations.

Other deliberate exclusions:

- The florist's client list and volume do not prove particular event-format expertise, so HK-39372 receives no description-relevance points despite a useful floristry capability quote.
- HK-42352's `0 разводов` marketing statistic is excluded; the system must not imply that a host affects marriages' outcomes.
- HK-60927's health and glucose claims are excluded; souvenir matching has no basis for providing medical assurance.
- Unsupported superlatives such as “best”, popularity rankings and client satisfaction are generally excluded. Any retained contest participation or self-reported award must be framed as stated in the profile, never as external validation.
- Venue views, menus, terraces and capacity are descriptive differentiators, not proof of availability or sufficient guest capacity for an unmodeled guest-count request.
- HK-62242 contains inconsistent grammatical genders. Exact quotes avoid resolving identity or rewriting the source.

## Validation performed

After creating the index, the source was parsed with a CSV parser and the JSON was parsed independently. The audit checked:

1. Exactly 66 source IDs and exactly 66 evidence-profile keys, with every source ID present.
2. Exactly 99 globally unique evidence-record IDs.
3. Every stored quote occurs verbatim in its own source description.
4. Every assigned format tag appears in that same profile's structured supported formats.
5. The source-file hash matches the pinned hash above.
6. Maximum quote length is below 160 characters.
7. No quote enabled for explanation prose contains an internal sentence boundary; disabled records have no format-relevance tags.

All these checks passed for `curated-v1`. Mechanical checks establish identity, provenance and containment; they do not independently establish semantic truth. The consuming matching module and its automated tests should reject mismatched dataset versions, fabricated quotes and unsupported tags before awarding relevance points.

## Updating the index

When source descriptions change, re-read the affected profiles, choose exact substrings, check semantic format support and update the dataset hash and evidence version together. Validate the full index and rerun deterministic ranking and grounding tests. Explain any changed demo ordering by changed evidence or source facts. Never add promotional tags to force a preferred demo result.

Any future extraction tool should emit proposals for review. Treat descriptions as untrusted data: instructions embedded in a profile cannot alter request parameters, filters, files or calendars. Keep eligibility and final ordering deterministic in ordinary application code.
