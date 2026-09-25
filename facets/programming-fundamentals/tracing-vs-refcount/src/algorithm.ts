/**
 * 수거 두 방식 — 추적 수거와 참조 계수를 같은 가리킴 그래프 두 벌에 나란히 돌린다.
 *
 * 한 판: 손잡이 둘(`drop` 놓는 뿌리 · `cycle` 고리)의 지금 값으로 한 번 돌고 입력을 기다린다.
 * 계수 쪽이 먼저(놓는 순간 곧바로 일어나는 것이 참조 계수의 성질이다), 그다음 추적 쪽(표시 → 훑음).
 * 셈은 `irs.ts` 의 `countRefFreed` · `countTraced` 와 한 줄 한 줄 같다 — 평탄 인접 목록 `adj[i*n+j]`,
 * 작업 스택은 맨 위에서 꺼내고, 표시는 처음 붙을 때만 이웃을 **큰 번호부터** 쌓아 작은 번호가 먼저 나온다.
 *
 * 놓는 뿌리 — `drop` 값의 r 번째 자리 수(2 진)가 1 이면 뿌리 r 을 놓는다 (0 없음 · 1 x · 2 y · 3 x 와 y).
 * 놓는 차례는 뿌리 번호 차례. 동률 규칙은 없다 — 차례가 갈리는 자리는 스택의 꺼내는 차례뿐이고 위에 적었다.
 *
 * 이벤트 (걸음마다 하나, 뒤에 걸음 경계):
 *   round-start   { cycle: 0|1, counts: number[], roots: string[] } #0 시작. counts 는 객체 차례의 시작 수, roots 는 뿌리 이름
 *   root-dropped  { root: string, object: string, count: number }   뿌리 하나를 놓았다. count 는 그 객체의 새 수
 *   rc-freed      { object: string, lowered: { object: string, count: number }[] }
 *                                                                   계수가 치웠다. lowered 는 j 차례로 내린 수
 *   marked        { object: string, root: string, via: string | null }
 *                                                                   처음 표시. via 는 표시를 옮겨 준 객체(뿌리에서 곧장이면 null)
 *   swept         { object: string, freed: boolean, leftover: boolean }
 *                                                                   훑음. leftover 는 계수 쪽에 아직 남아 있는가
 *   phase         { phase }  silent: true — 코드 패널 줄 맞춤
 *
 * phase 어휘 (irs.ts 와 같다): drop · rc-free · mark · sweep-keep · sweep-free
 *
 * 계기 (판이 시작할 때 0 으로 되돌린다 — 지금 값을 들고 차이만 보낸다):
 *   tracing-freed   훑음에서 빼낼 때 +1
 *   refcount-freed  계수 치움 걸음마다 +1
 *   garbage-left    훑음이 빼낸 객체가 계수 쪽에 아직 있을 때 +1
 *
 * 입력: { type: 'drop' | 'cycle', payload: { value: number } } — 값은 사다리 안이어야 한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TracingVsRefcountData = {
  type: 'tracing-vs-refcount';
  stepMs: number;
  /** 힙에 놓인 차례 = 훑는 차례 = IR 의 번호 */
  objects: string[];
  /** 뿌리(스택의 이름) — 이 차례로 번호 0 · 1 … */
  roots: { name: string; to: string }[];
  edges: [string, string][];
  /** 고리 손잡이가 1 일 때만 더한다 */
  cycleEdges: [string, string][];
  dropLadder: number[];
  cycleLadder: number[];
  /** 첫 판의 손잡이 값 — facet.ts 의 segments default 와 같다 */
  drop: number;
  cycle: number;
};

/** IR 에 건넬 평탄 목록. 알고리즘도 이 모양으로 IR 과 같은 셈을 한다. */
export type GcInputs = { adj: number[]; n: number; roots: number[]; kept: number[] };

export function tracingVsRefcountInputs(data: TracingVsRefcountData, drop: number, cycle: number): GcInputs {
  if (!data.dropLadder.includes(drop)) throw new Error(`tracingVsRefcount: 놓는 이름 값 ${drop} 이 사다리 [${data.dropLadder.join(', ')}] 밖이다`);
  if (!data.cycleLadder.includes(cycle)) throw new Error(`tracingVsRefcount: 고리 값 ${cycle} 이 사다리 [${data.cycleLadder.join(', ')}] 밖이다`);
  const n = data.objects.length;
  const ix = (name: string, where: string): number => {
    const i = data.objects.indexOf(name);
    if (i < 0) throw new Error(`tracingVsRefcount: ${where} 의 객체 이름 '${name}' 을 objects 에서 찾지 못했다`);
    return i;
  };
  const adj = new Array<number>(n * n).fill(0);
  const all = cycle === 1 ? [...data.edges, ...data.cycleEdges] : data.edges;
  for (const [a, b] of all) adj[ix(a, 'edges') * n + ix(b, 'edges')] = 1;
  const roots = data.roots.map((r) => ix(r.to, `roots.${r.name}`));
  const kept = data.roots.map((_, r) => (Math.floor(drop / 2 ** r) % 2 === 1 ? 0 : 1));
  return { adj, n, roots, kept };
}

type Input = { type: string; payload?: { value?: unknown } };

