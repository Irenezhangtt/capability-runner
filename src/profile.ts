import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Target, type TargetSpec, type Capability, type ActionSpec, RunError } from './schema.js';

// A trusted app adapter supplies controls and condition detectors, never a flow.
// Discovery still decides the order of actions against live observations.
export const Profile = z.object({
  product: z.string(), version: z.string(), origin: z.string().url(), entry: z.string(),
  frame: z.string(), fingerprint: z.string(),
  allowedPaths: z.array(z.string()),
  allowedActions: z.array(z.enum(['navigate', 'fill', 'click', 'extract'])),
  targets: z.record(z.string(), Target),
  permissions: z.record(z.string(), z.array(z.enum(['fill', 'click', 'extract']))),
  riskyTargets: z.array(z.string()),
  checkpoints: z.record(z.string(), z.string()),
  conditions: z.array(z.object({
    target: z.string(), kind: z.enum(['business', 'recoverable', 'handoff', 'hard']),
    code: z.string(), recoveryTarget: z.string().optional(),
  }).strict()),
  success: z.object({ target: z.string(), text: z.string() }).strict(),
  outputTargets: z.record(z.string(), z.string()),
}).strict();
export type AppProfile = z.infer<typeof Profile>;
export function digest(profile: AppProfile): string {
  const { origin: _, ...portable } = profile;
  return createHash('sha256').update(JSON.stringify(portable)).digest('hex');
}
export function bindCapability(cap: Capability, profile: AppProfile) {
  if (cap.app.product !== profile.product || cap.app.version !== profile.version || cap.app.profileDigest !== digest(profile)) {
    throw new RunError('PROFILE_MISMATCH', 'Capability does not match the reviewed app profile');
  }
  if (JSON.stringify(cap.success) !== JSON.stringify(profile.success)) throw new RunError('CONTRACT_MISMATCH', 'Untrusted success checkpoint');
  if (JSON.stringify(cap.targets) !== JSON.stringify(profile.targets)) throw new RunError('CONTRACT_MISMATCH', 'Target definitions differ from the reviewed profile');
  const outputs = new Set<string>();
  for (const step of cap.steps) {
    const a = step.action;
    if ('target' in a && !profile.targets[a.target]) throw new RunError('UNKNOWN_TARGET', 'Unknown target');
    if (a.type === 'fill' && !cap.inputs[a.input]) throw new RunError('CONTRACT_MISMATCH', 'Missing input declaration');
    if (a.type === 'extract') {
      if (!cap.outputs[a.output] || profile.outputTargets[a.output] !== a.target) throw new RunError('CONTRACT_MISMATCH', 'Untrusted output binding');
      outputs.add(a.output);
    }
    if (step.checkpoint && profile.checkpoints[step.checkpoint.target] !== step.checkpoint.text) throw new RunError('CONTRACT_MISMATCH', 'Untrusted checkpoint');
  }
  if (new Set(cap.steps.map(s => s.id)).size !== cap.steps.length) throw new RunError('CONTRACT_MISMATCH', 'Duplicate step IDs');
  if (Object.keys(cap.outputs).some(k => !outputs.has(k))) throw new RunError('CONTRACT_MISMATCH', 'Missing output extraction');
}

export class Policy {
  constructor(readonly profile: AppProfile) {}
  url(raw: string) {
    const u = new URL(raw, this.profile.origin);
    if (u.origin !== this.profile.origin || u.username || u.password ||
        !this.profile.allowedPaths.includes(u.pathname) ||
        [...u.searchParams.keys()].some(k => k !== 'memberId') ||
        [...u.searchParams.values()].some(v => !/^[a-zA-Z0-9_-]{1,40}$/.test(v))) {
      throw new RunError('POLICY_BLOCKED', 'URL is outside the configured allowlist');
    }
    return u.href;
  }
  action(a: ActionSpec) {
    if (!this.profile.allowedActions.includes(a.type)) throw new RunError('POLICY_BLOCKED', 'Action type is not allowed');
    if (a.type === 'navigate') {
      if (a.path !== this.profile.entry) throw new RunError('POLICY_BLOCKED', 'Only the configured entry point may be navigated directly');
      this.url(a.path);
      return;
    }
    if (!this.profile.targets[a.target]) throw new RunError('UNKNOWN_TARGET', 'Target is not configured');
    if (this.profile.riskyTargets.includes(a.target)) throw new RunError('RISKY_ACTION_BLOCKED', 'Irreversible actions are blocked in this implementation');
    if (!this.profile.permissions[a.target]?.includes(a.type)) throw new RunError('POLICY_BLOCKED', 'Action is not permitted on this target');
  }
}
