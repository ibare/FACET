import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  type FacetRuntimeEvent,
  type IRStmt,
  type ReactiveContext,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';

import {
  arrangeFields,
  computeStructLayout,
  registerStructAlignment,
  structAlignmentAlgorithm,
  structAlignmentFacet,
  structAlignmentImperativeIR,
  structAlignmentProjector,
  type StructAlignmentData,
  type StructAlignmentStage,
} from '../src/index.js';

const DATA = structAlignmentFacet.initialData as StructAlignmentData;
const DECLARED = 0;
const LARGEST = 1;

/** 사양 표 — 대조용. [order, pack] → 크기 · 빈틈 · 꼬리 · 어긋남 · 오프셋. */
type Row = { size: number; padding: number; tail: number; misaligned: number; offsets: string };
const SPEC: Record<string, Row> = {
  '0:1': { size: 16, padding: 0, tail: 0, misaligned: 3, offsets: 'a0 d1 s9 i11 b15' },
  '0:2': { size: 18, padding: 2, tail: 1, misaligned: 1, offsets: 'a0 d2 s10 i12 b16' },
  '0:4': { size: 24, padding: 8, tail: 3, misaligned: 1, offsets: 'a0 d4 s12 i16 b20' },
  '0:8': { size: 32, padding: 16, tail: 7, misaligned: 0, offsets: 'a0 d8 s16 i20 b24' },
  '1:1': { size: 16, padding: 0, tail: 0, misaligned: 0, offsets: 'd0 i8 s12 a14 b15' },
  '1:2': { size: 16, padding: 0, tail: 0, misaligned: 0, offsets: 'd0 i8 s12 a14 b15' },
  '1:4': { size: 16, padding: 0, tail: 0, misaligned: 0, offsets: 'd0 i8 s12 a14 b15' },
  '1:8': { size: 16, padding: 0, tail: 0, misaligned: 0, offsets: 'd0 i8 s12 a14 b15' },
};
const COMBOS: Array<[number, number]> = [DECLARED, LARGEST].flatMap((o) =>
  DATA.packLadder.map((p): [number, number] => [o, p]),
);

type Metrics = Record<string, number>;
type Round = { metrics: Metrics; summary: Record<string, unknown> };

/**
 * 가짜 reactive 문맥 — 입력을 차례로 먹이고, 다 먹으면 취소한다.
 * 판이 끝날 때(summary) 마다 그 순간의 계기를 뜬다.
 */
async function drive(inputs: Array<{ type: string; value: unknown }>, data = DATA) {
  const metrics: Metrics = {};
  const rounds: Round[] = [];
  const events: FacetRuntimeEvent[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'summary') rounds.push({ metrics: { ...metrics }, summary: e.payload as Record<string, unknown> });
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
  } as unknown as ReactiveContext<StructAlignmentData>;
  await structAlignmentAlgorithm(ctx);
  return { rounds, events, metrics };
}

function offsetsOf(order: number, pack: number, data = DATA): string {
  return computeStructLayout(data.fields, order, pack)
    .placed.map((p) => `${p.name}${p.offset}`)
    .join(' ');
}

function sizesFor(order: number): number[] {
  return arrangeFields(DATA.fields, order).map((i) => DATA.fields[i]!.size);
}

function collectPhases(stmts: IRStmt[], out: Set<string>): void {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      collectPhases(s.then, out);
      if (s.else) collectPhases(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') collectPhases(s.body, out);
  }
}

describe('structAlignment — 셈이 사양 표와 같다', () => {
  it.each(COMBOS)('order %i · pack %i', (order, pack) => {
    const layout = computeStructLayout(DATA.fields, order, pack);
    const row = SPEC[`${order}:${pack}`]!;
    expect({
      size: layout.size,
      padding: layout.padding,
      tail: layout.tail,
      misaligned: layout.misaligned,
      offsets: offsetsOf(order, pack),
    }).toEqual(row);
    expect(layout.padding).toBe(layout.size - layout.data);
    expect(layout.data).toBe(16);
  });

  it('큰 것부터는 크기 내림차순, 같은 크기는 선언 순서다', () => {
    expect(arrangeFields(DATA.fields, LARGEST).map((i) => DATA.fields[i]!.name)).toEqual(['d', 'i', 's', 'a', 'b']);
  });
});

