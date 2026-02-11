/**
 * Remote Translation Client
 * Connects to a remote translation service and exposes an API compatible with local workflow.
 */

export interface RemoteServerConfig {
  url: string;
  apiKey?: string;
  timeout?: number;
}

export interface TranslateOptions {
  text?: string;
  filePath?: string;
  model?: string;
  glossary?: string;
  preset?: string;
  mode?: "doc" | "line";
  chunkSize?: number;
  ctx?: number;
  gpuLayers?: number;
  temperature?: number;
  lineCheck?: boolean;
  traditional?: boolean;
  saveCot?: boolean;
  rulesPre?: string;
  rulesPost?: string;
  parallel?: number;
  flashAttn?: boolean;
  kvCacheType?: string;
}

export interface TranslateTask {
  taskId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  currentBlock: number;
  totalBlocks: number;
  logs: string[];
  result?: string;
  error?: string;
}

export interface ModelInfo {
  name: string;
  path: string;
  sizeGb: number;
}

interface RemoteServerStatusRaw {
  status: string;
  model_loaded: boolean;
  current_model?: string;
  active_tasks: number;
}

interface RemoteModelInfoRaw {
  name: string;
  path: string;
  size_gb?: number;
  sizeGb?: number;
}

interface RemoteTaskStatusRaw {
  task_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  current_block: number;
  total_blocks: number;
  logs: string[];
  result?: string;
  error?: string;
}

interface RemoteTranslateResponseRaw {
  task_id: string;
  status: string;
}

export class RemoteClient {
  private config: RemoteServerConfig;

