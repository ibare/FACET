/**
 * 문맥 전환 비용 — 바꾸는 순간의 값과, 바꾼 뒤 식은 캐시에서 읽는 값을 따로 센다.
 *
 * 규약 (사양 그대로. 하나라도 다르게 짜면 다른 수가 나온다)
 *   - 읽기: 캐시에 있으면 `costs.hit` 틱, 없으면 `costs.miss` 틱을 쓰고 그 덩이를 캐시에 넣는다.
 *     칸이 차 있으면 **먼저 든 것부터** 밀어낸다 (캐시 목록의 맨 앞).
 *   - 바꿈: `costs.switch` 틱. 캐시는 그대로 둔다 (비우지 않는다).
 *   - 나눠 세기: 읽기마다 `costs.hit` 틱은 "일", 없는 것 읽기의 나머지(`miss - hit`)는
 *     "식은 캐시 값", 바꿈의 틱은 "바꾸는 값".
 *   - 한 걸음 = 읽기 하나 · 바꿈 하나. 걸음 0 = 시작 (initialData 의 캐시 · 실행 중인 프로세스, 시각 0).
 *   - 무엇을 적고 꺼내는지는 다루지 않는다 — 바꿈은 한 덩이의 시간이다.
 *
 * 이벤트
 *   init   (silent) { span: number }
 *          span = 전체 시각. 시간 띠의 축척을 걸음 0 에 정해 둔다
 *   read   { proc: string, block: string, hit: boolean, cost: number,
 *            gone: string | null,            밀려난 덩이 (없으면 null)
 *            before: string[], cache: string[],  읽기 전 · 뒤의 캐시 (먼저 든 차례)
 *            clock: number, work: number, switching: number, cold: number }  누적
 *   switch { from: string, to: string, cost: number,
 *            clock: number, work: number, switching: number, cold: number }
 *
 * 모르는 동작 · 없는 덩이 · 없는 프로세스 · 실행 중이 아닌 프로세스의 읽기 · 자기 자신으로의 바꿈은 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SwitchCostsOp =
  | { op: 'read'; proc: string; block: string }
  | { op: 'switch'; to: string };

export interface SwitchCostsFacetData {
  type: 'switch-costs';
  stepMs: number;
  costs: { hit: number; miss: number; switch: number };
  capacity: number;
  procs: string[];
  /** 메모리에 있는 덩이와 그 주인 */
  blocks: { id: string; owner: string }[];
  /** 걸음 0 에 CPU 에 있는 프로세스 */
  running: string;
  /** 걸음 0 의 캐시, 먼저 든 차례 */
  cache: string[];
  plan: SwitchCostsOp[];
}

type Totals = { clock: number; work: number; switching: number; cold: number };

type ReadStep = {
  kind: 'read';
  proc: string;
  block: string;
  hit: boolean;
  cost: number;
  gone: string | null;
  before: string[];
  cache: string[];
} & Totals;

type SwitchStep = { kind: 'switch'; from: string; to: string; cost: number } & Totals;

function positive(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`switch-costs: ${what} 는 양의 정수여야 한다 (${String(v)})`);
  }
  return v;
}

