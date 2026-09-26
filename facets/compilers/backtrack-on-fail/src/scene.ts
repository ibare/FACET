/**
 * backtrack-on-fail 장면 — 엔진의 걸음을 "누가 어느 글자를 쥐었나" 로 잇는다.
 *
 * 바탕: 글줄 글자 · 무늬 조각의 화면 글자 · 조각이 선택 자리인지.
 * 자취: 조각마다 지금 쥔 몫(claims) · 엔진 자리(pos) · 글자마다 도로 내놓은 몫(given) · 결과.
 * 이번 걸음: step — 지나간 것에서 출발하는 운동은 계기값(was · cursorWas · undone)으로 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { isChoice, narrowData, printPiece } from './algorithm.js';

/** 선택 자리는 글자 여럿을 쥐고(span), 글자 조각은 한 자리에 대인다(one — ok 가 거짓이면 막힌 자리). */
export type Claim =
  | { kind: 'span'; start: number; count: number }
  | { kind: 'one'; at: number; ok: boolean };

export type Undone =
  | { piece: number; kind: 'one'; at: number; ok: boolean }
  | { piece: number; kind: 'span'; start: number; count: number };

export type BacktrackStep =
  | { kind: 'start' }
  | { kind: 'eat'; piece: number; at: number; was: number }
  | { kind: 'match'; piece: number; at: number; cursorWas: number }
  | { kind: 'fail'; piece: number | null; at: number; reason: 'end' | 'char' | 'rest'; cursorWas: number }
  | { kind: 'back'; piece: number; released: number; cursorWas: number; undone: Undone[] }
  | { kind: 'done' }
  | { kind: 'nomatch' };

export type BacktrackScene = {
  /** 바탕 */
  chars: string[];
  labels: string[];
  choice: boolean[];
  /** 자취 */
  claims: (Claim | null)[];
  pos: number;
  /** 글자 자리마다, 그 글자를 쥐었다가 내놓거나 지워진 조각 번호 (차례대로) */
  given: number[][];
  result: 'match' | 'nomatch' | null;
  /** 이번 걸음 */
  step: BacktrackStep;
};

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`backtrack-on-fail 장면: ${what} 가 0 이상의 정수가 아니다 — ${JSON.stringify(v)}`);
  }
  return v;
}

