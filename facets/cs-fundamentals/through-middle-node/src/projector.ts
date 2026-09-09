/**
 * through-middle-node projector — 물음 하나를 화면의 한 걸음으로 옮긴다.
 *
 * 알고리즘은 수와 이름만 보내고 (`legA` / `legB` / `sum` / `current`), 무엇이라
 * 말할지는 여기서 정한다. 문안은 `facet.ts` 의 `messages` 에 있고 여기에는 키와
 * en 원본만 남는다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 열린 ViewInstance 를 여기서 한 번만 좁힌다 (C9). */
type Stage = {
  setScene?(scene: { nodes: string[]; edges: { from: string; to: string; weight: number }[] }): void;
  rewind?(): void;
  openRoads?(ledger: { middles: string[]; rows: number }, caption: string): Promise<void>;
  setMiddle?(middle: string, order: number, caption: string): Promise<void>;
  ask?(
    question: {
      from: string;
      to: string;
      middle: string;
      middleIndex: number;
      pairIndex: number;
      legA: number | null;
      legB: number | null;
      sum: number | null;
      current: number | null;
      shorter: boolean;
    },
    texts: { question: string; verdict: string },
  ): Promise<void>;
  finish?(caption: string): Promise<void>;
};

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 길이 없는 자리는 null 로 온다. 수가 아닌 것도 없는 것으로 본다. */
function asDistance(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asNames(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

export const throughMiddleNodeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const data = initialData as
        | { nodes?: unknown; edges?: unknown }
        | undefined;
      const nodes = asNames(data?.nodes);
      const raw = Array.isArray(data?.edges) ? data.edges : [];
      const edges: { from: string; to: string; weight: number }[] = [];
      for (const item of raw) {
        const edge = item as { from?: unknown; to?: unknown; weight?: unknown };
        if (typeof edge?.from !== 'string' || typeof edge?.to !== 'string') continue;
        if (typeof edge?.weight !== 'number' || !Number.isFinite(edge.weight)) continue;
        edges.push({ from: edge.from, to: edge.to, weight: edge.weight });
      }
      stage?.setScene?.({ nodes, edges });
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'roads-ready': {
          const p = event.payload as
            | { edgeCount?: unknown; middles?: unknown; pairCount?: unknown }
            | undefined;
          const edgeCount = asCount(p?.edgeCount);
          await stage?.openRoads?.(
            { middles: asNames(p?.middles), rows: asCount(p?.pairCount) },
            tr('caption.roads', '{count} one-way roads to begin with.', { count: edgeCount }),
          );
          return;
        }

        case 'middle-set': {
          const p = event.payload as { middle?: unknown; order?: unknown } | undefined;
          const middle = asText(p?.middle);
          if (middle === '') return;
          await stage?.setMiddle?.(
            middle,
            asCount(p?.order),
            tr('caption.middle', 'Now {middle} stands in the middle.', { middle }),
          );
          return;
        }

        case 'ask': {
          const p = event.payload as
            | {
                from?: unknown;
                to?: unknown;
                middle?: unknown;
                middleIndex?: unknown;
                pairIndex?: unknown;
                legA?: unknown;
                legB?: unknown;
                sum?: unknown;
                current?: unknown;
                shorter?: unknown;
              }
            | undefined;
          const from = asText(p?.from);
          const to = asText(p?.to);
          const middle = asText(p?.middle);
          if (from === '' || to === '' || middle === '') return;

          const question = {
            from,
            to,
            middle,
            middleIndex: asCount(p?.middleIndex),
            pairIndex: asCount(p?.pairIndex),
            legA: asDistance(p?.legA),
            legB: asDistance(p?.legB),
            sum: asDistance(p?.sum),
            current: asDistance(p?.current),
            shorter: p?.shorter === true,
          };

          const verdict = ((): string => {
            if (question.shorter && question.current === null) {
              return tr('caption.opened', 'A road appears. {from}→{to} = {sum}.', {
                from,
                to,
                sum: question.sum ?? 0,
              });
            }
            if (question.shorter) {
              return tr('caption.shorter', 'Shorter. {from}→{to} drops from {current} to {sum}.', {
                from,
                to,
                current: question.current ?? 0,
                sum: question.sum ?? 0,
              });
            }
            if (question.legA === null) {
              return tr('caption.noWayIn', 'No road from {from} to {middle}.', { from, middle });
            }
            if (question.legB === null) {
              return tr('caption.noWayOut', 'No road from {middle} to {to}.', { middle, to });
            }
            return tr(
              'caption.notShorter',
              'The detour is {sum} — longer than the {current} already known. Leave it.',
              {
                sum: question.sum ?? 0,
                current: question.current ?? 0,
              },
            );
          })();

          await stage?.ask?.(question, {
            question: tr('caption.question', '{from}→{to}: shorter through {middle}?', {
              from,
              to,
              middle,
            }),
            verdict,
          });
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        case 'done': {
          const p = event.payload as { asked?: unknown; improved?: unknown } | undefined;
          await stage?.finish?.(
            tr('caption.done', '{asked} questions asked. Only {improved} said yes.', {
              asked: asCount(p?.asked),
              improved: asCount(p?.improved),
            }),
          );
          return;
        }

        default:
          // 이 알고리즘이 내보내는 어휘는 위 다섯뿐이다. 그 밖의 것은 조용히 흘린다.
          return;
      }
    },
  };
};
