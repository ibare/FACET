/**
 * editDistance — 손잡이 세 값에서 화면과 코드 패널이 같은 답을 내는가.
 *
 * 완제품이 코드 패널을 다는 까닭은 IR 하나가 여섯 언어로 갈리는 것을 보이는
 * 데 있다. 그런데 **IR 이 셈하는 값과 화면이 보이는 값이 어긋나면 그것이
 * 거짓말이고 다는 까닭 자체가 지워진다.** 그래서 손잡이 세 값 전부에서 표와
 * 고침 목록을 맞대 본다.
 */

// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { mountView } from '@ffacet/core/runtime';
import { IRInterpreter, type Value } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

import {
  backtrackEdits,
  editDistanceAlgorithm,
  editDistanceFacet,
  editDistanceImperativeIR,
  editDistanceProjector,
  editDistanceStageView,
  fillEditTable,
  type EditDistanceData,
  type EditStep,
} from '../src/index.js';

const SOURCE = 'intention';
const TARGET = 'execution';
const COSTS = [1, 2, 3] as const;

const PHASES = ['answer', 'compare', 'fill-cell', 'init-edges', 'step-back'];

/**
 * 사양의 대조표 — 교체 비용마다의 고침 목록.
 *
 * `~a>b` 바꿈 · `-a` 지움 · `+b` 넣음. 손으로 옮긴 수가 아니라 실측한 것이고,
 * 이 표가 갈리는 것이 이 완제품의 손잡이가 지는 논증이다.
 */
const SPEC: Record<number, { list: string; cost: number; fix: number; rep: number }> = {
  1: { list: '~i>e ~n>x ~t>e ~e>c ~n>u', cost: 5, fix: 5, rep: 5 },
  2: { list: '-i ~n>e ~t>x +c ~n>u', cost: 8, fix: 5, rep: 3 },
  3: { list: '+e +x -i -n -t +c +u -n', cost: 8, fix: 8, rep: 0 },
};

type Fix = { index: number; op: string; from: string; to: string };

/** 걸음 하나를 한 조각 글로 줄인다. 대조표와 같은 표기다. */
function code(op: string, from: string, to: string): string {
  if (op === 'replace') return `~${from}>${to}`;
  if (op === 'delete') return `-${from}`;
  if (op === 'insert') return `+${to}`;
  return `=${from}`;
}

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
};

/**
 * 알고리즘을 한 판만 돌린다.
 *
 * reactive ctx 를 흉내 낸다 — `sleep` 은 곧바로 돌아오고, `done` 이 나오면
 * 취소를 걸어 `waitForInput` 이 reject 하게 한다. 실제 러너에서 되돌리기가
 * 하는 일과 같은 모양이라, 알고리즘의 종료 경로도 함께 지나간다.
 */
async function record(subCost: number): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const state = { cancelled: false };

  const ctx = {
    data: { type: 'edit-distance', source: SOURCE, target: TARGET, subCost, stepMs: 1 },
    get cancelled() {
      return state.cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
      if (event.type === 'done') state.cancelled = true;
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !state.cancelled;
    },
    async waitForInput() {
      throw new Error('cancelled');
    },
    pollInput() {
      return null;
    },
  };

  await editDistanceAlgorithm(ctx as unknown as FacetContext<EditDistanceData>);
  return { events, metrics };
}

function payloadsOf<T>(events: FacetRuntimeEvent[], type: string): T[] {
  return events.filter((e) => e.type === type).map((e) => e.payload as T);
}

