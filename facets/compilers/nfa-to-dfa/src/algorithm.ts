/**
 * nfa-to-dfa — 부분집합 구성. NFA 의 자리들이 한 덩이로 뭉쳐 DFA 의 새 자리가 된다.
 *
 * 글자를 먹지 않는다. 할 일 목록을 번호 차례(D0 · D1 · …)로 꺼내고, 한 덩이 안에서는
 * 글자 차례(`alphabet`)대로 (덩이, 글자) 하나를 한 걸음으로 셈한다.
 *
 * 이벤트:
 *   - `open`  (silent 아님) — D0 = ε-닫힘({start}) 이 선다. 걸음 #1.
 *       payload: { d: number; seed: number[]; added: number[]; set: number[]; edges: number[];
 *                  kinds: string[]; accept: string | null; todo: number[] }
 *       seed = 닫힘을 셈하기 전 자리, added = ε 로만 새로 붙은 자리, set = 닫힘 전체 (작은 수부터),
 *       edges = 닫힘이 탄 NFA 옮김의 번호 (`nfa.edges` 의 자리), todo = 이 걸음 뒤 할 일 목록 (번호 차례)
 *   - `move`  (silent 아님) — (덩이, 글자) 하나. 걸음 #2 부터.
 *       payload: { from: number; source: number[]; ch: string; moved: number[]; added: number[]; set: number[];
 *                  edges: number[]; to: number; fresh: boolean; kinds: string[]; accept: string | null;
 *                  todo: number[] }
 *       source = 출발 덩이가 품은 NFA 자리, moved = 그 자리들에서 그 글자로 가는 곳 모두, set = 그 ε-닫힘,
 *       edges = 탄 NFA 옮김의 번호 (글자 옮김 + 닫힘의 ε 옮김), todo = 이 걸음 뒤 할 일 목록 (번호 차례),
 *       fresh = 새 번호로 섰는가 (거짓이면 `to` 는 자리 모임이 같은 이미 선 덩이)
 *       kinds = set 이 품은 받는 자리의 토큰 종류, accept = 규칙 열에서 앞선 것 (없으면 null)
 *
 * 빈 모임(옮길 곳 없음)은 이 조각의 그림이 그리지 않는다 — 만나면 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** ε 옮김은 `on: null`. */
export type NfaEdge = { from: number; to: number; on: string | null };
export type NfaAccept = { state: number; kind: string };
export type Nfa = {
  states: number[];
  start: number;
  /** 글자 차례 — 한 덩이 안에서 이 차례로 옮김을 셈한다 */
  alphabet: string[];
  edges: NfaEdge[];
  accepts: NfaAccept[];
};
/** 규칙 열. 차례가 곧 우선순위다. `pattern` 은 화면에 띄우는 무늬 글자 (번역하지 않는 자료) */
export type NfaRule = { kind: string; pattern: string };

export type NfaToDfaFacetData = {
  type: 'nfa-to-dfa';
  stepMs: number;
  nfa: Nfa;
  rules: NfaRule[];
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function needNumber(x: unknown, where: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`nfa-to-dfa: ${where} 가 수가 아니다`);
  return x;
}

function needString(x: unknown, where: string): string {
  if (typeof x !== 'string' || x === '') throw new Error(`nfa-to-dfa: ${where} 가 빈 글자이거나 글자가 아니다`);
  return x;
}

function needArray(x: unknown, where: string): unknown[] {
  if (!Array.isArray(x)) throw new Error(`nfa-to-dfa: ${where} 가 배열이 아니다`);
  return x;
}

