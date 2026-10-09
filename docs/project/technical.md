# Vantemio technical documentation

Revision 0.17 · 2026-10-08 · Startup product specification · functions, architecture and implementation criteria.

## From a brief to reviewed video

Describe the task and provide materials you have rights to use. Studio connects editing, procedural graphics, voice and review in one workflow. External generation is used only when the task needs it.

A pilot needs a brief, source material, target platform, language, format and a reference for the intended style. Output, acceptance criteria, revisions, rights and required connections are agreed before work begins.

The pilot delivers an agreed video version, revision history and a review report. Publication needs separate authorization. Applying for a pilot does not provide immediate access to a finished public service.

Current public material includes the [official Vantemio channel](https://www.youtube.com/@Vantemio) and the [open repository](https://github.com/pavlichuckcrypt-maker/Vantemio). A case connects the brief, final media, version history, human involvement, review results and measurements.

[Discuss a pilot](https://vantemio.com/en/apply/)

## 1. Scope and status

This document defines architecture, execution contracts and acceptance criteria. Each release is checked against specified scenarios, with results recorded alongside component versions.

| Specification element | Purpose |
|---|---|
| Architecture | Module, data and authority boundaries |
| Operation contract | Inputs, outputs, errors and retries |
| Acceptance criterion | Scenario and expected outcome |
| Verification record | Version, execution conditions and actual outcome |

The official Vantemio YouTube channel is connected, including automated publishing. Current scopes, external IDs and reconciled outcomes belong in the acceptance package. Public multi-user publishing develops separately.

## 2. Central Station core

Station owns admission, queues, memory, registries, the technical graph and production accounting. Clients and compute nodes execute bounded jobs; task history does not make a client an independent controller.

Existing mechanisms must be extended while retaining original task identities and previous records. Authority over unfinished work transfers through Station mechanisms after reconciling processes, active assignments and completed outputs. Restarting work is not reconciliation.

The fleet expands through the registry without a fixed machine limit. Admission requires a read-only check of stable identity, capabilities and resources, collision prevention and the original registration-request identity. Assignment accounts for budgets and outstanding claims; an expired heartbeat does not automatically release them. Paginated registry observation does not start workers.

## 3. Modules and contracts

| Module | Input | Output | Implementation criterion |
|---|---|---|---|
| Studio | Brief, assets, style, constraints | Media version and review record | Output version, QA and controlled revisions |
| Social | Accepted version, official channel, authorized settings | Platform status and analytics | Authorization, platform status and no duplicate operations |
| Marketing | Accepted creative and authorized budget | Campaign state and spending | Approved budget, permissions and operation accounting |
| CRM | Permitted contacts and events | Enquiries, deals and task relationships | Contact isolation, consent history and task links |
| Market / Donations | Separately agreed commerce and payment actions | Verifiable transaction outcome | Order terms, quality, delivery and settlement |

Proposed minimum result contract: `task_id`, `operation_id`, `input_version`, `output_version`, `executor_id`, `status`, `started_at`, `completed_at`, `cost_record`, `evidence_ref`. These are documentation requirements, not asserted field names in the existing database. Implementation maps them to the existing schema without creating a parallel registry.

## 4. Production and audio

Studio connects research, scripts, direction, assets, code-driven graphics, editing, audio and review. The source description lists Remotion, Blender, FFmpeg and Vidra/MLT. A scene relates an action, time interval, image, voice and sound. A revision retains these relationships and creates a new version.

| Role | Baseline integration component | Adapter requirement |
|---|---|---|
| Narration | Qwen3-TTS 1.7B Base | Weight version, voice rights and speech quality |
| Speech and intervals | Whisper large-v3-turbo, Silero VAD | Timestamped transcription and error handling |
| Semantics and events | LAION CLAP HTSAT, AST AudioSet, PANNs Cnn14 | Scene-linked event scores and editorial review |
| Processing and mixing | FFmpeg EQ / compression / ducking | Reproducible processing parameters and result log |
| Movement sound | Vantemio Sound Recipes | Procedures and sound layers linked to scene events |
| Music | ACE-Step 1.5 turbo + LM1.7B | Music rights, composition review and mix alignment |
| Generative effects | MMAudio, AudioLDM 48k | Commercial clearance, resources and generation checks |
| Speech cleanup | DeepFilterNet3 | Intelligibility and before/after comparison |

A model name does not establish the weights' licence. Commercial use requires the [licence register](licenses.md). A WAV file, completed render, editorial acceptance and publication are distinct events.

## 5. Providers and authentication

Supplied footage or software graphics may need no external generation. When generation is needed, check connector compatibility, permitted interface, access type, successful and failed attempt costs, and output rights. MCP is a tool-connection interface; access and billing follow the relevant provider terms.

In user mode, the owner's AI client calls Vantemio tools. In server mode, Station orchestrates calls using access intended by the provider for the product. Costs and permissions are accounted for separately; secrets are not collected through the application form or included in reports.

## 6. Authorized publication contract

Proposed states: `prepared → reviewed → authorized → transferring → processing → published`. Additional outcomes: `rejected`, `cancelled`, `failed`, `unknown`. Each adapter maps actual API statuses explicitly.

Authorization should bind the destination account, file version and hash, caption, visibility, time and mandatory disclosures. Material changes require authorization review. Scheduling is used only where platform rules and owner authority permit it; a calendar does not replace required creator confirmation.

A network interruption does not prove failure. An `unknown` outcome requires reconciliation of the remote operation and result identity; re-upload is blocked until resolved. The platform confirms publication, not the transfer of bytes. Revocation stops new operations; removal of already published material is a separate action.

## 7. Verifiable scenarios

| ID | Scenario | Acceptance evidence |
|---|---|---|
| PUB-01 | Authorized version sent normally | External ID, status and matching media |
| PUB-02 | Repeated request / duplicate trigger | One remote publication; both attempts recorded |
| PUB-03 | Interruption after transfer | Outcome reconciled without blind re-upload |
| PUB-04 | File or settings changed | Old authorization not reused for new data |
| PUB-05 | Expired or revoked access | Clear refusal, no new operations or logged secrets |
| PUB-06 | Restart and executor change | Original identity preserved; completed outputs not replayed |
| PUB-07 | Platform restriction | Limit honoured without circumvention or uncontrolled retries |
| PUB-08 | Wrong destination account | Transfer stopped pending owner review |
| DATA-01 | Data deletion | Primary records, logs and backup restoration checked |
| RIGHTS-01 | Unknown licence | No commercial acceptance without a decision |

These are test requirements. Verification does not require manually starting another ongoing production.

## 8. Analytics and comparative trials

Comparisons fix the same brief, inputs, duration, languages, graphics complexity and acceptance criteria. Record all attempts, failures and manual repairs; excluded runs require an explanation.

Required measurements: input/output/cached tokens, calls and retries; media-generator spending; time to accepted output; active human minutes; compute, storage and delivery; full cost per accepted item. Publish subscription-allocation and depreciation methods with results.

Channel metrics identify source, period, timezone and refresh time. Forecasts, accruals and payments are separate. Official-channel profitability cannot be inferred from model calls or test counts.

## 9. Evidence package and disclosure limits

A redacted package contains versions, quality criteria, review outcome, costs and human interventions, authorized publication and actual platform outcome. Secrets, internal infrastructure addresses and personal data are excluded from public evidence.

[Integrations](integrations.md) · [Editorial policy](editorial.md) · [Licences](licenses.md) · [Roadmap](roadmap.md)

### TikTok detailed contract

[User workflow, scopes, consent, data and admission](tiktok.md) · [Data deletion and disconnection](data-deletion.md).

## 10. Vantemio Home profile

[Home](home-edition.md) is a separate future user installation. Its primary computer coordinates that installation; Station remains the sole authority for Vantemio’s operating production studio. Home acceptance includes resources, dependencies, commercial rights, installer, activation, updates, removal, backup and recovery without replaying completed tasks.

At or near the minimum, Home requires an AI station and at least one additional laptop or PC for editing, Blender, graphics and rendering. One powerful station is sufficient when the necessary resources remain after loading AI models. Two, three, five or more additional devices can execute jobs through the single coordinator’s shared registry.

## 11. Cloud profile and shared memory

Planned [Vantemio Cloud](cloud-edition.md) connects a laptop client to one logical cloud core; Vantemio infrastructure runs AI and heavy workloads. Home AI-station requirements do not apply to the client. Deployment and load tests depend on sufficient funding. Shared operational experience improves modules while projects, credentials and user data remain isolated; content training is not automatic.

## Long term: a full marketplace

Vantemio Market on Boson Protocol is planned as an independent multi-provider marketplace for digital services, downloadable goods and physical products, including clothing and other permitted categories. Market targets a complete catalog, commerce workflows and support for buyers and sellers.

Stages: Studio services and digital delivery → third-party seller accounts and storefronts → catalog, search, product variants, inventory and orders → physical goods, logistics, tracking, returns and support. Seller and category checks, listing rules, verified-order reviews, buyer protection and disputes form part of the plan.

Services require output acceptance; digital goods require version, licence and access verification; physical goods require specification, packing, delivery, condition and return processes. Personal addresses and documents stay off-chain. Each stage needs its own terms, integrations, resources and applicable-rule review. The current round funds near-term development; the complete marketplace needs a separate scaling plan.

## Local AI worker: NVIDIA DGX Spark

The procurement plan specifies NVIDIA DGX Spark with **128 GB shared CPU/GPU memory and a 4 TB SSD**. Its **US$6,950 budget allowance before tax and shipping** is included in the base US$100,000.

Once DGX Spark is connected, the core local AI stack runs continuously: **Qwen 27B as the main model, with TTS speech and audio tools running in parallel**. Both models stay loaded between jobs, avoiding a full reload of the core stack for every video. Additional models load and release memory as tasks require. Qwen can be replaced with a stronger compatible model while preserving the production workflow. Station orchestrates jobs and handles graphics, editing, rendering and development in parallel.

[NVIDIA DGX Spark specifications](https://www.nvidia.com/en-us/products/workstations/dgx-spark/) · [Project budget](investors.md).

## Final stage: an ecosystem loyalty token

After the core products are ready and the ecosystem operates reliably, Vantemio may introduce its own loyalty token. Possible uses include rewards, access to subscriptions and internal services, and discounts on applicable fees. Earning, redemption, refund and restriction rules will be defined before launch.

The token is not required for the initial Studio release and is not a funding source in the current development budget. The loyalty token belongs to the final development stage; issuance and usage terms undergo separate legal and technical preparation. Implementation requires technical design, security review and legal assessment in relevant jurisdictions; the loyalty label alone does not determine legal status.

[ASC — Crypto assets](https://www.asc.ca/financial-innovation-in-the-capital-markets/crypto-assets-digital-assets).

## Local generation and a private customer installation

Local image and video generation can replace an external generator when resources, licences and agreed quality permit. Options include local production with a cloud assistant, or a fully private On-premises installation with local AI orchestration. An agency or company with its own servers receives a configuration defined through assessment and acceptance.

With a cloud assistant, agreed context still reaches an external provider. A fully private profile requires all necessary components to run locally, with no hidden cloud fallback. Local model selection, generation quality and concurrency are defined by the hardware profile and validated during installation acceptance.

[Local deployment profiles](home-edition.md).

### A fully autonomous enterprise AI cluster

A company or agency with a powerful private server or cluster can also host the principal high-capability model that interprets tasks, plans production and controls Vantemio tools. Supporting models, image/video generators, memory, editing, audio, rendering and quality checks also run locally. This profile needs no external cloud AI, cloud assistant or external generation for the production workflow: the customer infrastructure performs the entire process.

An illustrative large-enterprise configuration may have around 1,000–2,000 GB of aggregate GPU memory, including an intermediate configuration around 1,500 GB. This is a scale example, not a minimum, immediate purchase recommendation or assurance that every model will fit. Multiple accelerators do not automatically form one memory pool: interconnects, distributed execution and capacity planning must match weights, precision, context, concurrency and speed requirements.

Self-hosting requires capable models with available weights or contractual on-premises rights. Large GPU capacity alone does not allow installation of a closed model offered only through another provider’s cloud. Supported models, adapters, quality and tasks are recorded in the compatibility matrix and validated at acceptance. The customer cluster is assessed as a separate deployment project and is outside Vantemio’s own initial compute-worker budget.

### Deployment choice and product priority

Vantemio develops one engine with local, hybrid, cloud and private enterprise deployment options. Creators and small teams need a clear workflow and suitable hardware; agencies need customer-data control, repeatability and approvals; enterprises need control of their own environment. Selection depends on quality, total cost, workload and access rules, not mandatory dependence on one cloud or GPU class.

The shared production workflow and replaceable model adapters are validated first; distinct delivery profiles follow. Fully local operation does not require a fixed amount of GPU memory: capacity depends on selected models and concurrency. A large server does not replace quality, compatibility and licence checks. Cloud capacity remains available for authorized tasks, never as a hidden dependency of a private profile.

Cloud AI and local/hybrid execution are developing in parallel. 

[Microsoft — hybrid intelligence](https://news.microsoft.com/source/emea/2026/10/building-windows-for-hybrid-intelligence/) · [AWS — deployment choice](https://aws.amazon.com/blogs/security/enabling-ai-sovereignty-on-aws/) · [Anthropic — cloud infrastructure](https://www.anthropic.com/news/anthropic-amazon-compute).

## Workload plan: AI on DGX Spark, production on Station

The minimum requested hardware purchase for the next stage is **one NVIDIA DGX Spark** with 128 GB of unified CPU/GPU memory and a 4 TB SSD. Investment or hardware sponsorship will provide a dedicated compute node for local AI models.

Once DGX Spark is connected, the core local AI stack runs continuously: **Qwen 27B as the main model, with TTS speech and audio tools running in parallel**. Both models stay loaded between jobs, avoiding a full reload of the core stack for every video. Additional models load and release memory as tasks require. Qwen can be replaced with a stronger compatible model while preserving the production workflow. Station orchestrates jobs and handles graphics, editing, rendering and development in parallel.

**Station** retains the kernel, system memory, registries and job orchestration. Freed compute resources will serve graphics, Blender, Remotion, editing, rendering and additional development sessions. **MacBook** remains a development workstation and system client; part of parallel development moves to Station to relieve the MacBook.

The target is to develop code, serve local AI and produce visual assets concurrently on resources assigned to those tasks. Compatibility, concurrent load and executor recovery are checked before switching existing jobs; completed work is preserved without replay.

[NVIDIA DGX Spark](https://marketplace.nvidia.com/en-us/enterprise/personal-ai-supercomputers/dgx-spark/) · [NVIDIA — vLLM](https://build.nvidia.com/spark/vllm/instructions) · [NVIDIA — ARM64 porting guide](https://docs.nvidia.com/dgx/dgx-spark-porting-guide/dgx-spark-porting-guide.pdf)
