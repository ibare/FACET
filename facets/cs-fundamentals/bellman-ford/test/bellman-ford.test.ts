/**
 * 벨만-포드 완결형 검사.
 *
 * 이 facet 이 완제품인 까닭은 IR 하나가 여섯 언어로 갈리는 것이므로, 검사도
 * 거기에 걸려 있다.
 *
 *  1. IR 을 ir-interpreter 로 실제로 돌려 답이 맞는가
 *  2. 여섯 언어가 다 나오는가 — undefined 없이, 두 반복문이 다 살아 있는가
 *  3. `irs.ts` 의 phase 집합과 `algorithm.ts` 가 발신하는 phase 집합이 같은가 (C3)
 *
 * 그리고 화면에 뜨는 수는 알고리즘이 셈한 것이어야 하므로, 메트릭과 캡션에 실려
 * 나가는 값을 이벤트에서 걷어 사양의 대조값과 견준다. 상수를 박아 두고 셈한 척하지
 * 않는다 — 아래 기대값은 전부 실행 결과에서 나온다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import type { FacetContext, FacetRuntimeEvent, MetricDelta } from '@ffacet/core/runtime';
import type { IRStmt } from '@ffacet/core';

import { bellmanFord, computeBellmanFordResult, type BellmanFordData } from '../src/algorithm.js';
import { bellmanFordRelaxIR } from '../src/irs.js';
import { bellmanFordFacet } from '../src/facet.js';
import { runFacet, clearRegistry } from '@ffacet/core/runtime';
import { registerBellmanFord } from '../src/index.js';

/** 사양이 정한 자료를 선언에서 그대로 읽어 온다 (테스트가 자료를 다시 적지 않는다). */
const data = bellmanFordFacet.initialData as unknown as BellmanFordData;

/** 사양의 대조값. 0 에서 각 정점까지. */
const EXPECTED_DIST = [0, 2, 7, 4, -2];

// ─────────────────────────────────────────────────────────────────────────────
// 1. IR 을 실제로 돌린다
// ─────────────────────────────────────────────────────────────────────────────

