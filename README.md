# dosyadev

Official JavaScript/TypeScript SDK for [dosya.dev](https://dosya.dev) — file storage, chunked uploads, sharing, and workspace management.

[![npm version](https://img.shields.io/npm/v/dosyadev.svg)](https://www.npmjs.com/package/dosyadev)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install dosyadev
```

## Quick Start

```typescript
import { DosyaClient } from "dosyadev";

const client = new DosyaClient({ apiKey: "dos_your_api_key" });

// Upload a file
const result = await client.upload.file({
  workspaceId: "ws_abc123",
  fileName: "video.mp4",
  fileSize: 250_000_000,
  body: fileBuffer,
  onProgress: (p) => console.log(`${p.percent}%`),
});

// List files
const { files } = await client.files.list({
  workspaceId: "ws_abc123",
  sort: "newest",
});

// Download a file
const stream = await client.download.stream("file_xxx");
```

## Authentication

All requests require an API key. Create one from your [dosya.dev dashboard](https://dosya.dev) under **Settings > API Keys**.

```typescript
const client = new DosyaClient({
  apiKey: "dos_your_api_key",
});
```

API keys support three scopes:

| Scope | Permissions |
|-------|-------------|
| `full` | Read, write, delete, share — everything |
| `read` | List, get, download, search |
| `upload` | Upload files only |

## Configuration

```typescript
const client = new DosyaClient({
  apiKey: "dos_your_api_key",

  // Custom base URL (default: https://dosya.dev)
  baseUrl: "https://dosya.dev",

  // Retry configuration
  retry: {
    maxRetries: 3,     // default: 3
    baseDelay: 500,    // default: 500ms
    maxDelay: 30_000,  // default: 30s
  },

  // Rate limit callback
  onRateLimit: (info) => {
    console.log(`${info.remaining}/${info.limit} requests left`);
  },

  // Custom fetch implementation (for testing or proxies)
  fetch: customFetch,
});
```

## Resources

### Files

```typescript
// List files in a workspace
const { files, folders, pagination } = await client.files.list({
  workspaceId: "ws_abc",
  folderId: "folder_123",      // optional — root if omitted
  filter: "images",            // "all" | "documents" | "videos" | "images"
  sort: "newest",              // "newest" | "oldest" | "name_asc" | "name_desc" | "largest" | "smallest"
  q: "quarterly report",      // search within folder
  page: 1,
  perPage: 50,
});

// Get file metadata
const { file } = await client.files.get("file_xxx");

// Rename
await client.files.rename("file_xxx", "new-name.pdf");

// Move to another folder
await client.files.move("file_xxx", "folder_456");

// Copy
const { file: copy } = await client.files.copy("file_xxx", {
  newName: "copy-of-report.pdf",
  folderId: "folder_456",
});

// Delete (first call = soft delete, second call = permanent)
const { permanent } = await client.files.delete("file_xxx");

// Restore a soft-deleted file
await client.files.restore("file_xxx");

// Lock / unlock
await client.files.lock("file_xxx", { lockMode: "view_only" });
await client.files.unlock("file_xxx");

// Hide from non-admins
await client.files.hide("file_xxx", {
  hiddenMode: "everyone",
});
```

### File Versions

```typescript
// List all versions
const { versions, currentVersion } = await client.files.listVersions("file_xxx");

// Restore a previous version
await client.files.restoreVersion("file_xxx", 2);
```

### Upload

The SDK automatically selects the right upload strategy:
- **Files <= 10 MB**: Single PUT request
- **Files > 10 MB**: Chunked multipart upload (10 MB parts, 3 concurrent)

```typescript
import { readFile } from "fs/promises";

const buffer = await readFile("./video.mp4");

const result = await client.upload.file({
  workspaceId: "ws_abc",
  fileName: "video.mp4",
  fileSize: buffer.byteLength,
  mimeType: "video/mp4",
  region: "eu-central-1",     // optional — uses workspace default
  folderId: "folder_123",     // optional — root if omitted
  body: buffer,
  onProgress: (p) => {
    console.log(`${p.status}: ${p.percent}% (${p.partsCompleted}/${p.totalParts})`);
  },
  abortSignal: controller.signal,
});

console.log(result.file.id);   // "file_xxx"
console.log(result.sessionId); // "upl_xxx"
```

#### Upload a new version

```typescript
await client.upload.file({
  workspaceId: "ws_abc",
  fileName: "video-v2.mp4",
  fileSize: buffer.byteLength,
  fileId: "file_xxx",  // existing file ID — creates a new version
  body: buffer,
});
```

#### Resume a failed upload

```typescript
// Upload was interrupted — resume from where it left off
const result = await client.upload.resume("upl_session_id", buffer, {
  onProgress: (p) => console.log(`Resuming: ${p.percent}%`),
});
```

#### Check upload status

```typescript
const status = await client.upload.status("upl_session_id");
// { status: "uploading", bytesUploaded: 31457280, uploadedParts: [1, 2, 3], ... }
```

#### Progress callback shape

```typescript
interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percent: number;           // 0–100
  partsCompleted?: number;   // multipart only
  totalParts?: number;       // multipart only
  status: "initializing" | "uploading" | "completing" | "complete";
}
```

#### Supported input types

| Type | Environment |
|------|-------------|
| `ArrayBuffer` | Node.js, Browser |
| `Uint8Array` | Node.js, Browser |
| `File` | Browser |
| `Blob` | Browser |
| `ReadableStream<Uint8Array>` | Node.js 18+, Browser |

### Download

```typescript
// Get a presigned download URL (valid ~1 hour)
const url = await client.download.getUrl("file_xxx");

// Download as ArrayBuffer
const buffer = await client.download.arrayBuffer("file_xxx");

// Download as a stream
const stream = await client.download.stream("file_xxx");

// Download a specific version
const url = await client.download.getUrl("file_xxx", { version: 2 });

// Get raw inline content (for previews)
const response = await client.download.raw("file_xxx");
```

### Folders

```typescript
// Create a folder (supports nested paths like "a/b/c")
const { folder, createdCount } = await client.folders.create({
  workspaceId: "ws_abc",
  name: "Reports/2025/Q1",
  parentId: "folder_parent",   // optional
});

// Get folder metadata
const { folder } = await client.folders.get("folder_xxx");

// Rename
await client.folders.rename("folder_xxx", "New Name");

// Move
await client.folders.move("folder_xxx", "folder_new_parent");

// Delete (cascading — files inside are soft-deleted)
const { filesAffected, foldersRemoved } = await client.folders.delete("folder_xxx");

// Get full folder tree
const { folders } = await client.folders.tree("ws_abc");

// Lock / unlock
await client.folders.lock("folder_xxx", { lockMode: "full_lock" });
await client.folders.unlock("folder_xxx");
```

### Sharing

```typescript
// Create a share link for a file
const { link } = await client.files.createShareLink("file_xxx", {
  expiresInDays: 7,
  password: "secret",
  lockMode: "view_only",
});
console.log(link.token); // share token

// Get existing share links
const { links } = await client.files.getShareLinks("file_xxx");

// Share via email
await client.files.shareByEmail("file_xxx", {
  emails: ["team@example.com"],
  message: "Here's the latest report",
});

// Share multiple files as a bundle
const { link } = await client.files.createShareBundle({
  fileIds: ["file_1", "file_2", "file_3"],
  expiresInDays: 30,
});

// List all share links in a workspace
const { links, stats } = await client.shares.list("ws_abc");

// Revoke a share link
await client.shares.revoke("link_xxx");
```

### Workspaces

```typescript
// List workspaces
const { workspaces } = await client.workspaces.list();

// Get workspace details
const { workspace, settings, isOwner } = await client.workspaces.get("ws_abc");

// Create a workspace
const { workspace } = await client.workspaces.create({
  name: "My Team",
  defaultRegion: "eu-central-1",
});

// Update workspace
await client.workspaces.update("ws_abc", {
  name: "New Name",
  iconColor: "#22c55e",
});

// Update workspace settings
await client.workspaces.updateSettings("ws_abc", {
  maxFileSizeGb: 5,
  blockedExtensions: ".exe,.bat",
  forceSharePassword: 1,
});

// Delete workspace
await client.workspaces.delete("ws_abc");
```

### File Requests

Create upload links that external users can use to send you files.

```typescript
// Create a file request
const { request } = await client.fileRequests.create({
  workspaceId: "ws_abc",
  title: "Please upload your documents",
  message: "Upload your signed contracts here",
  expiresInDays: 14,
  maxFiles: 10,
  maxFileSizeMb: 100,
  emails: ["client@example.com"],
});
console.log(request.url); // shareable upload link

// Get request details
const { request } = await client.fileRequests.get("req_xxx");

// List received uploads
const { uploads } = await client.fileRequests.listUploads("req_xxx");

// Resend invitation emails
await client.fileRequests.resend("req_xxx");

// Delete a file request
await client.fileRequests.delete("req_xxx");
```

### Search

```typescript
const results = await client.search.query({
  workspaceId: "ws_abc",
  q: "quarterly report",
  page: 1,
  perPage: 20,
});

// Results include files, folders, share links, and file requests
console.log(results.files);
console.log(results.folders);
console.log(results.shared);
console.log(results.fileRequests);
```

### Comments

```typescript
// List comments on a file
const { comments } = await client.comments.list({
  workspaceId: "ws_abc",
  fileId: "file_xxx",
});

// Add a comment
const { comment } = await client.comments.create({
  workspaceId: "ws_abc",
  fileId: "file_xxx",
  body: "Looks good, approved!",
});

// Reply to a comment
await client.comments.create({
  workspaceId: "ws_abc",
  fileId: "file_xxx",
  parentId: comment.id,
  body: "Thanks!",
});

// Edit a comment
await client.comments.edit("comment_xxx", "Updated text");

// Delete a comment
await client.comments.delete("comment_xxx");
```

### Activity Log

```typescript
const { activities, members, pagination } = await client.activity.list({
  workspaceId: "ws_abc",
  category: "files",       // optional filter
  action: "file_uploaded", // optional filter
  userId: "user_xxx",      // optional filter
  page: 1,
  perPage: 50,
});
```

### User Profile & API Keys

```typescript
// Get current user
const { user } = await client.me.profile();

// List API keys
const { keys } = await client.me.listApiKeys();

// Create a new API key
const { key } = await client.me.createApiKey({
  name: "CI/CD Pipeline",
  scope: "upload",
  expiresInDays: 90,
});
console.log(key.plainKey); // only shown once

// Delete an API key
await client.me.deleteApiKey("key_xxx");
```

## Error Handling

All errors extend `DosyaError` for easy catching.

```typescript
import { DosyaApiError, DosyaNetworkError, DosyaUploadError } from "dosyadev";

try {
  await client.files.get("file_xxx");
} catch (err) {
  if (err instanceof DosyaApiError) {
    // Server returned { ok: false, error: "..." }
    console.log(err.status);        // 404
    console.log(err.errorMessage);  // "File not found"
  }

  if (err instanceof DosyaNetworkError) {
    // fetch() failed (timeout, DNS, offline)
    console.log(err.cause);
  }

  if (err instanceof DosyaUploadError) {
    // Upload-specific failure
    console.log(err.sessionId);   // "upl_xxx"
    console.log(err.partNumber);  // 5 (which part failed)
  }
}
```

## API Reference

### All Resources & Methods

| Resource | Method | Description |
|----------|--------|-------------|
| **files** | `list(params)` | List files and folders |
| | `get(fileId)` | Get file metadata |
| | `delete(fileId)` | Soft/permanent delete |
| | `restore(fileId)` | Restore soft-deleted file |
| | `rename(fileId, name)` | Rename a file |
| | `move(fileId, folderId)` | Move to folder |
| | `copy(fileId, options?)` | Copy a file |
| | `lock(fileId, params)` | Lock a file |
| | `unlock(fileId)` | Unlock a file |
| | `hide(fileId, params?)` | Hide from non-admins |
| | `listVersions(fileId)` | Get version history |
| | `restoreVersion(fileId, version)` | Restore a version |
| | `getShareLinks(fileId)` | Get share links |
| | `createShareLink(fileId, params?)` | Create share link |
| | `shareByEmail(fileId, params)` | Share via email |
| | `createShareBundle(params)` | Share multiple files |
| **folders** | `create(params)` | Create folder(s) |
| | `get(folderId)` | Get folder metadata |
| | `rename(folderId, name)` | Rename folder |
| | `delete(folderId)` | Delete folder |
| | `move(folderId, parentId)` | Move folder |
| | `tree(workspaceId)` | Get folder tree |
| | `lock(folderId, params)` | Lock folder |
| | `unlock(folderId)` | Unlock folder |
| **upload** | `file(params)` | Upload a file (auto chunked) |
| | `resume(sessionId, body, options?)` | Resume failed upload |
| | `init(params)` | Initialize upload session |
| | `status(sessionId)` | Check upload progress |
| **download** | `getUrl(fileId, options?)` | Get presigned URL |
| | `arrayBuffer(fileId, options?)` | Download as buffer |
| | `stream(fileId, options?)` | Download as stream |
| | `raw(fileId, options?)` | Get inline content |
| **shares** | `list(workspaceId)` | List all share links |
| | `revoke(linkId)` | Revoke a share link |
| **workspaces** | `list()` | List workspaces |
| | `get(workspaceId)` | Get workspace details |
| | `create(params)` | Create workspace |
| | `update(workspaceId, params)` | Update workspace |
| | `updateSettings(workspaceId, settings)` | Update settings |
| | `delete(workspaceId)` | Delete workspace |
| **fileRequests** | `create(params)` | Create file request |
| | `get(requestId)` | Get request details |
| | `update(requestId, params)` | Update request |
| | `delete(requestId)` | Delete request |
| | `listUploads(requestId)` | List received uploads |
| | `listRecipients(requestId)` | List recipients |
| | `resend(requestId, recipientIds?)` | Resend invitations |
| **search** | `query(params)` | Search everything |
| **comments** | `list(params)` | List comments |
| | `create(params)` | Add comment |
| | `edit(commentId, body)` | Edit comment |
| | `delete(commentId)` | Delete comment |
| **activity** | `list(params)` | Activity log |
| **me** | `profile()` | Get current user |
| | `listApiKeys()` | List API keys |
| | `createApiKey(params)` | Create API key |
| | `deleteApiKey(keyId)` | Delete API key |

## Requirements

- **Node.js** >= 18 (uses native `fetch`)
- **Browsers**: All modern browsers with `fetch` support
- **TypeScript** >= 5.0 (optional — works with plain JavaScript too)

## License

[MIT](LICENSE) — the SDK is free to embed in your own applications. It talks to the
official [dosya.dev](https://dosya.dev) service.

## Security

Found a vulnerability? Please report it privately via
[GitHub private vulnerability reporting](../../security/advisories/new) rather than a
public issue.

## The dosya.dev client family

| Repository | What it is | License |
|---|---|---|
| [desktop](https://github.com/dosya-dev/desktop) | Desktop client — sync, upload, manage | Source-available |
| [cli](https://github.com/dosya-dev/cli) | Command-line interface | Source-available |
| [app.dosya.dev](https://github.com/dosya-dev/app.dosya.dev) | Web application | Source-available |
| [shared](https://github.com/dosya-dev/shared) | Shared TypeScript types & utilities | Source-available |
| [dosya-js](https://github.com/dosya-dev/dosya-js) | Official JavaScript SDK | MIT |
| [dosya-java](https://github.com/dosya-dev/dosya-java) | Official Java SDK | MIT |
