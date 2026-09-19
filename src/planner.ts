import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Decision, RunError, type DecisionSpec } from './schema.js';
import type { Planner } from './engine.js';
import type { Evidence } from './evidence.js';

const errors = {
  MODEL_CONFIG: 'Configure LLM_MODEL, provider API key, and an HTTPS endpoint in .env',
  MODEL_UNAVAILABLE: 'Model request failed or timed out',
  MODEL_HTTP_ERROR: 'Model provider rejected the request',
  MODEL_INVALID_RESPONSE: 'Provider returned an incomplete or invalid decision',
  MODEL_PROTOCOL_ERROR: 'Python planner protocol was invalid',
} as const;
const Envelope = z.discriminatedUnion('ok', [
  z
    .object({
      version: z.literal(1),
      ok: z.literal(true),
      decision: Decision,
      responseId: z.string().regex(/^[A-Za-z0-9_.:-]{1,256}$/),
      usage: z.record(z.string(), z.number().finite().nonnegative()),
    })
    .strict(),
  z
    .object({
      version: z.literal(1),
      ok: z.literal(false),
      code: z.enum(Object.keys(errors) as [keyof typeof errors, ...(keyof typeof errors)[]]),
    })
    .strict(),
]);

/** A local process boundary, not a network service or a Python execution tool for the model. */
export class ApiPlanner implements Planner {
  readonly kind = 'live_api' as const;
  readonly provider: string;
  readonly model: string;
  private env: NodeJS.ProcessEnv;
  private executable: string;
  constructor(
    private evidence: Evidence,
    env = process.env,
  ) {
    this.provider = env.LLM_PROVIDER || 'openai';
    this.model = env.LLM_MODEL || '';
    const keyName = this.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
    const key = env[keyName];
    if (!['openai', 'anthropic', 'compatible'].includes(this.provider) || !key || !this.model)
      throw new RunError('MODEL_CONFIG', errors.MODEL_CONFIG);
    evidence.protect(key);
    this.executable = env.PYTHON_BIN || 'python3';
    // Do not pass unrelated application secrets or Python startup hooks to the worker.
    this.env = {
      PATH: env.PATH,
      SYSTEMROOT: env.SYSTEMROOT,
      LANG: 'en_US.UTF-8',
      PYTHONIOENCODING: 'utf-8',
      LLM_PROVIDER: this.provider,
      LLM_MODEL: this.model,
      LLM_BASE_URL: env.LLM_BASE_URL,
      [keyName]: key,
    };
  }
  async decide(context: Record<string, unknown>): Promise<DecisionSpec> {
    const input = JSON.stringify({ version: 1, context });
    if (Buffer.byteLength(input) > 1_048_576)
      throw new RunError('MODEL_PROTOCOL_ERROR', errors.MODEL_PROTOCOL_ERROR);
    const raw = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        this.executable,
        ['-B', fileURLToPath(new URL('../python/run_planner.py', import.meta.url))],
        {
          env: this.env,
          timeout: 35_000,
          killSignal: 'SIGKILL',
          maxBuffer: 1_048_576,
          encoding: 'utf8',
        },
        (error, stdout) => {
          if (error)
            reject(
              new RunError(
                'MODEL_UNAVAILABLE',
                'Python planner could not run; check PYTHON_BIN and provider connectivity',
              ),
            );
          else resolve(stdout);
        },
      );
      child.stdin?.on('error', () => {
        /* Process failure is handled by execFile; never echo input. */
      });
      child.stdin?.end(input);
    });
    const parsed = (() => {
      try {
        return Envelope.parse(JSON.parse(raw));
      } catch {
        throw new RunError('MODEL_INVALID_RESPONSE', errors.MODEL_INVALID_RESPONSE);
      }
    })();
    if (!parsed.ok) throw new RunError(parsed.code, errors[parsed.code]);
    await this.evidence.event('model_response', {
      provider: this.provider,
      model: this.model,
      responseId: parsed.responseId,
      usage: parsed.usage,
      transport: 'python',
    });
    return parsed.decision;
  }
}
