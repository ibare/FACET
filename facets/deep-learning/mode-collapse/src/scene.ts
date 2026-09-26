import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 한 라운드를 마친 뒤의 모습 — 알고리즘이 셈해 실어 보낸 값 그대로. */
export type ModeCollapseRound = {
  round: number;
  a: number;
  b: number;
  fakes: number[];
  v: number[];
  c: number;
  neg: number;
  pos: number;
  spread: number;
  dNeg: number;
  dPos: number;
};

export type ModeCollapseScene = {
  /** 바탕 — 진짜 표본과 그 쪽별 개수, 가려내는 쪽 특징의 가운데 (init 이 정한다) */
  real: number[];
  realNeg: number | null;
  realPos: number | null;
  centers: number[] | null;
  /** 지금 모습 (init 전에는 없다) */
  now: ModeCollapseRound | null;
  /** 이번 걸음 — 앞 모습(was)에서 지금 모습으로 옮겨 간다 */
  step: { kind: 'start' } | { kind: 'round'; was: ModeCollapseRound } | null;
};

function field(p: Record<string, unknown>, key: string): number {
  const x = p[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`mode-collapse 장면: ${key} 가 수가 아니다`);
  return x;
}

function list(p: Record<string, unknown>, key: string): number[] {
  const x = p[key];
  if (!Array.isArray(x)) throw new Error(`mode-collapse 장면: ${key} 가 배열이 아니다`);
  return x.map((n) => {
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`mode-collapse 장면: ${key} 에 수가 아닌 것이 있다`);
    return n;
  });
}

function record(payload: unknown): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null) throw new Error('mode-collapse 장면: payload 가 객체가 아니다');
  return payload as Record<string, unknown>;
}

function readRound(p: Record<string, unknown>): ModeCollapseRound {
  return {
    round: field(p, 'round'),
    a: field(p, 'a'),
    b: field(p, 'b'),
    fakes: list(p, 'fakes'),
    v: list(p, 'v'),
    c: field(p, 'c'),
    neg: field(p, 'neg'),
    pos: field(p, 'pos'),
    spread: field(p, 'spread'),
    dNeg: field(p, 'dNeg'),
    dPos: field(p, 'dPos'),
  };
}

export const modeCollapseScene: ScenePlan<ModeCollapseScene> = {
  initial(initialData: unknown): ModeCollapseScene {
    const d = record(initialData);
    return {
      real: list(d, 'real'),
      realNeg: null,
      realPos: null,
      centers: null,
      now: null,
      step: null,
    };
  },

  reduce(scene: ModeCollapseScene, event: FacetRuntimeEvent): ModeCollapseScene {
    if (event.type === 'init') {
      const p = record(event.payload);
      return {
        real: list(p, 'real'),
        realNeg: field(p, 'realNeg'),
        realPos: field(p, 'realPos'),
        centers: list(p, 'centers'),
        now: readRound(p),
        step: { kind: 'start' },
      };
    }
    if (event.type === 'round') {
      if (!scene.now) throw new Error('mode-collapse 장면: init 전에 round 가 왔다');
      return { ...scene, now: readRound(record(event.payload)), step: { kind: 'round', was: scene.now } };
    }
    throw new Error(`mode-collapse 장면: 모르는 이벤트 ${event.type}`);
  },
};
