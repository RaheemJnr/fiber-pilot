import { describe, it, expect, vi, beforeEach } from "vitest";
import { FiberRpcClient } from "./fiber-rpc.js";

describe("FiberRpcClient", () => {
  let client: FiberRpcClient;

  beforeEach(() => {
    client = new FiberRpcClient("http://127.0.0.1:8227");
  });

  it("should construct with a URL", () => {
    expect(client).toBeDefined();
  });

  it("should format JSON-RPC requests correctly", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ jsonrpc: "2.0", id: 1, result: { node_name: "test" } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.call("node_info", []);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8227",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining('"method":"node_info"'),
      })
    );
    expect(result).toEqual({ node_name: "test" });

    vi.unstubAllGlobals();
  });

  it("should throw on RPC error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "Method not found" },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(client.call("bad_method", [])).rejects.toThrow("Method not found");

    vi.unstubAllGlobals();
  });

  it("should throw on HTTP error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    vi.stubGlobal("fetch", mockFetch);

    await expect(client.call("node_info", [])).rejects.toThrow();

    vi.unstubAllGlobals();
  });
});
