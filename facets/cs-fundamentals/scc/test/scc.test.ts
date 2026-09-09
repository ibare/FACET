// @vitest-environment happy-dom
/**
 * scc 완결형 검사.
 *
 * 이 완제품이 완제품인 까닭 셋을 못박는다.
 *   1. IR 이 실제로 돈다 — 답이 다른 길로 셈한 것과 같은가.
 *   2. IR 하나가 여섯 언어로 갈린다 — 갈린 것이 말이 되는가.
 *   3. phase 어휘가 algorithm 과 irs 사이에서 어긋나지 않는가 (C3).
 * 여기에 화면과 메트릭의 실측을 더한다 — 상수를 박아 두고 셈한 척하지 않는다.
 */

import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, makeTranslator } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, IR, IRStmt } from '@ffacet/core/runtime';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';

import { scc, type SccData } from '../src/algorithm.js';
import { sccProjector } from '../src/projector.js';
import { sccTarjanIR } from '../src/irs.js';
import { sccFacet } from '../src/facet.js';
import { sccStageView } from '../src/scc-stage.js';
import { sccDescription } from '../src/description.js';

const adjacencyOf = (): number[][] => {
  const data = sccFacet.initialData as { adjacency?: number[][] };
  return (data.adjacency ?? []).map((row) => [...row]);
};

/** IR 을 한 번 돌리고 손댄 배열을 그대로 돌려준다. */
function runTarjanIR(adjacency: number[][]) {
  const n = adjacency.length;
  const zeros = (): number[] => new Array<number>(n).fill(0);
  const num = zeros();
  const low = zeros();
  const onstack = zeros();
  const stack = zeros();
  const comp = zeros();
  const nextNum = [0];
  const sp = [0];
  const groups = runIR(sccTarjanIR, 'scc', [
    adjacency,
    num,
    low,
    onstack,
    stack,
    comp,
    nextNum,
    sp,
  ]);
  return { groups, num, low, onstack, comp, nextNum, sp };
}

/**
 * 다른 길로 셈한 강한 연결 요소 — 정점 짝마다 서로 닿는지 직접 물어본다.
 * IR 과 나눠 가진 코드가 한 줄도 없어야 대조가 뜻이 있다.
 */
function componentsByReachability(adjacency: number[][]): number[][] {
  const n = adjacency.length;
  const reach = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => i === j),
  );
  for (let i = 0; i < n; i += 1) for (const j of adjacency[i] ?? []) reach[i][j] = true;
  for (let k = 0; k < n; k += 1)
    for (let i = 0; i < n; i += 1)
      for (let j = 0; j < n; j += 1) if (reach[i][k] && reach[k][j]) reach[i][j] = true;

  const seen = new Set<number>();
  const out: number[][] = [];
  for (let i = 0; i < n; i += 1) {
    if (seen.has(i)) continue;
    const group: number[] = [];
    for (let j = 0; j < n; j += 1) {
      if (reach[i][j] && reach[j][i]) {
        group.push(j);
        seen.add(j);
      }
    }
    out.push(group);
  }
  return out;
}

/** comp 배열(정점 → 뿌리)을 정렬된 무리 목록으로 편다. */
function groupsOfComp(comp: number[]): number[][] {
  const byRoot = new Map<number, number[]>();
  comp.forEach((root, v) => {
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(v);
    else byRoot.set(root, [v]);
  });
  return [...byRoot.values()]
    .map((g) => [...g].sort((a, b) => a - b))
    .sort((a, b) => a[0] - b[0]);
}

function collectIRPhases(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind !== 'comment' && s.phase) out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range' || s.kind === 'while') {
        walk(s.body);
      }
    }
  };
  for (const fn of ir.functions) walk(fn.body);
  return out;
}

type Recorded = { events: FacetRuntimeEvent[]; metrics: Map<string, number> };

