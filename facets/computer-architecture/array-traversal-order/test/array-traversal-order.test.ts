// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { getAlgorithmMechanismKind, makeTranslator, mountView } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, IRStmt, ReactiveInputEvent } from '@ffacet/core/runtime';

import {
  arrayTraversalOrderAlgorithm,
  arrayTraversalOrderFacet,
  arrayTraversalOrderImperativeIR,
  arrayTraversalOrderProjector,
  arrayTraversalOrderStageView,
  computeArrayTraversalOrderResult,
  registerArrayTraversalOrder,
} from '../src/index.js';
import type { ArrayTraversalOrderData } from '../src/index.js';

const data = arrayTraversalOrderFacet.initialData as ArrayTraversalOrderData;

/** 사양 표 — 대조용. [행 수, 접근, 행 우선 미스, %, 열 우선 미스, %, 합] */
const SPEC: [number, number, number, number, number, number, number][] = [
  [4, 32, 8, 25, 8, 25, 528],
  [8, 64, 16, 25, 16, 25, 2080],
  [12, 96, 24, 25, 96, 100, 4656],
  [16, 128, 32, 25, 128, 100, 8256],
];

type Seg = { value: unknown; default?: boolean };
type Ctl = { widget?: string; action?: string; segments?: Seg[] };
const controls = (arrayTraversalOrderFacet.blocks.controls as { controls: Ctl[] }).controls;
const knob = (action: string) => controls.find((c) => c.widget === 'segmented-slider' && c.action === action)!;

function irRun(rows: number, order: number) {
  const tags = new Array<number>(data.cacheLines).fill(99);
  const stamps = new Array<number>(data.cacheLines).fill(99);
  const cells = Array.from({ length: rows * data.cols }, (_, i) => i + 1);
  const misses = runIR(arrayTraversalOrderImperativeIR, 'countMisses', [
    rows,
    data.cols,
    order,
    data.lineElems,
    tags,
    stamps,
  ]) as number;
  const sum = runIR(arrayTraversalOrderImperativeIR, 'walkSum', [cells, rows, data.cols, order]) as number;
  const accesses = rows * data.cols;
  const percent = runIR(arrayTraversalOrderImperativeIR, 'missPercent', [misses, accesses]) as number;
  return { misses, sum, percent, accesses };
}

/** 가짜 reactive ctx — 입력 목록을 다 쓰면 취소한다. */
async function drive(inputs: ReactiveInputEvent[]) {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const runs: { rows: number; order: number; metrics: Record<string, number> }[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'run-end') {
        const p = e.payload as { rows: number; order: number };
        runs.push({ rows: p.rows, order: p.order, metrics: Object.fromEntries(metrics) });
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
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
      return next;
    },
  };
  await arrayTraversalOrderAlgorithm(ctx as never);
  return { events, runs };
}

const turn = (action: string, value: number): ReactiveInputEvent => ({ type: action, payload: { value, segmentIndex: 0 } });

