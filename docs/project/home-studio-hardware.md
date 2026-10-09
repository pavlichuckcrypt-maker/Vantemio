# Vantemio Home — an application for your own computer

Revision 0.16 · 2026-10-08 · Startup product specification · functions, architecture and implementation criteria.

## 1. Purpose

Vantemio Home is the planned installable Vantemio edition for individual and home use. Users will be able to download it, install it on their own computer and use Studio, shared project context and supported automation within the selected offering.

Home follows the platform architecture: one coordinator, application modules, bounded executors and result history. Its goal is to make the production workflow accessible on an individual creator's hardware without requiring enterprise deployment.

## 2. Subscription and licence

Two access options are planned: subscription and licensed delivery. Pricing, licence term, installations, activation, updates, support and included modules will be defined before release. A licence is not described as perpetual unless its terms expressly provide that. Neither option implies source-code or exclusive engine-rights transfer.

Home installation describes how and where the application is used, not an automatic prohibition on monetizing content. The Home licence defines permitted commercial scope; material rights, model licences and platform rules remain applicable. External AI, media generation and infrastructure are billed separately unless expressly included in a package.

## 3. Hardware requirements

The following is Home's design hardware baseline. Acceptance testing will establish supported operating systems, drivers, model versions and workload profiles before the installer is released.

| Resource | Minimum configuration | Recommended / expanded |
|---|---|---|
| Graphics card | NVIDIA GeForce RTX 5070 Ti, 16 GB VRAM | RTX 5090; expanded option: 2–3 RTX 5090 cards |
| System memory | 32 GB RAM | 64 GB; preferably 128 GB for demanding projects |
| Storage | 1 TB SSD — limited headroom for models and projects | 2–4 TB SSD for models, source media, cache and outputs |

The minimum configuration targets a bounded workload profile. Supported models, adapters, quality and tasks are recorded in the compatibility matrix and validated at acceptance. Free-space needs depend on selected components and media size; 1 TB quickly limits libraries and retained projects.

Two or three RTX 5090 cards are an expanded option for suitable parallel workloads. Multiple GPUs do not automatically pool VRAM: distribution depends on the model and executor. Such a system requires checks of power, cooling, chassis, slots and workload support. The example GPU count is not an architectural ceiling.

### Station and additional devices

For hardware at or near the minimum, the baseline Home setup is **one AI-compute station plus at least one additional device for editing, Blender, graphics creation and rendering**. That additional device can be a laptop or a second desktop suited to the selected production tasks.

The RTX 5070 Ti, RAM and SSD requirements above apply to the AI station, not the combined resources of all devices. The additional laptop does not need to duplicate the AI-station configuration: suitability depends on tools, scene complexity and assigned work.

| Setup | When it applies | Work distribution |
|---|---|---|
| Station + at least one device | Station is at or near the minimum | Station handles AI; laptop or second PC handles editing, graphics and rendering |
| One powerful station | Sufficient GPU, RAM and other resources remain after loading AI models | AI and production tools share one machine within a validated resource budget |
| Station + multiple devices | Additional capacity and parallel tasks are needed | Two, three, five or more laptops or PCs receive suitable bounded jobs |

An additional device is part of the minimum setup, not merely an optional recommendation. One computer is sufficient only when resource headroom for AI, Blender, graphics and rendering has been established for the selected project. A high-end GPU name alone does not establish that budget.

Executor count follows workloads and available resources; there is no architectural ceiling of two, three or five devices. Every executor connects through the Home coordinator's shared registry without creating another control centre. Work is assigned according to device capabilities and current load.

## 4. Local architecture and data

In a separate Home installation, the user's primary computer coordinates that installation. Additional resources receive work through its shared registry. This is a distinct customer deployment, not a parallel controller of Vantemio's existing production studio.

Station retains authority over the operating Vantemio studio. Home does not transfer its queue, credentials, memory or production history to users' computers. Each future customer installation defines its own data scope, access controls and backups.

Local operations use the selected hardware. Cloud-model calls, external generation, social publishing and other network features require appropriate connections and permissions. The delivery profile defines local operations, external connections and data-transfer permissions.

