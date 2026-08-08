# supply-chain

Machine-checked supply-chain policy inputs for `scripts/dependency-audit.mjs`
and related gates.

- `dependency-advisories.json` — locked advisory evidence captured from the
  GitHub Global Security Advisory API. `evaluateLockedAdvisories` iterates the
  `advisories` **array**, so one advisory id may appear in **multiple entries**
  when upstream patched each release line separately (e.g.
  `GHSA-5p4m-2wfm-xmqj` for js-yaml 3.x and 4.x, `GHSA-2v37-7h3g-55p8` for
  nanoid 3.x and 4/5.x). Record one entry per vulnerable range with that
  range's own first patched version.
- `dependency-audit.json` — audit policy. `exceptions` waive a high/critical
  advisory only with a documented `reason`, an `owner`, and an ISO `expires`
  date; the gate fails closed once the date passes.
- `exceptions.json` — reviewed remote-input allowances for automation scripts.