describe('array-traversal-order', () => {
  it('셈한 값이 사양 표와 같다', () => {
    for (const [rows, acc, rowMiss, rowPct, colMiss, colPct, sum] of SPEC) {
      const r = computeArrayTraversalOrderResult(rows, 0, data.cols, data.lineElems, data.cacheLines);
      const c = computeArrayTraversalOrderResult(rows, 1, data.cols, data.lineElems, data.cacheLines);
      expect([r.accesses.length, r.misses, r.missPercent, r.sum]).toEqual([acc, rowMiss, rowPct, sum]);
      expect([c.accesses.length, c.misses, c.missPercent, c.sum]).toEqual([acc, colMiss, colPct, sum]);
      expect(sum).toBe((rows * 8 * (rows * 8 + 1)) / 2);
    }
  });

  it('IR 이 모든 손잡이 조합에서 algorithm 과 같은 답을 낸다', () => {
    for (const rows of data.rowLadder) {
      for (let order = 0; order < data.orders.length; order++) {
        const alg = computeArrayTraversalOrderResult(rows, order, data.cols, data.lineElems, data.cacheLines);
        const ir = irRun(rows, order);
        expect({ misses: ir.misses, percent: ir.percent, sum: ir.sum }).toEqual({
          misses: alg.misses,
          percent: alg.missPercent,
          sum: alg.sum,
        });
      }
    }
  });

  it('32 비트 — 매개변수 길이와 사다리 끝값을 잠근다', () => {
    expect(data.cacheLines).toBe(8);
    expect(Math.max(...data.rowLadder)).toBe(16);
    expect(data.cols).toBe(8);
    const rows = Math.max(...data.rowLadder);
    const accesses = rows * data.cols;
    // 가장 큰 중간값: 미스 % 분자와 합.
    expect(accesses * 100 + Math.floor(accesses / 2)).toBeLessThan(2 ** 31 - 1);
    expect(irRun(rows, 1).sum).toBe(8256);
  });

  it('phase 집합이 algorithm 과 IR 에서 같다', async () => {
    const irPhases = new Set<string>();
    const walk = (stmts: IRStmt[]) => {
      for (const s of stmts) {
        if ('phase' in s && typeof s.phase === 'string') irPhases.add(s.phase);
        if (s.kind === 'if') {
          walk(s.then);
          if (s.else) walk(s.else);
        }
        if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
      }
    };
    for (const f of arrayTraversalOrderImperativeIR.functions) walk(f.body);

    const { events } = await drive([turn('rows', 8), turn('order', 0)]);
    const algPhases = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...algPhases].sort()).toEqual([...irPhases].sort());
    expect(events.filter((e) => e.type === 'phase').every((e) => e.silent === true)).toBe(true);
  });

  it('등록하면 reactive 다', () => {
    registerArrayTraversalOrder();
    expect(getAlgorithmMechanismKind('arrayTraversalOrder')).toBe('reactive');
  });

  it('회차마다 계기가 사양 표와 같다 — A → B → A', async () => {
    // 기본(열 우선 · 12) → 8 → 12 → 행 우선 → 16 → 열 우선
    const { runs } = await drive([
      turn('rows', 8),
      turn('rows', 12),
      turn('order', 0),
      turn('rows', 16),
      turn('order', 1),
      turn('rows', 4),
      turn('bogus', 3),
      turn('rows', 5),
      turn('order', 0),
    ]);
    const expected = (rows: number, order: number) => {
      const row = SPEC.find((s) => s[0] === rows)!;
      return {
        'access-count': row[1],
        'miss-count': order === 0 ? row[2] : row[4],
        'miss-percent': order === 0 ? row[3] : row[5],
        'element-sum': row[6],
      };
    };
    expect(runs.map((r) => [r.rows, r.order])).toEqual([
      [12, 1],
      [8, 1],
      [12, 1],
      [12, 0],
      [16, 0],
      [16, 1],
      [4, 1],
      [4, 0],
    ]);
    for (const r of runs) expect(r.metrics).toEqual(expected(r.rows, r.order));
  });

  it('사다리와 손잡이 구간이 같다', () => {
    const rows = knob('rows');
    const order = knob('order');
    expect(rows.segments!.map((s) => s.value)).toEqual(data.rowLadder);
    expect(order.segments!.map((s) => s.value)).toEqual(data.orders.map((_, i) => i));
    expect(rows.segments!.find((s) => s.default)?.value).toBe(data.rows);
    expect(order.segments!.find((s) => s.default)?.value).toBe(data.order);
  });

  it('캡션의 수가 그 이름의 수다', async () => {
    const captions: { kind: string; cap: string }[] = [];
    const stage = {
      setPace() {},
      startRun() {},
      moveCursor(_v: unknown, cap: string) {
        captions.push({ kind: 'visit', cap });
      },
      markLookup(_l: unknown, cap: string) {
        captions.push({ kind: 'lookup', cap });
      },
      showAccess(_a: unknown, cap: string) {
        captions.push({ kind: 'access', cap });
      },
      endRun(_a: unknown, cap: string) {
        captions.push({ kind: 'end', cap });
      },
      clearAll() {},
      destroy() {},
    };
    const tr = makeTranslator('en', arrayTraversalOrderFacet.messages);
    const projector = arrayTraversalOrderProjector({ stage }, { getSpeed: () => 1, t: tr });
    projector.onInit?.(data);
    const { events } = await drive([turn('rows', 16)]);
    const shown: { e: FacetRuntimeEvent; cap: string }[] = [];
    for (const e of events) {
      const before = captions.length;
      await projector.onEvent(e);
      if (captions.length > before) shown.push({ e, cap: captions[captions.length - 1]!.cap });
    }

    // 열 우선 · 12 행과 16 행 — 접근마다 세 걸음.
    expect(shown.filter((s) => s.e.type === 'visit').length).toBe(96 + 128);
    let refetches = 0;
    for (const { e, cap } of shown) {
      const p = e.payload as Record<string, number | boolean>;
      if (e.type === 'visit') {
        const value = (p.r as number) * data.cols + (p.c as number) + 1;
        expect(cap).toBe(`(${p.r}, ${p.c}) holds ${value} — running sum ${p.sum}`);
      }
      if (e.type === 'lookup' || e.type === 'access') {
        const elem = (p.r as number) * data.cols + (p.c as number);
        const line = Math.floor(elem / data.lineElems);
        expect([p.elem, p.line]).toEqual([elem, line]);
        if (e.type === 'lookup') expect(cap).toContain(`is element ${elem}, in line ${line}`);
        else expect(cap.startsWith(`(${p.r}, ${p.c}) → line ${line}:`)).toBe(true);
      }
      if (e.type === 'access') {
        if ((p.evicted as number) >= 0 && !p.refetch) expect(cap).toContain(`line ${p.evicted} pushed out`);
        if (p.refetch) refetches += 1;
      }
    }
    expect(refetches).toBeGreaterThan(0);
    const ends = captions.filter((c) => c.kind === 'end').map((c) => c.cap);
    expect(ends).toEqual([
      '96 of 96 reads missed (100%) · sum 4656',
      '128 of 128 reads missed (100%) · sum 8256',
    ]);
  });

  it('걸음마다 phase 하나 — 코드 패널의 phase 가 재생 중 모두 켜진다', async () => {
    const { events } = await drive([turn('order', 0)]);
    // 걸음 경계(비silent 이벤트) 직전의 phase 가 그 걸음 동안 켜져 있는 phase 다.
    const lit = new Set<string>();
    let last: string | null = null;
    for (const e of events) {
      if (e.type === 'phase') last = (e.payload as { phase: string }).phase;
      else if (last) lit.add(last);
    }
    // report 는 판이 끝나 입력을 기다리는 동안 켜져 있다.
    if (last) lit.add(last);
    const irPhases = new Set<string>();
    const walk = (stmts: IRStmt[]) => {
      for (const s of stmts) {
        if ('phase' in s && typeof s.phase === 'string') irPhases.add(s.phase);
        if (s.kind === 'if') {
          walk(s.then);
          if (s.else) walk(s.else);
        }
        if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
      }
    };
    for (const f of arrayTraversalOrderImperativeIR.functions) walk(f.body);
    expect([...lit].sort()).toEqual([...irPhases].sort());
  });

  it('사람이 읽는 문안은 열 언어를 다 갖춘다', () => {
    const LANGS = ['ar', 'en', 'es', 'fr', 'hi', 'id', 'ja', 'ko', 'pt', 'zh'];
    const missing: string[] = [];
    const visit = (v: unknown, path: string) => {
      if (Array.isArray(v)) return v.forEach((x, i) => visit(x, `${path}[${i}]`));
      if (typeof v !== 'object' || v === null) return;
      const o = v as Record<string, unknown>;
      if (typeof o.en === 'string') {
        const keys = Object.keys(o).sort();
        if (keys.join() !== LANGS.join()) missing.push(path);
        return;
      }
      for (const [k, x] of Object.entries(o)) visit(x, `${path}.${k}`);
    };
    visit(arrayTraversalOrderFacet, 'facet');
    expect(missing).toEqual([]);
  });

  it('stage 가 마운트되고 호출을 받는다', () => {
    const container = document.createElement('div');
    const inst = mountView(arrayTraversalOrderStageView, container, {
      config: {},
      initialData: data as unknown as Record<string, unknown>,
    }) as unknown as {
      startRun: (r: object, c: string) => void;
      moveCursor: (v: object, c: string) => void;
      markLookup: (l: number, c: string) => void;
      showAccess: (a: object, c: string) => void;
      endRun: (r: object, c: string) => void;
      clearAll: () => void;
      destroy: () => void;
    };
    const canvas = container.querySelector('svg')!;
    const res = computeArrayTraversalOrderResult(12, 1, 8, 4, 8);
    inst.startRun({ rows: 12, cols: 8, order: 1, lineElems: 4, cacheLines: 8 }, 'x');
    for (const a of res.accesses.slice(0, 20)) {
      inst.moveCursor(a, 'v');
      inst.markLookup(a.line, 'l');
      inst.showAccess({ ...a, percent: 50 }, 'y');
    }
    inst.endRun({ rows: 12, order: 1, missPercent: 100, sum: 4656 }, 'z');
    expect(canvas.querySelectorAll('text').length).toBeGreaterThan(100);
    inst.clearAll();
    inst.destroy();
    expect(canvas.childNodes.length).toBe(0);
  });
});
