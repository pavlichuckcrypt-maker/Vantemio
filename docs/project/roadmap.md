# Vantemio roadmap

Revision 0.17 · 2026-10-08 · Startup product specification · functions, architecture and implementation criteria.

## First-stage priority

Official owned content → permitted publishing → analytics → measured economics → expansion. Studio and the required part of Social develop together on the Station core. Client pilots, Marketing, CRM, Market and Donations are not prerequisites for starting that cycle.

The official YouTube channel is connected, including automated publishing. The next task is to verify and document the existing route, then improve repeatability; the connection is not described as wholly absent.

| Window | Outcome | Acceptance and dependencies |
|---|---|---|
| October 2026 | Consistent RU/EN/ES/PT/FR package and official-channel baseline | Unsupported promises removed; connection record, rights, scopes, external ID and example status verified |
| November 2026 | Repeatable Studio + YouTube cycle | Agreed briefs completed; versions, quality, authorization, publications and costs traceable |
| December 2026 | Regular editorial operations | Agreed calendar executed; interruption, revocation, unknown outcomes and duplicate prevention checked |
| January 2027 | Official-channel economics report | Accruals and payouts separated; subscriptions, generation, labour and repairs included; no invented revenue |
| February 2027 | Next-platform decision and bounded adapter | API purpose permitted; access and scenario confirmed. Without admission, prepare media without promising automatic publication |
| March 2027 | Analytics informs editorial planning | Topic and format changes tied to sourced, dated metrics; quality not replaced by volume |
| April 2027 | External Studio pilot decision | Owned workflow stable; terms, rights, support and budget agreed. No participant means no completed pilot |
| May 2027 | Separate Marketing and CRM assessment | Value, data, permissions and budget defined; the date alone does not initiate paid campaigns |
| June 2027 | Refined delivery options | Measured limits and pricing; licence, updates, support and acceptance defined |
| July 2027 | Bounded Market test scenario | Order linked to version, acceptance and delivery; test environment separate from commercial launch |
| August 2027 | Live-media and creator-support prototype | Streaming separate from Base payments; stopping, moderation, payment authorization and accounting checked |
| September 2027 | Scaling decision | Quality, revenue, costs and obligations compared; outcomes and deferred tasks published |

## Separate platform-admission workstream

For each connector: assess purpose → permissions and configuration → bounded test → evidence → admission application where needed → corrections → launch within granted limits. External approval dates are not team deliverables.

TikTok Direct Post is assessed separately from internal owned-media use. A fictitious public product is not created for review. Any external connector needs a genuine user purpose and interface; alternative permitted publishing routes require their own assessment.

## Deferrals and change control

A stage is complete only with acceptance evidence. Deferrals retain the old window, reason, new window and dependency impact. Original revision 0.5 remains in the source package. In revision 0.9, the owner's decision prioritizes official media production over external paid pilots; module expansion remains a conditional plan.

Investment can accelerate a stage but cannot replace platform admission, material rights or output quality. [Technical criteria](technical.md) · [Integrations](integrations.md).

## Separate workstream: Vantemio Home

The Home edition develops alongside the core and Studio. Stages: hardware matrix → bounded installation pilot → licensing and activation → updates, removal and recovery → public-release decision. Download availability is announced after acceptance. Minimum: RTX 5070 Ti 16 GB, 32 GB RAM and 1 TB SSD; recommended and expanded configurations appear in [Home](home-edition.md).

At or near the minimum, Home requires an AI station and at least one additional laptop or PC for editing, Blender, graphics and rendering. One powerful station is sufficient when the necessary resources remain after loading AI models. Two, three, five or more additional devices can execute jobs through the single coordinator’s shared registry.

## Cloud stage after funding

Planned [Vantemio Cloud](cloud-edition.md) connects a laptop client to one logical cloud core; Vantemio infrastructure runs AI and heavy workloads. Home AI-station requirements do not apply to the client. Deployment and load tests depend on sufficient funding. Shared operational experience improves modules while projects, credentials and user data remain isolated; content training is not automatic.

## Long term: a full marketplace

Vantemio Market on Boson Protocol is planned as an independent multi-provider marketplace for digital services, downloadable goods and physical products, including clothing and other permitted categories. Market targets a complete catalog, commerce workflows and support for buyers and sellers.

Stages: Studio services and digital delivery → third-party seller accounts and storefronts → catalog, search, product variants, inventory and orders → physical goods, logistics, tracking, returns and support. Seller and category checks, listing rules, verified-order reviews, buyer protection and disputes form part of the plan.

