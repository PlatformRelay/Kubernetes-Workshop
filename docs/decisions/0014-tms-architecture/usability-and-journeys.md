# Usability and journeys

The hub succeeds only if normal work is easier than editing translated Markdown by hand. Each role
gets one obvious inbox, actionable status, and a reversible workflow.

## Information architecture

```mermaid
flowchart TB
  Home["Portfolio dashboard"]
  Workshop["Workshop"]
  Revision["Source revision"]
  Locale["Locale"]
  Unit["Translation unit"]
  Preview["Rendered preview"]
  Release["Locale release"]
  Providers["TMS connections"]
  Audit["Audit and operations"]

  Home --> Workshop
  Workshop --> Revision & Locale & Release
  Revision --> Unit & Preview
  Locale --> Unit & Preview
  Unit --> Providers
  Release --> Preview
  Home --> Providers & Audit
```

## Portfolio dashboard

```text
┌─ Localization Hub ──────────────────────────────────────────────────────────┐
│ Workshops   Needs attention   Ready to release   Provider health           │
│     2             17                 1             A ✓  B ✓                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Kubernetes Practitioner  source 8f31c2                                     │
│   de      96% linguistic  92% visual   3 stale   2 overflow   [Open]       │
│   pt-BR  100% linguistic 100% visual   ready                 [Release]     │
│ Infrastructure Workshop source a42e90                                     │
│   de      81% linguistic  79% visual  24 stale               [Open]       │
└─────────────────────────────────────────────────────────────────────────────┘
```

Percent complete is never the only signal. The dashboard distinguishes untranslated, needs-editing,
linguistically reviewed, structurally failed, visually failed, visually approved, and released.

## Author journey: change English safely

```mermaid
sequenceDiagram
  actor Author
  participant Git as Workshop repository
  participant Hub
  participant TMS
  participant CI as Preview renderer

  Author->>Git: Open source pull request
  Git->>Hub: Send immutable source revision
  Hub->>Hub: Extract and semantic-diff units
  Hub-->>Git: Check: 12 changed, 3 new, 1 override stale
  Hub->>TMS: Publish candidate source revision
  Hub->>CI: Render English structural baseline
  CI-->>Hub: Baseline evidence
  Hub-->>Author: Deep links and localization impact
  Author->>Git: Merge when source checks pass
  Hub->>TMS: Promote merged revision
```

The author never edits keys or catalogs. A pull-request check explains localization impact before
merge without blocking English authoring on translation completion.

## Translator journey: work in a familiar editor

```mermaid
journey
  title Translate a changed slide
  section Find work
    Open TMS assignment from locale inbox: 5: Translator
    See English, screenshot, glossary, and notes: 5: Translator
  section Translate
    Edit prose without touching protected code: 5: Translator
    Preview approximate length warning: 4: Translator
    Submit for linguistic review: 5: Translator
  section Correct
    Follow deep link from rendered overflow issue: 4: Translator
    Revise or request a structural override: 5: Translator
```

Each TMS unit includes:

- the English source and prior accepted translation;
- workshop, section, slide, role, and layout context;
- source and target screenshots when available;
- protected terms and non-translatable inline tokens;
- a deep link back to the hub preview;
- a character-expansion hint, clearly labelled as a hint rather than a layout guarantee.

## Linguistic reviewer journey

```mermaid
stateDiagram-v2
  [*] --> Untranslated
  Untranslated --> Draft: translator saves
  Draft --> NeedsEditing: translator submits
  NeedsEditing --> LinguisticallyReviewed: reviewer accepts
  NeedsEditing --> Draft: reviewer requests changes
  LinguisticallyReviewed --> NeedsEditing: source semantic change
  LinguisticallyReviewed --> VisualReview: composition succeeds
  VisualReview --> NeedsEditing: language correction required
```

The reviewer works in the TMS, where translation memory and glossary context already exist. The hub
imports provider state but maps it to its own smaller, provider-independent state machine.

## Visual reviewer journey

```text
┌─ Visual review: de · S07 · Service types ───────────────────────────────────┐
│ Source revision 8f31c2   Linguistic review ✓   Structural checks ✓         │
├───────────────────────────────┬─────────────────────────────────────────────┤
│ English                       │ German                                      │
│ [rendered slide + click 0]    │ [rendered slide + click 0]                 │
│                               │                                             │
│ [click 1] [click 2] [click 3] │ [click 1] [click 2] [click 3]              │
├───────────────────────────────┴─────────────────────────────────────────────┤
│ Issues: text clipped in card 3 · line wrap changed card height             │
│ [Request wording change] [Create override request] [Approve visual]        │
└─────────────────────────────────────────────────────────────────────────────┘
```

Visual approval is bound to `(source revision, locale, composed-content hash, render-profile hash)`.
Any change to those inputs invalidates approval automatically.

## Override journey

```mermaid
sequenceDiagram
  actor Reviewer
  participant Hub
  participant Git as Localization repository
  participant CI as Composer/renderer
  participant TMS

  Reviewer->>Hub: Request slide split with rationale
  Hub->>Git: Open override pull request from template
  Reviewer->>Git: Edit localized structural fragment
  Git->>CI: Validate protected blocks and source anchors
  CI-->>Hub: Render two-slide target preview
  Hub->>TMS: Link affected units and pause normal composition
  Reviewer->>Hub: Approve visual result
  Hub->>Git: Record approval check
```

Overrides require a reason: `overflow`, `locale-pedagogy`, `accessibility`, or `other`. The dashboard
reports override rate by locale and layout. Repeated overrides of one layout create an upstream
layout-improvement task instead of normalizing permanent forks.

## Facilitator journey

```mermaid
flowchart LR
  Choose["Choose workshop + locale"]
  Status{"Released snapshot exists?"}
  Download["Download one signed bundle"]
  Verify["CLI verifies checksum/provenance"]
  Run["Launch locale deck"]
  Explain["Read release notes and known fallbacks"]

  Choose --> Status
  Status -->|Yes| Download --> Verify --> Run
  Status -->|No| Explain
```

A facilitator never assembles catalogs or decides whether fuzzy strings are safe. A locale is either
released for a particular English revision or visibly unavailable. Preview builds may contain
watermarked English fallback; released builds may not.

## Operator journey

```mermaid
flowchart TB
  Alert["Alert: provider webhook lag"]
  Timeline["Open correlated event timeline"]
  Cause{"Failure class"}
  Retry["Replay idempotent job"]
  Quarantine["Quarantine malformed payload"]
  Disable["Disable unhealthy adapter"]
  Shadow["Continue with second adapter / shadow comparison"]

  Alert --> Timeline --> Cause
  Cause -->|Transient| Retry
  Cause -->|Bad payload| Quarantine
  Cause -->|Provider incident| Disable --> Shadow
```

## Usability acceptance measures

| Measure | Initial target |
| --- | --- |
| Author actions to publish changed source units | Zero beyond normal pull request workflow |
| Translator navigation from task to source slide preview | One click |
| Reviewer navigation from visual defect to TMS unit | One click |
| Facilitator actions from released locale to running deck | One command or one download |
| Unexplained status labels | Zero; every state has cause and next action |
| Manual reconciliation after duplicate webhook | Zero |
| Time to reproduce a failed render locally | Under ten minutes from copied command |

