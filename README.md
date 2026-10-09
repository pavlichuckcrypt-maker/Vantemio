# Vantemio

Automated video production and digital-service commerce on Base.

Vantemio is a proprietary software engine under active development by solo founder and product architect Vitalii Pavlichuk. Video production is its first application; the broader goal is to automate the creation, validation and delivery of digital services.

## Current project documentation

[Current documentation — synchronized 8 October 2026](docs/project/README.md) · [Whitepaper](docs/project/whitepaper.md) · [Technical architecture](docs/project/technical.md) · [Roadmap](docs/project/roadmap.md) · [Home](docs/project/home-edition.md) · [Cloud](docs/project/cloud-edition.md)

The documentation covers deployment profiles, production and audio, social integrations, licensing, privacy, data deletion, future delivery economics and investor information. Implemented components, acceptance requirements and future capabilities are distinguished explicitly. The newer [Vantemio Market fulfillment design](docs/project/market-fulfillment.md) describes quality checks, version-bound delivery, revisions and full refunds as development requirements.

Website: [vantemio.com](https://vantemio.com/) · Contact: [support@vantemio.com](mailto:support@vantemio.com).

## What is being developed

The engine combines Python orchestration, AI agents and execution rules enforced in code. Existing modules cover research, YouTube competitor and audience analysis, content planning, narration, media selection, scene sequencing, graphics, audio processing, rendering and quality checks. Agents return structured decisions; code validates media identities, timing, frame ranges and hashes before execution.

Tasks, requests and results are recorded to support recovery and reuse. Competitor-analysis results, production feedback and recorded errors provide guidance for subsequent runs. Quality failures are converted into specific repair tasks. Work continues on integrating these components into a reliable production workflow.

## Published source

- [Base/Boson integration module](blockchain-demo/)
- [Module setup and tests](blockchain-demo/README.md)
- [Demo workflow, marketplace and actual transactions](docs/DEMO_EVIDENCE.md)
- [Engineering verification](docs/VERIFICATION.json)
- [Studio infrastructure excerpts: memory graph, response integrity and editor interface](studio-infrastructure/)
- [Pitch presentation](docs/pitch/Vantemio_Presentation_2026-10-05.pdf)

## Local AI infrastructure

Vantemio is developing local inference capacity under the Station coordinator. A quantized Qwen 27B build has already completed recorded scene/graphics planning and bounded repair steps locally. A configured Qwen Coder 7B helper on the Windows Book serves Station. Registered visual, speech and audio specialists cover frame screening, narration, transcription and sound processing. Each execution still requires readiness, resource admission and output validation.

Vantemio aims to reduce repeated prompting and cloud-token use by combining cloud AI with local tools and reusable production knowledge. Video and image generation remain external.

Station owns queues, memory, registries and production authority. Book, MacBook and additional registered compute nodes act as bounded executors. The registry supports expansion beyond the three currently known machines.

The listed models are an initial hardware-dependent baseline. Deployments can replace them with compatible alternatives, including larger models on stronger equipment. New models may need adapter work and validation of task schemas, resource requirements and output quality. The engine is designed to support model substitution, with no claim of universal plug-and-play compatibility. Actual savings depend on the selected models and hardware.

The current hardware request is one NVIDIA DGX Spark, included in the base resource budget. After installation, Qwen 27B, TTS speech and audio tools form a resident AI stack. Station retains orchestration and runs graphics, editing, rendering and additional development sessions; MacBook remains a development client. Additional models load as needed. The 12-month funding scenarios are **US$150,000 solo** or **US$400,000 with two developers**; both include US$50,000 for the founder.

See [model roles, evidence and cost assumptions](docs/pitch/LOCAL_AI_INFRASTRUCTURE.md). The proprietary production engine and internal runtime data remain private.

## Local AI code for technical review

The [local-AI review package](studio-infrastructure/local-ai/) publishes model declarations, a selected existing response validator, an offline catalog checker and synthetic tests. The archive and source patch contain inspectable Python code. Production routing, prompts, editing logic, learning policies and internal data remain private. These excerpts are development evidence, not an independent audit or a runnable studio.

## Blockchain commerce

The Base integration connects accepted media versions to onchain provenance and ownership records. Vantemio Market connects studio-service orders and digital-asset commerce through Boson Protocol. Parts of the purchase and protected digital-delivery flow have been verified on Base Sepolia.

## Current stage and engineering evidence

- Active development; no live customer product or revenue.
- The AI video-production engine is maintained in a private GitHub repository.
- A draft Base/Boson integration pull request is present in that private repository.
- The reproducible commerce-module source package passed 176 automated checks during the 4 October 2026 verification.
- These checks concern the commerce module. They do not establish readiness of the entire production engine or constitute an independent security audit.
- The founder estimates approximately two to six additional months to reach a demonstrable integrated prototype and evaluate readiness for external testing, subject to resources and engineering progress.

## Expansion

Video production is the engine's first application. Planned product delivery models include a hosted cloud service, installation on customer-owned hardware, and hybrid deployments that combine local execution with cloud services. The engine is intended to be adapted to business workflows, including marketing agencies, brand and social-media operations, and travel-service businesses.

A developer API and MCP integrations are planned to let external applications submit jobs, track execution and retrieve validated results. The developer API is not yet implemented; it is a future development option based on the engine's task orchestration and modular interfaces.

The longer-term goal is a service cycle that connects Boson Protocol orders to planning, execution, result validation and delivery of services or digital assets, with recorded outcomes informing subsequent operations.

## Public channels

- [Vantemio on X](https://x.com/vantemio)
- [Founder on X](https://x.com/Vitalii_RWA)

This repository publishes the Base/Boson blockchain integration module and the Vantemio marketplace demo in `blockchain-demo/`, plus selected supporting infrastructure excerpts in `studio-infrastructure/`. The AI editing and production engine remains in a private repository to protect proprietary implementation and research. Reviewers can request controlled access from the team for due diligence; the complete studio engine will not be published here. The infrastructure excerpts expose generic memory storage, dependency graph edges, response validation and selected VidRa client parsing, with Kdenlive-derived native editor automation source patch in the downloadable source package, without production policies or internal data. The small Python files under `tools/` validate accepted-media receipts and connect them to the blockchain module; they do not include AI editing, rendering or production orchestration. Runtime databases, wallet vaults, credentials and local operational data are excluded. Historical VidRa/AIMmontag identifiers are retained in the module source.

Infrastructure publication reviewed: 5 October 2026. Its 17 isolated checks concern the selected excerpts and do not establish readiness of the complete studio.


## Public Sound Matrix — development preview

The [Sound Matrix package](sound-matrix/README.md) publishes selected sound-authoring contracts, semantic routing, exact timing validation and PCM cropping, with installation and Claude Code integration instructions. It is in active development; the full studio, proprietary orchestration and internal data remain private. See its model-license and integration limitations before use.

Latest blockchain source changes are documented in [the development update](blockchain-demo/PUBLIC_UPDATE_20261006.md).

