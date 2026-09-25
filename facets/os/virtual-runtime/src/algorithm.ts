/**
 * virtual-runtime — CFS 는 매번 누구에게 CPU 를 주는가.
 *
 * 모형 (공통 안내문의 틱 모형 + 이 조각의 규약)
 *   - 시각의 단위는 틱. 프로세스는 모두 틱 0 부터 줄에 있고 끝나지 않는다 (길이 없음).
 *   - 가상 시간은 처음 0. 한 틱을 돌면 가상 시간 += baseWeight ÷ 무게.
 *   - 틱마다 가상 시간이 가장 작은 것을 고른다.
 *   - 동률이면 **가장 오래전에 돈 것**. 한 번도 안 돈 것이 가장 오래전이고, 그 안에서는 목록 차례.
 *     (줄이 없는 모형이라 "줄에 먼저 선 것" 대신 이 규칙이 차례를 정한다. 이 데이터에서는 동률이 여섯 번 난다)
 *   - `ticks` 틱을 돌고 멈춘다.
 *
 * 이벤트
 *   init  (silent) payload { max: number }
 *         max = 재생 동안 가상 시간이 닿는 가장 큰 값. 축의 끝을 정하는 바탕이다.
 *   pick  payload { tick: number; id: string; from: number; to: number; tie: string[]; by: 'least' | 'never' | 'oldest' }
 *         틱 tick 에 id 가 뽑혀 한 틱을 돌았다. 가상 시간 from → to.
 *         tie = 고르기 전 가장 작은 가상 시간을 가진 것들의 식별자 (목록 차례). 둘 이상이면 동률이었다.
 *         by  = 무엇이 갈랐는가. least — 동률 없이 가장 작았다 · never — 동률 가운데 아직 안 돈 것이 있어
 *               그중 목록 첫째 · oldest — 동률이 모두 돈 적이 있어 가장 오래전에 돈 것.
 *   done  payload { ticks: number }
 *         ticks 틱을 다 돌았다.
 *
 * 걸음: 걸음 0 = 모두 가상 시간 0 · 걸음 1..ticks = 틱 하나씩 · 마지막 걸음 = 끝.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type VirtualRuntimeTask = { id: string; weight: number };

export type VirtualRuntimeFacetData = {
  type: 'virtual-runtime';
  stepMs: number;
  /** 가상 시간이 한 틱에 1 씩 느는 무게. 한 틱 돌면 += baseWeight ÷ 무게 */
  baseWeight: number;
  ticks: number;
  tasks: VirtualRuntimeTask[];
};

export type VirtualRuntimePick = {
  tick: number;
  id: string;
  from: number;
  to: number;
  tie: string[];
  by: 'least' | 'never' | 'oldest';
};

/** 틱 모형을 돌려 고른 차례를 얻는다. 모르는 모양은 던진다 (C6). */
export function simulateVirtualRuntime(data: VirtualRuntimeFacetData): VirtualRuntimePick[] {
  if (!Number.isInteger(data.ticks) || data.ticks < 1) {
    throw new Error(`virtual-runtime: ticks 가 양의 정수가 아니다 (${String(data.ticks)})`);
  }
  if (!(data.baseWeight > 0)) {
    throw new Error(`virtual-runtime: baseWeight 가 양수가 아니다 (${String(data.baseWeight)})`);
  }
  if (data.tasks.length === 0) throw new Error('virtual-runtime: 프로세스가 없다');
  const seen = new Set<string>();
  for (const task of data.tasks) {
    if (seen.has(task.id)) throw new Error(`virtual-runtime: 식별자가 겹친다 (${task.id})`);
    seen.add(task.id);
    if (!(task.weight > 0)) {
      throw new Error(`virtual-runtime: ${task.id} 의 무게가 양수가 아니다 (${String(task.weight)})`);
    }
  }

  const v = data.tasks.map(() => 0);
  const last = data.tasks.map((): number | null => null);
  const picks: VirtualRuntimePick[] = [];

  for (let tick = 0; tick < data.ticks; tick += 1) {
    let best = 0;
    for (let i = 1; i < data.tasks.length; i += 1) {
      if (v[i]! < v[best]!) {
        best = i;
      } else if (v[i] === v[best]) {
        // 동률 — 가장 오래전에 돈 것. 한 번도 안 돈 것(null)이 가장 오래전, 그 안에서는 목록 차례.
        const li = last[i] ?? -1;
        const lb = last[best] ?? -1;
        if (li < lb) best = i;
      }
    }
    const task = data.tasks[best]!;
    const from = v[best]!;
    const tie = data.tasks.filter((_, i) => v[i] === from).map((x) => x.id);
    const by: VirtualRuntimePick['by'] =
      tie.length < 2 ? 'least' : last[best] === null ? 'never' : 'oldest';
    const to = from + data.baseWeight / task.weight;
    v[best] = to;
    last[best] = tick;
    picks.push({ tick, id: task.id, from, to, tie, by });
  }
  return picks;
}

export async function virtualRuntime(
  context: FacetContext<VirtualRuntimeFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<VirtualRuntimeFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const picks = simulateVirtualRuntime(data);
  const max = picks.reduce((m, p) => Math.max(m, p.to), 0);

  await ctx.emit({ type: 'init', payload: { max }, silent: true });
  // 걸음 0 은 셋이 0 에 선 화면이라 읽을 틈을 먼저 준다.
  if (!(await pause())) return;

  for (const p of picks) {
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'pick',
      payload: { tick: p.tick, id: p.id, from: p.from, to: p.to, tie: [...p.tie], by: p.by },
    });
    if (!(await pause())) return;
  }

  await ctx.emit({ type: 'done', payload: { ticks: data.ticks } });
}
