export interface Region {
  /** Pass as `defaultRegion` to `workspaces.create()`, e.g. `"ap-southeast-2"`. */
  code: string;
  city: string;
  country: string;
  continent: string;
  /** Emoji flag. */
  flag: string;
}

export interface RegionsListResponse {
  /** Ordered by continent, then city. */
  regions: Region[];
  /** The code nearest the caller; what the server picks when `defaultRegion` is omitted. */
  suggested: string;
}
