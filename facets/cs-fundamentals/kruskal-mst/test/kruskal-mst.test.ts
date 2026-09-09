/**
 * 크루스칼 완제품의 검사.
 *
 * 재는 것은 셋이다.
 *  1. IR 을 실제로 돌려 답이 나오는가 (`runIR`). 완제품의 존재 이유가 IR 이므로
 *     이것이 첫 검사다. 정의 없는 이름을 부르면 여기서 바로 멈춘다.
 *  2. 여섯 언어로 나오는가. `undefined` 가 섞이거나 C++ 전방 선언이 빠지면 잡는다.
 *  3. `algorithm.ts` 가 보내는 phase 집합과 IR 의 phase 집합이 같은가 (C3).
 *
 * 곁들여 알고리즘 자체를 끝까지 굴려 화면에 뜰 수(집은 간선 수 · 무게 합)가
 * 셈해진 값인지 본다 — 대조값을 상수로 박아 두고 셈한 척하지 않기 위함이다.
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
import type { FacetContext, FacetRuntimeEvent, IRStmt } from '@ffacet/core';

import { kruskalMstAlgorithm, type KruskalMstData } from '../src/algorithm.js';
import { kruskalUnionIR } from '../src/irs.js';
import { kruskalMstFacet } from '../src/facet.js';
import { runFacet, clearRegistry } from '@ffacet/core/runtime';
import { registerKruskalMst } from '../src/index.js';

const DATA = kruskalMstFacet.initialData as unknown as KruskalMstData;

/** IR 진입점의 인자 — 간선을 세 배열로 펴고, `parent` 자리를 만들어 준다. */
function irArgs(): { u: number[]; v: number[]; w: number[]; parent: number[] } {
  return {
    u: DATA.edges.map((e) => e.u),
    v: DATA.edges.map((e) => e.v),
    w: DATA.edges.map((e) => e.w),
    parent: Array.from({ length: DATA.vertexCount }, () => 0),
  };
}

/** IR 트리를 훑어 phase 문자열을 모은다. */
function phasesOfIR(): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      }
      if (s.kind === 'for-range' || s.kind === 'while') walk(s.body);
    }
  };
  for (const fn of kruskalUnionIR.functions) walk(fn.body);
  return out;
}

/** 알고리즘을 끝까지 굴리고 이벤트와 메트릭을 그대로 모은다. */
async function runAlgorithm(): Promise<{
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
}> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const ctx: FacetContext<KruskalMstData> = {
    data: JSON.parse(JSON.stringify(DATA)) as KruskalMstData,
    emit: async (e) => {
      events.push(e);
    },
    metric: (name, delta) => {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    cancelled: false,
  };
  await kruskalMstAlgorithm(ctx);
  return { events, metrics };
}

describe('크루스칼 IR', () => {
  it('runIR 이 최소 신장 트리의 무게 합을 낸다', () => {
    const a = irArgs();
    const total = runIR(kruskalUnionIR, 'kruskal', [a.u, a.v, a.w, a.parent]);
    expect(total).toBe(39);
  });

  it('IR 이 간선을 무게 순으로 줄 세운다 — 같은 무게는 적힌 차례를 지킨다', () => {
    const a = irArgs();
    runIR(kruskalUnionIR, 'kruskal', [a.u, a.v, a.w, a.parent]);
    expect(a.w).toEqual([...a.w].sort((x, y) => x - y));
    // 무게 5 둘은 적힌 차례대로 2–4 가 0–3 보다 앞이고, 무게 8 둘은 1–2 가 4–5 보다 앞이다.
    const lined = a.u.map((u, i) => `${u}-${a.v[i]}(${a.w[i]})`);
    expect(lined.slice(0, 2)).toEqual(['2-4(5)', '0-3(5)']);
    expect(lined.slice(5, 7)).toEqual(['1-2(8)', '4-5(8)']);
  });

  it('IR 의 find 는 뿌리를 되돌리고, unite 는 뿌리 하나를 다른 뿌리에 매단다', () => {
    const parent = [0, 1, 2, 3];
    expect(runIR(kruskalUnionIR, 'find', [parent, 2])).toBe(2);
    runIR(kruskalUnionIR, 'unite', [parent, 2, 3]);
    runIR(kruskalUnionIR, 'unite', [parent, 0, 2]);
    expect(parent).toEqual([2, 1, 3, 3]);
    // 0 → 2 → 3. 두 칸을 올라가야 뿌리다.
    expect(runIR(kruskalUnionIR, 'find', [parent, 0])).toBe(3);
  });

  it('여섯 언어로 나온다', () => {
    const all = [
      pythonTranspiler,
      javascriptTranspiler,
      typescriptTranspiler,
      javaTranspiler,
      cppTranspiler,
      csharpTranspiler,
    ];
    for (const t of all) {
      const { lines } = t.transpile(kruskalUnionIR);
      const src = lines.map((l) => l.code).join('\n');
      expect(lines.length).toBeGreaterThan(25);
      expect(src).not.toContain('undefined');
      expect(src).not.toContain('NaN');
      // 세 함수가 모두 나온다.
      expect(src).toContain('kruskal');
      expect(src).toContain('find');
      expect(src).toContain('unite');
      // 정렬을 감싸지 않았으므로 맞바꾸는 줄이 코드에 남아 있다.
      expect(src).toContain('weight');
    }
    // C++ 은 함수가 여럿이라 전방 선언이 먼저 나온다.
    const cpp = cppTranspiler.transpile(kruskalUnionIR).lines.map((l) => l.code);
    expect(cpp.some((l) => l.trim() === 'int unite(std::vector<int>& parent, int ra, int rb);')).toBe(true);
    expect(cpp.indexOf('int find(std::vector<int>& parent, int x);')).toBeLessThan(
      cpp.indexOf('int find(std::vector<int>& parent, int x) {'),
    );
  });
});

