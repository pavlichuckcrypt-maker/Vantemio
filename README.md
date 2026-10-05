# Vantemio

Automated video production and digital-service commerce on Base.

Vantemio is a proprietary software engine under active development by solo founder and developer Vitalii Pavlichuk. Video production is its first application; the broader goal is to automate the creation, validation and delivery of digital services.

## What is being developed

The engine combines Python orchestration, AI agents and execution rules enforced in code. Existing modules cover research, YouTube competitor and audience analysis, content planning, narration, media selection, scene sequencing, graphics, audio processing, rendering and quality checks. Agents return structured decisions; code validates media identities, timing, frame ranges and hashes before execution.

Tasks, requests and results are recorded to support recovery and reuse. Competitor-analysis results, production feedback and recorded errors provide guidance for subsequent runs. Quality failures are converted into specific repair tasks. Work continues on integrating these components into a reliable production workflow.

## Published source

- [Base/Boson integration module](blockchain-demo/)
- [Module setup and tests](blockchain-demo/README.md)
- [Demo workflow, marketplace and actual transactions](docs/DEMO_EVIDENCE.md)
- [Engineering verification](docs/VERIFICATION.json)

## Blockchain commerce

The Base integration connects accepted media versions to onchain provenance and ownership records. Boson Market connects studio-service orders and digital-asset commerce through Boson Protocol. Parts of the purchase and protected digital-delivery flow have been verified on Base Sepolia.

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

This repository publishes the Base/Boson blockchain integration module and the Boson marketplace demo in `blockchain-demo/`. The AI editing and production engine remains in a private repository to protect proprietary implementation and research. Reviewers can request controlled access from the team for due diligence; the studio source will not be published here. The small Python files under `tools/` validate accepted-media receipts and connect them to the blockchain module; they do not include AI editing, rendering or production orchestration. Runtime databases, wallet vaults, credentials and local operational data are excluded. Historical VidRa/AIMmontag identifiers are retained in the module source.

Status reviewed: 4 October 2026.
