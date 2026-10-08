# Vantemio Market — service fulfillment design

Design summary 0.1 · 8 October 2026 · Development requirements, not deployed contracts or passed acceptance tests.

This English summary accompanies project documentation 0.14 and the detailed fulfillment design prepared on 8 October 2026. Vantemio Market is the product name; Boson Protocol is its commerce technology.

## Order lifecycle

Accepted service specification → payment/commit → production → version-bound quality review → protected delivery for buyer review → acceptance, targeted revision or full refund → reconciled financial outcome.

Station remains the authoritative production coordinator. Extend existing order, release, delivery, event and reconciliation modules; do not create a second controller or escrow. Historical demo receipts remain historical evidence. A previous complete-before-delivery demo does not establish the new review-before-settlement workflow.

## Service specification

Before purchase, bind an immutable, versioned specification to the offer and participants. Include deliverables, formats, rights, measurable criteria, required review classes, production/review/revision/absolute deadlines, price and currency, revision allowance, refund terms and evidence-retention schedule. Ambiguous or unsupported profiles must be rejected before admission.

Profiles have category-specific validators: video requires decoding, scene coverage, timing, audio and subtitle checks; graphics requires dimensions, composition and delivery formats; audio requires duration, levels, intelligibility and rights; localization requires language and alignment checks. Creative criteria require substantive review as well as machine measurements. Unknown licence status blocks commercial release.

## Quality, versions and delivery

A result has a stable order identity, monotonic revision, exact file SHA-256 and manifest commitment. Required review classes cover machine measurements, substantive evaluation and release authorization. A generator cannot approve its own output alone. Duplicate answers or multiple role keys held by one operator are not independent organizations.

Review records identify criterion, finding, severity, timecode/component, evidence digest, coverage and uncertainty, with model/configuration and policy versions. Timeout, invalid structured output, missing modalities or reviewer disagreement produce REVIEW_REQUIRED, never automatic PASS. Any blocking failure prevents delivery regardless of an average score. Input content cannot change policies or invoke privileged tools through embedded instructions.

Encrypted media and private evidence remain off-chain. On-chain records contain safe commitments, versions and signed attestations. Merkle roots may bind component manifests; inclusion proofs establish membership, not quality. An IPFS CID alone provides neither confidentiality nor lasting availability.

Delivery binds the active, approved revision to the correct recipient and an expiring grant. Range/resume must preserve authorization. Buyer review follows accessible delivery and precedes final acceptance. Object/key unavailability is not delivery. Previews must be identified and sufficient for the agreed review; final assets cannot be silently substituted.

## Tokenization and rights

Distinguish the Boson purchase rNFT, a quality attestation for a specific revision, and a passport for the buyer-accepted result. Optional result NFTs record provenance and agreed rights; they do not automatically transfer copyright or prove originality. Revised outputs receive new digests and superseding records; old provenance is retained.

## Proposed contract responsibilities

Functional names below are design roles, not implemented ABI names:

- ServicePolicyRegistry: permitted profiles, schema/policy versions, verifier roles and transitions.
- OrderQualityRegistry: Boson order binding, immutable conditions, revisions and attestations.
- DeliveryGate: authorization for a specific recipient and artifact.
- SettlementGate: mandatory quality/acceptance control in the actual financial path, subject to supported Boson integration.

Attestations bind network/contract/order, specification and policy hashes, revision, artifact digest, evidence and coverage commitments, criterion results, verifier/signer-set version, issue/expiry times and nonce. Define canonical typed encoding and hash algorithms explicitly. EIP-712 domain separation does not replace replay guards. ERC-1271 support, gas limits, key revocation and reentrancy protections require integration-specific verification.

Contracts verify signatures, commitments, thresholds represented in signed structures, role quorum and state transitions. They do not watch videos, run AI or independently establish artistic quality.

## Financial-path limitation

The inspected Boson source permits completion without a Vantemio quality attestation, including completion after the dispute period. A frontend, wrapper, NFT metadata or separate registry cannot enforce a strict payout condition by itself.

A compatible prototype can gate its own delivery and track disputes, but must not claim to prevent every payment without QA. The intended strict profile requires a supported contract enforcement point covering every successful payout path, including direct, batch, meta-transaction and dispute outcomes. Its availability has not been established. A separately controlled fork or facet change would require authority, compatibility review and independent audit, and must not be represented as the official shared deployment.

Target delivery invariant: DeliveryGranted implies active revision, valid QA, correct recipient and no hold.

Target successful-close invariant: CLOSED_SUCCESS implies valid QA, delivery for review, buyer acceptance of the same revision, reconciled settlement and no dispute.

Without verified enforcement, the strict paid profile remains closed. A backend label cannot reverse an actually finalized protocol transaction.

## Revisions, deadlines and refunds

Revision requests bind a scene, timecode or component to an existing revision. Changes produce a new version, recheck dependent sound/subtitles/transitions and validate the assembled result. Scope expansion requires an accepted amendment or new order; no unilateral charge.

The first product policy offers acceptance/payment or a full refund; partial corrections are distinct from partial monetary refunds. A buyer need not complete a revision before exercising an available refund. A ticket or ongoing repair does not pause Boson clocks. Read deployed voucher/dispute/resolution/escalation windows and reconcile any extension before expiry. Alerts do not establish that a dispute transaction succeeded, and the server cannot assume wallet authority.

Refund acceptance must account for price in token base units, penalties, deposits, fees, allocation and withdrawal. Pending, reverted or unknown outcomes are not paid refunds. Where the promised full amount exceeds a protocol outcome, the funding and lawful reimbursement mechanism must be established before sale. Dispute expiry is not universally a refund.

