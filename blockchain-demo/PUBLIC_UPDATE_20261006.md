# Development update — 2026-10-06

Published source updates cover release/transfer handling, marketplace asset bindings, order and delivery event lineage, request schemas, and the optional kernel event bridge.

The public bridge requires an explicitly supplied STATION_ROOT. It never discovers the author's workstation or copies private graph/memory databases. With no root, recording is disabled. A configured bridge appends events; graph mirroring is best effort and requires the separately installed private integration.

These changes are development source, not independent audit approval or proof of mainnet readiness. Local tests use isolated fixtures and do not establish live onchain integration. Existing deployment and transaction gates continue to apply. No credentials, wallets, media, production event logs or proprietary kernel source are included in this update.
