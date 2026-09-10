// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
  ReactiveInputEvent,
  View,
  ViewInstance,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  mountView,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import {
  dbscan,
  dbscanFacet,
  dbscanIR,
  dbscanProjector,
  dbscanStageView,
  registerDbscan,
  type DbscanData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const EPS_OPTIONS = [1.0, 1.3, 1.9, 2.4, 3.0];
const MIN_PTS_OPTIONS = [2, 3, 4, 5];

/**
 * 사양의 대조표 — `[무리 수, 잡음 수]`. 행이 eps, 열이 minPts.
 *
 * 이 상수는 **견주는 상대**이지 화면에 뜨는 값이 아니다. 아래 검사들은 전부
 * 좌표에서 셈한 결과를 이 표와 맞춰 본다.
 */
const SPEC: Array<Array<[number, number]>> = [
  [[3, 6], [3, 6], [2, 9], [1, 13]],
  [[4, 2], [4, 2], [3, 5], [1, 13]],
  [[3, 2], [3, 2], [2, 5], [1, 9]],
  [[2, 2], [2, 2], [2, 2], [1, 6]],
  [[1, 2], [1, 2], [1, 2], [1, 2]],
];

const PHASES = [
  'begin',
  'core-check',
  'count-neighbors',
  'done',
  'mark-noise',
  'open-cluster',
  'pick-seed',
  'pop',
  'push',
  'reclaim-border',
  'spread',
];

type Settled = {
  eps: number;
  minPts: number;
  epsIndex: number;
  minPtsIndex: number;
  labels: number[];
  core: boolean[];
  links: Array<[number, number]>;
  clusters: number;
  noise: number;
};

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  settled: Settled[];
};

function initialData(): DbscanData {
  return JSON.parse(JSON.stringify(dbscanFacet.initialData)) as DbscanData;
}

function points(): Array<{ x: number; y: number }> {
  return initialData().points;
}

/**
 * 알고리즘을 손잡이 대본 하나로 끝까지 몬다.
 *
 * `waitForInput` 이 대본을 다 쓰면 취소로 알려 알고리즘이 손을 뗀다 — 러너의
 * `reset`/`destroy` 가 하는 것과 같은 신호다.
 */
async function drive(script: ReactiveInputEvent[]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const settled: Settled[] = [];
  const queue = [...script];
  let cancelled = false;

  const ctx = {
    data: initialData(),
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
      if (event.type === 'settled') settled.push(event.payload as Settled);
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
      return next;
    },
  };

  await dbscan(ctx as unknown as FacetContext<DbscanData>);
  return { events, metrics, settled };
}

/** 스무 칸을 모두 다녀오는 대본. 같은 자리로 보내는 것은 알고리즘이 흘린다. */
function fullSweepScript(): ReactiveInputEvent[] {
  const out: ReactiveInputEvent[] = [];
  for (let mi = 0; mi < MIN_PTS_OPTIONS.length; mi += 1) {
    for (let ei = 0; ei < EPS_OPTIONS.length; ei += 1) {
      out.push({ type: 'min-pts', payload: { segmentIndex: mi, value: MIN_PTS_OPTIONS[mi] } });
      out.push({ type: 'eps', payload: { segmentIndex: ei, value: EPS_OPTIONS[ei] } });
    }
  }
  return out;
}

function tallyOf(rec: Recorded): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  for (const s of rec.settled) out.set(`${s.epsIndex}:${s.minPtsIndex}`, [s.clusters, s.noise]);
  return out;
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

