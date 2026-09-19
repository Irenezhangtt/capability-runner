import type { ManagedSurface } from './surface.js';
import { Handoff } from './handoff.js';
import { Artifact, type Capability, type RunResult, type ActionSpec, type DecisionSpec, RunError, validateInputs } from './schema.js';
import { bindCapability, digest } from './profile.js';
import type { Evidence } from './evidence.js';

export interface Planner {
  kind: 'live_api' | 'test_fixture';
  provider: string;
  model: string;
  decide(context: Record<string, unknown>): Promise<DecisionSpec>;
}
export type Contract = Pick<Capability,'name'|'description'|'inputs'|'outputs'>;

export class Runner {
  readonly handoff: Handoff;
  private step = 'initialization';
  private expected = 'Valid capability, inputs, and application profile';
  private outputs: Record<string,string|number> = {};
  constructor(readonly surface: ManagedSurface, readonly evidence: Evidence, human = false, handoffTimeout?: number) {
    this.handoff = new Handoff(surface,human,handoffTimeout);
  }
  private async failure(error: unknown): Promise<RunResult> {
    // Never persist raw Playwright errors: call logs can include entered values.
    const code = error instanceof RunError ? error.code : 'UI_EXECUTION_FAILED';
    const observed = error instanceof RunError ? error.message : 'UI action timed out or failed; inspect sanitized evidence';
    const evidence = await this.surface.failureEvidence().catch(() => undefined);
    const state = await this.surface.observe().catch(() => undefined);
    const result: RunResult = {status:'failure',runId:this.evidence.runId,code,step:this.step,expected:this.expected,observed:`${observed}; visible controls: ${state?.visibleTargets.join(', ') || 'unavailable'}`,evidence};
    await this.evidence.json('result.json',result);
    await this.evidence.event('run_failed', {code,step:this.step});
    return result;
  }
  private async settle(capability: string, checkpoint?: {target:string;text:string}): Promise<string | undefined> {
    const until = Date.now()+6000;
    let recoveries = 0;
    while (Date.now() < until) {
      await this.surface.healthy();
      let recovered = false;
      for (const condition of this.surface.profile.conditions) {
        if (!await this.surface.visible(condition.target)) continue;
        await this.evidence.event('condition_detected',{step:this.step,code:condition.code,kind:condition.kind});
        if (condition.kind === 'business') return condition.code;
        if (condition.kind === 'hard') throw new RunError(condition.code,'Application explicitly denied the operation');
        if (condition.kind === 'recoverable') {
          if (recoveries++ >= 2 || !condition.recoveryTarget) throw new RunError('RECOVERY_EXHAUSTED','Bounded recovery budget exhausted');
          await this.surface.act({type:'click',target:condition.recoveryTarget},{},{});
          await this.evidence.event('recovery_action',{target:condition.recoveryTarget,attempt:recoveries});
          recovered = true;
          break;
        }
        if (!checkpoint) throw new RunError('INTERVENTION_REQUIRED','A reviewed resume checkpoint is required');
        await this.handoff.request({capability,step:this.step,code:condition.code,expected:checkpoint.text}, async () => {
          await this.surface.healthy();
          return await this.surface.check(checkpoint.target,checkpoint.text);
        });
        return;
      }
      if (recovered) continue;
      if (!checkpoint || await this.surface.check(checkpoint.target,checkpoint.text)) return;
      await new Promise(r => setTimeout(r,100));
    }
    if (checkpoint) {
      await this.handoff.request({capability,step:this.step,code:'CHECKPOINT_TIMEOUT',expected:checkpoint.text}, async () => {
        await this.surface.healthy();
        return this.surface.check(checkpoint.target,checkpoint.text);
      });
    }
  }
  private async business(code: string): Promise<RunResult> {
    const result: RunResult = {status:'business_outcome',runId:this.evidence.runId,code,step:this.step};
    await this.evidence.json('result.json',result);
    return result;
  }
  private async success(contract: Contract): Promise<RunResult> {
    if (!await this.surface.check(this.surface.profile.success.target,this.surface.profile.success.text)) throw new RunError('SUCCESS_CHECK_FAILED','Final checkpoint was not reached');
    if (Object.keys(contract.outputs).some(k => this.outputs[k] === undefined)) throw new RunError('OUTPUT_MISSING','A declared output was not extracted');
    const result: RunResult = {status:'success',runId:this.evidence.runId,outputs:this.outputs};
    await this.evidence.json('result.json',result);
    await this.evidence.event('run_completed', {outputNames:Object.keys(this.outputs)});
    return result;
  }
  async replay(raw: unknown, inputs: Record<string,unknown>): Promise<RunResult> {
    try {
      const cap = Artifact.parse(raw);
      bindCapability(cap,this.surface.profile);
      validateInputs(cap,inputs);
      await this.evidence.event('run_started',{mode:'deterministic_replay',capability:cap.name,sourceRunId:cap.provenance.runId,sourceKind:cap.provenance.kind,llmCalls:0});
      for (const step of cap.steps) {
        this.step = step.id;
        this.expected = step.checkpoint?.text ?? JSON.stringify(step.action);
        await this.evidence.event('action_started',{step:step.id,action:step.action});
        let value: string | number | undefined;
        try { value = await this.surface.act(step.action,inputs,cap.outputs); }
        catch (error) {
          // Never retry an uncertain click. An operator may establish the recorded
          // postcondition, after which this step is considered complete.
          if (error instanceof RunError || !step.checkpoint) throw error;
          await this.handoff.request({capability:cap.name,step:step.id,code:'UI_ACTION_FAILED',expected:step.checkpoint.text}, async () => {
            await this.surface.healthy();
            return this.surface.check(step.checkpoint!.target,step.checkpoint!.text);
          });
        }
        if (step.action.type === 'extract' && value !== undefined) this.outputs[step.action.output] = value;
        const outcome = await this.settle(cap.name,step.checkpoint);
        if (outcome) return await this.business(outcome);
        await this.evidence.event('action_completed',{step:step.id,checkpoint:step.checkpoint});
      }
      return await this.success(cap);
    } catch (error) { return this.failure(error); }
  }
  async discover(goal: string, contract: Contract, inputs: Record<string,unknown>, planner: Planner, limits = {maxSteps:24,timeoutMs:120_000}): Promise<{result:RunResult;artifact?:Capability}> {
    const steps: Capability['steps'] = [];
    const history: {action:ActionSpec; visibleTargets:string[]}[] = [];
    try {
      validateInputs(contract,inputs);
      await this.evidence.event('run_started',{mode:'llm_discovery',provider:planner.provider,model:planner.model,goal:this.evidence.redact(goal)});
      const begin = Date.now();
      this.step = 'entry';
      const entry: ActionSpec = {type:'navigate',path:this.surface.profile.entry};
      await this.surface.act(entry,inputs,contract.outputs);
      steps.push({id:'entry',action:entry,checkpoint:{target:'searchReady',text:this.surface.profile.checkpoints.searchReady!}});
      await this.evidence.event('action_completed',{step:'entry',action:entry});
      let repeated = 0;
      for (let n=0;n<limits.maxSteps;n++) {
        this.step = `step${n+1}`;
        if (Date.now()-begin > limits.timeoutMs) throw new RunError('DISCOVERY_TIMEOUT','Discovery time budget exhausted');
        const state = await this.surface.observe();
        const decision = await planner.decide({
          goal:this.evidence.redact(goal), contract,
          // Parameter names/types only; the browser resolves actual values locally.
          state, history:history.slice(-8), extractedOutputs:Object.keys(this.outputs),
          allowedTargets:this.surface.profile.permissions,
          outputTargets:this.surface.profile.outputTargets,
        });
        await this.evidence.event('model_decision',{step:this.step,...decision,state});
        if (decision.done) {
          const result = await this.success(contract);
          const artifact = Artifact.parse({...contract,schemaVersion:'1.0',capabilityVersion:'1.0.0',app:{product:this.surface.profile.product,version:this.surface.profile.version,profileDigest:digest(this.surface.profile)},targets:this.surface.profile.targets,steps,success:this.surface.profile.success,provenance:{kind:planner.kind === 'live_api' ? 'llm_discovery' : 'authored_fixture',runId:this.evidence.runId,provider:planner.provider,model:planner.model,createdAt:new Date().toISOString()}});
          bindCapability(artifact,this.surface.profile);
          await this.evidence.json('artifact.json',artifact);
          return {result,artifact};
        }
        const action = decision.action!;
        if (action.type === 'navigate') throw new RunError('DISCOVERY_ACTION_REJECTED','Entry navigation is managed by the runner');
        const sig = JSON.stringify({action,state});
        const previous = history.at(-1);
        repeated = previous && JSON.stringify({action:previous.action,state:{screen:state.screen,visibleTargets:previous.visibleTargets}}) === sig ? repeated+1 : 0;
        if (repeated >= 2) {
          const cp = this.surface.profile.success;
          await this.handoff.request({capability:contract.name,step:this.step,code:'DISCOVERY_STUCK',expected:cp.text}, () => this.surface.check(cp.target,cp.text));
          // Manual discovery changes are not silently compiled into an incomplete flow.
          throw new RunError('DISCOVERY_REQUIRES_RERECORD','Manual discovery intervention requires a new recording');
        }
        const value = await this.surface.act(action,inputs,contract.outputs);
        if (action.type === 'extract' && value !== undefined) this.outputs[action.output] = value;
        const outcome = await this.settle(contract.name);
        if (outcome) return {result:await this.business(outcome)};
        let checkpoint: Capability['success'] | undefined;
        for (const [target,text] of Object.entries(this.surface.profile.checkpoints)) {
          if (await this.surface.check(target,text)) checkpoint = {target,text};
        }
        steps.push({id:this.step,action,checkpoint});
        history.push({action,visibleTargets:state.visibleTargets});
        await this.evidence.event('action_completed',{step:this.step,action,checkpoint});
      }
      throw new RunError('MAX_STEPS','Discovery step budget exhausted');
    } catch (error) { return {result:await this.failure(error)}; }
  }
}
