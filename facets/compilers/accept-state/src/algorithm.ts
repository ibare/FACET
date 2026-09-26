/**
 * accept-state — DFA 가 글줄을 다 먹은 뒤, 멈춘 자리 하나로만 판정한다.
 *
 * 시작 자리에서 입력을 왼쪽부터 한 글자씩 먹는다. 한 글자에 옮김은 하나뿐이다.
 * 도중에 받는 자리를 몇 번 밟았든 판정에는 들지 않는다 — 다 먹은 뒤 선 자리가
 * 받는 자리인가만 본다.
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (기계 · 입력 · 시작 자리).
 * 그 화면을 읽을 틈으로 첫 발신 앞에 stepMs 를 둔다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *
 * - `move`    글자 하나를 먹고 옮김 하나를 따라간다
 *   payload: { index: number; ch: string; edge: number; from: string; to: string }
 *     index  먹은 글자의 자리 (0 부터)
 *     ch     먹은 글자
 *     edge   따라간 옮김의 차례 (initialData.edges 의 번호, 0 부터)
 *     from   옮기기 전 자리 · to 옮긴 뒤 자리
 *
 * - `verdict` 글자를 다 먹은 뒤 멈춘 자리에서 판정한다
 *   payload: { state: string; accepted: boolean; passed: number }
 *     state     멈춘 자리
 *     accepted  멈춘 자리가 받는 자리인가
 *     passed    판정 전에 받는 자리에 선 걸음 수 (시작 자리는 걸음이 아니라 세지 않는다)
 *
 * 옮김이 없는 글자(막힘)나 옮김이 둘인 글자(DFA 가 아님)를 만나면 던진다 (C6).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 옮김 이름표 — 글자 하나 또는 글자 모임 `[lo-hi]` */
export type Matcher = { kind: 'lit'; ch: string } | { kind: 'class'; lo: string; hi: string };

export type DfaEdge = { from: string; to: string; on: Matcher };

export type AcceptStateFacetData = {
  type: 'accept-state';
  stepMs: number;
  /** 기계가 알아보는 무늬 — 화면에 띄우는 자료 (파싱하지 않는다) */
  pattern: string;
  states: string[];
  start: string;
  accept: string[];
  edges: DfaEdge[];
  input: string;
};

function fail(msg: string): never {
  throw new Error(`accept-state: ${msg}`);
}

function readString(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(`${where} 가 비었거나 글자가 아니다`);
  return v;
}

function readChar(v: unknown, where: string): string {
  const s = readString(v, where);
  if (s.length !== 1) fail(`${where} 는 글자 하나여야 한다 — "${s}"`);
  return s;
}

function readMatcher(v: unknown, where: string): Matcher {
  if (typeof v !== 'object' || v === null) fail(`${where} 이름표가 없다`);
  const o = v as Record<string, unknown>;
  if (o.kind === 'lit') return { kind: 'lit', ch: readChar(o.ch, `${where}.ch`) };
  if (o.kind === 'class') {
    const lo = readChar(o.lo, `${where}.lo`);
    const hi = readChar(o.hi, `${where}.hi`);
    if (lo > hi) fail(`${where} 글자 모임의 앞이 뒤보다 크다 — [${lo}-${hi}]`);
    return { kind: 'class', lo, hi };
  }
  return fail(`${where} 모르는 이름표 모양 — ${String(o.kind)}`);
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다. */
export function readAcceptStateData(raw: unknown): AcceptStateFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData 가 없다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'accept-state') fail(`type 이 accept-state 가 아니다 — ${String(o.type)}`);
  if (typeof o.stepMs !== 'number' || !(o.stepMs > 0)) fail('stepMs 가 양수가 아니다');
  if (!Array.isArray(o.states) || o.states.length === 0) fail('states 가 비었다');
  const states = o.states.map((s, i) => readString(s, `states[${i}]`));
  if (new Set(states).size !== states.length) fail('states 에 같은 이름이 둘 있다');
  const known = (s: string, where: string): string => {
    if (!states.includes(s)) fail(`${where} 의 자리 ${s} 가 states 에 없다`);
    return s;
  };
  const start = known(readString(o.start, 'start'), 'start');
  if (!Array.isArray(o.accept)) fail('accept 가 배열이 아니다');
  const accept = o.accept.map((s, i) => known(readString(s, `accept[${i}]`), `accept[${i}]`));
  if (!Array.isArray(o.edges) || o.edges.length === 0) fail('edges 가 비었다');
  const edges = o.edges.map((e, i): DfaEdge => {
    if (typeof e !== 'object' || e === null) fail(`edges[${i}] 가 없다`);
    const r = e as Record<string, unknown>;
    return {
      from: known(readString(r.from, `edges[${i}].from`), `edges[${i}].from`),
      to: known(readString(r.to, `edges[${i}].to`), `edges[${i}].to`),
      on: readMatcher(r.on, `edges[${i}].on`),
    };
  });
  return {
    type: 'accept-state',
    stepMs: o.stepMs,
    pattern: readString(o.pattern, 'pattern'),
    states,
    start,
    accept,
    edges,
    input: readString(o.input, 'input'),
  };
}

/** 이름표를 화면 글자로 — `e` · `[0-9]` */
export function matcherLabel(m: Matcher): string {
  return m.kind === 'lit' ? m.ch : `[${m.lo}-${m.hi}]`;
}

function matches(m: Matcher, ch: string): boolean {
  return m.kind === 'lit' ? m.ch === ch : ch >= m.lo && ch <= m.hi;
}

/** 자리 `from` 에서 글자 `ch` 가 따라갈 옮김의 번호. 없거나 둘이면 던진다. */
export function nextEdge(data: AcceptStateFacetData, from: string, ch: string): number {
  const hits: number[] = [];
  data.edges.forEach((e, i) => {
    if (e.from === from && matches(e.on, ch)) hits.push(i);
  });
  if (hits.length === 0) fail(`자리 ${from} 에서 글자 "${ch}" 의 옮김이 없다 (막힘)`);
  if (hits.length > 1) fail(`자리 ${from} 에서 글자 "${ch}" 의 옮김이 ${hits.length} — DFA 가 아니다`);
  return hits[0] as number;
}

export function isAccepting(data: AcceptStateFacetData, state: string): boolean {
  return data.accept.includes(state);
}

export async function acceptState(ctx: FacetContext<AcceptStateFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<AcceptStateFacetData>;
  const data = readAcceptStateData(rctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let state = data.start;
  let passed = 0;
  for (let index = 0; index < data.input.length; index += 1) {
    // 첫 바퀴의 문은 걸음 0 (기계 · 입력) 을 읽을 틈이다
    if (!(await pause())) return;
    const ch = data.input.charAt(index);
    const edge = nextEdge(data, state, ch);
    const to = (data.edges[edge] as DfaEdge).to;
    await rctx.emit({ type: 'move', payload: { index, ch, edge, from: state, to } });
    if (isAccepting(data, to)) passed += 1;
    state = to;
  }

  if (!(await pause())) return;
  await rctx.emit({
    type: 'verdict',
    payload: { state, accepted: isAccepting(data, state), passed },
  });
}