describe('크루스칼 알고리즘', () => {
  it('phase 어휘가 IR 과 글자까지 같다 (C3)', async () => {
    const { events } = await runAlgorithm();
    const emitted = new Set<string>();
    for (const e of events) {
      if (e.type !== 'phase') continue;
      const p = (e.payload as { phase?: unknown } | undefined)?.phase;
      if (typeof p === 'string') emitted.add(p);
    }
    expect([...emitted].sort()).toEqual([...phasesOfIR()].sort());
    expect(emitted.size).toBe(11);
  });

  it('phase 이벤트는 걸음의 경계가 아니다 (silent)', async () => {
    const { events } = await runAlgorithm();
    for (const e of events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
      else expect(e.silent).toBeUndefined();
    }
  });

  it('여섯을 잇고 다섯을 버린다 — 무게 합 39', async () => {
    const { events, metrics } = await runAlgorithm();
    const linked = events.filter((e) => e.type === 'edge-linked');
    const dropped = events.filter((e) => e.type === 'edge-dropped');
    expect(linked).toHaveLength(6);
    expect(dropped).toHaveLength(5);
    expect(metrics['pick-count']).toBe(6);
    expect(metrics['drop-count']).toBe(5);
    expect(metrics['weight-sum']).toBe(39);

    const done = events.at(-1);
    expect(done?.type).toBe('done');
    expect(done?.payload).toEqual({ picked: 6, dropped: 5, total: 39 });
  });

  it('화면에 뜨는 메트릭은 facet.ts 가 선언한 이름뿐이다 (C5)', async () => {
    const { metrics } = await runAlgorithm();
    const bar = kruskalMstFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = new Set((bar.metrics ?? []).map((m) => m.name));
    expect([...Object.keys(metrics)].every((n) => declared.has(n))).toBe(true);
  });

  it('마지막 무리 지도는 정점 일곱이 한 뿌리로 모인 것이다', async () => {
    const { events } = await runAlgorithm();
    const last = events.filter((e) => e.type === 'state-changed').at(-1);
    const roots = (last?.payload as { roots?: number[] } | undefined)?.roots ?? [];
    expect(roots).toHaveLength(7);
    expect(new Set(roots).size).toBe(1);
  });
});

describe('화면', () => {
  /**
   * 여기까지의 검사는 알고리즘과 IR 만 본다 — stage 오백여 줄이 한 번도
   * 마운트되지 않았다. 저장소의 전수 검사가 구조(캔버스 부착 · 세로 고정 ·
   * destroy)는 잡아 주지만 **화면에 뜬 수가 알고리즘이 셈한 수인지**는 재지
   * 않는다. 그 자리를 여기서 메운다.
   */
  it('끝난 화면에 무게 합이 뜬다', async () => {
    clearRegistry();
    registerKruskalMst();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const original = console.error;
    const errors: string[] = [];
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    };

    const handle = runFacet(kruskalMstFacet, container);
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

      // 찾는 값이 화면에 나타나는 것으로 끊으면 이르다 — 그 수가 마침 간선
      // 무게로도 떠 있으면 첫 프레임에 통과한다. 화면이 **멎을 때까지** 기다린다.
      let text = '';
      let quiet = 0;
      const started = Date.now();
      // 재생 중에도 화면이 잠깐 멎는 구간이 있어(정렬 걸음 사이) 멎음만으로는
      // 이르다. 찾는 것이 뜰 때까지는 멎어도 계속 기다린다.
      while (Date.now() - started < 90_000 && !(quiet >= 8 && text.includes('39'))) {
        await new Promise((r) => setTimeout(r, 500));
        const now = svg?.textContent ?? '';
        quiet = now === text ? quiet + 1 : 0;
        text = now;
      }

      // 무게 합·집은 수·버린 수가 모두 화면에 있다. 상수로 박지 않고 위 검사가
      // 이벤트에서 걷은 것과 같은 값이다.
      expect(text).toContain('39');
      expect(text).not.toBe(beforeText);
      expect(svg?.getAttribute('viewBox')).toBe(box);
      expect(errors).toEqual([]);
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  }, 90_000);
});
