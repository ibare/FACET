/**
 * 다익스트라 Projector — 알고리즘 이벤트를 stage 한 폭과 코드 패널로 옮긴다.
 *
 * stage 와의 계약은 메서드 하나다. `render(snapshot)` 에 **그 순간의 화면 전체**
 * 를 넘긴다 — 잠정 거리 · 확정 여부 · 최단 경로 나무의 부모 · 굳은 차례의 기록 ·
 * 지금 짚고 있는 자리. stage 는 스스로 아무 상태도 쌓지 않고 받은 것만 그린다.
 * 이 facet 의 화면은 "굳은 것은 다시 흔들리지 않는다" 를 보이는 것이 일이라,
 * 화면 상태가 두 곳에 나뉘어 있으면 그 주장 자체를 믿을 수 없게 된다.
 *
 * 시각 상태의 원본은 알고리즘의 이벤트이고, Projector 는 그것을 좇아 자기
 * shadow-copy 를 갱신한다 (원칙 5).
 *
 * 문안은 이 파일에 없다. 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import type { ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { DijkstraSnapshot } from './dijkstra-stage.js';

/** 무한대 기호. 수식 표기라 번역하지 않는다 (C10 "표식이냐 문안이냐" 3번). */
const INFINITY_MARK = '∞';

/** stage 계약 — 화면 전체를 받아 그린다. */
type DijkstraStage = {
  render?(snapshot: DijkstraSnapshot): void;
};

/** code-view 계약 — phase 로 코드 줄을 짚는다. */
type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

type LedgerRow = { node: number; dist: number; path: number[] };

type GraphPayload = {
  source?: unknown;
  dist?: unknown;
  settled?: unknown;
  parent?: unknown;
};

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((x): x is number => typeof x === 'number') : [];
}

function nullableNumberList(value: unknown): (number | null)[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => (typeof x === 'number' ? x : null));
}

function boolList(value: unknown): boolean[] {
  if (!Array.isArray(value)) return [];
  return value.map((x) => x === true);
}

