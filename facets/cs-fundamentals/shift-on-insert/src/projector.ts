/**
 * shift-on-insert projector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 한 번에 좁혀 정형 객체로 만든 뒤 넘긴다 (C9). stage 는
 * `unknown` 을 보지 않는다.
 *
 * 캡션 문안은 코드에 없다 — 키와 en 원본만 있고 정본은 `facet.ts::messages` 다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** stage view 의 계약. C9 에 따라 구체형을 파일 상단에 모은다. */
type ShiftStage = {
  init(data: StageData): void;
  planInsert(p: { targetIndex: number; caption: string }): Promise<void>;
  shiftCell(p: { from: number; to: number; moves: number; caption: string }): Promise<void>;
  clearSlot(p: { index: number; caption: string }): void;
  placeValue(p: { index: number; caption: string }): Promise<void>;
  finish(p: { moves: number; caption: string }): void;
};

type StageData = {
  values: number[];
  capacity: number;
  targetIndex: number;
  incoming: number;
};

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStageData(raw: unknown): StageData | null {
  const d = raw as
    | { values?: unknown; capacity?: unknown; targetIndex?: unknown; incoming?: unknown }
    | undefined
    | null;
  if (!d || !Array.isArray(d.values)) return null;
  const values: number[] = [];
  for (const v of d.values) {
    const n = readNumber(v);
    if (n === null) return null;
    values.push(n);
  }
  const capacity = readNumber(d.capacity);
  const targetIndex = readNumber(d.targetIndex);
  const incoming = readNumber(d.incoming);
  if (capacity === null || targetIndex === null || incoming === null) return null;
  return { values, capacity, targetIndex, incoming };
}

export const shiftOnInsertProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as ShiftStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 처음 배치. `rewind` 가 이것을 다시 세운다. */
  let initial: StageData | null = null;

  return {
    onInit(initialData: unknown) {
      const data = readStageData(initialData);
      if (!data || !stage) return;
      initial = data;
      stage.init(data);
    },

    onReset() {
      if (initial && stage) stage.init(initial);
    },

    onEvent(event: FacetRuntimeEvent): void | Promise<void> {
      if (!stage) return;

      switch (event.type) {
        case 'plan-insert': {
          const p = event.payload as
            | { targetIndex?: unknown; incoming?: unknown; occupied?: unknown }
            | undefined;
          const targetIndex = readNumber(p?.targetIndex);
          const incoming = readNumber(p?.incoming);
          const occupied = readNumber(p?.occupied);
          if (targetIndex === null || incoming === null || occupied === null) return;
          return stage.planInsert({
            targetIndex,
            caption: tr(
              'caption.plan',
              'New value {incoming} — slot {at} is already taken by {occupied}.',
              { at: targetIndex, occupied, incoming },
            ),
          });
        }

        case 'shift-cell': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; value?: unknown; moves?: unknown }
            | undefined;
          const from = readNumber(p?.from);
          const to = readNumber(p?.to);
          const value = readNumber(p?.value);
          const moves = readNumber(p?.moves);
          if (from === null || to === null || value === null || moves === null) return;
          return stage.shiftCell({
            from,
            to,
            moves,
            caption: tr(
              'caption.shift',
              '{value} at slot {from} → slot {to}. Moving back to front overwrites nothing.',
              { value, from, to },
            ),
          });
        }

        case 'slot-cleared': {
          const p = event.payload as { index?: unknown } | undefined;
          const index = readNumber(p?.index);
          if (index === null) return;
          stage.clearSlot({
            index,
            caption: tr('caption.cleared', 'Slot {at} is empty. Only now can the new value move in.', {
              at: index,
            }),
          });
          return;
        }

        case 'place-value': {
          const p = event.payload as { index?: unknown; value?: unknown } | undefined;
          const index = readNumber(p?.index);
          const value = readNumber(p?.value);
          if (index === null || value === null) return;
          return stage.placeValue({
            index,
            caption: tr('caption.placed', '{value} takes slot {at}.', { value, at: index }),
          });
        }

        case 'done': {
          const p = event.payload as { moves?: unknown } | undefined;
          const moves = readNumber(p?.moves);
          if (moves === null) return;
          stage.finish({
            moves,
            caption: tr(
              'caption.done',
              'One insert cost {moves} moves. The closer to the front, the more get pushed.',
              { moves },
            ),
          });
          return;
        }

        case 'rewind': {
          if (initial) stage.init(initial);
          return;
        }

        default:
          // 위 어휘 밖의 이벤트는 이 조각에 없다. 들어오면 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