describe('structAlignment — 회차별 계기', () => {
  it('손잡이를 A → B → A 로 돌려도 회차마다 사양 표와 같다 (쌓이지 않는다)', async () => {
    // 처음 (선언, 8) → pack 1 → pack 8 → 큰 것부터 → pack 1 → pack 2 → 선언 순서 → pack 4 → pack 8
    const script = [
      { type: 'pack', value: 1 },
      { type: 'pack', value: 8 },
      { type: 'order', value: LARGEST },
      { type: 'pack', value: 1 },
      { type: 'pack', value: 2 },
      { type: 'order', value: DECLARED },
      { type: 'pack', value: 4 },
      { type: 'pack', value: 8 },
    ];
    const expected: Array<[number, number]> = [
      [DECLARED, 8], [DECLARED, 1], [DECLARED, 8], [LARGEST, 8], [LARGEST, 1],
      [LARGEST, 2], [DECLARED, 2], [DECLARED, 4], [DECLARED, 8],
    ];
    const { rounds } = await drive(script);
    expect(rounds).toHaveLength(expected.length);
    rounds.forEach((r, k) => {
      const [o, p] = expected[k]!;
      const row = SPEC[`${o}:${p}`]!;
      expect({ round: k, ...r.metrics }).toEqual({
        round: k,
        'struct-size': row.size,
        'padding-size': row.padding,
        'misaligned-count': row.misaligned,
      });
    });
    // 큰 것부터에서 pack 을 돌리면 아무것도 움직이지 않는다 — 그것이 결론이다.
    expect(rounds.map((r) => r.summary.moved)).toEqual([-1, 4, 4, 5, 0, 0, 5, 4, 4]);
  });

  it('갈리지 않는 값에서도 계기 이름 셋이 모두 실린다', async () => {
    const { rounds } = await drive([]);
    expect(Object.keys(rounds[0]!.metrics).sort()).toEqual(['misaligned-count', 'padding-size', 'struct-size']);
  });

  it('사다리에 없는 값 · 모르는 입력은 흘려보낸다', async () => {
    const { rounds } = await drive([
      { type: 'pack', value: 3 },
      { type: 'pack', value: '4' },
      { type: 'order', value: 2 },
      { type: 'advance', value: 0 },
      { type: 'pack', value: 2 },
    ]);
    expect(rounds.map((r) => r.metrics['struct-size'])).toEqual([32, 18]);
  });
});

describe('structAlignment — IR 은 화면과 같은 답을 낸다', () => {
  it.each(COMBOS)('order %i · pack %i', async (order, pack) => {
    const script = [
      ...(order === LARGEST ? [{ type: 'order', value: LARGEST }] : []),
      ...(pack !== DATA.pack ? [{ type: 'pack', value: pack }] : []),
    ];
    const { rounds } = await drive(script);
    const shown = rounds[rounds.length - 1]!.metrics;
    const sizes = sizesFor(order);
    const size = runIR(structAlignmentImperativeIR, 'structSize', [sizes, pack]);
    const misaligned = runIR(structAlignmentImperativeIR, 'countMisaligned', [sizes, pack]);
    expect(size).toBe(shown['struct-size']);
    expect(misaligned).toBe(shown['misaligned-count']);
    expect((size as number) - 16).toBe(shown['padding-size']);
  });

  it('phase 집합이 algorithm 과 IR 에서 같다', async () => {
    const { events } = await drive([
      { type: 'pack', value: 1 },
      { type: 'order', value: LARGEST },
    ]);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    const declared = new Set<string>();
    for (const fn of structAlignmentImperativeIR.functions) collectPhases(fn.body, declared);
    expect([...emitted].sort()).toEqual([...declared].sort());
    expect([...declared].sort()).toEqual(['begin', 'misalign', 'place', 'tail']);
  });

  it('32 비트 넘침이 없다 — 데이터가 커지면 여기서 먼저 깨진다', () => {
    expect(DATA.fields).toHaveLength(5);
    expect(Math.max(...DATA.fields.map((f) => f.size))).toBe(8);
    expect(Math.max(...DATA.packLadder)).toBe(8);
    const worst = Math.max(...COMBOS.map(([o, p]) => computeStructLayout(DATA.fields, o, p).size));
    // 중간값의 최대는 올림 직전의 offset + align − 1 ≤ 크기 + 7.
    expect(worst).toBe(32);
    expect(worst + 7).toBeLessThan(2 ** 31);
  });
});

