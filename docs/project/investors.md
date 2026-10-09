# Investors and partners

0.17 · 2026-10-08 · Startup product specification · functions, architecture and implementation criteria.

We are raising early funding to develop and launch Vantemio. The first stage brings Studio to repeatable production by connecting scripts, graphics, voice, editing, review and recovery. Official brand channels are the first application and demonstration. Demand and economic validation are part of the funded work, not a prerequisite for an investor conversation.

## Twelve-month funding plan · 8 October 2026 revision

Two alternative scenarios are provided. The team scenario includes the solo scenario; the totals must not be added together.

| Allocation | Solo development, USD | With two developers, USD |
|---|---:|---:|
| Development, resources, marketing and equipment | 100,000 | 100,000 |
| Founder compensation for 12 months | 50,000 | 50,000 |
| Two developers: 2 × 10,000 × 12 months | — | 240,000 |
| Additional team-scenario reserve | — | 10,000 |
| **Total request** | **150,000** | **400,000** |

The base US$100,000 covers AI tools and integration, compute, hosting, storage, monitoring, testing, initial marketing and equipment. It already includes NVIDIA DGX Spark at a **US$6,950 budget allowance before tax and shipping**; this is not added on top of US$150,000 or US$400,000. Tax, shipping and associated costs are allocated within the agreed budget during detailed planning. The other base allocations total US$93,050 before that breakdown.

US$50,000 is separate compensation for the founder’s work on the project over the year. The team scenario adds two developers: core and AI integration; product, cloud and APIs. US$10,000 per person per month is a compensation planning assumption. Hiring terms and mandatory employer costs are assessed within the US$400,000 envelope; the additional reserve is US$10,000.

Funding is released across development, validation and pilot stages. Each grant application defines its eligible work and expenses; the total project request is not automatically the amount requested from one programme. Cash and equipment contributions are recorded separately, without funding the same item twice. Subscription and service prices are determined separately.

## Local AI worker: NVIDIA DGX Spark

The procurement plan specifies NVIDIA DGX Spark with **128 GB shared CPU/GPU memory and a 4 TB SSD**. Its **US$6,950 budget allowance before tax and shipping** is included in the base US$100,000.

Once DGX Spark is connected, the core local AI stack runs continuously: **Qwen 27B as the main model, with TTS speech and audio tools running in parallel**. Both models stay loaded between jobs, avoiding a full reload of the core stack for every video. Additional models load and release memory as tasks require. Qwen can be replaced with a stronger compatible model while preserving the production workflow. Station orchestrates jobs and handles graphics, editing, rendering and development in parallel.

