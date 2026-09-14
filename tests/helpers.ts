import "dotenv/config";
import { DosyaClient } from "../src/index.js";

export function getClient(): DosyaClient {
  const apiKey = process.env.DOSYA_TEST_API_KEY;
  if (!apiKey) {
    throw new Error("DOSYA_TEST_API_KEY env var is required. Set it in .env");
  }
  return new DosyaClient({ apiKey });
}

export async function getWorkspaceId(client: DosyaClient): Promise<string> {
  const { workspaces } = await client.workspaces.list();
  if (!workspaces.length) {
    throw new Error("No workspaces found for this API key");
  }
  return workspaces[0].id;
}

export function testFileContent(): Uint8Array {
  const text = "Hello from dosya-js SDK test! " + Date.now();
  return new TextEncoder().encode(text);
}

export async function uploadTestFile(
  client: DosyaClient,
  workspaceId: string,
  options?: { fileName?: string; folderId?: string | null },
) {
  const content = testFileContent();
  const fileName = options?.fileName ?? `test-${Date.now()}.txt`;
  const result = await client.upload.file({
    workspaceId,
    fileName,
    fileSize: content.byteLength,
    mimeType: "text/plain",
    folderId: options?.folderId,
    body: content,
  });
  return { result, content, fileName };
}