describe('두 손잡이가 무엇을 만지는가', () => {
  it('좌표에서 셈한 스무 칸이 사양의 대조표와 하나도 다르지 않다', async () => {
    const rec = await drive(fullSweepScript());
    const tally = tallyOf(rec);
    expect(tally.size).toBe(EPS_OPTIONS.length * MIN_PTS_OPTIONS.length);
    for (let ei = 0; ei < EPS_OPTIONS.length; ei += 1) {
      for (let mi = 0; mi < MIN_PTS_OPTIONS.length; mi += 1) {
        expect(tally.get(`${ei}:${mi}`), `eps ${EPS_OPTIONS[ei]} · minPts ${MIN_PTS_OPTIONS[mi]}`)
          .toEqual(SPEC[ei][mi]);
      }
    }
  });

  it('처음 자리(eps 1.3 · minPts 3)에서 덩이 넷과 외톨이 둘로 갈린다', async () => {
    const rec = await drive([]);
    expect(rec.settled).toHaveLength(1);
    const first = rec.settled[0];
    expect([first.eps, first.minPts]).toEqual([1.3, 3]);
    // A 여섯 · B 넷 · C 셋 · D 넷 이 서로 다른 이름표를 받고 외톨이 둘만 -1 이다.
    expect(first.labels).toEqual([1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, -1, -1]);
    expect(first.clusters).toBe(4);
    expect(first.noise).toBe(2);
    // 이 자리에서는 무리에 든 점이 전부 속점이다 — 가장자리가 하나도 없다.
    expect(first.core.filter((c, i) => c === false && first.labels[i] > 0)).toEqual([]);
  });

  it('eps 만 올리면 무리는 붙어서 줄고 잡음은 거의 그대로다', async () => {
    const script: ReactiveInputEvent[] = EPS_OPTIONS.map((value, i) => ({
      type: 'eps',
      payload: { segmentIndex: i, value },
    }));
    const rec = await drive(script);
    const tally = tallyOf(rec);
    const row = EPS_OPTIONS.map((_, ei) => tally.get(`${ei}:1`));
    expect(row.map((v) => v?.[0])).toEqual([3, 4, 3, 2, 1]);
    // 잡음은 1.0 에서만 6 이고 그 뒤로는 내내 2 다 — eps 는 밖에 남는 점을
    // 만지지 않는다.
    expect(row.map((v) => v?.[1])).toEqual([6, 2, 2, 2, 2]);
  });

  it('minPts 만 올리면 무리가 무너지고 잡음이 뛴다', async () => {
    const script: ReactiveInputEvent[] = [
      { type: 'eps', payload: { segmentIndex: 2, value: 1.9 } },
      ...MIN_PTS_OPTIONS.map((value, i) => ({
        type: 'min-pts',
        payload: { segmentIndex: i, value },
      })),
    ];
    const rec = await drive(script);
    const tally = tallyOf(rec);
    const row = MIN_PTS_OPTIONS.map((_, mi) => tally.get(`2:${mi}`));
    expect(row.map((v) => v?.[0])).toEqual([3, 3, 2, 1]);
    expect(row.map((v) => v?.[1])).toEqual([2, 2, 5, 9]);
  });

  it('무리 수가 같은 두 자리의 속내가 다르다', async () => {
    const rec = await drive(fullSweepScript());
    const tally = tallyOf(rec);
    // eps 2.4 · minPts 2 와 eps 1.9 · minPts 4 는 둘 다 무리 2 다.
    expect(tally.get('3:0')?.[0]).toBe(2);
    expect(tally.get('2:2')?.[0]).toBe(2);
    // 그런데 잡음이 2 와 5 로 갈린다 — 앞은 붙어서 둘이고 뒤는 무너져서 둘이다.
    expect(tally.get('3:0')?.[1]).toBe(2);
    expect(tally.get('2:2')?.[1]).toBe(5);
    // 무리 1 로 떨어지는 길도 둘이다. eps 3.0 은 다 붙어서, minPts 5 는 다 무너져서.
    expect(tally.get('4:1')).toEqual([1, 2]);
    expect(tally.get('1:3')).toEqual([1, 13]);
  });

  it('번짐의 자국이 무리마다 그 무리의 점 수보다 하나 적다', async () => {
    const rec = await drive([]);
    const s = rec.settled[0];
    const size = new Map<number, number>();
    for (const label of s.labels) {
      if (label > 0) size.set(label, (size.get(label) ?? 0) + 1);
    }
    const linked = new Map<number, number>();
    for (const [, to] of s.links) {
      const label = s.labels[to];
      linked.set(label, (linked.get(label) ?? 0) + 1);
    }
    for (const [label, count] of size) {
      expect(linked.get(label), `무리 ${label}`).toBe(count - 1);
    }
  });

  it('잡음이던 점이 가장자리가 되는 갈래를 알고리즘이 실제로 지난다', async () => {
    // eps 1.3 · minPts 4 — 이 자리에서는 잡음으로 적힌 점이 나중에 무리에 든다.
    const rec = await drive([
      { type: 'min-pts', payload: { segmentIndex: 2, value: 4 } },
    ]);
    const emitted = new Set(
      rec.events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect(emitted.has('reclaim-border')).toBe(true);
  });


  it('자동 시연 도중 손잡이를 움직이면 그 자리에서 접고 새 값으로 다시 센다', async () => {
    // pollInput 이 한 번만 손잡이 입력을 흘려 넣는다 — 재생 도중 슬라이더를
    // 민 것과 같은 길이다.
    const events: FacetRuntimeEvent[] = [];
    const settled: Settled[] = [];
    let handed = false;
    let cancelled = false;
    const ctx = {
      data: initialData(),
      get cancelled() {
        return cancelled;
      },
      async emit(event: FacetRuntimeEvent) {
        events.push(event);
        if (event.type === 'settled') settled.push(event.payload as Settled);
      },
      metric() {},
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        if (handed) return null;
        handed = true;
        return { type: 'eps', payload: { segmentIndex: 4, value: 3.0 } };
      },
      async waitForInput() {
        cancelled = true;
        throw new Error('cancelled');
      },
    };
    await dbscan(ctx as unknown as FacetContext<DbscanData>);

    // 처음 자리의 settled 는 나오지 않는다 — 도중에 접었기 때문이다.
    expect(settled).toHaveLength(1);
    expect([settled[0].eps, settled[0].clusters, settled[0].noise]).toEqual([3.0, 1, 2]);
    const notes = events
      .filter((e) => e.type === 'params-set')
      .map((e) => (e.payload as { note: string }).note);
    expect(notes).toEqual(['start', 'eps-up']);
  });


  it('취소가 걸리면 셈을 마치지 않고 곧바로 손을 뗀다 (C8)', async () => {
    // 손잡이를 옮긴 뒤의 즉시 재계산에는 쉼(sleep)이 없다. 거기서 취소를 안 보면
    // 취소된 뒤에도 O(n²) 를 완주하고 phase 를 수십 번 더 내보낸다.
    const events: FacetRuntimeEvent[] = [];
    let cancelled = false;
    let moved = false;
    let cutAt = -1;
    const ctx = {
      data: initialData(),
      get cancelled() {
        return cancelled;
      },
      async emit(event: FacetRuntimeEvent) {
        events.push(event);
        // 두 번째 조합의 셈이 **이미 시작된 뒤**에 끊는다. 여기서 멈추려면
        // sweep 안쪽 고리들이 스스로 취소를 봐야 한다 — 바깥 고리의 검사로는
        // 이 자리를 잡지 못한다.
        if (
          moved &&
          cutAt < 0 &&
          event.type === 'phase' &&
          (event.payload as { phase?: string } | undefined)?.phase === 'pick-seed'
        ) {
          cancelled = true;
          cutAt = events.length;
        }
        if (event.type === 'params-set' && events.filter((e) => e.type === 'params-set').length === 2) {
          moved = true;
        }
      },
      metric() {},
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        if (cancelled) throw new Error('cancelled');
        return { type: 'eps', payload: { segmentIndex: 4, value: 3.0 } };
      },
    };
    await dbscan(ctx as unknown as FacetContext<DbscanData>);

    expect(cutAt).toBeGreaterThan(0);
    // 끊긴 뒤로 몇 걸음 안에 손을 떼야 한다. 완주하면 phase 만 수십 개 더 쌓인다.
    expect(events.length - cutAt).toBeLessThan(4);
    // 두 번째 조합의 답은 나오지 않는다.
    expect(events.filter((e) => e.type === 'settled')).toHaveLength(1);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const rec = await drive([]);
    const phases = rec.events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });

  it('메트릭은 화면에 뜨는 그 값이다', async () => {
    const rec = await drive([{ type: 'eps', payload: { segmentIndex: 4, value: 3.0 } }]);
    const last = rec.settled[rec.settled.length - 1];
    expect(rec.metrics['cluster-count']).toBe(last.clusters);
    expect(rec.metrics['noise-count']).toBe(last.noise);
    // 거리는 누적이므로 셈을 두 번 하면 한 번보다 많다.
    const once = await drive([]);
    expect(rec.metrics['distance-count']).toBeGreaterThan(once.metrics['distance-count']);
    // 처음 자리 한 번의 셈에 드는 거리 재기 — 점 열아홉을 세 군데서 훑는다.
    expect(once.metrics['distance-count']).toBe(760);
  });
});

