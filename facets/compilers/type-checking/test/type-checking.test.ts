// @vitest-environment happy-dom
/**
 * type-checking 고유의 검수 — IR ↔ algorithm 전 조합 · 사양 표 · 회차별 계기 · 사다리 · 섞기.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  buildTables,
  checkProgram,
  countCells,
  flattenProgram,
  lineText,
  typeCheckingAlgorithm,
  typeCheckingData,
  typeCheckingFacet,
  typeCheckingImperativeIR,
  typeCheckingProjector,
  typeCheckingStageView,
  type TcArrays,
  type TypeCheckingData,
} from '../src/index.js';

const data = typeCheckingData;
const RULES = data.ruleLadder;

// 사양 실측표 (sim.py type-checking)
const SPEC = {
  errors: [3, 2, 1],
  untyped: [2, 0, 0],
  marks: ['0013322', '0000102', '0000002'],
  nameTypes: [
    'qty:int rate:float cost:? over:?',
    'qty:int rate:float cost:float over:bool',
    'qty:int rate:float cost:float over:bool',
  ],
  opCells: [9, 23, 43],
  fitCells: [4, 5, 6],
  phases: [
    'bind bind op-miss bind unknown bind unknown decl-take decl-miss decl-miss verdict',
    'bind bind rise bind rise bind op-miss decl-take decl-fit decl-miss verdict',
    'bind bind rise bind rise bind rise decl-fit decl-fit decl-miss verdict',
  ],
  // 걸음 0..11 의 (type-errors, untyped-names)
  meters: [
    '0,0 0,0 0,0 1,0 1,1 1,1 1,2 1,2 1,2 2,2 3,2 3,2',
    '0,0 0,0 0,0 0,0 0,0 0,0 0,0 1,0 1,0 1,0 2,0 2,0',
    '0,0 0,0 0,0 0,0 0,0 0,0 0,0 0,0 0,0 0,0 1,0 1,0',
  ],
};

const typeName = (ty: number): string => (ty < 0 ? '?' : data.types[ty]!);

function runChecker(A: TcArrays, rule: number, nNames: number) {
  const def = data.rules[rule]!;
  const { opRule, fits } = buildTables(def, data.types, data.ops);
  const nameType = new Array<number>(nNames).fill(-1);
  const lineMark = new Array<number>(A.root.length).fill(0);
  const counts = [0, 0];
  const ret = runIR(typeCheckingImperativeIR, 'checkProgram', [
    A.root, A.declName, A.want, A.kind, A.arg, A.left, A.right, opRule, fits, nameType, lineMark, counts,
  ]);
  return { ret, nameType, lineMark };
}

/** 결정적 섞기 — 선형 합동 생성기 (seed · 1103515245 · 12345 · 2^31) */
function permutation(n: number, seed: number): number[] {
  const p = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  return p;
}

function shuffled(A: TcArrays, P: number[], Q: number[]): TcArrays {
  const n = A.kind.length;
  const B: TcArrays = {
    kind: new Array(n).fill(0),
    arg: new Array(n).fill(0),
    left: new Array(n).fill(-1),
    right: new Array(n).fill(-1),
    root: A.root.map((r) => P[r]!),
    declName: A.declName.map((d) => Q[d]!),
    want: [...A.want],
  };
  for (let old = 0; old < n; old += 1) {
    const nw = P[old]!;
    B.kind[nw] = A.kind[old]!;
    B.arg[nw] = A.kind[old] === 1 ? Q[A.arg[old]!]! : A.arg[old]!;
    B.left[nw] = A.left[old]! >= 0 ? P[A.left[old]!]! : -1;
    B.right[nw] = A.right[old]! >= 0 ? P[A.right[old]!]! : -1;
  }
  return B;
}

type Played = { events: FacetRuntimeEvent[]; meters: string[][]; phases: string[][] };

/** 가짜 reactive 문맥 — 회차마다 걸음을 모으고, 입력 줄을 다 쓰면 끝낸다 */
async function play(d: TypeCheckingData, inputs: number[]): Promise<Played> {
  const metric = new Map<string, number>();
  const events: FacetRuntimeEvent[] = [];
  const meters: string[][] = [];
  const phases: string[][] = [];
  let cancelled = false;
  let pendingPhase: string | null = null;
  const queue = [...inputs];
  const snap = () => `${metric.get('type-errors') ?? 'x'},${metric.get('untyped-names') ?? 'x'}`;
  const ctx = {
    data: d,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') pendingPhase = (e.payload as { phase: string }).phase;
      if (e.type === 'round') {
        meters.push([]);
        phases.push([]);
      }
    },
    metric(name: string, delta: number | 'inc') {
      metric.set(name, (metric.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      meters.at(-1)!.push(snap());
      if (pendingPhase !== null) phases.at(-1)!.push(pendingPhase);
      pendingPhase = null;
      return true;
    },
    async waitForInput() {
      // 판정 걸음의 경계
      meters.at(-1)!.push(snap());
      if (pendingPhase !== null) phases.at(-1)!.push(pendingPhase);
      pendingPhase = null;
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        return { type: 'noop' };
      }
      return { type: 'rule', payload: { value: v } };
    },
    pollInput: () => null,
  };
  await typeCheckingAlgorithm(ctx as never);
  return { events, meters, phases };
}