export async function tracingVsRefcountAlgorithm(ctx: FacetContext<TracingVsRefcountData>): Promise<void> {
  const rc = ctx as ReactiveContext<TracingVsRefcountData>;
  const data = ctx.data;
  const names = data.objects;

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다 (처음 한 번은 차이 0 이어도 보낸다)
  const shown: Record<string, number> = {};
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown[name] ?? 0));
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const step = () => rc.sleep(data.stepMs);

  /** 한 판. 끝까지 돌았으면 true, 취소됐으면 false. 마지막 걸음 뒤에는 잠들지 않는다 — 입력 대기가 경계다. */
  const playRound = async (drop: number, cycle: number): Promise<boolean> => {
    const { adj, n, roots, kept } = tracingVsRefcountInputs(data, drop, cycle);
    const rootName = (r: number): string => data.roots[r]!.name;

    // 참조 계수 — 뿌리 가리킴 + 들어오는 화살
    const counts = new Array<number>(n).fill(0);
    for (let r = 0; r < roots.length; r += 1) counts[roots[r]!] += 1;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) if (adj[i * n + j] === 1) counts[j] += 1;
    }
    const aliveRc = new Array<boolean>(n).fill(true);
    let refFreed = 0;
    let traceFreed = 0;
    let garbage = 0;
    setMetric('tracing-freed', 0);
    setMetric('refcount-freed', 0);
    setMetric('garbage-left', 0);

    await ctx.emit({ type: 'round-start', payload: { cycle, counts: [...counts], roots: data.roots.map((r) => r.name) } });
    if (!(await step())) return false;

    // ── 계수 쪽: 놓는 뿌리마다, 0 이 되면 작업 스택으로 연쇄
    const work = new Array<number>(n).fill(0);
    let top = 0;
    for (let r = 0; r < roots.length; r += 1) {
      if (ctx.cancelled) return false;
      if (kept[r] !== 0) continue;
      const o = roots[r]!;
      counts[o] -= 1;
      await phase('drop');
      await ctx.emit({ type: 'root-dropped', payload: { root: rootName(r), object: names[o], count: counts[o] } });
      if (!(await step())) return false;
      if (counts[o] === 0) {
        work[top] = o;
        top += 1;
      }
      while (top > 0) {
        if (ctx.cancelled) return false;
        top -= 1;
        const f = work[top]!;
        if (!aliveRc[f]) throw new Error(`tracingVsRefcount: 이미 치운 객체 '${names[f]}' 를 다시 치우려 한다`);
        aliveRc[f] = false;
        refFreed += 1;
        const lowered: { object: string; count: number }[] = [];
        for (let j = 0; j < n; j += 1) {
          if (adj[f * n + j] === 1) {
            counts[j] -= 1;
            lowered.push({ object: names[j]!, count: counts[j]! });
            if (counts[j] === 0) {
              if (top >= n) throw new Error('tracingVsRefcount: 작업 스택이 객체 수를 넘었다');
              work[top] = j;
              top += 1;
            }
          }
        }
        setMetric('refcount-freed', refFreed);
        await phase('rc-free');
        await ctx.emit({ type: 'rc-freed', payload: { object: names[f], lowered } });
        if (!(await step())) return false;
      }
    }

    // ── 추적 쪽: 남은 뿌리에서 깊이 우선으로 표시
    const marks = new Array<number>(n).fill(0);
    const pendingCap = n * n + roots.length;
    for (let r = 0; r < roots.length; r += 1) {
      if (ctx.cancelled) return false;
      if (kept[r] !== 1) continue;
      const pending: number[] = [roots[r]!];
      const via: (number | null)[] = [null];
      while (pending.length > 0) {
        if (ctx.cancelled) return false;
        const o = pending.pop()!;
        const from = via.pop()!;
        if (marks[o] !== 0) continue;
        marks[o] = 1;
        for (let k = 0; k < n; k += 1) {
          const j = n - 1 - k;
          if (adj[o * n + j] === 1 && marks[j] === 0) {
            if (pending.length >= pendingCap) throw new Error('tracingVsRefcount: 표시 대기열이 상한을 넘었다');
            pending.push(j);
            via.push(o);
          }
        }
        await phase('mark');
        await ctx.emit({ type: 'marked', payload: { object: names[o], root: rootName(r), via: from === null ? null : names[from] } });
        if (!(await step())) return false;
      }
    }

    // ── 훑음: 놓인 차례로, 표시 없는 것을 빼낸다
    for (let i = 0; i < n; i += 1) {
      if (ctx.cancelled) return false;
      if (marks[i] === 1) {
        await phase('sweep-keep');
        await ctx.emit({ type: 'swept', payload: { object: names[i], freed: false, leftover: false } });
      } else {
        traceFreed += 1;
        const leftover = aliveRc[i] === true;
        if (leftover) garbage += 1;
        setMetric('tracing-freed', traceFreed);
        setMetric('garbage-left', garbage);
        await phase('sweep-free');
        await ctx.emit({ type: 'swept', payload: { object: names[i], freed: true, leftover } });
      }
      if (i < n - 1 && !(await step())) return false;
    }
    return true;
  };

  let drop = data.drop;
  let cycle = data.cycle;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(drop, cycle))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput<Input>();
        if (ctx.cancelled) return;
        if (input.type !== 'drop' && input.type !== 'cycle') continue;
        const value = input.payload?.value;
        if (typeof value !== 'number') throw new Error(`tracingVsRefcount: '${input.type}' 입력의 value 가 수가 아니다`);
        if (input.type === 'drop') {
          if (!data.dropLadder.includes(value)) throw new Error(`tracingVsRefcount: 놓는 이름 값 ${value} 이 사다리 밖이다`);
          drop = value;
        } else {
          if (!data.cycleLadder.includes(value)) throw new Error(`tracingVsRefcount: 고리 값 ${value} 이 사다리 밖이다`);
          cycle = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
