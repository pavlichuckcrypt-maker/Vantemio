# Local AI infrastructure

Vantemio is developing local inference capacity to reduce recurring cloud-model usage. Station is the authoritative coordinator: it admits tasks, manages queues, memory and execution registries, validates model outputs, and assigns bounded work to registered compute nodes. Station, the Windows Book and MacBook are the currently known nodes. The registry can admit additional machines after identity and capability checks.

## Models and responsibilities

| Component | Responsibility | Evidence and limit |
| --- | --- | --- |
| Qwen 27B, quantized local build | Structured scene planning, graphic-action choices, narration-related planning and bounded semantic corrections | Actual GPU responses have been accepted by the existing Station workflow. This is the project label for its local build. It does not establish acceptance of an entire film. |
| Qwen Coder 7B, Book helper | Bounded code assistance requested and accounted for by Station | The helper route is configured. Current availability and a successful response require a fresh readiness probe. Book remains an executor, with no independent production authority. |
| Qwen VL 4B / 8B and the registered Gemma visual model | Frame descriptions and visual screening | Registered specialists with historical records. Registration is not proof that every model is currently loaded or that a visual output has passed review. |
| Qwen3-TTS 1.7B CustomVoice | Narration synthesis | Registered local speech component with historical synthesis records. Voice licensing and output quality remain part of delivery validation. |
| Whisper large-v3-turbo | Speech transcription and timing evidence | Registered specialist with retained resource and execution records. |
| Stable Audio Open and CLAP | Sound generation and audio-text comparison | Specialist audio components. Qwen 27B can select structured sound actions but does not listen to or certify the rendered soundtrack. |

Model availability, resource budgets and outstanding work govern scheduling. Models do not all need to remain resident simultaneously. Cloud models remain available for work that exceeds local capacity or fails the required quality checks.

## Recorded local substitution

A recorded scheduled-owner step on 5 October 2026 accepted a Qwen 27B response containing 4,916 local tokens. The workflow preserved 14 creative fields, applied code-owned timing constraints and carried 16 scenes into the next recorded request without a new cloud call for that step. This is evidence of a specific local substitution, not a complete production benchmark or a claim that every studio task already runs locally.

## Cloud AI spending target

The founder's planning target is a **70–80% reduction in cloud AI inference spending for workflows eligible for local execution**, compared with performing the same work through cloud inference at comparable accepted quality. This target has not yet been validated across representative complete productions.

Measurement will compare cloud inference charges, local execution time, retries, acceptance quality and human interventions for equivalent briefs. Hardware, electricity, maintenance and local retries must also be included in a separate total-cost comparison. The percentage does not apply to the entire project budget, AI coding subscriptions, hosting, rendering, or external video/image generation.

Video and image generation remain external. Customer generation is planned to use customer-owned provider accounts through supported integrations. Vantemio's own provider usage supports development, demonstrations and founder-owned channels.

## Capacity development

The current Station uses an RTX 5070 Ti. The funding plan includes upgrading it to at least 96 GB system RAM and adding a 4 TB SSD. A separate RTX 5090 workstation with 128 GB RAM and a 4 TB SSD is an optional funding expansion, subject to workload measurements and quotations. Additional hardware would remain a bounded worker under Station.

This document publishes a high-level architecture description. Private prompts, production policies, model endpoints, credentials, runtime databases and proprietary editing logic remain excluded.
