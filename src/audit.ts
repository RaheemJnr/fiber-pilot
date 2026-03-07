export interface AuditEntry {
  timestamp: string;
  tool: string;
  params: Record<string, unknown>;
  result: string;
  detail: string;
}

export class AuditLog {
  private entries: AuditEntry[] = [];

  record(entry: Omit<AuditEntry, "timestamp">) {
    this.entries.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }

  getEntries(limit?: number): AuditEntry[] {
    const reversed = [...this.entries].reverse();
    return limit ? reversed.slice(0, limit) : reversed;
  }
}
