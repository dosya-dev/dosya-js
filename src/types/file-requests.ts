export interface CreateFileRequestParams {
  workspaceId: string;
  /** Destination folder; the workspace root when omitted (a confined member's own folder). */
  folderId?: string | null;
  title?: string;
  message?: string;
  /** At least 8 characters. */
  password?: string;
  /** Omit for no expiry. */
  expiresInDays?: number;
  /** Comma-separated, e.g. `".pdf,.docx"`. */
  allowedExtensions?: string;
  maxFileSizeMb?: number;
  maxFiles?: number;
  /** Addresses to email the request to. Invalid ones are dropped; at most 100. */
  emails?: string[];
}

/** Fields `fileRequests.update()` accepts. Only the keys given change. */
export interface UpdateFileRequestParams {
  /** `null` or `""` clears. */
  title?: string | null;
  message?: string | null;
  /** Days from now; `null` or `0` removes the expiry. */
  expiresInDays?: number | null;
  /** At least 8 characters; `""` removes the password. */
  password?: string;
  /** Move the destination; `null` means the workspace root. */
  folderId?: string | null;
  allowedExtensions?: string | null;
  /** `null` or `0` removes the cap. */
  maxFileSizeMb?: number | null;
  maxFiles?: number | null;
}

/** A row of `fileRequests.list()`. */
export interface FileRequestListItem {
  id: string;
  token: string;
  /** Public upload page. */
  url: string;
  title: string | null;
  message: string | null;
  isPasswordProtected: number | boolean;
  expiresAt: number | null;
  allowedExtensions: string | null;
  maxFileSizeBytes: number | null;
  maxFiles: number | null;
  uploadCount: number;
  isRevoked: number | boolean;
  createdAt: number;
  folderId: string | null;
  folderName: string | null;
  createdByName: string | null;
}

/** One request, as returned by `fileRequests.get()`. */
export interface FileRequestDetail extends FileRequestListItem {
  workspaceId: string;
}

export interface FileRequestUpload {
  id: string;
  fileId: string;
  uploaderEmail: string | null;
  uploaderName: string | null;
  /** When the upload arrived. */
  createdAt: number;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  extension: string | null;
  updatedAt: number;
  currentVersion: number;
  lockMode: string;
  isHidden: number | boolean | null;
  uploadedBy: string;
  region: string;
  origin: string | null;
}

export interface FileRequestRecipient {
  id: string;
  email: string;
  /** The recipient's personal `?r=` sub-token for the upload page. */
  token: string;
  /** Last time the request email went out; null if never sent. */
  sentAt: number | null;
  /** First upload naming this address; null until then. */
  uploadedAt: number | null;
  createdAt: number;
}

export interface FileRequestWithActivity {
  request: FileRequestDetail;
  uploads: FileRequestUpload[];
  recipients: FileRequestRecipient[];
  title: string | null;
}
