/**
 * backtrack-on-fail — 욕심껏 고른 길이 막히면 엔진은 먹었던 글자를 하나 내놓고 되감긴다.
 *
 * 무늬는 구조로 받는다 — 맨 위는 이어 쓰기(`seq`), 그 조각은 글자(`lit`) · 글자 모임(`class`) ·
 * 되풀이(`star` `*` · `plus` `+`) · 있거나 없음(`opt` `?`). 되풀이의 속은 글자나 글자 모임 하나다.
 * 이 조각이 다루지 않는 모양(갈래 · 겹친 되풀이 · 모르는 종류)은 던진다 (C6).
 *
 * 엔진 규약: 되풀이는 욕심 — 먹을 수 있는 만큼 먼저 먹는다. 막히면 가장 최근의 선택 자리로 돌아가
 * 쥔 것에서 마지막 글자 하나를 내놓고, 그 자리부터 뒤 조각들을 다시 맞춘다. 무늬는 글줄 전체에 맞아야 한다.
 *
 * 발신 이벤트 (모두 silent 아님 — 하나가 한 걸음. 걸음 0 은 장면의 initial 이 initialData 에서 세운다):
 *   eat      { piece: number, at: number }              되풀이 조각 piece 가 자리 at 의 글자를 먹었다
 *   match    { piece: number, at: number }              조각 piece 가 자리 at 의 글자에 맞았다
 *   fail     { piece: number | null, at: number, reason: 'end' | 'char' | 'rest' }
 *                                                        조각 piece 를 자리 at 에 대었으나 막혔다.
 *                                                        end = 글줄이 끝났다 · char = 글자가 다르다 ·
 *                                                        rest = 무늬를 다 대었는데 글줄이 남았다 (그때 piece 는 null)
 *   back     { piece: number, released: number }        되풀이 조각 piece 로 되돌아가 자리 released 의 글자를 내놓았다.
 *                                                        엔진은 released 로 되감기고, piece 뒤 조각들의 몫은 지워진다
 *   done     {}                                         무늬를 다 대었고 글줄도 끝났다 — 맞음
 *   nomatch  {}                                         내놓을 것이 남은 선택 자리가 없다 — 안 맞음
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 글자 모임의 한 범위 — `['0', '9']` 는 `0-9`. */
export type CharRange = readonly [string, string];

export type AtomNode =
  | { kind: 'lit'; ch: string }
  | { kind: 'class'; ranges: readonly CharRange[] };

export type PieceNode =
  | AtomNode
  | { kind: 'star'; of: AtomNode }
  | { kind: 'plus'; of: AtomNode }
  | { kind: 'opt'; of: AtomNode };

export type PatternNode = { kind: 'seq'; items: readonly PieceNode[] };

export type BacktrackOnFailFacetData = {
  type: 'backtrack-on-fail';
  pattern: PatternNode;
  text: string;
  stepMs: number;
};

/** 엔진이 한 걸음에 한 일. 알고리즘은 이것을 차례대로 발신한다. */
export type Move =
  | { kind: 'eat'; piece: number; at: number }
  | { kind: 'match'; piece: number; at: number }
  | { kind: 'fail'; piece: number | null; at: number; reason: 'end' | 'char' | 'rest' }
  | { kind: 'back'; piece: number; released: number }
  | { kind: 'done' }
  | { kind: 'nomatch' };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function oneChar(v: unknown, where: string): string {
  if (typeof v !== 'string' || [...v].length !== 1) {
    throw new Error(`backtrack-on-fail: ${where} 는 글자 하나여야 한다 — ${JSON.stringify(v)}`);
  }
  return v;
}

