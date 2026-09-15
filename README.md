# dosyadev

Official JavaScript/TypeScript SDK for [dosya.dev](https://dosya.dev) - file storage, resumable uploads, sharing, webhooks and workspace management.

[![npm version](https://img.shields.io/npm/v/dosyadev.svg)](https://www.npmjs.com/package/dosyadev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install dosyadev
```

Zero runtime dependencies. Works in Node.js 18+, Deno, Bun, Cloudflare Workers and modern browsers.

## Quick start

```typescript
import { DosyaClient } from "dosyadev";

const client = new DosyaClient({ apiKey: process.env.DOSYA_API_KEY! });

const { workspaces } = await client.workspaces.list();
const workspaceId = workspaces[0].id;

// Upload - small files go up in one request, large files resume part by part
const { file } = await client.upload.file({
  workspaceId,
  fileName: "report.pdf",
  body: pdfBlob,
  onProgress: (p) => console.log(`${p.percent}%`),
});

// List a folder
const { files, folders } = await client.files.list({ workspaceId, sort: "modified_desc" });

// Get a short-lived download URL
const { url } = await client.download.getUrl(file.id, { ttl: 600 });

// Share it
const { link } = await client.files.createShareLink(file.id, { expiresInDays: 7 });
console.log(link.url);
```

## Authentication

Every request carries an API key (`dos_...`). Create one in the web app under **Settings > API keys**.

| Scope | Can call |
|-------|----------|
| `read` | GET endpoints, download, archive download |
| `upload` | Upload endpoints and `folders.create` only |
| `full` | Everything an API key can reach |

A key can also be pinned to one workspace. Pinned keys are refused on routes whose workspace cannot be checked up front (for example webhook management, comment writes, share bundles, remote downloads, and team or share-link changes by id); the refusal is a 403 that says so.

Some account actions (creating or listing API keys, 2FA, password, sessions) require an interactive login and are not available to API keys, so they are not in this SDK. `client.me.revokeCurrentKey()` is the one key operation a key can perform on itself.

## Configuration

```typescript
const client = new DosyaClient({
  apiKey: "dos_...",
  baseUrl: "https://api.dosya.dev",   // default
  timeout: 30_000,                    // per attempt, JSON requests
  uploadTimeout: 600_000,             // per attempt, requests that carry file bytes
  retry: { maxRetries: 3, baseDelay: 500, maxDelay: 30_000 },
  readYourWrites: true,               // echo X-D1-Bookmark so reads see your writes
  onRateLimit: (info) => console.log(`${info.remaining}/${info.limit} left`),
  debug: (msg) => console.debug(msg),
  fetch: customFetch,                 // tests, proxies
});
```

### Retries

- GET, HEAD, PUT and DELETE are retried on 5xx, timeouts and network errors, with exponential backoff.
- POST and PATCH are only retried on a rate-limit 429 carrying `Retry-After`, which the API sends before any work is done. Otherwise a failed POST is never replayed, so it cannot create a duplicate share link, webhook or download job.
- A 429 without `Retry-After` is a business limit (for example "Daily limit of 20 remote downloads") and is surfaced immediately.
- If `Retry-After` asks for longer than `maxDelay`, the error is thrown with `err.retryAfter` set instead of sleeping.
- Uploads manage their own retries: before repeating an upload whose outcome was not seen, the SDK asks the server how the first attempt ended, so a file is never stored twice.

## Uploads

```typescript
// Files: fileSize defaults to the body's size
await client.upload.file({
  workspaceId,
  folderId: "fld_...",
  fileName: "clip.mp4",
  body: file,                         // File, Blob, ArrayBuffer, Uint8Array or ReadableStream
  sourceModifiedAt: file.lastModified / 1000,
  computeSha256: true,                // verified by the server on single-request uploads
  expectedVersion: 3,                 // 409 version_conflict if someone else wrote first
  concurrency: 4,
  abortSignal: controller.signal,
});
```

- Files up to 50 MiB are sent in one request; larger files use resumable 10 MiB parts. Parts are read with `Blob.slice`, so a multi-GB file is never held in memory.
- Uploading a name that already exists in the folder creates a new version of that file.
- The stored MIME type is derived from the file extension.

Resume after a crash with the session id from `DosyaUploadError.sessionId`:

```typescript
await client.upload.resume(sessionId, file, { onProgress });
```

Many small files in few requests:

```typescript
const results = await client.upload.many({
  workspaceId,
  files: localFiles.map((f) => ({ name: f.name, body: f, folderId })),
  onProgress: (p) => console.log(`${p.filesCompleted}/${p.totalFiles}`),
});
for (const r of results) if (!r.ok) console.warn(r.name, r.error);
```

`many()` packs files up to 5 MiB into `upload.batch()` requests (up to 200 files each) and sends larger files through `upload.file()`. It reports per-file failures in the results instead of throwing. `upload.batch()`, `upload.init()`, `uploadPart()`, `complete()` and `status()` are available for custom pipelines.

## Downloads

```typescript
const { url, expiresAt } = await client.download.getUrl(fileId, { ttl: 3600 });
const bytes = await client.download.arrayBuffer(fileId);
const stream = await client.download.stream(fileId, { range: { start: 0, end: 1023 } });
const thumb = await client.download.thumbnail(fileId, { width: 512 });   // Response
const zip = await client.download.archive({ folderIds: ["fld_..."] });   // streamed Response
```

Password-locked (`full_lock`) items need an unlock token first:

```typescript
const { unlockToken } = await client.files.unlock(fileId, "secret");
await client.download.arrayBuffer(fileId, { unlockToken });
```

## Sharing

```typescript
const { link } = await client.files.createShareLink(fileId, {
  expiresInDays: 14,
  password: "at-least-8-chars",
  maxDownloads: 50,
});

// Private link: only these recipients can open it, after an emailed code
await client.folders.createShareLink(folderId, {
  accessMode: "restricted",
  recipientEmails: ["client@example.com"],
});

const { sent, failed } = await client.files.shareByEmail(fileId, { emails: ["a@example.com"] });

await client.shares.update(link.id, { maxDownloads: 100 });
const stats = await client.shares.analytics(link.id, { range: 30 });
await client.shares.revoke(link.id);
```

## Webhooks

```typescript
const { webhook } = await client.webhooks.create({
  workspaceId,
  url: "https://example.com/hooks/dosya",
  events: ["file.uploaded", "file.deleted", "share.accessed"],
});
// webhook.secret is shown only here and by rollSecret()
```

Verify deliveries on your server with the raw request body. The helpers have no dependency on the client and use WebCrypto, so they run on Node, Workers, Deno and Bun:

```typescript
import { constructWebhookEvent } from "dosyadev/webhooks";

export async function POST(request: Request) {
  const event = await constructWebhookEvent({
    payload: await request.text(),
    header: request.headers.get("X-Dosya-Signature"),
    secret: process.env.DOSYA_WEBHOOK_SECRET!,
  });
  if (event.type === "file.uploaded") console.log(event.data.file_id);
  return new Response("ok");
}
```

Event payloads arrive exactly as documented (snake_case). `X-Dosya-Event-Id` is stable across retries; use it to deduplicate. `share.accessed` payloads include the share token, so treat webhook bodies as secrets.

## Errors

```typescript
import { DosyaApiError, DosyaNetworkError, DosyaTimeoutError, DosyaUploadError } from "dosyadev";

try {
  await client.files.list({ workspaceId, folderId });
} catch (err) {
  if (err instanceof DosyaApiError) {
    err.status;        // 403
    err.errorMessage;  // the API's message
    err.code;          // machine code when present: "folder_locked", "version_conflict", "quota", ...
    err.details;       // extra fields, e.g. { folder_id, lock_mode }
    err.retryAfter;    // seconds, when the API sent Retry-After
  } else if (err instanceof DosyaTimeoutError) {
    err.timeoutMs;
  } else if (err instanceof DosyaNetworkError) {
    err.cause;
  } else if (err instanceof DosyaUploadError) {
    err.sessionId;     // pass to upload.resume()
    err.partNumber;
  }
}
```

## Things worth knowing

- **Deleting is two-stage.** `files.delete()` and `folders.delete()` move an item to the trash; calling delete again on a trashed item removes it permanently. Neither is retried automatically. Use `folders.purge()` to empty a trashed folder completely.
- **Unlock does not remove a lock.** `unlock(id, password)` grants one hour of access to a `full_lock` item. Remove a lock with `lock(id, { lockMode: "none" })`.
- **Deleting a workspace needs a person.** Call `workspaces.requestDeletion(id)`, read the 6-digit code from the owner's email, then `workspaces.delete(id, { code, confirmName })`.
- **A workspace's region is fixed at creation.** List valid codes with `client.regions.list()`.
- **Addresses at dosya.dev** are refused as share and file-request recipients (400) unless the sender is also a dosya.dev account.

## API reference

| Resource | Methods |
|----------|---------|
| **files** | `list`, `get`, `delete`, `restore`, `rename`, `move`, `copy`, `getLock`, `lock`, `unlock`, `getHide`, `hide`, `listVersions`, `restoreVersion`, `getShareLinks`, `createShareLink`, `shareByEmail`, `createShareBundle`, `batchDelete`, `duplicates` |
| **folders** | `create`, `createBatch`, `get`, `rename`, `restore`, `delete`, `purge`, `move`, `tree`, `children`, `search`, `getLock`, `lock`, `unlock`, `getHide`, `hide`, `getShareLinks`, `createShareLink`, `shareByEmail` |
| **upload** | `file`, `resume`, `many`, `batch`, `init`, `uploadPart`, `complete`, `status` |
| **download** | `getUrl`, `arrayBuffer`, `blob`, `stream`, `raw`, `thumbnail`, `archive`, `archiveEntries`, `archiveEntry` |
| **favourites** | `list`, `add`, `remove` |
| **shares** | `list`, `update`, `analytics`, `revoke`, `withMe` |
| **workspaces** | `list`, `get`, `create`, `update`, `getSettings`, `updateSettings`, `uploadLimits`, `deletePreview`, `requestDeletion`, `delete`, `transfer`, `leave` |
| **team** | `list`, `invite`, `resendInvite`, `revokeInvite`, `updateMember`, `removeMember`, `listInviteLinks`, `createInviteLink`, `revokeInviteLink` |
| **roles** | `list`, `create`, `update`, `delete` |
| **regions** | `list` |
| **fileRequests** | `list`, `create`, `get`, `update`, `delete`, `listUploads`, `listRecipients`, `addRecipient`, `removeRecipient`, `resend` |
| **search** | `query` (supports an `ext:pdf` token) |
| **comments** | `list`, `create`, `edit`, `delete` |
| **activity** | `list` |
| **webhooks** | `list`, `create`, `get`, `update`, `delete`, `rollSecret`, `test`, `listDeliveries`, `redeliver` |
| **remoteDownloads** | `list`, `create`, `cancel`, `waitFor` |
| **me** | `profile`, `permissions`, `updateName`, `revokeCurrentKey` |

Every method has JSDoc with its key scope, permission and limits; your editor shows it on hover.

Upgrading from 0.1.0? See [CHANGELOG.md](CHANGELOG.md) for the breaking changes.

## Requirements

- **Node.js** >= 18 (native `fetch`)
- **Browsers**: any modern browser with `fetch`
- **TypeScript** >= 5.0 (optional)

## License

[MIT](LICENSE) - the SDK is free to embed in your own applications. It talks to the
official [dosya.dev](https://dosya.dev) service.

## Security

Found a vulnerability? Please report it privately via
[GitHub private vulnerability reporting](../../security/advisories/new) rather than a
public issue.

## The dosya.dev client family

| Repository | What it is | License |
|---|---|---|
| [desktop](https://github.com/dosya-dev/desktop) | Desktop client - sync, upload, manage | Source-available |
| [cli](https://github.com/dosya-dev/cli) | Command-line interface | Source-available |
| [app.dosya.dev](https://github.com/dosya-dev/app.dosya.dev) | Web application | Source-available |
| [shared](https://github.com/dosya-dev/shared) | Shared TypeScript types & utilities | Source-available |
| [dosya-js](https://github.com/dosya-dev/dosya-js) | Official JavaScript SDK | MIT |
| [dosya-java](https://github.com/dosya-dev/dosya-java) | Official Java SDK | MIT |
