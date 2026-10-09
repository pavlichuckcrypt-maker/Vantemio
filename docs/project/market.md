# Vantemio Market

Public specification · 8 October 2026 · Integration plan

Vantemio Market brings together digital products and content production services: templates, layouts, graphics and video; custom films and Shorts; editing and processing of your own footage. We are designing transactions on Base through Boson Protocol.

## Three paths to your next result.

### Ready-made products

Templates, layouts, motion scenes, 3D assets and production packs. Review the contents and licence, choose a product and receive the files you purchased.

### Custom production

A film, Short, advert or graphics for your brand. The brief, price, delivery date, output format and revision allowance are agreed before payment.

### Process your own files

Provide your recordings and source assets. Studio performs the agreed editing, graphics, sound and narration work; the result returns to your order workspace.

## Our services. Your products, too.

Independent sellers will be able to create a profile, complete verification, list a product or service and define rights and delivery terms. Offers connect to Boson so buyers can see who sells, what is included and how delivery works.

## One storefront. Four clear responsibilities.

- **Vantemio Market** — Listings, seller profiles, client briefs and the order workspace.
- **Cloudflare** — Workers / Pages for the site and API; D1 for order records; R2 for private files; Queues for event delivery.
- **Base + Boson Protocol** — Offers, vouchers, exchange states, deadlines and dispute procedures.
- **Vantemio Studio** — The core admits production jobs and assigns work to registered compute nodes.

## Architecture and implementation plan

Protocol exchanges and production orders have separate states. The order links to chainId, contract address, offerId and exchangeId. A verified transaction confirms a purchase; uploading an output alone does not complete an exchange.

Integration uses Boson Core SDK / a contract adapter. Pin the network, Diamond address, SDK and ABI versions, payment token, fees and supported dispute resolver before launch. Validate SDK compatibility with Workers; reads and transaction preparation can be separated from client-side wallet signing.

Voucher redemption follows the offer terms and opens the protocol dispute window. Custom services define redemption timing, production deadline, review and revisions in advance. Digital delivery needs an entitlement handler; custom work needs a validated fulfilment and dispute route.

The indexer reads RPC events or verified webhooks, retaining block cursors and hashes while accounting for confirmations and reorganisations. Network, transaction and log index identify an event. Queue consumers deduplicate against a durable journal to avoid a second order, payout or render. Workers use bounded RPC scans scheduled by Cron Triggers or verified webhook requests, with state persisted between runs.

Cloudflare stores commerce records and submits production requests. The existing Studio core on Station admits jobs, owns their queue and assigns bounded work to executors. Recovery reconciles actual outputs and the original request identity before retrying. Workers do not perform heavy Blender rendering or video generation.

Private R2 objects require user and order-entitlement checks. Presigned URLs expire but may be shared until expiry and cannot prevent copying downloaded files. Source files, contacts and secrets stay off-chain; public terms and metadata references or hashes describe the offer.

Operations include D1 backups, file retention rules, action logs, monitoring, bounded retries and failed-event queues. Administration is separate from buyer and seller access. Budget includes Workers, D1, R2, Queues operations, RPC and compute; free quotas are not a free commercial-service guarantee.

Acceptance covers all three order types; verified Base Sepolia exchanges; cancellation and dispute paths; cross-buyer file isolation; duplicate-event handling without repeat work; cursor recovery after restart; payment, licence and delivery reconciliation. Mainnet follows review of addresses, roles, fees and recovery procedures.

## Know what you are buying.

### Rights and licensing

The listing defines commercial use, modification and source-file rights. A voucher represents a claim to fulfilment; copyright permissions are defined by the licence.

### Files and access

Source assets and outputs stay separate from the public catalogue. Delivery requires buyer entitlement checks and a time-limited link. Licence terms continue to apply after download.

### Transparent costs

Order price, fees and applicable network costs appear before the transaction. Generation, storage and compute are included in the agreed offer before work starts.

## The path to launch

