// @vitest-environment happy-dom
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { FacetRuntimeEvent, IRStmt, MetricDelta } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  runFacet,
} from '@ffacet/core/runtime';
import { runIR, type Value } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import {
  logisticRegression,
  logisticRegressionFacet,
  logisticRegressionProjector,
  logisticRegressionTrainStepIR,
  registerLogisticRegression,
  type LogisticRegressionData,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// 사양의 대조표. 호스트가 손으로 셈한 값이며, 알고리즘이 스스로 셈한 값과 견준다.
// ─────────────────────────────────────────────────────────────────────────────

/** 걸음 → [w0, w1, b]. 갱신을 마친 뒤의 값. */
const SPEC_PARAMS: Record<number, readonly [number, number, number]> = {
  1: [0.112, 0.101, -0.005],
  5: [0.095, 0.071, -0.129],
  20: [0.159, 0.098, -0.534],
  60: [0.275, 0.197, -1.435],
  150: [0.425, 0.393, -2.854],
  300: [0.571, 0.609, -4.322],
  600: [0.731, 0.872, -6.031],
};

/**
 * 걸음 → 갱신을 **마친 뒤** 의 평균 로그손실.
 *
 * 사양의 손실 열은 갱신 **전** (기울기를 뜬 그 순간) 의 값이라 이 표와 한 칸씩
 * 어긋난다 — 사양의 0.6931 은 걸음 0 의 값이고, 여기 0.6662 는 걸음 1 의 값이다.
 * 화면에 뜨는 손실은 화면에 그려진 무게와 같은 자리에서 재야 하므로 갱신 뒤로
 * 잡았다. 사양의 손실이 걸음 수와 한 칸 어긋난다는 것 자체는 뒤 걸음에서
 * 확인된다 (0.2334 ↔ 사양의 0.2335 는 마지막 한 걸음의 차이다).
 */
const POST_UPDATE_LOSS: Record<number, number> = {
  1: 0.6662,
  5: 0.6382,
  20: 0.5822,
  60: 0.4774,
  150: 0.3605,
  300: 0.2850,
  600: 0.2334,
};

/** 문턱별 (맞힘, 놓침, 헛짚음) — 600 걸음을 마친 뒤. */
const SPEC_TALLY: Record<string, readonly [number, number, number]> = {
  '0.3': [18, 0, 1],
  '0.5': [17, 1, 1],
  '0.8': [16, 3, 0],
};

/** 겹치는 둘 — points 배열에서의 자리와 확률. */
const OVERLAP = [
  { index: 9, label: 0, p: 0.730 },
  { index: 18, label: 1, p: 0.486 },
];

const PHASES = ['accumulate', 'forward', 'reset-gradient', 'squash', 'update'];

// ─────────────────────────────────────────────────────────────────────────────
// 알고리즘 구동 하네스 — ReactiveContext 를 흉내 낸다.
// ─────────────────────────────────────────────────────────────────────────────

type Input = { type: string; payload?: unknown };

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
};

function facetData(): LogisticRegressionData {
  return structuredClone(logisticRegressionFacet.initialData) as unknown as LogisticRegressionData;
}

/**
 * `polled` 는 pollInput 이 (재생 중에) 내주고, `awaited` 는 waitForInput 이
 * (멈춰 있을 때) 내준다. 둘 다 비면 waitForInput 이 'cancelled' 로 던져
 * 알고리즘이 스스로 돌아온다 — 실제로는 destroy / reset 이 그 자리를 맡는다.
 */
