import { DosyaClient, DosyaApiError, DosyaNetworkError, DosyaTimeoutError, DosyaUploadError } from "../src/index.js";
import { constructWebhookEvent } from "../src/webhooks.js";
declare const pdfBlob: Blob; declare const file: File; declare const controller: AbortController;
declare const localFiles: File[]; declare const folderId: string; declare const fileId: string; declare const sessionId: string;
declare const onProgress: () => void;
export async function examples() {
  const client = new DosyaClient({ apiKey: "dos_x", baseUrl: "https://api.dosya.dev", timeout: 30_000, uploadTimeout: 600_000,
    retry: { maxRetries: 3, baseDelay: 500, maxDelay: 30_000 }, readYourWrites: true,
    onRateLimit: (info) => console.log(`${info.remaining}/${info.limit} left`), debug: (m) => console.debug(m) });
  const { workspaces } = await client.workspaces.list();
  const workspaceId = workspaces[0].id;
  const { file: up } = await client.upload.file({ workspaceId, fileName: "report.pdf", body: pdfBlob, onProgress: (p) => console.log(`${p.percent}%`) });
  const { files, folders } = await client.files.list({ workspaceId, sort: "modified_desc" });
  const { url } = await client.download.getUrl(up.id, { ttl: 600 });
  const { link } = await client.files.createShareLink(up.id, { expiresInDays: 7 });
  await client.upload.file({ workspaceId, folderId: "fld_", fileName: "clip.mp4", body: file, sourceModifiedAt: file.lastModified / 1000,
    computeSha256: true, expectedVersion: 3, concurrency: 4, abortSignal: controller.signal });
  await client.upload.resume(sessionId, file, { onProgress });
  const results = await client.upload.many({ workspaceId, files: localFiles.map((f) => ({ name: f.name, body: f, folderId })),
    onProgress: (p) => console.log(`${p.filesCompleted}/${p.totalFiles}`) });
  for (const r of results) if (!r.ok) console.warn(r.name, r.error);
  const { expiresAt } = await client.download.getUrl(fileId, { ttl: 3600 });
  const bytes = await client.download.arrayBuffer(fileId);
  const stream = await client.download.stream(fileId, { range: { start: 0, end: 1023 } });
  const thumb = await client.download.thumbnail(fileId, { width: 512 });
  const zip = await client.download.archive({ folderIds: ["fld_"] });
  const { unlockToken } = await client.files.unlock(fileId, "secret");
  await client.download.arrayBuffer(fileId, { unlockToken });
  await client.files.createShareLink(fileId, { expiresInDays: 14, password: "at-least-8-chars", maxDownloads: 50 });
  await client.folders.createShareLink(folderId, { accessMode: "restricted", recipientEmails: ["c@example.com"] });
  const { sent, failed } = await client.files.shareByEmail(fileId, { emails: ["a@example.com"] });
  await client.shares.update(link.id, { maxDownloads: 100 });
  const stats = await client.shares.analytics(link.id, { range: 30 });
  await client.shares.revoke(link.id);
  const { webhook } = await client.webhooks.create({ workspaceId, url: "https://example.com/h", events: ["file.uploaded", "file.deleted", "share.accessed"] });
  const secret: string = webhook.secret;
  await client.folders.purge(folderId);
  await client.workspaces.requestDeletion(workspaceId);
  await client.workspaces.delete(workspaceId, { code: "123456", confirmName: "x" });
  await client.regions.list();
  await client.files.lock(fileId, { lockMode: "none" });
  try { await client.files.list({ workspaceId, folderId }); } catch (err) {
    if (err instanceof DosyaApiError) { err.status; err.errorMessage; err.code; err.details; err.retryAfter; }
    else if (err instanceof DosyaTimeoutError) { err.timeoutMs; }
    else if (err instanceof DosyaNetworkError) { err.cause; }
    else if (err instanceof DosyaUploadError) { err.sessionId; err.partNumber; }
  }
  return { files, folders, url, expiresAt, bytes, stream, thumb, zip, sent, failed, stats, secret };
}
export async function POST(request: Request) {
  const event = await constructWebhookEvent({ payload: await request.text(), header: request.headers.get("X-Dosya-Signature"), secret: "whsec_x" });
  if (event.type === "file.uploaded") console.log(event.data.file_id);
  return new Response("ok");
}
