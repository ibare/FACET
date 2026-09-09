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
  computeCountingSortResult,
  countingSort,
  countingSortFacet,
  countingSortProjector,
  countingSortStableIR,
  registerCountingSort,
  type CountingSortData,
} from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const SPEC_VALUES = [2, 5, 3, 0, 2, 3, 0, 3];
const SPEC_RANGE = 6;
const SPEC_SORTED = [0, 0, 2, 2, 3, 3, 3, 5];

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

async function record(values: number[], range: number): Promise<Recorded> {
  const data: CountingSortData = { type: 'array', values: [...values], range };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await countingSort({
    data,
    cancelled: false,
    async emit(event) {
      events.push(event);
    },
    metric(name, delta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
  });
  return { events, metrics };
}

function payloadsOf<T>(events: FacetRuntimeEvent[], type: string): T[] {
  return events.filter((e) => e.type === type).map((e) => e.payload as T);
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

describe('카운팅 정렬 알고리즘', () => {
  it('사양의 자료를 정렬하고 대조 수치와 맞는다', async () => {
    const { events, metrics } = await record(SPEC_VALUES, SPEC_RANGE);
    const done = payloadsOf<{ output: number[]; placements: number; comparisons: number }>(
      events,
      'done',
    )[0];
    expect(done.output).toEqual(SPEC_SORTED);
    expect(done.placements).toBe(8);
    // 견줌 0 회 — 이 알고리즘의 요점이다.
    expect(done.comparisons).toBe(0);
    expect(metrics['count-count']).toBe(8);
    expect(metrics['place-count']).toBe(8);
    expect(metrics['compare-count']).toBeUndefined();
  });

  it('순수 계산 결과가 재생 결과와 같다', () => {
    expect(computeCountingSortResult({ type: 'array', values: SPEC_VALUES, range: SPEC_RANGE }))
      .toEqual(SPEC_SORTED);
  });

  it('세기 [2, 0, 2, 3, 0, 1] — 1 과 4 는 하나도 없다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_RANGE);
    const counts = payloadsOf<{ counts: number[] }>(events, 'counts-done')[0].counts;
    expect(counts).toEqual([2, 0, 2, 3, 0, 1]);
  });

  it('시작 자리 [0, 2, 2, 4, 7, 7] — 개수가 0 인 값은 앞 값과 같은 자리다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_RANGE);
    const starts = payloadsOf<{ starts: number[] }>(events, 'starts-done')[0].starts;
    expect(starts).toEqual([0, 2, 2, 4, 7, 7]);
    expect(starts[1]).toBe(starts[2]);
    expect(starts[4]).toBe(starts[5]);
  });

  it('놓기 순서가 대조와 같다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_RANGE);
    const places = payloadsOf<{ value: number; slot: number }>(events, 'place-into').map(
      (p) => `${p.value}→${p.slot}`,
    );
    expect(places).toEqual(['2→2', '5→7', '3→4', '0→0', '2→3', '3→5', '0→1', '3→6']);
  });

  it('같은 값끼리의 순서가 보존된다 (안정)', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_RANGE);
    const threes = payloadsOf<{ index: number; value: number; slot: number }>(events, 'place-into')
      .filter((p) => p.value === 3);
    // 입력에서 앞선 3 이 앞 자리를 받는다.
    expect(threes.map((p) => p.index)).toEqual([2, 5, 7]);
    expect(threes.map((p) => p.slot)).toEqual([4, 5, 6]);
  });

  it('빈 배열 · 값 하나 · 이미 정렬된 배열', async () => {
    const empty = await record([], 3);
    expect(payloadsOf<{ output: number[] }>(empty.events, 'done')[0].output).toEqual([]);

    const one = await record([2], 3);
    expect(payloadsOf<{ output: number[] }>(one.events, 'done')[0].output).toEqual([2]);

    const asc = await record([0, 1, 2, 3], 4);
    expect(payloadsOf<{ output: number[] }>(asc.events, 'done')[0].output).toEqual([0, 1, 2, 3]);
    // 이미 정렬돼 있어도 걸음 수가 줄지 않는다 — 견주지 않으므로 조기 종료가 없다.
    expect(asc.metrics['place-count']).toBe(4);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_RANGE);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_RANGE);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(countingSortStableIR)].sort());
    expect([...emitted].sort()).toEqual([
      'advance',
      'alloc',
      'count',
      'finish',
      'place',
      'prefix-sum',
    ]);
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 여섯이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(countingSortStableIR);
      expect(res.lines.length).toBeGreaterThan(10);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...irPhases(countingSortStableIR)].sort());

      const all = res.lines.map((l) => l.code).join('\n');
      // 인덱스 안에 인덱스 — 이 알고리즘의 전부다. 감싸지 않는다.
      expect(all).toContain('count[arr[i]]');
      expect(all).toContain('output[start[arr[i]]]');
      // 견줌이 한 번도 없다. 부등호는 루프 조건 (phase 없는 줄) 에만 나온다.
      // C++ 의 `std::vector<int>` 처럼 붙여 쓴 꺾쇠는 견줌이 아니므로 공백을 낀
      // 연산자 모양만 본다.
      const bodyOnly = res.lines
        .filter((l) => l.phase !== null)
        .map((l) => l.code)
        .join('\n');
      expect(bodyOnly).not.toMatch(/\s[<>]=?\s/);
    },
  );
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널과 stage 걸음으로 함께 넘긴다', async () => {
    const { events } = await record(SPEC_VALUES, SPEC_RANGE);
    const phaseCalls: (string | null)[] = [];
    const steps: (string | null)[] = [];
    const placed: [number, number][] = [];
    const starts: [number, number][] = [];
    let consumed = 0;

    const stage = {
      setData() {},
      setCaption() {},
      setStep(s: string | null) {
        steps.push(s);
      },
      setCursor() {},
      setInputState(_i: number, state: string) {
        if (state === 'consumed') consumed++;
      },
      setActiveBucket() {},
      setCount() {},
      setStart(v: number, s: number) {
        starts.push([v, s]);
      },
      placeInto(slot: number, value: number) {
        placed.push([slot, value]);
      },
      setLink() {},
      clearLink() {},
      finish() {},
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

    const projector = countingSortProjector({ stage, codePanel });
    projector.onInit?.({ type: 'array', values: SPEC_VALUES, range: SPEC_RANGE });
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(6);
    // 걸음 표시는 셋 + 없음. 마련하기와 마무리는 걸음이 아니다.
    expect(new Set(steps)).toEqual(new Set(['count', 'prefix', 'place', null]));
    expect(placed).toEqual([
      [2, 2],
      [7, 5],
      [4, 3],
      [0, 0],
      [3, 2],
      [5, 3],
      [1, 0],
      [6, 3],
    ]);
    // 시작 자리는 누적합 6 번 + 자리 밀기 8 번.
    expect(starts).toHaveLength(14);
    expect(consumed).toBe(8);
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
    registerCountingSort();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(countingSortFacet, host, { autoStart: false });
    handle.setSpeed(20);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    // 입력 8 + 출력 8 + 값 칸 6 × 3 줄 = 34 칸.
    expect(host.querySelectorAll('svg rect').length).toBeGreaterThanOrEqual(34);

    handle.start();
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && new Set(seenPhases).size < 6) {
      await new Promise((r) => setTimeout(r, 50));
    }
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(new Set(seenPhases).size).toBe(6);

    // 출력 여덟 칸이 모두 채워졌다 — 화면의 수는 알고리즘이 셈한 것이다.
    const texts = [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    expect(texts.filter((t) => t !== '').length).toBeGreaterThan(30);

    handle.destroy();
    host.remove();
  }, 30_000);
});
