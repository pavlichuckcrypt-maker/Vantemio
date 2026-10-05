# Vantemio studio infrastructure excerpts

Selected Python implementation from the developing Vantemio studio, prepared for technical review. This package exposes supporting storage and message-validation primitives around the proprietary production engine. It does not contain the editing engine or a runnable distributed studio.

## Included implementation

| Module | What reviewers can inspect |
| --- | --- |
| `memory.py` | SQLite observation history, versioned registry entries and dependency graph edges. Unchanged polling is deduplicated; transitions back to an earlier state remain distinct events. Input and code manifests can be linked to observations. |
| `wire.py` | Multipart response assembly with request-hash binding, stable response identity, offsets, size bounds and a final SHA-256 check. Transport is supplied as a callback; deployment details are excluded. |
| `vidra_reply.py` | Selected VidRa client reply parsing: bounded newline frames, partial reads, request matching, unsolicited events and truncated-frame rejection. The caller supplies an already-connected socket. |

[SOURCE_MANIFEST.json](SOURCE_MANIFEST.json) identifies the source modules, selected symbols, source snapshot hashes and adaptations. These are excerpts of existing code, with standalone wrappers where needed; they are not a complete copy of the current Station kernel. Historical `aim` and VidRa schema names are retained for traceability.

## Run the isolated checks

Python 3.10 or later; standard library only:

```sh
cd studio-infrastructure
python3 -m unittest discover -s tests -v
```

The 17 checks use synthetic observations, temporary databases, an in-memory transport callback and a fake socket. They cover state transitions, retained registry revisions, append-only triggers, graph references, malformed or tampered packets and reply framing. They do not contact the studio, providers, blockchain or production queues.

## Example: observation history

```python
from pathlib import Path
from tempfile import TemporaryDirectory
from vantemio_infrastructure.memory import Memory

with TemporaryDirectory() as directory:
    project = str(Path(directory) / "example-project")
    memory = Memory(Path(directory) / "example.sqlite")
    first = memory.observe(project, "example-stage", {"status": "ready"})
    repeated = memory.observe(project, "example-stage", {"status": "ready"})
    assert first == repeated
    print(len(memory.graph()["nodes"]))
```

The database is created by the example. No operational memory or production data is distributed with this package. An observation is a factual record, not a quality approval. SQLite triggers guard against accidental changes; they are not a tamper-proof security boundary against someone who controls the database file.

## Distributed execution context

In the operational design, Station owns orchestration, task admission, persistent memory and execution accounting. Worker devices perform bounded jobs under that authority. The published wire validator illustrates how returned bytes remain bound to the originating request; it does not expose device routes, SSH configuration, queue controllers, leases or admission policies.

SHA-256 checks provide integrity and request binding, not peer authentication. A real deployment must supply authenticated transport and enforce authorization separately. The callback must be implemented by the caller; this package supplies no network transport and launches no workers. The VidRa parser likewise supplies no connection, credentials or editor commands. Its event buffer is bounded; the excerpt does not include the full client's event-draining lifecycle.

## Private implementation boundary

The private engine includes production planning, editing decisions, scene and sound matrices, learning and improvement policies, prompts, provider routing and production orchestration. Those implementations are deliberately excluded. So are internal graph contents, memory databases, task history, customer data, media, accounts, credentials, deployment addresses and machine configuration.

The full VidRa editor fork is not included. This release includes only selected client-side reply parsing; publication of a fork requires identifying its source and preserving the applicable upstream licensing and notices.

These excerpts are development evidence, not a claim of production readiness or an independent security audit. See [PUBLICATION_REVIEW.json](PUBLICATION_REVIEW.json) and [NOTICE.md](NOTICE.md).
