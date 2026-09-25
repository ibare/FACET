/**
 * beladyAnomaly 의 장면.
 *
 * 바탕 — 참조 열과 두 쪽의 프레임 수 (initialData 에서 베낀다).
 * 자취 — 쪽마다 프레임 안의 페이지 · 들어온 줄 · 누적 폴트 · 참조마다 적중/폴트 표시.
 * 이번 걸음 — 참조 하나와 두 쪽의 결과. 폴트 수의 출발값 `from` 을 싣는다.
 *
 * 교체 선택은 알고리즘이 한다. 장면은 이벤트가 말한 자리에 페이지를 놓을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type Mark = 'hit' | 'fault';

export type SideState = {
  size: number;
  frames: (number | null)[];
  /** 들어온 줄 — 앞이 가장 먼저 들어온 페이지 */
  queue: number[];
  faults: number;
  /** 참조마다의 결과. 길이는 지나온 참조 수 */
  marks: Mark[];
};

export type SideStep = {
  kind: Mark;
  frame: number;
  victim: number | null;
  /** 이 참조 앞의 누적 폴트 */
  from: number;
};

export type BeladyStep = {
  index: number;
  page: number;
  sides: SideStep[];
};

export type BeladyScene = {
  refs: number[];
  sides: SideState[];
  step: BeladyStep | null;
};

function readInitial(initialData: unknown): { refs: number[]; frameCounts: number[] } {
  if (typeof initialData !== 'object' || initialData === null) {
    throw new Error('beladyAnomalyScene: initialData 가 없다');
  }
  const refs = (initialData as { refs?: unknown }).refs;
  const counts = (initialData as { frameCounts?: unknown }).frameCounts;
  if (!Array.isArray(refs) || refs.length === 0) throw new Error('beladyAnomalyScene: refs 가 없다');
  if (!Array.isArray(counts) || counts.length !== 2) {
    throw new Error('beladyAnomalyScene: frameCounts 는 두 쪽이어야 한다');
  }
  const outRefs: number[] = [];
  for (const p of refs) {
    if (typeof p !== 'number' || !Number.isInteger(p)) throw new Error('beladyAnomalyScene: 페이지 번호가 틀렸다');
    outRefs.push(p);
  }
  const outCounts: number[] = [];
  for (const n of counts) {
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      throw new Error('beladyAnomalyScene: 프레임 수가 틀렸다');
    }
    outCounts.push(n);
  }
  return { refs: outRefs, frameCounts: outCounts };
}

function readSide(raw: unknown): { kind: Mark; frame: number; victim: number | null; faults: number } {
  if (typeof raw !== 'object' || raw === null) throw new Error('beladyAnomalyScene: ref 의 side 가 틀렸다');
  const kind = (raw as { kind?: unknown }).kind;
  const frame = (raw as { frame?: unknown }).frame;
  const victim = (raw as { victim?: unknown }).victim;
  const faults = (raw as { faults?: unknown }).faults;
  if (kind !== 'hit' && kind !== 'fault') throw new Error('beladyAnomalyScene: kind 가 틀렸다');
  if (typeof frame !== 'number' || typeof faults !== 'number') {
    throw new Error('beladyAnomalyScene: frame · faults 가 없다');
  }
  if (victim !== null && typeof victim !== 'number') throw new Error('beladyAnomalyScene: victim 이 틀렸다');
  return { kind, frame, victim, faults };
}

function applyRef(scene: BeladyScene, payload: unknown): BeladyScene {
  if (typeof payload !== 'object' || payload === null) throw new Error('beladyAnomalyScene: ref payload 가 없다');
  const index = (payload as { index?: unknown }).index;
  const page = (payload as { page?: unknown }).page;
  const rawSides = (payload as { sides?: unknown }).sides;
  if (typeof index !== 'number' || typeof page !== 'number') {
    throw new Error('beladyAnomalyScene: index · page 가 없다');
  }
  if (!Array.isArray(rawSides) || rawSides.length !== scene.sides.length) {
    throw new Error('beladyAnomalyScene: sides 의 수가 틀렸다');
  }
  const stepSides: SideStep[] = [];
  const sides = scene.sides.map((side, i) => {
    const o = readSide(rawSides[i]);
    if (o.frame < 0 || o.frame >= side.size) throw new Error(`beladyAnomalyScene: 프레임 ${o.frame} 이 없다`);
    const frames = [...side.frames];
    let queue = [...side.queue];
    if (o.kind === 'fault') {
      if (o.victim !== null) {
        if (frames[o.frame] !== o.victim) throw new Error('beladyAnomalyScene: 내보낼 페이지가 그 프레임에 없다');
        queue = queue.filter((p) => p !== o.victim);
      } else if (frames[o.frame] !== null) {
        throw new Error('beladyAnomalyScene: 빈 프레임이 아닌데 내보낸 것이 없다');
      }
      frames[o.frame] = page;
      queue.push(page);
    } else if (frames[o.frame] !== page) {
      throw new Error('beladyAnomalyScene: 적중한 프레임에 그 페이지가 없다');
    }
    stepSides.push({ kind: o.kind, frame: o.frame, victim: o.victim, from: side.faults });
    return {
      size: side.size,
      frames,
      queue,
      faults: o.faults,
      marks: [...side.marks, o.kind],
    };
  });
  return { refs: scene.refs, sides, step: { index, page, sides: stepSides } };
}

export const beladyAnomalyScene: ScenePlan<BeladyScene> = {
  initial(initialData: unknown): BeladyScene {
    const { refs, frameCounts } = readInitial(initialData);
    return {
      refs,
      sides: frameCounts.map((size) => ({
        size,
        frames: new Array<number | null>(size).fill(null),
        queue: [],
        faults: 0,
        marks: [],
      })),
      step: null,
    };
  },
  reduce(scene: BeladyScene, event: FacetRuntimeEvent): BeladyScene {
    if (event.type === 'ref') return applyRef(scene, event.payload);
    return scene;
  },
};
