# Vantemio Home — an application for your own computer

Revision 0.14 · 7 October 2026

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

The minimum configuration targets a bounded workload profile. It does not promise simultaneous operation of every model and unrestricted parallel rendering. Free-space needs depend on selected components and media size; 1 TB quickly limits libraries and retained projects.

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

Local operations use the selected hardware. Cloud-model calls, external generation, social publishing and other network features require appropriate connections and permissions. Home is not represented as a fully offline product; release terms disclose network operations.

The website policy’s 90-day period applies to applications and its specified categories, not automatic deletion of projects on the user’s computer. Home users manage local projects and backups. Activation, diagnostics and support data, recipients and retention are disclosed separately before release. Sending source media or project history for support requires a separate clear user action; credentials and passwords are excluded from that export.

## 5. Installation and release scope

Before downloads open, the release will specify supported operating systems and drivers, models and licences, download size, installer-integrity checks, updates and removal. Installation checks resources and warns about insufficient storage or memory before downloading large components.

Users receive only the modules available in their selected release. Locally creating a video does not establish API-publishing or monetization eligibility. TikTok retains its separate interface, consent and application-admission requirements.

## 6. Development stage

Home is part of the product-delivery roadmap. This page does not announce an available public installer or active pricing. Preparation includes hardware validation, packaging, activation, updates, project recovery and desktop-data terms.

[Technical documentation](technical.md) · [Packages and licences](pricing.md) · [Roadmap](roadmap.md) · [Commercial model use](licenses.md) · [Terms](terms.md)

## 7. A laptop without an AI station

A separate future [Cloud client](cloud-edition.md) is planned for a regular laptop without an owned AI station. Compute runs on Vantemio infrastructure after deployment and testing. This option does not change local Home requirements.
