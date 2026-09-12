/**
 * 쪼개서 번호로 — projector.
 *
 * algorithm 이 내보내는 payload 를 좁혀 stage 로 넘긴다 (C9). `event.payload` 를
 * 그대로 흘려보내지 않고, 필드마다 `typeof` / `Array.isArray` 로 거른 정형 객체를
 * 조립한다.
 *
 * 화면 문안은 여기서 `runtime.t` 로 조회한다. 코드에 남는 것은 키와 en 원본뿐이고
 * 문안은 `facet.ts` 의 `messages` 에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type Stage = {
  splitRow(p: { row: number; front: number[]; back: number[] }): Promise<void> | void;
  assignRow(p: {
    row: number;
    frontCode: number;
    backCode: number;
    frontDists: number[];
    backDists: number[];
    error: number;
  }): Promise<void> | void;
  showSummary(p: { plainBytes: number; codeBytes: number }): Promise<void> | void;
  rewind?(): void;
  setCaption?(text: string): void;
};

/** 수의 배열만 통과시킨다. 아니면 빈 배열. */
function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

export const splitAndNumberProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      const p = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'split': {
          const front = numbers(p.front);
          const back = numbers(p.back);
          stage.setCaption?.(
            tr('caption.split', 'Cut into two halves: ({a}) and ({b}).', {
              a: front.join(', '),
              b: back.join(', '),
            }),
          );
          await stage.splitRow({ row: num(p.row), front, back });
          return;
        }

        case 'assign': {
          const frontCode = num(p.frontCode);
          const backCode = num(p.backCode);
          // 앞뒤가 서로 다른 번호를 고른 줄은 이 조각의 증거다. 같은 일이므로
          // 걸음을 나누지 않고 문안만 그 사실을 가리킨다.
          const text =
            frontCode === backCode
              ? tr('caption.pick', 'Each half switches to its nearest centroid. What is left: {a}, {b}.', {
                  a: frontCode,
                  b: backCode,
                })
              : tr('caption.pickSplit', 'The two halves land on different centroids: {a}, {b}.', {
                  a: frontCode,
                  b: backCode,
                });
          stage.setCaption?.(text);
          await stage.assignRow({
            row: num(p.row),
            frontCode,
            backCode,
            frontDists: numbers(p.frontDists),
            backDists: numbers(p.backDists),
            error: num(p.error),
          });
          return;
        }

        case 'summary': {
          const plainBytes = num(p.plainBytes);
          const codeBytes = num(p.codeBytes);
          stage.setCaption?.(
            tr('caption.summary', 'Four values per row become two numbers — {from} bytes down to {to} bytes.', {
              from: plainBytes,
              to: codeBytes,
            }),
          );
          await stage.showSummary({ plainBytes, codeBytes });
          return;
        }

        case 'rewind': {
          stage.rewind?.();
          stage.setCaption?.('');
          return;
        }

        default:
          // 그 밖의 type 은 이 facet 이 내보내지 않는다. 와도 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
      stage?.setCaption?.('');
    },
  };
};
