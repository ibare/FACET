/**
 * independent-in-parallel — 서로 모르는 것은 함께 세운다.
 *
 * 일꾼 여럿(make -j4 꼴)이 시계를 따라 대상을 세운다. 시각 t 에서는 먼저 t 에 끝나는 것을
 * 끝내고, 그다음 입력이 모두 끝난 대상 가운데 아직 시작하지 않은 것을 빈 일꾼에 올린다.
 * 준비된 것이 빈 일꾼보다 많으면 데이터 차례대로 올리고 나머지는 다음 시각을 기다린다.
 * 다음 시각은 일하는 것 가운데 가장 이른 끝 시각이다.
 *
 * ## 이벤트
 *
 * - `tick` (silent 아님) — 무엇이 끝나거나 시작하는 시각 하나가 걸음 하나다.
 *   payload: `{ t: number; finished: string[]; started: { name: string; worker: number }[] }`
 *   - `t` 는 초(정수). `finished` 는 이 시각에 끝난 대상 이름(데이터 차례).
 *   - `started` 는 이 시각에 일꾼에 오른 대상과 그 일꾼 번호(0 부터). 빈 일꾼 가운데 번호가 가장 낮은 것에 오른다.
 *
 * 걸음 0 은 장면의 `initial()` 이 규칙과 빈 일꾼으로 채운다 — 읽을 것이 있는 화면이라 첫 발신 앞에 `stepMs` 를 둔다.
 * `ctx.metric` 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 규칙 하나 — 대상과 그 입력, 세우는 데 걸리는 시간(초). */
export type BuildTarget = {
  name: string;
  inputs: string[];
  seconds: number;
};

export type IndependentInParallelFacetData = {
  type: 'independent-in-parallel';
  targets: BuildTarget[];
  workers: number;
  stepMs: number;
};

/** 걸음 하나 — 한 시각에 끝난 것과 시작한 것. */
export type BuildMoment = {
  t: number;
  finished: string[];
  started: { name: string; worker: number }[];
};

/** 규칙을 검사한다 — 모르는 입력 · 겹친 이름 · 정수가 아닌 시간 · 일꾼 수를 던진다. */
export function checkRules(targets: readonly BuildTarget[], workers: number): void {
  if (!Number.isInteger(workers) || workers < 1) {
    throw new Error(`independent-in-parallel: 일꾼 수가 1 이상의 정수가 아니다 (${String(workers)})`);
  }
  const names = new Set<string>();
  for (const target of targets) {
    if (names.has(target.name)) {
      throw new Error(`independent-in-parallel: 대상 이름이 겹친다 (${target.name})`);
    }
    names.add(target.name);
    if (!Number.isInteger(target.seconds) || target.seconds < 1) {
      throw new Error(`independent-in-parallel: ${target.name} 의 시간이 1 이상의 정수가 아니다 (${String(target.seconds)})`);
    }
  }
  for (const target of targets) {
    for (const input of target.inputs) {
      if (!names.has(input)) {
        throw new Error(`independent-in-parallel: ${target.name} 의 입력 ${input} 은 규칙에 없다`);
      }
    }
  }
}

/**
 * 시계를 돌려 걸음을 셈한다. 규칙에 고리가 있어 아무것도 시작할 수 없으면 던진다.
 */
export function simulateBuild(targets: readonly BuildTarget[], workers: number): BuildMoment[] {
  checkRules(targets, workers);
  const byName = new Map(targets.map((target) => [target.name, target] as const));
  const done = new Set<string>();
  /** 일꾼 번호 → 일하는 대상과 끝 시각. 빈 일꾼은 null. */
  const slots: ({ name: string; end: number } | null)[] = Array.from({ length: workers }, () => null);
  const started = new Set<string>();
  const moments: BuildMoment[] = [];
  let t = 0;
  while (done.size < targets.length) {
    const finished: string[] = [];
    for (const target of targets) {
      const slot = slots.findIndex((s) => s !== null && s.name === target.name && s.end === t);
      if (slot < 0) continue;
      finished.push(target.name);
      done.add(target.name);
      slots[slot] = null;
    }
    const ready = targets.filter(
      (target) => !started.has(target.name) && target.inputs.every((input) => done.has(input)),
    );
    const starts: { name: string; worker: number }[] = [];
    for (const target of ready) {
      const worker = slots.findIndex((s) => s === null);
      if (worker < 0) break; // 빈 일꾼이 없다 — 나머지는 데이터 차례대로 다음 시각을 기다린다
      const rule = byName.get(target.name);
      if (!rule) throw new Error(`independent-in-parallel: 규칙에 없는 대상 ${target.name}`);
      slots[worker] = { name: target.name, end: t + rule.seconds };
      started.add(target.name);
      starts.push({ name: target.name, worker });
    }
    if (finished.length > 0 || starts.length > 0) {
      moments.push({ t, finished, started: starts });
    }
    if (done.size === targets.length) break;
    const ends = slots.flatMap((s) => (s === null ? [] : [s.end]));
    if (ends.length === 0) {
      const stuck = targets.filter((target) => !done.has(target.name)).map((target) => target.name);
      throw new Error(`independent-in-parallel: 시작할 수 있는 대상이 없다 — 고리가 있다 (${stuck.join(', ')})`);
    }
    t = Math.min(...ends);
  }
  return moments;
}

/** 일의 합 — 일꾼이 하나라면 걸릴 시간. */
export function totalWork(targets: readonly BuildTarget[]): number {
  return targets.reduce((sum, target) => sum + target.seconds, 0);
}

/**
 * 가장 긴 기다림의 사슬 — 입력을 따라 내려가며 시간을 더한 가장 긴 길.
 * 길이가 같은 사슬이 여럿이면 데이터 차례가 앞선 것을 고른다. 이름은 입력에서 대상 쪽 차례.
 */
export function longestChain(targets: readonly BuildTarget[]): { names: string[]; seconds: number } {
  const byName = new Map(targets.map((target) => [target.name, target] as const));
  const memo = new Map<string, { names: string[]; seconds: number }>();
  const visiting = new Set<string>();
  const walk = (name: string): { names: string[]; seconds: number } => {
    const hit = memo.get(name);
    if (hit) return hit;
    const target = byName.get(name);
    if (!target) throw new Error(`independent-in-parallel: 규칙에 없는 대상 ${name}`);
    if (visiting.has(name)) throw new Error(`independent-in-parallel: 고리가 있다 (${name})`);
    visiting.add(name);
    let best: { names: string[]; seconds: number } = { names: [], seconds: 0 };
    for (const input of target.inputs) {
      const sub = walk(input);
      if (sub.seconds > best.seconds) best = sub;
    }
    visiting.delete(name);
    const result = { names: [...best.names, name], seconds: best.seconds + target.seconds };
    memo.set(name, result);
    return result;
  };
  let top: { names: string[]; seconds: number } = { names: [], seconds: 0 };
  for (const target of targets) {
    const chain = walk(target.name);
    if (chain.seconds > top.seconds) top = chain;
  }
  return top;
}

export async function independentInParallel(
  context: FacetContext<IndependentInParallelFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<IndependentInParallelFacetData>;
  const { targets, workers, stepMs } = ctx.data;
  const moments = simulateBuild(targets, workers);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  for (const moment of moments) {
    if (!(await pause())) return;
    await ctx.emit({
      type: 'tick',
      payload: {
        t: moment.t,
        finished: [...moment.finished],
        started: moment.started.map((s) => ({ name: s.name, worker: s.worker })),
      },
    });
  }
}
