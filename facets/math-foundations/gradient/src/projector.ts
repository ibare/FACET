/**
 * gradient projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 *   init     → 코드 패널 강조를 끄고 stage.showBoard (점이 미끄러진다)
 *   phase    → 코드 패널 highlightPhase
 *   cut      → stage.showCut (자르는 선이 돌고 단면이 바뀌어 간다)
 *   slope    → stage.showSlope (접선이 기운다)
 *   gradient → stage.showGradient (∇f 화살표가 자라 나온다)
 *
 * payload 는 typeof 가드로 읽고, 어긋나면 던진다. 운동 길이는 부를 때마다 재생 속도를 읽는다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { GRADIENT_MOTION_MS } from './algorithm.js';
import type { GradientBoard, GradientCut, GradientGrad, GradientSlope, GradientStage } from './gradient-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight?(): void };

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`gradientProjector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`gradientProjector: ${what} 가 수가 아니다`);
  return v;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`gradientProjector: ${what} 가 글자가 아니다`);
  return v;
}
function pt(v: unknown, what: string): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) throw new Error(`gradientProjector: ${what} 가 [x, y] 가 아니다`);
  return [num(v[0], what), num(v[1], what)];
}
function pts(v: unknown, what: string): [number, number][] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`gradientProjector: ${what} 가 점 목록이 아니다`);
  return v.map((q) => pt(q, what));
}
function bounds(v: unknown): GradientBoard['mapBounds'] {
  const b = rec(v, 'mapBounds');
  return { xMin: num(b.xMin, 'xMin'), xMax: num(b.xMax, 'xMax'), yMin: num(b.yMin, 'yMin'), yMax: num(b.yMax, 'yMax') };
}

function readTicks(v: unknown): GradientBoard['sectionTicks'] {
  if (!Array.isArray(v) || v.length === 0) throw new Error('gradientProjector: sectionTicks 가 목록이 아니다');
  return v.map((raw) => {
    const r = rec(raw, 'tick');
    if (typeof r.origin !== 'boolean') throw new Error('gradientProjector: tick.origin 이 참거짓이 아니다');
    return { t: num(r.t, 'tick.t'), text: str(r.text, 'tick.text'), origin: r.origin };
  });
}

function readBoard(p: Record<string, unknown>): GradientBoard {
  const contoursRaw = p.contours;
  if (!Array.isArray(contoursRaw)) throw new Error('gradientProjector: contours 가 목록이 아니다');
  return {
    p: pt(p.p, 'p'),
    pText: str(p.pText, 'pText'),
    fText: str(p.fText, 'fText'),
    contours: contoursRaw.map((c) => {
      const r = rec(c, 'contour');
      return { level: num(r.level, 'level'), levelText: str(r.levelText, 'levelText'), pts: pts(r.pts, 'contour pts') };
    }),
    mapBounds: bounds(p.mapBounds),
    sectionT: pt(p.sectionT, 'sectionT'),
    sectionTicks: readTicks(p.sectionTicks),
    sectionRange: pt(p.sectionRange, 'sectionRange'),
    barMax: num(p.barMax, 'barMax'),
  };
}

function readCut(p: Record<string, unknown>): GradientCut {
  const ends = pts(p.cutEnds, 'cutEnds');
  if (ends.length !== 2) throw new Error('gradientProjector: cutEnds 는 두 끝');
  return {
    deg: num(p.deg, 'deg'),
    degText: str(p.degText, 'degText'),
    cutHalf: num(p.cutHalf, 'cutHalf'),
    cutEnds: [ends[0] as [number, number], ends[1] as [number, number]],
    section: pts(p.section, 'section'),
  };
}

function readSlope(p: Record<string, unknown>): GradientSlope {
  const tan = pts(p.tangent, 'tangent');
  if (tan.length !== 2) throw new Error('gradientProjector: tangent 는 두 끝');
  return {
    s: num(p.s, 's'),
    sText: str(p.sText, 'sText'),
    tangent: [tan[0] as [number, number], tan[1] as [number, number]],
    tip: pt(p.tip, 'tip'),
  };
}

function readGrad(p: Record<string, unknown>): GradientGrad {
  const axis = p.axis;
  if (axis !== 'x' && axis !== 'y' && axis !== 'none') throw new Error(`gradientProjector: axis 가 x · y · none 이 아니다 — ${String(axis)}`);
  const partialText = p.partialText === null ? null : str(p.partialText, 'partialText');
  const circle = rec(p.circle, 'circle');
  return {
    gradText: str(p.gradText, 'gradText'),
    mag: num(p.mag, 'mag'),
    magText: str(p.magText, 'magText'),
    angleText: str(p.angleText, 'angleText'),
    s: num(p.s, 's'),
    sText: str(p.sText, 'sText'),
    axis,
    partialText,
    arrowTip: pt(p.arrowTip, 'arrowTip'),
    circle: { cx: num(circle.cx, 'cx'), cy: num(circle.cy, 'cy'), r: num(circle.r, 'r') },
  };
}

export const gradientProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as GradientStage | undefined;
  if (!stage) throw new Error('gradientProjector: stage 블록이 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  const motion = () => GRADIENT_MOTION_MS / (runtime ? runtime.getSpeed() : 1);

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'init': {
          code?.highlightPhase(null);
          stage.showBoard(readBoard(rec(event.payload, 'init payload')), motion());
          return;
        }
        case 'phase': {
          const p = rec(event.payload, 'phase payload');
          code?.highlightPhase(str(p.phase, 'phase'));
          return;
        }
        case 'cut':
          stage.showCut(readCut(rec(event.payload, 'cut payload')), motion());
          return;
        case 'slope':
          stage.showSlope(readSlope(rec(event.payload, 'slope payload')), motion());
          return;
        case 'gradient':
          stage.showGradient(readGrad(rec(event.payload, 'gradient payload')), motion());
          return;
        default:
          throw new Error(`gradientProjector: 모르는 이벤트 — ${event.type}`);
      }
    },
    onReset() {
      stage.reset();
      code?.highlightPhase(null);
    },
  };
};
