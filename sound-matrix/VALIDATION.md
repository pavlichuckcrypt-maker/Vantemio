# Publication validation — 2026-10-06

The public package was installed into an isolated Python 3.12 environment. The documented contract and plan commands ran using the synthetic request. A real PCM24 WAV was cropped through the installed CLI, reopened and compared byte-for-byte with the expected sample interval. Route validation tests passed, including changed identities, invented timing, insufficient context and invalid source reuse. The CLI regression verifies WAV readback and refusal to overwrite an existing output.

The existing blockchain suite passed 105 tests. The added bridge test checks disabled operation without explicit configuration, isolated event append/query, rejection of model advice, and reopening without replaying events. It does not prove real Station graph consumption, live chain settlement, final MLT mixing or production readiness. No film job, transaction, deployment or public social post was started for publication checks.