Refunds revoke future grants within agreed rights. Downloaded bytes cannot be remotely erased. Customer content is not automatically used for training.

## Implementation stages

F0: inventory existing mechanisms and deployed ABI/facets. F1: versioned profiles and accepted terms. F2: calibrated laboratory QA. F3: attestations and protected delivery. F4: explicitly labelled Boson prototype. F5: verified mandatory financial gate. F6: independent security and paid-service contract review. F7: bounded pilot. F8: further categories and cloud isolation/load tests.

Earlier stages do not establish later admission. Mainnet requires separate evidence.

## Required acceptance scenarios

The following 42 cases are a test plan, not successful test results.

| ID | Required case |
|---|---|
| SPEC-01 | Changed brief/threshold cannot reuse accepted specification |
| SPEC-02 | Unknown category/schema rejected |
| SPEC-03 | Incompatible service/protocol deadlines rejected |
| QA-01 | Corrupt frame near end detected by full decoding |
| QA-02 | Missing mandatory scene blocks technically valid media |
| QA-03 | Level, synchronization and subtitle defects identified |
| QA-04 | Unknown licence blocks release |
| QA-05 | Timeout/invalid output/missing audio requires review |
| QA-06 | Embedded instructions cannot bypass review |
| QA-07 | Reviewer disagreement/duplicate answer cannot form quorum |
| QA-08 | Labelled defect set measures false acceptance and rejection |
| ATT-01 | File substitution after QA blocks grant |
| ATT-02 | Cross-order/contract/network signature replay rejected |
| ATT-03 | Old revision attestation cannot approve new assembly |
| ATT-04 | Revoked, unauthorized or expired signer blocks grant |
| ATT-05 | Role duplication cannot satisfy independence policy |
| ATT-06 | EOA/contract signatures and malformed/large inputs handled safely |
| DEL-01 | Wrong tenant/order/recipient refused without private disclosure |
| DEL-02 | Range/resume and duplicate events preserve entitlement |
| DEL-03 | Missing object/key cannot start fictitious buyer review |
| DEL-04 | Storage substitution detected by digest verification |
| REV-01 | Changed scene timing rechecks dependencies and final assembly |
| REV-02 | Scope expansion requires amendment/new order |
| REV-03 | Declining revision preserves available full refund |
| REV-04 | Revision crossing dispute deadline has confirmed protection |
| BOS-01 | Direct completion/early redeem cannot bypass strict payout gate |
| BOS-02 | Third-party completion after dispute period evaluated |
| BOS-03 | Batch/meta/direct/dispute payout paths all satisfy policy |
| BOS-04 | Expired un-escalated dispute records actual state/payoff |
| BOS-05 | Resolver refusal/absence/decision have distinct outcomes |
| BOS-06 | ABI/facet/policy change requires compatibility admission |
| REF-01 | Pre-redeem cancellation with zero penalty returns full price |
| REF-02 | Post-redeem refund reconciles deposits, fees and withdrawal |
| REF-03 | Partial monetary settlement excluded from v1 product path |
| REF-04 | Pending/reverted/RPC-unknown refund remains unresolved |
| REF-05 | Refund revokes new grants without claiming deletion of downloads |
| SAFE-01 | Crash after transaction submission reconciles without repeat transfer |
| SAFE-02 | Duplicate/reordered events preserve monotonic transitions |
| SAFE-03 | Reorg/conflicting RPC results place new actions on hold |
| SAFE-04 | Pause/provider/QA outage retains a bounded refund path |
| SAFE-05 | rNFT transfer reconciles recipient and access rights |
| SAFE-06 | New rules cannot silently worsen an accepted order |

Evidence must identify code/environment versions, inputs, expected/actual results, hashes, logs and reviewer responsibility, distinguishing fixtures, forks, public testnet and production. No production launch, wallet signing or transaction is performed by publishing this document.

## Sources and unresolved dependencies

Source snapshot: Boson Protocol contracts commit f7ba850a37748cc9f5b2997386ce0d5b163e7aad. This does not establish the version deployed in any historical demo.

- [Exchange interface](https://github.com/bosonprotocol/boson-protocol-contracts/blob/f7ba850a37748cc9f5b2997386ce0d5b163e7aad/contracts/interfaces/handlers/IBosonExchangeHandler.sol)
- [Exchange implementation](https://github.com/bosonprotocol/boson-protocol-contracts/blob/f7ba850a37748cc9f5b2997386ce0d5b163e7aad/contracts/protocol/facets/ExchangeHandlerFacet.sol)
- [Dispute interface](https://github.com/bosonprotocol/boson-protocol-contracts/blob/f7ba850a37748cc9f5b2997386ce0d5b163e7aad/contracts/interfaces/handlers/IBosonDisputeHandler.sol)
- [Dispute implementation](https://github.com/bosonprotocol/boson-protocol-contracts/blob/f7ba850a37748cc9f5b2997386ce0d5b163e7aad/contracts/protocol/facets/DisputeHandlerFacet.sol)
- [Fund accounting](https://github.com/bosonprotocol/boson-protocol-contracts/blob/f7ba850a37748cc9f5b2997386ce0d5b163e7aad/contracts/protocol/bases/FundsBase.sol)
- [EIP-712](https://eips.ethereum.org/EIPS/eip-712) and [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271)

Before paid launch: establish supported gate enforcement, actual deployed compatibility and payoff, independent dispute resolution, funded full refunds, rNFT-transfer handling, calibrated QA coverage, commercially permitted providers, paid-service terms and evidence retention. These remain development dependencies.
