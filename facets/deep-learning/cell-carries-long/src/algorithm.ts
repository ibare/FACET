/**
 * cell-carries-long — LSTM 의 셀 c 가 여러 걸음을 가로질러 실려 가는 길.
 *
 * 입력 여섯을 차례로 먹이며 걸음마다 문 넷(f · i · g · o)을 셈하고
 * c_t = f·c_{t-1} + i·g · h_t = o·tanh(c_t) 로 셀과 은닉 상태를 넘긴다.
 * 셈은 끝까지 배정도 실수로 하고 표시값을 다음 셈에 넣지 않는다.
 *
 * 이벤트 (전부 silent 아님 — 하나가 걸음 하나다):
 *   'carry'  걸음 k 하나를 마쳤다.
 *     payload {
 *       k: number        걸음 번호 (1 부터)
 *       x: number        이 걸음의 입력
 *       f: number        잊는 문 σ(w_x·x + b)
 *       i: number        들이는 문 σ(w_x·x + b)
 *       g: number        후보 tanh(w_x·x + b)
 *       o: number        내보내는 문 σ(w_x·x + b)
 *       cPrev: number    앞 걸음의 c
 *       kept: number     남긴 몫 f·cPrev
 *       added: number    들인 몫 i·g
 *       c: number        새 c = kept + added
 *       h: number        새 h = o·tanh(c)
 *       last: null | {   마지막 걸음에만 싣는 맺음
 *         c1: number       걸음 1 의 c
 *         cN: number       마지막 걸음의 c
 *         ratio: number    남은 비 cN ÷ c1
 *         fProd: number    걸음 2..N 의 f 를 곱한 것
 *         hMax: number     h 의 가장 큰 값
 *         hMin: number     h 의 가장 작은 값
 *       }
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (입력 차례 · c0 · h0).
 * 바탕이 이미 읽을 것이 있는 화면이라 첫 발신 앞에 stepMs 만큼 머문다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 문 하나의 식 — 이 조각의 문은 x 만 본다. */
export type GateSpec = {
  /** 기호 (번역하지 않는 자료) */
  id: string;
  /** 거치는 함수 */
  fn: 'sigmoid' | 'tanh';
  wx: number;
  b: number;
};

export type CellCarriesLongFacetData = {
  type: 'cell-carries-long';
  stepMs: number;
  /** 화면에 서는 기호 — 번역하지 않는 자료 (squash 는 h 로 내보낼 때 c 를 누르는 함수 이름) */
  names: { input: string; cell: string; hidden: string; squash: string };
  xs: number[];
  c0: number;
  h0: number;
  /** f · i · g · o 넷. 순서는 자유, id 로 찾는다 */
  gates: GateSpec[];
};

/** 역할마다 한 문. 모자라거나 모르는 id 가 있으면 던진다. */
export type GateSet = { f: GateSpec; i: GateSpec; g: GateSpec; o: GateSpec };

const GATE_ROLES = ['f', 'i', 'g', 'o'] as const;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function narrowGate(raw: unknown, at: number): GateSpec {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`cell-carries-long: gates[${at}] 가 객체가 아니다`);
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id === '') {
    throw new Error(`cell-carries-long: gates[${at}].id 가 비었다`);
  }
  if (r.fn !== 'sigmoid' && r.fn !== 'tanh') {
    throw new Error(`cell-carries-long: gates[${at}].fn 을 모른다 — ${String(r.fn)}`);
  }
  if (!isFiniteNumber(r.wx) || !isFiniteNumber(r.b)) {
    throw new Error(`cell-carries-long: gates[${at}] 의 w_x · b 가 수가 아니다`);
  }
  return { id: r.id, fn: r.fn, wx: r.wx, b: r.b };
}

