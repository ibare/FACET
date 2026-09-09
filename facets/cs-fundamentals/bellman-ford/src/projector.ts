/**
 * 벨만-포드 Projector — 알고리즘 이벤트를 무대와 코드 패널의 메서드 호출로 옮긴다.
 *
 * 무대는 그림만 알고 알고리즘은 그림을 모른다. 그 사이의 번역이 전부 여기 있다
 * (원칙 5). 캡션 문안도 여기서 `tr` 로 골라 무대에 넘긴다 — 알고리즘은 수와
 * 사실만 보내고 무엇이라 말할지는 표현 계층이 정한다 (C10).
 *
 * 무한대는 payload 에서 `null` 로 온다. 화면에 뜨는 `∞` 는 무대가 정한 표기이고,
 * 캡션 안에서 필요할 때는 여기서 같은 표기로 채운다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** 무대가 노출하는 메서드. 열린 ViewInstance 를 여기서 한 번만 좁힌다 (C9). */
type BellmanFordStage = {
  reset?(): void;
  seed?(dist: (number | null)[], source: number): void;
  beginPass?(pass: number): void;
  beginCheck?(): void;
  inspect?(info: { edge: number; from: number; to: number; improves: boolean }): void;
  relax?(info: { edge: number; to: number; after: number }): void;
  endPass?(pass: number, changed: number, dist: (number | null)[]): void;
  endCheck?(changed: number): void;
  finish?(dist: (number | null)[]): void;
  setCaption?(text: string): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
};

/** 무한대 표기. 무대의 것과 같아야 한다. 수식 기호라 번역하지 않는다 (C10). */
const INFINITY_MARK = '∞';

const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const mark = (v: unknown): string => (typeof v === 'number' ? String(v) : INFINITY_MARK);

/** payload 의 거리표를 `(number | null)[]` 로 좁힌다. */
function toDist(v: unknown): (number | null)[] {
  if (!Array.isArray(v)) return [];
  return v.map((d) => (typeof d === 'number' ? d : null));
}