function narrowAtom(v: unknown, where: string): AtomNode {
  if (!isObj(v)) throw new Error(`backtrack-on-fail: ${where} 가 객체가 아니다`);
  if (v.kind === 'lit') return { kind: 'lit', ch: oneChar(v.ch, `${where}.ch`) };
  if (v.kind === 'class') {
    if (!Array.isArray(v.ranges) || v.ranges.length === 0) {
      throw new Error(`backtrack-on-fail: ${where}.ranges 가 비었다`);
    }
    const ranges = v.ranges.map((r: unknown, k: number): CharRange => {
      if (!Array.isArray(r) || r.length !== 2) {
        throw new Error(`backtrack-on-fail: ${where}.ranges[${k}] 는 [처음, 끝] 이어야 한다`);
      }
      const lo = oneChar(r[0], `${where}.ranges[${k}][0]`);
      const hi = oneChar(r[1], `${where}.ranges[${k}][1]`);
      if (lo > hi) throw new Error(`backtrack-on-fail: ${where}.ranges[${k}] 의 처음이 끝보다 크다`);
      return [lo, hi];
    });
    return { kind: 'class', ranges };
  }
  throw new Error(`backtrack-on-fail: ${where} 의 모르는 모양 ${JSON.stringify(v.kind)} — 글자 · 글자 모임만 된다`);
}

function narrowPiece(v: unknown, where: string): PieceNode {
  if (!isObj(v)) throw new Error(`backtrack-on-fail: ${where} 가 객체가 아니다`);
  if (v.kind === 'star' || v.kind === 'plus' || v.kind === 'opt') {
    return { kind: v.kind, of: narrowAtom(v.of, `${where}.of`) };
  }
  return narrowAtom(v, where);
}

/** initialData 의 무늬 구조를 좁힌다. 모르는 모양은 던진다. */
export function narrowPattern(v: unknown): PatternNode {
  if (!isObj(v) || v.kind !== 'seq' || !Array.isArray(v.items)) {
    throw new Error('backtrack-on-fail: 무늬의 맨 위는 이어 쓰기(seq)여야 한다');
  }
  if (v.items.length === 0) throw new Error('backtrack-on-fail: 무늬 조각이 없다');
  return { kind: 'seq', items: v.items.map((it: unknown, k: number) => narrowPiece(it, `items[${k}]`)) };
}

/** initialData 전체를 좁힌다. */
export function narrowData(v: unknown): BacktrackOnFailFacetData {
  if (!isObj(v) || v.type !== 'backtrack-on-fail') {
    throw new Error('backtrack-on-fail: initialData.type 이 맞지 않다');
  }
  if (typeof v.text !== 'string') throw new Error('backtrack-on-fail: initialData.text 가 글줄이 아니다');
  if (typeof v.stepMs !== 'number' || !(v.stepMs > 0)) {
    throw new Error('backtrack-on-fail: initialData.stepMs 가 양수가 아니다');
  }
  return { type: 'backtrack-on-fail', pattern: narrowPattern(v.pattern), text: v.text, stepMs: v.stepMs };
}

function printAtom(a: AtomNode): string {
  if (a.kind === 'lit') return a.ch;
  return `[${a.ranges.map(([lo, hi]) => (lo === hi ? lo : `${lo}-${hi}`)).join('')}]`;
}

/** 무늬 조각 하나의 화면 글자 — `[0-9]*` · `0`. */
export function printPiece(p: PieceNode): string {
  if (p.kind === 'star') return `${printAtom(p.of)}*`;
  if (p.kind === 'plus') return `${printAtom(p.of)}+`;
  if (p.kind === 'opt') return `${printAtom(p.of)}?`;
  return printAtom(p);
}

/** 조각이 선택 자리(되풀이 · 있거나 없음)인가. */
export function isChoice(p: PieceNode): boolean {
  return p.kind === 'star' || p.kind === 'plus' || p.kind === 'opt';
}

function atomMatches(a: AtomNode, ch: string): boolean {
  if (a.kind === 'lit') return a.ch === ch;
  return a.ranges.some(([lo, hi]) => lo <= ch && ch <= hi);
}

/**
 * 역추적 엔진을 끝까지 돌려 걸음을 차례대로 돌려준다.
 * 걸음표는 무늬와 글줄에서 셈한다 — 손으로 적지 않는다.
 */
