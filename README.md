# Tenvo Projects — prototype

Static-HTML prototype of the Projects module inside Tenvo (operating software for
Australian real estate agencies). Built around a real development — **Wharparilla
Estate** — so every surface is driven by real inventory data from the Plan of
Subdivision rather than placeholder content.

## Running locally

```bash
cd ~/tenvo-projects-proto
python3 -m http.server 4321
```

Then open:

- `http://localhost:4321/` — Tenvo Projects shell (Projects list → Wharparilla Estate detail)
- `http://localhost:4321/wharparilla-masterplan.html` — Agent-facing block hold control centre
- `http://localhost:4321/wharparilla-ebook.html` — Buyer-facing project ebook (request-a-hold flow)
- `http://localhost:4321/wharparilla-intention-form.html?token=...` — Whitelabelled intention-to-hold form (buyers land here after an agent places a hold)

## What's here

### Pages
| File | Role |
|---|---|
| `index.html` | Tenvo Projects shell — the full product UI with sidebar, projects list, and project-detail tabs (Overview / Masterplan / Sales Pipeline / Audience / Build / Share). |
| `wharparilla-masterplan.html` | Agent control centre — SVG masterplan with inline hold-placement panel, contact search, waitlist, pending-approval, and lifecycle actions (issue contract → mark conditional → unconditional → settled). |
| `wharparilla-ebook.html` | Public ebook — buyer taps a block → requests a hold → lands as an "Enquiry" + a "Pending hold" card in the agent view. |
| `wharparilla-intention-form.html` | Whitelabelled form (branded Chris Smith & Associates, powered by Tenvo) that buyers e-sign to formalise a hold. |
| `_e2e.html` / `_e2e_ui.html` | Headless-browser E2E test harnesses — run them in any browser to see pass/fail logs. |

### Shared state (classic scripts loaded in the pages above)
| File | Role |
|---|---|
| `wparBlocks.js` | Block state store (localStorage) + status lifecycle + applyToSvg helper. Shared across all four pages so a buyer request on the ebook immediately propagates to the agent masterplan and the Tenvo shell. |
| `wparContacts.js` | Seeded contacts database used by the agent's contact-search when placing a hold. |

### Assets
| File | Role |
|---|---|
| `wharparilla-master.svg` | Vectorised Plan of Subdivision — every lot has a `<title>` of the form `"Lot 32, Stage 8, Available now"` which drives both the hover tooltips and the JS-level block indexing. |
| Hero / logo images | Project branding. |

## Architecture

Tenvo is the operating software — CRM + website builder + ebook builder in one.
Because Tenvo owns every surface, there's **no external sync problem**: a block's
status, hold, purchaser, intention form, and contract all live in one record and
every surface (control centre, ebook, developer portal, listings) is a view onto
it. A buyer-placed hold shows up on the agent control centre in real time; an
agent-approved hold flips the block colour in the ebook within a second (via
`storage` events + an in-tab `CustomEvent`).

### Block status lifecycle

```
future → available → on_hold_pending → on_hold → hold_signed
                   → contract_review → contract_conditional
                   → contract_unconditional → sold
```

### Sales Pipeline lanes

- **Unconverted** (lead pipeline) — Pending hold · Hot · Warm · Cold · Lost
- **Converted** (active hold pipeline) — Intention to hold sent · Intention to hold returned · Contract review · Conditional · Unconditional

### Views on the shared state

- **Kanban** — one card per lane item.
- **List view** — same lanes, stacked as sections.
- **Forms** — intention-to-hold form management (sent · signed · resend · copy link).
- Click any card or row → person modal with contact + linked block + comms history.

## Testing

Open either harness in a browser (or `curl -s | grep`):

- `_e2e.html` — pure data-layer assertions (status transitions, waitlist promotion, contact matching, etc.)
- `_e2e_ui.html` — iframes the real pages and asserts against their rendered DOM.

Both harnesses wipe + reseed `localStorage` on load so they're safe to re-run.

## Resetting local state

```js
// in the browser devtools of localhost:4321
localStorage.removeItem('wparBlocks');
localStorage.removeItem('wparContacts');
localStorage.removeItem('wparConstruction:wharparilla');
location.reload();
```
