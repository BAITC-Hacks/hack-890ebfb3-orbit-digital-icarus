# Data

The bundled catalog is the supplied anonymized contractor dataset:

- File: contractors.csv
- Profiles: 66
- Calendar snapshot: 2026-09-23 through 2026-12-31, inclusive
- SHA-256: 6a724b6b7dfb5973343e68ba18dadb60fc807d87e3d78f03ee86fb26cb089f7d

The CSV is preserved unchanged. The backend loader is responsible for parsing
pipe-separated fields, booleans, prices, hours, and date-only calendar values.

The dataset is anonymized and contains supplied synthetic/imputed flags. Those
flags must be preserved and displayed accurately; they are not quality scores.
