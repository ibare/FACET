/**
 * aging 장면 — 이벤트를 잇기만 한다. 누가 오를지 다시 셈하지 않는다.
 *
 * 바탕: focus · ageEvery · bursts (initialData 에서) · low · high · cols (init 에서)
 * 자취: tick · queue · cpu · done
 * 이번 걸음: step — 운동의 출발값(was · wasCpu)과 사건을 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type AgingSceneEntry = { id: string; rank: number; waited: number };
export type AgingSceneCpu = { id: string; rank: number; left: number };
export type AgingSceneFinish = { id: string; start: number; waited: number };
export type AgingSceneRise = { id: string; from: number; to: number; waited: number };
export type AgingScenePick = { id: string; rank: number; tied: string[] };

export type AgingStep =
  | { kind: 'open'; count: number }
  | {
      kind: 'tick';
      /** 이 경계 앞의 틱 · 줄 · CPU — 운동의 출발값 */
      wasTick: number | null;
      was: AgingSceneEntry[];
      wasCpu: AgingSceneCpu | null;
      finished: AgingSceneFinish | null;
      arrived: string[];
      /** 에이징 뒤, 고르기 전의 줄 */
      before: AgingSceneEntry[];
      rose: AgingSceneRise[];
      pick: AgingScenePick | null;
    };

export type AgingScene = {
  focus: string;
  ageEvery: number;
  bursts: Array<{ id: string; burst: number }>;
  low: number;
  high: number;
  cols: number;
  /** null = 아직 첫 경계에 이르지 않았다 */
  tick: number | null;
  queue: AgingSceneEntry[];
  cpu: AgingSceneCpu | null;
  done: string[];
  step: AgingStep | null;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`aging 장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`aging 장면: ${what} 가 수가 아니다`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`aging 장면: ${what} 가 문자열이 아니다`);
  return v;
}
function list(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`aging 장면: ${what} 가 배열이 아니다`);
  return v;
}
function strs(v: unknown, what: string): string[] {
  return list(v, what).map((x, i) => str(x, `${what}[${i}]`));
}
function entries(v: unknown, what: string): AgingSceneEntry[] {
  return list(v, what).map((x, i) => {
    const r = rec(x, `${what}[${i}]`);
    return { id: str(r.id, `${what}[${i}].id`), rank: num(r.rank, `${what}[${i}].rank`), waited: num(r.waited, `${what}[${i}].waited`) };
  });
}
function cpuOf(v: unknown): AgingSceneCpu | null {
  if (v === null) return null;
  const r = rec(v, 'cpu');
  return { id: str(r.id, 'cpu.id'), rank: num(r.rank, 'cpu.rank'), left: num(r.left, 'cpu.left') };
}
function finishOf(v: unknown): AgingSceneFinish | null {
  if (v === null) return null;
  const r = rec(v, 'finished');
  return { id: str(r.id, 'finished.id'), start: num(r.start, 'finished.start'), waited: num(r.waited, 'finished.waited') };
}
function pickOf(v: unknown): AgingScenePick | null {
  if (v === null) return null;
  const r = rec(v, 'pick');
  return { id: str(r.id, 'pick.id'), rank: num(r.rank, 'pick.rank'), tied: strs(r.tied, 'pick.tied') };
}
function risesOf(v: unknown): AgingSceneRise[] {
  return list(v, 'rose').map((x, i) => {
    const r = rec(x, `rose[${i}]`);
    return {
      id: str(r.id, `rose[${i}].id`),
      from: num(r.from, `rose[${i}].from`),
      to: num(r.to, `rose[${i}].to`),
      waited: num(r.waited, `rose[${i}].waited`),
    };
  });
}

const copyEntries = (xs: AgingSceneEntry[]): AgingSceneEntry[] => xs.map((e) => ({ ...e }));

export const agingScene: ScenePlan<AgingScene> = {
  initial(initialData: unknown): AgingScene {
    const d = rec(initialData, 'initialData');
    const bursts = list(d.processes, 'processes').map((x, i) => {
      const r = rec(x, `processes[${i}]`);
      return { id: str(r.id, `processes[${i}].id`), burst: num(r.burst, `processes[${i}].burst`) };
    });
    return {
      focus: str(d.focus, 'focus'),
      ageEvery: num(d.ageEvery, 'ageEvery'),
      bursts,
      low: 0,
      high: 0,
      cols: 0,
      tick: null,
      queue: [],
      cpu: null,
      done: [],
      step: null,
    };
  },

  reduce(scene: AgingScene, event: FacetRuntimeEvent): AgingScene {
    if (event.type === 'init') {
      const p = rec(event.payload, 'init payload');
      const queue = entries(p.queue, 'queue');
      return {
        ...scene,
        low: num(p.low, 'low'),
        high: num(p.high, 'high'),
        cols: num(p.cols, 'cols'),
        tick: num(p.tick, 'tick'),
        queue,
        cpu: null,
        done: [],
        step: { kind: 'open', count: queue.length },
      };
    }
    if (event.type === 'tick') {
      const p = rec(event.payload, 'tick payload');
      const finished = finishOf(p.finished);
      const before = entries(p.queue, 'queue');
      const pick = pickOf(p.pick);
      const queue = pick === null ? copyEntries(before) : before.filter((e) => e.id !== pick.id).map((e) => ({ ...e }));
      return {
        ...scene,
        tick: num(p.tick, 'tick'),
        queue,
        cpu: cpuOf(p.cpu),
        done: finished === null ? [...scene.done] : [...scene.done, finished.id],
        step: {
          kind: 'tick',
          wasTick: scene.tick,
          was: copyEntries(scene.queue),
          wasCpu: scene.cpu === null ? null : { ...scene.cpu },
          finished,
          arrived: strs(p.arrived, 'arrived'),
          before,
          rose: risesOf(p.rose),
          pick,
        },
      };
    }
    return scene;
  },
};
