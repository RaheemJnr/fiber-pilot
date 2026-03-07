import { describe, it, expect, beforeEach } from "vitest";
import { SafetyLayer, SafetyConfig } from "./safety.js";

describe("SafetyLayer", () => {
  let safety: SafetyLayer;

  beforeEach(() => {
    safety = new SafetyLayer({
      maxChannelOpenAmount: 10000,
      maxPaymentAmount: 5000,
      dailySpendingLimit: 50000,
      requireApprovalAbove: 5000,
      allowedPeers: [],
      autoRebalanceEnabled: true,
      maxAutoRebalanceAmount: 3000,
    });
  });

  it("should allow amounts within limits", () => {
    const result = safety.checkChannelOpen(5000);
    expect(result.allowed).toBe(true);
  });

  it("should block amounts exceeding channel open limit", () => {
    const result = safety.checkChannelOpen(15000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("10000");
  });

  it("should require approval for amounts above threshold", () => {
    const result = safety.checkPayment(7000);
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it("should allow payments within limit", () => {
    const result = safety.checkPayment(3000);
    expect(result.allowed).toBe(true);
  });

  it("should track daily spending", () => {
    safety.recordSpend(48000);
    const result = safety.checkPayment(3000);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("daily");
  });

  it("should enforce peer whitelist when set", () => {
    safety = new SafetyLayer({
      maxChannelOpenAmount: 10000,
      maxPaymentAmount: 5000,
      dailySpendingLimit: 50000,
      requireApprovalAbove: 5000,
      allowedPeers: ["peer_abc"],
      autoRebalanceEnabled: true,
      maxAutoRebalanceAmount: 3000,
    });
    const result = safety.checkPeer("peer_xyz");
    expect(result.allowed).toBe(false);
  });

  it("should allow any peer when whitelist is empty", () => {
    const result = safety.checkPeer("peer_xyz");
    expect(result.allowed).toBe(true);
  });

  it("should return config", () => {
    const config = safety.getConfig();
    expect(config.maxChannelOpenAmount).toBe(10000);
  });
});
