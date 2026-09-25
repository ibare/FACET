/**
 * link-state-flood 장면 — 이벤트를 잇기만 한다. 셈(누가 보내고 누가 버리는가)은 알고리즘이 한다.
 *
 * 바탕: 라우터 · 선 · 만든 이 (initial 이 initialData 에서 한 번 정한다)
 * 자취: 라우터마다 쥔 사본과 처음 받은 곳 · 버린 사본 자리
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneLsa = { origin: string; seq: number; entries: { to: string; cost: number }[] };
export type SceneSend = { from: string; to: string; fresh: boolean; copy: SceneLsa };

export type LinkStateFloodStep =
  | { kind: 'start' }
  | { kind: 'round'; round: number; sends: SceneSend[] }
  | { kind: 'done'; rounds: number; sent: number; dropped: number; same: number; total: number };

export type LinkStateFloodScene = {
  routers: string[];
  links: { a: string; b: string }[];
  origin: string;
  /** 라우터가 쥔 사본. 받은 차례대로 쌓인다. 만든 이는 from 이 null · round 0 */
  held: { router: string; from: string | null; round: number; copy: SceneLsa }[];
  /** 이미 가져 버린 사본 — 어느 선 끝에서 버려졌는가 */
  dropped: { from: string; to: string; round: number }[];
  /** 다음 라운드에 보낼 라우터 (지난 걸음에 새로 받은 이) */
  frontier: string[];
  step: LinkStateFloodStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readLsa(v: unknown, where: string): SceneLsa {
  if (!isRecord(v)) throw new Error(`link-state-flood: ${where} 알림이 객체가 아니다`);
  const { origin, seq, entries } = v;
  if (typeof origin !== 'string' || typeof seq !== 'number' || !Array.isArray(entries)) {
    throw new Error(`link-state-flood: ${where} 알림의 모양이 틀렸다`);
  }
  return {
    origin,
    seq,
    entries: entries.map((e: unknown) => {
      if (!isRecord(e) || typeof e.to !== 'string' || typeof e.cost !== 'number') {
        throw new Error(`link-state-flood: ${where} 알림의 이웃 줄 모양이 틀렸다`);
      }
      return { to: e.to, cost: e.cost };
    }),
  };
}

function readSend(v: unknown): SceneSend {
  if (!isRecord(v)) throw new Error('link-state-flood: 사본 전달이 객체가 아니다');
  const { from, to, fresh, copy } = v;
  if (typeof from !== 'string' || typeof to !== 'string' || typeof fresh !== 'boolean') {
    throw new Error('link-state-flood: 사본 전달의 모양이 틀렸다');
  }
  return { from, to, fresh, copy: readLsa(copy, `${from}→${to}`) };
}

function copyLsa(l: SceneLsa): SceneLsa {
  return { origin: l.origin, seq: l.seq, entries: l.entries.map((e) => ({ to: e.to, cost: e.cost })) };
}

export const linkStateFloodScene: ScenePlan<LinkStateFloodScene> = {
  initial(initialData: unknown): LinkStateFloodScene {
    if (!isRecord(initialData)) throw new Error('link-state-flood: initialData 가 없다');
    const { routers, links, lsa } = initialData;
    if (!Array.isArray(routers) || !routers.every((r): r is string => typeof r === 'string')) {
      throw new Error('link-state-flood: routers 는 이름 목록이어야 한다');
    }
    if (!Array.isArray(links)) throw new Error('link-state-flood: links 가 목록이 아니다');
    const pairs = links.map((l: unknown) => {
      if (!Array.isArray(l) || l.length !== 2 || typeof l[0] !== 'string' || typeof l[1] !== 'string') {
        throw new Error('link-state-flood: 선은 이름 둘이어야 한다');
      }
      return { a: l[0], b: l[1] };
    });
    const first = readLsa(lsa, 'initialData');
    return {
      routers: [...routers],
      links: pairs,
      origin: first.origin,
      held: [{ router: first.origin, from: null, round: 0, copy: first }],
      dropped: [],
      frontier: [first.origin],
      step: { kind: 'start' },
    };
  },

  reduce(scene: LinkStateFloodScene, event: FacetRuntimeEvent): LinkStateFloodScene {
    const p = event.payload;
    if (event.type === 'flood-round') {
      if (!isRecord(p) || typeof p.round !== 'number' || !Array.isArray(p.sends)) {
        throw new Error('link-state-flood: flood-round payload 모양이 틀렸다');
      }
      const round = p.round;
      const sends = p.sends.map(readSend);
      return {
        ...scene,
        held: [
          ...scene.held.map((h) => ({ ...h, copy: copyLsa(h.copy) })),
          ...sends.filter((s) => s.fresh).map((s) => ({ router: s.to, from: s.from, round, copy: copyLsa(s.copy) })),
        ],
        dropped: [
          ...scene.dropped.map((d) => ({ ...d })),
          ...sends.filter((s) => !s.fresh).map((s) => ({ from: s.from, to: s.to, round })),
        ],
        frontier: sends.filter((s) => s.fresh).map((s) => s.to),
        step: { kind: 'round', round, sends },
      };
    }
    if (event.type === 'flood-done') {
      if (
        !isRecord(p) ||
        typeof p.rounds !== 'number' ||
        typeof p.sent !== 'number' ||
        typeof p.dropped !== 'number' ||
        typeof p.same !== 'number' ||
        typeof p.total !== 'number'
      ) {
        throw new Error('link-state-flood: flood-done payload 모양이 틀렸다');
      }
      return {
        ...scene,
        frontier: [],
        step: { kind: 'done', rounds: p.rounds, sent: p.sent, dropped: p.dropped, same: p.same, total: p.total },
      };
    }
    return scene;
  },
};
