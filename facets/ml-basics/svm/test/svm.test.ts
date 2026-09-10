// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRStmt,
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
  svm,
  svmFacet,
  svmProjector,
  svmStepIR,
  registerSvm,
  type SvmData,
  type SvmInputEvent,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

const PHASES = [
  'accumulate',
  'hinge',
  'margin',
  'regularize',
  'scan-point',
  'step-begin',
  'update',
  'violated',
];

/**
 * 사양의 대조표. 손으로 셈한 값이므로 알고리즘·IR 과 견주는 용도다.
 * `[기울기, y 절편, 마진 폭, 틀리게 놓인 점]`.
 */
const SPEC_SEPARATED: Record<string, [number, number, number, number]> = {
  '0.1': [-1.736, 9.536, 3.826, 0],
  '1': [-1.059, 7.145, 2.662, 0],
  '10': [-1.255, 8.248, 1.671, 0],
};
const SPEC_OVERLAP: Record<string, [number, number, number, number]> = {
  '0.1': [-1.467, 8.969, 4.62, 1],
  '1': [-1.772, 9.343, 3.334, 1],
  '10': [-1.758, 8.568, 2.259, 1],
};

function freshData(): SvmData {
  return structuredClone(svmFacet.initialData) as unknown as SvmData;
}

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  /** 배지에 한 번이라도 찍힌 값 전부. `String(value)` 그대로다. */
  shown: string[];
};

/**
 * 알고리즘을 가짜 ReactiveContext 로 돌린다. 스크립트가 바닥나면 취소로
 * 깨워 끝낸다 — 메커니즘의 되감기가 하는 일과 같다.
 */
async function drive(script: SvmInputEvent[]): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const shown: string[] = [];
  const queue = [...script];
  let cancelled = false;
  const ctx = {
    data: freshData(),
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc') {
      // 메커니즘과 같은 방식으로 쌓는다 — 배지에 찍히는 것이 이 값이다.
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
      shown.push(`${name}=${String(metrics[name])}`);
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
  } as unknown as FacetContext<SvmData>;

  try {
    await svm(ctx);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }
  return { events, metrics, shown };
}

type DonePayload = {
  step: number;
  c: number;
  cIndex: number;
  overlap: boolean;
  w0: number;
  w1: number;
  b: number;
  marginWidth: number;
  violators: number[];
  misplaced: number[];
  textKey: string;
};

function donesOf(events: FacetRuntimeEvent[]): DonePayload[] {
  return events.filter((e) => e.type === 'done').map((e) => e.payload as DonePayload);
}

