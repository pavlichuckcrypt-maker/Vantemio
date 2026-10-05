# Vantemio Base/Boson integration

This is the reviewed v12 blockchain-commerce source snapshot. Historical VidRa/AIMmontag names remain in identifiers. It is separate from the private video-production engine.

## Components

- `../tools/`: acceptance-ledger validation and the Base publication adapter, required by the module tests.
- `contracts/`: media-release passport and test-credit contracts.
- `src/`: Base/Boson commerce, release binding, purchase recovery, protected digital delivery, Safe approval checks and public-evidence filtering.
- `auditor-site/`: wallet discovery, signed authentication, account isolation, seller inventory, asset upload and buyer/seller transaction workspace.
- `public/`: local studio and marketplace interfaces.
- `test/` and `auditor-site/*.test.mjs`: unit, security and isolated HTTP tests.
- `evidence/`: historical redacted testnet/fork engineering reports. They are not a formal audit or proof of current production availability.

## Install and test

Node.js 24.19 or later and Python 3 are required. Use npm to install the locked dependencies. The tests use disposable local state and an owned loopback HTTP server.

```sh
cd blockchain-demo
npm ci
npm test
npm run test:site
```

The checked source package previously passed 105 module and 71 interface checks. Publication verification is recorded in `../docs/VERIFICATION.json`.

## Scope

Base Sepolia is the verified testnet. Local-fork checks are separate evidence. The code rejects unsupported networks and does not establish mainnet readiness. A new seller's complete public-wallet acceptance and independent audit remain pending. The site is a development interface, not a hosted customer product.

Private runtime state, keys, wallet vaults, account databases, local media and owner-specific packaging utilities are not included. Runtime wallets are generated locally, never shipped in this repository.

## Publication adjustments

The original source snapshot is preserved except for the public documentation allowlist in `auditor-site/server.mjs`. Internal application drafts were excluded and replaced with current technical review documents under `auditor-site/docs/`. Local runtime wallets and media are not supplied; tests can run independently of historical testnet state.
