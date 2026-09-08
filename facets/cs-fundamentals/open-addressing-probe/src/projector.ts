/**
 * open-addressing-probe projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀서 넘긴다 (C9). stage 는 필수 필드만 받는다.
 * 화면 문안은 키로만 갖고 있고 실제 글은 facet.ts 의 messages 에 있다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

/** stage view 와의 계약 (C9 — 구체형은 파일 상단에 모은다). */
type ProbeStage = {
  reset?(): void;
  setCaption?(text: string): void;
  arrive?(v: { key: string; home: number; hashLine: string }): Promise<void>;
  probe?(v: { from: number; to: number }): Promise<void>;
  seat?(v: { key: string; home: number; slot: number }): Promise<void>;
  spill?(v: { key: string }): Promise<void>;
  finish?(): Promise<void>;
};

const DEFAULT_SIZE = 8;

function readNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readStr(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export const openAddressingProbeProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as ProbeStage | undefined;
  const tr = runtime?.t ?? makeTranslator();
  let size = DEFAULT_SIZE;

  return {
    onInit(initialData: unknown) {
      const d = initialData as { size?: unknown } | undefined;
      size = readNum(d?.size) ?? DEFAULT_SIZE;
      stage?.reset?.();
    },

    onReset() {
      stage?.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'key-arrive': {
          const p = event.payload as { key?: unknown; hash?: unknown; home?: unknown } | undefined;
          const key = readStr(p?.key);
          const hash = readNum(p?.hash);
          const home = readNum(p?.home);
          if (key === null || hash === null || home === null) return;
          stage?.setCaption?.(
            tr('caption.arrive', '{key} belongs in slot {home}.', { key, home }),
          );
          await stage?.arrive?.({
            key,
            home,
            hashLine: tr(
              'label.hashLine',
              '{key} · hashCode {hash} · (h & 0x7FFFFFFF) % {size} = {home}',
              { key, hash, size, home },
            ),
          });
          return;
        }

        case 'probe-step': {
          const p = event.payload as { from?: unknown; to?: unknown; holder?: unknown } | undefined;
          const from = readNum(p?.from);
          const to = readNum(p?.to);
          const holder = readStr(p?.holder);
          if (from === null || to === null || holder === null) return;
          stage?.setCaption?.(
            tr('caption.probe', 'Slot {from} is taken by {holder} — look one slot over.', {
              from,
              holder,
              to,
            }),
          );
          await stage?.probe?.({ from, to });
          return;
        }

        case 'key-seated': {
          const p = event.payload as { key?: unknown; home?: unknown; slot?: unknown } | undefined;
          const key = readStr(p?.key);
          const home = readNum(p?.home);
          const slot = readNum(p?.slot);
          if (key === null || home === null || slot === null) return;
          stage?.setCaption?.(
            tr('caption.seat', 'Slot {slot} is empty — {key} sits down here.', { slot, key }),
          );
          await stage?.seat?.({ key, home, slot });
          return;
        }

        case 'spill-noted': {
          const p = event.payload as
            | { key?: unknown; home?: unknown; slot?: unknown; blocker?: unknown }
            | undefined;
          const key = readStr(p?.key);
          const home = readNum(p?.home);
          const slot = readNum(p?.slot);
          const blocker = readStr(p?.blocker);
          if (key === null || home === null || slot === null || blocker === null) return;
          stage?.setCaption?.(
            tr(
              'caption.spill',
              'Slot {home} belongs to {key}, but {blocker} had already been pushed into it — so {key} slid on to {slot}.',
              { home, key, blocker, slot },
            ),
          );
          await stage?.spill?.({ key });
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr(
              'caption.done',
              'No chains anywhere — every key found a seat inside the table itself.',
            ),
          );
          await stage?.finish?.();
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        // 그 밖의 이벤트는 이 조각이 발신하지 않는다 — 조용히 흘린다 (C2).
        default:
          return;
      }
    },
  };
};