The website policy’s 90-day period applies to applications and its specified categories, not automatic deletion of projects on the user’s computer. Home users manage local projects and backups. Activation, diagnostics and support data, recipients and retention are disclosed separately before release. Sending source media or project history for support requires a separate clear user action; credentials and passwords are excluded from that export.

## 5. Installation and release scope

Before downloads open, the release will specify supported operating systems and drivers, models and licences, download size, installer-integrity checks, updates and removal. Installation checks resources and warns about insufficient storage or memory before downloading large components.

Users receive only the modules available in their selected release. Locally creating a video does not establish API-publishing or monetization eligibility. TikTok retains its separate interface, consent and application-admission requirements.

## 6. Development stage

Home is part of the product-delivery roadmap. This page does not announce an available public installer or active pricing. Preparation includes hardware validation, packaging, activation, updates, project recovery and desktop-data terms.

[Technical documentation](technical.md) · [Packages and licences](pricing.md) · [Roadmap](roadmap.md) · [Commercial model use](licenses.md) · [Terms](terms.md)

## 7. A laptop without an AI station

A separate future [Cloud client](cloud-edition.md) is planned for a regular laptop without an owned AI station. Compute runs on Vantemio infrastructure after deployment and testing. This option does not change local Home requirements.

## Local generation and a private customer installation

Local image and video generation model integrations are planned. When customer hardware, selected models and licences support the agreed quality, resolution, duration and speed, generation runs on the customer’s computer or server. An external video-generation service and its MCP/API connection are not mandatory for this profile. Editing existing footage also does not require a generator.

A supported cloud assistant, for example Claude Code through a Vantemio MCP connector, may control a locally executed production workflow. The cloud assistant remains an external dependency and receives only agreed information needed for the task. Keeping files locally does not mean prompts, text excerpts, images or tool results never leave the device. The deployment settings must disclose the data categories and permissions.

For customers with their own workstation, server or agency infrastructure, a separate On-premises deployment is planned: orchestration, memory, a local language model, image/video generation, speech, editing, graphics, rendering and checks run within the customer’s environment. A fully private production profile does not require a cloud assistant or external generator when all selected components support local execution and pass acceptance. Quality and features depend on the configuration.

MCP may remain the local interface between the assistant and tools. Removing an external generation MCP service does not remove local MCP use. External calls and automatic cloud fallback are disabled by default in the private profile; enabling them requires separate customer authorization.

Local model selection, generation quality and concurrency are defined by the hardware profile and validated during installation acceptance. Assessment records model versions, commercial rights, GPU/VRAM, RAM, storage, concurrency and execution time. Agreed samples test image/motion quality, duration, resolution, stability, recovery and operation without external requests. Compatible local models use adapters; arbitrary models are not automatically supported.

Private production and an air-gapped installation are separate conditions. An isolated deployment also requires local activation/licensing, verified update delivery, no outbound telemetry, local checks and backups. Internet research, social publishing and other external operations require separately authorized connectivity or controlled export.

The customer installation has its own coordinator, registry, workspaces and data; staff and additional devices receive bounded permissions. It does not inherit the production Station’s queues, secrets or memory. 

### A fully autonomous enterprise AI cluster

A company or agency with a powerful private server or cluster can also host the principal high-capability model that interprets tasks, plans production and controls Vantemio tools. Supporting models, image/video generators, memory, editing, audio, rendering and quality checks also run locally. This profile needs no external cloud AI, cloud assistant or external generation for the production workflow: the customer infrastructure performs the entire process.

An illustrative large-enterprise configuration may have around 1,000–2,000 GB of aggregate GPU memory, including an intermediate configuration around 1,500 GB. This is a scale example, not a minimum, immediate purchase recommendation or assurance that every model will fit. Multiple accelerators do not automatically form one memory pool: interconnects, distributed execution and capacity planning must match weights, precision, context, concurrency and speed requirements.

Self-hosting requires capable models with available weights or contractual on-premises rights. Large GPU capacity alone does not allow installation of a closed model offered only through another provider’s cloud. Supported models, adapters, quality and tasks are recorded in the compatibility matrix and validated at acceptance. The customer cluster is assessed as a separate deployment project and is outside Vantemio’s own initial compute-worker budget.