describe('type-checking — 데이터 · 표', () => {
  it('줄 글자는 구조에서 찍은 것과 한 글자도 다르지 않다', () => {
    for (const ln of data.lines) expect(lineText(ln)).toBe(ln.text);
  });

  it('색인 배열이 사양의 대조와 같다', () => {
    const A = flattenProgram(data);
    expect(A.kind).toEqual([0, 0, 2, 1, 1, 2, 1, 0, 2, 1, 1, 1, 1]);
    expect(A.arg).toEqual([0, 1, 2, 0, 1, 3, 2, 0, 0, 0, 3, 0, 1]);
    expect(A.left).toEqual([-1, -1, 3, -1, -1, 6, -1, -1, 9, -1, -1, -1, -1]);
    expect(A.right).toEqual([-1, -1, 4, -1, -1, 7, -1, -1, 10, -1, -1, -1, -1]);
    expect(A.root).toEqual([0, 1, 2, 5, 8, 11, 12]);
    expect(A.declName).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(A.want).toEqual([-1, -1, -1, -1, 0, 1, 0]);
  });

  it('규칙 있는 칸 · 들어가는 칸 (IR 이 곱하는 4 = 타입 수)', () => {
    expect(data.types).toHaveLength(4);
    expect(data.ops).toHaveLength(4);
    for (const r of RULES) {
      const tb = buildTables(data.rules[r]!, data.types, data.ops);
      expect(tb.opRule).toHaveLength(64);
      expect(tb.fits).toHaveLength(16);
      expect(countCells(tb)).toEqual({ opCells: SPEC.opCells[r], fitCells: SPEC.fitCells[r] });
    }
  });

  it('사다리 = segments[].value, 기본값 = 처음 규칙', () => {
    const controls = (typeCheckingFacet.blocks.controls as { controls: unknown[] }).controls;
    const slider = controls.find(
      (c): c is { segments: { value: number; default?: boolean }[] } =>
        typeof c === 'object' && c !== null && (c as { widget?: string }).widget === 'segmented-slider',
    );
    expect(slider).toBeDefined();
    expect(slider!.segments.map((s) => s.value)).toEqual(data.ruleLadder);
    expect(data.ruleLadder).toEqual([0, 1, 2]);
    expect(slider!.segments.find((s) => s.default)!.value).toBe(data.rule);
  });
});

describe('type-checking — 알고리즘 ↔ 사양 ↔ IR', () => {
  it.each(RULES)('규칙 %i — 걸린 자리 · 줄 표지 · 이름 타입이 사양 표와 같다', (r) => {
    const c = checkProgram(data, r);
    expect(c.errors).toBe(SPEC.errors[r]);
    expect(c.untyped).toBe(SPEC.untyped[r]);
    expect(c.lines.map((l) => l.mark).join('')).toBe(SPEC.marks[r]);
    const free = data.lines
      .map((ln, i) => (ln.stmt.type === undefined ? `${ln.stmt.name}:${typeName(c.nameTypes[i]!)}` : null))
      .filter((x) => x !== null)
      .join(' ');
    expect(free).toBe(SPEC.nameTypes[r]);
  });

  it.each(RULES)('규칙 %i — runIR 의 답 · lineMark · nameType 이 알고리즘과 같다', (r) => {
    const c = checkProgram(data, r);
    const A = flattenProgram(data);
    const got = runChecker(A, r, data.lines.length);
    expect(got.ret).toBe(c.errors);
    expect(got.lineMark).toEqual(c.lines.map((l) => l.mark));
    expect(got.nameType).toEqual(c.nameTypes);
  });

  it('마디 번호와 이름 번호를 섞어도 IR 의 답이 같다 (스무 번)', () => {
    const A = flattenProgram(data);
    for (let s = 1; s <= 20; s += 1) {
      const P = permutation(A.kind.length, s * 7919);
      const Q = permutation(data.lines.length, s * 104729);
      const B = shuffled(A, P, Q);
      for (const r of RULES) {
        const c = checkProgram(data, r);
        const got = runChecker(B, r, data.lines.length);
        expect(got.ret).toBe(c.errors);
        expect(got.lineMark).toEqual(c.lines.map((l) => l.mark));
        expect(got.nameType).toEqual(c.nameTypes.map((_, i) => c.nameTypes[Q.indexOf(i)]!));
      }
    }
  });
});

