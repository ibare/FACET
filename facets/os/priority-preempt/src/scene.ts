/**
 * priority-preempt 장면 — boundary 이벤트를 잇는다. 누가 오를지 다시 셈하지 않는다.
 *
 * 바탕: procs (식별자 · 도착 · 길이 · 순위) — initial() 이 initialData 에서 베낀다
 * 자취: 자리(올 것 · 줄 · CPU · 끝남) · 남은 양 · 밀려나 아직 돌아오지 못한 것 · 밀어낸 횟수
 * 이번 걸음: step — 그 경계의 사건과, 걸음 앞의 자리 · 남은 양 (운동의 출발값)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readPriorityPreemptProcs } from './algorithm.js';

export type PriorityPreemptPlace = 'future' | 'queue' | 'cpu' | 'done';

export interface PriorityPreemptSpot {
  place: PriorityPreemptPlace;
  slot: number;
}

export interface PriorityPreemptSceneProc {
  id: string;
  arrive: number;
  length: number;
  prio: number;
}

export interface PriorityPreemptStep {
  tick: number;
  arrive: string[];
  held: string[];
  finish: string | null;
  preempt: { out: string; by: string; left: number } | null;
  pick: string | null;
  /** 오른 것이 앞서 밀려났던 것인가 — 남은 양만 마저 돈다 */
  resumed: boolean;
  /** 돌던 것이 밀어내지 못한 상대 (held 가 있을 때 CPU 의 주인) */
  owner: string | null;
  end: boolean;
  /** 걸음 앞의 자리와 남은 양 — 운동의 출발값 */
  from: Record<string, PriorityPreemptSpot>;
  wasLeft: Record<string, number>;
}

export interface PriorityPreemptScene {
  procs: PriorityPreemptSceneProc[];
  tick: number | null;
  queue: string[];
  cpu: string | null;
  done: string[];
  left: Record<string, number>;
  /** 밀려나 아직 CPU 에 돌아오지 못한 것 */
  pushed: string[];
  pushes: number;
  step: PriorityPreemptStep | null;
}

/** 장면에서 한 프로세스의 자리를 읽는다. 장면과 그림이 같은 함수를 쓴다. */
export function priorityPreemptSpot(scene: PriorityPreemptScene, id: string): PriorityPreemptSpot {
  if (scene.cpu === id) return { place: 'cpu', slot: 0 };
  const q = scene.queue.indexOf(id);
  if (q >= 0) return { place: 'queue', slot: q };
  const d = scene.done.indexOf(id);
  if (d >= 0) return { place: 'done', slot: d };
  const f = scene.procs.findIndex((p) => p.id === id);
  if (f < 0) throw new Error(`priority-preempt 장면: 모르는 식별자 ${id}`);
  return { place: 'future', slot: f };
}

function strings(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error(`priority-preempt 장면: ${field} 가 문자열 배열이 아니다`);
  }
  return [...(v as string[])];
}

function idOrNull(v: unknown, field: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`priority-preempt 장면: ${field} 가 문자열이 아니다`);
  return v;
}

function int(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`priority-preempt 장면: ${field} 가 정수가 아니다`);
  }
  return v;
}

export const priorityPreemptScene: ScenePlan<PriorityPreemptScene> = {
  initial(initialData: unknown): PriorityPreemptScene {
    const procs = readPriorityPreemptProcs(initialData).map((p) => ({ ...p }));
    const left: Record<string, number> = {};
    for (const p of procs) left[p.id] = p.length;
    return {
      procs,
      tick: null,
      queue: [],
      cpu: null,
      done: [],
      left,
      pushed: [],
      pushes: 0,
      step: null,
    };
  },

  reduce(scene: PriorityPreemptScene, event: FacetRuntimeEvent): PriorityPreemptScene {
    if (event.type !== 'boundary') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) {
      throw new Error('priority-preempt 장면: boundary 의 payload 가 없다');
    }
    const r = p as Record<string, unknown>;
    const tick = int(r.tick, 'tick');
    const arrive = strings(r.arrive, 'arrive');
    const held = strings(r.held, 'held');
    const finish = idOrNull(r.finish, 'finish');
    const pick = idOrNull(r.pick, 'pick');
    const run = idOrNull(r.run, 'run');
    const queue = strings(r.queue, 'queue');
    if (typeof r.end !== 'boolean') throw new Error('priority-preempt 장면: end 가 참거짓이 아니다');
    const end = r.end;

    let preempt: PriorityPreemptStep['preempt'] = null;
    if (r.preempt !== null) {
      if (typeof r.preempt !== 'object' || r.preempt === undefined) {
        throw new Error('priority-preempt 장면: preempt 모양이 틀렸다');
      }
      const e = r.preempt as Record<string, unknown>;
      const out = idOrNull(e.out, 'preempt.out');
      const by = idOrNull(e.by, 'preempt.by');
      if (out === null || by === null) throw new Error('priority-preempt 장면: preempt 에 짝이 없다');
      preempt = { out, by, left: int(e.left, 'preempt.left') };
    }

    if (typeof r.left !== 'object' || r.left === null) {
      throw new Error('priority-preempt 장면: left 가 없다');
    }
    const rawLeft = r.left as Record<string, unknown>;
    const left: Record<string, number> = {};
    for (const proc of scene.procs) left[proc.id] = int(rawLeft[proc.id], `left.${proc.id}`);

    const from: Record<string, PriorityPreemptSpot> = {};
    for (const proc of scene.procs) from[proc.id] = priorityPreemptSpot(scene, proc.id);

    let pushed = scene.pushed.filter((id) => id !== pick);
    if (preempt !== null && preempt.out !== pick) pushed = [...pushed, preempt.out];

    return {
      procs: scene.procs,
      tick,
      queue,
      cpu: run,
      done: finish === null ? [...scene.done] : [...scene.done, finish],
      left,
      pushed,
      pushes: scene.pushes + (preempt === null ? 0 : 1),
      step: {
        tick,
        arrive,
        held,
        finish,
        preempt,
        pick,
        resumed: pick !== null && scene.pushed.includes(pick),
        owner: held.length > 0 ? run : null,
        end,
        from,
        wasLeft: { ...scene.left },
      },
    };
  },
};
