/**
 * 변환의 합성 projector — algorithm 이벤트(round · compose · apply · phase)를 무대 메서드로 옮긴다.
 *
 * payload 는 `typeof` 가드로 읽고, 없는 값은 지어내지 않고 던진다. 운동 길이는 판 머리에서
 * 받은 motionMs 를 그때그때의 재생 속도로 나눈다.
 */

import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type {
  ScaleRotateTranslateStage,
  SrtFactorId,
  SrtFactorView,
  SrtPoint,
  SrtWindow,
} from './scale-rotate-translate-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function need(v: unknown, where: string): Record<string, unknown> {
  if (!isRecord(v)) throw new Error(`scaleRotateTranslateProjector: ${where} 가 객체가 아니다`);
  return v;
}

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`scaleRotateTranslateProjector: ${where} 에 수가 없다 (${String(v)})`);
  }
  return v;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string' || v === '') throw new Error(`scaleRotateTranslateProjector: ${where} 에 글자가 없다`);
  return v;
}

function factorId(v: unknown, where: string): SrtFactorId {
  if (v === 'scale' || v === 'rotate' || v === 'shift') return v;
  throw new Error(`scaleRotateTranslateProjector: ${where} 는 모르는 변환이다 (${String(v)})`);
}

function readPoint(v: unknown, where: string): SrtPoint {
  const p = need(v, where);
  return { id: str(p.id, `${where}.id`), x: num(p.x, `${where}.x`), y: num(p.y, `${where}.y`) };
}

function readPoints(v: unknown, where: string): SrtPoint[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`scaleRotateTranslateProjector: ${where} 가 비었다`);
  return v.map((p, i) => readPoint(p, `${where}[${i}]`));
}

function readMatrix(v: unknown, where: string): number[] {
  if (!Array.isArray(v) || v.length !== 9) throw new Error(`scaleRotateTranslateProjector: ${where} 는 9 칸이어야 한다`);
  return v.map((x, i) => num(x, `${where}[${i}]`));
}

function readWindow(v: unknown): SrtWindow {
  const w = need(v, 'window');
  return {
    xMin: num(w.xMin, 'window.xMin'),
    xMax: num(w.xMax, 'window.xMax'),
    yMin: num(w.yMin, 'window.yMin'),
    yMax: num(w.yMax, 'window.yMax'),
  };
}

function readFactor(v: unknown, where: string): SrtFactorView {
  const f = need(v, where);
  const id = factorId(f.id, `${where}.id`);
  switch (id) {
    case 'scale':
      return { id, sx: num(f.sx, `${where}.sx`), sy: num(f.sy, `${where}.sy`) };
    case 'rotate':
      return { id, degrees: num(f.degrees, `${where}.degrees`), px: num(f.px, `${where}.px`), py: num(f.py, `${where}.py`) };
    case 'shift':
      return { id, dx: num(f.dx, `${where}.dx`), dy: num(f.dy, `${where}.dy`) };
  }
}

export const scaleRotateTranslateProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ScaleRotateTranslateStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let motionMs: number | null = null;

  const stageOf = (): ScaleRotateTranslateStage => {
    if (stage === undefined) throw new Error('scaleRotateTranslateProjector: stage 블록이 없다');
    return stage;
  };
  const duration = (): number => {
    if (motionMs === null) throw new Error('scaleRotateTranslateProjector: 판 머리 없이 걸음이 왔다');
    const speed = runtime === undefined ? 1 : runtime.getSpeed();
    return speed > 0 ? motionMs / speed : motionMs;
  };

  return {
    onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = need(event.payload, 'phase.payload');
          code?.highlightPhase(str(p.phase, 'phase.phase'));
          return;
        }
        case 'round': {
          const p = need(event.payload, 'round.payload');
          motionMs = num(p.motionMs, 'round.motionMs');
          if (!Array.isArray(p.factors) || p.factors.length === 0) {
            throw new Error('scaleRotateTranslateProjector: round.factors 가 비었다');
          }
          code?.highlightPhase(null);
          stageOf().begin({
            window: readWindow(p.window),
            shape: readPoints(p.shape, 'round.shape'),
            pivot: readPoint(p.pivot, 'round.pivot'),
            factors: p.factors.map((f, i) => readFactor(f, `round.factors[${i}]`)),
            matrix: readMatrix(p.matrix, 'round.matrix'),
            durationMs: duration(),
          });
          return;
        }
        case 'compose': {
          const p = need(event.payload, 'compose.payload');
          let arc: { px: number; py: number; degrees: number } | null = null;
          if (p.arc !== null) {
            const a = need(p.arc, 'compose.arc');
            arc = { px: num(a.px, 'arc.px'), py: num(a.py, 'arc.py'), degrees: num(a.degrees, 'arc.degrees') };
          }
          stageOf().compose({
            step: num(p.step, 'compose.step'),
            factorIndex: num(p.factorIndex, 'compose.factorIndex'),
            factor: factorId(p.factor, 'compose.factor'),
            matrix: readMatrix(p.matrix, 'compose.matrix'),
            points: readPoints(p.points, 'compose.points'),
            arc,
            shiftX: num(p.shiftX, 'compose.shiftX'),
            shiftY: num(p.shiftY, 'compose.shiftY'),
            durationMs: duration(),
          });
          return;
        }
        case 'apply': {
          const p = need(event.payload, 'apply.payload');
          stageOf().apply({
            step: num(p.step, 'apply.step'),
            matrix: readMatrix(p.matrix, 'apply.matrix'),
            points: readPoints(p.points, 'apply.points'),
            same: num(p.same, 'apply.same'),
            unitW: num(p.unitW, 'apply.unitW'),
            total: num(p.total, 'apply.total'),
            durationMs: duration(),
          });
          return;
        }
        default:
          throw new Error(`scaleRotateTranslateProjector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset() {
      motionMs = null;
      code?.highlightPhase(null);
      stage?.reset();
    },
  };
};
