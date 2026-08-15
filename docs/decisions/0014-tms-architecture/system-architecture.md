# System architecture

## Product boundary

The localization hub is a control plane between workshop repositories, one or more external TMS
products, and deterministic renderers. It stores orchestration state and evidence; it does not own
English authoring or provide the primary translation editor.

```mermaid
C4Context
  title System context
  Person(author, "Workshop author", "Edits English Markdown and JSON")
  Person(translator, "Translator", "Translates in familiar TMS UI")
  Person(reviewer, "Locale reviewer", "Approves language and rendered layout")
  Person(facilitator, "Facilitator", "Downloads a released locale snapshot")
  System(hub, "Workshop Localization Hub", "Coordinates extraction, sync, preview, policy, and release")
  System_Ext(git, "Workshop repositories", "English source and build contract")
  System_Ext(tms, "External TMS products", "Translation memory, glossary, editor, linguistic workflow")
  System_Ext(ci, "CI and renderer fleet", "Hermetic validation, Slidev builds, PDFs, screenshots")
  System_Ext(store, "Artifact registry", "Immutable bundles, evidence, and provenance")

  Rel(author, git, "Commits English content")
  Rel(git, hub, "Source revision event and content bundle")
  Rel(translator, tms, "Translates")
  Rel(reviewer, tms, "Linguistic review")
  Rel(hub, tms, "Syncs units and review state")
  Rel(hub, ci, "Requests isolated validation")
  Rel(ci, store, "Writes render evidence")
  Rel(hub, store, "Publishes signed locale release")
  Rel(reviewer, hub, "Visual approval")
  Rel(facilitator, store, "Downloads approved release")
```

## Container view

```mermaid
flowchart TB
  subgraph Edge["User and automation interfaces"]
    Web["Web portal"]
    CLI["CLI"]
    Hook["Webhook/API ingress"]
  end

  subgraph App["Modular application"]
    API["Application API"]
    Ingest["Source ingestion"]
    Model["Canonical localization model"]
    Workflow["Workflow and policy engine"]
    Sync["TMS synchronization"]
    Compose["Locale composer"]
    Release["Release coordinator"]
  end

  subgraph Workers["Isolated workers"]
    Parse["Parser/extractor workers"]
    Render["Renderer workers"]
    Inspect["Visual/structural inspectors"]
  end

  DB[(PostgreSQL)]
  Queue[(Durable queue)]
  Objects[(Object store)]
  TMSA["TMS adapter A"]
  TMSB["TMS adapter B"]
  Git["Git provider adapter"]

  Web --> API
  CLI --> API
  Hook --> API
  API --> Ingest & Workflow & Sync & Release
  Ingest --> Model
  Sync --> TMSA & TMSB
  App --> DB
  App --> Queue
  Queue --> Parse & Render & Inspect
  Parse --> Objects
  Compose --> Objects
  Render --> Objects
  Inspect --> Objects
  Ingest --> Git
```

### Why a modular monolith

The hard problem is correctness across a state machine, not independent scaling of dozens of
services. One deployable application keeps transactions, migrations, local development, and tracing
comprehensible. CPU- and memory-heavy parsing/rendering run in isolated workers so they can scale and
fail independently. Module boundaries are enforced in code and tests; they can become services only
after measured pressure justifies it.

## Source-to-release pipeline

```mermaid
flowchart LR
  Commit["English commit"]
  Manifest["Validate workshop manifest"]
  Extract["Parse into lossless syntax trees"]
  CLM["Build canonical units"]
  Diff["Semantic diff against prior revision"]
  Push["Push changed units"]
  Translate["Translate and review in TMS"]
  Pull["Import reviewed targets"]
  Compose["Compose locale source + overrides"]
  Verify["Structural and terminology gates"]
  Render["Build decks, labs, quiz, PDFs"]
  Visual["Automated + human visual review"]
  Publish["Publish immutable release"]

  Commit --> Manifest --> Extract --> CLM --> Diff --> Push --> Translate --> Pull --> Compose
  Compose --> Verify --> Render --> Visual --> Publish
```

