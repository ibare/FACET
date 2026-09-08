/**
 * grow-and-copy projector — 재할당 이벤트를 stage 호출로 옮긴다.
 *
 * payload 는 여기서 전부 좁힌다 (C9). stage 는 숫자와 문자열만 받으며
 * `event.payload` 를 그대로 보지 않는다. 화면 문안도 여기서 `runtime.t` 로
 * 해석해 넘긴다 (C10) — stage 에는 en 원본 리터럴이 한 줄도 없다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorViews,
  ProjectorRuntime,
  Translate,
} from '@ffacet/core/runtime';

/** stage view 의 호출 표면 (C9 — 오픈 타입을 구체형으로 좁힌 선언). */
type GrowAndCopyStage = {
  init?(data: {
    address: string;
    capacity: number;
    values: number[];
    meta: string;
  }): void;
  rewind?(): void;
  setCaption?(text: string): void;
  blockFull?(p: { value: number; slotIndex: number }): Promise<void>;
  allocate?(p: { address: string; capacity: number; meta: string }): Promise<void>;
  copyValue?(p: { index: number; value: number }): Promise<void>;
  releaseOld?(): Promise<void>;
  appendPending?(p: { index: number; value: number }): Promise<void>;
};

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' ? v : fallback;

const numbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];

export const growAndCopyProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as GrowAndCopyStage | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  // 처음 장면의 캡션은 되감을 때 다시 쓰이므로 한 곳에서만 짓는다 (C10 PREFER).

  const meta = (bytes: number, capacity: number): string =>
    tr('label.meta', '{bytes} bytes / {capacity} slots', { bytes, capacity });

  // onReset 을 두지 않는다 — ReactiveMechanism.reset() 이 onReset 다음에
  // onInit 을 부르고, 아래 onInit 이 화면 전체를 다시 세운다.
  return {
    onInit(initialData: unknown): void {
      const d = initialData as
        | {
            oldAddress?: unknown;
            oldCapacity?: unknown;
            values?: unknown;
            elementBytes?: unknown;
          }
        | undefined;

      const capacity = num(d?.oldCapacity, 0);
      const values = numbers(d?.values);
      const elementBytes = num(d?.elementBytes, 0);

      stage?.init?.({
        address: str(d?.oldAddress, ''),
        capacity,
        values,
        meta: meta(capacity * elementBytes, capacity),
      });
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'insert-blocked': {
          const p = event.payload as { value?: unknown; capacity?: unknown } | undefined;
          const value = num(p?.value, 0);
          const capacity = num(p?.capacity, 0);
          stage?.setCaption?.(
            tr(
              'caption.blocked',
              'One more value arrives: {value}. Every one of the {capacity} slots is taken, and the block cannot stretch.',
              { value, capacity },
            ),
          );
          await stage?.blockFull?.({ value, slotIndex: capacity });
          return;
        }

        case 'block-allocated': {
          const p = event.payload as
            | { address?: unknown; capacity?: unknown; bytes?: unknown }
            | undefined;
          const address = str(p?.address, '');
          const capacity = num(p?.capacity, 0);
          const bytes = num(p?.bytes, 0);
          stage?.setCaption?.(
            tr(
              'caption.allocated',
              'So a bigger block is taken somewhere else: {bytes} bytes at {address}, room for {capacity}.',
              { bytes, address, capacity },
            ),
          );
          await stage?.allocate?.({ address, capacity, meta: meta(bytes, capacity) });
          return;
        }

        case 'value-copied': {
          const p = event.payload as
            | { index?: unknown; value?: unknown; done?: unknown; total?: unknown }
            | undefined;
          const index = num(p?.index, 0);
          const value = num(p?.value, 0);
          stage?.setCaption?.(
            tr(
              'caption.copying',
              'Nothing moves itself. Each value is copied over, one at a time — {done} of {total}.',
              { done: num(p?.done, 0), total: num(p?.total, 0) },
            ),
          );
          await stage?.copyValue?.({ index, value });
          return;
        }

        case 'block-freed': {
          const p = event.payload as
            | { address?: unknown; movedTo?: unknown }
            | undefined;
          stage?.setCaption?.(
            tr(
              'caption.freed',
              'The old block at {oldAddress} is given back. The array lives at {newAddress} now — the address changed.',
              { oldAddress: str(p?.address, ''), newAddress: str(p?.movedTo, '') },
            ),
          );
          await stage?.releaseOld?.();
          return;
        }

        case 'value-appended': {
          const p = event.payload as { index?: unknown; value?: unknown } | undefined;
          const index = num(p?.index, 0);
          const value = num(p?.value, 0);
          stage?.setCaption?.(
            tr('caption.appended', 'Now {value} fits. It goes into index {index}.', {
              value,
              index,
            }),
          );
          await stage?.appendPending?.({ index, value });
          return;
        }

        case 'done': {
          const p = event.payload as
            | { capacity?: unknown; size?: unknown; free?: unknown }
            | undefined;
          stage?.setCaption?.(
            tr(
              'caption.done',
              'Capacity {capacity}, {size} values, {free} slots to spare — and a different address than the one it started at.',
              {
                capacity: num(p?.capacity, 0),
                size: num(p?.size, 0),
                free: num(p?.free, 0),
              },
            ),
          );
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각에 없다 — 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