export const bellmanFordProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as BellmanFordStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const say = (text: string) => stage?.setCaption?.(text);

  return {
    onInit(): void {
      stage?.reset?.();
      code?.highlightPhase?.(null);
      say(tr('caption.start', 'Every vertex starts unreachable. Only the source is 0.'));
    },

    onReset(): void {
      stage?.reset?.();
      code?.highlightPhase?.(null);
      say(tr('caption.start', 'Every vertex starts unreachable. Only the source is 0.'));
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          if (typeof p?.phase === 'string') code?.highlightPhase?.(p.phase);
          return;
        }

        case 'dist-seeded': {
          const p = event.payload as { dist?: unknown; source?: unknown } | undefined;
          const src = typeof p?.source === 'number' ? p.source : 0;
          stage?.seed?.(toDist(p?.dist), src);
          say(
            tr('caption.seeded', 'Source {v} is 0. Everything else is {inf} until an edge reaches it.', {
              v: src,
              inf: INFINITY_MARK,
            }),
          );
          return;
        }

        case 'pass-begin': {
          const p = event.payload as { pass?: unknown; total?: unknown } | undefined;
          const pass = typeof p?.pass === 'number' ? p.pass : 1;
          const total = typeof p?.total === 'number' ? p.total : 1;
          stage?.beginPass?.(pass);
          say(tr('caption.passBegin', 'Pass {pass} of {total}. Sweep all edges in the same fixed order.', { pass, total }));
          return;
        }

        case 'edge-inspect': {
          const p = event.payload as
            | {
                edge?: unknown;
                from?: unknown;
                to?: unknown;
                weight?: unknown;
                distFrom?: unknown;
                sum?: unknown;
                distTo?: unknown;
                improves?: unknown;
              }
            | undefined;
          if (typeof p?.edge !== 'number' || typeof p.from !== 'number' || typeof p.to !== 'number') {
            return;
          }
          const improves = p.improves === true;
          stage?.inspect?.({ edge: p.edge, from: p.from, to: p.to, improves });

          const weight = typeof p.weight === 'number' ? p.weight : 0;
          if (num(p.distFrom) === null) {
            say(
              tr('caption.unreached', 'Edge {u}→{v}: {u} is still {inf}, so nothing can be pushed through it.', {
                u: p.from,
                v: p.to,
                inf: INFINITY_MARK,
              }),
            );
          } else if (improves) {
            say(
              tr('caption.improves', 'Edge {u}→{v}: {du} + ({w}) = {sum}, below {dv}. It drops.', {
                u: p.from,
                v: p.to,
                du: mark(p.distFrom),
                w: weight,
                sum: mark(p.sum),
                dv: mark(p.distTo),
              }),
            );
          } else {
            say(
              tr('caption.noDrop', 'Edge {u}→{v}: {du} + ({w}) = {sum}, not below {dv}. Nothing changes.', {
                u: p.from,
                v: p.to,
                du: mark(p.distFrom),
                w: weight,
                sum: mark(p.sum),
                dv: mark(p.distTo),
              }),
            );
          }
          return;
        }

        case 'edge-relax': {
          const p = event.payload as
            | { edge?: unknown; to?: unknown; before?: unknown; after?: unknown }
            | undefined;
          if (typeof p?.edge !== 'number' || typeof p.to !== 'number' || typeof p.after !== 'number') {
            return;
          }
          stage?.relax?.({ edge: p.edge, to: p.to, after: p.after });
          say(
            tr('caption.relaxed', 'Vertex {v} drops from {before} to {after}.', {
              v: p.to,
              before: mark(p.before),
              after: p.after,
            }),
          );
          return;
        }

        case 'pass-end': {
          const p = event.payload as { pass?: unknown; changed?: unknown; dist?: unknown } | undefined;
          const pass = typeof p?.pass === 'number' ? p.pass : 0;
          const changed = typeof p?.changed === 'number' ? p.changed : 0;
          stage?.endPass?.(pass, changed, toDist(p?.dist));
          say(
            changed === 0
              ? tr('caption.passQuiet', 'Pass {pass} changed nothing. The distances have settled.', { pass })
              : tr('caption.passEnd', 'Pass {pass} soaked into {changed} vertices.', { pass, changed }),
          );
          return;
        }

        case 'check-begin': {
          stage?.beginCheck?.();
          say(
            tr(
              'caption.checkBegin',
              'One more sweep — the same test again. If anything still drops, a negative cycle exists.',
            ),
          );
          return;
        }

        case 'check-end': {
          const p = event.payload as { changed?: unknown } | undefined;
          const changed = typeof p?.changed === 'number' ? p.changed : 0;
          stage?.endCheck?.(changed);
          say(
            changed === 0
              ? tr('caption.checkClean', 'Nothing dropped. No negative cycle — the distances are final.')
              : tr('caption.checkDirty', '{changed} edges still drop. A negative cycle is in there.', { changed }),
          );
          return;
        }

        case 'done': {
          const p = event.payload as
            | { dist?: unknown; relaxed?: unknown; passes?: unknown }
            | undefined;
          const dist = toDist(p?.dist);
          stage?.finish?.(dist);
          code?.highlightPhase?.('done');
          say(
            tr('caption.done', '{passes} passes and {relaxed} drops. Distances: {values}.', {
              passes: typeof p?.passes === 'number' ? p.passes : 0,
              relaxed: typeof p?.relaxed === 'number' ? p.relaxed : 0,
              values: dist.map((d) => (d === null ? INFINITY_MARK : String(d))).join(' '),
            }),
          );
          return;
        }

        default:
          // 알고리즘이 위 목록 밖의 이벤트를 보내지 않는다. 그래도 오면 조용히
          // 흘린다 — 무대가 모르는 호출을 받아 어중간한 그림이 되는 것보다 낫다.
          return;
      }
    },

    onDestroy(): void {
      code?.highlightPhase?.(null);
    },
  };
};
