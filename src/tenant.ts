import { z } from 'zod';
import { Profile, canonical, digest, contentHash, type AppProfile } from './profile.js';
import { RunError, type ActionSpec, type Capability } from './schema.js';
import type { ManagedSurface } from './surface.js';

/** Presentation-only overlay. No routes, actions, outputs, or recovery logic. */
export const TenantOverlay = z
  .object({
    schemaVersion: z.literal('1.0'),
    id: z.string().regex(/^[a-z][a-z0-9-]{0,40}$/),
    baseProfileDigest: z.string().regex(/^[a-f0-9]{64}$/),
    rationale: z.string().min(1).max(500),
    fingerprint: z.string().min(1).max(160),
    frameTitle: z.string().regex(/^[A-Za-z0-9 _-]{1,80}$/),
    labels: z.record(z.string(), z.string().min(1).max(160)),
  })
  .strict();
export type TenantSpec = z.infer<typeof TenantOverlay>;
export type Binding = {
  base: AppProfile;
  effective: AppProfile;
  overlay: TenantSpec;
  hash: string;
  changes: { target: string; from: string; to: string }[];
};

export function compileTenant(base: AppProfile, raw: unknown): Binding {
  const parsed = TenantOverlay.safeParse(raw);
  if (!parsed.success)
    throw new RunError(
      'TENANT_OVERLAY_INVALID',
      'Overlay contains unsupported fields or invalid values',
    );
  const overlay = parsed.data;
  if (overlay.baseProfileDigest !== digest(base))
    throw new RunError(
      'TENANT_BASE_DRIFT',
      'Tenant overlay was authored for a different base profile',
    );
  const effective = structuredClone(base);
  const frame = `iframe[title="${overlay.frameTitle}"]`;
  effective.frame = frame;
  effective.fingerprint = overlay.fingerprint;
  const changes: Binding['changes'] = [];
  for (const target of Object.values(effective.targets)) {
    if (target.frame !== base.frame)
      throw new RunError(
        'TENANT_OVERLAY_INVALID',
        'Only the reviewed single-frame surface can be rebound',
      );
    target.frame = frame;
  }
  for (const [id, name] of Object.entries(overlay.labels)) {
    if (!effective.targets[id])
      throw new RunError('TENANT_OVERLAY_INVALID', 'Overlay cannot create new targets');
    const from = effective.targets[id]!.name;
    effective.targets[id]!.name = name;
    changes.push({ target: id, from, to: name });
    if (effective.checkpoints[id] === from) effective.checkpoints[id] = name;
    if (effective.entryCheckpoint.target === id && effective.entryCheckpoint.text === from)
      effective.entryCheckpoint.text = name;
    if (effective.success.target === id && effective.success.text === from)
      effective.success.text = name;
  }
  const riskyNames = new Set(
    base.riskyTargets.flatMap((id) => [base.targets[id]?.name, effective.targets[id]?.name]),
  );
  for (const [id, permissions] of Object.entries(effective.permissions)) {
    if (permissions.includes('click') && riskyNames.has(effective.targets[id]?.name))
      throw new RunError(
        'TENANT_POLICY_ESCALATION',
        'An allowed control cannot be rebound to a known risky control',
      );
  }
  // Duplicate physical addresses are rejected before the browser is launched.
  const addresses = Object.values(effective.targets).map(canonical);
  if (new Set(addresses).size !== addresses.length)
    throw new RunError(
      'TENANT_AMBIGUOUS_BINDING',
      'Two logical targets resolve to the same control',
    );
  return {
    base,
    effective: Profile.parse(effective),
    overlay,
    hash: contentHash(overlay),
    changes,
  };
}

/** Keep the capability byte-identical; translate physical addresses at the seam. */
export class TenantSurface implements ManagedSurface {
  readonly profile: AppProfile;
  readonly evidence;
  private announced = false;
  constructor(
    private inner: ManagedSurface,
    readonly binding: Binding,
  ) {
    if (digest(inner.profile) !== digest(binding.effective))
      throw new RunError(
        'TENANT_BINDING_MISMATCH',
        'Surface does not match the effective tenant profile',
      );
    this.profile = binding.base;
    this.evidence = inner.evidence;
  }
  get owner() {
    return this.inner.owner;
  }
  set owner(value: ManagedSurface['owner']) {
    this.inner.owner = value;
  }
  healthy() {
    return this.inner.healthy();
  }
  observe() {
    return this.inner.observe();
  }
  visible(target: string) {
    return this.inner.visible(target);
  }
  matchesInput(target: string, value: string | number) {
    return this.inner.matchesInput(target, value);
  }
  failureEvidence() {
    return this.inner.failureEvidence();
  }
  check(target: string, text: string) {
    if (this.profile.checkpoints[target] !== text)
      throw new RunError(
        'TENANT_CHECKPOINT_INVALID',
        'Checkpoint is outside the canonical contract',
      );
    return this.inner.check(target, this.binding.effective.checkpoints[target]!);
  }
  async act(action: ActionSpec, inputs: Record<string, unknown>, outputs: Capability['outputs']) {
    if (!this.announced) {
      await this.evidence.event('tenant_binding', {
        tenant: this.binding.overlay.id,
        overlayHash: this.binding.hash,
        baseProfileDigest: digest(this.profile),
        effectiveProfileDigest: digest(this.binding.effective),
        changes: this.binding.changes,
      });
      this.announced = true;
    }
    return this.inner.act(action, inputs, outputs);
  }
}
