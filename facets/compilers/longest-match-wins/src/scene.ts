/**
 * longest-match-wins 의 장면.
 *
 * - 바탕: 원문 한 줄 (initial 이 initialData 에서 베낀다)
 * - 자취: 지금까지 집은 토큰들 (자리 · 길이 · 종류)
 * - 이번 자리: 겨루는 후보들과, 집음 걸음이면 이긴 규칙 번호와 까닭
 * - 이번 걸음(step): 무엇이 일어났는가 — 그림이 무엇을 흐르게 할지 고른다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LaneCand = { rule: number; name: string; len: number };
export type ClaimedToken = { pos: number; len: number; kind: string };
export type PickWhy = 'only' | 'longer' | 'tie';

export type LongestMatchWinsScene = {
  source: string;
  tokens: ClaimedToken[];
  /** 지금 겨루는 자리 (없으면 null) */
  pos: number | null;
  cands: LaneCand[];
  /** 이긴 규칙의 번호 — 집음 걸음에서만 */
  winner: number | null;
  why: PickWhy | null;
  step: 'start' | 'candidates' | 'pick';
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`장면: ${what} 이 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`장면: ${what} 이 글자가 아니다`);
  return v;
}

function readCands(v: unknown): LaneCand[] {
  if (!Array.isArray(v)) throw new Error('장면: cands 가 배열이 아니다');
  return v.map((c: unknown) => {
    if (!isRecord(c)) throw new Error('장면: 후보가 객체가 아니다');
    return { rule: num(c.rule, 'rule'), name: str(c.name, 'name'), len: num(c.len, 'len') };
  });
}

function readWhy(v: unknown): PickWhy {
  if (v === 'only' || v === 'longer' || v === 'tie') return v;
  throw new Error(`장면: 알 수 없는 까닭 ${String(v)}`);
}

export const longestMatchWinsScene: ScenePlan<LongestMatchWinsScene> = {
  initial(initialData: unknown): LongestMatchWinsScene {
    if (!isRecord(initialData) || typeof initialData.source !== 'string' || initialData.source.length === 0) {
      throw new Error('장면: initialData.source 가 없다 — 원문 한 줄이 있어야 한다');
    }
    const source = initialData.source;
    return { source, tokens: [], pos: null, cands: [], winner: null, why: null, step: 'start' };
  },

  reduce(scene: LongestMatchWinsScene, event: FacetRuntimeEvent): LongestMatchWinsScene {
    const p = event.payload;
    if (event.type === 'candidates') {
      if (!isRecord(p)) throw new Error('장면: candidates 의 payload 가 객체가 아니다');
      return {
        ...scene,
        pos: num(p.pos, 'pos'),
        cands: readCands(p.cands),
        winner: null,
        why: null,
        step: 'candidates',
      };
    }
    if (event.type === 'pick') {
      if (!isRecord(p)) throw new Error('장면: pick 의 payload 가 객체가 아니다');
      const pos = num(p.pos, 'pos');
      const len = num(p.len, 'len');
      const winner = num(p.rule, 'rule');
      if (scene.pos !== pos) throw new Error(`장면: 자리 ${pos} 의 집음 앞에 그 자리의 후보가 없다`);
      if (!scene.cands.some((c) => c.rule === winner)) {
        throw new Error(`장면: 이긴 규칙 ${winner} 이 자리 ${pos} 의 후보에 없다`);
      }
      return {
        ...scene,
        tokens: [...scene.tokens, { pos, len, kind: str(p.kind, 'kind') }],
        pos,
        cands: scene.cands.map((c) => ({ ...c })),
        winner,
        why: readWhy(p.why),
        step: 'pick',
      };
    }
    throw new Error(`장면: 알 수 없는 이벤트 ${event.type}`);
  },
};
