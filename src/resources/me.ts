import type { HttpClient } from "../http.js";
import type {
  UserProfile,
  ApiKeyItem,
  CreateApiKeyParams,
  CreatedApiKey,
} from "../types.js";

export class MeResource {
  constructor(private readonly http: HttpClient) {}

  async profile(): Promise<{ user: UserProfile }> {
    return this.http.request({
      method: "GET",
      path: "/api/me",
    });
  }

  async listApiKeys(): Promise<{ keys: ApiKeyItem[] }> {
    return this.http.request({
      method: "GET",
      path: "/api/me/api-keys",
    });
  }

  async createApiKey(params: CreateApiKeyParams): Promise<{ key: CreatedApiKey }> {
    return this.http.request({
      method: "POST",
      path: "/api/me/api-keys",
      body: {
        name: params.name,
        scope: params.scope,
        expiresInDays: params.expiresInDays,
      },
    });
  }

  async deleteApiKey(keyId: string): Promise<void> {
    await this.http.request({
      method: "DELETE",
      path: `/api/me/api-keys/${keyId}`,
    });
  }
}
