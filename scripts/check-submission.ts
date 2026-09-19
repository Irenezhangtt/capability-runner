import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Artifact } from '../src/schema.js';

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir,{withFileTypes:true}).catch(() => []);
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(join(dir,e.name)) : [join(dir,e.name)]))).flat();
}
const paths = await files('evidence');
const discovered = new Set<string>();
for (const path of paths.filter(p => p.endsWith('artifact.json'))) {
  const parsed = Artifact.safeParse(JSON.parse(await readFile(path,'utf8')));
  if (parsed.success && parsed.data.provenance.kind === 'llm_discovery') discovered.add(parsed.data.provenance.runId);
}
const verifiedDiscovery = new Set<string>();
const verifiedReplay = new Set<string>();
for (const path of paths.filter(p => p.endsWith('events.jsonl'))) {
  const events = (await readFile(path,'utf8')).trim().split('\n').map(line => JSON.parse(line));
  const first = events.find(e => e.type === 'run_started');
  const success = events.some(e => e.type === 'run_completed');
  const runId = path.split('/').at(-2)!;
  if (first?.mode === 'llm_discovery' && discovered.has(runId) && success && events.some(e => e.type === 'model_response' && e.responseId)) verifiedDiscovery.add(runId);
  if (first?.mode === 'deterministic_replay' && first.sourceKind === 'llm_discovery' && success && !events.some(e => e.type === 'model_response')) verifiedReplay.add(first.sourceRunId);
}
const ready = [...verifiedDiscovery].some(id => verifiedReplay.has(id));
console.log(JSON.stringify({ready,checks:{realDiscovery:verifiedDiscovery.size>0,replayOfDiscoveredCapability:[...verifiedDiscovery].some(id => verifiedReplay.has(id))},note:'This checks evidence completeness, not cryptographic authenticity. Human review and repository publication are separate.'},null,2));
process.exitCode = ready ? 0 : 1;
