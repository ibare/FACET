/**
 * 프림 이벤트 → 무대 + 코드 패널 번역기.
 *
 * 알고리즘은 수만 보낸다. 어떤 말로 화면에 뜰지는 여기서 정하고, 문안 자체는
 * `facet.ts` 의 `messages` 에 있다 — 코드에는 키와 en 원본만 남는다 (C10).
 *
 * 무대의 상태는 이벤트를 따라 그림자로 들고 있다가 걸음마다 통째로 넘긴다.
 * 알고리즘의 `key` / `parent` / `inTree` 를 그대로 비추는 것이라 원본은
 * `ctx.data` 쪽이고 이쪽은 사본이다 (원칙 5).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { PrimStageGraph, PrimStageSnapshot } from './prim-mst-stage.js';

/** 무대가 노출하는 계약. 러너가 주는 것은 열린 타입이라 여기서 좁힌다 (C9). */
type PrimStage = {
  setGraph?(graph: PrimStageGraph): void;
  update?(snapshot: PrimStageSnapshot): void;
  setCaption?(text: string): void;
};

/** 코드 패널 계약 — `@ffacet/view-code` 가 공개한 메서드 둘. */
type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

type InitialGraph = {
  vertexCount?: number;
  start?: number;
  edges?: { a: number; b: number; w: number }[];
};

type PhasePayload = { phase?: unknown };
type TreeInitPayload = { start?: unknown; keys?: unknown };
type RoundPayload = { treeSize?: unknown };
type ScanPayload = {
  vertex?: unknown;
  key?: unknown;
  inTree?: unknown;
  best?: unknown;
  bestKey?: unknown;
  became?: unknown;
};
type ChoosePayload = { vertex?: unknown; from?: unknown; weight?: unknown };
type AttachPayload = {
  vertex?: unknown;
  from?: unknown;
  weight?: unknown;
  total?: unknown;
};
type OfferPayload = {
  from?: unknown;
  to?: unknown;
  weight?: unknown;
  before?: unknown;
  improved?: unknown;
  inside?: unknown;
};
type DonePayload = { edgeCount?: unknown; total?: unknown };

const num = (x: unknown): number | null => (typeof x === 'number' ? x : null);
const bool = (x: unknown): boolean => x === true;

