# Vantemio technical documentation

Revision 0.14 · 7 October 2026 · Architecture, status and acceptance criteria

## 1. Scope and status

This document defines Vantemio architecture, mandatory execution contracts and acceptance criteria. Sections 2–11 establish the development standard; verification results demonstrate implementation.

| Label | Meaning |
|---|---|
| Current state | Connected feature within the stated scope |
| Existing component | Part of the system; end-to-end acceptance tracked separately |
| Acceptance requirement | Behaviour requiring a scenario and evidence |
| Planned / research | Not represented as an available production feature |

The official Vantemio YouTube channel is connected, including automated publishing. Current scopes, external IDs and reconciled outcomes belong in the acceptance package. Public multi-user publishing develops separately.

## 2. Central Station core

Station owns admission, queues, memory, registries, the technical graph and production accounting. Clients and compute nodes execute bounded jobs; task history does not make a client an independent controller.

Existing mechanisms must be extended while retaining original task identities and previous records. Authority over unfinished work transfers through Station mechanisms after reconciling processes, active assignments and completed outputs. Restarting work is not reconciliation.

The fleet expands through the registry without a fixed machine limit. Admission requires a read-only check of stable identity, capabilities and resources, collision prevention and the original registration-request identity. Assignment accounts for budgets and outstanding claims; an expired heartbeat does not automatically release them. Paginated registry observation does not start workers.

## 3. Modules and contracts

| Module | Input | Output | Status in supplied material |
|---|---|---|---|
| Studio | Brief, assets, style, constraints | Media version and review record | Components exist; end-to-end integration continues |
| Social | Accepted version, official channel, authorized settings | Platform status and analytics | YouTube connected; expansion in development |
| Marketing | Accepted creative and authorized budget | Campaign state and spending | Planned |
| CRM | Permitted contacts and events | Enquiries, deals and task relationships | Planned |
| Market / Donations | Separately agreed commerce and payment actions | Verifiable transaction outcome | Development / planned; public launch not claimed |

Proposed minimum result contract: `task_id`, `operation_id`, `input_version`, `output_version`, `executor_id`, `status`, `started_at`, `completed_at`, `cost_record`, `evidence_ref`. These are documentation requirements, not asserted field names in the existing database. Implementation maps them to the existing schema without creating a parallel registry.

## 4. Production and audio

Studio connects research, scripts, direction, assets, code-driven graphics, editing, audio and review. The source description lists Remotion, Blender, FFmpeg and Vidra/MLT. A scene relates an action, time interval, image, voice and sound. A revision retains these relationships and creates a new version.

| Role | Component in source description | Claim boundary |
|---|---|---|
| Narration | Qwen3-TTS 1.7B Base | Outputs described; exact weights need recording |
| Speech and intervals | Whisper large-v3-turbo, Silero VAD | Transcription and analysis described |
| Semantics and events | LAION CLAP HTSAT, AST AudioSet, PANNs Cnn14 | Diagnostic scores, not artistic-quality guarantees |
| Processing and mixing | FFmpeg EQ / compression / ducking | Software pipeline described in source package |
| Movement sound | Vantemio Sound Recipes | Source package describes 8 procedures and A1–A4 layers |
| Music | ACE-Step 1.5 turbo + LM1.7B | Integration and testing |
| Generative effects | MMAudio, AudioLDM 48k | Research; separate commercial clearance |
| Speech cleanup | DeepFilterNet3 | Experimental |

A model name does not establish the weights' licence. Commercial use requires the [licence register](licenses.md). A WAV file, completed render, editorial acceptance and publication are distinct events.

## 5. Providers and authentication

Supplied footage or software graphics may need no external generation. When generation is needed, check connector compatibility, permitted interface, access type, successful and failed attempt costs, and output rights. MCP describes an interface, not guaranteed free or authorized access.

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

These are test requirements; passing results are not claimed here. Verification does not require manually starting another ongoing production.

## 8. Analytics and comparative trials

Comparisons fix the same brief, inputs, duration, languages, graphics complexity and acceptance criteria. Record all attempts, failures and manual repairs; excluded runs require an explanation.

Required measurements: input/output/cached tokens, calls and retries; media-generator spending; time to accepted output; active human minutes; compute, storage and delivery; full cost per accepted item. Publish subscription-allocation and depreciation methods with results. The 50–80% target concerns assistant consumption, not total cost.

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