/** 차례표를 따라 걸음을 셈한다. 데이터가 틀리면 몇 번째 동작인지 담아 던진다. */
export function switchCostsSteps(data: SwitchCostsFacetData): (ReadStep | SwitchStep)[] {
  const hitCost = positive(data.costs.hit, 'costs.hit');
  const missCost = positive(data.costs.miss, 'costs.miss');
  const switchCost = positive(data.costs.switch, 'costs.switch');
  if (missCost < hitCost) throw new Error('switch-costs: costs.miss 가 costs.hit 보다 작다');
  const capacity = positive(data.capacity, 'capacity');
  const procs = new Set(data.procs);
  const blocks = new Set<string>();
  for (const b of data.blocks) {
    if (!procs.has(b.owner)) throw new Error(`switch-costs: 덩이 ${b.id} 의 주인 ${b.owner} 가 procs 에 없다`);
    if (blocks.has(b.id)) throw new Error(`switch-costs: 덩이 ${b.id} 가 두 번 적혔다`);
    blocks.add(b.id);
  }
  if (!procs.has(data.running)) throw new Error(`switch-costs: 시작 프로세스 ${data.running} 가 procs 에 없다`);
  if (data.cache.length > capacity) throw new Error('switch-costs: 시작 캐시가 칸 수보다 많다');
  for (const id of data.cache) {
    if (!blocks.has(id)) throw new Error(`switch-costs: 시작 캐시의 ${id} 가 blocks 에 없다`);
  }
  if (new Set(data.cache).size !== data.cache.length) throw new Error('switch-costs: 시작 캐시에 같은 덩이가 둘 있다');

  let cache = [...data.cache];
  let running = data.running;
  const sum: Totals = { clock: 0, work: 0, switching: 0, cold: 0 };
  const out: (ReadStep | SwitchStep)[] = [];

  data.plan.forEach((op, i) => {
    const where = `plan[${i}]`;
    if (op.op === 'switch') {
      if (!procs.has(op.to)) throw new Error(`switch-costs: ${where} 의 ${op.to} 가 procs 에 없다`);
      if (op.to === running) throw new Error(`switch-costs: ${where} 가 이미 실행 중인 ${op.to} 로 바꾼다`);
      sum.clock += switchCost;
      sum.switching += switchCost;
      out.push({ kind: 'switch', from: running, to: op.to, cost: switchCost, ...sum });
      running = op.to;
      return;
    }
    if (op.op === 'read') {
      if (op.proc !== running) throw new Error(`switch-costs: ${where} 의 ${op.proc} 는 실행 중이 아니다 (${running})`);
      if (!blocks.has(op.block)) throw new Error(`switch-costs: ${where} 의 ${op.block} 가 blocks 에 없다`);
      const before = [...cache];
      const hit = cache.includes(op.block);
      let gone: string | null = null;
      if (!hit) {
        const next = [...cache];
        if (next.length >= capacity) {
          const first = next.shift();
          if (first === undefined) throw new Error(`switch-costs: ${where} 에서 밀어낼 덩이가 없다`);
          gone = first;
        }
        next.push(op.block);
        cache = next;
      }
      const cost = hit ? hitCost : missCost;
      sum.clock += cost;
      sum.work += hitCost;
      sum.cold += cost - hitCost;
      out.push({ kind: 'read', proc: op.proc, block: op.block, hit, cost, gone, before, cache: [...cache], ...sum });
      return;
    }
    throw new Error(`switch-costs: ${where} 의 동작을 모른다 (${JSON.stringify(op)})`);
  });
  return out;
}

export async function switchCosts(context: FacetContext<SwitchCostsFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<SwitchCostsFacetData>;
  const data = ctx.data;
  const stepMs = positive(data.stepMs, 'stepMs');
  const steps = switchCostsSteps(data);
  const last = steps[steps.length - 1];
  const span = last === undefined ? 0 : last.clock;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { span }, silent: true });

  // 걸음 0 이 이미 읽을 화면(캐시 두 칸 · CPU)이라 첫 걸음 앞에도 쉰다.
  for (const s of steps) {
    if (!(await pause())) return;
    if (s.kind === 'switch') {
      await ctx.emit({
        type: 'switch',
        payload: {
          from: s.from, to: s.to, cost: s.cost,
          clock: s.clock, work: s.work, switching: s.switching, cold: s.cold,
        },
      });
    } else {
      await ctx.emit({
        type: 'read',
        payload: {
          proc: s.proc, block: s.block, hit: s.hit, cost: s.cost, gone: s.gone,
          before: s.before, cache: s.cache,
          clock: s.clock, work: s.work, switching: s.switching, cold: s.cold,
        },
      });
    }
  }
}