/** initialData 를 좁힌다. 모양이 어긋나면 던진다 (C6). */
export function narrowCellCarriesLongData(raw: unknown): CellCarriesLongFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('cell-carries-long: initialData 가 없다');
  }
  const r = raw as Record<string, unknown>;
  if (r.type !== 'cell-carries-long') {
    throw new Error(`cell-carries-long: initialData.type 이 다르다 — ${String(r.type)}`);
  }
  if (!isFiniteNumber(r.stepMs) || r.stepMs <= 0) {
    throw new Error('cell-carries-long: stepMs 가 양수가 아니다');
  }
  const n = r.names;
  if (typeof n !== 'object' || n === null) {
    throw new Error('cell-carries-long: names 가 없다');
  }
  const nm = n as Record<string, unknown>;
  if (
    typeof nm.input !== 'string' ||
    typeof nm.cell !== 'string' ||
    typeof nm.hidden !== 'string' ||
    typeof nm.squash !== 'string'
  ) {
    throw new Error('cell-carries-long: names 의 input · cell · hidden · squash 가 글자가 아니다');
  }
  if (!Array.isArray(r.xs) || r.xs.length === 0 || !r.xs.every(isFiniteNumber)) {
    throw new Error('cell-carries-long: xs 가 수의 배열이 아니다');
  }
  if (!isFiniteNumber(r.c0) || !isFiniteNumber(r.h0)) {
    throw new Error('cell-carries-long: c0 · h0 가 수가 아니다');
  }
  if (!Array.isArray(r.gates)) {
    throw new Error('cell-carries-long: gates 가 배열이 아니다');
  }
  const gates = r.gates.map((g, at) => narrowGate(g, at));
  gateSet(gates);
  return {
    type: 'cell-carries-long',
    stepMs: r.stepMs,
    names: { input: nm.input, cell: nm.cell, hidden: nm.hidden, squash: nm.squash },
    xs: [...r.xs],
    c0: r.c0,
    h0: r.h0,
    gates,
  };
}

/** 문 넷을 역할로 묶는다. 모르는 id · 겹친 id · 빠진 역할은 던진다. */
export function gateSet(gates: readonly GateSpec[]): GateSet {
  const found = new Map<string, GateSpec>();
  for (const g of gates) {
    if (!(GATE_ROLES as readonly string[]).includes(g.id)) {
      throw new Error(`cell-carries-long: 모르는 문 식별자 — ${g.id}`);
    }
    if (found.has(g.id)) throw new Error(`cell-carries-long: 문 ${g.id} 가 둘이다`);
    found.set(g.id, g);
  }
  const pick = (id: (typeof GATE_ROLES)[number]): GateSpec => {
    const g = found.get(id);
    if (g === undefined) throw new Error(`cell-carries-long: 문 ${id} 가 없다`);
    // 문(f · i · o)은 σ 를 지나 0 과 1 사이가 되고, 후보 g 는 tanh 를 지난다
    const want = id === 'g' ? 'tanh' : 'sigmoid';
    if (g.fn !== want) {
      throw new Error(`cell-carries-long: ${id} 는 ${want} 를 지나야 하는데 ${g.fn} 로 적혔다`);
    }
    return g;
  };
  return { f: pick('f'), i: pick('i'), g: pick('g'), o: pick('o') };
}

function sigma(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function openGate(spec: GateSpec, x: number): number {
  const z = spec.wx * x + spec.b;
  return spec.fn === 'sigmoid' ? sigma(z) : Math.tanh(z);
}

export async function cellCarriesLong(ctx: FacetContext<CellCarriesLongFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<CellCarriesLongFacetData>;
  const data = narrowCellCarriesLongData(rctx.data);
  const gates = gateSet(data.gates);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let c = data.c0;
  const cs: number[] = [];
  const hs: number[] = [];
  const fs: number[] = [];

  for (const [at, x] of data.xs.entries()) {
    // 걸음 0 이 읽을 것이 있는 화면이라 첫 발신 앞에도 머문다
    if (!(await pause())) return;
    const f = openGate(gates.f, x);
    const i = openGate(gates.i, x);
    const g = openGate(gates.g, x);
    const o = openGate(gates.o, x);
    const cPrev = c;
    const kept = f * cPrev;
    const added = i * g;
    c = kept + added;
    const h = o * Math.tanh(c);
    cs.push(c);
    hs.push(h);
    fs.push(f);

    const isLast = at === data.xs.length - 1;
    let last: null | {
      c1: number;
      cN: number;
      ratio: number;
      fProd: number;
      hMax: number;
      hMin: number;
    } = null;
    if (isLast) {
      const c1 = cs[0];
      if (c1 === undefined || c1 === 0) throw new Error('cell-carries-long: 걸음 1 의 c 가 0 이라 남은 비를 셀 수 없다');
      const fProd = fs.slice(1).reduce((acc, v) => acc * v, 1);
      last = {
        c1,
        cN: c,
        ratio: c / c1,
        fProd,
        hMax: Math.max(...hs),
        hMin: Math.min(...hs),
      };
    }

    await rctx.emit({
      type: 'carry',
      payload: { k: at + 1, x, f, i, g, o, cPrev, kept, added, c, h, last },
    });
  }
}