async function runAlgorithm(opts?: { polled?: Input[]; awaited?: Input[] }): Promise<Recorded> {
  const polled = [...(opts?.polled ?? [])];
  const awaited = [...(opts?.awaited ?? [])];
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await logisticRegression({
    data: facetData(),
    cancelled: false,
    async emit(event: FacetRuntimeEvent) {
      events.push(structuredClone(event));
    },
    metric(name: string, delta: MetricDelta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    pollInput(): Input | null {
      return polled.shift() ?? null;
    },
    async waitForInput(): Promise<Input> {
      const next = awaited.shift();
      if (!next) throw new Error('cancelled');
      return next;
    },
    async sleep(): Promise<boolean> {
      return true;
    },
  } as never);
  return { events, metrics };
}

function payloadsOf(events: FacetRuntimeEvent[], type: string): Array<Record<string, unknown>> {
  return events
    .filter((e) => e.type === type)
    .map((e) => e.payload as Record<string, unknown>);
}

function frameAtStep(events: FacetRuntimeEvent[], step: number): Record<string, unknown> {
  const all = [...payloadsOf(events, 'state-changed'), ...payloadsOf(events, 'done')];
  const hit = all.find((p) => p.step === step);
  if (!hit) throw new Error(`걸음 ${step} 의 프레임이 없다`);
  return hit;
}

function collectIRPhases(stmts: IRStmt[], out: Set<string>): void {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      collectIRPhases(s.then, out);
      if (s.else) collectIRPhases(s.else, out);
    } else if (s.kind === 'for-range' || s.kind === 'while') {
      collectIRPhases(s.body, out);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

describe('IR — 학습 한 판', () => {
  it('인터프리터로 돌린 600 걸음이 사양의 대조와 맞는다', () => {
    const data = facetData();
    const x: Value = data.points.map((p) => [p.x, p.y] as Value);
    const y: Value = data.points.map((p) => p.label);
    const w: Value = [0, 0];
    const g: Value = [0, 0];
    let b: number = 0;
    const seen: Record<number, readonly [number, number, number]> = {};

    for (let step = 1; step <= 600; step += 1) {
      b = runIR(logisticRegressionTrainStepIR, 'train_step', [x, y, w, b, g, data.eta]) as number;
      if (SPEC_PARAMS[step]) {
        const arr = w as number[];
        seen[step] = [arr[0], arr[1], b];
      }
    }

    for (const [step, expected] of Object.entries(SPEC_PARAMS)) {
      const got = seen[Number(step)];
      expect(got, `걸음 ${step}`).toBeDefined();
      expect(Number(got[0].toFixed(3)), `걸음 ${step} w0`).toBe(expected[0]);
      expect(Number(got[1].toFixed(3)), `걸음 ${step} w1`).toBe(expected[1]);
      expect(Number(got[2].toFixed(3)), `걸음 ${step} b`).toBe(expected[2]);
    }

    // 끝난 뒤 경계는 y = -0.839x + 6.919.
    const arr = w as number[];
    expect(Number((-arr[0] / arr[1]).toFixed(3))).toBe(-0.839);
    expect(Number((-b / arr[1]).toFixed(3))).toBe(6.919);
  });

  it('배열은 인자로 받는다 — zeros 를 부르지 않는다', () => {
    const json = JSON.stringify(logisticRegressionTrainStepIR);
    expect(json).not.toContain('"zeros"');
    expect(json).not.toContain('"zeros2"');
    const entry = logisticRegressionTrainStepIR.functions[0];
    expect(entry.name).toBe('train_step');
    expect(entry.params.map((p) => p.name)).toEqual(['x', 'y', 'w', 'b', 'g', 'eta']);
  });

  it('시그모이드는 이름 있는 부품이며 본문에 나눗셈과 exp 가 펼쳐져 있다', () => {
    const sigmoid = logisticRegressionTrainStepIR.functions.find((f) => f.name === 'sigmoid');
    expect(sigmoid).toBeDefined();
    const body = JSON.stringify(sigmoid);
    expect(body).toContain('"exp"');
    expect(body).toContain('"/"');
    // 급수로 펴지 않았다 — 본문은 return 한 줄이다.
    expect(sigmoid?.body).toHaveLength(1);
  });
});

describe('여섯 언어', () => {
  const all = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it.each(all.map((t) => [t.id, t] as const))('%s 로 낸 코드가 온전하다', (_id, transpiler) => {
    const out = transpiler.transpile(logisticRegressionTrainStepIR);
    expect(out.lines.length).toBeGreaterThan(15);
    for (const line of out.lines) {
      expect(line.code).not.toContain('undefined');
      expect(line.code).not.toContain('\r');
    }
    const text = out.lines.map((l) => l.code).join('\n');
    // 펼쳐 쓴 두 줄이 실제로 보인다.
    expect(text).toContain('w[0]');
    expect(text).toContain('w[1]');
    expect(text).toMatch(/g\[j\] = g\[j\] \+ \(d \* x\[i\]\[j\]\)/);
    // 시그모이드가 자기 언어 표기로 나온다.
    expect(text).toMatch(/exp|Exp/);
    // phase 라벨이 붙은 줄이 있다.
    expect(out.lines.some((l) => l.phase === 'squash')).toBe(true);
  });

  it('C++ 은 함수가 둘이라 전방 선언을 붙인다', () => {
    const out = cppTranspiler.transpile(logisticRegressionTrainStepIR);
    expect(out.lines[0].code).toMatch(/^double train_step\(.*\);$/);
    expect(out.lines[1].code).toBe('double sigmoid(double z);');
    // 참조로 받아야 호출부의 w / g 가 갱신된다.
    expect(out.lines[0].code).toContain('std::vector<double>& w');
    expect(out.lines[0].code).toContain('std::vector<double>& g');
  });
});

describe('phase 어휘 (C3)', () => {
  it('irs.ts 와 algorithm.ts 의 phase 집합이 같다', async () => {
    const fromIR = new Set<string>();
    for (const fn of logisticRegressionTrainStepIR.functions) collectIRPhases(fn.body, fromIR);

    const { events } = await runAlgorithm();
    const fromAlgorithm = new Set<string>();
    for (const e of events) {
      if (e.type !== 'phase') continue;
      const p = e.payload as { phase?: unknown };
      if (typeof p?.phase === 'string') fromAlgorithm.add(p.phase);
    }

    expect([...fromIR].sort()).toEqual(PHASES);
    expect([...fromAlgorithm].sort()).toEqual(PHASES);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await runAlgorithm();
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('학습', () => {
  it('짚은 마디마다 사양의 무게와 손실을 낸다', async () => {
    const { events, metrics } = await runAlgorithm();

    // 시작 프레임 — 무게가 0 이라 모든 점이 반반이고 손실은 ln 2.
    const start = frameAtStep(events, 0);
    expect(start.w0).toBe(0);
    expect(start.w1).toBe(0);
    expect(Number((start.loss as number).toFixed(4))).toBe(0.6931);
    expect((start.probs as number[]).every((p) => p === 0.5)).toBe(true);

    for (const [step, expected] of Object.entries(SPEC_PARAMS)) {
      const f = frameAtStep(events, Number(step));
      expect(Number((f.w0 as number).toFixed(3)), `걸음 ${step} w0`).toBe(expected[0]);
      expect(Number((f.w1 as number).toFixed(3)), `걸음 ${step} w1`).toBe(expected[1]);
      expect(Number((f.bias as number).toFixed(3)), `걸음 ${step} b`).toBe(expected[2]);
      expect(Number((f.loss as number).toFixed(4)), `걸음 ${step} 손실`).toBe(
        POST_UPDATE_LOSS[Number(step)],
      );
    }

    // 마지막 마디는 done 으로 온다.
    const done = payloadsOf(events, 'done');
    expect(done).toHaveLength(1);
    expect(done[0].step).toBe(600);
    expect(done[0].finished).toBe(true);

    // 메트릭은 절대값으로 떨어진다 (누적 delta 를 미러로 되풀이한 결과).
    expect(metrics['step-count']).toBe(600);
    expect(metrics['log-loss']).toBe(0.2334);
    expect(metrics['correct-count']).toBe(17);
  });

  it('겹치는 둘의 확률이 사양과 맞는다', async () => {
    const { events } = await runAlgorithm();
    const probs = frameAtStep(events, 600).probs as number[];
    const points = facetData().points;
    for (const o of OVERLAP) {
      expect(points[o.index].label).toBe(o.label);
      expect(Number(probs[o.index].toFixed(3)), `점 ${o.index}`).toBe(o.p);
    }
  });

  it('메트릭 이름은 facet.ts 가 선언한 것뿐이다 (C5)', async () => {
    const { metrics } = await runAlgorithm();
    const controls = logisticRegressionFacet.blocks.controls as {
      metrics?: Array<{ name: string }>;
    };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    expect(declared).toEqual(['correct-count', 'log-loss', 'step-count']);
    expect(Object.keys(metrics).sort()).toEqual(declared);
    for (const name of declared) expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });
});

describe('결정 문턱 — 이 완제품의 논증', () => {
  it('학습이 끝난 뒤에도 문턱을 옮기면 판정이 갈린다', async () => {
    const { events } = await runAlgorithm({
      awaited: [
        { type: 'threshold', payload: { value: 0.8 } },
        { type: 'threshold', payload: { value: 0.3 } },
      ],
    });

    const marks = payloadsOf(events, 'mark');
    expect(marks).toHaveLength(2);

    const settled = frameAtStep(events, 600);
    for (const m of marks) {
      // 무게는 그대로다 — 움직인 것은 "이쪽" 이라 말하는 자리뿐이다.
      expect(m.step).toBe(600);
      expect(m.w0).toBe(settled.w0);
      expect(m.w1).toBe(settled.w1);
      expect(m.bias).toBe(settled.bias);
      expect(m.textKey).toBe('caption.threshold');
    }

    const at = (th: number): Record<string, unknown> => {
      const found = marks.find((m) => m.threshold === th);
      if (!found) throw new Error(`문턱 ${th} 의 프레임이 없다`);
      return found;
    };
    for (const [th, expected] of Object.entries(SPEC_TALLY)) {
      const f = th === '0.5' ? settled : at(Number(th));
      expect([f.hit, f.miss, f.falseAlarm], `문턱 ${th}`).toEqual([...expected]);
    }

    // 문턱을 올릴수록 헛짚음이 줄고 놓침이 는다.
    const low = at(0.3);
    const high = at(0.8);
    expect((high.miss as number) > (low.miss as number)).toBe(true);
    expect((high.falseAlarm as number) < (low.falseAlarm as number)).toBe(true);
  });

  it('같은 문턱을 다시 고르면 아무 일도 없다', async () => {
    const { events } = await runAlgorithm({
      awaited: [{ type: 'threshold', payload: { value: 0.5 } }],
    });
    expect(payloadsOf(events, 'mark')).toHaveLength(0);
  });

  it('재생 어휘는 알고리즘까지 오지 않는다 — 와도 버린다', async () => {
    // 메커니즘이 play / pause / step 을 직접 먹으므로 이 셋은 dispatch 로 오지
    // 않는다. 그래도 들어왔다면 조용히 버려야 하고, 학습은 그대로 완주한다.
    const { events } = await runAlgorithm({
      polled: [{ type: 'pause' }, { type: 'play' }, { type: 'step' }],
      awaited: [{ type: 'play' }],
    });
    expect(payloadsOf(events, 'mark')).toHaveLength(0);
    expect(payloadsOf(events, 'done')).toHaveLength(1);
    expect(frameAtStep(events, 600).step).toBe(600);
  });
});

describe('projector', () => {
  it('phase 를 코드 패널 줄 강조로 옮기고 프레임을 stage 로 넘긴다', () => {
    const seen: { phases: Array<string | null>; frames: number[]; captions: string[] } = {
      phases: [],
      frames: [],
      captions: [],
    };
    const stage = {
      destroy() {},
      setPoints() {},
      setFrame(f: { step: number }) {
        seen.frames.push(f.step);
      },
      setCaption(t: string) {
        seen.captions.push(t);
      },
    };
    const codePanel = {
      destroy() {},
      highlightPhase(p: string | null) {
        seen.phases.push(p);
      },
    };
    const p = logisticRegressionProjector({ stage, codePanel });
    p.onInit?.(logisticRegressionFacet.initialData);
    void p.onEvent({ type: 'phase', payload: { phase: 'squash' }, silent: true });
    void p.onEvent({
      type: 'state-changed',
      payload: {
        step: 7, w0: 1, w1: 2, bias: -3, probs: [0.5], loss: 0.5,
        threshold: 0.5, hit: 1, miss: 0, falseAlarm: 0, finished: false,
        textKey: 'caption.training',
      },
    });
    void p.onEvent({ type: 'highlight' });

    expect(seen.phases).toEqual([null, 'squash']);
    expect(seen.frames).toEqual([7]);
    expect(seen.captions).toEqual([
      'The weights move, and the line and the ribbon move with them.',
    ]);
  });
});

describe('화면', () => {
  let host: HTMLElement;
  let errors: unknown[][];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerLogisticRegression();
    host = document.createElement('div');
    document.body.appendChild(host);
    errors = [];
    spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
  });

  afterEach(() => {
    spy.mockRestore();
    host.remove();
    clearRegistry();
    clearViewCatalog();
  });

  it('마운트하면 캔버스가 붙고 viewBox 가 끝까지 그대로다', async () => {
    const handle = runFacet(logisticRegressionFacet, host, { locale: 'ko' });
    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const viewBox = svg?.getAttribute('viewBox');
    expect(viewBox).toBe('0 0 620 330');
    expect(svg?.querySelector('g')).not.toBeNull();

    handle.setSpeed(200);
    const ok = await waitUntil(() => (host.textContent ?? '').includes('걸음 600'), 15000);
    expect(ok, '600 걸음까지 굴러야 한다').toBe(true);
    expect(svg?.getAttribute('viewBox')).toBe(viewBox);

    handle.destroy();
    expect(errors).toEqual([]);
    expect(host.childElementCount).toBe(0);
  }, 20000);

  it('화면에 뜨는 수가 알고리즘이 셈한 값이다', async () => {
    const handle = runFacet(logisticRegressionFacet, host, { locale: 'ko' });
    handle.setSpeed(200);
    await waitUntil(() => (host.textContent ?? '').includes('걸음 600'), 15000);

    const text = host.textContent ?? '';
    expect(text).toContain('걸음 600 · w = (0.731, 0.872) · b = -6.031 · 로그손실 0.2334');
    expect(text).toContain('맞힘 17');
    expect(text).toContain('놓침 1');
    expect(text).toContain('헛짚음 1');
    expect(text).toContain('문턱 0.50');
    expect(text).toContain('학습은 끝났다');

    // 메트릭 뱃지도 같은 값을 든다.
    const badges = [...host.querySelectorAll('.facet-control-bar__metric, [class*=metric]')]
      .map((el) => el.textContent ?? '')
      .join(' ');
    expect(badges === '' || badges.includes('600')).toBe(true);

    handle.destroy();
    expect(errors).toEqual([]);
  }, 20000);
});

describe('멈춤과 한 걸음 — 메커니즘이 지는 조작', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerLogisticRegression();
  });
  afterEach(() => {
    clearRegistry();
    clearViewCatalog();
  });

  it('멈추면 화면이 멎고, 한 걸음씩 누르면 다시 나아간다', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(logisticRegressionFacet, host, { locale: 'ko' });
    handle.setSpeed(200);

    const stepOnScreen = (): number => {
      const m = /걸음 (\d+)/.exec(host.textContent ?? '');
      return m ? Number(m[1]) : -1;
    };

    // 얼마쯤 굴러간 뒤 멈춘다.
    expect(await waitUntil(() => stepOnScreen() >= 3, 5000)).toBe(true);
    handle.stop();
    await new Promise((r) => setTimeout(r, 200));
    const frozen = stepOnScreen();
    await new Promise((r) => setTimeout(r, 300));
    expect(stepOnScreen(), '멈춘 동안에는 걸음이 늘지 않는다').toBe(frozen);

    // 한 걸음 단추는 걸음의 경계 하나씩만 넘긴다 — 한 마디는 경계 다섯이다.
    for (let i = 0; i < 6; i += 1) {
      handle.step();
      await new Promise((r) => setTimeout(r, 60));
    }
    const stepped = stepOnScreen();
    expect(stepped, '한 걸음씩 눌러도 나아간다').toBeGreaterThan(frozen);
    await new Promise((r) => setTimeout(r, 300));
    expect(stepOnScreen(), '한 걸음 뒤에는 다시 멎는다').toBe(stepped);

    // 다시 재생하면 끝까지 간다.
    handle.start();
    expect(await waitUntil(() => stepOnScreen() === 600, 15000)).toBe(true);

    handle.destroy();
    host.remove();
  }, 30000);
});

/** 조건이 참이 될 때까지 기다린다. 마감이 지나면 false. */
async function waitUntil(check: () => boolean, deadlineMs: number): Promise<boolean> {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (check()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return check();
}
