/**
 * divideConquerCombine Projector — 왕복 이벤트를 stage 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 한 번에 좁힌 뒤 정형 객체로 넘긴다. stage 는
 * 필수 필드 타입으로만 받는다 (C9). 화면 문안은 전부 키로 조회하며 en 원본만
 * 호출부에 남는다 (C10) — 실제 문장은 facet.ts 의 messages 에 있다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage 가 노출하는 표면. view 를 바꿔 끼울 수 있게 구조적으로만 선언한다. */
type DivideConquerStage = {
  reset?(): void;
  seed?(values: number[]): Promise<void> | void;
  split?(spec: {
    nodeId: string;
    leftId: string;
    leftValues: number[];
    rightId: string;
    rightValues: number[];
    order: number;
  }): Promise<void> | void;
  settle?(nodeIds: string[]): Promise<void> | void;
  merge?(spec: {
    nodeId: string;
    leftId: string;
    rightId: string;
    values: number[];
    fromSide: string[];
    fromSlot: number[];
    order: number;
  }): Promise<void> | void;
  finish?(): Promise<void> | void;
  setCaption?(text: string): void;
};

function numbers(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((v) => typeof v === 'number') ? (value as number[]) : null;
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.every((v) => typeof v === 'string') ? (value as string[]) : null;
}

export const divideConquerCombineProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as DivideConquerStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const say = (text: string): void => {
    stage?.setCaption?.(text);
  };

  return {
    onInit(): void {
      stage?.reset?.();
    },

    onReset(): void {
      stage?.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as
        | {
            nodeId?: unknown;
            depth?: unknown;
            order?: unknown;
            values?: unknown;
            leftId?: unknown;
            leftValues?: unknown;
            rightId?: unknown;
            rightValues?: unknown;
            fromSide?: unknown;
            fromSlot?: unknown;
            nodes?: unknown;
            splits?: unknown;
            merges?: unknown;
          }
        | undefined;

      switch (event.type) {
        case 'seed': {
          const values = numbers(p?.values);
          if (!values) return;
          say(tr('caption.problem', 'One problem: put these values in order.'));
          await stage?.seed?.(values);
          return;
        }

        case 'split': {
          const nodeId = p?.nodeId;
          const leftId = p?.leftId;
          const rightId = p?.rightId;
          const leftValues = numbers(p?.leftValues);
          const rightValues = numbers(p?.rightValues);
          const order = p?.order;
          const depth = p?.depth;
          if (
            typeof nodeId !== 'string' ||
            typeof leftId !== 'string' ||
            typeof rightId !== 'string' ||
            typeof order !== 'number' ||
            typeof depth !== 'number' ||
            !leftValues ||
            !rightValues
          ) {
            return;
          }
          say(
            depth === 0
              ? tr('caption.splitRoot', 'Cut it in half. No answer yet — just a smaller problem.')
              : tr('caption.split', 'Cut again. Still going down.'),
          );
          await stage?.split?.({ nodeId, leftId, leftValues, rightId, rightValues, order });
          return;
        }

        case 'layer-settled': {
          const ids = strings(p?.nodes);
          if (!ids) return;
          say(tr('caption.bottom', 'A single value is already an answer. The bottom turns the trip around.'));
          await stage?.settle?.(ids);
          return;
        }

        case 'merge': {
          const nodeId = p?.nodeId;
          const leftId = p?.leftId;
          const rightId = p?.rightId;
          const values = numbers(p?.values);
          const fromSide = strings(p?.fromSide);
          const fromSlot = numbers(p?.fromSlot);
          const order = p?.order;
          const depth = p?.depth;
          if (
            typeof nodeId !== 'string' ||
            typeof leftId !== 'string' ||
            typeof rightId !== 'string' ||
            typeof order !== 'number' ||
            typeof depth !== 'number' ||
            !values ||
            !fromSide ||
            !fromSlot
          ) {
            return;
          }
          say(
            depth === 0
              ? tr(
                  'caption.mergeRoot',
                  'The place cut first is combined last — only now is there one whole answer.',
                )
              : tr('caption.merge', 'The layer that was cut later is combined first.'),
          );
          await stage?.merge?.({ nodeId, leftId, rightId, values, fromSide, fromSlot, order });
          return;
        }

        case 'done': {
          const splits = p?.splits;
          const merges = p?.merges;
          if (typeof splits !== 'number' || typeof merges !== 'number') return;
          say(
            tr(
              'caption.done',
              '{splits} cuts going down, {merges} combines coming up — the same places, in reverse.',
              { splits, merges },
            ),
          );
          await stage?.finish?.();
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각이 발신하지 않는다. 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
