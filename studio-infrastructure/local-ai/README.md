# Local AI technical review package

This package exposes a curated model catalog and a selected existing response-validation function around Vantemio's private studio. It provides inspectable code for technical review without distributing the production engine.

## Inspectable source

- `response_contract.py`: the existing `validate_response_contract` function from the Station local-AI module, unchanged apart from newline normalization, with a standalone import and publication notice. It checks a bounded subset of JSON schema, including required fields, types, enum distinctions, lengths, extra fields and unsupported schema keywords.
- `MODEL_CATALOG.json`: a curated public projection of reviewed model declarations and model cards. Only model labels, registered names, roles, execution scope and evidence status are included.
- `model_catalog.py`: a new offline audit wrapper that validates this public snapshot. It is not the private model registry, production provider API, scheduler or model router.
- `test_contracts.py`: isolated regression checks using synthetic values. They make no model calls or production changes.

Download [the source archive](Vantemio_Local_AI_Audit_Source.zip), or inspect [the complete source patch](Vantemio_Local_AI_Audit_Source.patch). [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json) records excerpt provenance, adaptations and file hashes.

## Models and evidence

The catalog lists Qwen 27B, Qwen Coder 7B, Qwen VL 4B/8B, the Gemma visual model, Qwen3-TTS 1.7B, Whisper large-v3-turbo, Stable Audio Open and CLAP. Exact strings are project configuration identifiers. A declaration is not proof that a model is currently loaded or that every assigned capability is verified.

`recorded_local_execution` means selected actual local calls have retained results. `configured_route` identifies a configured helper path. `registered_specialist` identifies a registered component. `registered_historical_execution` adds retained historical execution evidence. None means production readiness or current fleet-wide availability.

Station owns orchestration, queues, memory and execution accounting. Registered workers remain bounded executors. The model list is a hardware-dependent baseline, not a fixed model requirement or fleet ceiling. Compatible alternatives need an adapter, resource checks, the required output format and task-specific quality validation.

Video and image generation remain external. The 70–80% reduction in eligible cloud AI inference spending is a planning target, not a measured total-cost saving. See [the infrastructure description](../../docs/pitch/LOCAL_AI_INFRASTRUCTURE.md).

## Run the offline checks

Python 3.10 or later, standard library only:

```sh
unzip Vantemio_Local_AI_Audit_Source.zip
cd vantemio-local-ai-audit
python3 -m unittest -v test_contracts.py
python3 model_catalog.py
```

Example using a synthetic response contract:

```python
from response_contract import validate_response_contract
schema = {"type": "object", "required": ["decision"],
          "additionalProperties": False,
          "properties": {"decision": {"enum": ["accept", "repair"]}}}
print(validate_response_contract({"decision": "repair"}, schema)["valid"])
```

This example schema is for review only. A structurally valid result is not evidence of factual correctness, artistic quality, authorization, rights clearance or accepted audio/video delivery. The bounded validator is not a complete JSON Schema implementation. Production callers must also bound input size and use trusted acyclic schemas.

## Publication boundary

The package excludes production routing, admission and resource-selection policies, model launching, hardware addresses, network transports, prompts, task context, scene and sound matrices, creative decisions, proprietary learning rules, real memory/graph contents and runtime leases or receipts. It has no inference server, generation endpoint, customer API or connection to the live studio.

These excerpts support due diligence. They do not constitute an independent audit or demonstrate a runnable complete product. Private mechanisms can be reviewed through separately arranged controlled access. See [NOTICE.md](NOTICE.md).
