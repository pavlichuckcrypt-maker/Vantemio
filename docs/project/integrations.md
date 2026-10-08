# Vantemio social integrations

Revision 0.14 · 7 October 2026 · Connection and expansion rules

## 1. Scope

The first production scenario serves Vantemio's official channels. Future Home-user and external-creator connections have separate permissions, data and admission stages; they are not represented as an already open service. Each platform has a separate record: purpose, account, permissions, actions, limits, verification state and policy-review date. Simultaneous support for every platform is not promised.

| Platform / group | Role | Planning status |
|---|---|---|
| YouTube | Official-channel videos, Shorts and analytics | Channel connected, including automated publishing; primary development scenario |
| TikTok | Short-form material and audience | Separate assessment of a permitted publishing route |
| Instagram / Facebook | Video formats and brand presence | Candidates; API and monetization assessed per account |
| Threads / X / LinkedIn / Pinterest | Additional distribution and communication | Candidates, not represented as connected |
| Twitch and other live platforms | Live media | Separate future scenario |
| Other platforms and services | Expansion based on value and permitted access | Registry remains open to additional adapters |

This is a scope map, not verified API capability coverage for every candidate. Access, cost and brand value determine priority.

## 2. Adapter admission

Before activation, record the account owner, application and mode, minimum scopes, access checks, formats, quotas, consent mode, publishing statuses, revocation, deletion and available analytics. Monetization is assessed separately by country, account type and program.

Scheduling requires a platform-permitted mode and owner authority. Account creation, API access, advertising, payout activation and publication are separate operations. A general “connected” label does not replace them.

## 3. YouTube

Official-channel acceptance must establish OAuth, destination, exact media version, metadata, visibility, external ID and processing outcome. Current [YouTube API policies](https://developers.google.com/youtube/terms/developer-policies) apply; users retain control over published data. [videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert) describes upload restrictions, including unverified projects. Connection alone does not establish a required audit.

Publication evidence is separate from [YouTube monetization](https://support.google.com/youtube/answer/1311392). Originality and value receive editorial review; mass-produced repetitive content is not treated as guaranteed income.

YouTube API metrics retain their original meaning, source and period; they must not be replaced by a proprietary score or prohibited derived metrics. Internal Studio costs and platform metrics are shown separately. Storage, refresh and deletion follow the selected API’s rules.

## 4. TikTok

The [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines) exclude Direct Post clients intended only to upload to developer or team accounts. The owned-channel operating model must therefore not be described as automatically eligible for that application. A permitted route is established before automation is promised.

If a genuine external product is developed, its separate contract includes preview, current creator information, visibility selection without a default, interaction settings, required disclosures and consent. App Review and Direct Post audit are tracked separately. Binding consent to a media version is a Vantemio engineering requirement.

Unknown transfer outcomes require remote-operation reconciliation before retry. This mechanism applies to owned channels and future customer scenarios; tests are listed in the [technical document](technical.md).

## 5. State accounting

Feature states distinguish unassessed, designed, configured, tested, platform-permitted, operational within agreed scope and suspended. Not every platform requires the same reviews. Calendar dates must not automatically advance status.

Policy changes record their source, date and affected actions. If an action is no longer permitted, new transfers stop; generated assets and history follow applicable retention rules.

## TikTok detailed contract

[User workflow, scopes, consent, data and admission](tiktok.md) · [Data deletion and disconnection](data-deletion.md).