1. **Storefront and orders** — Catalogue, profiles, workspace, private storage and APIs. No public payments at this stage.
2. **Boson on Base** — Validate offers, purchases, vouchers, fulfilment, cancellation and disputes on Base Sepolia, then review the Base production configuration.
3. **Production workflow** — Connect Studio: source files, job admission, progress, results, acceptance and delivery.

<!-- market-assets:start -->
## Vantemio as the first seller

The catalogue launches with Vantemio’s own products and services: visual and audio references developed by our team, infographics, editing templates, Blender scenes and assets, visual effects, motion graphics and production packs. Customers can also commission graphics, animation, sound and related materials. Independent sellers join after the purchase, delivery and support workflow is established.

Only materials for which Vantemio holds the necessary distribution rights enter the catalogue. Calling a product a reference does not authorise resale of third-party images, music or source files. Customer materials and confidential deliverables require separate permission before inclusion.

## Ready-made assets and commissioned services

**Ready-made digital product.** Before payment, the listing specifies previews, exact file contents, formats, software versions and dependencies, compatibility, licence, access period and support. Commercial use, editing, user limits and permission or prohibition of source-file resale are stated separately. Previews identify which elements are included. Buyers receive a copy of the accepted terms.

For a correctly delivered product matching its description, discretionary refunds solely for a change of mind after access is provided are excluded to the extent permitted by applicable law. This condition is disclosed before payment. It does not exclude mandatory buyer rights, non-delivery, corrupt or incomplete files or material misdescription. Remedies include restored access, correction or a full refund as appropriate under the circumstances and applicable law. Immediate digital supply uses any separate consents required by law.

**Commissioned service.** The brief, deliverables, quality criteria, deadlines and revisions are agreed before payment. Internal checks precede delivery for customer acceptance; feedback identifies the relevant scene, file or component. The initial settlement model provides a full refund where grounds exist under the order terms or law; partial monetary refunds are outside the standard workflow. Downloadable-product rules do not remove revisions or refunds for commissioned services. Mandatory buyer remedies remain available in both categories.

## Verified delivery through Boson

Boson Protocol handles offers, vouchers, settlement and protocol cancellation and dispute procedures. Vantemio checks completeness, integrity, format and agreed file quality before granting buyer access. Ready-made goods use the published package version; commissions use the approved deliverable version.

The delivery record links the order and exchangeId to the terms version, licence, file-manifest hash and signed verification report. Private files and personal information remain off-chain. The verification contract checks the authorised attester’s signature, order and version binding, validity period and replay protection. A hash establishes data integrity; quality checks and acceptance assess artistic quality.

Access-link issuance, successful download and customer acknowledgement are separate events. A signed buyer receipt identifies the exact package; neither a link nor a server log alone proves that a person opened and accepted the content. Missing receipts follow the offer and dispute rules, without fabricated delivery confirmation.

Store rules preserve operations and dispute deadlines available in the selected Boson version. A support ticket does not pause the protocol clock. Standard Boson completion has no built-in Vantemio file-quality check: any mandatory settlement gate requires a supported integration mechanism and separate verification. A no-refund sentence, hash entry or website interface cannot change that contract mechanism.
<!-- market-assets:end -->

## Sources

- [Boson — exchange lifecycle](https://www.bosonprotocol.io/docs-app/concepts/exchange-state-machine/)
- [Boson — marketplace / Base Sepolia](https://www.bosonprotocol.io/docs-app/quickstart/marketplace/)
- [Boson — contracts and ABIs](https://www.bosonprotocol.io/docs-app/tooling/contracts/)
- [Boson — events and indexing](https://www.bosonprotocol.io/docs-app/concepts/eventing/)
- [Cloudflare — R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare — presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Cloudflare — Queues delivery guarantees](https://developers.cloudflare.com/queues/reference/delivery-guarantees/)

- [Canada: refunds and exchanges](https://ised-isde.canada.ca/site/office-consumer-affairs/en/business-practices-and-consumer-concerns/refund-and-exchange)
- [Alberta: consumer rights](https://www.alberta.ca/consumer-bill-of-rights)
