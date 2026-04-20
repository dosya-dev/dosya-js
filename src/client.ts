import { HttpClient } from "./http.js";
import { FilesResource } from "./resources/files.js";
import { FoldersResource } from "./resources/folders.js";
import { UploadResource } from "./resources/upload.js";
import { DownloadResource } from "./resources/download.js";
import { SharesResource } from "./resources/shares.js";
import { WorkspacesResource } from "./resources/workspaces.js";
import { FileRequestsResource } from "./resources/file-requests.js";
import { SearchResource } from "./resources/search.js";
import { CommentsResource } from "./resources/comments.js";
import { MeResource } from "./resources/me.js";
import { ActivityResource } from "./resources/activity.js";
import type { DosyaClientOptions } from "./types.js";

export class DosyaClient {
  readonly files: FilesResource;
  readonly folders: FoldersResource;
  readonly upload: UploadResource;
  readonly download: DownloadResource;
  readonly shares: SharesResource;
  readonly workspaces: WorkspacesResource;
  readonly fileRequests: FileRequestsResource;
  readonly search: SearchResource;
  readonly comments: CommentsResource;
  readonly me: MeResource;
  readonly activity: ActivityResource;

  constructor(options: DosyaClientOptions) {
    if (!options.apiKey?.startsWith("dos_")) {
      throw new Error("API key must start with 'dos_'");
    }

    const http = new HttpClient(options);
    this.files = new FilesResource(http);
    this.folders = new FoldersResource(http);
    this.upload = new UploadResource(http);
    this.download = new DownloadResource(http);
    this.shares = new SharesResource(http);
    this.workspaces = new WorkspacesResource(http);
    this.fileRequests = new FileRequestsResource(http);
    this.search = new SearchResource(http);
    this.comments = new CommentsResource(http);
    this.me = new MeResource(http);
    this.activity = new ActivityResource(http);
  }
}
