// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
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
  mountView,
  registerBuiltinViews,
  registerView,
  runFacet,
} from '@ffacet/core/runtime';
import {
  pca,
  pcaFacet,
  pcaPowerIterationIR,
  pcaProjector,
  pcaStageView,
  registerPca,
  type PcaData,
} from '../src/index.js';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/**
 * 사양의 대조. 이 상수는 **견주는 상대**이지 화면에 뜨는 값이 아니다 —
 * 아래 검사들은 전부 좌표에서 셈한 결과를 이 표와 맞춰 본다.
 */
const SPEC = {
  mean: [53.9167, 5.2583],
  cov: [675.4097, -35.1285, 2.6308],
  corr: -0.8334,
  sd: [25.9886, 1.622],
  sdRatio: 16.02,
  raw: { angle: -2.98, share: 99.88, moved: 1, steps: 2, angle2: 87.02, share2: 0.12 },
  std: { angle: -45, share: 91.67, moved: 4, steps: 5, angle2: 45, share2: 8.33 },
  delta: 42.02,
} as const;

const PHASES = ['center', 'covariance', 'measure-turn', 'multiply', 'normalize'];

const CANVAS_BOX = '0 0 760 448';

function initialData(): PcaData {
  return JSON.parse(JSON.stringify(pcaFacet.initialData)) as PcaData;
}

function points(): Array<{ x: number; y: number }> {
  return initialData().points;
}

type LedgerRow = { standardized: boolean; angleDeg: number; share: number; steps: number };
type AxisPick = {
  axisIndex: number;
  ax: number;
  ay: number;
  angleDeg: number;
  share: number;
  t: number[];
};
type TurnRow = { step: number; turn: number; converged: boolean };

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  ledger: LedgerRow[];
  axes: AxisPick[];
  turns: TurnRow[];
  phases: string[];
};

function payloadOf<T>(event: FacetRuntimeEvent): T {
  return event.payload as T;
}