/** 알고리즘을 끝까지 돌리며 이벤트와 메트릭을 받아 적는다. */
async function runAlgorithm(adjacency: number[][]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const ctx: FacetContext<SccData> = {
    data: { type: 'scc', adjacency },
    cancelled: false,
    async emit(event) {
      events.push(event);
    },
    metric(name, delta) {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
  };
  await scc(ctx);
  return { events, metrics };
}

const ALL_TRANSPILERS = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

describe('scc — IR 실행', () => {
  it('IR 이 찾은 무리가 상호 도달로 셈한 무리와 같다', () => {
    const adjacency = adjacencyOf();
    const { groups, comp } = runTarjanIR(adjacency);

    const byReach = componentsByReachability(adjacency)
      .map((g) => [...g].sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0]);

    expect(groupsOfComp(comp)).toEqual(byReach);
    expect(groups).toBe(byReach.length);
    // 사양의 대조 — 무리 셋, 크기 합은 정점 수.
    expect(byReach).toEqual([
      [0, 1, 4],
      [2, 3, 7],
      [5, 6],
    ]);
    expect(byReach.reduce((sum, g) => sum + g.length, 0)).toBe(adjacency.length);
  });

  it('순회를 마치면 스택이 비고 모든 자리에 번호가 매겨진다', () => {
    const adjacency = adjacencyOf();
    const { num, onstack, nextNum, sp } = runTarjanIR(adjacency);
    expect(sp[0]).toBe(0);
    expect(nextNum[0]).toBe(adjacency.length);
    expect(onstack.every((x) => x === 0)).toBe(true);
    expect([...num].sort((a, b) => a - b)).toEqual(
      adjacency.map((_, i) => i),
    );
  });

  it('되짚어 닿는 간선이 낮은값을 실제로 끌어내린다', () => {
    const adjacency = adjacencyOf();
    const { num, low } = runTarjanIR(adjacency);
    // low 가 자기 num 보다 작아진 자리가 있어야 이 알고리즘이 일을 한 것이다.
    const lowered = num.filter((_, v) => low[v] < num[v]);
    expect(lowered.length).toBeGreaterThan(0);
    // 뿌리는 셋뿐이고 그 수가 곧 무리의 수다.
    expect(num.filter((_, v) => low[v] === num[v]).length).toBe(3);
  });
});

describe('scc — 여섯 언어', () => {
  it('여섯 언어 모두 undefined 없이 나오고 두 갈래가 그대로 보인다', () => {
    for (const transpiler of ALL_TRANSPILERS) {
      const { lines } = transpiler.transpile(sccTarjanIR);
      const code = lines.map((l) => l.code).join('\n');
      expect(code, transpiler.id).not.toContain('undefined');
      expect(lines.length, transpiler.id).toBeGreaterThan(35);
      // 이 알고리즘에서 가장 자주 틀리는 자리 — 감싸지 않고 펼쳐 두었다.
      expect(code, transpiler.id).toContain('low[u] = low[v]');
      expect(code, transpiler.id).toContain('low[u] = num[v]');
      // `onstack` 가드도 코드에 있어야 한다. 이 그래프에서는 그것을 지워도 답이
      // 같아서 값을 보는 검사로는 영영 안 걸린다 — 코드를 보는 검사만 잡는다.
      expect(code, transpiler.id).toContain('onstack[v]');
      // 재귀가 함께 쓰는 값은 한 칸짜리 배열에 담아 돌린다.
      expect(code, transpiler.id).toContain('nextNum[0]');
      expect(code, transpiler.id).toContain('sp[0]');
      // 무리를 꺼내는 while 도 펼쳐 두었다.
      expect(code, transpiler.id).toContain('comp[w] = u');
    }
  });

  it('C++ 은 함수가 둘이라 전방 선언이 먼저 나온다', () => {
    const { lines } = cppTranspiler.transpile(sccTarjanIR);
    const code = lines.map((l) => l.code);
    const declIndex = code.findIndex((l) => l.startsWith('void tarjan(') && l.endsWith(';'));
    const defIndex = code.findIndex((l) => l.startsWith('void tarjan(') && l.endsWith('{'));
    expect(declIndex).toBeGreaterThanOrEqual(0);
    expect(defIndex).toBeGreaterThan(declIndex);
  });

  it('transpile 은 IR 을 건드리지 않는다 — 두 번 불러도 같다', () => {
    const before = JSON.stringify(sccTarjanIR);
    const first = pythonTranspiler.transpile(sccTarjanIR).lines.map((l) => l.code);
    const second = pythonTranspiler.transpile(sccTarjanIR).lines.map((l) => l.code);
    expect(second).toEqual(first);
    expect(JSON.stringify(sccTarjanIR)).toBe(before);
  });
});

