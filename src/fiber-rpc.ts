export class FiberRpcClient {
  private url: string;
  private requestId = 0;

  constructor(url: string) {
    this.url = url;
  }

  async call<T = unknown>(method: string, params: unknown[]): Promise<T> {
    this.requestId++;

    const response = await fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: this.requestId,
        method,
        params,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      result?: T;
      error?: { code: number; message: string };
    };

    if (data.error) {
      throw new Error(`RPC error ${data.error.code}: ${data.error.message}`);
    }

    return data.result as T;
  }
}