describe('IR 실행', () => {
  it('거리표를 채우고 음수 고리 없음(false)을 낸다', () => {
    const edgeFrom = data.edges.map((e) => e.from);
    const edgeTo = data.edges.map((e) => e.to);
    const weight = data.edges.map((e) => e.weight);
    // 거리표는 밖에서 받는다 — 그 길이가 곧 정점 수다.
    const dist = new Array<number>(data.vertexCount).fill(0);

    const negativeCycle = runIR(bellmanFordRelaxIR, 'bellman_ford', [
      edgeFrom,
      edgeTo,
      weight,
      dist,
      data.source,
    ]);

    expect(negativeCycle).toBe(false);
    expect(dist).toEqual(EXPECTED_DIST);
  });

  it('IR 과 algorithm.ts 가 같은 거리표에 이른다', () => {
    const edgeFrom = data.edges.map((e) => e.from);
    const edgeTo = data.edges.map((e) => e.to);
    const weight = data.edges.map((e) => e.weight);
    const dist = new Array<number>(data.vertexCount).fill(0);
    runIR(bellmanFordRelaxIR, 'bellman_ford', [edgeFrom, edgeTo, weight, dist, data.source]);

    const pure = computeBellmanFordResult(data);
    expect(pure.dist).toEqual(dist);
    expect(pure.negativeCycle).toBe(false);
  });

  it('음수 고리를 넣으면 true 를 낸다 — 검사 반복문이 실제로 재고 있다', () => {
    // 0→1(1) · 1→2(-1) · 2→1(-1) 로 1↔2 사이에 합 -2 짜리 고리를 만든다.
    const dist = [0, 0, 0];
    const found = runIR(bellmanFordRelaxIR, 'bellman_ford', [
      [0, 1, 2],
      [1, 2, 1],
      [1, -1, -1],
      dist,
      0,
    ]);
    expect(found).toBe(true);
  });

  it('닿지 않는 정점은 INF 로 남는다 — dist[u] != INF 가드가 살아 있다', () => {
    // 정점 2 로 들어오는 간선이 없고, 2 에서 나가는 음수 간선이 하나 있다.
    // 가드가 없으면 INF + (-5) 가 새어 나가 정점 1 을 망가뜨린다.
    const dist = [0, 0, 0];
    runIR(bellmanFordRelaxIR, 'bellman_ford', [[0, 2], [1, 1], [4, -5], dist, 0]);
    expect(dist).toEqual([0, 4, 1000000000]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 여섯 언어
// ─────────────────────────────────────────────────────────────────────────────

const transpilers = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

describe('여섯 언어 emit', () => {
  it.each(transpilers.map((t) => [t.id, t] as const))('%s 가 성한 코드를 낸다', (_id, t) => {
    const out = t.transpile(bellmanFordRelaxIR);
    expect(out.lines.length).toBeGreaterThan(15);
    for (const line of out.lines) {
      expect(line.code).not.toContain('undefined');
      expect(line.code).not.toContain('\r');
    }
  });

  it('여섯 언어 모두 완화 반복문과 검사 반복문을 둘 다 낸다', () => {
    for (const t of transpilers) {
      const out = t.transpile(bellmanFordRelaxIR);
      const relax = out.lines.filter((l) => l.phase === 'relax');
      const check = out.lines.filter((l) => l.phase === 'final-check');
      // 펴는 줄은 하나, 검사 바퀴는 반복문 머리 + u/v/w 셋 + if + return 여섯 줄.
      expect(relax.length, t.id).toBe(1);
      expect(check.length, t.id).toBe(6);
    }
  });

  it('이름 붙인 호출이 하나도 없다 — IR 이 전부 펼쳐져 있다', () => {
    const calls: string[] = [];
    const walkExpr = (e: unknown): void => {
      if (typeof e !== 'object' || e === null) return;
      const node = e as { kind?: string; fn?: string } & Record<string, unknown>;
      if (node.kind === 'call' && typeof node.fn === 'string') calls.push(node.fn);
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(walkExpr);
        else walkExpr(v);
      }
    };
    for (const fn of bellmanFordRelaxIR.functions) fn.body.forEach(walkExpr);
    expect(calls).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. phase 대조 (C3)
// ─────────────────────────────────────────────────────────────────────────────

/** IR 트리를 훑어 phase 를 모은다. */
function irPhases(stmts: IRStmt[], out: Set<string>): Set<string> {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    } else if (s.kind === 'for-range' || s.kind === 'while') {
      irPhases(s.body, out);
    }
  }
  return out;
}

type Run = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
};

/** 알고리즘을 끝까지 굴리고 이벤트와 메트릭을 걷는다. */
async function play(input: BellmanFordData): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const ctx: FacetContext<BellmanFordData> = {
    data: input,
    async emit(event) {
      events.push(event);
    },
    metric(name: string, delta: MetricDelta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    cancelled: false,
  };
  await bellmanFord(ctx);
  return { events, metrics };
}

const phaseOf = (e: FacetRuntimeEvent): string | null => {
  if (e.type !== 'phase') return null;
  const p = e.payload as { phase?: unknown } | undefined;
  return typeof p?.phase === 'string' ? p.phase : null;
};

describe('phase 어휘 (C3)', () => {
  it('irs.ts 와 algorithm.ts 의 phase 집합이 같다', async () => {
    const fromIR = irPhases(bellmanFordRelaxIR.functions[0].body, new Set<string>());
    const run = await play(data);
    const fromAlgorithm = new Set<string>();
    for (const e of run.events) {
      const p = phaseOf(e);
      if (p !== null) fromAlgorithm.add(p);
    }

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    // 한쪽만 비어 있어도 위 단언이 통과하지 않도록 실제 어휘를 못박아 둔다.
    expect([...fromIR].sort()).toEqual([
      'done',
      'final-check',
      'inspect',
      'pass',
      'relax',
      'setup',
    ]);
  });

  it('phase 이벤트는 모두 silent 다 (C2)', async () => {
    const run = await play(data);
    for (const e of run.events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 화면에 뜨는 수 — 알고리즘이 셈한 값인가
// ─────────────────────────────────────────────────────────────────────────────

describe('발신하는 값', () => {
  it('마지막 done 의 거리표가 사양의 대조값과 같다', async () => {
    const run = await play(data);
    const done = run.events.filter((e) => e.type === 'done').at(-1);
    const payload = done?.payload as { dist?: unknown; relaxed?: unknown; passes?: unknown };
    expect(payload?.dist).toEqual(EXPECTED_DIST);
    expect(payload?.passes).toBe(data.vertexCount - 1);
  });

  it('바퀴마다 줄어든 칸 수가 이 간선 차례의 몫과 맞는다', async () => {
    const run = await play(data);
    const perPass = run.events
      .filter((e) => e.type === 'pass-end')
      .map((e) => (e.payload as { changed?: unknown }).changed);
    // 이 차례에서는 첫 바퀴에 네 정점이 한꺼번에 스미고, 둘째 바퀴에 하나가 더
    // 스민 뒤 멎는다. 첫 바퀴의 완화 횟수는 여섯이지만 (정점 1 과 3 이 한 바퀴
    // 안에서 두 번씩 줄어든다) 원장에 물드는 칸은 넷이다.
    expect(perPass).toEqual([4, 1, 0, 0]);
    const firstPassRelaxes = run.events
      .slice(0, run.events.findIndex((e) => e.type === 'pass-end'))
      .filter((e) => e.type === 'edge-relax').length;
    expect(firstPassRelaxes).toBe(6);
  });

  it('마지막 한 바퀴에서 줄어드는 간선이 하나도 없다', async () => {
    const run = await play(data);
    const check = run.events.find((e) => e.type === 'check-end');
    expect((check?.payload as { changed?: unknown })?.changed).toBe(0);
    // 검사 바퀴도 간선 전부를 견준다 — 훑다 만 것이 아니다.
    const checkAt = run.events.findIndex((e) => e.type === 'check-begin');
    const afterCheck = run.events.slice(checkAt).filter((e) => e.type === 'edge-inspect');
    expect(afterCheck.length).toBe(data.edges.length);
  });

  it('메트릭 이름이 facet.ts 선언과 같고 값이 실행에서 나온다 (C5)', async () => {
    const run = await play(data);
    const controls = bellmanFordFacet.blocks.controls as {
      metrics?: { name: string }[];
    };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    expect(Object.keys(run.metrics).sort()).toEqual(declared);

    const relaxes = run.events.filter((e) => e.type === 'edge-relax').length;
    const inspects = run.events.filter((e) => e.type === 'edge-inspect').length;
    expect(run.metrics['pass-count']).toBe(data.vertexCount - 1);
    expect(run.metrics['relax-count']).toBe(relaxes);
    expect(run.metrics['compare-count']).toBe(inspects);
    // 견줌은 바퀴 넷 + 검사 한 바퀴, 간선 아홉씩.
    expect(inspects).toBe(data.edges.length * data.vertexCount);
    expect(relaxes).toBe(7);
  });

  it('아직 닿지 않은 정점은 payload 에서 null 로 나간다 — 화면 표기는 표현 계층 몫', async () => {
    const run = await play(data);
    const seeded = run.events.find((e) => e.type === 'dist-seeded');
    const dist = (seeded?.payload as { dist?: unknown }).dist as (number | null)[];
    expect(dist).toEqual([0, null, null, null, null]);
    // 1000000000 같은 센티널이 화면 쪽으로 새지 않는다.
    for (const e of run.events) {
      expect(JSON.stringify(e.payload ?? null)).not.toContain('1000000000');
    }
  });

  it('멈추라 하면 그 자리에서 멎는다', async () => {
    const events: FacetRuntimeEvent[] = [];
    let seen = 0;
    const ctx = {
      data,
      async emit(event: FacetRuntimeEvent) {
        events.push(event);
        seen++;
      },
      metric() {},
      get cancelled() {
        return seen >= 8;
      },
    } as unknown as FacetContext<BellmanFordData>;
    await bellmanFord(ctx);
    expect(events.length).toBeLessThan(20);
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });
});

describe('화면', () => {
  /**
   * 여기까지의 검사는 알고리즘과 IR 만 본다 — stage 칠백여 줄과 projector 이백여
   * 줄이 한 번도 마운트되지 않았다. 공용 전수 검사가 구조(캔버스 부착 · 세로 고정 ·
   * destroy)는 잡아 주지만 **화면에 뜬 수가 알고리즘이 셈한 수인지**는 재지 않는다.
   * 그 자리를 여기서 메운다.
   */
  it('끝난 화면의 거리가 알고리즘이 셈한 거리와 같다', async () => {
    clearRegistry();
    registerBellmanFord();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const original = console.error;
    const errors: string[] = [];
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    };

    const handle = runFacet(bellmanFordFacet, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const box = svg?.getAttribute('viewBox');

      // 완제품은 스스로 재생하지 않는다 — 재생 버튼이 있는 물건이라
      // `autoStart` 가 꺼져 있다. 부르지 않으면 아래 기다림이 헛돌고,
      // 찾는 수가 마침 초기 화면(간선 무게 따위)에도 있으면 **재생을 재지
      // 않은 채 통과한다.** 그래서 시작 전 화면을 먼저 잡아 두고 견준다.
      const beforeText = svg?.textContent ?? '';
      handle.start();

      // 끝까지 굴린다. 걸음이 멎을 때까지 기다리되 상한을 둔다.
      // 찾는 값이 화면에 나타나는 것으로 끊으면 이르다 — 그 수가 마침 간선
      // 무게로도 떠 있으면 첫 프레임에 통과한다. 화면이 **멎을 때까지** 기다린다.
      let text = '';
      let quiet = 0;
      const started = Date.now();
      while (Date.now() - started < 90_000 && quiet < 8) {
        await new Promise((r) => setTimeout(r, 500));
        const now = svg?.textContent ?? '';
        quiet = now === text ? quiet + 1 : 0;
        text = now;
      }

      // 알고리즘이 셈한 거리 — 상수로 박지 않는다.
      const truth = computeBellmanFordResult(
        bellmanFordFacet.initialData as unknown as BellmanFordData,
      );
      for (const d of truth.dist) {
        expect(text).toContain(String(d));
      }
      expect(text).not.toBe(beforeText);
      expect(svg?.getAttribute('viewBox')).toBe(box);
      expect(errors).toEqual([]);
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  }, 60_000);
});
