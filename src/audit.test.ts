import { describe, it, expect } from "vitest";
import { AuditLog, AuditEntry } from "./audit.js";

describe("AuditLog", () => {
  it("should log an action", () => {
    const log = new AuditLog();
    log.record({
      tool: "fp_open_channel",
      params: { peer_id: "abc", funding_amount: 5000 },
      result: "success",
      detail: "Opened channel with 5000 CKB",
    });
    const entries = log.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].tool).toBe("fp_open_channel");
    expect(entries[0].timestamp).toBeDefined();
  });

  it("should return entries in reverse chronological order", () => {
    const log = new AuditLog();
    log.record({ tool: "first", params: {}, result: "success", detail: "" });
    log.record({ tool: "second", params: {}, result: "success", detail: "" });
    const entries = log.getEntries();
    expect(entries[0].tool).toBe("second");
    expect(entries[1].tool).toBe("first");
  });

  it("should limit returned entries", () => {
    const log = new AuditLog();
    for (let i = 0; i < 20; i++) {
      log.record({ tool: `tool_${i}`, params: {}, result: "success", detail: "" });
    }
    const entries = log.getEntries(5);
    expect(entries).toHaveLength(5);
  });
});
