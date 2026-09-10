// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import {
  kmeans,
  kmeansFacet,
  kmeansProjector,
  kmeansStepIR,
  registerKmeans,
  type KmeansData,
} from '../src/index.js';
import { runIR, type Value } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const PHASES = [
  'assign',
  'begin-round',
  'gather',
  'measure',
  'move-center',
  'pick-nearest',
  'settle-check',
];

const POINTS: number[][] = [
  [0.5, 1.0],
  [1.5, 1.2],
  [2.5, 1.0],
  [3.5, 1.2],
  [4.5, 1.0],
  [5.5, 1.2],
  [8.0, 5.0],
  [8.5, 5.4],
  [8.2, 5.8],
  [9.6, 5.1],
  [10.1, 5.5],
  [9.8, 5.9],
];

/** 사양의 대조 — k = 3, 시작 넷. */
const SPEC_K3 = [
  { seeds: [0, 1, 2], sizes: [3, 3, 6], spread: 8.802, assign: '000111222222' },
  { seeds: [0, 6, 9], sizes: [6, 3, 3], spread: 18.453, assign: '000000111222' },
  { seeds: [0, 6, 7], sizes: [4, 2, 6], spread: 10.308, assign: '000011222222' },
  { seeds: [2, 6, 10], sizes: [6, 3, 3], spread: 18.453, assign: '000000111222' },
];

type SettledPayload = {
  k: number;
  seedIndex: number;
  rounds: number;
  sizes: number[];
  spread: number;
  assignKey: string;
  isReader: boolean;
  triedAtK: number;
  distinctAtK: number;
  tightest: { seedIndex: number; sizes: number[]; spread: number };
  reader: { seedIndex: number; sizes: number[]; spread: number } | null;
};

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  settled: SettledPayload[];
};

function freshData(): KmeansData {
  return structuredClone(kmeansFacet.initialData) as unknown as KmeansData;
}

/**
 * 알고리즘을 러너 없이 굴린다.
 *
 * `sleep` 은 곧바로 돌아오고 `waitForInput` 은 대본을 하나씩 내어 준다. 대본이
 * 비면 취소로 만들어 알고리즘의 최상위 `catch` 가 조용히 접게 한다 — 실제 러너의
 * reset / destroy 가 하는 일과 같은 모양이다.
 */
async function drive(script: ReactiveInputEvent[], data = freshData()): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...script];
  let cancelled = false;
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next !== undefined) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await kmeans(ctx as unknown as FacetContext<KmeansData>);
  const settled = events
    .filter((e) => e.type === 'run-settled')
    .map((e) => e.payload as SettledPayload);
  return { events, metrics, settled };
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

/** IR 을 멎을 때까지 되부른다. 호출부가 하는 일이 이것뿐이다. */
function settleWithIR(seeds: number[]): {
  rounds: number;
  assign: number[];
  centers: number[][];
  spread: number;
} {
  const k = seeds.length;
  const x = POINTS.map((p) => [...p]);
  const centers = seeds.map((i) => [POINTS[i][0], POINTS[i][1]]);
  const assign = new Array<number>(POINTS.length).fill(0);
  const counts = new Array<number>(k).fill(0);
  const sums: number[][] = Array.from({ length: k }, () => [0, 0]);
  let rounds = 0;
  let moved: Value;
  do {
    moved = runIR(kmeansStepIR, 'kmeans_step', [
      x as unknown as Value,
      assign as unknown as Value,
      centers as unknown as Value,
      counts as unknown as Value,
      sums as unknown as Value,
    ]);
    rounds += 1;
  } while (moved !== 0 && rounds < 40);
  let spread = 0;
  for (let i = 0; i < POINTS.length; i += 1) {
    const j = assign[i];
    spread += (POINTS[i][0] - centers[j][0]) ** 2 + (POINTS[i][1] - centers[j][1]) ** 2;
  }
  return { rounds, assign, centers, spread };
}

