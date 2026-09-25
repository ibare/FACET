import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 계단의 칸 하나 — 어느 라우터가 어느 수를 적었고, 그 수가 누구의 칸 위에 얹혔는가.
 * `on` 은 받친 칸의 자취 번호, -1 이면 망이 받친다(바로 붙음).
 * `broken` 은 받치던 선이 끊겨 길을 잃은 칸이다.
 */
export type CountBlock = {
  router: string;
  d: number;
  on: number;
  broken: boolean;
};

export type CountMove = { from: string; to: string; told: number; sum: number; set: number; block: number };

export type CountStep =
  | { kind: 'idle' }
  | { kind: 'cut'; a: string; b: string; lost: string[] }
  | { kind: 'round'; round: number; moves: CountMove[] };

export type CountToInfinityScene = {
  /** 바탕 */
  net: string;
  routers: string[];
  links: Array<[string, string]>;
  infinity: number;
  /** 자취 */
  trail: CountBlock[];
  cut: [string, string] | null;
  round: number;
  notices: number;
  ended: boolean;
  /** infinity 에 닿은 라우터 — 알고리즘이 셈해 싣는다 */
  reached: string[];
  /** 이번 걸음 */
  step: CountStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`count-to-infinity scene: ${what} 가 글자가 아니다`);
  return v;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`count-to-infinity scene: ${what} 가 수가 아니다`);
  }
  return v;
}

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`count-to-infinity scene: ${what} 가 목록이 아니다`);
  return v.map((x, i) => str(x, `${what}[${i}]`));
}

function pair(v: unknown, what: string): [string, string] {
  const l = strList(v, what);
  if (l.length !== 2) throw new Error(`count-to-infinity scene: ${what} 는 둘이어야 한다`);
  return [l[0] as string, l[1] as string];
}

/** 그 라우터가 지금 쥔 칸 — 마지막 칸이 끊겼으면 없다. */
export function currentBlock(trail: readonly CountBlock[], router: string, upto = trail.length): number {
  for (let i = Math.min(upto, trail.length) - 1; i >= 0; i -= 1) {
    const b = trail[i] as CountBlock;
    if (b.router === router) return b.broken ? -1 : i;
  }
  return -1;
}

function initialScene(initialData: unknown): CountToInfinityScene {
  const d = isRecord(initialData) ? initialData : {};
  const linksRaw = Array.isArray(d.links) ? d.links : [];
  return {
    net: typeof d.net === 'string' ? d.net : '',
    routers: Array.isArray(d.routers) ? strList(d.routers, 'routers') : [],
    links: linksRaw.map((l, i) => pair(l, `links[${i}]`)),
    infinity: typeof d.infinity === 'number' ? d.infinity : 16,
    trail: [],
    cut: null,
    round: 0,
    notices: 0,
    ended: false,
    reached: [],
    step: { kind: 'idle' },
  };
}

function reduceInit(scene: CountToInfinityScene, payload: Record<string, unknown>): CountToInfinityScene {
  if (!Array.isArray(payload.table)) throw new Error('count-to-infinity scene: init.table 이 없다');
  const trail: CountBlock[] = [];
  for (const [i, row] of payload.table.entries()) {
    if (!isRecord(row)) throw new Error(`count-to-infinity scene: init.table[${i}] 모양`);
    const router = str(row.router, 'router');
    const dist = num(row.d, 'd');
    let on = -1;
    if (row.via !== null) {
      const via = str(row.via, 'via');
      on = currentBlock(trail, via);
      if (on < 0) throw new Error(`count-to-infinity scene: ${router} 를 받칠 ${via} 의 칸이 아직 없다`);
    }
    trail.push({ router, d: dist, on, broken: false });
  }
  return { ...scene, trail, step: { kind: 'idle' } };
}

function reduceCut(scene: CountToInfinityScene, payload: Record<string, unknown>): CountToInfinityScene {
  const a = str(payload.a, 'a');
  const b = str(payload.b, 'b');
  const lost = strList(payload.lost, 'lost');
  const trail = scene.trail.map((blk) => ({ ...blk }));
  for (const router of lost) {
    const i = currentBlock(trail, router);
    if (i < 0) throw new Error(`count-to-infinity scene: 잃을 칸이 없다 ${router}`);
    (trail[i] as CountBlock).broken = true;
  }
  return { ...scene, trail, cut: [a, b], step: { kind: 'cut', a, b, lost } };
}

function reduceRound(scene: CountToInfinityScene, payload: Record<string, unknown>): CountToInfinityScene {
  const round = num(payload.round, 'round');
  if (!Array.isArray(payload.moves)) throw new Error('count-to-infinity scene: round.moves 가 없다');
  const trail = scene.trail.map((blk) => ({ ...blk }));
  const moves: CountMove[] = [];
  for (const [i, m] of payload.moves.entries()) {
    if (!isRecord(m)) throw new Error(`count-to-infinity scene: moves[${i}] 모양`);
    const from = str(m.from, 'from');
    const to = str(m.to, 'to');
    const on = currentBlock(trail, from);
    if (on < 0) throw new Error(`count-to-infinity scene: ${from} 에게 받칠 칸이 없다`);
    const set = num(m.set, 'set');
    trail.push({ router: to, d: set, on, broken: false });
    moves.push({ from, to, told: num(m.told, 'told'), sum: num(m.sum, 'sum'), set, block: trail.length - 1 });
  }
  return {
    ...scene,
    trail,
    round,
    notices: scene.notices + moves.length,
    ended: payload.ended === true,
    reached: payload.reached === undefined ? [] : strList(payload.reached, 'reached'),
    step: { kind: 'round', round, moves },
  };
}

export const countToInfinityScene: ScenePlan<CountToInfinityScene> = {
  initial: initialScene,
  reduce(scene: CountToInfinityScene, event: FacetRuntimeEvent): CountToInfinityScene {
    const payload = isRecord(event.payload) ? event.payload : {};
    switch (event.type) {
      case 'init':
        return reduceInit(scene, payload);
      case 'cut':
        return reduceCut(scene, payload);
      case 'round':
        return reduceRound(scene, payload);
      default:
        return scene;
    }
  },
};