/** 화면이 그리게 될 표를 이벤트만으로 다시 세운다. */
function tableFromEvents(events: FacetRuntimeEvent[]): number[][] {
  const init = payloadsOf<{ rows: number; cols: number }>(events, 'table-init')[0];
  const table = Array.from({ length: init.rows }, () => new Array<number>(init.cols).fill(-1));
  for (const p of payloadsOf<{ i: number; j: number; value: number }>(events, 'cell-filled')) {
    table[p.i][p.j] = p.value;
  }
  return table;
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

/** IR 을 실제로 돌려 표와 고침 목록을 받는다. 배열은 바깥에서 만들어 넘긴다. */
function runIRPass(subCost: number): { table: number[][]; ops: string[] } {
  const rows = SOURCE.length + 1;
  const cols = TARGET.length + 1;
  const table = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const ops = new Array<string>(rows + cols).fill('');
  const interp = new IRInterpreter(editDistanceImperativeIR);

  interp.call('fill', [table as Value, SOURCE, TARGET, subCost]);
  const k = interp.call('backtrack', [table as Value, SOURCE, TARGET, subCost, ops as Value]);
  return { table, ops: ops.slice(0, k as number) };
}

describe('표와 고침 목록', () => {
  for (const sub of COSTS) {
    it(`교체 비용 ${sub} — 사양의 고침 목록과 글자 하나 다르지 않다`, async () => {
      const { events, metrics } = await record(sub);
      const fixes = payloadsOf<Fix>(events, 'fix-listed');
      const spec = SPEC[sub];

      expect(fixes.map((f) => code(f.op, f.from, f.to)).join(' ')).toBe(spec.list);
      expect(fixes.map((f) => f.index)).toEqual(fixes.map((_, i) => i));

      const verdict = payloadsOf<{
        subCost: number;
        cost: number;
        fixCount: number;
        replaceCount: number;
      }>(events, 'verdict')[0];
      expect(verdict).toEqual({
        subCost: sub,
        cost: spec.cost,
        fixCount: spec.fix,
        replaceCount: spec.rep,
      });

      // 메트릭은 판정과 같은 수를 말해야 한다 (C5).
      expect(metrics['cost-sum']).toBe(spec.cost);
      expect(metrics['fix-count']).toBe(spec.fix);
      expect(metrics['replace-count']).toBe(spec.rep);
    });
  }

  it('손잡이가 실제로 답을 가른다 — 세 목록이 다 같지 않다', async () => {
    const lists: string[] = [];
    for (const sub of COSTS) {
      const { events } = await record(sub);
      lists.push(payloadsOf<Fix>(events, 'fix-listed').map((f) => code(f.op, f.from, f.to)).join(' '));
    }
    expect(new Set(lists).size).toBe(3);
    // 비용 2 에서 이미 갈리고, 3 에서는 바꿈이 하나도 남지 않는다.
    expect(lists[0]).not.toBe(lists[1]);
    expect(lists[1]).not.toBe(lists[2]);
  });

  it('되짚은 길의 값이 표의 마지막 칸과 같다', () => {
    for (const sub of COSTS) {
      const table = fillEditTable(SOURCE, TARGET, sub);
      const steps = backtrackEdits(table, SOURCE, TARGET, sub);
      const paid = steps.reduce(
        (acc: number, s: EditStep) =>
          acc + (s.op === 'keep' ? 0 : s.op === 'replace' ? sub : 1),
        0,
      );
      expect(paid).toBe(table[SOURCE.length][TARGET.length]);
    }
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await record(1);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('IR 과 화면이 같은 답을 낸다', () => {
  for (const sub of COSTS) {
    it(`교체 비용 ${sub} — 표도 고침 목록도 알고리즘의 것과 같다`, async () => {
      const { events } = await record(sub);
      const fromIR = runIRPass(sub);

      // 표 전체. 화면이 받은 칸 값과 IR 이 셈한 칸 값이 하나도 어긋나지 않는다.
      expect(tableFromEvents(events)).toEqual(fromIR.table);
      expect(fromIR.table).toEqual(fillEditTable(SOURCE, TARGET, sub));

      // 되짚은 길. path-step 은 거꾸로 나가므로 뒤집어야 읽는 차례가 된다.
      const walked = payloadsOf<{ op: string }>(events, 'path-step')
        .map((p) => p.op)
        .reverse();
      expect(walked).toEqual(fromIR.ops);

      // 그중 손질만 남긴 것이 고침 목록이다.
      const fixes = payloadsOf<Fix>(events, 'fix-listed').map((f) => f.op);
      expect(fixes).toEqual(fromIR.ops.filter((op) => op !== 'keep'));
    });
  }
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await record(1);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(editDistanceImperativeIR)].sort());
    expect([...emitted].sort()).toEqual(PHASES);
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 다섯이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(editDistanceImperativeIR);
      expect(res.lines.length).toBeGreaterThan(20);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);
    },
  );

  it('java 는 글자를 charAt 으로 짚는다 — 대괄호로는 컴파일되지 않는다', () => {
    const all = javaTranspiler.transpile(editDistanceImperativeIR).lines.map((l) => l.code).join('\n');
    expect(all).toContain('a.charAt(i - 1) == b.charAt(j - 1)');
    expect(all).toContain('int[][] table');
    expect(all).toContain('String[] ops');
  });

  it('2차원 첨자와 고침 이름이 그대로 나온다', () => {
    const all = pythonTranspiler.transpile(editDistanceImperativeIR).lines.map((l) => l.code).join('\n');
    expect(all).toContain('table[i - 1][j - 1]');
    expect(all).toContain('ops[k] = "replace"');
    expect(all).toContain('min(');
  });
});