[NVIDIA DGX Spark specifications](https://www.nvidia.com/en-us/products/workstations/dgx-spark/) · [Project budget](investors.md).

The minimum hardware support for this stage is one DGX Spark, funded through investment or supplied to the project as equipment. Relieving Station will also allow additional development sessions there, moving part of parallel development off the MacBook. Local AI, visual production and development will each have assigned compute resources.

## Milestones after funding

Months 1–4: integrated internal prototype — repeatable production, quality, recovery and measurements.

Months 4–6: limited external MVP — connections, account isolation, job tracking and delivery.

Months 6–9: limited cloud beta — load tests, limits, monitoring and initial acquisition experiments.

Months 9–12: reliability and initial expansion — feedback, improved execution and broader permitted publishing.

These are planning windows subject to validation. Base/Boson services have their own quality, delivery and settlement acceptance. The stage covers Studio, required infrastructure and pilots. CRM, marketing and the multi-provider Market have separate development stages.

## First external user and demand validation

After the official-channel workflow is established, the first external pilot targets a creator or small brand team seeking repeatable video production from its own materials. The value to test is fewer manual handoffs, retained context and controlled revisions. Willingness to pay is tested through separately agreed pilots.

Planned revenue sources include official channels, Home/Cloud subscriptions or licensing, implementation and support, and Market services and transactions. Customer prices and commission rates are not set. This is an early-stage product; the commercial model will develop alongside pilots.

## Vantemio / Alberta, Canada

Vitalii Pavlichuk operates the project as an individual in Alberta, Canada. Funding terms and necessary organizational steps are agreed before funds are accepted. The public material covers the request, uses and milestones. Detailed estimates, supplier quotations, code rights, participation terms and private technical review are shared with investors within an agreed scope.

[Studio](technical.md) · [Home](home-edition.md) · [Cloud](cloud-edition.md) · [Roadmap](roadmap.md) · [GitHub](https://github.com/pavlichuckcrypt-maker/Vantemio)

[support@vantemio.com](mailto:support@vantemio.com)

## Long term: a full marketplace

Vantemio Market on Boson Protocol is planned as an independent multi-provider marketplace for digital services, downloadable goods and physical products, including clothing and other permitted categories. Market targets a complete catalog, commerce workflows and support for buyers and sellers.

Stages: Studio services and digital delivery → third-party seller accounts and storefronts → catalog, search, product variants, inventory and orders → physical goods, logistics, tracking, returns and support. Seller and category checks, listing rules, verified-order reviews, buyer protection and disputes form part of the plan.

Services require output acceptance; digital goods require version, licence and access verification; physical goods require specification, packing, delivery, condition and return processes. Personal addresses and documents stay off-chain. Each stage needs its own terms, integrations, resources and applicable-rule review. The current round funds near-term development; the complete marketplace needs a separate scaling plan.

## Local generation and a private customer installation

Local image and video generation can replace an external generator when resources, licences and agreed quality permit. Options include local production with a cloud assistant, or a fully private On-premises installation with local AI orchestration. An agency or company with its own servers receives a configuration defined through assessment and acceptance.

With a cloud assistant, agreed context still reaches an external provider. A fully private profile requires all necessary components to run locally, with no hidden cloud fallback. Local model selection, generation quality and concurrency are defined by the hardware profile and validated during installation acceptance.

[Local deployment profiles](home-edition.md).

### A fully autonomous enterprise AI cluster

A company or agency with a powerful private server or cluster can also host the principal high-capability model that interprets tasks, plans production and controls Vantemio tools. Supporting models, image/video generators, memory, editing, audio, rendering and quality checks also run locally. This profile needs no external cloud AI, cloud assistant or external generation for the production workflow: the customer infrastructure performs the entire process.

Self-hosting requires capable models with available weights or contractual on-premises rights. Large GPU capacity alone does not allow installation of a closed model offered only through another provider’s cloud. Supported models, adapters, quality and tasks are recorded in the compatibility matrix and validated at acceptance. The customer cluster is assessed as a separate deployment project and is outside Vantemio’s own initial compute-worker budget.

### Deployment choice and product priority

Vantemio develops one engine with local, hybrid, cloud and private enterprise deployment options. Creators and small teams need a clear workflow and suitable hardware; agencies need customer-data control, repeatability and approvals; enterprises need control of their own environment. Selection depends on quality, total cost, workload and access rules, not mandatory dependence on one cloud or GPU class.

The shared production workflow and replaceable model adapters are validated first; distinct delivery profiles follow. Fully local operation does not require a fixed amount of GPU memory: capacity depends on selected models and concurrency. A large server does not replace quality, compatibility and licence checks. Cloud capacity remains available for authorized tasks, never as a hidden dependency of a private profile.

Cloud AI and local/hybrid execution are developing in parallel. 

[Microsoft — hybrid intelligence](https://news.microsoft.com/source/emea/2026/10/building-windows-for-hybrid-intelligence/) · [AWS — deployment choice](https://aws.amazon.com/blogs/security/enabling-ai-sovereignty-on-aws/) · [Anthropic — cloud infrastructure](https://www.anthropic.com/news/anthropic-amazon-compute).

[Grant project and acceptance criteria](grants.md).
