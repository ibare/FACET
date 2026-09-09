// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import type { FacetRuntimeEvent, IR, IRStmt, View, ViewInstance } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import {
  radixSort,
  radixSortFacet,
  radixSortLsdIR,
  radixSortProjector,
  registerRadixSort,
  type RadixSortData,
} from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [170, 45, 75, 90, 802, 24, 2, 66];

const IR_PHASES = [
  'count-digit',
  'pick-place',
  'place-back',
  'prefix-sum',
  'read-digit',
  'round-end',
  'scan-max',
];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[]): Promise<Recorded & { data: RadixSortData }> {
  const data: RadixSortData = { type: 'array', values: [...values] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await radixSort({
    data,
    cancelled: false,
    async emit(event) {
      events.push(event);
    },
    metric(name, delta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
  });
  return { data, events, metrics };
}

function irPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range' || s.kind === 'while') {
        walk(s.body);
      }
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

describe('기수 정렬 알고리즘', () => {
  it('사양의 자료를 정렬하고 대조 수치와 맞는다', async () => {
    const { data, metrics } = await record(SPEC_VALUES);
    expect(data.values).toEqual([2, 24, 45, 66, 75, 90, 170, 802]);
    expect(metrics['round-count']).toBe(3);
    expect(metrics['place-count']).toBe(24);
    // 값끼리 견주지 않는다 — 알고리즘이 이 메트릭을 건드리지 않는다.
    expect(metrics['compare-count']).toBeUndefined();
  });

  it('라운드 셋의 결과가 대조와 같다', async () => {
    const { events } = await record(SPEC_VALUES);
    const rounds = events
      .filter((e) => e.type === 'round-end')
      .map((e) => e.payload as { exp: number; values: number[] });
    expect(rounds).toEqual([
      { round: 1, exp: 1, values: [170, 90, 802, 2, 24, 45, 75, 66] },
      { round: 2, exp: 10, values: [802, 2, 24, 45, 66, 170, 75, 90] },
      { round: 3, exp: 100, values: [2, 24, 45, 66, 75, 90, 170, 802] },
    ]);
  });

  it('10의 자리 라운드에서 802 와 2 가 앞뒤를 지킨다 (안정)', async () => {
    const { events } = await record(SPEC_VALUES);
    const places = events
      .filter((e) => e.type === 'place')
      .map((e) => e.payload as { value: number; digit: number; slot: number });
    // 라운드마다 여덟 번씩 놓는다. 두 번째 라운드가 10의 자리다.
    const second = places.slice(8, 16);
    const at802 = second.find((p) => p.value === 802);
    const at2 = second.find((p) => p.value === 2);
    expect(at802?.digit).toBe(0);
    expect(at2?.digit).toBe(0);
    // 자리 숫자가 같은데도 802 가 앞 칸을 받는다 — 앞 라운드의 순서 그대로다.
    expect(at802?.slot).toBe(0);
    expect(at2?.slot).toBe(1);
  });

  it('빈 배열 · 한 칸 · 0 하나', async () => {
    expect((await record([])).data.values).toEqual([]);
    expect((await record([42])).data.values).toEqual([42]);
    // max 가 0 이면 while 이 한 번도 돌지 않는다.
    const zero = await record([0]);
    expect(zero.data.values).toEqual([0]);
    expect(zero.metrics['round-count']).toBeUndefined();
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(SPEC_VALUES);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record(SPEC_VALUES);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(radixSortLsdIR)].sort());
    expect([...emitted].sort()).toEqual(IR_PHASES);
  });
});

describe('여섯 언어 emit (S-transpiler)', () => {
  const ALL = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it.each(ALL.map((t) => [t.id, t] as const))(
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 일곱이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(radixSortLsdIR);
      expect(res.lines.length).toBeGreaterThan(20);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(IR_PHASES);
      // 두 함수가 다 나온다 — 자릿수 루프와 한 자리로 줄 세우는 보조 함수.
      const all = res.lines.map((l) => l.code).join('\n');
      expect(all).toContain('radix_sort');
      expect(all).toContain('counting_by_digit');
    },
  );

  it("'//' 가 언어마다 옳게 갈린다", () => {
    const codeOf = (t: (typeof ALL)[number]) =>
      t.transpile(radixSortLsdIR).lines.map((l) => l.code).join('\n');
    expect(codeOf(pythonTranspiler)).toContain('(arr[i] // exp) % 10');
    expect(codeOf(javaTranspiler)).toContain('(arr[i] / exp) % 10');
    expect(codeOf(cppTranspiler)).toContain('(arr[i] / exp) % 10');
    expect(codeOf(csharpTranspiler)).toContain('(arr[i] / exp) % 10');
    expect(codeOf(javascriptTranspiler)).toContain('(Math.floor(arr[i] / exp)) % 10');
    expect(codeOf(typescriptTranspiler)).toContain('(Math.floor(arr[i] / exp)) % 10');
    // 감싸지 않았다 — 자릿수 뽑기가 이름 뒤로 숨지 않는다.
    for (const t of ALL) expect(codeOf(t)).not.toContain('digit_at');
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 통과 output 칸을 잇는다', async () => {
    const { events } = await record(SPEC_VALUES);
    const phaseCalls: (string | null)[] = [];
    const links: { digit: number; slot: number; value: number }[] = [];
    let rounds = 0;
    let done = 0;
    const stage = {
      setData() {},
      setMax() {},
      beginRound() {
        rounds++;
      },
      readDigit() {},
      releaseCell() {},
      setBucketValue() {},
      showPrefixAdd() {},
      linkToSlot(digit: number, slot: number, value: number) {
        links.push({ digit, slot, value });
      },
      commitRound() {},
      markDone() {
        done++;
      },
      setCaption() {},
      reset() {},
    } as unknown as ViewInstance;
    const codePanel = {
      destroy() {},
      highlightPhase(p: string | null) {
        phaseCalls.push(p);
      },
      clearHighlight() {
        phaseCalls.push(null);
      },
    } as unknown as ViewInstance;

    const projector = radixSortProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(7);
    expect(rounds).toBe(3);
    expect(links).toHaveLength(24);
    expect(done).toBe(1);
    // done 이 하이라이트를 거둔다.
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
  });
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('stage 가 칸을 그리고 재생 내내 캔버스 세로가 변하지 않는다', async () => {
    const seenPhases: string[] = [];
    const fakeCodeView: View = {
      mount(container) {
        const node = document.createElement('div');
        container.appendChild(node);
        return {
          destroy() {
            node.remove();
          },
          highlightPhase(phase: string | null) {
            if (phase) seenPhases.push(phase);
          },
          clearHighlight() {},
        };
      },
    };
    registerRadixSort();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(radixSortFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 칸 8 + 자리 숫자 8 + output 8 + 통 10 + exp 칩 4.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(38);

    handle.start();
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 7) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(7);

    handle.destroy();
    host.remove();
  }, 40_000);

  it('destroy 뒤 캔버스가 남지 않는다', () => {
    registerRadixSort();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(radixSortFacet, host, { autoStart: false });
    expect(host.querySelector('svg g')).not.toBeNull();
    handle.destroy();
    expect(host.querySelector('svg g')).toBeNull();
    host.remove();
  });
});