export function traceBacktrack(pattern: PatternNode, text: string): Move[] {
  const chars = [...text];
  const items = pattern.items;
  const moves: Move[] = [];
  const choices: { piece: number; start: number; count: number; min: number }[] = [];
  const LIMIT = 10_000;
  let i = 0;
  let p = 0;

  // 막혔을 때 — 가장 최근의 선택 자리에서 하나를 내놓는다. 없으면 안 맞음.
  const backtrack = (): boolean => {
    while (choices.length > 0) {
      const top = choices[choices.length - 1];
      if (top === undefined) throw new Error('backtrack-on-fail: 선택 자리 더미가 비었다');
      if (top.count > top.min) {
        top.count -= 1;
        p = top.start + top.count;
        i = top.piece + 1;
        moves.push({ kind: 'back', piece: top.piece, released: p });
        return true;
      }
      choices.pop();
    }
    moves.push({ kind: 'nomatch' });
    return false;
  };

  for (;;) {
    if (moves.length > LIMIT) throw new Error('backtrack-on-fail: 걸음이 너무 많다');
    if (i === items.length) {
      if (p === chars.length) {
        moves.push({ kind: 'done' });
        return moves;
      }
      moves.push({ kind: 'fail', piece: null, at: p, reason: 'rest' });
      if (!backtrack()) return moves;
      continue;
    }
    const node = items[i];
    if (node === undefined) throw new Error(`backtrack-on-fail: 조각 ${i} 가 없다`);
    if (node.kind === 'star' || node.kind === 'plus' || node.kind === 'opt') {
      const max = node.kind === 'opt' ? 1 : Infinity;
      const min = node.kind === 'plus' ? 1 : 0;
      const start = p;
      let count = 0;
      for (;;) {
        if (count >= max || p >= chars.length) break;
        const ch = chars[p];
        if (ch === undefined) throw new Error(`backtrack-on-fail: 자리 ${p} 에 글자가 없다`);
        if (!atomMatches(node.of, ch)) break;
        moves.push({ kind: 'eat', piece: i, at: p });
        count += 1;
        p += 1;
      }
      if (count < min) {
        moves.push({ kind: 'fail', piece: i, at: p, reason: p >= chars.length ? 'end' : 'char' });
        if (!backtrack()) return moves;
        continue;
      }
      choices.push({ piece: i, start, count, min });
      i += 1;
      continue;
    }
    if (p >= chars.length) {
      moves.push({ kind: 'fail', piece: i, at: p, reason: 'end' });
      if (!backtrack()) return moves;
      continue;
    }
    const ch = chars[p];
    if (ch === undefined) throw new Error(`backtrack-on-fail: 자리 ${p} 에 글자가 없다`);
    if (!atomMatches(node, ch)) {
      moves.push({ kind: 'fail', piece: i, at: p, reason: 'char' });
      if (!backtrack()) return moves;
      continue;
    }
    moves.push({ kind: 'match', piece: i, at: p });
    p += 1;
    i += 1;
  }
}

export async function backtrackOnFail(ctx: FacetContext<BacktrackOnFailFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BacktrackOnFailFacetData>;
  const data = narrowData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 은 무늬와 글줄이 이미 보이는 화면이다 — 첫 발신 앞에도 읽을 틈을 둔다.
  for (const m of traceBacktrack(data.pattern, data.text)) {
    if (!(await pause())) return;
    switch (m.kind) {
      case 'eat':
        await rctx.emit({ type: 'eat', payload: { piece: m.piece, at: m.at } });
        break;
      case 'match':
        await rctx.emit({ type: 'match', payload: { piece: m.piece, at: m.at } });
        break;
      case 'fail':
        await rctx.emit({ type: 'fail', payload: { piece: m.piece, at: m.at, reason: m.reason } });
        break;
      case 'back':
        await rctx.emit({ type: 'back', payload: { piece: m.piece, released: m.released } });
        break;
      case 'done':
        await rctx.emit({ type: 'done', payload: {} });
        break;
      case 'nomatch':
        await rctx.emit({ type: 'nomatch', payload: {} });
        break;
    }
  }
}