describe('scc — phase 어휘 (C3)', () => {
  it('algorithm 이 보내는 phase 집합과 irs 의 phase 집합이 같다', async () => {
    const { events } = await runAlgorithm(adjacencyOf());
    const fromAlgorithm = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase?: string }).phase)
        .filter((p): p is string => typeof p === 'string'),
    );
    const fromIR = collectIRPhases(sccTarjanIR);

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    // 어느 쪽이든 비어 있으면 위 등치가 공짜로 통과한다.
    expect(fromIR.size).toBeGreaterThan(8);
  });

  it('phase 이벤트는 모두 silent 이고, 그 밖의 이벤트는 아니다', async () => {
    const { events } = await runAlgorithm(adjacencyOf());
    for (const e of events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
      else expect(e.silent).toBeUndefined();
    }
  });

  it('코드 패널의 모든 줄 phase 가 알고리즘 어휘 안에 있다', async () => {
    const { events } = await runAlgorithm(adjacencyOf());
    const fromAlgorithm = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase?: string }).phase),
    );
    for (const transpiler of ALL_TRANSPILERS) {
      for (const line of transpiler.transpile(sccTarjanIR).lines) {
        if (line.phase === null) continue;
        expect(fromAlgorithm.has(line.phase), `${transpiler.id}: ${line.phase}`).toBe(true);
      }
    }
  });
});

describe('scc — 알고리즘 실측', () => {
  it('메트릭은 facet.ts 가 선언한 이름뿐이고 값은 IR 결과와 맞는다 (C5)', async () => {
    const adjacency = adjacencyOf();
    const { metrics } = await runAlgorithm(adjacency);
    const controls = sccFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = new Set((controls.metrics ?? []).map((m) => m.name));
    for (const name of metrics.keys()) expect(declared.has(name)).toBe(true);

    const { groups } = runTarjanIR(adjacency);
    expect(metrics.get('visit-count')).toBe(adjacency.length);
    expect(metrics.get('group-count')).toBe(groups);
    // 되짚어 닿는 간선은 실제로 넷이다 (3→2 · 7→3 · 5→6 · 4→0).
    expect(metrics.get('back-edge-count')).toBe(4);
  });

  it('꺼낸 정점은 정확히 한 번씩이고 무리 나눔이 IR 과 같다', async () => {
    const adjacency = adjacencyOf();
    const { events } = await runAlgorithm(adjacency);
    const byGroup = new Map<number, number[]>();
    for (const e of events) {
      if (e.type !== 'stack-pop') continue;
      const p = e.payload as { groupIndex: number };
      const v = Number(String(e.target).slice('node:'.length));
      const bucket = byGroup.get(p.groupIndex);
      if (bucket) bucket.push(v);
      else byGroup.set(p.groupIndex, [v]);
    }
    const popped = [...byGroup.values()]
      .map((g) => [...g].sort((a, b) => a - b))
      .sort((a, b) => a[0] - b[0]);
    expect(popped).toEqual(groupsOfComp(runTarjanIR(adjacency).comp));
    expect(popped.flat().length).toBe(adjacency.length);
  });

  it('group-closed 가 알린 식구가 그 뒤 꺼내지는 정점과 같다', async () => {
    const { events } = await runAlgorithm(adjacencyOf());
    let announced: number[] | null = null;
    let taken: number[] = [];
    let checked = 0;
    for (const e of events) {
      if (e.type === 'group-closed') {
        if (announced) {
          expect([...taken].sort()).toEqual([...announced].sort());
          checked += 1;
        }
        announced = (e.payload as { members: number[] }).members;
        taken = [];
      } else if (e.type === 'stack-pop') {
        taken.push(Number(String(e.target).slice('node:'.length)));
      }
    }
    if (announced) {
      expect([...taken].sort()).toEqual([...announced].sort());
      checked += 1;
    }
    expect(checked).toBe(3);
  });
});

