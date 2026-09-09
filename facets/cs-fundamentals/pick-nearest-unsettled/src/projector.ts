/**
 * pickNearestUnsettled projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 화면 문안은 여기서 정한다. algorithm 은 무엇이 일어났는지만 말하고 (probes 의
 * 구성), 그것을 어떤 문장으로 부를지는 표현 계층의 결정이다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type StageProbe = {
  to: string;
  offered: number;
  after: number | null;
  outcome: 'lower' | 'keep' | 'blocked';
};

type StageGraph = {
  nodes: Array<{ id: string }>;
  edges: Array<{ from: string; to: string; weight: number }>;
};

/** stage 가 노출하는 계약. 없는 메서드를 부르지 않도록 전부 optional 로 받는다 (C9). */
type Stage = {
  setGraph?(graph: StageGraph): void;
  setCaption?(text: string): void;
  clear?(): void;
  seed?(id: string, value: number): Promise<void> | void;
  harden?(id: string, value: number): Promise<void> | void;
  spread?(from: string, probes: StageProbe[]): Promise<void> | void;
};

function narrowGraph(raw: unknown): StageGraph | null {
  const d = raw as { nodes?: unknown; edges?: unknown } | undefined;
  if (!Array.isArray(d?.nodes) || !Array.isArray(d.edges)) return null;
  const nodes: StageGraph['nodes'] = [];
  for (const item of d.nodes) {
    const n = item as { id?: unknown };
    if (typeof n?.id !== 'string') continue;
    nodes.push({ id: n.id });
  }
  const edges: StageGraph['edges'] = [];
  for (const item of d.edges) {
    const e = item as { from?: unknown; to?: unknown; weight?: unknown };
    if (typeof e?.from !== 'string' || typeof e.to !== 'string' || typeof e.weight !== 'number') {
      continue;
    }
    edges.push({ from: e.from, to: e.to, weight: e.weight });
  }
  return { nodes, edges };
}

function narrowProbes(raw: unknown): StageProbe[] {
  if (!Array.isArray(raw)) return [];
  const out: StageProbe[] = [];
  for (const item of raw) {
    const p = item as {
      to?: unknown;
      offered?: unknown;
      after?: unknown;
      outcome?: unknown;
    };
    if (typeof p?.to !== 'string' || typeof p.offered !== 'number') continue;
    const outcome =
      p.outcome === 'lower' || p.outcome === 'keep' || p.outcome === 'blocked' ? p.outcome : 'keep';
    out.push({
      to: p.to,
      offered: p.offered,
      after: typeof p.after === 'number' ? p.after : null,
      outcome,
    });
  }
  return out;
}

export const pickNearestUnsettledProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const startCaption = (): string => tr('caption.start', 'Nothing has hardened yet.');

  return {
    onInit(initialData: unknown): void {
      const graph = narrowGraph(initialData);
      if (graph) stage?.setGraph?.(graph);
      stage?.setCaption?.(startCaption());
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'seed': {
          const p = event.payload as { nodeId?: unknown; value?: unknown } | undefined;
          if (typeof p?.nodeId !== 'string' || typeof p.value !== 'number') return;
          stage?.setCaption?.(tr('caption.seed', 'Start at {node} with 0.', { node: p.nodeId }));
          await stage?.seed?.(p.nodeId, p.value);
          return;
        }

        case 'harden': {
          const p = event.payload as { nodeId?: unknown; value?: unknown } | undefined;
          if (typeof p?.nodeId !== 'string' || typeof p.value !== 'number') return;
          stage?.setCaption?.(
            tr('caption.harden', '{node} holds the smallest, {value} — it can drop no further.', {
              node: p.nodeId,
              value: p.value,
            }),
          );
          await stage?.harden?.(p.nodeId, p.value);
          return;
        }

        case 'spread': {
          const p = event.payload as { from?: unknown; probes?: unknown } | undefined;
          if (typeof p?.from !== 'string') return;
          const probes = narrowProbes(p.probes);
          if (probes.length === 0) return;
          const blocked = probes.some((x) => x.outcome === 'blocked');
          const lowered = probes.some((x) => x.outcome === 'lower');
          const kept = probes.some((x) => x.outcome === 'keep');
          // 무엇이 한 화면에 같이 있느냐가 그 걸음이 하는 말이다. 네 갈래 모두
          // 지금 화면에 있는 것만 말한다 — "모두 굳었다" 는 흔들리는 이웃이 하나라도
          // 섞여 있으면 거짓이 된다.
          if (blocked && lowered) {
            stage?.setCaption?.(
              tr('caption.spreadBoth', 'The hardened repel it; the loose take it and drop.'),
            );
          } else if (lowered) {
            stage?.setCaption?.(
              tr('caption.spreadReach', 'Numbers cross from {node} to its neighbours.', {
                node: p.from,
              }),
            );
          } else if (blocked && !kept) {
            stage?.setCaption?.(tr('caption.spreadBlocked', 'It hits stone — nothing budges.'));
          } else {
            stage?.setCaption?.(
              tr('caption.spreadNone', 'It reaches them, but no number changes.'),
            );
          }
          await stage?.spread?.(p.from, probes);
          return;
        }

        case 'rewind': {
          stage?.clear?.();
          stage?.setCaption?.(startCaption());
          return;
        }

        case 'done': {
          stage?.setCaption?.(tr('caption.done', 'All hardened. Nothing is loose.'));
          return;
        }

        default:
          // 위 다섯이 이 조각이 발신하는 전부다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.clear?.();
      stage?.setCaption?.(startCaption());
    },
  };
};
