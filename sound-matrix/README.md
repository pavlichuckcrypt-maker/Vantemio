# Vantemio Sound Matrix — development preview

**Status: in active development. This is a usable public subset, not the complete private studio or an automatic finished-film soundtrack generator.**

The sound matrix connects observed scene actions to sound-design proposals. AI supplies structured acoustic descriptions and semantic routes; Python validates identity, evidence, frame/sample boundaries and approved source references. Code owns timing and filenames. An AI response cannot authorize generation or approve sound quality.

Use cases include motion graphics, presentations, short films, videos and animated images. Supply your own scene observations and timeline bindings. The current contracts use **24 fps and 48 kHz**; adapting other frame rates is future work.

## Included code

- Closed JSON contracts for acoustic authoring and routing.
- Routes for motion-conditioned sound, isolated effects, textures, atmosphere and reviewed existing audio. Music remains a separate planned/provider workflow.
- Deterministic hashes linking the request, scene, source proposal and route.
- Whole-second acquisition context for short effects, preserving exact action placement.
- AudioLDM and MMAudio handoff validation; PCM24 crop measurements without stretching or padding.
- Offline command-line adapters, synthetic examples and regression tests.

Private orchestration, production queues, memory, learning policies, account connections and proprietary montage logic are excluded. `EXPORT_MANIFEST.json` records source hashes and packaging adaptations.

## Install and try

Python 3.10+:

```sh
git clone https://github.com/pavlichuckcrypt-maker/Vantemio.git
cd Vantemio/sound-matrix
python -m venv .venv
# Activate .venv using the command for your operating system.
python -m pip install .
vantemio-sound contract examples/request.json contract.json
vantemio-sound plan examples/request.json proposal.json
python -m unittest discover -s tests -v
```

The example is synthetic. `contract` produces the prompt and JSON schema to give to an AI assistant. `plan` validates the `answer` in the request and produces a bounded proposal; it does not call a generator. Outputs are never overwritten automatically.

For an already generated **48 kHz mono PCM24 WAV**, exact cropping:

```sh
vantemio-sound crop generated.wav examples/crop-binding.json effect.wav
```

The example binding expects exactly two seconds of source PCM and places the effect at sample 48000. Supply a binding matching your actual reviewed asset. This command outputs a cropped WAV and measurement receipt, not a mixed soundtrack. Your editor or qualified audio adapter must place it at the recorded sample position, mix it, and check the final result.

## Integrating with Claude Code or another coding assistant

Ask your assistant:

> Read sound-matrix/README.md and examples/request.json. Integrate vantemio_sound_matrix into my existing editor workflow. Build a source need from my actual scene observations and original timing; keep identity hashes consistent. Call routed_author_contract, return its exact JSON answer, then validate it with compile_routed_author_answer. Connect only my licensed audio providers or reviewed existing assets. Do not treat a proposal as permission to generate. Preserve exact PCM placement, verify the resulting asset and final mix, and do not change timing to hide an error.

You need your own source-evidence adapter, generation/asset provider and editor integration. A text assistant does not hear or validate audio. `needs_context` requires additional evidence, not a fabricated sound. The MMAudio decoder additionally requires PyAV and NumPy in your environment; weights and model runtimes are not bundled.

## Model licensing and readiness

Route descriptors identify intended adapters, **not verified installed models**. MMAudio and the AudioLDM configuration carry non-commercial restrictions. They must not be presented as commercially cleared. Stable Audio and ACE-Step require checking the exact weights, dependencies and applicable terms before use. Publishing these contracts grants no rights to third-party weights, outputs or source media. Commercial users should connect a provider or sound library whose license covers their use.

Full generation, listening review, ducking, multitrack mixing and native editor consumer validation remain integration work. This preview makes no production-readiness, soundtrack-quality or cloud-cost-savings guarantee.

## Public code license

The original code in this folder is MIT licensed; see LICENSE. That permission applies to this selected public package only. The proprietary Vantemio engine remains private. Third-party models and media have their own licenses.

## 9 October 2026 interface update

The selected interfaces now preserve exact rational project rates (for example, `30000/1001`) and reject inexact sample boundaries and guessed decimal-rate substitutions. Source generation handles do not extend the action or permit retiming. The library tests exercise an isolated real PCM crop and refusal to overwrite an existing output. This is a development-source export, not Station runtime qualification.
