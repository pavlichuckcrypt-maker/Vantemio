# TikTok integration and publishing control

Revision 0.14 · 7 October 2026

## 1. Purpose and status

Vantemio Studio creates original media. The planned user-facing TikTok connector lets a creator connect their account and send a selected output with control over settings. Public connection is in development. This page defines requirements; it does not claim production admission or a completed audit.

Official Vantemio media operations and a future external-creator product are separate scenarios. Direct Post is not intended for an application serving only developer or team accounts. An external connector needs a genuine user purpose; changing the description does not create that product. [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines).

## 2. Connection and permissions

Creators connect through official OAuth. Vantemio does not request TikTok passwords. The server verifies the request/session relationship, protects the application secret and restricts token access. Cancellation or an invalid callback does not establish a connection.

Direct Post uses `video.publish`. Additional scopes, including `user.info.basic`, `video.upload` and `video.list`, are requested only for separately implemented features. Actual permissions are shown before authorization; calendars, analytics or CRM do not justify speculative access. [Direct Post API](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post).

## 3. Publishing screen

Before transfer, creators see the destination account and a preview of the selected version, edit the caption and select settings. Current `creator_info` determines available visibility, interactions and duration. Unavailable options are not offered. [Creator Info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info).

Visibility has no default; comments, Duet and Stitch are not preselected. Own-brand promotion, paid partnerships and AI content are disclosed. Applicable music and branded-content confirmations precede the action. The application does not impose a promotional watermark. [User-experience rules](https://developers.tiktok.com/docs/en/content-sharing-guidelines).

Choices map to `privacy_level`, `disable_comment`, `disable_duet`, `disable_stitch`, `brand_organic_toggle`, `brand_content_toggle` and `is_aigc`. Incompatible settings are blocked with an explanation. [Direct Post schema](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post).

Commercial disclosure starts off. Once enabled, transfer remains unavailable until the creator selects own-brand promotion, a third-party brand or both. Branded Content cannot use “only me” visibility: the incompatible option is blocked without silently changing visibility. Unaudited mode does not bypass this check. A creator_info publishing restriction prevents a new attempt. Local files use the designated FILE_UPLOAD route; already hosted server media uses PULL_FROM_URL under TikTok rules.

## 4. Explicit creator authorization

Creating or accepting media does not automatically authorize a TikTok transfer. Creators confirm the particular action. Vantemio binds authorization to file version, account, caption, settings and disclosures as its own control standard. Material changes prevent reuse of the previous authorization.

Preparation and planning automation do not remove mandatory creator actions. Creators can cancel before confirmation. After transfer, the actual processing stage is shown rather than a promise of immediate publication.

## 5. Transfer and outcome

Transfer methods follow TikTok requirements. `PULL_FROM_URL` uses a verified HTTPS location without redirects, available for the necessary download window. `FILE_UPLOAD` respects the issued URL and its lifetime. [Media Transfer Guide](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide).

The `publish_id` is associated with the original operation. Status is checked through the designated interface; an unknown network outcome does not trigger automatic re-upload. Errors, quotas and publishing restrictions are explained. [Get Post Status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status).

## 6. Data, disconnection and deletion

The connector processes account identity, granted scopes, tokens, selected media, caption, settings, authorization and publication state. Data supports connection, authorized actions, diagnostics and user requests. OAuth consent does not include marketing or model training.

Creators may revoke access in TikTok settings and request Vantemio disconnection. New actions stop; credentials are refreshed or deleted under applicable rules. A rotated refresh token is retained without exposing the secret to the client. [Token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management).

Retention, recipients and rights are covered in [Privacy](privacy.md); requests follow the [data-deletion page](data-deletion.md). Disconnecting does not remove an existing post. TikTok handles received material under its own [privacy policy](https://www.tiktok.com/legal/page/row/privacy-policy/en).

## 7. Pre-launch review

An application must demonstrate a genuine completed workflow, not only website copy. Initial review preparation includes a Sandbox demonstration, product/scope explanations and accessible Terms/Privacy. Name, icon, domain and actual screens must match. [App Review Guidelines](https://developers.tiktok.com/docs/en/app-review-guidelines).

App Review and Direct Post Audit are tracked separately; unaudited clients have visibility restrictions. Public launch follows the permissions actually granted. Documentation is not proof of TikTok approval. [Direct Post getting started](https://developers.tiktok.com/docs/en/content-posting-api-get-started).

[Terms](terms.md) · [Privacy](privacy.md) · [Data deletion](data-deletion.md) · [Technical documentation](technical.md)