describe('scc — stage', () => {
  it('마운트한 캔버스가 남고 viewBox 는 재생 내내 바뀌지 않는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(sccStageView, container, {
      config: { type: 'scc-stage' },
      t: makeTranslator('en', sccFacet.messages),
    });

    const canvas = container.querySelector('svg');
    expect(canvas).not.toBeNull();
    const viewBoxBefore = canvas?.getAttribute('viewBox');

    const projector = sccProjector({ stage }, { getSpeed: () => 1, t: makeTranslator('en', sccFacet.messages) });
    projector.onInit?.(sccFacet.initialData);

    const visibleChips = (): number =>
      [...(canvas?.querySelectorAll('g') ?? [])].filter(
        (g) => g.getAttribute('visibility') === 'visible',
      ).length;

    const { events } = await runAlgorithm(adjacencyOf());
    let deepest = 0;
    for (const e of events) {
      await projector.onEvent(e);
      deepest = Math.max(deepest, visibleChips());
      expect(canvas?.getAttribute('viewBox')).toBe(viewBoxBefore);
    }

    // 정점 여덟이 그려진다.
    expect(canvas?.querySelectorAll('circle').length).toBeGreaterThanOrEqual(8);
    // 스택은 실제로 쌓였다가 (0 이 아니다) 마지막에는 다 빈다.
    expect(deepest).toBeGreaterThan(1);
    expect(visibleChips()).toBe(0);
    // 무리 셋의 칸과 정점 여덟의 자리가 오른쪽에 남는다.
    expect(canvas?.querySelectorAll('rect').length).toBe(adjacencyOf().length + 3);

    stage.destroy();
    expect(container.querySelector('g')).toBeNull();
    container.remove();
  });

  it('그려진 좌표가 모두 유한하고 화면 안에 있다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(sccStageView, container, { config: { type: 'scc-stage' } });
    const projector = sccProjector({ stage }, { getSpeed: () => 1, t: makeTranslator('en') });
    projector.onInit?.(sccFacet.initialData);
    const { events } = await runAlgorithm(adjacencyOf());
    for (const e of events) await projector.onEvent(e);

    const canvas = container.querySelector('svg');
    const [, , boxW, boxH] = (canvas?.getAttribute('viewBox') ?? '0 0 0 0').split(' ').map(Number);
    expect(boxW).toBeGreaterThan(0);

    let counted = 0;
    for (const node of canvas?.querySelectorAll('*') ?? []) {
      const numbers = ['cx', 'cy', 'x', 'y', 'width', 'height']
        .map((name) => node.getAttribute(name))
        .filter((val): val is string => val !== null)
        .map(Number);
      for (const value of numbers) {
        expect(Number.isFinite(value)).toBe(true);
        counted += 1;
      }
      for (const path of ['d', 'points']) {
        const raw = node.getAttribute(path);
        if (raw === null) continue;
        for (const token of raw.split(/[\s,]+/)) {
          if (token === '' || /^[A-Za-z]$/.test(token)) continue;
          expect(Number.isFinite(Number(token)), `${path}="${raw}"`).toBe(true);
          counted += 1;
        }
      }
      const x = Number(node.getAttribute('cx') ?? node.getAttribute('x') ?? NaN);
      const y = Number(node.getAttribute('cy') ?? node.getAttribute('y') ?? NaN);
      if (Number.isFinite(x)) expect(x >= 0 && x <= boxW).toBe(true);
      if (Number.isFinite(y)) expect(y >= 0 && y <= boxH).toBe(true);
    }
    // 셀 수 있는 좌표가 실제로 많아야 이 검사가 무언가를 잰 것이다.
    expect(counted).toBeGreaterThan(200);

    stage.destroy();
    container.remove();
  });

  it('캡션은 저작자 문안에서 오고 코드에 문자열이 박혀 있지 않다 (C10)', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('ko', sccFacet.messages);
    const stage = mountView(sccStageView, container, { config: { type: 'scc-stage' }, t });
    const projector = sccProjector({ stage }, { getSpeed: () => 1, t });
    projector.onInit?.(sccFacet.initialData);

    const texts = [...(container.querySelectorAll('text') ?? [])].map((el) => el.textContent);
    expect(texts.some((s) => s?.includes('정점은 8'))).toBe(true);

    stage.destroy();
    container.remove();
  });
});

describe('글이 지키는 것', () => {
  /**
   * 이 facet 의 근거는 "이 그래프에서는 두 실수가 같은 답을 낸다" 는 사실이다.
   * 그 문장이 글에서 조용히 사라지면 코드 패널을 다는 까닭도 함께 사라진다.
   */
  it('두 실수가 같은 답을 낸다는 대목이 글에 남아 있다', () => {
    expect(sccDescription).toContain('답이 맞아 버려서 살아남는 실수');
    expect(sccDescription).toContain('onstack');
    expect(sccDescription).toContain('답이 맞는 것과 코드가 맞는 것은 다르다');
  });
});