function lineOf(d: DonePayload): [number, number, number, number] {
  return [
    Math.round((-d.w0 / d.w1) * 1000) / 1000,
    Math.round((-d.b / d.w1) * 1000) / 1000,
    Math.round(d.marginWidth * 1000) / 1000,
    d.misplaced.length,
  ];
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

/** IR 을 4000 걸음 돌린다 — 알고리즘과 같은 답이 나와야 한다. */
function trainWithIR(
  points: Array<{ x: number; y: number; label: number }>,
  c: number,
): { w: number[]; b: number } {
  const x = points.map((p) => [p.x, p.y]);
  const y = points.map((p) => p.label);
  const w = [0, 0];
  const g = [0, 0];
  let b = 0;
  for (let s = 0; s < 4000; s++) {
    b = runIR(svmStepIR, 'svm_step', [x, y, w, g, b, c, 0.05]) as number;
  }
  return { w, b };
}

function specPoints(overlap: boolean): Array<{ x: number; y: number; label: number }> {
  const d = freshData();
  return d.points.map((p, i) =>
    overlap && i === d.overlapIndex
      ? { x: d.overlapAt.x, y: d.overlapAt.y, label: p.label }
      : { x: p.x, y: p.y, label: p.label },
  );
}

/** C 셋 · 겹침 둘을 한 번씩 돌게 하는 조작 각본. */
const TOUR: SvmInputEvent[] = [
  { type: 'set-c', payload: { value: 0.1, segmentIndex: 0 } },
  { type: 'set-c', payload: { value: 10, segmentIndex: 2 } },
  { type: 'toggle-overlap', payload: {} },
  { type: 'set-c', payload: { value: 0.1, segmentIndex: 0 } },
  { type: 'set-c', payload: { value: 1, segmentIndex: 1 } },
];

/** 손잡이를 더 오래 오가는 각본 — 메트릭 누적이 새는지 보려면 길어야 한다. */
const LONG_TOUR: SvmInputEvent[] = [
  ...TOUR,
  { type: 'set-c', payload: { value: 10, segmentIndex: 2 } },
  { type: 'toggle-overlap', payload: {} },
  { type: 'set-c', payload: { value: 1, segmentIndex: 1 } },
  { type: 'set-c', payload: { value: 0.1, segmentIndex: 0 } },
];

describe('힌지 손실 + 준경사하강', () => {
  it('여섯 경우가 모두 사양의 대조와 맞는다', async () => {
    const { events } = await drive(TOUR);
    const dones = donesOf(events);
    expect(dones).toHaveLength(6);

    // 갈리는 자료 — C = 1 → 0.1 → 10.
    expect(lineOf(dones[0])).toEqual(SPEC_SEPARATED['1']);
    expect(lineOf(dones[1])).toEqual(SPEC_SEPARATED['0.1']);
    expect(lineOf(dones[2])).toEqual(SPEC_SEPARATED['10']);
    // 겹치는 자료 — C = 10 → 0.1 → 1.
    expect(lineOf(dones[3])).toEqual(SPEC_OVERLAP['10']);
    expect(lineOf(dones[4])).toEqual(SPEC_OVERLAP['0.1']);
    expect(lineOf(dones[5])).toEqual(SPEC_OVERLAP['1']);

    // 겹침이 켜진 뒤로는 한 점을 포기한다.
    expect(dones.slice(0, 3).every((d) => !d.overlap)).toBe(true);
    expect(dones.slice(3).every((d) => d.overlap)).toBe(true);
  });

  it('여러 벌을 오가는 내내 메트릭 배지에 꼬리가 붙지 않는다', async () => {
    const { events, metrics, shown } = await drive(LONG_TOUR);
    const dones = donesOf(events);
    expect(dones.length).toBe(LONG_TOUR.length + 1);
    expect(metrics['margin-width']).toBe(
      Math.round(dones[dones.length - 1].marginWidth * 1000) / 1000,
    );
    // 배지는 `String(value)` 를 그대로 찍는다. 차분만 보내 쌓으면 중간에
    // `1.6629999999999998` 같은 것이 뜬다 — 마지막 값만 보아서는 안 잡힌다.
    const clean = /^[a-z-]+=-?\d+(\.\d{1,3})?$/;
    expect(shown.filter((v) => !clean.test(v))).toEqual([]);
    expect(shown.length).toBeGreaterThan(100);
  });

  it('C 를 올리면 마진이 좁아진다 — 겹침이 있든 없든', async () => {
    const { events } = await drive(TOUR);
    const dones = donesOf(events);
    const width = (overlap: boolean, c: number): number =>
      dones.find((d) => d.overlap === overlap && d.c === c)!.marginWidth;

    for (const overlap of [false, true]) {
      expect(width(overlap, 0.1)).toBeGreaterThan(width(overlap, 1));
      expect(width(overlap, 1)).toBeGreaterThan(width(overlap, 10));
    }
  });

  it('4000 걸음을 다 걷고 처음과 마지막 걸음만 점을 하나씩 짚는다', async () => {
    const { events } = await drive([]);
    const dones = donesOf(events);
    expect(dones[0].step).toBe(4000);
    const scanned = events.filter((e) => e.type === 'point-scanned');
    // 여는 걸음 열 + 닫는 걸음 열.
    expect(scanned).toHaveLength(20);
    expect(scanned.map((e) => e.target)).toEqual([
      ...Array.from({ length: 10 }, (_, i) => `point:${i}`),
      ...Array.from({ length: 10 }, (_, i) => `point:${i}`),
    ]);
    // 걸음 0 · 1 + 짚은 자리 열다섯 + 마지막 걸음 = 열여덟 번 보고한다.
    const marks = (svmFacet.initialData as unknown as SvmData).checkpoints.length;
    expect(events.filter((e) => e.type === 'train-step')).toHaveLength(marks + 3);
  });

  it('여백을 이미 지킨 점은 선을 밀지 않는다 — accumulate 가 아예 안 일어난다', async () => {
    const { events } = await drive([]);
    const scanned = events
      .filter((e) => e.type === 'point-scanned')
      .map((e) => e.payload as { margin: number; violated: boolean });
    const accumulates = events.filter(
      (e) => e.type === 'phase' && (e.payload as { phase: string }).phase === 'accumulate',
    ).length;

    expect(scanned.every((p) => p.violated === p.margin < 1)).toBe(true);
    // 여는 걸음은 w = 0 이라 열 점이 모두 여백을 못 지킨다.
    const opening = scanned.slice(0, 10);
    expect(opening.every((p) => p.violated)).toBe(true);
    expect(opening.every((p) => p.margin === 0)).toBe(true);
    // C = 1 로 수렴한 뒤에는 아무도 밀지 않는다 — 열 점이 모두 여백을 지켰다.
    const closing = scanned.slice(10);
    expect(closing.every((p) => !p.violated)).toBe(true);
    expect(closing.every((p) => p.margin >= 1)).toBe(true);
    // 곧 `accumulate` 는 여는 걸음에서만 열 번 일어난다.
    expect(accumulates).toBe(10);
  });

  it('C 를 내리면 수렴한 뒤에도 띠 안에 남아 선을 미는 점이 있다', async () => {
    const { events } = await drive([{ type: 'set-c', payload: { value: 0.1, segmentIndex: 0 } }]);
    const dones = donesOf(events);
    expect(dones[1].c).toBe(0.1);
    // C = 0.1 은 몇을 포기하고 넓게 간다 — 다만 선을 넘긴 점은 없다.
    expect(dones[1].violators.length).toBeGreaterThan(0);
    expect(dones[1].misplaced).toEqual([]);
    expect(dones[1].textKey).toBe('caption.inside');
    expect(dones[0].textKey).toBe('caption.clean');
  });

  it('발신하는 이벤트 어휘는 머리말에 적은 다섯뿐이다 (C2)', async () => {
    const { events } = await drive(TOUR);
    expect([...new Set(events.map((e) => e.type))].sort()).toEqual([
      'done',
      'knob-moved',
      'phase',
      'point-scanned',
      'train-step',
    ]);
  });

  it('phase 이벤트는 모두 silent 이고 그 밖의 이벤트는 아니다', async () => {
    const { events } = await drive([]);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
    expect(events.filter((e) => e.type !== 'phase').every((e) => e.silent !== true)).toBe(true);
  });

  it('메트릭 셋이 마지막 상태를 정확한 수로 들고 있다', async () => {
    const { events, metrics } = await drive([]);
    const done = donesOf(events)[0];
    expect(metrics['step-count']).toBe(4000);
    expect(metrics['violation-count']).toBe(done.violators.length);
    // 배지는 `String(value)` 를 그대로 찍는다 — 누적 차분이 새면 꼬리가 붙는다.
    expect(metrics['margin-width']).toBe(2.662);
    expect(String(metrics['margin-width'])).toBe('2.662');
  });

  it('모르는 신호는 흘리고 같은 C 를 다시 골라도 다시 훈련하지 않는다', async () => {
    const { events } = await drive([
      { type: 'speed', payload: 4 },
      { type: 'set-c', payload: { value: 1, segmentIndex: 1 } },
      { type: 'toggle-overlap', payload: {} },
    ]);
    expect(donesOf(events)).toHaveLength(2);
    expect(donesOf(events)[1].overlap).toBe(true);
  });
});

describe('Projector 배선', () => {
  it('식별자로 짚은 점과 phase 를 각자의 자리로 옮긴다', async () => {
    const { events } = await drive([]);
    const scannedAt: number[] = [];
    const phaseCalls: (string | null)[] = [];
    const models: Array<{ step: number }> = [];
    const ledger: number[] = [];
    let captionLines: string[] = [];

    const stage = {
      setPoints() {},
      setSettings() {},
      setModel(m: { step: number }) {
        models.push(m);
      },
      setScanned(index: number | null) {
        if (index !== null) scannedAt.push(index);
      },
      record(row: { cIndex: number }) {
        ledger.push(row.cIndex);
      },
      setCaption(lines: string[]) {
        captionLines = lines;
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

    const projector = svmProjector({ stage, codePanel });
    projector.onInit?.(svmFacet.initialData);
    for (const e of events) await projector.onEvent(e);

    // `target` 의 `point:<i>` 를 읽어야 자리가 나온다 — payload 에 색인이 없다.
    expect(scannedAt).toEqual([...Array(10).keys(), ...Array(10).keys()]);
    expect(new Set(phaseCalls.filter((p): p is string => p !== null)).size).toBe(PHASES.length);
    expect(phaseCalls[phaseCalls.length - 1]).toBeNull();
    expect(models[models.length - 1].step).toBe(4000);
    expect(ledger).toEqual([1]);
    expect(captionLines).toHaveLength(2);
    expect(captionLines[0]).toContain('2.662');
  });
});

describe('IR 을 실제로 돌린다', () => {
  it('인터프리터가 사양의 여섯 대조와 같은 선을 낸다', () => {
    for (const [key, spec] of Object.entries(SPEC_SEPARATED)) {
      const { w, b } = trainWithIR(specPoints(false), Number(key));
      expect(Math.round((-w[0] / w[1]) * 1000) / 1000).toBe(spec[0]);
      expect(Math.round((-b / w[1]) * 1000) / 1000).toBe(spec[1]);
      expect(Math.round((2 / Math.hypot(w[0], w[1])) * 1000) / 1000).toBe(spec[2]);
    }
    for (const [key, spec] of Object.entries(SPEC_OVERLAP)) {
      const { w, b } = trainWithIR(specPoints(true), Number(key));
      expect(Math.round((-w[0] / w[1]) * 1000) / 1000).toBe(spec[0]);
      expect(Math.round((-b / w[1]) * 1000) / 1000).toBe(spec[1]);
      expect(Math.round((2 / Math.hypot(w[0], w[1])) * 1000) / 1000).toBe(spec[2]);
    }
  });

  it('IR 과 algorithm 이 같은 수를 낸다 — 연산 순서까지 같다', async () => {
    const { events } = await drive([]);
    const done = donesOf(events)[0];
    const { w, b } = trainWithIR(specPoints(false), 1);
    expect(w[0]).toBe(done.w0);
    expect(w[1]).toBe(done.w1);
    expect(b).toBe(done.b);
  });

  it('한 걸음은 w 와 g 를 제자리에서 갱신하고 b 만 돌려준다', () => {
    const pts = specPoints(false);
    const x = pts.map((p) => [p.x, p.y]);
    const y = pts.map((p) => p.label);
    const w = [0, 0];
    const g = [0, 0];
    const nextB = runIR(svmStepIR, 'svm_step', [x, y, w, g, 0, 1, 0.05]) as number;
    // w = 0, b = 0 이면 열 점이 모두 여백을 못 지키므로 열 점이 모두 g 를 민다.
    expect(g[0]).not.toBe(0);
    expect(g[1]).not.toBe(0);
    expect(w[0]).not.toBe(0);
    expect(w[1]).not.toBe(0);
    // 절편은 그대로다 — 이름표 다섯 대 다섯이라 gb = Σ C·(−y) 가 정확히 0 이다.
    expect(nextB).toBe(0);
    // 정칙항이 w 에서 시작하므로 w = 0 인 첫 걸음의 g 는 힌지 몫뿐이다.
    let hx = 0;
    let hy = 0;
    for (const p of pts) {
      hx += 1 * (-p.label * p.x);
      hy += 1 * (-p.label * p.y);
    }
    expect(g[0]).toBeCloseTo(hx, 12);
    expect(g[1]).toBeCloseTo(hy, 12);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await drive([]);
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(svmStepIR)].sort());
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
    '%s — 줄이 나오고 undefined 가 섞이지 않으며 phase 여덟이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(svmStepIR);
      expect(res.lines.length).toBeGreaterThan(15);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 내적을 좌표로 펼친 것. 감싸면 이름표의 부호가 코드에서 사라진다.
      expect(all).toContain('y[i] * (((w[0] * x[i][0]) + (w[1] * x[i][1])) + b)');
      // 힌지. `max` 는 예약 이름이라 언어마다 제 표기로 나온다.
      expect(all).toMatch(/max\(0, 1 - m\)/i);
      // 이 모형의 핵심 조건문.
      expect(all).toContain('m < 1');
      // 준기울기 — C · (−y · x).
      expect(all).toContain('C * (-y[i] * x[i][0])');
      // 정칙항은 w 에서 시작한다.
      expect(all).toContain('g[0] = w[0]');
      // zeros 를 쓰지 않는다 — g 는 인자로 받는다.
      expect(all).not.toContain('zeros');
    },
  );

  it('정적 언어 넷이 2차원 double 배열을 각자의 표기로 낸다', () => {
    const of = (t: (typeof ALL)[number]): string =>
      t.transpile(svmStepIR).lines.map((l) => l.code).join('\n');
    expect(of(javaTranspiler)).toContain('double[][] x');
    expect(of(csharpTranspiler)).toContain('double[][] x');
    expect(of(cppTranspiler)).toContain('std::vector<std::vector<double>>& x');
    expect(of(typescriptTranspiler)).toContain('x: number[][]');
    // 함수가 하나뿐이라 C++ 전방 선언은 붙지 않는다.
    expect(of(cppTranspiler).split('double svm_step').length - 1).toBe(1);
  });
});

describe('마운트와 조작', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  function mountSvm(): { host: HTMLElement; handle: ReturnType<typeof runFacet>; phases: string[] } {
    const phases: string[] = [];
    const fakeCodeView: View = {
      mount(container: HTMLElement) {
        const node = document.createElement('div');
        container.appendChild(node);
        return {
          destroy() {
            node.remove();
          },
          highlightPhase(phase: string | null) {
            if (phase) phases.push(phase);
          },
          clearHighlight() {},
        };
      },
    };
    registerSvm();
    registerView('code-view', fakeCodeView);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(svmFacet, host, { locale: 'en' });
    handle.setSpeed(8);
    return { host, handle, phases };
  }

  function stageTexts(host: HTMLElement): string[] {
    return [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
  }

  function metricText(host: HTMLElement, name: string): string {
    const badge = host.querySelector(`.facet-control-bar__metric--${name}`);
    return badge?.lastElementChild?.textContent ?? '';
  }

  async function waitFor(check: () => boolean, ms = 20_000): Promise<void> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline && !check()) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('캔버스가 붙고 세로가 변하지 않으며 화면의 수가 알고리즘이 셈한 값이다', async () => {
    const { host, handle, phases } = mountSvm();
    const svgEl = host.querySelector('svg');
    expect(svgEl).not.toBeNull();
    const box = svgEl?.getAttribute('viewBox');
    expect(box).toBe('0 0 620 330');
    // mount 직후에도 점 열이 이미 그려져 있다.
    expect(host.querySelectorAll('svg circle').length).toBeGreaterThanOrEqual(10);

    await waitFor(() => stageTexts(host).some((t) => t === '2/||w|| = 2.662'));
    expect(stageTexts(host)).toContain('2/||w|| = 2.662');
    expect(stageTexts(host)).toContain('y = -1.059x + 7.145');
    expect(metricText(host, 'margin-width')).toBe('2.662');
    expect(metricText(host, 'step-count')).toBe('4000');
    // 훑기가 끝나면 짚던 자국이 남지 않는다.
    expect(stageTexts(host).some((t) => t.startsWith('m['))).toBe(false);
    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svgEl?.getAttribute('viewBox')).toBe(box);
    expect([...new Set(phases)].sort()).toEqual(PHASES);
    expect(errorSpy).not.toHaveBeenCalled();

    handle.destroy();
    expect(host.childElementCount).toBe(0);
    host.remove();
  }, 40_000);

  it('C 슬라이더를 옮기면 화면이 다시 셈해 갈아 끼워진다', async () => {
    const { host, handle } = mountSvm();
    await waitFor(() => stageTexts(host).some((t) => t === '2/||w|| = 2.662'));

    const segs = [...host.querySelectorAll('[data-seg-index]')] as HTMLElement[];
    expect(segs).toHaveLength(3);
    segs[2].dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => stageTexts(host).some((t) => t === '2/||w|| = 1.671'));
    expect(stageTexts(host)).toContain('C = 10');
    expect(metricText(host, 'margin-width')).toBe('1.671');

    segs[0].dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => stageTexts(host).some((t) => t === '2/||w|| = 3.826'));
    expect(metricText(host, 'margin-width')).toBe('3.826');
    // 기록장에 C 셋이 나란히 쌓인다 — 그것이 이 슬라이더가 지는 논증이다.
    const texts = stageTexts(host);
    expect(texts).toContain('C=0.1');
    expect(texts).toContain('C=1');
    expect(texts).toContain('C=10');
    expect(texts).toContain('3.826');
    expect(texts).toContain('2.662');
    expect(texts).toContain('1.671');
    expect(errorSpy).not.toHaveBeenCalled();

    handle.destroy();
    host.remove();
  }, 40_000);

  it('겹침을 켜면 한 점이 반대 무리로 옮겨 가고 그 점을 포기한다', async () => {
    const { host, handle } = mountSvm();
    await waitFor(() => stageTexts(host).some((t) => t === '2/||w|| = 2.662'));

    // 먼저 C 를 옮겨 기록장에 두 줄을 쌓아 둔다.
    const segs = [...host.querySelectorAll('[data-seg-index]')] as HTMLElement[];
    segs[2].dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => stageTexts(host).some((t) => t === '2/||w|| = 1.671'));
    expect(stageTexts(host).filter((t) => t.startsWith('C='))).toEqual(['C=1', 'C=10']);

    const toggle = host.querySelector('[data-control-id="toggle-overlap"]') as HTMLElement | null;
    expect(toggle).not.toBeNull();
    toggle?.dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => stageTexts(host).some((t) => t === '2/||w|| = 2.259'));

    expect(stageTexts(host)).toContain('2/||w|| = 2.259');
    expect(stageTexts(host)).toContain('y = -1.758x + 8.568');
    // 자료가 달라졌으니 견줄 것도 달라진다 — 기록장을 비우고 한 줄만 다시 쌓는다.
    expect(stageTexts(host).filter((t) => t.startsWith('C='))).toEqual(['C=10']);
    // 옮겨 오기 전 자리에 유령이 남는다.
    expect(stageTexts(host).some((t) => t === 'where that point started')).toBe(true);
    // 한 점을 포기했다 — 위험 테두리가 하나 붙는다.
    expect(stageTexts(host).some((t) => t.startsWith('Points across the line: 1.'))).toBe(true);

    toggle?.dispatchEvent(new Event('click', { bubbles: true }));
    await waitFor(() => stageTexts(host).some((t) => t === '2/||w|| = 1.671'));
    expect(stageTexts(host).some((t) => t === 'where that point started')).toBe(false);
    expect(stageTexts(host).filter((t) => t.startsWith('C='))).toEqual(['C=10']);
    expect(errorSpy).not.toHaveBeenCalled();

    handle.destroy();
    host.remove();
  }, 40_000);
});
