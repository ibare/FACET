/**
 * undo-by-back-edge projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이라 여기서 한 번에 좁힌다 (C9). stage 는 좁혀진 값만 받는다.
 * 화면 문안도 여기서 정해진다 — algorithm 은 번역기를 갖지 않으므로 어느 문장을
 * 쓸지는 표현 계층의 일이다 (C10).
 */

import {
  makeTranslator,
  parseTarget,
  type FacetEventTarget,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type StageGraph = {
  nodes: string[];
  edges: { from: string; to: string; capacity: number }[];
  source: string;
  sink: string;
};

type StagePath = {
  nodes: string[];
  reverse: boolean[];
  amount: number;
  caption: string;
};

type StagePush = StagePath & {
  total: number;
  flows: Record<string, number>;
};

type StageStuck = {
  reachable: string[];
  blocked: string[];
  caption: string;
};

type UndoStage = {
  setGraph(g: StageGraph): void;
  reset(): void;
  showPath(p: StagePath): Promise<void>;
  pushFlow(p: StagePush): Promise<void>;
  showBlocked(p: StageStuck): Promise<void>;
  finish(p: StageStuck): Promise<void>;
};

/** `node:S` 들만 골라 정점 id 로. 식별자 파싱은 parseTarget 을 거친다. */
function nodeIds(target: FacetEventTarget | undefined): string[] {
  const arr = Array.isArray(target) ? target : target === undefined ? [] : [target];
  const out: string[] = [];
  for (const raw of arr) {
    if (typeof raw !== 'string') continue;
    const parsed = parseTarget(raw);
    if (parsed?.prefix === 'node' && parsed.id.length > 0) out.push(parsed.id);
  }
  return out;
}

/** `edge:S-A` 들만 골라 `S-A` 로. */
function edgeKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const parsed = parseTarget(item);
    if (parsed?.prefix === 'edge' && parsed.id.length > 0) out.push(parsed.id);
  }
  return out;
}

function boolArray(raw: unknown): boolean[] {
  return Array.isArray(raw) ? raw.map((v) => v === true) : [];
}

function num(raw: unknown, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
}

function readGraph(raw: unknown): StageGraph | null {
  const d = raw as
    | { source?: unknown; sink?: unknown; nodes?: unknown; edges?: unknown }
    | undefined;
  if (typeof d?.source !== 'string' || typeof d.sink !== 'string') return null;
  if (!Array.isArray(d.nodes) || !Array.isArray(d.edges)) return null;
  const nodes = d.nodes.filter((n): n is string => typeof n === 'string');
  const edges: { from: string; to: string; capacity: number }[] = [];
  for (const item of d.edges) {
    const e = item as { from?: unknown; to?: unknown; capacity?: unknown };
    if (typeof e?.from !== 'string' || typeof e.to !== 'string') continue;
    if (typeof e.capacity !== 'number' || e.capacity <= 0) continue;
    edges.push({ from: e.from, to: e.to, capacity: e.capacity });
  }
  if (nodes.length === 0 || edges.length === 0) return null;
  return { nodes, edges, source: d.source, sink: d.sink };
}

export const undoByBackEdgeProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as UndoStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const graph = readGraph(initialData);
      if (!stage || !graph) return;
      stage.setGraph(graph);
    },

    onReset(): void {
      stage?.reset();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      const p = event.payload as
        | {
            reverse?: unknown;
            amount?: unknown;
            round?: unknown;
            usesReverse?: unknown;
            total?: unknown;
            edges?: unknown;
            flows?: unknown;
            blocked?: unknown;
          }
        | undefined;

      switch (event.type) {
        case 'path-found': {
          const amount = num(p?.amount, 0);
          const usesReverse = p?.usesReverse === true;
          await stage.showPath({
            nodes: nodeIds(event.target),
            reverse: boolArray(p?.reverse),
            amount,
            caption: usesReverse
              ? tr('caption.pathReverse', 'A back arrow opens one more route — it passes {amount}.', {
                  amount,
                })
              : tr('caption.pathForward', 'A route along forward arrows. Its narrowest pipe passes {amount}.', {
                  amount,
                }),
          });
          return;
        }

        case 'flow-pushed': {
          const amount = num(p?.amount, 0);
          const total = num(p?.total, 0);
          const round = num(p?.round, 0);
          const usesReverse = p?.usesReverse === true;
          const keys = edgeKeys(p?.edges);
          const values = Array.isArray(p?.flows) ? p.flows : [];
          const flows: Record<string, number> = {};
          for (let i = 0; i < keys.length && i < values.length; i += 1) {
            const v = values[i];
            if (typeof v === 'number' && Number.isFinite(v)) flows[keys[i]] = v;
          }
          const caption = usesReverse
            ? tr('caption.pushReverse', 'The new flow pushes the old one out of that pipe — {total} in all.', {
                total,
              })
            : round === 1
              ? tr('caption.pushFirst', '{amount} gets through. Now each filled pipe can be pushed back by what it holds.', {
                  amount,
                })
              : tr('caption.push', '{amount} more gets through — {total} in all.', { amount, total });
          await stage.pushFlow({
            nodes: nodeIds(event.target),
            reverse: boolArray(p?.reverse),
            amount,
            total,
            flows,
            caption,
          });
          return;
        }

        case 'search-blocked': {
          const total = num(p?.total, 0);
          await stage.showBlocked({
            reachable: nodeIds(event.target),
            blocked: edgeKeys(p?.blocked),
            caption: tr('caption.blocked', 'Forward arrows lead nowhere now. Stuck at {total}.', {
              total,
            }),
          });
          return;
        }

        case 'done': {
          const total = num(p?.total, 0);
          await stage.finish({
            reachable: nodeIds(event.target),
            blocked: edgeKeys(p?.blocked),
            caption: tr('caption.done', 'No route left, even along back arrows. {total} is the most.', {
              total,
            }),
          });
          return;
        }

        case 'rewind': {
          stage.reset();
          return;
        }

        default:
          // 이 facet 의 algorithm 은 위 다섯 가지만 발신한다. 그 밖의 것은 조용히 버린다.
          return;
      }
    },
  };
};
