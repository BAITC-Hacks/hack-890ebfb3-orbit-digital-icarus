# Supplied contractor dataset

`contractors.csv` is the unchanged 66-profile anonymized dataset supplied for Smart Contractor Matching #79-lite. It is bundled so matching checks work from a fresh clone without a Downloads folder or an external data request.

[Organizer CSV](https://drive.google.com/file/d/1uUCu-szctwaTaV0-Yfg3FKHY8M3lQ3vw/view) · [HTML preview](https://drive.google.com/file/d/1IZhWdv53wujvRMHWTA47t9V1UqulmMPs/view)

SHA-256: `6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d`.

The file is UTF-8 CSV. The four list fields use `|`; quoted descriptions may contain commas and line breaks. Prices are starting prices in KZT per event. Empty `max_hours` means the service is not tied to hours of attendance. All date values refer only to 2026-09-23 through 2026-12-31.

There are 50 Алматы, 15 Астана and 1 Зарубежье profiles; 13 are organizer-supplied synthetic profiles, 8 cities and 18 prices are imputed. Categories overlap across profiles. Synthetic and imputed flags must remain visible in the product. The snapshot does not establish live availability or confirmed final prices.

The original 66 records have not been supplemented. `.gitattributes` preserves these source bytes across Windows/Linux checkouts. bbl owns the production loader; `scripts/matching_acceptance.py` has an independent test adapter and reference filter.
