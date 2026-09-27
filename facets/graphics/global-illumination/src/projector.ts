/**
 * global-illumination projector — algorithm 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 빠진 값은 던진다. 운동의 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 정한다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type {
  GiBounceView,
  GiConvergedView,
  GiInitView,
  GiPatchView,
  GlobalIlluminationStage,
} from './global-illumination-stage.js';

/** 막대가 옮겨 가는 운동의 길이 (속도 1). algorithm 의 판 머리 sleep 과 같은 값 */
const MOTION_MS = 600;

type CodePanel = { highlightPhase(phase: string | null): void };

function fail(msg: string): never {
  throw new Error(`global-illumination projector: ${msg}`);
}

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${key} 가 수가 아니다`);
  return v;
}

function str(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') fail(`${key} 가 문자열이 아니다`);
  return v;
}

function nums(v: unknown, what: string, length?: number): number[] {
  if (!Array.isArray(v)) fail(`${what} 가 배열이 아니다`);
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number' || !Number.isFinite(x)) fail(`${what} 에 수가 아닌 값이 있다`);
    out.push(x);
  }
  if (length !== undefined && out.length !== length) fail(`${what} 의 길이가 ${length} 가 아니다`);
  return out;
}

function lightTable(v: unknown): number[][] {
  if (!Array.isArray(v)) fail('light 가 배열이 아니다');
  return v.map((row: unknown, i: number) => nums(row, `light[${i}]`, 3));
}

function readInit(payload: unknown): GiInitView {
  const p = rec(payload, 'init payload');
  const chart = rec(p.chart, 'chart');
  if (!Array.isArray(p.patches)) fail('patches 가 배열이 아니다');
  const patches: GiPatchView[] = p.patches.map((raw: unknown, i: number) => {
    const q = rec(raw, `patches[${i}]`);
    if (typeof q.emitter !== 'boolean') fail(`patches[${i}].emitter 가 참거짓이 아니다`);
    return {
      id: str(q, 'id'),
      kind: str(q, 'kind'),
      ax: num(q, 'ax'),
      ay: num(q, 'ay'),
      bx: num(q, 'bx'),
      by: num(q, 'by'),
      emitter: q.emitter,
    };
  });
  const light = lightTable(p.light);
  if (light.length !== patches.length) fail(`light 가 ${light.length} 패치 몫인데 패치는 ${patches.length}`);
  return {
    rho: num(p, 'rho'),
    tolerance: num(p, 'tolerance'),
    chart: { bounces: num(chart, 'bounces'), light: num(chart, 'light') },
    probe: str(p, 'probe'),
    patches,
    light,
    floorMean: num(p, 'floorMean'),
  };
}

function readBounce(payload: unknown): GiBounceView {
  const p = rec(payload, 'bounce payload');
  return {
    bounce: num(p, 'bounce'),
    light: lightTable(p.light),
    added: num(p, 'added'),
    accumulated: num(p, 'accumulated'),
    floorMean: num(p, 'floorMean'),
    probeRgb: nums(p.probeRgb, 'probeRgb', 3),
    bleed: num(p, 'bleed'),
  };
}

function readConverged(payload: unknown): GiConvergedView {
  const p = rec(payload, 'converged payload');
  return {
    bounce: num(p, 'bounce'),
    added: num(p, 'added'),
    accumulated: num(p, 'accumulated'),
    tolerance: num(p, 'tolerance'),
    limit: num(p, 'limit'),
  };
}

export const globalIlluminationProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as GlobalIlluminationStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  if (stage === undefined) fail('stage view 가 없다');
  const motion = () => MOTION_MS / Math.max(0.01, runtime === undefined ? 1 : runtime.getSpeed());

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const phase = str(rec(event.payload, 'phase payload'), 'phase');
          code?.highlightPhase(phase);
          return;
        }
        case 'init':
          code?.highlightPhase(null);
          stage.init(readInit(event.payload), motion());
          return;
        case 'bounce':
          stage.bounce(readBounce(event.payload), motion());
          return;
        case 'converged':
          stage.converged(readConverged(event.payload));
          return;
        default:
          fail(`모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      code?.highlightPhase(null);
    },
  };
};
