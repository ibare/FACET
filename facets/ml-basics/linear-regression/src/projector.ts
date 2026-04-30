/**
 * 선형 회귀 facet projector — algorithm 이벤트를 linear-regression-stage view
 * 메서드로 번역.
 *
 * 시각적 정체성 (기획 §5):
 *   1. 데이터 평면의 직선 + 잔차 정사각형 — 면적의 합으로서의 손실.
 *   2. 매개변수 평면의 등고선 + 굴러가는 점 — 두 시점의 1:1 동기.
 *   3. 두 게이지 — 잔차 부호 합 / 잔차 제곱 합 비대칭 운동.
 *   4. 학습률 segmented-slider — 운동 모양 차이 (느림 / 적정 / 발산).
 *   5. 수렴 깃발 + 손실 곡선 — 운동의 정지에 사건성을 부여.
 */

import type { ProjectorFactory } from '@facet/core/runtime';
import type { Point, LrSegment } from './algorithm.js';

type LinRegStage = {
  reset(): void;
  init(payload: {
    points: Point[];
    w: number;
    b: number;
    rss: number;
    residualSum: number;
    lr: number;
    lrSegmentIndex: number;
    lrSegments: LrSegment[];
    contourLevels: number;
    paramRange: [number, number, number, number];
    epsilon: number;
  }): void;
  setBaseCaption(text: string): void;
  setCaption(text: string, opts?: { duration?: number }): void;
  signalStepBegin(payload: {
    t: number;
    w: number;
    b: number;
    lr: number;
  }): Promise<void>;
  signalStepEnd(payload: {
    t: number;
    w: number;
    b: number;
    prevW: number;
    prevB: number;
    rss: number;
    prevRss: number;
    residualSum: number;
  }): Promise<void>;
  signalConverged(payload: { t: number; w: number; b: number; rss: number }): Promise<void>;
  signalDiverged(payload: { t: number; w: number; b: number; rss: number }): Promise<void>;
  applyLrChanged(value: number, segmentIndex: number): void;
  signalReset(): void;
};

const BASE_CAPTION =
  '선형 회귀는 점 무리에 직선 한 줄을 끼우되, 잔차의 제곱을 면적으로 환원해 그 면적의 합이 가장 작아지도록 직선을 매 반복마다 한 걸음씩 회전·이동시키는 학습 운동이다.';

export const linearRegressionProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as LinRegStage | undefined;

  return {
    onInit(_initialData) {
      if (!stage) return;
      stage.reset();
      stage.setBaseCaption(BASE_CAPTION);
    },

    async onEvent(event) {
      if (!stage) return;

      switch (event.type) {
        case 'init': {
          const p = (event.payload ?? {}) as Partial<{
            points: Point[];
            w: number;
            b: number;
            rss: number;
            residualSum: number;
            lr: number;
            lrSegmentIndex: number;
            lrSegments: LrSegment[];
            contourLevels: number;
            paramRange: [number, number, number, number];
            epsilon: number;
          }>;
          stage.init({
            points: Array.isArray(p.points) ? p.points : [],
            w: typeof p.w === 'number' ? p.w : 0,
            b: typeof p.b === 'number' ? p.b : 0,
            rss: typeof p.rss === 'number' ? p.rss : 0,
            residualSum: typeof p.residualSum === 'number' ? p.residualSum : 0,
            lr: typeof p.lr === 'number' ? p.lr : 0,
            lrSegmentIndex: typeof p.lrSegmentIndex === 'number' ? p.lrSegmentIndex : 0,
            lrSegments: Array.isArray(p.lrSegments) ? p.lrSegments : [],
            contourLevels: typeof p.contourLevels === 'number' ? p.contourLevels : 6,
            paramRange:
              Array.isArray(p.paramRange) && p.paramRange.length === 4
                ? (p.paramRange as [number, number, number, number])
                : [-2, 4, -1, 4],
            epsilon: typeof p.epsilon === 'number' ? p.epsilon : 0.005,
          });
          break;
        }

        case 'step-begin': {
          const p = (event.payload ?? {}) as Partial<{
            t: number;
            w: number;
            b: number;
            lr: number;
          }>;
          await stage.signalStepBegin({
            t: typeof p.t === 'number' ? p.t : 0,
            w: typeof p.w === 'number' ? p.w : 0,
            b: typeof p.b === 'number' ? p.b : 0,
            lr: typeof p.lr === 'number' ? p.lr : 0,
          });
          break;
        }

        case 'step-end': {
          const p = (event.payload ?? {}) as Partial<{
            t: number;
            w: number;
            b: number;
            prevW: number;
            prevB: number;
            rss: number;
            prevRss: number;
            residualSum: number;
          }>;
          await stage.signalStepEnd({
            t: typeof p.t === 'number' ? p.t : 0,
            w: typeof p.w === 'number' ? p.w : 0,
            b: typeof p.b === 'number' ? p.b : 0,
            prevW: typeof p.prevW === 'number' ? p.prevW : 0,
            prevB: typeof p.prevB === 'number' ? p.prevB : 0,
            rss: typeof p.rss === 'number' ? p.rss : 0,
            prevRss: typeof p.prevRss === 'number' ? p.prevRss : 0,
            residualSum: typeof p.residualSum === 'number' ? p.residualSum : 0,
          });
          break;
        }

        case 'converged': {
          const p = (event.payload ?? {}) as Partial<{
            t: number;
            w: number;
            b: number;
            rss: number;
          }>;
          await stage.signalConverged({
            t: typeof p.t === 'number' ? p.t : 0,
            w: typeof p.w === 'number' ? p.w : 0,
            b: typeof p.b === 'number' ? p.b : 0,
            rss: typeof p.rss === 'number' ? p.rss : 0,
          });
          break;
        }

        case 'diverged': {
          const p = (event.payload ?? {}) as Partial<{
            t: number;
            w: number;
            b: number;
            rss: number;
          }>;
          await stage.signalDiverged({
            t: typeof p.t === 'number' ? p.t : 0,
            w: typeof p.w === 'number' ? p.w : 0,
            b: typeof p.b === 'number' ? p.b : 0,
            rss: typeof p.rss === 'number' ? p.rss : 0,
          });
          break;
        }

        case 'lr-changed': {
          const p = (event.payload ?? {}) as Partial<{ value: number; segmentIndex: number }>;
          stage.applyLrChanged(
            typeof p.value === 'number' ? p.value : 0,
            typeof p.segmentIndex === 'number' ? p.segmentIndex : 0,
          );
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
      stage.setBaseCaption(BASE_CAPTION);
      stage.signalReset();
    },
  };
};