  constructor(config: RemoteServerConfig) {
    this.config = {
      timeout: 300000, // 5 minutes default
      ...config,
      url: config.url.replace(/\/+$/, ""),
    };
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{
    ok: boolean;
    message: string;
    version?: string;
  }> {
    try {
      const response = await this.fetch("/health");
      if (response.status === "ok") {
        return { ok: true, message: "Connected", version: response.version };
      }
      return { ok: false, message: "Invalid response" };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }

  /**
   * 获取服务器状态
   */
  async getStatus(): Promise<{
    status: string;
    modelLoaded: boolean;
    currentModel?: string;
    activeTasks: number;
  }> {
    const response = (await this.fetch("/api/v1/status")) as RemoteServerStatusRaw;
    return {
      status: response.status,
      modelLoaded: response.model_loaded,
      currentModel: response.current_model,
      activeTasks: response.active_tasks,
    };
  }

  /**
   * 获取可用模型列表
   */
  async listModels(): Promise<ModelInfo[]> {
    const response = (await this.fetch("/api/v1/models")) as RemoteModelInfoRaw[];
    return response.map((item) => ({
      name: item.name,
      path: item.path,
      sizeGb: item.size_gb ?? item.sizeGb ?? 0,
    }));
  }

  /**
   * 获取可用术语表列表
   */
  async listGlossaries(): Promise<{ name: string; path: string }[]> {
    return this.fetch("/api/v1/glossaries");
  }

  /**
   * 创建翻译任务
   */
  async createTranslation(
    options: TranslateOptions,
  ): Promise<{ taskId: string; status: string }> {
    const body = {
      text: options.text,
      file_path: options.filePath,
      model: options.model,
      glossary: options.glossary,
      preset: options.preset || "novel",
      mode: options.mode || "doc",
      chunk_size: options.chunkSize || 1000,
      ctx: options.ctx || 8192,
      gpu_layers: options.gpuLayers ?? -1,
      temperature: options.temperature ?? 0.3,
      line_check: options.lineCheck ?? true,
      traditional: options.traditional ?? false,
      save_cot: options.saveCot ?? false,
      rules_pre: options.rulesPre,
      rules_post: options.rulesPost,
      parallel: options.parallel ?? 1,
      flash_attn: options.flashAttn ?? false,
      kv_cache_type: options.kvCacheType || "f16",
    };

    const response = (await this.fetch(
      "/api/v1/translate",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      { retry: false },
    )) as RemoteTranslateResponseRaw;

    return {
      taskId: response.task_id,
      status: response.status,
    };
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<TranslateTask> {
    const response = (await this.fetch(
      `/api/v1/translate/${taskId}`,
    )) as RemoteTaskStatusRaw;
    return {
      taskId: response.task_id,
      status: response.status,
      progress: response.progress,
      currentBlock: response.current_block,
      totalBlocks: response.total_blocks,
      logs: response.logs,
      result: response.result,
      error: response.error,
    };
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<{ message: string }> {
    return this.fetch(`/api/v1/translate/${taskId}`, { method: "DELETE" });
  }

  /**
   * 上传文件
   */
  async uploadFile(
    filePath: string,
  ): Promise<{ fileId: string; serverPath: string }> {
    const fs = require("fs");
    const path = require("path");
    const FormData = require("form-data");

    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), path.basename(filePath));

    const response = (await this.fetchFormData(
      "/api/v1/upload/file",
      form,
    )) as { file_id: string; file_path: string };
    return {
      fileId: response.file_id,
      serverPath: response.file_path,
    };
  }

  /**
   * 下载翻译结果
   */
  async downloadResult(taskId: string, savePath: string): Promise<void> {
    const fs = require("fs");
    const response = await this.fetchRaw(`/api/v1/download/${taskId}`);
    fs.writeFileSync(savePath, response);
  }

  /**
   * 连接 WebSocket 获取实时日志
   */
  connectWebSocket(
    taskId: string,
    callbacks: {
      onLog?: (message: string) => void;
      onProgress?: (progress: number, current: number, total: number) => void;
      onComplete?: (status: string, result?: string, error?: string) => void;
      onError?: (error: string) => void;
    },
  ): WebSocket {
    const token = this.config.apiKey
      ? `?token=${encodeURIComponent(this.config.apiKey)}`
      : "";
    const wsUrl =
      this.config.url.replace(/^http/, "ws") + `/api/v1/ws/${taskId}${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case "log":
            callbacks.onLog?.(data.message);
            break;
          case "progress":
            callbacks.onProgress?.(
              data.progress,
              data.current_block,
              data.total_blocks,
            );
            break;
          case "complete":
            callbacks.onComplete?.(data.status, data.result, data.error);
            ws.close();
            break;
        }
      } catch (e) {
        callbacks.onError?.(String(e));
      }
    };

    ws.onerror = (error) => {
      callbacks.onError?.(String(error));
    };

    return ws;
  }

  /**
   * Run full translation flow and wait for final result.
   */
  async translateAndWait(
    options: TranslateOptions,
    onProgress?: (progress: number, log: string) => void,
  ): Promise<string> {
    // Create task
    const { taskId } = await this.createTranslation(options);

    // 轮询状态
    while (true) {
      const status = await this.getTaskStatus(taskId);

      if (onProgress) {
        const lastLog = status.logs[status.logs.length - 1] || "";
        onProgress(status.progress, lastLog);
      }

      if (status.status === "completed") {
        return status.result || "";
      }

      if (status.status === "failed") {
        throw new Error(status.error || "Translation failed");
      }

      if (status.status === "cancelled") {
        throw new Error("Translation cancelled");
      }

      // 等待 500ms 后再次查询
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private getRetryDelayMs(attempt: number): number {
    // 400ms, 900ms, 1800ms
    return Math.min(1800, 400 * Math.pow(2, attempt - 1) + 100 * (attempt - 1));
  }

  private shouldRetryByMethod(method: string, retryOverride?: boolean): boolean {
    if (typeof retryOverride === "boolean") return retryOverride;
    return ["GET", "HEAD", "OPTIONS", "DELETE"].includes(method);
  }

  private shouldRetryByStatus(status: number): boolean {
    return status === 408 || status === 429 || (status >= 500 && status <= 504);
  }

  private shouldRetryByError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("fetch failed") ||
      message.includes("econnreset") ||
      message.includes("etimedout")
    );
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetch(
    path: string,
    options: RequestInit = {},
    policy?: { retry?: boolean; maxAttempts?: number },
  ): Promise<any> {
    const url = this.config.url + path;
    const method = (options.method || "GET").toUpperCase();
    const maxAttempts = policy?.maxAttempts ?? 3;
    const allowRetry = this.shouldRetryByMethod(method, policy?.retry);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          ...options,
          method,
          headers,
        });

        if (!response.ok) {
          const text = await response.text();
          const canRetry =
            allowRetry && attempt < maxAttempts && this.shouldRetryByStatus(response.status);
          if (canRetry) {
            await this.sleep(this.getRetryDelayMs(attempt));
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        return response.json();
      } catch (error: unknown) {
        const canRetry =
          allowRetry && attempt < maxAttempts && this.shouldRetryByError(error);
        if (canRetry) {
          await this.sleep(this.getRetryDelayMs(attempt));
          continue;
        }
        throw error;
      }
    }

    throw new Error(`Request failed after ${maxAttempts} attempts`);
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = this.config.timeout || 300000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeoutMs / 1000}s`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async fetchFormData(path: string, form: FormData): Promise<unknown> {
    const url = this.config.url + path;
    const headers: Record<string, string> = {};

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const maxAttempts = 2;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: "POST",
          headers,
          body: form,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        return response.json();
      } catch (error: unknown) {
        const canRetry = attempt < maxAttempts && this.shouldRetryByError(error);
        if (canRetry) {
          await this.sleep(this.getRetryDelayMs(attempt));
          continue;
        }
        throw error;
      }
    }

    throw new Error(`Upload failed after ${maxAttempts} attempts`);
  }

  private async fetchRaw(path: string): Promise<Buffer> {
    const url = this.config.url + path;
    const headers: Record<string, string> = {};

    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, {
          method: "GET",
          headers,
        });

        if (!response.ok) {
          const text = await response.text();
          const canRetry =
            attempt < maxAttempts && this.shouldRetryByStatus(response.status);
          if (canRetry) {
            await this.sleep(this.getRetryDelayMs(attempt));
            continue;
          }
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error: unknown) {
        const canRetry = attempt < maxAttempts && this.shouldRetryByError(error);
        if (canRetry) {
          await this.sleep(this.getRetryDelayMs(attempt));
          continue;
        }
        throw error;
      }
    }

    throw new Error(`Download failed after ${maxAttempts} attempts`);
  }
}

/**
 * 获取/创建远程客户端单例
 */
let remoteClientInstance: RemoteClient | null = null;

export function getRemoteClient(
  config?: RemoteServerConfig,
): RemoteClient | null {
  if (config) {
    remoteClientInstance = new RemoteClient(config);
  }
  return remoteClientInstance;
}

export function clearRemoteClient(): void {
  remoteClientInstance = null;
}
