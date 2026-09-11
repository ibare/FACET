/**
 * reduce-to-known 의 번역기 — 걸음을 그림의 동작으로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). `event.payload` 를 그대로 흘려보내면
 * stage 가 알 수 없는 모양을 믿고 그리게 된다.
 *
 * `initialData` 는 stage 의 `mount` 가 이미 받았으므로 `onInit` 을 두지 않는다
 * (S-piece — 좁히는 규칙이 두 벌이 되지 않게).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorViews,
} from '@ffacet/core/runtime';

type Stage = {
  showBoard(): Promise<void>;
  seat(subject: string, linkedTo: string[]): Promise<void>;
  paint(subjects: string[], periods: number[], total: number): Promise<void>;
  readBack(total: number): Promise<void>;
  rewind(): void;
};

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function counts(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

export const reduceToKnownProjector: ProjectorFactory = (
  views: ProjectorViews,
): ProjectorInstance => {
  const stage = views['stage'] as unknown as Stage | undefined;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      const payload = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'board':
          await stage.showBoard();
          return;

        case 'place': {
          const subject = payload['subject'];
          if (typeof subject !== 'string' || subject === '') return;
          await stage.seat(subject, strings(payload['linkedTo']));
          return;
        }

        case 'color': {
          const subjects = strings(payload['subjects']);
          const periods = counts(payload['periods']);
          const total = payload['total'];
          if (typeof total !== 'number' || total < 1) return;
          if (subjects.length === 0 || subjects.length !== periods.length) return;
          await stage.paint(subjects, periods, total);
          return;
        }

        case 'schedule': {
          const total = payload['total'];
          if (typeof total !== 'number' || total < 1) return;
          await stage.readBack(total);
          return;
        }

        case 'rewind':
          stage.rewind();
          return;

        default:
          // 이 조각이 내는 어휘는 위 다섯뿐이다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind();
    },
  };
};