describe('structAlignment — 선언', () => {
  it('reactive 로 등록된다', () => {
    clearRegistry();
    registerStructAlignment();
    expect(getAlgorithmMechanismKind('structAlignment')).toBe('reactive');
  });

  it('사다리가 손잡이의 segments 와 같다', () => {
    const controls = (structAlignmentFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const knob = (action: string) => controls.find((c) => c.action === action) as {
      segments: Array<{ value: number; default?: boolean }>;
    };
    const pack = knob('pack');
    const order = knob('order');
    expect(pack.segments.map((s) => s.value)).toEqual(DATA.packLadder);
    expect(pack.segments.find((s) => s.default)?.value).toBe(DATA.pack);
    expect(order.segments.map((s) => s.value)).toEqual(DATA.orders.map((_, i) => i));
    expect(order.segments.find((s) => s.default)?.value).toBe(DATA.order);
  });
});

describe('structAlignment — 캡션의 수는 그 이름의 수다', () => {
  /** 이름과 수를 그대로 드러내는 번역기 — 어느 자리에 어느 값이 들어갔는지 본다. */
  const t = (key: string, _en: string, vars?: Record<string, string | number>) =>
    `${key} ${Object.entries(vars ?? {}).map(([k, v]) => `${k}=${v}`).join(' ')}`;

  async function captions(data: StructAlignmentData, inputs: Array<{ type: string; value: unknown }> = []) {
    const { events } = await drive(inputs, data);
    const lines: string[] = [];
    const calls: string[] = [];
    const stage: Partial<StructAlignmentStage> = {
      reset: () => undefined,
      beginLayout: () => undefined,
      place: (a) => calls.push(`place field=${a.field} slot=${a.slot} from=${a.from} offset=${a.offset}`),
      misalign: (field, offset, size) => calls.push(`misalign field=${field} offset=${offset} size=${size}`),
      tail: (a) => calls.push(`tail from=${a.from} size=${a.size}`),
      setCaption: (text) => lines.push(text),
    };
    const projector = structAlignmentProjector(
      { stage: stage as never },
      { getSpeed: () => 1, t },
    );
    projector.onInit?.(data);
    for (const e of events) await projector.onEvent(e);
    return { lines, calls };
  }

  it('밀려남 캡션은 놓기 전의 끝과 놓인 오프셋을 말한다', async () => {
    const { lines, calls } = await captions(DATA);
    expect(lines).toContain('caption.pushed name=d ctype=double from=1 offset=8 align=8 gap=7');
    expect(lines).toContain('caption.tail from=25 size=32 tail=7 structAlign=8');
    expect(lines).toContain('caption.summary size=32 padding=16 misaligned=0 data=16');
    expect(calls).toContain('place field=1 slot=1 from=1 offset=8');
  });

  it('데이터를 바꿔도 같은 이름에 같은 수가 간다 (우연한 일치가 아니다)', async () => {
    // 선언을 뒤섞는다: short 가 앞에, int 이 둘. 필드 색인과 놓는 차례가 갈라진다.
    const data: StructAlignmentData = {
      ...DATA,
      fields: [
        { name: 'p', ctype: 'short', size: 2 },
        { name: 'q', ctype: 'char', size: 1 },
        { name: 'r', ctype: 'int', size: 4 },
        { name: 'u', ctype: 'double', size: 8 },
        { name: 'w', ctype: 'int', size: 4 },
      ],
    };
    const { lines, calls } = await captions(data, [{ type: 'pack', value: 2 }, { type: 'order', value: LARGEST }]);
    // pack 8: p0 q2 r4 u8 w16 → 끝 20, 구조체 24
    expect(lines).toContain('caption.pushed name=r ctype=int from=3 offset=4 align=4 gap=1');
    expect(lines).toContain('caption.tail from=20 size=24 tail=4 structAlign=8');
    // pack 2: p0 q2 r4 u8 w16 → 오프셋은 같다, 끝 20 은 2 의 배수
    expect(lines).toContain('caption.tailNone from=20 size=20 tail=0 structAlign=2');
    // 큰 것부터 (pack 2): u0 r8 w12 p16 q18 → 19 → 20. u 는 선언 색인 3 · 차례 0
    expect(calls).toContain('place field=3 slot=0 from=0 offset=0');
    expect(calls).toContain('place field=4 slot=2 from=12 offset=12');
    expect(lines).toContain('caption.tail from=19 size=20 tail=1 structAlign=2');
  });

  it('어긋남 캡션은 오프셋과 제 크기를 말한다', async () => {
    const { lines, calls } = await captions(DATA, [{ type: 'pack', value: 1 }]);
    expect(lines).toContain('caption.misalign name=d offset=1 size=8');
    expect(lines).toContain('caption.misalign name=i offset=11 size=4');
    expect(calls).toContain('misalign field=3 offset=11 size=4');
  });
});
