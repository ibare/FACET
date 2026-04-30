/**
 * 2D 행렬 변환 facet projector — algorithm 이벤트를 matrix-transform-stage view
 * 메서드 호출로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 셀과 화살표의 1:1 색 동기.
 *   2. 두 겹 격자 (옅은 항등 + 진한 변환).
 *   3. 표준 4종 + 자유 프리셋 토글.
 *   4. |det| 게이지의 면적·부호 동시 사건성.
 *   5. 보조 점의 동기 운동.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type {
  Matrix2x2,
  PresetMode,
  PresetParams,
  HelperPoint,
  ReflectAxis,
} from './algorithm.js';

type MatrixStage = {
  reset(): void;
  init(payload: {
    matrix: Matrix2x2;
    det: number;
    preset: PresetMode;
    presetParams: PresetParams;
    points: HelperPoint[];
    axisMax: number;
    maxPoints: number;
  }): void;
  applyMatrix(payload: {
    matrix: Matrix2x2;
    det: number;
    dim: 'a' | 'b' | 'c' | 'd' | 'all';
    cause: 'cell' | 'tip' | 'preset' | 'demo' | 'identity';
  }): void;
  applyPreset(payload: { mode: PresetMode; params: PresetParams }): void;
  applyPresetParam(payload: {
    kind: 'theta' | 's' | 't' | 'k' | 'axis';
    value: number | ReflectAxis;
  }): void;
  applyPointAdded(payload: { id: number; u: number; v: number }): void;
  applyPointRemoved(payload: { id: number }): void;
  applyPointMoved(payload: { id: number; u: number; v: number }): void;
  signalDetZero(payload: { matrix: Matrix2x2 }): void;
  signalDetFlipped(payload: { sign: 'pos' | 'neg'; det: number }): void;
  signalReset(): void;
};

function asMatrix(v: unknown): Matrix2x2 {
  const o = (v ?? {}) as Partial<Matrix2x2>;
  return {
    a: typeof o.a === 'number' ? o.a : 1,
    b: typeof o.b === 'number' ? o.b : 0,
    c: typeof o.c === 'number' ? o.c : 0,
    d: typeof o.d === 'number' ? o.d : 1,
  };
}

function asPresetMode(v: unknown): PresetMode {
  if (v === 'rotate' || v === 'scale' || v === 'shear' || v === 'reflect') return v;
  return 'free';
}

function asAxis(v: unknown): ReflectAxis {
  if (v === 'y' || v === 'origin') return v;
  return 'x';
}

function asPresetParams(v: unknown): PresetParams {
  const o = (v ?? {}) as Partial<PresetParams>;
  return {
    theta: typeof o.theta === 'number' ? o.theta : 0,
    s: typeof o.s === 'number' ? o.s : 1,
    t: typeof o.t === 'number' ? o.t : 1,
    k: typeof o.k === 'number' ? o.k : 0,
    axis: asAxis(o.axis),
  };
}

function asPoints(v: unknown): HelperPoint[] {
  if (!Array.isArray(v)) return [];
  const result: HelperPoint[] = [];
  for (const item of v) {
    const o = (item ?? {}) as Partial<HelperPoint>;
    if (
      typeof o.id === 'number' &&
      typeof o.u === 'number' &&
      typeof o.v === 'number'
    ) {
      result.push({ id: o.id, u: o.u, v: o.v });
    }
  }
  return result;
}

export const matrixTransformProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as MatrixStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
    },

    onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as Partial<{
            matrix: Matrix2x2;
            det: number;
            preset: PresetMode;
            presetParams: PresetParams;
            points: HelperPoint[];
            axisMax: number;
            maxPoints: number;
          }>;
          stage.init({
            matrix: asMatrix(p.matrix),
            det: typeof p.det === 'number' ? p.det : 1,
            preset: asPresetMode(p.preset),
            presetParams: asPresetParams(p.presetParams),
            points: asPoints(p.points),
            axisMax: typeof p.axisMax === 'number' ? p.axisMax : 3,
            maxPoints: typeof p.maxPoints === 'number' ? p.maxPoints : 3,
          });
          break;
        }

        case 'matrix-changed': {
          const p = (event.payload ?? {}) as Partial<{
            matrix: Matrix2x2;
            det: number;
            dim: 'a' | 'b' | 'c' | 'd' | 'all';
            cause: 'cell' | 'tip' | 'preset' | 'demo' | 'identity';
          }>;
          stage.applyMatrix({
            matrix: asMatrix(p.matrix),
            det: typeof p.det === 'number' ? p.det : 1,
            dim: p.dim ?? 'all',
            cause: p.cause ?? 'cell',
          });
          break;
        }

        case 'preset-changed': {
          const p = (event.payload ?? {}) as Partial<{
            mode: PresetMode;
            params: PresetParams;
          }>;
          stage.applyPreset({
            mode: asPresetMode(p.mode),
            params: asPresetParams(p.params),
          });
          break;
        }

        case 'preset-param-changed': {
          const p = (event.payload ?? {}) as Partial<{
            kind: 'theta' | 's' | 't' | 'k' | 'axis';
            value: number | ReflectAxis;
          }>;
          if (!p.kind) break;
          stage.applyPresetParam({
            kind: p.kind,
            value: p.value as number | ReflectAxis,
          });
          break;
        }

        case 'point-added': {
          const p = (event.payload ?? {}) as Partial<{ id: number; u: number; v: number }>;
          if (typeof p.id !== 'number') break;
          stage.applyPointAdded({
            id: p.id,
            u: typeof p.u === 'number' ? p.u : 0,
            v: typeof p.v === 'number' ? p.v : 0,
          });
          break;
        }

        case 'point-removed': {
          const p = (event.payload ?? {}) as Partial<{ id: number }>;
          if (typeof p.id !== 'number') break;
          stage.applyPointRemoved({ id: p.id });
          break;
        }

        case 'point-moved': {
          const p = (event.payload ?? {}) as Partial<{ id: number; u: number; v: number }>;
          if (typeof p.id !== 'number') break;
          stage.applyPointMoved({
            id: p.id,
            u: typeof p.u === 'number' ? p.u : 0,
            v: typeof p.v === 'number' ? p.v : 0,
          });
          break;
        }

        case 'det-zero': {
          const p = (event.payload ?? {}) as Partial<{ matrix: Matrix2x2 }>;
          stage.signalDetZero({ matrix: asMatrix(p.matrix) });
          break;
        }

        case 'det-flipped': {
          const p = (event.payload ?? {}) as Partial<{ sign: 'pos' | 'neg'; det: number }>;
          stage.signalDetFlipped({
            sign: p.sign === 'neg' ? 'neg' : 'pos',
            det: typeof p.det === 'number' ? p.det : 0,
          });
          break;
        }

        default:
          // mode / phase 등 silent 메타 — 의도적 drop.
          break;
      }
    },

    onReset() {
      if (!stage) return;
      stage.reset();
      stage.signalReset();
    },
  };
};