describe('IR 을 실제로 돌린다', () => {
  const asRows = (): number[][] => points().map((p) => [p.x, p.y]);

  it('인터프리터가 스무 칸을 사양대로 낸다', () => {
    for (let ei = 0; ei < EPS_OPTIONS.length; ei += 1) {
      for (let mi = 0; mi < MIN_PTS_OPTIONS.length; mi += 1) {
        const label = new Array<number>(points().length).fill(0);
        const stack = new Array<number>(points().length).fill(0);
        const clusters = runIR(dbscanIR, 'dbscan', [
          asRows(),
          EPS_OPTIONS[ei] * EPS_OPTIONS[ei],
          MIN_PTS_OPTIONS[mi],
          label,
          stack,
        ]);
        const noise = label.filter((v) => v === -1).length;
        expect([clusters, noise], `eps ${EPS_OPTIONS[ei]} · minPts ${MIN_PTS_OPTIONS[mi]}`)
          .toEqual(SPEC[ei][mi]);
      }
    }
  });

  it('IR 이 낸 이름표가 algorithm 이 낸 이름표와 같다', async () => {
    const rec = await drive([]);
    const label = new Array<number>(points().length).fill(0);
    const stack = new Array<number>(points().length).fill(0);
    runIR(dbscanIR, 'dbscan', [asRows(), 1.3 * 1.3, 3, label, stack]);
    expect(label).toEqual(rec.settled[0].labels);
  });

  it('sqrt 를 부르지 않는다 — 거리는 제곱 그대로 견준다', () => {
    const source = JSON.stringify(dbscanIR);
    expect(source).not.toContain('"sqrt"');
    // 이름 붙인 호출이 아예 없다. 스택도 큐도 배열과 색인으로 폈다.
    expect(source).not.toContain('"kind":"call"');
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const rec = await drive(fullSweepScript());
    const emitted = new Set(
      rec.events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual(PHASES);
    expect([...irPhases(dbscanIR)].sort()).toEqual(PHASES);
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 열하나가 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(dbscanIR);
      expect(res.lines.length).toBeGreaterThan(30);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 스택은 배열과 꼭대기 색인이다. 이 두 줄이 이 IR 의 값이다.
      expect(all).toContain('stack[top] = i');
      expect(all).toContain('q = stack[top]');
      expect(all).toContain('top = top + 1');
      expect(all).toContain('top = top - 1');
      // 거리는 제곱 그대로. sqrt 가 나올 자리가 없다.
      expect(all).toContain('(dx * dx) + (dy * dy)');
      expect(all).not.toContain('sqrt');
      // 잡음이 가장자리가 되는 갈래.
      expect(all).toContain('label[j] == -1');
    },
  );

  it('정적 언어 넷이 2차원 좌표 배열을 각자의 표기로 낸다', () => {
    const of = (t: (typeof ALL)[number]) =>
      t.transpile(dbscanIR).lines.map((l) => l.code).join('\n');
    expect(of(javaTranspiler)).toContain('double[][] x');
    expect(of(csharpTranspiler)).toContain('double[][] x');
    expect(of(cppTranspiler)).toContain('std::vector<std::vector<double>>');
    expect(of(typescriptTranspiler)).toContain('x: number[][]');
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 최종 상태를 stage 로 옮긴다', async () => {
    const rec = await drive([{ type: 'eps', payload: { segmentIndex: 4, value: 3.0 } }]);
    const phaseCalls: (string | null)[] = [];
    const tally: Array<[number, number, number, number]> = [];
    let painted: number[] = [];
    let captions = 0;

    const stage = {
      setScene() {},
      setParams() {},
      setProbe() {},
      markNoise() {},
      openCluster() {},
      joinCluster() {},
      setStack() {},
      setResult(labels: number[]) {
        painted = labels;
      },
      recordTally(ei: number, mi: number, clusters: number, noise: number) {
        tally.push([ei, mi, clusters, noise]);
      },
      setCaption() {
        captions += 1;
      },
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

    const projector = dbscanProjector({ stage, codePanel });
    projector.onInit?.(dbscanFacet.initialData);
    for (const e of rec.events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBeGreaterThan(8);
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
    // 손잡이를 한 번 옮겼으므로 대조표에 두 칸이 찍힌다.
    expect(tally).toEqual([
      [1, 1, 4, 2],
      [4, 1, 1, 2],
    ]);
    expect(painted).toEqual(rec.settled[rec.settled.length - 1].labels);
    expect(captions).toBeGreaterThan(0);
  });

  it('view 가 하나도 없어도 던지지 않는다', async () => {
    const projector = dbscanProjector({});
    projector.onInit?.(dbscanFacet.initialData);
    await projector.onEvent({ type: 'phase', payload: { phase: 'begin' }, silent: true });
    await projector.onEvent({ type: 'settled', payload: { clusters: 1, noise: 0 } });
    projector.onReset?.();
  });
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  it('띄워 굴리고 손잡이를 옮기면 화면의 수가 바뀐다', async () => {
    const seenPhases: string[] = [];
    const fakeCodeView: View = {
      mount(container: HTMLElement) {
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
    registerDbscan();
    registerView('code-view', fakeCodeView);

    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(dbscanFacet, host);
    handle.setSpeed(40);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 760 420');
    expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);

    const svgTexts = (): string[] =>
      [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    // 처음 자리의 답 — 무리 넷과 잡음 둘이 대조표 칸에 찍힌다.
    await wait(() => svgTexts().includes('4 / 2'), 20_000);
    expect(svgTexts()).toContain('4 / 2');

    // 계기의 수도 알고리즘이 셈한 값이다.
    const metricText = (name: string): string =>
      host.querySelector(`.facet-control-bar__metric--${name}`)?.textContent ?? '';
    expect(metricText('cluster-count')).toContain('4');
    expect(metricText('noise-count')).toContain('2');

    // eps 손잡이를 3.0 으로 민다 — 단추가 실제로 지나는 길로 민다.
    const sliders = [...host.querySelectorAll('[role="slider"]')];
    expect(sliders).toHaveLength(2);
    const epsCell = sliders[0].querySelector('[data-seg-index="4"]');
    expect(epsCell).not.toBeNull();
    epsCell?.dispatchEvent(new Event('click'));

    await wait(() => svgTexts().includes('1 / 2'), 20_000);
    const after = svgTexts();
    // 앞서 본 값을 지우지 않는다 — 두 칸이 함께 남아야 견줌이 된다.
    expect(after).toContain('1 / 2');
    expect(after).toContain('4 / 2');
    expect(metricText('cluster-count')).toContain('1');

    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(errors).toEqual([]);

    handle.destroy();
    console.error = originalError;
    host.remove();
  }, 60_000);


  it('러너 밖에서 자료 없이 띄워도 캔버스가 남고 던지지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(dbscanStageView, container, {
      config: {},
      locale: 'en',
      theme: 'dark',
    });
    // 러너가 붙여 준 캔버스를 떼어내지 않는다 (S-view).
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 760 420');
    instance.destroy();
    container.remove();
  });

  it('destroy 뒤에는 캔버스 안이 비고 알고리즘도 손을 뗀다', async () => {
    registerDbscan();
    registerView('code-view', {
      mount(container: HTMLElement) {
        const node = document.createElement('div');
        container.appendChild(node);
        return { destroy: () => node.remove(), highlightPhase() {}, clearHighlight() {} };
      },
    } satisfies View);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(dbscanFacet, host);
    handle.setSpeed(40);
    await new Promise((r) => setTimeout(r, 120));

    const svg = host.querySelector('svg');
    expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);
    handle.destroy();
    expect(svg?.childNodes.length ?? 0).toBe(0);

    const before = svg?.childNodes.length ?? 0;
    await new Promise((r) => setTimeout(r, 200));
    expect(svg?.childNodes.length ?? 0).toBe(before);
    host.remove();
  }, 20_000);
});
