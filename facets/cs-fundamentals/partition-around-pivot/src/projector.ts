/**
 * partition-around-pivot Projector — 걸음 이벤트를 stage 의 운동으로 옮긴다.
 *
 * payload 는 여기서 한 번에 좁힌다 (C9). stage 는 이미 좁혀진 값만 본다.
 * 캡션 문안은 `FacetJson.messages` 에 있고 여기에는 키와 en 원본만 남는다 (C10).
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorRuntime, ProjectorViews, Translate } from '@ffacet/core/runtime';

import type { PartitionSide } from './algorithm.js';

type PartitionStage = {
  armPivot(): Promise<void>;
  compare(index: number): Promise<void>;
  cross(index: number, side: PartitionSide, slot: number): Promise<void>;
  settlePivot(): Promise<void>;
  finish(): void;
  rewind(): void;
  setCaption(text: string): void;
};

/** 러너 밖에서 마운트할 때를 위한 조회기. `{name}` 자리는 직접 메운다. */
const fallbackTranslate: Translate = (_key, fallback, vars) =>
  fallback.replace(/\{(\w+)\}/g, (m, k: string) =>
    vars && k in vars ? String(vars[k]) : m,
  );

type ComparePayload = { index: number; value: number; pivot: number };
type CrossPayload = {
  index: number;
  value: number;
  pivot: number;
  side: PartitionSide;
  slot: number;
};

function readCompare(payload: unknown): ComparePayload | null {
  const p = payload as Partial<ComparePayload> | undefined;
  if (typeof p?.index !== 'number') return null;
  if (typeof p.value !== 'number' || typeof p.pivot !== 'number') return null;
  return { index: p.index, value: p.value, pivot: p.pivot };
}

function readCross(payload: unknown): CrossPayload | null {
  const p = payload as Partial<CrossPayload> | undefined;
  if (typeof p?.index !== 'number' || typeof p.slot !== 'number') return null;
  if (typeof p.value !== 'number' || typeof p.pivot !== 'number') return null;
  if (p.side !== 'less' && p.side !== 'greater') return null;
  return { index: p.index, value: p.value, pivot: p.pivot, side: p.side, slot: p.slot };
}

export const partitionAroundPivotProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as PartitionStage | undefined;
  const t: Translate = runtime?.t ?? fallbackTranslate;

  return {
    onInit(): void {
      stage?.rewind();
    },

    async onEvent(event): Promise<void> {
      if (!stage) return;
      switch (event.type) {
        case 'pivot-set': {
          const p = event.payload as { pivot?: number } | undefined;
          if (typeof p?.pivot === 'number') {
            stage.setCaption(
              t('caption.intro', 'Every value meets the same pivot {pivot}.', {
                pivot: p.pivot,
              }),
            );
          }
          await stage.armPivot();
          return;
        }

        case 'compare': {
          const p = readCompare(event.payload);
          if (!p) return;
          await stage.compare(p.index);
          return;
        }

        case 'cross': {
          const p = readCross(event.payload);
          if (!p) return;
          stage.setCaption(
            p.side === 'less'
              ? t('caption.less', '{value} < {pivot} — it crosses to the left.', {
                  value: p.value,
                  pivot: p.pivot,
                })
              : t('caption.greater', '{value} > {pivot} — it crosses to the right.', {
                  value: p.value,
                  pivot: p.pivot,
                }),
          );
          await stage.cross(p.index, p.side, p.slot);
          return;
        }

        case 'pivot-final': {
          stage.setCaption(
            t('caption.pivotFinal', 'The pivot never crossed. Its place is settled.'),
          );
          await stage.settlePivot();
          return;
        }

        case 'done': {
          const p = event.payload as
            | { lessCount?: number; greaterCount?: number }
            | undefined;
          if (typeof p?.lessCount === 'number' && typeof p.greaterCount === 'number') {
            stage.setCaption(
              t(
                'caption.done',
                '{less} on the left, {greater} on the right — split, not sorted.',
                { less: p.lessCount, greater: p.greaterCount },
              ),
            );
          }
          stage.finish();
          return;
        }

        case 'rewind': {
          stage.rewind();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각에 없다. 들어오면 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
