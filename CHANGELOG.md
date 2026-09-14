# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - Unreleased

Brings the SDK in line with the current dosya.dev API. Several 0.1.0 methods did not work against the API at all; they are fixed here, some with new signatures.

### Breaking changes

- **Default `baseUrl` is now `https://api.dosya.dev`.** The old default (`https://dosya.dev`) serves the website, so every call failed with "Invalid JSON response".
- `files.unlock(id)` and `folders.unlock(id)` now take a password and return `{ unlockToken, expiresAt }`. The old call always failed (400). To remove a lock use `lock(id, { lockMode: "none" })`.
- `files.hide(id, params)`: `params` is required and user/role targets are passed as `targets`. The old call sent `target_ids` (always rejected) and, without a mode, un-hid the file.
- `files.copy(id, { folderId })` returns `{ fileId, name }`. `newName` was never honoured.
- `files.move`, `files.lock`, `folders.lock` return the API's result instead of `void`. `files.shareByEmail` returns `{ shareUrl, accessMode, sent, failed }`.
- `download.getUrl()` returns `{ url, size, name, region, expiresAt }` instead of a string, and reports the real API error. `arrayBuffer()` and `stream()` throw `DosyaApiError` on failure.
- `folders.delete()` returns a trash-or-purge union and is never retried automatically.
- `workspaces.delete(id, { code, confirmName })` requires the emailed confirmation code (see `workspaces.requestDeletion`). `workspaces.update()` no longer accepts `defaultRegion` (fixed at creation).
- `fileRequests.resend(id, recipientId)` takes a single recipient. `fileRequests.update()` uses PATCH and accepts every editable field. `fileRequests.get()` returns `{ request, uploads, recipients }`.
- Removed `me.listApiKeys()`, `me.createApiKey()` and `me.deleteApiKey()`. Those endpoints require an interactive login and always returned 403 to an API key.
- `upload.init()` no longer sends `region` (ignored by the API; `UploadParams.region` is deprecated). `upload.resume()` checks that the body length matches the session.
- Response types now match what the API returns: file and folder listings, `FileDetail`, `FolderDetail`, search results (`shared[].linkId`, `SearchPagination`), activity entries (`entityType`/`entityId`), comments, workspaces, share links (`ItemShareLink`, `WorkspaceShareLink`, `CreatedShareLink`), file-request rows, upload results.
- Retries: POST and PATCH are no longer retried on 5xx, timeouts or network errors (only on a 429 with `Retry-After`), and a 429 without `Retry-After` is not retried.

### Fixed

- `folders.rename()` called the restore endpoint: it failed on live folders and silently restored trashed ones.
- Multipart uploads could corrupt their session when the first parts raced; the first part is now sent alone.
- Multipart uploads no longer read the whole file into memory; parts are sliced lazily.
- A timed-out attempt is retried with a fresh timeout instead of the already-expired one; timeouts surface as `DosyaTimeoutError`.
- A failed single-request upload is retried on a fresh session instead of the failed one (which always returned 409), and only after the server confirms the first attempt did not store the file.
- `complete` uses the upload timeout and is not repeated while an earlier attempt may still be finishing.
- JSON responses whose body stalls after the headers now time out instead of hanging.
- Webhook verification and `computeSha256` work on Node 18, which has no global `crypto`.
- `files.list({ deleted: true })` and `{ hidden: true }` returned the normal listing.
- `fileRequests.get()` (404), `fileRequests.update()` (404) and `fileRequests.resend()` (400) failed on every call.
- `workspaces.updateSettings({ require2fa })` never reached the API; keys with digits (`require_2fa`) now convert both ways.
- Permission maps and activity metadata keep their original keys instead of being camelCased.
- Every id is encoded as a single path segment and `.`/`..` are rejected, so an id cannot select a different endpoint.
- `Retry-After` is honoured on 503 (for GET, PUT and DELETE) as well as 429, and waits longer than `maxDelay` are surfaced instead of slept.

### Added

- `client.webhooks` (endpoint management, test, deliveries, redeliver) and `dosyadev/webhooks` with `verifyWebhookSignature()` and `constructWebhookEvent()`.
- `client.team`, `client.roles`, `client.regions`, `client.favourites`, `client.remoteDownloads` (with `waitFor()`).
- Files: `getLock`, `getHide`, `batchDelete`, `duplicates`; `list` gains `dir`, `unlockToken`, `groupId`, `folder` and column sorts; `move` can rename in the same call; share links accept `expiresAt`, `accessMode`, `recipientEmails`, `maxDownloads`.
- Folders: `restore`, `purge`, `children`, `search`, `createBatch`, `getLock`, `getHide`, `hide`, and folder share links.
- Upload: `many()`, `batch()`, `uploadPart()`, `complete()`; `sha256`/`computeSha256`, `sourceModifiedAt`/`sourceCreatedAt`, `expectedVersion` and `concurrency` options.
- Download: `blob()`, `thumbnail()`, `archive()`, `archiveEntries()`, `archiveEntry()`, `ttl` and byte ranges.
- Workspaces: `getSettings`, `uploadLimits`, `deletePreview`, `requestDeletion`, `transfer`, `leave`; `create` accepts `maxTotalStorageGb`.
- Shares: `update`, `analytics`, `withMe`. File requests: `list`, `addRecipient`, `removeRecipient`.
- Me: `permissions`, `updateName`, `revokeCurrentKey`.
- `DosyaApiError` exposes `code`, `details`, `retryAfter`, `method` and `path`. New `DosyaTimeoutError` and `DosyaWebhookSignatureError`.
- Client options `uploadTimeout` and `readYourWrites` (sends `X-D1-Bookmark` so a read right after a write is consistent). Per-attempt `timeout`.
- `SDK_VERSION` and `DEFAULT_BASE_URL` exports.
- Default 30-second per-attempt timeout (configurable via `timeout`) and a `debug` callback.
- Unit tests for every resource against a mocked network, and smoke tests for the built output.

## [0.1.0] - 2026-04-20

### Added

- Initial release
- `DosyaClient` with 11 resource namespaces: files, folders, upload, download, shares, workspaces, fileRequests, search, comments, me, activity
- Typed error hierarchy: `DosyaError`, `DosyaApiError`, `DosyaNetworkError`, `DosyaUploadError`
- Automatic camelCase/snake_case conversion for request/response bodies
- Retry with exponential backoff and jitter for 5xx and 429 errors
- `Retry-After` header support
- Rate limit callback via `onRateLimit`
- Injectable `fetch` for custom transports
- Chunked multipart uploads with concurrency and resume support
- Streaming and buffer downloads
- Dual ESM/CJS build via tsup
- Full TypeScript type definitions
