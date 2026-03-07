export interface SafetyConfig {
  maxChannelOpenAmount: number;
  maxPaymentAmount: number;
  dailySpendingLimit: number;
  requireApprovalAbove: number;
  allowedPeers: string[];
  autoRebalanceEnabled: boolean;
  maxAutoRebalanceAmount: number;
}

export interface SafetyCheck {
  allowed: boolean;
  requiresApproval?: boolean;
  reason?: string;
}

export class SafetyLayer {
  private config: SafetyConfig;
  private dailySpent = 0;
  private dailyResetDate: string;

  constructor(config: SafetyConfig) {
    this.config = config;
    this.dailyResetDate = new Date().toISOString().split("T")[0];
  }

  private resetDailyIfNeeded() {
    const today = new Date().toISOString().split("T")[0];
    if (today !== this.dailyResetDate) {
      this.dailySpent = 0;
      this.dailyResetDate = today;
    }
  }

  checkChannelOpen(amount: number): SafetyCheck {
    if (amount > this.config.maxChannelOpenAmount) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Amount ${amount} exceeds max channel open limit of ${this.config.maxChannelOpenAmount} CKB.`,
      };
    }
    return this.checkDailyLimit(amount);
  }

  checkPayment(amount: number): SafetyCheck {
    if (amount > this.config.maxPaymentAmount) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Amount ${amount} exceeds max payment limit of ${this.config.maxPaymentAmount} CKB.`,
      };
    }
    if (amount > this.config.requireApprovalAbove) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Amount ${amount} exceeds approval threshold of ${this.config.requireApprovalAbove} CKB. Human approval required.`,
      };
    }
    return this.checkDailyLimit(amount);
  }

  checkPeer(peerId: string): SafetyCheck {
    if (this.config.allowedPeers.length > 0 && !this.config.allowedPeers.includes(peerId)) {
      return {
        allowed: false,
        reason: `Peer ${peerId} is not in the allowed peers list.`,
      };
    }
    return { allowed: true };
  }

  checkRebalance(amount: number): SafetyCheck {
    if (!this.config.autoRebalanceEnabled) {
      return { allowed: false, reason: "Auto-rebalance is disabled." };
    }
    if (amount > this.config.maxAutoRebalanceAmount) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Rebalance amount ${amount} exceeds max of ${this.config.maxAutoRebalanceAmount} CKB.`,
      };
    }
    return { allowed: true };
  }

  recordSpend(amount: number) {
    this.resetDailyIfNeeded();
    this.dailySpent += amount;
  }

  getConfig(): SafetyConfig {
    return { ...this.config };
  }

  private checkDailyLimit(amount: number): SafetyCheck {
    this.resetDailyIfNeeded();
    if (this.dailySpent + amount > this.config.dailySpendingLimit) {
      return {
        allowed: false,
        requiresApproval: true,
        reason: `Amount ${amount} would exceed daily spending limit of ${this.config.dailySpendingLimit} CKB (spent today: ${this.dailySpent}).`,
      };
    }
    return { allowed: true };
  }
}
