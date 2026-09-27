/**
 * integral projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * payload 는 typeof 가드로 읽고, 어긋나면 던진다. 운동 길이는 MOTION_MS 를 그때그때의 재생 속도로 나눈다.
 * 판 머리(init)에서 코드 패널 강조를 끈다 — 앞 판의 phase 를 남기지 않는다.
 */
import type { ProjectorFactory } from '@ffacet/core/runtime';
import { MOTION_MS } from './algorithm.js';
import type { CompareView, InitView, IntegralStage, Pt, SecantView, Seg, StripsView, SumView } from './integral-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`integral: ${what} 는 객체다`);
  return v as Obj;
}
function num(o: Obj, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`integral: payload.${k} 는 수다`);
  return v;
}
function numOrNull(o: Obj, k: string): number | null {
  const v = o[k];
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`integral: payload.${k} 는 수거나 null 이다`);
  return v;
}
function nums(o: Obj, k: string): number[] {
  const v = o[k];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) throw new Error(`integral: payload.${k} 는 수 목록이다`);
  return v as number[];
}
function pt(o: Obj, k: string): Pt {
  const p = obj(o[k], k);
  return { x: num(p, 'x'), y: num(p, 'y') };
}
function seg(o: Obj, k: string): Seg {
  const s = obj(o[k], k);
  return { x0: num(s, 'x0'), y0: num(s, 'y0'), x1: num(s, 'x1'), y1: num(s, 'y1') };
}

function readInit(p: Obj): InitView {
  const ax = obj(p.axis, 'axis');
  return {
    rule: num(p, 'rule'),
    h: num(p, 'h'),
    n: num(p, 'n'),
    a: num(p, 'a'),
    fa: num(p, 'fa'),
    lo: num(p, 'lo'),
    hi: num(p, 'hi'),
    terms: nums(p, 'terms'),
    axis: {
      xMin: num(ax, 'xMin'),
      xMax: num(ax, 'xMax'),
      yMin: num(ax, 'yMin'),
      yMax: num(ax, 'yMax'),
      xTicks: nums(ax, 'xTicks'),
      yTicks: nums(ax, 'yTicks'),
    },
    curveX: nums(p, 'curveX'),
    curveY: nums(p, 'curveY'),
  };
}
function readSecant(p: Obj): SecantView {
  return {
    rule: num(p, 'rule'),
    h: num(p, 'h'),
    p: pt(p, 'p'),
    q: pt(p, 'q'),
    line: seg(p, 'line'),
    tangent: seg(p, 'tangent'),
    estimate: num(p, 'estimate'),
    error: num(p, 'error'),
    trueSlope: num(p, 'trueSlope'),
  };
}
function readStrips(p: Obj): StripsView {
  return { rule: num(p, 'rule'), n: num(p, 'n'), w: num(p, 'w'), x0s: nums(p, 'x0s'), sx: nums(p, 'sx'), sy: nums(p, 'sy') };
}
function readSum(p: Obj): SumView {
  return { n: num(p, 'n'), partials: nums(p, 'partials'), estimate: num(p, 'estimate'), error: num(p, 'error'), trueArea: num(p, 'trueArea') };
}
function readCompare(p: Obj): CompareView {
  return {
    h: num(p, 'h'),
    h2: numOrNull(p, 'h2'),
    slopeError: num(p, 'slopeError'),
    areaError: num(p, 'areaError'),
    slopeError2: numOrNull(p, 'slopeError2'),
    areaError2: numOrNull(p, 'areaError2'),
    slopeRatio: numOrNull(p, 'slopeRatio'),
    areaRatio: numOrNull(p, 'areaRatio'),
    barMax: num(p, 'barMax'),
  };
}

export const integralProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as IntegralStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const need = (): IntegralStage => {
    if (!stage) throw new Error('integral: stage 블록이 없다');
    return stage;
  };
  const motion = (): number => MOTION_MS / (runtime ? runtime.getSpeed() : 1);

  return {
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase payload');
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('integral: phase 이름이 없다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'init':
          code?.highlightPhase?.(null);
          need().begin(readInit(obj(event.payload, 'init payload')));
          return;
        case 'secant':
          need().showSecant(readSecant(obj(event.payload, 'secant payload')), motion());
          return;
        case 'strips':
          need().showStrips(readStrips(obj(event.payload, 'strips payload')), motion());
          return;
        case 'sum':
          need().showSum(readSum(obj(event.payload, 'sum payload')), motion());
          return;
        case 'compare':
          need().showCompare(readCompare(obj(event.payload, 'compare payload')), motion());
          return;
        default:
          throw new Error(`integral: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      code?.highlightPhase?.(null);
      stage?.reset();
    },
  };
};
