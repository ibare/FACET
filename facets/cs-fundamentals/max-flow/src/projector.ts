/**
 * maxFlowProjector — 알고리즘 이벤트를 관망 무대와 코드 패널의 메서드 호출로 옮긴다.
 *
 * 무대는 잔여 용량 표만 안다. 알고리즘이 `push-flow` / `residual-grown` 으로
 * 갱신된 칸 하나를 값과 함께 보내면, 무대는 그 칸을 고쳐 띠의 경계선을 다시
 * 긋는다 — projector 가 셈을 다시 하지 않는다 (원칙 5).
 *
 * 문안은 전부 키로만 다루고 `runtime.t` 로 해석한다 (C10). 무대는 문자열을 받아
 * 그리기만 한다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** 무대가 노출하는 표면. 없는 메서드는 `?.()` 로 건너뛴다 (C9). */
type MaxFlowStage = {
  setNetwork?(raw: unknown): void;
  setStatus?(value: string): void;
  setRound?(value: string): void;
  setTotalFlow?(value: number): void;
  beginSearch?(items: number[], head: number): void;
  popNode?(node: number, head: number, items: number[]): void;
  probeEdge?(from: number, to: number, open: boolean): void;
  discoverNode?(node: number, head: number, items: number[]): void;
  showPath?(path: number[]): void;
  markBottleneck?(from: number, to: number): void;
  setResidual?(from: number, to: number, value: number, kind: 'push' | 'residual'): void;
  finish?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
};

const numberList = (raw: unknown): number[] => {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const x of raw) if (typeof x === 'number') out.push(x);
  return out;
};

export const maxFlowProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as MaxFlowStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  let network: unknown = null;

  const start = (): void => {
    stage?.setTotalFlow?.(0);
    stage?.setRound?.('');
    stage?.setStatus?.(
      tr('caption.start', 'Every pipe is empty. Find a route with room and fill it.'),
    );
  };

  return {
    onInit(initialData: unknown): void {
      network = initialData;
      stage?.setNetwork?.(initialData);
      start();
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          if (typeof p?.phase === 'string') code?.highlightPhase?.(p.phase);
          return;
        }

        case 'search-begin': {
          const p = event.payload as { round?: unknown; queue?: unknown; head?: unknown } | undefined;
          const head = typeof p?.head === 'number' ? p.head : 0;
          stage?.beginSearch?.(numberList(p?.queue), head);
          if (typeof p?.round === 'number') {
            stage?.setRound?.(tr('label.round', 'search {n}', { n: p.round }));
          }
          stage?.setStatus?.(
            tr(
              'caption.search',
              'Breadth first: the route found first is the one with the fewest pipes.',
            ),
          );
          return;
        }

        case 'dequeue': {
          const p = event.payload as { node?: unknown; head?: unknown; queue?: unknown } | undefined;
          if (typeof p?.node !== 'number') return;
          const head = typeof p.head === 'number' ? p.head : 0;
          stage?.popNode?.(p.node, head, numberList(p.queue));
          return;
        }

        case 'probe-edge': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; open?: unknown }
            | undefined;
          if (typeof p?.from !== 'number' || typeof p.to !== 'number') return;
          stage?.probeEdge?.(p.from, p.to, p.open === true);
          return;
        }

        case 'enqueue': {
          const p = event.payload as { node?: unknown; head?: unknown; queue?: unknown } | undefined;
          if (typeof p?.node !== 'number') return;
          const head = typeof p.head === 'number' ? p.head : 0;
          stage?.discoverNode?.(p.node, head, numberList(p.queue));
          return;
        }

        case 'path-found': {
          const p = event.payload as { path?: unknown } | undefined;
          stage?.showPath?.(numberList(p?.path));
          stage?.setStatus?.(
            tr('caption.found', 'A route is open. Walk it back to find the narrowest pipe.'),
          );
          return;
        }

        case 'bottleneck-scan': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; best?: unknown }
            | undefined;
          if (typeof p?.from !== 'number' || typeof p.to !== 'number') return;
          stage?.markBottleneck?.(p.from, p.to);
          if (typeof p.best === 'number') {
            stage?.setStatus?.(
              tr('caption.bottleneck', 'Narrowest pipe on the route so far: {best}', {
                best: p.best,
              }),
            );
          }
          return;
        }

        case 'push-flow': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; amount?: unknown; residual?: unknown }
            | undefined;
          if (typeof p?.from !== 'number' || typeof p.to !== 'number') return;
          if (typeof p.residual !== 'number') return;
          stage?.setResidual?.(p.from, p.to, p.residual, 'push');
          if (typeof p.amount === 'number') {
            stage?.setStatus?.(
              tr('caption.push', 'Pushing {amount} — this way has that much less room.', {
                amount: p.amount,
              }),
            );
          }
          return;
        }

        case 'residual-grown': {
          const p = event.payload as
            | { from?: unknown; to?: unknown; amount?: unknown; residual?: unknown }
            | undefined;
          if (typeof p?.from !== 'number' || typeof p.to !== 'number') return;
          if (typeof p.residual !== 'number') return;
          stage?.setResidual?.(p.from, p.to, p.residual, 'residual');
          if (typeof p.amount === 'number') {
            stage?.setStatus?.(
              tr('caption.residual', 'The other way gains {amount} to push back later.', {
                amount: p.amount,
              }),
            );
          }
          return;
        }

        case 'flow-added': {
          const p = event.payload as { amount?: unknown; total?: unknown } | undefined;
          if (typeof p?.total === 'number') stage?.setTotalFlow?.(p.total);
          if (typeof p?.amount === 'number') {
            stage?.setStatus?.(
              tr('caption.added', 'This route carried {amount}.', { amount: p.amount }),
            );
          }
          return;
        }

        case 'no-path': {
          stage?.finish?.();
          stage?.setStatus?.(
            tr('caption.noPath', 'No route with room left. The flow cannot grow.'),
          );
          return;
        }

        case 'done': {
          const p = event.payload as { total?: unknown; paths?: unknown } | undefined;
          if (typeof p?.total === 'number') stage?.setTotalFlow?.(p.total);
          code?.highlightPhase?.('done');
          if (typeof p?.total === 'number' && typeof p.paths === 'number') {
            stage?.setStatus?.(
              tr('caption.done', 'Routes used: {paths}. Maximum flow: {total}.', {
                paths: p.paths,
                total: p.total,
              }),
            );
          }
          return;
        }

        default:
          // 위 어휘 밖의 이벤트는 이 facet 에 없다. 새로 생기면 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      // 무대는 잔여 용량을 스스로 누적하므로 원래 선언으로 다시 세운다.
      stage?.setNetwork?.(network);
      code?.highlightPhase?.(null);
      start();
    },
  };
};