/** 자료를 좁히고 값을 베낀다. 장면도 이것을 부른다. */
export function narrowNfaToDfaData(raw: unknown): NfaToDfaFacetData {
  if (!isRecord(raw)) throw new Error('nfa-to-dfa: initialData 가 객체가 아니다');
  if (raw.type !== 'nfa-to-dfa') throw new Error(`nfa-to-dfa: type 이 다르다 (${String(raw.type)})`);
  const stepMs = needNumber(raw.stepMs, 'stepMs');
  if (!isRecord(raw.nfa)) throw new Error('nfa-to-dfa: nfa 가 없다');
  const n = raw.nfa;
  const states = needArray(n.states, 'nfa.states').map((s, i) => needNumber(s, `nfa.states[${i}]`));
  const known = new Set(states);
  if (known.size !== states.length) throw new Error('nfa-to-dfa: nfa.states 에 겹친 자리가 있다');
  const own = (s: number, where: string): number => {
    if (!known.has(s)) throw new Error(`nfa-to-dfa: ${where} 의 자리 ${s} 가 nfa.states 에 없다`);
    return s;
  };
  const start = own(needNumber(n.start, 'nfa.start'), 'nfa.start');
  const alphabet = needArray(n.alphabet, 'nfa.alphabet').map((c, i) => needString(c, `nfa.alphabet[${i}]`));
  if (alphabet.length === 0) throw new Error('nfa-to-dfa: nfa.alphabet 이 비었다');
  const edges = needArray(n.edges, 'nfa.edges').map((e, i): NfaEdge => {
    if (!isRecord(e)) throw new Error(`nfa-to-dfa: nfa.edges[${i}] 가 객체가 아니다`);
    const on = e.on === null ? null : needString(e.on, `nfa.edges[${i}].on`);
    if (on !== null && !alphabet.includes(on)) {
      throw new Error(`nfa-to-dfa: nfa.edges[${i}] 의 글자 ${on} 가 alphabet 에 없다`);
    }
    return {
      from: own(needNumber(e.from, `nfa.edges[${i}].from`), `nfa.edges[${i}]`),
      to: own(needNumber(e.to, `nfa.edges[${i}].to`), `nfa.edges[${i}]`),
      on,
    };
  });
  const rules = needArray(raw.rules, 'rules').map((r, i): NfaRule => {
    if (!isRecord(r)) throw new Error(`nfa-to-dfa: rules[${i}] 가 객체가 아니다`);
    return { kind: needString(r.kind, `rules[${i}].kind`), pattern: needString(r.pattern, `rules[${i}].pattern`) };
  });
  const accepts = needArray(n.accepts, 'nfa.accepts').map((a, i): NfaAccept => {
    if (!isRecord(a)) throw new Error(`nfa-to-dfa: nfa.accepts[${i}] 가 객체가 아니다`);
    const kind = needString(a.kind, `nfa.accepts[${i}].kind`);
    if (!rules.some((r) => r.kind === kind)) throw new Error(`nfa-to-dfa: 받는 종류 ${kind} 가 rules 에 없다`);
    return { state: own(needNumber(a.state, `nfa.accepts[${i}].state`), `nfa.accepts[${i}]`), kind };
  });
  return { type: 'nfa-to-dfa', stepMs, nfa: { states, start, alphabet, edges, accepts }, rules };
}

function sortedUnique(xs: Iterable<number>): number[] {
  return [...new Set(xs)].sort((a, b) => a - b);
}

/** ε 옮김만 따라 닿는 자리 모두 (자기 포함, 작은 수부터) 와 그때 탄 ε 옮김의 번호 */
export function epsilonClosure(nfa: Nfa, seed: readonly number[]): { set: number[]; edges: number[] } {
  const out = new Set(seed);
  const taken: number[] = [];
  const stack = [...seed];
  while (stack.length > 0) {
    const x = stack.pop();
    if (x === undefined) break;
    nfa.edges.forEach((e, i) => {
      if (e.from === x && e.on === null && !out.has(e.to)) {
        out.add(e.to);
        taken.push(i);
        stack.push(e.to);
      }
    });
  }
  return { set: sortedUnique(out), edges: taken.sort((a, b) => a - b) };
}

