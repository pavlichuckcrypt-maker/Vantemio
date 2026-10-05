# Base/Boson marketplace demo and transaction evidence

The published snapshot contains the implemented blockchain workflow and marketplace interface tested on 3 October 2026. It includes the studio-to-chain adapters, not the private AI editing engine.

## Implemented workflow

1. A studio output receives explicit final acceptance. The adapter validates the current editorial acceptance, exact video hash, recipient and terms. Rendering alone cannot authorize tokenization.
2. An accepted media version is bound to an NFT passport on Base Sepolia. Safe approval and current contract/owner checks protect publication. Repeating the same accepted release checks the existing certificate instead of minting another token.
3. A seller creates a content-linked offer through Boson Protocol. The marketplace supports video/digital assets, studio services and physical-item demo categories.
4. A buyer commits to an offer and receives the Boson redeemable NFT. Redemption, buyer identity and the exact accepted content govern digital delivery. Completion settles the exchange; cancellation, refunds and disputes have separate checks.
5. Studio-service orders use the marketplace order workspace and the accepted-output publication callback. The source includes the order and result-handling mechanisms. Historical service-category checks use demo buyer confirmation; they do not prove a new complete AI film was produced for a paying customer.

The content NFT passport and Boson redeemable NFT serve different purposes. Neither automatically transfers legal copyright.

## Actual external-wallet transaction flow

[Watch or download the 35-second MetaMask/Boson recording](../demo/VIDRA_METAMASK_BOSON_DEMO_EN.mp4). This is an edited UI capture; transaction details are recorded below.

[MetaMask flow report](../blockchain-demo/evidence/VIDRA_METAMASK_FLOW_VERIFICATION.json) records an actual Chrome/MetaMask workflow on Base Sepolia, offer **138**, exchange **261**, price **25 DEMO test credits**, final state **COMPLETED**. It also records an exact-byte browser download.

| Step | Testnet transaction |
| --- | --- |
| Commit | [0xcf1ad6…f138c](https://sepolia.basescan.org/tx/0xcf1ad65d455542e686aa38ad8ec73c11096092451c32eceae75dd63a87cf138c) |
| Redeem | [0xacb27a…66fbc](https://sepolia.basescan.org/tx/0xacb27a75e69feb095679890ee3f5d7de59dd5ebed3f376aa2b50f5bc4eb66fbc) |
| Complete | [0xc1f7e5…4c867](https://sepolia.basescan.org/tx/0xc1f7e5790a1b5a0ab96d9d9dd15a001239b38eb1b0705964612e62b74bd4c867) |

See the [deployment manifest](../blockchain-demo/evidence/BASE_DEPLOYMENT_MANIFEST.json) and [public receipt archive](../blockchain-demo/evidence/BASE_PUBLIC_RECEIPTS.json) for the deployed test contracts and other recorded transactions.

## Marketplace, accounts and security

- [Marketplace verification](../blockchain-demo/evidence/MARKETPLACE_VERIFICATION.json): 13 historical workflow checks, including content-linked offers, idempotent purchase, exact digital delivery, settlement, pause, refund and withdrawal.
- [Category verification](../blockchain-demo/evidence/MARKET_CATEGORIES_VERIFICATION.json): digital resource, studio-service demo, physical-item purchase/refund and tokenization without a sale.
- [Studio callback verification](../blockchain-demo/evidence/STUDIO_STATUS_VERIFICATION.json): actual authenticated Python callback, existing NFT replay, changed-acceptance rejection and operation-status observation.
- [Platform security review](../blockchain-demo/evidence/VIDRA_PLATFORM_SECURITY_AUDIT.json): internal adversarial checks, content substitution, restricted evidence, wallet receipts and HTTP access controls.
- [Safe authority checks](../blockchain-demo/evidence/SAFE_AUTHORITY_VERIFICATION.json) and [signed-transaction checks](../blockchain-demo/evidence/SIGNED_TRANSACTION_VERIFICATION.json): implementation, owners, threshold and exact transaction bindings.
- [Account implementation and tests](../blockchain-demo/auditor-site/): separate wallet-authenticated users, persistent account storage, owner-scoped inventory, order access and simultaneous-session isolation. Test fixtures do not contain real user credentials.

The selected publication passed **105 module tests and 71 interface/account tests** on 4 October 2026. See [VERIFICATION.json](VERIFICATION.json). No chain transactions were sent during that rerun.

## Review scope

This is a reproducible development demo and recorded testnet evidence. Runtime wallets, account databases and private local media are excluded. Historical reports retain their original dates and limitations; an earlier pending check may have been covered by a later report. The actual external-wallet report above is later than the internal security-review report.

All demo Safe signers were on one Mac, so independent key custody is not established. The public repository does not claim mainnet readiness, real physical fulfillment, paid service performance or an independent security audit.

The AI editing and production studio remains in a private repository. Reviewers may request controlled access from the team for due diligence. Its proprietary implementation is not part of this public source snapshot.
