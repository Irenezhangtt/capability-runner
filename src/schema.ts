import { z } from 'zod';

const id = z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/);
export const Field = z
  .object({
    type: z.enum(['string', 'number']),
    description: z.string().max(200),
    sensitive: z.boolean(),
  })
  .strict();
export const Target = z
  .object({
    frame: z.string().optional(),
    by: z.enum(['role', 'label', 'text']),
    role: z.enum(['button', 'link', 'heading', 'textbox', 'status', 'alert', 'cell']).optional(),
    name: z.string().min(1).max(160),
  })
  .strict()
  .refine((t) => t.by !== 'role' || !!t.role, 'Role targets require a role');
export type TargetSpec = z.infer<typeof Target>;
export const Action = z.discriminatedUnion('type', [
  z.object({ type: z.literal('navigate'), path: z.string().max(200) }).strict(),
  z.object({ type: z.literal('fill'), target: id, input: id }).strict(),
  z.object({ type: z.literal('click'), target: id }).strict(),
  z.object({ type: z.literal('extract'), target: id, output: id }).strict(),
]);
export type ActionSpec = z.infer<typeof Action>;
export const Checkpoint = z.object({ target: id, text: z.string().max(160) }).strict();
export const Postcondition = z.object({ target: id, equalsInput: id }).strict();
export const Step = z
  .object({
    id,
    action: Action,
    checkpoint: Checkpoint.optional(),
  })
  .strict();
export const Artifact = z
  .object({
    schemaVersion: z.literal('1.1'),
    capabilityVersion: z.literal('1.0.0'),
    name: id,
    description: z.string().min(1).max(300),
    app: z.object({ product: z.string(), version: z.string(), profileDigest: z.string() }).strict(),
    targets: z.record(id, Target),
    inputs: z.record(id, Field),
    outputs: z.record(id, Field),
    steps: z.array(Step).min(1).max(40),
    success: Checkpoint,
    postconditions: z.array(Postcondition).min(1),
    provenance: z
      .object({
        kind: z.enum(['llm_discovery', 'authored_fixture']),
        runId: z.string(),
        provider: z.string().optional(),
        model: z.string().optional(),
        createdAt: z.string(),
      })
      .strict(),
  })
  .strict();
export type Capability = z.infer<typeof Artifact>;
export const Decision = z
  .object({
    reason: z.string().max(400),
    action: Action.optional(),
    done: z.boolean(),
  })
  .strict()
  .refine((d) => (d.done ? !d.action : !!d.action), 'Choose exactly one action or done');
export type DecisionSpec = z.infer<typeof Decision>;
export type RunResult =
  | { status: 'success'; runId: string; outputs: Record<string, string | number> }
  | { status: 'business_outcome'; runId: string; code: string; step: string }
  | {
      status: 'failure';
      runId: string;
      code: string;
      step: string;
      expected: string;
      observed: string;
      evidence?: string;
    };

export class RunError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function validateInputs(
  capability: Pick<Capability, 'inputs'>,
  values: Record<string, unknown>,
) {
  if (Object.keys(values).some((k) => !(k in capability.inputs)))
    throw new RunError('INVALID_INPUT', 'Unknown input parameter');
  for (const [key, field] of Object.entries(capability.inputs)) {
    const value = values[key];
    if (
      typeof value !== field.type ||
      (typeof value === 'number' && !Number.isFinite(value)) ||
      (typeof value === 'string' && (!value.length || value.length > 100))
    ) {
      throw new RunError('INVALID_INPUT', `Invalid parameter: ${key}`);
    }
  }
}
