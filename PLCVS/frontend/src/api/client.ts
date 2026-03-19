/**
 * Base API client for PLCVS backend.
 * Centralizes HTTP requests with typed responses, error handling, and logging.
 */

import { API_BASE_URL } from "../utils/constants";
import type { ApiError } from "./types";

// ─── Error class ───────────────────────────────────────────────

export class PlcvsApiError extends Error {
  public readonly status: number;
  public readonly detail: string;
  public readonly endpoint: string;

  constructor(status: number, detail: string, endpoint: string) {
    super(`[API ${status}] ${endpoint}: ${detail}`);
    this.name = "PlcvsApiError";
    this.status = status;
    this.detail = detail;
    this.endpoint = endpoint;
  }
}

// ─── Client ────────────────────────────────────────────────────

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // ── Core request method ────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
      headers?: Record<string, string>;
      signal?: AbortSignal;
    } = {}
  ): Promise<T> {
    const { body, params, headers = {}, signal } = options;

    // Build URL with query params
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        "Accept": "application/json",
        ...headers,
      },
      signal,
    };

    // Add JSON body for POST/PUT/PATCH
    if (body !== undefined && body !== null) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        "Content-Type": "application/json",
      };
      fetchOptions.body = JSON.stringify(body);
    }

    console.debug(`[API] ${method} ${path}`);

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        detail = errBody.detail || errBody.message || JSON.stringify(errBody);
      } catch {
        detail = await response.text().catch(() => detail);
      }
      throw new PlcvsApiError(response.status, detail, `${method} ${path}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  // ── Convenience methods ────────────────────────────────

  async get<T>(
    path: string,
    params?: Record<string, string | number | boolean | undefined>,
    signal?: AbortSignal
  ): Promise<T> {
    return this.request<T>("GET", path, { params, signal });
  }

  async post<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    return this.request<T>("POST", path, { body, signal });
  }

  async put<T>(
    path: string,
    body?: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    return this.request<T>("PUT", path, { body, signal });
  }

  async delete<T>(
    path: string,
    signal?: AbortSignal
  ): Promise<T> {
    return this.request<T>("DELETE", path, { signal });
  }

  // ── File upload (multipart/form-data) ──────────────────

  async upload<T>(
    path: string,
    file: File,
    fieldName = "file",
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const formData = new FormData();
    formData.append(fieldName, file);

    console.debug(`[API] UPLOAD ${path} (${file.name}, ${file.size} bytes)`);

    const response = await fetch(url, {
      method: "POST",
      body: formData,
      signal,
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        detail = errBody.detail || errBody.message || JSON.stringify(errBody);
      } catch {
        detail = await response.text().catch(() => detail);
      }
      throw new PlcvsApiError(response.status, detail, `UPLOAD ${path}`);
    }

    return response.json() as Promise<T>;
  }
}

// ─── Singleton instance ────────────────────────────────────────

export const apiClient = new ApiClient();
export default apiClient;