Services require output acceptance; digital goods require version, licence and access verification; physical goods require specification, packing, delivery, condition and return processes. Personal addresses and documents stay off-chain. Each stage needs its own terms, integrations, resources and applicable-rule review. The current round funds near-term development; the complete marketplace needs a separate scaling plan.

## Budget and application scope

The 12-month plan is **US$150,000** for solo development: US$100,000 for development, resources, marketing and equipment plus US$50,000 founder compensation. The alternative **US$400,000** scenario includes that same US$150,000, two developers at US$240,000 annually and a US$10,000 additional reserve. Developer compensation is calculated as 2 × US$10,000 × 12 months.

DGX Spark with 128 GB shared CPU/GPU memory and a 4 TB SSD has a US$6,950 allowance before tax and shipping within the base US$100,000. Each programme receives defined eligible work packages, expenses, applicant, territory, period, matching funds and reporting. Cash and equipment are not counted twice. [Full investment plan](investors.md). Customer pricing is determined separately.

## Local AI worker: NVIDIA DGX Spark

The procurement plan specifies NVIDIA DGX Spark with **128 GB shared CPU/GPU memory and a 4 TB SSD**. Its **US$6,950 budget allowance before tax and shipping** is included in the base US$100,000.

Once DGX Spark is connected, the core local AI stack runs continuously: **Qwen 27B as the main model, with TTS speech and audio tools running in parallel**. Both models stay loaded between jobs, avoiding a full reload of the core stack for every video. Additional models load and release memory as tasks require. Qwen can be replaced with a stronger compatible model while preserving the production workflow. Station orchestrates jobs and handles graphics, editing, rendering and development in parallel.

[NVIDIA DGX Spark specifications](https://www.nvidia.com/en-us/products/workstations/dgx-spark/) · [Project budget](investors.md).

## Final stage: an ecosystem loyalty token

After the core products are ready and the ecosystem operates reliably, Vantemio may introduce its own loyalty token. Possible uses include rewards, access to subscriptions and internal services, and discounts on applicable fees. Earning, redemption, refund and restriction rules will be defined before launch.

The token is not required for the initial Studio release and is not a funding source in the current development budget. The loyalty token belongs to the final development stage; issuance and usage terms undergo separate legal and technical preparation. Implementation requires technical design, security review and legal assessment in relevant jurisdictions; the loyalty label alone does not determine legal status.

[ASC — Crypto assets](https://www.asc.ca/financial-innovation-in-the-capital-markets/crypto-assets-digital-assets).

## Local generation and a private customer installation

A separate deployment track: select local models → verify rights and resources → test quality → integrate local adapters → verify the private workflow and network restrictions → accept the customer installation. Schedule and delivery scope follow assessment; external generation is not mandatory for this profile.

[Local deployment profiles](home-edition.md).

### A fully autonomous enterprise AI cluster

A company or agency with a powerful private server or cluster can also host the principal high-capability model that interprets tasks, plans production and controls Vantemio tools. Supporting models, image/video generators, memory, editing, audio, rendering and quality checks also run locally. This profile needs no external cloud AI, cloud assistant or external generation for the production workflow: the customer infrastructure performs the entire process.

Self-hosting requires capable models with available weights or contractual on-premises rights. Large GPU capacity alone does not allow installation of a closed model offered only through another provider’s cloud. Supported models, adapters, quality and tasks are recorded in the compatibility matrix and validated at acceptance. The customer cluster is assessed as a separate deployment project and is outside Vantemio’s own initial compute-worker budget.

### Deployment choice and product priority

Vantemio develops one engine with local, hybrid, cloud and private enterprise deployment options. Creators and small teams need a clear workflow and suitable hardware; agencies need customer-data control, repeatability and approvals; enterprises need control of their own environment. Selection depends on quality, total cost, workload and access rules, not mandatory dependence on one cloud or GPU class.

The shared production workflow and replaceable model adapters are validated first; distinct delivery profiles follow. Fully local operation does not require a fixed amount of GPU memory: capacity depends on selected models and concurrency. A large server does not replace quality, compatibility and licence checks. Cloud capacity remains available for authorized tasks, never as a hidden dependency of a private profile.

Cloud AI and local/hybrid execution are developing in parallel. 

[Microsoft — hybrid intelligence](https://news.microsoft.com/source/emea/2026/10/building-windows-for-hybrid-intelligence/) · [AWS — deployment choice](https://aws.amazon.com/blogs/security/enabling-ai-sovereignty-on-aws/) · [Anthropic — cloud infrastructure](https://www.anthropic.com/news/anthropic-amazon-compute).
