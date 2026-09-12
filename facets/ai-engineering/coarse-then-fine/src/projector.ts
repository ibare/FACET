/**
 * coarseThenFine 의 projector — 걸음을 판 위의 몸짓으로 옮긴다.
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다 (C9). 화면 문안도 여기서 정한다 —
 * algorithm 은 translator 를 갖지 않으므로 이름과 수만 보내고, 문장은 키로
 * 조회한다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type CoarseStage = {
  reset?: () => void;
  enter?: (args: { layer: string; node: string; caption: string }) => Promise<void> | void;
  hop?: (args: {
    layer: string;
    from: string;
    to: string;
    cands: string[];
    fresh: string[];
    caption: string;
  }) => Promise<void> | void;
  handDown?: (args: {
    from: string;
    to: string;
    node: string;
    cands: string[];
    fresh: string[];
    caption: string;
  }) => Promise<void> | void;
  stop?: (args: {
    layer: string;
    node: string;
    cands: string[];
    fresh: string[];
    caption: string;
  }) => Promise<void> | void;
  found?: (args: { node: string; caption: string }) => Promise<void> | void;
  flat?: (args: {
    layer: string;
    path: string[];
    seen: string[];
    caption: string;
  }) => Promise<void> | void;
};

function textOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function countOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function listOf(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string') : [];
}

export const coarseThenFineProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as CoarseStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event): Promise<void> {
      const p = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'enter': {
          const node = textOf(p.node);
          await stage.enter?.({
            layer: textOf(p.layer),
            node,
            caption: tr(
              'caption.enter',
              'The top layer holds only a few points. The cross is the target; start at {node}.',
              { node },
            ),
          });
          return;
        }

        case 'hop': {
          const from = textOf(p.from);
          const to = textOf(p.to);
          await stage.hop?.({
            layer: textOf(p.layer),
            from,
            to,
            cands: listOf(p.cands),
            fresh: listOf(p.fresh),
            caption: tr('caption.hop', 'A neighbor sits nearer the cross. Move {from} to {to}.', {
              from,
              to,
            }),
          });
          return;
        }

        case 'hand-down': {
          const to = textOf(p.to);
          await stage.handDown?.({
            from: textOf(p.from),
            to,
            node: textOf(p.node),
            cands: listOf(p.cands),
            fresh: listOf(p.fresh),
            caption: tr(
              'caption.handDown',
              'No neighbor here is nearer. Hand the spot down to {layer}. Seen so far: {n}.',
              { layer: to, n: countOf(p.seen) },
            ),
          });
          return;
        }

        case 'stop': {
          await stage.stop?.({
            layer: textOf(p.layer),
            node: textOf(p.node),
            cands: listOf(p.cands),
            fresh: listOf(p.fresh),
            caption: tr(
              'caption.stop',
              'The bottom layer has no nearer neighbor either. Seen so far: {n}.',
              { n: countOf(p.seen) },
            ),
          });
          return;
        }

        case 'found': {
          const node = textOf(p.node);
          await stage.found?.({
            node,
            caption: tr('caption.found', 'Nearest is {node}. Points measured: {n} of {total}.', {
              node,
              n: countOf(p.seen),
              total: countOf(p.total),
            }),
          });
          return;
        }

        case 'flat': {
          const seen = listOf(p.seen);
          const path = listOf(p.path);
          const node = path[path.length - 1] ?? '';
          await stage.flat?.({
            layer: textOf(p.layer),
            path,
            seen,
            caption: tr(
              'caption.flat',
              'One layer alone lands on the same {node}, measuring {n} of {total}.',
              { node, n: seen.length, total: countOf(p.total) },
            ),
          });
          return;
        }

        case 'rewind': {
          stage.reset?.();
          return;
        }

        default:
          // 그 밖의 type 은 이 facet 이 발신하지 않는다 — 와도 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.reset?.();
    },
  };
};