describe('알고리즘 — 시작이 다르면 다른 답에 멎는다', () => {
  it('k = 3 의 시작 넷이 사양의 대조와 글자 하나 다르지 않다', async () => {
    const { settled } = await drive([
      { type: 'reseed' },
      { type: 'reseed' },
      { type: 'reseed' },
    ]);
    expect(settled).toHaveLength(4);
    for (let i = 0; i < 4; i += 1) {
      expect(settled[i].k).toBe(3);
      expect(settled[i].seedIndex).toBe(i);
      expect(settled[i].sizes).toEqual(SPEC_K3[i].sizes);
      expect(settled[i].assignKey).toBe(SPEC_K3[i].assign);
      expect(settled[i].spread).toBeCloseTo(SPEC_K3[i].spread, 3);
    }
  });

  it('넷이 낸 서로 다른 답은 셋이고 흩어짐 차이는 9.65 다', async () => {
    const { settled } = await drive([
      { type: 'reseed' },
      { type: 'reseed' },
      { type: 'reseed' },
    ]);
    const answers = new Set(settled.map((s) => s.assignKey));
    expect(answers.size).toBe(3);
    expect(settled[3].distinctAtK).toBe(3);
    expect(settled[3].triedAtK).toBe(4);
    const spreads = settled.map((s) => s.spread);
    expect(Math.max(...spreads) - Math.min(...spreads)).toBeCloseTo(9.651, 2);
  });

  it('멎은 답은 모두 더 옮길 데가 없는 자리다 — 한 걸음 더 밟아도 안 움직인다', async () => {
    for (const spec of SPEC_K3) {
      const first = settleWithIR(spec.seeds);
      const k = spec.seeds.length;
      const again = runIR(kmeansStepIR, 'kmeans_step', [
        POINTS.map((p) => [...p]) as unknown as Value,
        [...first.assign] as unknown as Value,
        first.centers.map((c) => [...c]) as unknown as Value,
        new Array<number>(k).fill(0) as unknown as Value,
        Array.from({ length: k }, () => [0, 0]) as unknown as Value,
      ]);
      expect(again).toBe(0);
    }
  });

  it('가장 촘촘한 답은 3/3/6 이고 사람이 보는 무리는 6/3/3 이다 — 두 배 넘게 갈린다', async () => {
    const { settled } = await drive([
      { type: 'reseed' },
      { type: 'reseed' },
      { type: 'reseed' },
    ]);
    const last = settled[3];
    expect(last.tightest.sizes).toEqual([3, 3, 6]);
    expect(last.tightest.spread).toBeCloseTo(8.802, 3);
    expect(last.reader).not.toBeNull();
    expect(last.reader?.sizes).toEqual([6, 3, 3]);
    expect(last.reader?.spread).toBeCloseTo(18.453, 3);
    // 사람이 보는 무리가 더 흩어져 있다. 그것이 이 완제품의 둘째 주장이다.
    expect((last.reader?.spread ?? 0) / last.tightest.spread).toBeGreaterThan(2);
    // 그리고 사람이 보는 무리는 시작 B · D 가 낸 것이다.
    expect(settled.filter((s) => s.isReader).map((s) => s.seedIndex)).toEqual([1, 3]);
  });

  it('k 슬라이더가 답을 바꾼다 — k = 2 는 시작 넷이 모두 한 답에 멎는다', async () => {
    const { settled } = await drive([
      { type: 'k', payload: { value: 2 } },
      { type: 'reseed' },
      { type: 'reseed' },
      { type: 'reseed' },
    ]);
    expect(settled[0].k).toBe(3);
    const atTwo = settled.slice(1);
    expect(atTwo).toHaveLength(4);
    for (const s of atTwo) {
      expect(s.k).toBe(2);
      expect(s.sizes).toEqual([6, 6]);
      expect(s.spread).toBeCloseTo(22.308, 3);
    }
    expect(atTwo[3].distinctAtK).toBe(1);
  });

  it('k 를 넷으로 옮기면 시작 넷이 서로 다른 답 넷을 낸다', async () => {
    const { settled } = await drive([
      { type: 'k', payload: { value: 4 } },
      { type: 'reseed' },
      { type: 'reseed' },
      { type: 'reseed' },
    ]);
    const atFour = settled.filter((s) => s.k === 4);
    expect(atFour).toHaveLength(4);
    expect(new Set(atFour.map((s) => s.assignKey)).size).toBe(4);
    expect(atFour.map((s) => s.sizes.join('/'))).toEqual([
      '1/2/3/6',
      '3/3/3/3',
      '4/2/3/3',
      '6/1/2/3',
    ]);
  });

  it('k 를 다섯으로 옮겨도 시작 넷이 서로 다른 답 넷을 낸다', async () => {
    const { settled } = await drive([
      { type: 'k', payload: { value: 5 } },
      { type: 'reseed' },
      { type: 'reseed' },
      { type: 'reseed' },
    ]);
    const atFive = settled.filter((s) => s.k === 5);
    expect(atFive).toHaveLength(4);
    expect(new Set(atFive.map((s) => s.assignKey)).size).toBe(4);
    // 무리를 더 잘게 쪼갤수록 흩어짐은 작아진다 — 흩어짐만으로는 k 를 고를 수 없다.
    expect(Math.min(...atFive.map((s) => s.spread))).toBeLessThan(settled[0].spread);
  });

  it('알 수 없는 조작은 흘린다 — 판이 더 굴러가지 않는다', async () => {
    const { settled } = await drive([{ type: 'nonsense' }, { type: 'input' }]);
    expect(settled).toHaveLength(1);
  });

  it('메트릭은 셈한 값이다 — 잰 거리는 바퀴마다 점 열둘 × 중심 k 다', async () => {
    const { events, metrics, settled } = await drive([]);
    const rounds = settled[0].rounds;
    expect(rounds).toBe(5);
    expect(metrics['round-count']).toBe(rounds);
    expect(metrics['distance-count']).toBe(rounds * POINTS.length * 3);
    // 흩어짐 계기는 마지막으로 보인 값을 정수로 들고 있다.
    expect(metrics['spread-sum']).toBe(Math.round(settled[0].spread));
    expect(Number.isInteger(metrics['spread-sum'])).toBe(true);
    // 흩어짐은 두 몸짓 어느 쪽에서도 늘지 않는다.
    const trail = events
      .filter((e) => e.type === 'assigned' || e.type === 'centers-moved')
      .map((e) => (e.payload as { spread: number }).spread);
    for (let i = 1; i < trail.length; i += 1) {
      expect(trail[i]).toBeLessThanOrEqual(trail[i - 1] + 1e-12);
    }
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await drive([]);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('IR 을 실제로 돌린다', () => {
  it('한 걸음짜리 진입점을 되부르면 사양의 답 셋이 나온다', () => {
    const seen = SPEC_K3.map((spec) => {
      const r = settleWithIR(spec.seeds);
      const sizes = new Array<number>(spec.seeds.length).fill(0);
      for (const a of r.assign) sizes[a] += 1;
      return { sizes, spread: r.spread, assign: r.assign.join('') };
    });
    for (let i = 0; i < SPEC_K3.length; i += 1) {
      expect(seen[i].sizes).toEqual(SPEC_K3[i].sizes);
      expect(seen[i].assign).toBe(SPEC_K3[i].assign);
      expect(seen[i].spread).toBeCloseTo(SPEC_K3[i].spread, 3);
    }
    expect(new Set(seen.map((s) => s.assign)).size).toBe(3);
  });

  it('IR 이 셈한 답과 알고리즘이 셈한 답이 같다', async () => {
    const { settled } = await drive([
      { type: 'reseed' },
      { type: 'reseed' },
      { type: 'reseed' },
    ]);
    for (let i = 0; i < 4; i += 1) {
      const fromIR = settleWithIR(SPEC_K3[i].seeds);
      expect(fromIR.assign.join('')).toBe(settled[i].assignKey);
      expect(fromIR.spread).toBeCloseTo(settled[i].spread, 9);
      expect(fromIR.rounds).toBe(settled[i].rounds);
    }
  });

  it('빈 무리를 만드는 시작에서도 0 으로 나누지 않는다', () => {
    // 중심 둘을 같은 점에 겹쳐 놓으면 뒤엣것이 아무 점도 잡지 못한다.
    const centers = [
      [0.5, 1.0],
      [0.5, 1.0],
    ];
    const assign = new Array<number>(POINTS.length).fill(0);
    const moved = runIR(kmeansStepIR, 'kmeans_step', [
      POINTS.map((p) => [...p]) as unknown as Value,
      assign as unknown as Value,
      centers as unknown as Value,
      [0, 0] as unknown as Value,
      [
        [0, 0],
        [0, 0],
      ] as unknown as Value,
    ]);
    expect(Number.isFinite(moved as number)).toBe(true);
    // 빈 중심은 제자리에 남는다.
    expect(centers[1]).toEqual([0.5, 1.0]);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await drive([]);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(kmeansStepIR)].sort());
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 일곱이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(kmeansStepIR);
      expect(res.lines.length).toBeGreaterThan(20);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 제곱근은 딱 한 번 — 중심이 옮긴 거리를 더하는 자리에만 나온다.
      expect((all.match(/sqrt|Sqrt/g) ?? []).length).toBe(1);
      // 가장 가까운 것을 고르는 자리에는 `min` 이 없다. 색인이 필요하기 때문이다.
      expect(all).not.toMatch(/\bmin\(|\bMin\(/);
      // 거리 셈이 이름 뒤로 숨지 않는다.
      expect(all).toContain('c[j][0]');
      expect(all).toContain('x[i][1]');
      expect(all).toContain('bestsq');
      expect(all).toContain('dsq');
      // 셈에 쓰는 배열은 인자로 받는다 — zeros 를 지어내지 않는다.
      expect(all).not.toContain('zeros');
      expect(all).toContain('counts');
      expect(all).toContain('sums');
    },
  );

  it('정적 언어 넷이 2차원 실수 배열을 각자의 표기로 낸다', () => {
    const of = (t: (typeof ALL)[number]) =>
      t.transpile(kmeansStepIR).lines.map((l) => l.code).join('\n');
    expect(of(javaTranspiler)).toContain('double[][] x');
    expect(of(csharpTranspiler)).toContain('double[][] x');
    expect(of(cppTranspiler)).toContain('std::vector<std::vector<double>>');
    expect(of(typescriptTranspiler)).toContain('number[][]');
  });

  it('여섯 언어가 저마다의 제곱근 표기를 쓴다', () => {
    const of = (t: (typeof ALL)[number]) =>
      t.transpile(kmeansStepIR).lines.map((l) => l.code).join('\n');
    expect(of(pythonTranspiler)).toContain('math.sqrt');
    expect(of(javascriptTranspiler)).toContain('Math.sqrt');
    expect(of(typescriptTranspiler)).toContain('Math.sqrt');
    expect(of(javaTranspiler)).toContain('Math.sqrt');
    expect(of(cppTranspiler)).toContain('std::sqrt');
    expect(of(csharpTranspiler)).toContain('Math.Sqrt');
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 멎은 답을 장부에 얹는다', async () => {
    const { events } = await drive([{ type: 'reseed' }]);
    const phaseCalls: (string | null)[] = [];
    const rows: Array<{ k: number; sizes: number[]; spread: number; isReader: boolean }> = [];
    const captions: string[] = [];
    let painted: number[] | null = null;
    let centres: number[][] = [];

    const stage = {
      setPoints() {},
      beginRun(info: { centers: number[][] }) {
        centres = info.centers;
        painted = null;
      },
      setRound() {},
      setSpokes() {},
      setPicks() {},
      setAssign(assign: number[] | null) {
        painted = assign;
      },
      setTallies() {},
      setCenters(next: number[][]) {
        centres = next;
      },
      setSettled() {},
      addLedgerRow(row: { k: number; sizes: number[]; spread: number; isReader: boolean }) {
        rows.push(row);
      },
      setCaption(main: string, note: string) {
        captions.push(`${main} | ${note}`);
      },
      reset() {},
    } as unknown as ViewInstance;

    const codePanel = {
      highlightPhase(p: string | null) {
        phaseCalls.push(p);
      },
      clearHighlight() {
        phaseCalls.push(null);
      },
    } as unknown as ViewInstance;

    const projector = kmeansProjector({ stage, codePanel });
    projector.onInit?.(kmeansFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null))).toEqual(new Set(PHASES));
    expect(rows.map((r) => r.sizes.join('/'))).toEqual(['3/3/6', '6/3/3']);
    expect(rows[1].isReader).toBe(true);
    expect(centres).toHaveLength(3);
    expect(painted).toEqual('000000111222'.split('').map(Number));
    // 두 답이 쌓인 뒤에는 두 주장 가운데 하나가 반드시 화면에 적힌다.
    const last = captions[captions.length - 1];
    expect(last).toContain('3/3/6');
    expect(last).toContain('6/3/3');
  });
});

describe('마운트와 재생', () => {
  let errors: string[] = [];
  let spy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    errors = [];
    spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    spy?.mockRestore();
  });

  it('캔버스가 붙고 세로가 변하지 않으며 조작이 장부를 늘린다', async () => {
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
    registerKmeans();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(kmeansFacet, host);
    handle.setSpeed(60);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 720 440');
    // 점 열둘이 곧바로 그려져 있다.
    expect(host.querySelectorAll('svg circle').length).toBeGreaterThanOrEqual(12);

    const texts = (): string[] =>
      [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    await wait(() => texts().includes('8.80'), 25_000);
    expect(texts()).toContain('8.80');
    expect(texts()).toContain('3/3/6');
    expect([...new Set(seenPhases)].sort()).toEqual(PHASES);
    expect(svg?.getAttribute('viewBox')).toBe(box);

    // ── 손잡이가 논증을 진다. "시작 다시 뽑기" 를 누르면 다른 답이 쌓인다.
    const reseed = host.querySelector<HTMLButtonElement>('button[data-control-id="reseed"]');
    expect(reseed).not.toBeNull();
    reseed?.click();
    await wait(() => texts().includes('18.45'), 25_000);
    expect(texts()).toContain('18.45');
    // 앞서 본 답은 지워지지 않는다 — 견줌이 장부 위에서 일어난다.
    expect(texts()).toContain('8.80');
    expect(texts()).toContain('6/3/3');
    expect(svg?.getAttribute('viewBox')).toBe(box);

    // 계기의 수도 알고리즘이 셈한 것이다.
    const metric = host.querySelector('.facet-control-bar__metric--distance-count');
    expect(Number(metric?.textContent?.replace(/\D/g, ''))).toBeGreaterThan(0);

    expect(errors).toEqual([]);

    handle.destroy();
    expect(host.querySelector('svg')).toBeNull();
    expect(host.children.length).toBe(0);
    host.remove();
  }, 60_000);

  it('k 슬라이더를 옮기면 같은 화면에서 다른 k 의 답이 쌓인다', async () => {
    const fakeCodeView: View = {
      mount(container: HTMLElement) {
        const node = document.createElement('div');
        container.appendChild(node);
        return { destroy() { node.remove(); }, highlightPhase() {}, clearHighlight() {} };
      },
    };
    registerKmeans();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(kmeansFacet, host);
    handle.setSpeed(60);

    const texts = (): string[] =>
      [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    await wait(() => texts().includes('3/3/6'), 25_000);

    const two = host.querySelector<HTMLElement>('[role="slider"] [data-seg-index="0"]');
    expect(two).not.toBeNull();
    two?.click();
    await wait(() => texts().includes('6/6'), 25_000);
    expect(texts()).toContain('6/6');
    expect(texts()).toContain('22.31');
    // k = 3 의 답도 그대로 남아 있다.
    expect(texts()).toContain('3/3/6');
    expect(errors).toEqual([]);

    handle.destroy();
    host.remove();
  }, 60_000);
});
