import { mkdir, appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class Evidence {
  readonly runId = randomUUID();
  readonly dir: string;
  private sequence = 0;
  private secrets: string[];
  constructor(root: string, values: unknown[] = []) {
    this.dir = join(root, this.runId);
    this.secrets = values
      .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
      .map(String)
      .filter(Boolean);
  }
  protect(value: string | number) {
    this.secrets.push(String(value));
  }
  redact(text: string) {
    let result = text;
    for (const secret of [...this.secrets].sort((a, b) => b.length - a.length))
      result = result.split(secret).join('[REDACTED]');
    return result
      .replace(/\b(?:sk-|Bearer\s+)[A-Za-z0-9_-]+/gi, '[REDACTED]')
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
  }
  sanitize(value: unknown): unknown {
    if (typeof value === 'string') return this.redact(value);
    if (typeof value === 'number' && this.secrets.includes(String(value))) return '[REDACTED]';
    if (Array.isArray(value)) return value.map((v) => this.sanitize(v));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.sanitize(v)]));
    return value;
  }
  async init() {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
  }
  async event(type: string, data: Record<string, unknown> = {}) {
    await this.init();
    await appendFile(
      join(this.dir, 'events.jsonl'),
      JSON.stringify(
        this.sanitize({ seq: ++this.sequence, at: new Date().toISOString(), type, ...data }),
      ) + '\n',
      { mode: 0o600 },
    );
  }
  async json(name: string, value: unknown) {
    await this.init();
    await writeFile(join(this.dir, name), JSON.stringify(this.sanitize(value), null, 2) + '\n', {
      mode: 0o600,
    });
  }
}
