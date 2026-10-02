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
| v17 | `v17-remove-all-mls` | Admin: **Remove all MLS** danger button — bulk-deletes is_mls=true; DIY listings stay |
| v18 | `v18-excel-upload` | Admin: SMART MLS Excel/CSV upload (SheetJS) → editable preview → batch upsert publish |
| v19 | `v19-collapsible-search` | Search: after Search/Enter, collapse sticky panel to slim summary bar (Edit search + List all); mobile expanded not sticky |
| v20 | `v20-search-always-on` | Search: collapsed bar keeps a live search box + Search button; More filters opens full panel; List all shows only when filtered |
| v21 | `v21-paste-mls-link` | Admin: paste SMART MLS shared link → `/api/import-mls-link` → editable preview (w/ thumbs) → batch upsert |
| v22 | `v22-price-range` | Search: Min $ / Max $ price filters on the always-visible bar (collapsed + full panel), with Search/List all |
| v23 | `v23-compact-search` | Search: drop panel title/subtitle/Search label; tighter padding so the filter box uses less vertical space |
| v24 | `v24-triangle-header` | Tall dark-blue header (#0B3A6E); soft green triangle logo (Realtor Marcel style) + white LISTING NEEDED; wine Search icon + List your home button; phone; hover wink |
| v25 | `v25-header-mobile` | Mobile-only header fix: phones stack a centered logo row over a centered actions row (search, List, phone on one centerline, no overflow; logo eyes fixed on mobile). Desktop header identical to v24 (final commit b7db0b0) |
| v26 | `v26-cma-tool` | “What’s my home worth?” CMA at /#/cma (the old non-clickable BUY. SELL. RENT. pill on the home hero now links there). Name + email + US phone required; comps from CT recorded sales + town assessor data (data.ct.gov) + Listing Needed active listings; leads saved to Supabase `cma_leads` and listed in Admin; report emailed via Resend when `RESEND_API_KEY` is set |
| v27 | `v27-admin-leads` | Admin → **CMA Leads** tab works without the Supabase service key: token-gated `get_cma_leads(p_token)` function (code hash kept in a private schema; code entered once per browser, never in site code). Newest-first table with click-to-call / mailto, row details, Download leads (Excel) + CSV. CMA page no longer mentions email |
| v28 | `v28-edit-delete-all` | Standing rule: every admin list has Edit + Delete per row and a Delete all. CMA Leads: Edit (name/email/phone/address/notes), Delete, red Delete all leads (type DELETE) via code-gated RPCs `update_cma_lead` / `delete_cma_lead` / `delete_all_cma_leads`. Listings: new Edit (all fields) + Delete all DIY (type DELETE), Remove all MLS kept. Partner links: Edit + Delete all. MLS preview: Delete per row / Delete all (clear preview) |
| v29 | `v29-autofill-share` | CMA upgrade: CT 2026 Parcel & CAMA (data.ct.gov `ibe8-9i3q`, falls back to 2025 + existing sources) and NY Westchester parcels (NYS ITS layer with retry/timeout, Westchester County GIS backup); NY shows property facts only (no free sold-price feed). Owner names looked up server-side, saved to `cma_leads.owner_names`, shown ONLY in admin CMA Leads detail/export, never in the visitor response. List form: address → auto-fills beds/baths/sq ft/year built from public records via `/api/property-lookup`, editable, graceful no-match. Listing detail: Share button (navigator.share with PNG photo card on phones; desktop menu: Copy link, Email, Text, Save as image). Removed service-role use from CMA code |
| v30 | `v30-admin-search` | Admin → Listings: live search box above “All listings” (address, city, ZIP, MLS #, owner name/phone/email, rent/sale; multi-word AND), “12 of 938” count, clear (×), filter chips All / MLS / DIY / Live / Inactive with counts + Reset; renders 50 rows at a time with Show more / Show all (fast with 900+ rows). Every result keeps Edit, Delete, Activate/Deactivate; Delete all DIY / Remove all MLS unchanged |
| v30.1 | `v30.1-listings-paging` | Fix: Supabase caps one response at 1000 rows, so admin “All listings” and the public Search feed silently dropped everything past 1000 (1,475 rows in DB). Both now page through all rows. Admin search count now shows the true total (**current**) |

## How to restore

Say: “move to v3” (or any number).