/** 덩이 안 자리들에서 글자 `ch` 로 가는 곳 모두와 탄 옮김의 번호 */
export function moveOn(nfa: Nfa, set: readonly number[], ch: string): { set: number[]; edges: number[] } {
  const from = new Set(set);
  const edges: number[] = [];
  const to: number[] = [];
  nfa.edges.forEach((e, i) => {
    if (from.has(e.from) && e.on === ch) {
      edges.push(i);
      to.push(e.to);
    }
  });
  return { set: sortedUnique(to), edges };
}

/** 덩이가 품은 받는 종류(규칙 열 차례)와, 그중 앞선 것 */
export function acceptOf(data: NfaToDfaFacetData, set: readonly number[]): { kinds: string[]; accept: string | null } {
  const inSet = new Set(data.nfa.accepts.filter((a) => set.includes(a.state)).map((a) => a.kind));
  const kinds = data.rules.map((r) => r.kind).filter((k) => inSet.has(k));
  return { kinds, accept: kinds[0] ?? null };
}

/** `{2, 5}` — 작은 수부터, 쉼표 뒤 빈칸 하나 */
export function formatSet(set: readonly number[]): string {
  return `{${set.join(', ')}}`;
}

export function dName(d: number): string {
  return `D${d}`;
}

function sameSet(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** 할 일 목록 — 덩이 `k` 의 글자 `done` 개까지 본 뒤, 아직 글자를 다 보지 않은 덩이 (번호 차례) */
function todoAfter(count: number, k: number, done: number, letters: number): number[] {
  const out: number[] = [];
  for (let j = 0; j < count; j += 1) {
    if (j > k || (j === k && done < letters)) out.push(j);
  }
  return out;
}

export async function nfaToDfa(ctx0: FacetContext<NfaToDfaFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<NfaToDfaFacetData>;
  const data = narrowNfaToDfaData(ctx.data);
  const { nfa, stepMs } = data;
  const letters = nfa.alphabet.length;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 (NFA 만) 을 읽을 틈
  if (!(await pause())) return;

  const seed = [nfa.start];
  const d0 = epsilonClosure(nfa, seed);
  const dstates: number[][] = [d0.set];
  await ctx.emit({
    type: 'open',
    payload: {
      d: 0,
      seed,
      added: d0.set.filter((s) => !seed.includes(s)),
      set: d0.set,
      edges: d0.edges,
      ...acceptOf(data, d0.set),
      todo: todoAfter(dstates.length, 0, 0, letters),
    },
  });

  for (let k = 0; k < dstates.length; k += 1) {
    if (ctx.cancelled) return;
    const here = dstates[k];
    if (here === undefined) throw new Error(`nfa-to-dfa: 덩이 D${k} 가 없다`);
    for (let li = 0; li < letters; li += 1) {
      if (!(await pause())) return;
      const ch = nfa.alphabet[li];
      if (ch === undefined) throw new Error(`nfa-to-dfa: 글자 ${li} 가 없다`);
      const moved = moveOn(nfa, here, ch);
      if (moved.set.length === 0) {
        throw new Error(`nfa-to-dfa: D${k} 에서 글자 ${ch} 로 갈 곳이 없다 — 이 조각은 빈 모임을 그리지 않는다`);
      }
      const closed = epsilonClosure(nfa, moved.set);
      const set = closed.set;
      const found = dstates.findIndex((d) => sameSet(d, set));
      const fresh = found < 0;
      const to = fresh ? dstates.length : found;
      if (fresh) dstates.push(set);
      await ctx.emit({
        type: 'move',
        payload: {
          from: k,
          source: [...here],
          ch,
          moved: moved.set,
          added: set.filter((s) => !moved.set.includes(s)),
          set,
          edges: [...moved.edges, ...closed.edges].sort((a, b) => a - b),
          to,
          fresh,
          ...acceptOf(data, set),
          todo: todoAfter(dstates.length, k, li + 1, letters),
        },
      });
    }
  }
}