describe('화면까지 이어 본다', () => {
  it('캔버스가 남고 세로가 그대로이며 고침 여덟 줄이 판 안에 든다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(editDistanceStageView, container, {
      config: {},
      locale: 'en',
      theme: 'light',
      initialData: editDistanceFacet.initialData,
    });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const viewBox = svg?.getAttribute('viewBox') ?? '';

    const phases: string[] = [];
    const views = {
      stage: stage as unknown as ProjectorViews[string],
      codePanel: {
        highlightPhase: (p: string | null) => {
          if (p !== null) phases.push(p);
        },
        clearHighlight: () => undefined,
      } as unknown as ProjectorViews[string],
    };
    const projector = editDistanceProjector(views, undefined);

    // 교체 비용 3 — 고침이 여덟으로 가장 많은 판이다.
    const { events } = await record(3);
    for (const event of events) await projector.onEvent(event);

    // 캔버스는 떨어져 나가지 않는다 (S-view).
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    // 세로는 마운트한 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(viewBox);
    // 코드 패널이 다섯 phase 를 모두 받았다 (C3 배선).
    expect([...new Set(phases)].sort()).toEqual(PHASES);

    const drawn = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    // 여덟 줄이 다 그려졌다 — 하나라도 판을 넘치면 여기서 준다.
    const rows = drawn.filter((s) => s.startsWith('insert ') || s.startsWith('delete '));
    expect(rows).toHaveLength(8);
    expect(rows[0]).toBe('insert e');
    // 마지막 캡션은 "이제 기다린다" 다.
    expect(
      drawn.some((s) => s.includes('Move the substitution cost to fix the same two words')),
    ).toBe(true);

    stage.destroy();
    expect(container.querySelectorAll('svg > g')).toHaveLength(0);
  }, 20_000);
});

describe('선언 (C4 · C5)', () => {
  it('facet 이 가리키는 IR 과 메트릭이 실제 이름과 맞는다', () => {
    const panel = editDistanceFacet.blocks.codePanel as { ir?: string };
    expect(panel.ir).toBe(`ir:${editDistanceImperativeIR.id}`);
    expect(editDistanceFacet.algorithm).toBe('module:editDistance');
    expect(editDistanceFacet.projector).toBe('module:editDistanceProjector');

    const controls = editDistanceFacet.blocks.controls as {
      metrics?: Array<{ name: string }>;
    };
    expect(controls.metrics?.map((m) => m.name)).toEqual([
      'cost-sum',
      'fix-count',
      'replace-count',
    ]);
  });
});