function fields(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`backtrack-on-fail 장면: ${event.type} 의 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

function pieceIndex(scene: BacktrackScene, v: unknown): number {
  const i = int(v, 'piece');
  if (i >= scene.labels.length) throw new Error(`backtrack-on-fail 장면: 조각 ${i} 가 무늬에 없다`);
  return i;
}

function charIndex(scene: BacktrackScene, v: unknown, allowEnd: boolean): number {
  const at = int(v, 'at');
  if (at > scene.chars.length || (!allowEnd && at === scene.chars.length)) {
    throw new Error(`backtrack-on-fail 장면: 자리 ${at} 가 글줄 밖이다`);
  }
  return at;
}

function copyClaims(claims: (Claim | null)[]): (Claim | null)[] {
  return claims.map((c) => (c === null ? null : { ...c }));
}

export const backtrackOnFailScene: ScenePlan<BacktrackScene> = {
  initial(initialData: unknown): BacktrackScene {
    const data = narrowData(initialData);
    const chars = [...data.text];
    const items = data.pattern.items;
    return {
      chars,
      labels: items.map(printPiece),
      choice: items.map(isChoice),
      claims: items.map(() => null),
      pos: 0,
      given: chars.map(() => []),
      result: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: BacktrackScene, event: FacetRuntimeEvent): BacktrackScene {
    switch (event.type) {
      case 'eat': {
        const f = fields(event);
        const piece = pieceIndex(scene, f.piece);
        const at = charIndex(scene, f.at, false);
        if (!scene.choice[piece]) throw new Error(`backtrack-on-fail 장면: 조각 ${piece} 는 먹는 조각이 아니다`);
        const claims = copyClaims(scene.claims);
        const c = claims[piece];
        let was = 0;
        if (c === null || c === undefined) {
          claims[piece] = { kind: 'span', start: at, count: 1 };
        } else if (c.kind === 'span' && c.start + c.count === at) {
          was = c.count;
          claims[piece] = { kind: 'span', start: c.start, count: c.count + 1 };
        } else {
          throw new Error(`backtrack-on-fail 장면: 조각 ${piece} 가 자리 ${at} 를 이어 먹을 수 없다`);
        }
        return { ...scene, claims, pos: at + 1, step: { kind: 'eat', piece, at, was } };
      }
      case 'match': {
        const f = fields(event);
        const piece = pieceIndex(scene, f.piece);
        const at = charIndex(scene, f.at, false);
        const claims = copyClaims(scene.claims);
        claims[piece] = { kind: 'one', at, ok: true };
        return { ...scene, claims, pos: at + 1, step: { kind: 'match', piece, at, cursorWas: scene.pos } };
      }
      case 'fail': {
        const f = fields(event);
        const reason = f.reason;
        if (reason !== 'end' && reason !== 'char' && reason !== 'rest') {
          throw new Error(`backtrack-on-fail 장면: 모르는 막힘 ${JSON.stringify(reason)}`);
        }
        const at = charIndex(scene, f.at, true);
        const claims = copyClaims(scene.claims);
        let piece: number | null = null;
        if (reason === 'rest') {
          if (f.piece !== null) throw new Error('backtrack-on-fail 장면: 글줄이 남은 막힘에는 조각이 없다');
        } else {
          piece = pieceIndex(scene, f.piece);
          claims[piece] = { kind: 'one', at, ok: false };
        }
        return { ...scene, claims, pos: at, step: { kind: 'fail', piece, at, reason, cursorWas: scene.pos } };
      }
      case 'back': {
        const f = fields(event);
        const piece = pieceIndex(scene, f.piece);
        const released = charIndex(scene, f.released, false);
        const claims = copyClaims(scene.claims);
        const given = scene.given.map((g) => [...g]);
        const own = claims[piece];
        if (own === null || own === undefined || own.kind !== 'span' || own.count === 0 || own.start + own.count - 1 !== released) {
          throw new Error(`backtrack-on-fail 장면: 조각 ${piece} 는 자리 ${released} 의 글자를 쥐고 있지 않다`);
        }
        claims[piece] = { kind: 'span', start: own.start, count: own.count - 1 };
        const g0 = given[released];
        if (g0 === undefined) throw new Error(`backtrack-on-fail 장면: 자리 ${released} 가 없다`);
        g0.push(piece);
        // 뒤 조각들의 몫은 없던 일이 된다
        const undone: Undone[] = [];
        for (let j = piece + 1; j < claims.length; j += 1) {
          const c = claims[j];
          if (c === null || c === undefined) continue;
          if (c.kind === 'one') {
            undone.push({ piece: j, kind: 'one', at: c.at, ok: c.ok });
            if (c.ok) {
              const g = given[c.at];
              if (g === undefined) throw new Error(`backtrack-on-fail 장면: 자리 ${c.at} 가 없다`);
              g.push(j);
            }
          } else {
            undone.push({ piece: j, kind: 'span', start: c.start, count: c.count });
            for (let k = c.start; k < c.start + c.count; k += 1) {
              const g = given[k];
              if (g === undefined) throw new Error(`backtrack-on-fail 장면: 자리 ${k} 가 없다`);
              g.push(j);
            }
          }
          claims[j] = null;
        }
        return {
          ...scene,
          claims,
          given,
          pos: released,
          step: { kind: 'back', piece, released, cursorWas: scene.pos, undone },
        };
      }
      case 'done': {
        if (scene.pos !== scene.chars.length) throw new Error('backtrack-on-fail 장면: 글줄이 남았는데 끝났다고 한다');
        return { ...scene, claims: copyClaims(scene.claims), result: 'match', step: { kind: 'done' } };
      }
      case 'nomatch':
        return { ...scene, claims: copyClaims(scene.claims), result: 'nomatch', step: { kind: 'nomatch' } };
      default:
        throw new Error(`backtrack-on-fail 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
