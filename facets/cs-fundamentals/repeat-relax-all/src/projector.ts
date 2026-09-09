/**
 * repeatRelaxAll projector — 되풀이 이벤트를 판 위의 움직임으로 옮긴다.
 *
 * payload 는 열린 타입이므로 여기서 한 번에 좁힌다 (C9). stage 는 좁혀진 값만
 * 받고, 문안은 여기서 `tr` 로 해석해 넘긴다 (C10 — algorithm 은 문안을 모른다).
 */

import type { ProjectorFactory, ProjectorInstance, ProjectorRuntime, ProjectorViews } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { RelaxApplyStep, RelaxRoundStep, RelaxSkipStep, RelaxStageModel } from './repeat-relax-all-stage.js';

type RelaxStage = {
  setup(model: RelaxStageModel): void;
  setCaption(text: string): void;
  scanSkip(step: RelaxSkipStep): Promise<void>;
  scanApply(step: RelaxApplyStep): Promise<void>;
  finishRound(step: RelaxRoundStep): void;
  finish(): Promise<void>;
};

type SkipPayload = {
  round?: unknown;
  edgeIndex?: unknown;
  from?: unknown;
  to?: unknown;
  reason?: unknown;
};

type ApplyPayload = {
  round?: unknown;
  edgeIndex?: unknown;
  from?: unknown;
  to?: unknown;
  dist?: unknown;
};

type RoundPayload = {
  round?: unknown;
  scans?: unknown;
  applied?: unknown;
};

type DonePayload = {
  rounds?: unknown;
  nodes?: unknown;
  scans?: unknown;
  applied?: unknown;
};

type RawEdge = { from?: unknown; to?: unknown; weight?: unknown };

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** initialData 는 열린 스키마다. 판이 그릴 수 있는 모양으로만 좁혀 넘긴다. */
function readModel(initialData: unknown): RelaxStageModel | null {
  const data = initialData as
    | { nodes?: unknown; edges?: unknown; source?: unknown }
    | undefined;
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null;

  const nodes: string[] = [];
  for (const raw of data.nodes) {
    const name = str(raw);
    if (name !== null) nodes.push(name);
  }
  const edges: RelaxStageModel['edges'] = [];
  for (const raw of data.edges) {
    const edge = raw as RawEdge;
    const from = str(edge?.from);
    const to = str(edge?.to);
    const weight = num(edge?.weight);
    if (from !== null && to !== null && weight !== null) edges.push({ from, to, weight });
  }
  if (nodes.length === 0 || edges.length === 0) return null;
  const source = str(data.source) ?? nodes[0];

  return { nodes, edges, source, rounds: Math.max(1, nodes.length - 1) };
}

export const repeatRelaxAllProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as RelaxStage | undefined;

  let model: RelaxStageModel | null = null;

  const edgeName = (index: number): string => {
    const edge = model?.edges[index];
    return edge ? `${edge.from}→${edge.to}` : '';
  };

  const openingCaption = (): void => {
    if (!model) return;
    stage?.setCaption(
      tr('caption.start', 'Only {source} has a distance. Every other node is unknown.', {
        source: model.source,
      }),
    );
  };

  return {
    onInit(initialData: unknown): void {
      const next = readModel(initialData);
      if (!next) return;
      model = next;
      stage?.setup(next);
      openingCaption();
    },

    onReset(): void {
      model = null;
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'relax-skip': {
          const p = event.payload as SkipPayload | undefined;
          const round = num(p?.round);
          const edgeIndex = num(p?.edgeIndex);
          const from = str(p?.from);
          if (round === null || edgeIndex === null || from === null) return;
          const reason = p?.reason === 'noGain' ? 'noGain' : 'unknown';
          stage?.setCaption(
            reason === 'unknown'
              ? tr('caption.skipUnknown', '{edge}: {from} is still unknown, so nothing happens.', {
                  edge: edgeName(edgeIndex),
                  from,
                })
              : tr('caption.skipNoGain', '{edge}: no shorter route, so nothing happens.', {
                  edge: edgeName(edgeIndex),
                }),
          );
          await stage?.scanSkip({ round, edgeIndex, reason });
          return;
        }

        case 'relax-apply': {
          const p = event.payload as ApplyPayload | undefined;
          const round = num(p?.round);
          const edgeIndex = num(p?.edgeIndex);
          const dist = num(p?.dist);
          const to = str(p?.to);
          if (round === null || edgeIndex === null || dist === null || to === null) return;
          stage?.setCaption(
            tr('caption.apply', '{edge}: {to} becomes {dist}. The front moved one node.', {
              edge: edgeName(edgeIndex),
              to,
              dist,
            }),
          );
          await stage?.scanApply({ round, edgeIndex, dist });
          return;
        }

        case 'round-end': {
          const p = event.payload as RoundPayload | undefined;
          const round = num(p?.round);
          const scans = num(p?.scans);
          const applied = num(p?.applied);
          if (round === null || scans === null || applied === null) return;
          stage?.finishRound({ round, scans, applied });
          stage?.setCaption(
            tr('caption.roundEnd', 'Round {round}: {applied} of {scans} scans did something.', {
              round,
              applied,
              scans,
            }),
          );
          return;
        }

        case 'done': {
          const p = event.payload as DonePayload | undefined;
          const rounds = num(p?.rounds);
          const nodes = num(p?.nodes);
          const scans = num(p?.scans);
          const applied = num(p?.applied);
          if (rounds === null || nodes === null || scans === null || applied === null) return;
          stage?.setCaption(
            tr(
              'caption.done',
              '{rounds} rounds for {nodes} nodes: the front moves one node per round, so only {applied} of {scans} scans mattered.',
              { rounds, nodes, scans, applied },
            ),
          );
          await stage?.finish();
          return;
        }

        case 'rewind': {
          if (!model) return;
          stage?.setup(model);
          openingCaption();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각이 내보내지 않는다. 와도 조용히 흘린다.
          return;
      }
    },
  };
};