export const primMstProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as PrimStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  // 러너 밖에서 projector 를 만들 때만 쓰이는 fallback (C10).
  const tr = runtime?.t ?? makeTranslator();

  let graph: PrimStageGraph = { n: 0, start: 0, edges: [] };
  let snapshot: PrimStageSnapshot = blank(0);

  function blank(n: number): PrimStageSnapshot {
    return {
      keys: new Array<number | null>(n).fill(null),
      parent: new Array<number | null>(n).fill(null),
      inTree: new Array<boolean>(n).fill(false),
      scanAt: null,
      bestAt: null,
      chosen: null,
      offer: null,
      order: [],
      total: 0,
      done: false,
    };
  }

  function paint(caption: string): void {
    stage?.update?.(snapshot);
    stage?.setCaption?.(caption);
  }

  /** 첫 화면의 문안. 세 곳에서 같은 말을 하므로 en 원본을 한 번만 적는다 (C10). */
  function initCaption(start: number): string {
    return tr('caption.init', 'The tree starts at vertex {start}. Nothing else is reachable yet.', {
      start: String(start),
    });
  }

  return {
    onInit(initialData: unknown): void {
      const d = (initialData ?? {}) as InitialGraph;
      graph = {
        n: typeof d.vertexCount === 'number' ? d.vertexCount : 0,
        start: typeof d.start === 'number' ? d.start : 0,
        edges: Array.isArray(d.edges) ? d.edges : [],
      };
      snapshot = blank(graph.n);
      if (graph.start >= 0 && graph.start < graph.n) snapshot.keys[graph.start] = 0;
      stage?.setGraph?.(graph);
      paint(initCaption(graph.start));
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as PhasePayload | undefined;
          if (typeof p?.phase === 'string') codePanel?.highlightPhase?.(p.phase);
          return;
        }

        case 'tree-init': {
          const p = event.payload as TreeInitPayload | undefined;
          snapshot = blank(graph.n);
          if (Array.isArray(p?.keys)) {
            snapshot.keys = p.keys.map((k) => num(k));
          }
          paint(initCaption(num(p?.start) ?? graph.start));
          return;
        }

        case 'round-begin': {
          const p = event.payload as RoundPayload | undefined;
          snapshot.scanAt = null;
          snapshot.bestAt = null;
          snapshot.chosen = null;
          snapshot.offer = null;
          paint(
            tr(
              'caption.round',
              'The tree holds {size} vertices. Look at every edge that leaves it.',
              { size: String(num(p?.treeSize) ?? 0) },
            ),
          );
          return;
        }

        case 'scan': {
          const p = event.payload as ScanPayload | undefined;
          const vertex = num(p?.vertex);
          if (vertex === null) return;
          snapshot.scanAt = vertex;
          snapshot.bestAt = num(p?.best);
          snapshot.offer = null;
          const key = num(p?.key);
          const bestKey = num(p?.bestKey);
          if (bool(p?.inTree)) {
            paint(
              tr('caption.scanInside', 'Vertex {node} is already in the tree — skip it.', {
                node: String(vertex),
              }),
            );
          } else if (key === null) {
            paint(
              tr('caption.scanUnreached', 'No edge reaches vertex {node} yet.', {
                node: String(vertex),
              }),
            );
          } else if (bool(p?.became)) {
            paint(
              tr('caption.scanBest', 'Lightest so far: vertex {node} for {key}.', {
                node: String(vertex),
                key: String(key),
              }),
            );
          } else {
            paint(
              tr(
                'caption.scanHeavier',
                'Vertex {node} costs {key} — heavier than the current best {best}.',
                { node: String(vertex), key: String(key), best: String(bestKey ?? key) },
              ),
            );
          }
          return;
        }

        case 'choose': {
          const p = event.payload as ChoosePayload | undefined;
          const vertex = num(p?.vertex);
          if (vertex === null) return;
          snapshot.scanAt = null;
          snapshot.bestAt = null;
          snapshot.chosen = vertex;
          const from = num(p?.from);
          if (from === null) {
            paint(
              tr('caption.chooseStart', 'Vertex {node} is where the tree begins.', {
                node: String(vertex),
              }),
            );
          } else {
            paint(
              tr('caption.choose', 'Take the edge {from}-{node}, weight {weight}.', {
                from: String(from),
                node: String(vertex),
                weight: String(num(p?.weight) ?? 0),
              }),
            );
          }
          return;
        }

        case 'attach': {
          const p = event.payload as AttachPayload | undefined;
          const vertex = num(p?.vertex);
          if (vertex === null) return;
          snapshot.inTree[vertex] = true;
          snapshot.chosen = vertex;
          snapshot.offer = null;
          snapshot.total = num(p?.total) ?? snapshot.total;
          const from = num(p?.from);
          const weight = num(p?.weight) ?? 0;
          if (from === null) {
            paint(
              tr('caption.attachStart', 'The tree is one vertex wide: {node}.', {
                node: String(vertex),
              }),
            );
          } else {
            snapshot.order = [...snapshot.order, { from, to: vertex, weight }];
            paint(
              tr(
                'caption.attach',
                'The tree grew by one — vertex {node} joined. Total weight is now {total}.',
                { node: String(vertex), total: String(snapshot.total) },
              ),
            );
          }
          return;
        }

        case 'offer': {
          const p = event.payload as OfferPayload | undefined;
          const from = num(p?.from);
          const to = num(p?.to);
          if (from === null || to === null) return;
          snapshot.offer = { a: from, b: to };
          const weight = num(p?.weight) ?? 0;
          const before = num(p?.before);
          if (bool(p?.improved)) {
            snapshot.keys[to] = weight;
            snapshot.parent[to] = from;
          }
          if (bool(p?.inside)) {
            paint(
              tr(
                'caption.offerInside',
                'Vertex {to} is already in the tree — this edge would close a cycle.',
                { to: String(to) },
              ),
            );
          } else if (bool(p?.improved) && before === null) {
            paint(
              tr('caption.offerFirst', 'Vertex {to} is reachable at last, for {weight}.', {
                to: String(to),
                weight: String(weight),
              }),
            );
          } else if (bool(p?.improved)) {
            paint(
              tr('caption.offerImprove', 'A lighter way into vertex {to}: {before} becomes {weight}.', {
                to: String(to),
                before: String(before ?? weight),
                weight: String(weight),
              }),
            );
          } else {
            paint(
              tr('caption.offerKeep', 'Into vertex {to} this edge costs {weight}; {before} is lighter.', {
                to: String(to),
                weight: String(weight),
                before: String(before ?? weight),
              }),
            );
          }
          return;
        }

        case 'done': {
          const p = event.payload as DonePayload | undefined;
          snapshot.scanAt = null;
          snapshot.bestAt = null;
          snapshot.chosen = null;
          snapshot.offer = null;
          snapshot.done = true;
          snapshot.total = num(p?.total) ?? snapshot.total;
          codePanel?.highlightPhase?.('done');
          paint(
            tr(
              'caption.done',
              '{count} edges hold every vertex in one tree. Total weight is {total}.',
              { count: String(num(p?.edgeCount) ?? 0), total: String(snapshot.total) },
            ),
          );
          return;
        }

        default:
          // 알고리즘이 내는 이벤트는 위가 전부다. 새 어휘가 오면 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      snapshot = blank(graph.n);
      if (graph.start >= 0 && graph.start < graph.n) snapshot.keys[graph.start] = 0;
      codePanel?.clearHighlight?.();
      paint(initCaption(graph.start));
    },
  };
};