describe('type-checking — IR 의 마디 종류', () => {
  it('typeOf 는 kind 가 0 · 1 · 2 가 아니면 -1 을 돌려주고 자식을 따라가지 않는다', () => {
    const { opRule } = buildTables(data.rules[1]!, data.types, data.ops);
    const counts = [0, 0];
    const got = runIR(typeCheckingImperativeIR, 'typeOf', [0, [3], [0], [-1], [-1], opRule, [], counts]);
    expect(got).toBe(-1);
    expect(counts).toEqual([0, 0]);
  });
});

describe('type-checking — 되감기', () => {
  it('reset 뒤에는 판정 · 캡션 · 표지 · 걸림 틀 · 자국 · 칩이 남지 않고, 다음 회차 걸음 0 에 자국이 없다', async () => {
    const p = await play(data, [0]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(typeCheckingStageView, container, { config: {}, locale: 'en', isInstant: () => true });
    const highlighted: (string | null)[] = [];
    const codePanel = {
      highlightPhase: (ph: string | null) => highlighted.push(ph),
      clearHighlight: () => highlighted.push(null),
      destroy() {},
    };
    const proj = typeCheckingProjector({ stage, codePanel }, { getSpeed: () => 1, t: (_k, en) => en });
    const first = p.events.slice(0, p.events.findIndex((e) => e.type === 'verdict') + 1);
    for (const e of first) await proj.onEvent(e);
    expect(container.querySelectorAll('[stroke-width="2.5"]').length).toBeGreaterThan(0);
    proj.onReset?.();
    expect(highlighted.at(-1)).toBeNull();
    expect(container.querySelectorAll('[stroke-width="2.5"]').length).toBe(0);
    expect(container.querySelectorAll('[stroke-dasharray="5 4"]').length).toBe(0);
    expect(container.textContent).not.toContain('Error sites');
    expect(container.textContent).not.toContain('Operator error');
    // 되돌린 새 판의 걸음 0 — 앞 판 자국 없음
    await proj.onEvent(first[0]!);
    expect(container.querySelectorAll('[stroke-dasharray="5 4"]').length).toBe(0);
    stage.destroy();
  });
});

describe('type-checking — 재생', () => {
  it('넓힘 → 엄격 → 넓힘 → 느슨: 회차마다 걸음 12 · phase 차례 · 계기가 사양과 같다', async () => {
    const p = await play(data, [0, 1, 2]);
    const order = [1, 0, 1, 2];
    expect(p.meters).toHaveLength(order.length);
    for (const [k, r] of order.entries()) {
      expect(p.meters[k]).toHaveLength(12);
      expect(p.meters[k]!.join(' ')).toBe(SPEC.meters[r]);
      expect(p.phases[k]!.join(' ')).toBe(SPEC.phases[r]);
    }
  });

  it('사다리 밖 · 수 아닌 입력은 흘린다', async () => {
    const p = await play(data, [7, 0]);
    expect(p.meters).toHaveLength(2);
    expect(p.meters[1]!.at(-1)).toBe('3,2');
  });

  it('무대가 모든 규칙의 이벤트를 받아 끝까지 그린다 (projector 경유)', async () => {
    const p = await play(data, [0, 2]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(typeCheckingStageView, container, { config: {}, locale: 'ko', isInstant: () => true });
    const highlighted: (string | null)[] = [];
    const codePanel = {
      highlightPhase: (ph: string | null) => highlighted.push(ph),
      clearHighlight: () => highlighted.push(null),
      destroy() {},
    };
    const proj = typeCheckingProjector({ stage, codePanel }, { getSpeed: () => 1, t: (_k, en) => en });
    let verdicts = 0;
    for (const e of p.events) {
      await proj.onEvent(e);
      if (e.type === 'verdict') {
        verdicts += 1;
        expect(container.textContent).toContain('L7');
      }
      if (e.type === 'round') expect(container.querySelectorAll('[stroke-dasharray="5 4"]').length).toBeGreaterThanOrEqual(0);
    }
    expect(verdicts).toBe(3);
    expect(highlighted).toContain('verdict');
    stage.destroy();
  });
});
