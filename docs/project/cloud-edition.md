# Vantemio Cloud — client application and cloud compute

Revision 0.14 · 7 October 2026

## 1. Purpose

Vantemio Cloud is the planned combination of an installable client and Vantemio-operated computing infrastructure. From a laptop, a user signs in, creates a project, connects permitted channels and services, configures work, reviews media and controls available actions. AI, demanding graphics and rendering run on cloud executors.

The client is an interface to the shared system. Home requirements for an RTX 5070 Ti and an additional rendering device do not apply to this client. A laptop should suffice for the interface, file transfers and previews; supported operating systems, memory, video decoding and connection quality are established through client testing.

## 2. Three delivery modes

| Mode | Heavy-work execution | User requirements |
|---|---|---|
| Home | Own station and connected executors | Home-profile hardware |
| Cloud | Vantemio infrastructure | Client application, suitable laptop and internet |
| Hybrid | Some work local, some through an admitted cloud route | Agreed allocation of work, cost and data |

Home and Cloud are different profiles of one platform. Choosing Cloud does not automatically make the user’s computer a shared compute node. Contributing its resources requires separate explicit authorization and registration.

## 3. One logical cloud core

Cloud is built around one logical Vantemio core for tasks, memory, registries, rights and result history. Additional servers, GPUs and services expand capacity without establishing independent production authorities. User applications do not own independent cloud execution queues.

A shared core does not make projects public. Each user or workspace isolates assets, accounts, secrets, history and permissions. Staff, executor and support access is limited to the necessary task and recorded. Other users’ projects are not exposed as “shared memory”.

Station remains authoritative for the operating studio. Future cloud hosting extends the existing core; transferring authority or unfinished work requires a recorded handoff and reconciliation of actual outcomes. Opening Cloud does not silently move current production to another controller.

## 4. Learning from operations

The shared system is intended to accumulate experience and improve Studio and other modules. Three categories remain distinct:

- Project working data: needed to execute a task and kept within its isolated scope.
- De-identified technical statistics and permitted reusable solutions: help diagnose failures and improve routes, tools and quality. Secrets, personal information and private content are excluded, and re-identification risk is assessed before inclusion.
- Content or examples for model training: used only on a separately disclosed basis with necessary rights and separate explicit consent where required. Service access or OAuth is not that consent.

User materials do not enter a shared training dataset by default. Social-API data remains subject to platform restrictions; customer consent does not override them. Before enabling training, define purposes, dataset versions, recipients, retention, withdrawal and actual deletion capabilities. Removal from an already trained model is not promised without a supported mechanism.

## 5. Connections and control

Owners connect YouTube and other accounts through permitted methods. Each action binds a workspace, account, version and authority. TikTok retains required creator control. Application secrets are not embedded in distributed installers, and tokens are excluded from logs and support material.

The client shows queue state, progress, outcome, cost and available cancellation/stopping. Connection loss does not restart a job: reconnection reconciles the existing operation. Cloud and external charges are disclosed before execution; other people’s subscription credentials are not pooled as server access.

## 6. Scaling and load testing

Cloud must not rely on the founder’s personal computer to serve everyone. Launch requires dedicated infrastructure sized for the intended workload. Tests cover simultaneous active jobs, queues, VRAM/RAM, rendering, delivery, storage, isolation, recovery and cost.

Release terms define quotas, concurrency, project sizes, priority, overages and support. User capacity, unlimited usage and SLA commitments are not established before testing. One logical core supports an expandable resource fleet.

## 7. Funding and stage

Cloud deployment and load testing are planned after investment or other sufficient funding. Stages: requirements and budget → infrastructure → isolated pilot → load, data and recovery checks → public-launch decision.

Cloud is a development direction. This page does not announce pricing, an available installer, a launch date or guaranteed capacity. Cloud terms, processor/country information, retention, access, billing and support rules are published before user onboarding.

[Home](home-edition.md) · [Technical documentation](technical.md) · [Packages](pricing.md) · [Privacy](privacy.md) · [Roadmap](roadmap.md)