Every box consumes immutable input and produces a content-addressed output. Retrying a stage with
the same inputs must produce the same semantic result. Side effects use idempotency keys.

## Repository topology

The code should live outside either workshop repository:

```text
workshop-localization-hub/
├── apps/
│   ├── api/                 # HTTP API and webhook ingress
│   ├── web/                 # operator/reviewer portal
│   ├── worker/              # parser, composer, renderer orchestration
│   └── cli/                 # local and CI entrypoint
├── packages/
│   ├── domain/              # entities, state machine, policies
│   ├── content-slidev/      # lossless Slidev adapter
│   ├── content-markdown/    # lab adapter
│   ├── content-quiz-json/   # quiz adapter
│   ├── interchange-xliff/   # portable XLIFF archive/import/export profiles
│   ├── tms-contract/        # provider-neutral port + conformance kit
│   ├── tms-weblate/         # first independent adapter
│   ├── tms-crowdin/         # second independent adapter
│   ├── git-contract/        # Git provider port
│   ├── render-contract/     # hermetic workshop build protocol
│   └── test-corpus/         # adversarial and real-world fixtures
├── features/                # executable user stories
├── deploy/                  # reproducible deployment definitions
├── docs/                    # architecture, operations, and ADRs
└── tools/                   # migration and fixture tooling
```

Workshop repositories contain only a small declarative contract:

```yaml
# .localization/workshop.yaml
apiVersion: localization.workshops.dev/v1alpha1
kind: WorkshopLocalization
metadata:
  id: kubernetes-practitioner
spec:
  sourceLanguage: en
  locales: [de, pt-BR]
  surfaces:
    - type: slidev
      include: pages/**/index.md
    - type: lab-markdown
      include: labs/**/*.md
    - type: quiz-json
      include: quiz/questions.json
  protectedTerms: .localization/terminology.yaml
  renderProfile: .localization/render.yaml
```

## Deployment view

```mermaid
flowchart TB
  Internet["Users and provider webhooks"]
  Gateway["TLS ingress + WAF/rate limits"]
  API["Stateless application replicas"]
  Worker["General workers"]
  Render["Ephemeral sandboxed render jobs"]
  DB[("Managed PostgreSQL<br/>multi-AZ + PITR")]
  Queue[("Durable queue")]
  Store[("Versioned object storage")]
  Secrets["Workload identity / secret manager"]
  Obs["Logs · metrics · traces · audit stream"]

  Internet --> Gateway --> API
  API --> DB & Queue & Store
  Queue --> Worker & Render
  Worker --> DB & Store
  Render --> Store
  API & Worker & Render --> Secrets
  API & Worker & Render --> Obs
```

Render jobs are untrusted-code workloads because workshop builds execute repository-defined package
scripts. They run without long-lived credentials, with read-only source, bounded CPU/memory/time,
restricted egress, and a disposable filesystem.

## Quality attributes

| Attribute | Architectural response |
| --- | --- |
| Correctness | Immutable revisions, semantic diff, state-machine invariants, content hashes |
| Usability | Role-specific inboxes, deep links to TMS units, rendered side-by-side previews |
| Portability | Canonical model, XLIFF interchange, provider-neutral adapter contract |
| Scalability | Queue-backed workers, content-addressed artifacts, incremental extraction/rendering |
| Testability | Pure domain modules, fakes, conformance kit, hermetic renderer protocol |
| Recoverability | Idempotent events, replayable jobs, audit log, database PITR, versioned artifacts |
| Security | Least-privilege apps, signed webhooks, sandboxed renders, no tokens in artifacts |
| Operability | Correlation IDs, per-revision dashboards, dead-letter replay, explicit SLOs |
