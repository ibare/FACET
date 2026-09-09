/**
 * cycleBlocksOrder projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 한 번에 좁힌다 (C9). stage 는 좁혀진
 * 정형 객체만 받으며, 원본 `event.payload` 를 그대로 넘기지 않는다.
 *
 * 화면 문안은 여기서 `runtime.t` 로 조회한다 (C10). algorithm 은 사실만
 * 보내고 무엇이라 말할지는 표현 계층이 정한다 — 키와 en 원본만 코드에 남고
 * 문안은 `facet.ts` 의 `messages` 에 있다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type StageEdge = { from: string; to: string };
type StageLoad = { id: string; load: number };
type StageRelease = { to: string; load: number };

/** stage 가 노출하는 표면. `views.stage` 는 열린 타입이라 여기서 한 번 좁힌다 (C9). */
type CycleStage = {
  setBoard?(spec: { vertices: string[]; edges: StageEdge[] }): void;
  survey?(loads: StageLoad[], caption: string): Promise<void> | void;
  scan?(ready: string[], remaining: string[], caption: string): Promise<void> | void;
  extract?(
    row: { id: string; slot: number; released: StageRelease[] },
    caption: string,
  ): Promise<void> | void;
  traceWait?(
    row: { from: string; on: string; closes: boolean; trailing: boolean; ring: string[] },
    caption: string,
  ): Promise<void> | void;
  halt?(
    row: { extracted: string[]; stuck: string[]; total: number },
    caption: string,
  ): Promise<void> | void;
  rewind?(): void;
};

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];

const edgeList = (value: unknown): StageEdge[] =>
  Array.isArray(value)
    ? value.flatMap((raw): StageEdge[] => {
        const e = raw as { from?: unknown; to?: unknown };
        return typeof e?.from === 'string' && typeof e?.to === 'string'
          ? [{ from: e.from, to: e.to }]
          : [];
      })
    : [];

const loadList = (value: unknown): StageLoad[] =>
  Array.isArray(value)
    ? value.flatMap((raw): StageLoad[] => {
        const r = raw as { id?: unknown; load?: unknown };
        return typeof r?.id === 'string' && typeof r?.load === 'number'
          ? [{ id: r.id, load: r.load }]
          : [];
      })
    : [];

const releaseList = (value: unknown): StageRelease[] =>
  Array.isArray(value)
    ? value.flatMap((raw): StageRelease[] => {
        const r = raw as { to?: unknown; load?: unknown };
        return typeof r?.to === 'string' && typeof r?.load === 'number'
          ? [{ to: r.to, load: r.load }]
          : [];
      })
    : [];

export const cycleBlocksOrderProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as CycleStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { vertices?: unknown; edges?: unknown } | undefined;
      stage?.setBoard?.({ vertices: strings(d?.vertices), edges: edgeList(d?.edges) });
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'survey': {
          const p = event.payload as { loads?: unknown } | undefined;
          await stage?.survey?.(
            loadList(p?.loads),
            tr('caption.survey', 'Each vertex carries the number of arrows aimed at it'),
          );
          return;
        }

        case 'scan': {
          const p = event.payload as { ready?: unknown; remaining?: unknown } | undefined;
          const ready = strings(p?.ready);
          const remaining = strings(p?.remaining);
          const caption =
            ready.length > 0
              ? tr('caption.ready', '{ids} carries 0 — it can come out', { ids: ready.join(', ') })
              : tr('caption.stall', 'Nothing carries 0 anymore. Nothing can come out.');
          await stage?.scan?.(ready, remaining, caption);
          return;
        }

        case 'extract': {
          const p = event.payload as { id?: unknown; slot?: unknown; released?: unknown } | undefined;
          if (typeof p?.id !== 'string' || typeof p?.slot !== 'number') return;
          await stage?.extract?.(
            { id: p.id, slot: p.slot, released: releaseList(p.released) },
            tr('caption.extract', 'Take {id} out — the arrows it aimed are gone', { id: p.id }),
          );
          return;
        }

        case 'wait': {
          const p = event.payload as
            | { from?: unknown; on?: unknown; closes?: unknown; trailing?: unknown; ring?: unknown }
            | undefined;
          if (typeof p?.from !== 'string' || typeof p?.on !== 'string') return;
          const closes = p.closes === true;
          const trailing = p.trailing === true;
          const caption = closes
            ? tr('caption.ringClosed', '{a} waits for {b}, and {b} waits for {a}', {
                a: p.from,
                b: p.on,
              })
            : trailing
              ? tr('caption.trail', '{a} waits for {b}, which is caught in the ring', {
                  a: p.from,
                  b: p.on,
                })
              : tr('caption.wait', '{a} cannot move: it waits for {b}', { a: p.from, b: p.on });
          await stage?.traceWait?.(
            { from: p.from, on: p.on, closes, trailing, ring: strings(p.ring) },
            caption,
          );
          return;
        }

        case 'done': {
          const p = event.payload as
            | { extracted?: unknown; stuck?: unknown; total?: unknown }
            | undefined;
          const extracted = strings(p?.extracted);
          const stuck = strings(p?.stuck);
          const total = typeof p?.total === 'number' ? p.total : extracted.length + stuck.length;
          await stage?.halt?.(
            { extracted, stuck, total },
            tr('caption.halt', 'Only {out} of {total} came out — a ring leaves no order', {
              out: extracted.length,
              total,
            }),
          );
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        default:
          // 이 facet 이 발신하는 이벤트는 위가 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