function collect(events: FacetRuntimeEvent[], target: string): FacetRuntimeEvent[] {
  return events.filter((e) => e.type === 'state-changed' && e.target === target);
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
  const queue = [...script];
  let cancelled = false;

  const ctx = {
    data: initialData(),
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

  await pca(ctx as unknown as FacetContext<PcaData>);
  return {
    events,
    metrics,
    ledger: collect(events, 'ledger:row').map((e) => payloadOf<LedgerRow>(e)),
    axes: collect(events, 'axis:pick').map((e) => payloadOf<AxisPick>(e)),
    turns: collect(events, 'turn:step').map((e) => payloadOf<TurnRow>(e)),
    phases: events
      .filter((e) => e.type === 'phase')
      .map((e) => payloadOf<{ phase: string }>(e).phase),
  };
}

const standardize = (on: boolean): ReactiveInputEvent => ({
  type: 'standardize',
  payload: { value: on ? 1 : 0, segmentIndex: on ? 1 : 0 },
});

const pickAxis = (n: 1 | 2): ReactiveInputEvent => ({
  type: 'axis',
  payload: { value: n, segmentIndex: n - 1 },
});

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

describe('IR 을 실제로 돌린다', () => {
  const xs = (): number[] => points().map((p) => p.x);
  const ys = (): number[] => points().map((p) => p.y);

  it('공분산 보조 함수가 사양의 세 수를 낸다', () => {
    const out = [0, 0, 0];
    runIR(pcaPowerIterationIR, 'covariance', [xs(), ys(), out]);
    expect(out.map((v) => Number(v.toFixed(4)))).toEqual(SPEC.cov);
    // 상관계수도 이 셋에서 나온다 — 사양이 −0.8334 라 적어 둔 그 수다.
    const corr = out[1] / Math.sqrt(out[0] * out[2]);
    expect(Number(corr.toFixed(4))).toBe(SPEC.corr);
  });

  it('원래 단위에서 거듭제곱 반복이 한 걸음 만에 멎는다', () => {
    const s = [0, 0, 0];
    runIR(pcaPowerIterationIR, 'covariance', [xs(), ys(), s]);
    const v = [1, 0];
    const turns: number[] = [];
    for (let k = 0; k < 6; k += 1) {
      turns.push(runIR(pcaPowerIterationIR, 'power_step', [s[0], s[1], s[2], v]) as number);
    }
    expect(Number(v[0].toFixed(4))).toBe(0.9986);
    expect(Number(v[1].toFixed(4))).toBe(-0.052);
    const angle = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    expect(Number(angle.toFixed(2))).toBe(SPEC.raw.angle);
    // 첫 걸음만 크게 돌고 두 번째부터는 문턱(1e-4) 아래다.
    expect(turns[0]).toBeGreaterThan(1e-4);
    expect(turns[1]).toBeLessThan(1e-4);
  });

  it('표준화한 뒤에는 네 걸음이 걸리고 −45° 로 간다', () => {
    const raw = [0, 0, 0];
    runIR(pcaPowerIterationIR, 'covariance', [xs(), ys(), raw]);
    const mx = points().reduce((a, p) => a + p.x, 0) / points().length;
    const my = points().reduce((a, p) => a + p.y, 0) / points().length;
    const sdX = Math.sqrt(raw[0]);
    const sdY = Math.sqrt(raw[2]);
    expect([Number(sdX.toFixed(4)), Number(sdY.toFixed(4))]).toEqual(SPEC.sd);
    expect(Number((sdX / sdY).toFixed(2))).toBe(SPEC.sdRatio);

    const zs = [0, 0, 0];
    runIR(pcaPowerIterationIR, 'covariance', [
      points().map((p) => (p.x - mx) / sdX),
      points().map((p) => (p.y - my) / sdY),
      zs,
    ]);
    // 표준화하면 공분산이 곧 상관행렬이다.
    expect(zs.map((v) => Number(v.toFixed(4)))).toEqual([1, SPEC.corr, 1]);

    const v = [1, 0];
    const turns: number[] = [];
    for (let k = 0; k < 6; k += 1) {
      turns.push(runIR(pcaPowerIterationIR, 'power_step', [zs[0], zs[1], zs[2], v]) as number);
    }
    const angle = (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    expect(Number(angle.toFixed(2))).toBe(SPEC.std.angle);
    // 네 걸음까지는 문턱 위, 다섯째부터 아래 — 그래서 "네 걸음" 이다.
    expect(turns.slice(0, 4).every((t) => t > 1e-4)).toBe(true);
    expect(turns[4]).toBeLessThan(1e-4);
  });

  it('진입점이 v 를 그 자리에서 갈고 돌아간 정도를 돌려준다', () => {
    const v = [1, 0];
    const turn = runIR(pcaPowerIterationIR, 'power_step', [4, 0, 1, v]) as number;
    // (4,0;0,1) 은 이미 x 가 고유벡터라 한 걸음도 안 돈다.
    expect(v).toEqual([1, 0]);
    expect(turn).toBe(0);
    const w = [0, 1];
    runIR(pcaPowerIterationIR, 'power_step', [4, 0, 1, w]);
    expect(w).toEqual([0, 1]);
  });

  it('zeros 를 쓰지 않고 이름 붙인 호출은 sqrt 뿐이다', () => {
    const source = JSON.stringify(pcaPowerIterationIR);
    expect(source).not.toContain('"zeros"');
    const called = new Set<string>();
    const walkExpr = (e: unknown): void => {
      if (typeof e !== 'object' || e === null) return;
      const node = e as Record<string, unknown>;
      if (node.kind === 'call' && typeof node.fn === 'string') called.add(node.fn);
      for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(walkExpr);
        else walkExpr(value);
      }
    };
    walkExpr(pcaPowerIterationIR);
    expect([...called]).toEqual(['sqrt']);
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
      const res = transpiler.transpile(pcaPowerIterationIR);
      expect(res.lines.length).toBeGreaterThan(28);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual(PHASES);

      const all = res.lines.map((l) => l.code).join('\n');
      // 곱셈은 펼쳐 쓴다 — 이 두 줄이 "무엇을 곱하고 있는가" 다.
      expect(all).toContain('(sxx * v[0]) + (sxy * v[1])');
      expect(all).toContain('(sxy * v[0]) + (syy * v[1])');
      // 길이로 나누는 것도 감싸지 않는다.
      expect(all).toContain('v[0] = wx / m');
      expect(all).toContain('v[1] = wy / m');
      // 공분산은 가운데를 잡은 뒤 어긋남의 곱을 모은다.
      expect(all).toContain('sxy = sxy + (dx * dy)');
      expect(all).toContain('out[1] = sxy / n');
      // 배열을 지어내지 않는다.
      expect(all).not.toContain('zeros');
    },
  );

  it('정적 언어 넷이 실수 배열을 각자의 표기로 낸다', () => {
    const of = (t: (typeof ALL)[number]): string =>
      t.transpile(pcaPowerIterationIR).lines.map((l) => l.code).join('\n');
    expect(of(javaTranspiler)).toContain('double[] v');
    expect(of(csharpTranspiler)).toContain('double[] v');
    expect(of(cppTranspiler)).toContain('std::vector<double>& v');
    expect(of(typescriptTranspiler)).toContain('v: number[]');
    // 함수가 둘이라 C++ 은 전방 선언을 먼저 낸다.
    expect(of(cppTranspiler).split('\n')[0]).toContain('double power_step(');
    expect(of(cppTranspiler)).toContain('void covariance(');
  });

  it('예약 이름 sqrt 가 언어마다 제 표기로 갈린다', () => {
    const line = (t: (typeof ALL)[number]): string =>
      t.transpile(pcaPowerIterationIR).lines.map((l) => l.code).join('\n');
    expect(line(pythonTranspiler)).toContain('math.sqrt(');
    expect(line(javascriptTranspiler)).toContain('Math.sqrt(');
    expect(line(cppTranspiler)).toContain('std::sqrt(');
    expect(line(csharpTranspiler)).toContain('Math.Sqrt(');
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const rec = await drive([standardize(true)]);
    expect([...new Set(rec.phases)].sort()).toEqual(PHASES);
    expect([...irPhases(pcaPowerIterationIR)].sort()).toEqual(PHASES);
  });

  it('phase 이벤트는 모두 silent 다 (C2)', async () => {
    const rec = await drive([]);
    const phases = rec.events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('두 손잡이가 무엇을 만지는가', () => {
  it('처음 자리 — 원래 단위에서는 주축이 가로에서 3도도 안 기운다', async () => {
    const rec = await drive([]);
    expect(rec.ledger).toHaveLength(1);
    expect(rec.ledger[0]).toEqual({
      standardized: false,
      angleDeg: SPEC.raw.angle,
      share: SPEC.raw.share,
      steps: SPEC.raw.moved,
    });
    // 자취는 두 걸음이다 — 둘째 걸음이 "안 움직인다" 를 확인하는 걸음이다.
    expect(rec.turns).toHaveLength(SPEC.raw.steps);
    expect(rec.turns[rec.turns.length - 1].converged).toBe(true);
    expect(rec.turns.filter((t) => !t.converged)).toHaveLength(SPEC.raw.moved);
  });

  it('표준화를 켜면 답이 −45° 로 42도 돌아간다', async () => {
    const rec = await drive([standardize(true)]);
    expect(rec.ledger).toHaveLength(2);
    expect(rec.ledger[1]).toEqual({
      standardized: true,
      angleDeg: SPEC.std.angle,
      share: SPEC.std.share,
      steps: SPEC.std.moved,
    });
    expect(Math.abs(rec.ledger[0].angleDeg - rec.ledger[1].angleDeg)).toBeCloseTo(SPEC.delta, 10);
    // 앞서 본 답을 지우지 않는다 — 두 줄이 함께 남아야 견줌이 된다.
    expect(rec.ledger.map((r) => r.standardized)).toEqual([false, true]);
  });

  it('수렴 속도가 고윳값의 차이를 말한다 — 한 걸음 대 네 걸음', async () => {
    const rec = await drive([standardize(true)]);
    const rawTurns = rec.turns.slice(0, SPEC.raw.steps);
    const stdTurns = rec.turns.slice(SPEC.raw.steps);
    expect(rawTurns.filter((t) => !t.converged)).toHaveLength(SPEC.raw.moved);
    expect(stdTurns.filter((t) => !t.converged)).toHaveLength(SPEC.std.moved);
    expect(stdTurns).toHaveLength(SPEC.std.steps);
  });

  it('사영할 축을 바꾸면 다시 풀지 않고 그 값만 갈아 끼운다', async () => {
    const rec = await drive([pickAxis(2)]);
    // 셈은 한 번뿐이다 — 원장이 한 줄이고 자취도 두 걸음뿐.
    expect(rec.ledger).toHaveLength(1);
    expect(rec.turns).toHaveLength(SPEC.raw.steps);
    // 사영은 두 번 — 처음 자리의 제1 축, 그리고 바꿔 고른 제2 축.
    expect(rec.axes).toHaveLength(2);
    expect(rec.axes[0].axisIndex).toBe(1);
    expect([rec.axes[1].axisIndex, rec.axes[1].angleDeg, rec.axes[1].share]).toEqual([
      2,
      SPEC.raw.angle2,
      SPEC.raw.share2,
    ]);
  });

  it('표준화하면 잃는 몫이 0.12% 에서 8.33% 로 커진다', async () => {
    const rec = await drive([pickAxis(2), standardize(true)]);
    const second = rec.axes.filter((a) => a.axisIndex === 2);
    expect(second.map((a) => a.share)).toEqual([SPEC.raw.share2, SPEC.std.share2]);
    expect(second.map((a) => a.angleDeg)).toEqual([SPEC.raw.angle2, SPEC.std.angle2]);
    // 제1 과 제2 를 더하면 언제나 온전한 하나다.
    for (const row of rec.ledger) {
      const mate = second.find((a) => Math.abs(a.share + row.share - 100) < 0.01);
      expect(mate, `share ${row.share}`).toBeDefined();
    }
  });

  it('축에 내려 찍은 자리가 실제 사영이다', async () => {
    const rec = await drive([]);
    const axis = rec.axes[0];
    const frame = collect(rec.events, 'frame:units').map((e) =>
      payloadOf<{ xs: number[]; ys: number[]; cx: number; cy: number }>(e),
    )[0];
    expect(frame.cx).toBeCloseTo(SPEC.mean[0], 4);
    expect(frame.cy).toBeCloseTo(SPEC.mean[1], 4);
    for (let i = 0; i < frame.xs.length; i += 1) {
      const expected =
        (frame.xs[i] - frame.cx) * axis.ax + (frame.ys[i] - frame.cy) * axis.ay;
      expect(axis.t[i]).toBeCloseTo(expected, 10);
    }
    // 사영한 값의 분산이 곧 그 축이 담는 몫의 분자다.
    const n = axis.t.length;
    const varAlong = axis.t.reduce((s, v) => s + v * v, 0) / n;
    const cov = collect(rec.events, 'matrix:cov').map((e) =>
      payloadOf<{ sxx: number; syy: number }>(e),
    )[0];
    expect((varAlong / (cov.sxx + cov.syy)) * 100).toBeCloseTo(SPEC.raw.share, 2);
  });

  it('같은 자리로 다시 보내면 알고리즘이 흘린다', async () => {
    const rec = await drive([standardize(false), pickAxis(1)]);
    expect(rec.ledger).toHaveLength(1);
    expect(rec.axes).toHaveLength(1);
  });

  it('자동 시연 도중 손잡이를 움직이면 그 자리에서 접고 새 값으로 다시 센다', async () => {
    const events: FacetRuntimeEvent[] = [];
    let handed = false;
    let cancelled = false;
    const ctx = {
      data: initialData(),
      get cancelled() {
        return cancelled;
      },
      async emit(event: FacetRuntimeEvent) {
        events.push(event);
      },
      metric() {},
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        if (handed) return null;
        handed = true;
        return standardize(true);
      },
      async waitForInput() {
        cancelled = true;
        throw new Error('cancelled');
      },
    };
    await pca(ctx as unknown as FacetContext<PcaData>);

    const ledger = collect(events, 'ledger:row').map((e) => payloadOf<LedgerRow>(e));
    // 원래 단위의 답은 나오지 않는다 — 첫 쉼에서 접었기 때문이다.
    expect(ledger).toHaveLength(1);
    expect(ledger[0].standardized).toBe(true);
    expect(ledger[0].angleDeg).toBe(SPEC.std.angle);
  });

  it('취소가 걸리면 셈을 마치지 않고 곧바로 손을 뗀다 (C8)', async () => {
    const events: FacetRuntimeEvent[] = [];
    let cancelled = false;
    let cutAt = -1;
    const ctx = {
      data: initialData(),
      get cancelled() {
        return cancelled;
      },
      async emit(event: FacetRuntimeEvent) {
        events.push(event);
        if (cutAt < 0 && event.type === 'state-changed' && event.target === 'matrix:cov') {
          cancelled = true;
          cutAt = events.length;
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
        throw new Error('cancelled');
      },
    };
    await pca(ctx as unknown as FacetContext<PcaData>);

    expect(cutAt).toBeGreaterThan(0);
    // 끊긴 뒤로 몇 걸음 안에 손을 떼야 한다. 완주하면 phase 만 여섯 개 더 쌓인다.
    expect(events.length - cutAt).toBeLessThan(3);
    expect(collect(events, 'ledger:row')).toHaveLength(0);
  });

  it('메트릭은 화면에 뜨는 그 값이다 — 끝자리가 어긋나지 않는다', async () => {
    const rec = await drive([standardize(true), standardize(false)]);
    // 두 틀을 오간 뒤에도 계기가 정확히 −2.98 이다 (누적 델타의 끝자리 어긋남 없음).
    expect(rec.metrics['axis-angle-deg']).toBe(SPEC.raw.angle);
    expect(rec.metrics['variance-share']).toBe(SPEC.raw.share);
    expect(rec.metrics['power-step-count']).toBe(SPEC.raw.moved);

    const std = await drive([standardize(true)]);
    expect(std.metrics['axis-angle-deg']).toBe(SPEC.std.angle);
    expect(std.metrics['variance-share']).toBe(SPEC.std.share);
    expect(std.metrics['power-step-count']).toBe(SPEC.std.moved);
  });

  it('선언한 메트릭만 갱신한다 (C5)', async () => {
    const rec = await drive([standardize(true), pickAxis(2)]);
    const declared = (
      pcaFacet.blocks.controls as { metrics: Array<{ name: string }> }
    ).metrics.map((m) => m.name);
    expect(Object.keys(rec.metrics).sort()).toEqual([...declared].sort());
  });
});

describe('Projector 배선', () => {
  it('phase 를 코드 패널로 넘기고 발신을 stage 메서드로 옮긴다', async () => {
    const rec = await drive([standardize(true), pickAxis(2)]);
    const phaseCalls: (string | null)[] = [];
    const calls: string[] = [];
    const ledger: LedgerRow[] = [];
    let lastAxis: AxisPick | null = null;

    const stage = {
      setFrame() {
        calls.push('frame');
      },
      setCovariance() {
        calls.push('cov');
      },
      setStretch() {
        calls.push('stretch');
      },
      setVector() {
        calls.push('vector');
      },
      setTurn() {
        calls.push('turn');
      },
      setAxis(a: AxisPick) {
        calls.push('axis');
        lastAxis = a;
      },
      addLedgerRow(r: LedgerRow) {
        ledger.push(r);
      },
      reset() {
        calls.push('reset');
      },
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

    const projector = pcaProjector({ stage, codePanel });
    projector.onInit?.(pcaFacet.initialData);
    for (const e of rec.events) await projector.onEvent(e);

    expect(new Set(phaseCalls.filter((p): p is string => p !== null))).toEqual(new Set(PHASES));
    expect(ledger).toHaveLength(2);
    expect(ledger.map((r) => r.angleDeg)).toEqual([SPEC.raw.angle, SPEC.std.angle]);
    expect(lastAxis).not.toBeNull();
    expect((lastAxis as unknown as AxisPick).axisIndex).toBe(2);
    expect(calls).toContain('stretch');
    projector.onReset?.();
    expect(calls).toContain('reset');
  });

  it('view 가 하나도 없어도 던지지 않고, 망가진 payload 는 흘린다', async () => {
    const projector = pcaProjector({});
    projector.onInit?.(pcaFacet.initialData);
    await projector.onEvent({ type: 'phase', payload: { phase: 'center' }, silent: true });
    await projector.onEvent({ type: 'state-changed', target: 'matrix:cov', payload: { sxx: 'x' } });
    await projector.onEvent({ type: 'state-changed', target: 'nope:1', payload: {} });
    await projector.onEvent({ type: 'done' });
    projector.onReset?.();
  });
});

describe('마운트와 재생', () => {
  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
  });

  const fakeCodeView: View = {
    mount(container: HTMLElement) {
      const node = document.createElement('div');
      container.appendChild(node);
      return {
        destroy() {
          node.remove();
        },
        highlightPhase() {},
        clearHighlight() {},
      };
    },
  };

  it('띄워 굴리고 손잡이를 밀면 화면의 수가 바뀌고 앞의 답이 남는다', async () => {
    registerPca();
    registerView('code-view', fakeCodeView);

    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(pcaFacet, host);
    handle.setSpeed(40);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe(CANVAS_BOX);
    expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);

    const svgTexts = (): string[] =>
      [...host.querySelectorAll('svg text')].map((t) => t.textContent ?? '');
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    // 원장에 첫 줄이 찍힐 때까지 — 몫은 원장 칸에만 홀로 뜬다.
    await wait(() => svgTexts().includes('99.88%'), 20_000);
    const first = svgTexts();
    expect(first).toContain('-2.98°');
    expect(first).toContain('99.88%');
    // 축 옆의 읽음도 같은 값이다 (잰 값은 재는 자리에 남긴다).
    expect(first).toContain('-2.98° · 99.88%');
    // 두 축의 퍼짐 자에 붙는 수 — 16 배가 화면에 있다.
    expect(first).toContain('σx = 25.99');
    expect(first).toContain('σy = 1.62');

    const metricText = (name: string): string =>
      host.querySelector(`.facet-control-bar__metric--${name}`)?.textContent ?? '';
    expect(metricText('axis-angle-deg')).toContain('-2.98');
    expect(metricText('variance-share')).toContain('99.88');
    expect(metricText('power-step-count')).toContain('1');

    // 표준화 손잡이를 민다 — 단추가 실제로 지나는 길로 민다.
    const sliders = [...host.querySelectorAll('[role="slider"]')];
    expect(sliders).toHaveLength(2);
    const stdCell = sliders[0].querySelector('[data-seg-index="1"]');
    expect(stdCell).not.toBeNull();
    stdCell?.dispatchEvent(new Event('click'));

    await wait(() => svgTexts().includes('91.67%'), 20_000);
    const after = svgTexts();
    // 앞서 본 답을 지우지 않는다 — 원장에 두 줄이 함께 남는다.
    expect(after).toContain('-45.00°');
    expect(after).toContain('-2.98°');
    expect(after).toContain('91.67%');
    expect(after).toContain('99.88%');
    expect(after).toContain('Δ 42.02°');
    // 표준화하면 두 자의 길이가 같아진다.
    expect(after).toContain('σx = 1.00');
    expect(after).toContain('σy = 1.00');
    expect(metricText('axis-angle-deg')).toContain('-45');
    expect(metricText('power-step-count')).toContain('4');

    // 사영할 축을 제2 로 민다 — 다시 풀지 않고 값만 갈린다.
    const axisCell = sliders[1].querySelector('[data-seg-index="1"]');
    axisCell?.dispatchEvent(new Event('click'));
    await wait(() => svgTexts().includes('45.00° · 8.33%'), 20_000);
    expect(svgTexts()).toContain('45.00° · 8.33%');
    // 축만 갈아 끼웠으므로 원장의 두 줄은 그대로다.
    expect(svgTexts()).toContain('91.67%');
    expect(svgTexts()).toContain('99.88%');

    // 되감기 — 코어가 위젯도 처음 자리로 돌린다 (resetInputs). 원장도 비고
    // 손잡이도 '그대로' 로 돌아간다.
    const resetBtn = host.querySelector('.facet-control-bar__btn--reset');
    expect(resetBtn).not.toBeNull();
    resetBtn?.dispatchEvent(new Event('click'));
    await wait(() => !svgTexts().includes('91.67%'), 20_000);
    expect(svgTexts()).not.toContain('91.67%');
    expect(svgTexts()).not.toContain('Δ 42.02°');
    expect(sliders[0].getAttribute('aria-valuenow')).toBe('0');
    expect(sliders[1].getAttribute('aria-valuenow')).toBe('0');
    // 되감은 뒤 다시 굴리면 처음 자리의 답이 그대로 나온다.
    await wait(() => svgTexts().includes('99.88%'), 20_000);
    expect(svgTexts()).toContain('99.88%');

    // 세로는 마운트 뒤 바뀌지 않는다 (S-view).
    expect(svg?.getAttribute('viewBox')).toBe(CANVAS_BOX);
    expect(errors).toEqual([]);

    handle.destroy();
    console.error = originalError;
    host.remove();
  }, 60_000);

  it('그린 것이 캔버스 밖으로 새지 않는다', async () => {
    const rec = await drive([standardize(true), pickAxis(2)]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(pcaStageView, container, {
      config: {},
      initialData: JSON.parse(JSON.stringify(pcaFacet.initialData)) as Record<string, unknown>,
      locale: 'ko',
      theme: 'light',
    });
    const projector = pcaProjector({ stage });
    for (const e of rec.events) await projector.onEvent(e);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const [, , W, H] = CANVAS_BOX.split(' ').map(Number);
    const outside: string[] = [];
    const check = (label: string, x: number, y: number, node: Element): void => {
      if (x < 0 || x > W || y < 0 || y > H) {
        outside.push(`${node.tagName} ${label} (${x.toFixed(1)}, ${y.toFixed(1)}) ${node.textContent ?? ''}`);
      }
    };
    const attr = (node: Element, name: string): number => Number(node.getAttribute(name));
    for (const node of [...(svg?.querySelectorAll('*') ?? [])]) {
      if (node.tagName === 'text') {
        // 글자 폭은 재 볼 길이 없으므로 넉넉히 잡는다 (11~16px, 글자당 0.62em).
        const size = Number((node.getAttribute('font-size') ?? '11px').replace('px', ''));
        const w = (node.textContent ?? '').length * size * 0.62;
        const anchor = node.getAttribute('text-anchor') ?? 'start';
        const x = attr(node, 'x');
        const left = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
        check('left', left, attr(node, 'y'), node);
        check('right', left + w, attr(node, 'y'), node);
      } else if (node.tagName === 'line') {
        check('a', attr(node, 'x1'), attr(node, 'y1'), node);
        check('b', attr(node, 'x2'), attr(node, 'y2'), node);
      } else if (node.tagName === 'circle') {
        const r = attr(node, 'r');
        check('min', attr(node, 'cx') - r, attr(node, 'cy') - r, node);
        check('max', attr(node, 'cx') + r, attr(node, 'cy') + r, node);
      } else if (node.tagName === 'rect') {
        check('min', attr(node, 'x'), attr(node, 'y'), node);
        check('max', attr(node, 'x') + attr(node, 'width'), attr(node, 'y') + attr(node, 'height'), node);
      }
    }
    expect(outside).toEqual([]);

    // 화면에 실제로 뜬 문자가 알고리즘이 셈한 값이다.
    const texts = [...(svg?.querySelectorAll('text') ?? [])].map((n) => n.textContent ?? '');
    expect(texts).toContain('-2.98°');
    expect(texts).toContain('-45.00°');
    expect(texts).toContain('91.67%');
    expect(texts).toContain('Δ 42.02°');
    expect(texts).toContain('σx = 1.00');
    expect(texts).toContain('45.00° · 8.33%');

    stage.destroy();
    expect(container.querySelector('svg')?.childNodes.length ?? 0).toBe(0);
    container.remove();
  });

  it('러너 밖에서 자료 없이 띄워도 캔버스가 남고 던지지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(pcaStageView, container, {
      config: {},
      locale: 'en',
      theme: 'dark',
    });
    // 러너가 붙여 준 캔버스를 떼어내지 않는다 (S-view).
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe(CANVAS_BOX);
    instance.destroy();
    container.remove();
  });

  it('좌표가 아닌 것이 섞인 initialData 를 받아도 성한 점만 그린다 (C9)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(pcaStageView, container, {
      config: {},
      initialData: {
        points: [{ x: 1, y: 2 }, null, { x: '3', y: 4 }, { y: 5 }, { x: 6, y: 7 }],
      } as unknown as Record<string, unknown>,
      locale: 'ko',
      theme: 'light',
    });
    // 성한 둘만 남는다 — 걸러지지 않으면 NaN 좌표가 점 다섯 개로 새어 나온다.
    // (다이얼의 단위원은 점이 아니라 반지름으로 갈린다.)
    const dots = [...container.querySelectorAll('svg circle')].filter(
      (n) => n.getAttribute('r') === '3.6',
    );
    expect(dots).toHaveLength(2);
    for (const node of dots) {
      expect(Number.isFinite(Number(node.getAttribute('cx')))).toBe(true);
      expect(Number.isFinite(Number(node.getAttribute('cy')))).toBe(true);
    }
    instance.destroy();
    container.remove();
  });

  it('destroy 뒤에는 캔버스 안이 비고 알고리즘도 손을 뗀다', async () => {
    registerPca();
    registerView('code-view', fakeCodeView);

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(pcaFacet, host);
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
