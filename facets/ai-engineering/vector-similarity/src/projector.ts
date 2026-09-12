/**
 * vectorSimilarity projector — 알고리즘의 걸음을 stage 메서드 호출로 옮긴다.
 *
 * 화면에 뜨는 문장은 여기서 `runtime.t` 로 조회한다. 키와 en 원본만 코드에
 * 남고 문안은 `facet.ts` 의 선언에 있다 (C10).
 */

import type { ProjectorFactory, ProjectorInstance, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { MeasureKind } from './algorithm.js';

type Stage = {
  setMeasure?(measure: MeasureKind): void;
  showMeasured?(mark: { id: string; x: number; y: number; value: number; measure: MeasureKind }): Promise<void> | void;
  applyRanking?(mark: { order: string[] }): Promise<void> | void;
  setCaption?(text: string): void;
  resetMarks?(): void;
};

const MEASURES: readonly MeasureKind[] = ['cosine', 'euclidean', 'dot'];

function isMeasure(v: unknown): v is MeasureKind {
  return typeof v === 'string' && (MEASURES as readonly string[]).includes(v);
}

/** payload 를 좁혀서 넘긴다. 열린 값을 그대로 stage 로 밀지 않는다 (C9). */
function readChosen(payload: unknown): MeasureKind | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  return isMeasure(p.measure) ? p.measure : null;
}

function readMeasured(
  payload: unknown,
): { id: string; x: number; y: number; value: number; measure: MeasureKind } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.id !== 'string') return null;
  if (typeof p.x !== 'number' || typeof p.y !== 'number') return null;
  if (typeof p.value !== 'number') return null;
  if (!isMeasure(p.measure)) return null;
  return { id: p.id, x: p.x, y: p.y, value: p.value, measure: p.measure };
}

function readRanked(payload: unknown): { order: string[]; changed: number } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.order) || !p.order.every((v): v is string => typeof v === 'string')) return null;
  if (typeof p.changed !== 'number') return null;
  return { order: p.order, changed: p.changed };
}

export const vectorSimilarityProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /**
   * 방금 판에서 자리를 옮긴 후보의 수.
   *
   * `ranked` 가 1등을 말하고 한 걸음 뒤 `done` 이 "몇이 옮겼는지" 로 판을 닫는다.
   * 두 문장을 한 이벤트에 몰면 뒤엣것이 앞엣것을 곧바로 덮어써 읽을 틈이 없다.
   * Projector 가 시각 상태를 자기 안에 두는 것은 허용된다 (원칙 5).
   */
  let changed = 0;

  return {
    onInit(): void {
      // stage 의 mount 가 이미 initialData 를 받아 장면을 세웠다. 여기서 다시
      // 좁혀 밀어 넣으면 좁히는 규칙이 두 벌이 된다 (S-piece). 되감기로 다시
      // 불릴 때를 위해 흔적만 걷는다.
      changed = 0;
      stage?.resetMarks?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'measure-chosen': {
          const measure = readChosen(event.payload);
          if (!measure) return;
          stage?.setMeasure?.(measure);
          stage?.setCaption?.(tr('caption.ruler', 'Ruler in hand: {measure}.', { measure }));
          return;
        }
        case 'measured': {
          const mark = readMeasured(event.payload);
          if (!mark) return;
          await stage?.showMeasured?.(mark);
          return;
        }
        case 'ranked': {
          const mark = readRanked(event.payload);
          if (!mark) return;
          changed = mark.changed;
          await stage?.applyRanking?.({ order: mark.order });
          const top = mark.order[0];
          if (top !== undefined) {
            stage?.setCaption?.(tr('caption.top', 'Closest by this ruler: {name}.', { name: top }));
          }
          return;
        }
        case 'done': {
          stage?.setCaption?.(
            changed === 0
              // 셈은 늘 **첫 잣대**와 견준다. 그래서 0 은 "아무도 안 움직였다" 가
              // 아니라 "기준 차례로 돌아왔다" 는 뜻이다 — 직전 잣대에서 오면 다섯이
              // 눈앞에서 미끄러진 직후라, 앞의 문안은 그 순간을 거짓으로 말한다.
              ? tr(
                  'caption.same',
                  'Back to the reference order. This is the one the others are measured against.',
                )
              : tr('caption.moved', 'Candidates that changed places: {n}.', { n: changed }),
          );
          return;
        }
        default:
          // 그 밖의 type 은 이 facet 이 발신하지 않는다. 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      changed = 0;
      stage?.resetMarks?.();
    },
  };
};