export const dijkstraProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as DijkstraStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  let vertexCount = 0;
  let source = 0;
  let dist: (number | null)[] = [];
  let settled: boolean[] = [];
  let parent: (number | null)[] = [];
  let ledger: LedgerRow[] = [];
  let scanNode: number | null = null;
  let bestNode: number | null = null;
  let chosenNode: number | null = null;
  let changedNode: number | null = null;
  let activeEdge: DijkstraSnapshot['activeEdge'] = null;
  let finished = false;
  let caption = '';

  /** 무한대를 화면 표기로. 캡션 변수는 문자열이어도 되므로 기호를 그대로 넘긴다. */
  const mark = (d: number | null): string | number => (d === null ? INFINITY_MARK : d);

  function push(): void {
    stage?.render?.({
      vertexCount,
      source,
      dist: [...dist],
      settled: [...settled],
      parent: [...parent],
      ledger: ledger.map((r) => ({ ...r, path: [...r.path] })),
      scanNode,
      bestNode,
      chosenNode,
      changedNode,
      activeEdge,
      finished,
      caption,
    });
  }

  /** 회차마다 짚던 자리를 거둔다. 굳은 것과 잠정 거리는 그대로 남는다. */
  function clearMarks(): void {
    scanNode = null;
    bestNode = null;
    chosenNode = null;
    changedNode = null;
    activeEdge = null;
  }

  function resetState(): void {
    dist = Array.from({ length: vertexCount }, () => null);
    settled = Array.from({ length: vertexCount }, () => false);
    parent = Array.from({ length: vertexCount }, () => null);
    ledger = [];
    finished = false;
    caption = '';
    clearMarks();
  }

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { vertexCount?: unknown; source?: unknown } | undefined;
      vertexCount = typeof d?.vertexCount === 'number' ? d.vertexCount : 0;
      source = typeof d?.source === 'number' ? d.source : 0;
      resetState();
      push();
    },

    onReset(): void {
      resetState();
      codePanel?.clearHighlight?.();
      push();
    },

    onEvent(event): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          if (typeof p?.phase === 'string') codePanel?.highlightPhase?.(p.phase);
          return;
        }

        case 'state-changed': {
          const p = (event.payload ?? {}) as GraphPayload;
          if (typeof p.source === 'number') source = p.source;
          dist = nullableNumberList(p.dist);
          settled = boolList(p.settled);
          parent = nullableNumberList(p.parent);
          ledger = [];
          finished = false;
          clearMarks();
          caption = tr('caption.init', 'Source is {src}. Everything else is still infinity.', {
            src: source,
          });
          push();
          return;
        }

        case 'round-begin': {
          const p = event.payload as { round?: unknown } | undefined;
          const round = typeof p?.round === 'number' ? p.round : 0;
          clearMarks();
          caption = tr('caption.round', 'Round {round} — pick the nearest unsettled vertex.', {
            round: round + 1,
          });
          push();
          return;
        }

        case 'scan-step': {
          const p = event.payload as
            | { node?: unknown; settled?: unknown; dist?: unknown; best?: unknown }
            | undefined;
          const node = typeof p?.node === 'number' ? p.node : 0;
          const isSettled = p?.settled === true;
          const at = typeof p?.dist === 'number' ? p.dist : null;
          const best = typeof p?.best === 'number' ? p.best : null;
          scanNode = node;
          changedNode = null;
          activeEdge = null;
          if (isSettled) {
            caption = tr('caption.scanSettled', 'Vertex {node} is already settled — skip it.', {
              node,
            });
          } else if (at === null) {
            caption = tr('caption.scanUnreached', 'Vertex {node} has not been reached yet.', {
              node,
            });
          } else if (best !== null && at >= best) {
            caption = tr(
              'caption.scanFarther',
              'Vertex {node} sits at {dist} — farther than the current best {best}.',
              { node, dist: at, best },
            );
          } else {
            caption = tr('caption.scanValue', 'Vertex {node} sits at {dist} so far.', {
              node,
              dist: at,
            });
          }
          push();
          return;
        }

        case 'best-update': {
          const p = event.payload as { node?: unknown; dist?: unknown } | undefined;
          const node = typeof p?.node === 'number' ? p.node : 0;
          const at = typeof p?.dist === 'number' ? p.dist : 0;
          bestNode = node;
          scanNode = node;
          caption = tr('caption.bestUpdate', 'Nearest so far: vertex {node} at {dist}.', {
            node,
            dist: at,
          });
          push();
          return;
        }

        case 'choose': {
          const p = event.payload as { node?: unknown; dist?: unknown } | undefined;
          const node = typeof p?.node === 'number' ? p.node : 0;
          const at = typeof p?.dist === 'number' ? p.dist : 0;
          scanNode = null;
          bestNode = null;
          chosenNode = node;
          caption = tr('caption.choose', 'Chosen: vertex {node} at distance {dist}.', {
            node,
            dist: at,
          });
          push();
          return;
        }

        case 'settle': {
          const p = event.payload as
            | { node?: unknown; dist?: unknown; path?: unknown }
            | undefined;
          const node = typeof p?.node === 'number' ? p.node : 0;
          const at = typeof p?.dist === 'number' ? p.dist : 0;
          settled[node] = true;
          dist[node] = at;
          chosenNode = node;
          ledger = [...ledger, { node, dist: at, path: numberList(p?.path) }];
          caption = tr(
            'caption.settle',
            'Settled — vertex {node} is at {dist}. It will not move again.',
            { node, dist: at },
          );
          push();
          return;
        }

        case 'relax-check': {
          const p = event.payload as
            | {
                from?: unknown;
                to?: unknown;
                weight?: unknown;
                through?: unknown;
                current?: unknown;
                improved?: unknown;
              }
            | undefined;
          const from = typeof p?.from === 'number' ? p.from : 0;
          const to = typeof p?.to === 'number' ? p.to : 0;
          const weight = typeof p?.weight === 'number' ? p.weight : 0;
          const through = typeof p?.through === 'number' ? p.through : 0;
          const current = typeof p?.current === 'number' ? p.current : null;
          activeEdge = { from, to, improved: p?.improved === true };
          changedNode = null;
          scanNode = null;
          caption = tr(
            'caption.relaxCheck',
            'From {from} to {to}: {base} + {weight} = {through}, currently {current}.',
            { from, to, base: through - weight, weight, through, current: mark(current) },
          );
          push();
          return;
        }

        case 'relax-apply': {
          const p = event.payload as
            | { node?: unknown; before?: unknown; after?: unknown; parent?: unknown }
            | undefined;
          const node = typeof p?.node === 'number' ? p.node : 0;
          const after = typeof p?.after === 'number' ? p.after : 0;
          const before = typeof p?.before === 'number' ? p.before : null;
          if (typeof p?.parent === 'number') parent[node] = p.parent;
          dist[node] = after;
          changedNode = node;
          caption = tr(
            'caption.relaxApply',
            'A shorter route — vertex {to} drops from {before} to {after}.',
            { to: node, before: mark(before), after },
          );
          push();
          return;
        }

        case 'done': {
          const p = event.payload as { order?: unknown } | undefined;
          const order = numberList(p?.order);
          clearMarks();
          finished = true;
          caption = tr(
            'caption.done',
            'All {count} vertices are settled — the settled distances never went down.',
            { count: order.length },
          );
          push();
          return;
        }

        default:
          // 그 밖의 표준 이벤트는 이 facet 이 발신하지 않는다. 조용히 흘린다.
          return;
      }
    },

    onDestroy(): void {
      codePanel?.clearHighlight?.();
    },
  };
};
