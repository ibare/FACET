/**
 * evict-oldest 장면.
 *
 * 바탕 — 프레임 수 (initialData 에서 베낀다)
 * 자취 — 들어온 차례의 카드들 · 내보낸 페이지 기록 · 폴트/적중 수
 * 이번 걸음 — 적중 하나, 또는 올림(내보냄이 있었을 수 있다)
 *
 * 교체 선택은 알고리즘이 한다. 장면은 이벤트가 말한 내보냄과 차례를 받아 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type EvictOldestCard = {
  page: number;
  frame: number;
  /** 들어온 참조 차례 */
  inAt: number;
  /** 마지막으로 쓰인 참조 차례 */
  usedAt: number;
};

export type EvictOldestOut = EvictOldestCard & { outAt: number };

export type EvictOldestStep =
  | { kind: 'hit'; t: number; page: number; pos: number }
  | { kind: 'load'; t: number; page: number; frame: number; victim: EvictOldestOut | null; again: EvictOldestOut | null };

export type EvictOldestScene = {
  nFrames: number;
  /** 들어온 차례 — 맨 처음이 앞 */
  cards: EvictOldestCard[];
  /** 내보낸 차례대로 */
  out: EvictOldestOut[];
  faults: number;
  hits: number;
  step: EvictOldestStep | null;
};

function readFrames(data: unknown): number {
  if (typeof data !== 'object' || data === null) throw new Error('evictOldestScene: initialData 가 없다');
  const frames = (data as Record<string, unknown>).frames;
  if (typeof frames !== 'number' || !Number.isInteger(frames) || frames < 1) {
    throw new Error('evictOldestScene: frames 는 1 이상의 정수여야 한다');
  }
  return frames;
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`evictOldestScene: ${name} 가 정수가 아니다`);
  return v;
}

function numList(v: unknown): number[] {
  if (!Array.isArray(v)) throw new Error('evictOldestScene: order 가 배열이 아니다');
  return v.map((x, i) => num(x, `order[${i}]`));
}

function reduceRef(scene: EvictOldestScene, payload: unknown): EvictOldestScene {
  if (typeof payload !== 'object' || payload === null) throw new Error('evictOldestScene: ref 에 payload 가 없다');
  const p = payload as Record<string, unknown>;
  const t = num(p.t, 't');
  const page = num(p.page, 'page');
  const frame = num(p.frame, 'frame');
  const order = numList(p.order);
  const result = p.result;

  if (result === 'hit') {
    const pos = scene.cards.findIndex((c) => c.page === page);
    if (pos < 0) throw new Error(`evictOldestScene: 적중인데 페이지 ${page} 가 차례에 없다`);
    const cards = scene.cards.map((c, i) => (i === pos ? { ...c, usedAt: t } : { ...c }));
    return { ...scene, cards, out: scene.out.map((o) => ({ ...o })), hits: scene.hits + 1, step: { kind: 'hit', t, page, pos } };
  }
  if (result !== 'fault') throw new Error(`evictOldestScene: 모르는 결과 — ${String(result)}`);

  let victim: EvictOldestOut | null = null;
  if (p.victim !== null) {
    const v = num(p.victim, 'victim');
    const card = scene.cards.find((c) => c.page === v);
    if (card === undefined) throw new Error(`evictOldestScene: 내보낸 페이지 ${v} 가 차례에 없다`);
    victim = { ...card, outAt: t };
  }
  const fresh: EvictOldestCard = { page, frame, inAt: t, usedAt: t };
  const cards = order.map((pg) => {
    if (pg === page) return fresh;
    const c = scene.cards.find((x) => x.page === pg);
    if (c === undefined) throw new Error(`evictOldestScene: 차례의 페이지 ${pg} 를 모른다`);
    return { ...c };
  });
  let again: EvictOldestOut | null = null;
  for (const o of scene.out) if (o.page === page) again = { ...o };
  const out = scene.out.map((o) => ({ ...o }));
  if (victim !== null) out.push(victim);
  return {
    ...scene,
    cards,
    out,
    faults: scene.faults + 1,
    step: { kind: 'load', t, page, frame, victim: victim === null ? null : { ...victim }, again },
  };
}

export const evictOldestScene: ScenePlan<EvictOldestScene> = {
  initial(initialData: unknown): EvictOldestScene {
    return { nFrames: readFrames(initialData), cards: [], out: [], faults: 0, hits: 0, step: null };
  },
  reduce(scene: EvictOldestScene, event: FacetRuntimeEvent): EvictOldestScene {
    if (event.type === 'ref') return reduceRef(scene, event.payload);
    return scene;
  },
};
