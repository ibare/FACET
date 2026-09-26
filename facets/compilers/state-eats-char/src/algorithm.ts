/**
 * state-eats-char — 유한 오토마타는 글자를 받을 때마다 무엇을 하는가.
 *
 * DFA 하나가 입력의 맨 앞 글자를 먹고, 그 글자가 적힌 옮김 하나를 따라 지금 자리를
 * 다음 자리로 옮긴다. 글자 하나가 한 걸음이다. 판정(받는가)은 하지 않는다.
 *
 * 이벤트 (silent 없음):
 *   eat  { index: number; ch: string; from: string; to: string; outs: string[] }
 *        index — 먹은 글자의 자리 (0 부터)
 *        ch    — 먹은 글자
 *        from  — 먹기 전 자리, to — 옮겨 간 자리
 *        outs  — from 에서 나가는 옮김의 이름표 전부 (옮김 목록에 적힌 차례)
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (자리 = 시작, 입력 전체).
 * 정해진 옮김이 없는 글자를 만나면 던진다 (C6) — 이 데이터에서는 일어나지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MachineEdge = { from: string; ch: string; to: string };
export type AcceptMark = { state: string; kind: string };

export type StateEatsCharFacetData = {
  type: 'state-eats-char';
  stepMs: number;
  start: string;
  edges: MachineEdge[];
  accept: AcceptMark[];
  input: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function needString(v: unknown, where: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`state-eats-char: ${where} 는 비지 않은 문자열이어야 한다`);
  }
  return v;
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다 — 기본값을 지어내지 않는다. */
export function narrowStateEatsCharData(raw: unknown): StateEatsCharFacetData {
  if (!isRecord(raw)) throw new Error('state-eats-char: initialData 가 객체가 아니다');
  if (raw['type'] !== 'state-eats-char') {
    throw new Error(`state-eats-char: type 이 다르다 (${String(raw['type'])})`);
  }
  const stepMs = raw['stepMs'];
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('state-eats-char: stepMs 는 양수여야 한다');
  }
  const start = needString(raw['start'], 'start');
  const input = needString(raw['input'], 'input');
  const rawEdges = raw['edges'];
  if (!Array.isArray(rawEdges) || rawEdges.length === 0) {
    throw new Error('state-eats-char: edges 가 비었다');
  }
  const edges: MachineEdge[] = rawEdges.map((e, i) => {
    if (!isRecord(e)) throw new Error(`state-eats-char: edges[${i}] 가 객체가 아니다`);
    const ch = needString(e['ch'], `edges[${i}].ch`);
    if ([...ch].length !== 1) {
      throw new Error(`state-eats-char: edges[${i}].ch 는 글자 하나여야 한다 (${ch})`);
    }
    return {
      from: needString(e['from'], `edges[${i}].from`),
      ch,
      to: needString(e['to'], `edges[${i}].to`),
    };
  });
  // DFA — 한 자리에서 한 글자에 옮김은 하나뿐이다
  const seen = new Set<string>();
  for (const e of edges) {
    const key = `${e.from}\u0000${e.ch}`;
    if (seen.has(key)) {
      throw new Error(`state-eats-char: 자리 ${e.from} 에 글자 ${e.ch} 옮김이 둘이다`);
    }
    seen.add(key);
  }
  const rawAccept = raw['accept'];
  if (!Array.isArray(rawAccept)) throw new Error('state-eats-char: accept 가 배열이 아니다');
  const accept: AcceptMark[] = rawAccept.map((a, i) => {
    if (!isRecord(a)) throw new Error(`state-eats-char: accept[${i}] 가 객체가 아니다`);
    return {
      state: needString(a['state'], `accept[${i}].state`),
      kind: needString(a['kind'], `accept[${i}].kind`),
    };
  });
  return { type: 'state-eats-char', stepMs, start, edges, accept, input };
}

/** from 에서 나가는 옮김 — 옮김 목록에 적힌 차례. */
export function edgesOut(edges: readonly MachineEdge[], from: string): MachineEdge[] {
  return edges.filter((e) => e.from === from);
}

/** from 에서 글자 ch 가 고르는 옮김. 없으면 막힘 — 던진다 (C6). */
export function transition(edges: readonly MachineEdge[], from: string, ch: string): MachineEdge {
  const found = edges.find((e) => e.from === from && e.ch === ch);
  if (!found) {
    throw new Error(`state-eats-char: 자리 ${from} 에 글자 ${ch} 옮김이 없다 — 막힘`);
  }
  return found;
}

export async function stateEatsChar(
  context: FacetContext<StateEatsCharFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<StateEatsCharFacetData>;
  const data = narrowStateEatsCharData(ctx.data);
  const { stepMs, edges } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const letters = [...data.input];
  let at = data.start;
  // 걸음 0 은 이미 읽을 것이 있는 화면이다 — 첫 발신 앞에도 문이 선다
  for (let index = 0; index < letters.length; index += 1) {
    if (!(await pause())) return;
    const ch = letters[index];
    if (ch === undefined) throw new Error(`state-eats-char: 자리 ${index} 에 글자가 없다`);
    const outs = edgesOut(edges, at).map((e) => e.ch);
    const edge = transition(edges, at, ch);
    await ctx.emit({
      type: 'eat',
      payload: { index, ch, from: at, to: edge.to, outs },
    });
    at = edge.to;
  }
}
