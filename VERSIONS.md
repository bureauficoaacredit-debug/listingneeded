# Listing Needed — design versions

Each tag is a full snapshot of the site. To go back later, tell me the version number.

| Version | Tag | What it looks like |
|--------|-----|--------------------|
| v1 | `v1-list-yourself` | Hero: Fully automated. List it yourself. Realtor only at bottom. |
| v2 | `v2-diy-line` | Hero: Fully automated. DIY listing. (one line) |
| v3 | `v3-diy-symmetric` | Hero: Fully automated \| DIY listing (two columns) |
| v4 | `v4-list-home-search` | List · Home · Search pivot; softer Buy. Sell. Rent. |
| v5 | `v5-red-fee-box` | Blue logo + red fee box |
| v6 | `v6-red-wordmark` | Red Listing Needed wordmark |
| v7 | `v7-red-footer-name` | Red footer name |
| v8 | ~~removed~~ | Full red top bar — rejected |
| v9 | `v9-bebas-logo` | Bebas Neue — LISTING #800020, NEEDED #0056B3 (**current base look**) |
| v10 | `v10-gold-header` | Full gold top header — not live |
| v11 | `v11-search-filters` | Search: ZIP, City, Street, State filters + List all |
| v12 | `v12-mls-badge` | MLS-sourced listings show an “MLS listing” badge on Search cards and details |
| v13 | `v13-admin-mls` | Admin MLS backdoor: add/remove, active (live) toggle, end date, PDF scan → publish |
| v14 | `v14-pdf-safari-fix` | Fix admin MLS PDF upload crash on Safari/prod (pdf.js legacy + CDN worker + guards) |
| v15 | `v15-server-pdf-parse` | Admin MLS PDF via server `/api/parse-mls-pdf` (pdf-parse) + Paste MLS text fallback — no client pdf.js |
| v16 | `v16-search-bar` | Search: sticky prominent keyword + ZIP/City/Street/State bar, Search + List all — works with empty MLS ZIPs |
| v17 | `v17-remove-all-mls` | Admin: **Remove all MLS** danger button — bulk-deletes is_mls=true; DIY listings stay (**current**) |

## How to restore

Say: “move to v3” (or any number).
