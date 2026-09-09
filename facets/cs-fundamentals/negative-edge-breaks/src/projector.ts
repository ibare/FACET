/**
 * negativeEdgeBreaks projector — 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이라 그대로 넘기지 않는다. 필드마다 `typeof` / `Array.isArray`
 * 로 걸러 정형 객체를 조립한 뒤에만 stage 로 보낸다 (C9).
 * 캡션 문안은 여기서 키로 조회한다 — algorithm 은 문안을 모른다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type EdgeSpec = { from: string; to: string; w: number };

type GraphSpec = {
  nodes: string[];
  edges: EdgeSpec[];
  start: string;
  goal: string;
};

type Stage = {
  setGraph(g: GraphSpec): void;
  reset(): void;
  setCaption(text: string): void;
  settle(node: string, dist: number): Promise<void>;
  relaxAccept(p: { from: string; to: string; candidate: number }): Promise<void>;
  relaxSealed(p: { from: string; to: string; candidate: number }): Promise<void>;
  relaxKept(p: { from: string; to: string; candidate: number }): Promise<void>;
  blockNews(p: { node: string; to: string; wouldBe: number }): Promise<void>;
  traceTruth(p: { path: string[]; running: number[]; total: number }): Promise<void>;
  showVerdict(goal: string): void;
};

type SettlePayload = { node: string; dist: number };
type RelaxPayload = { from: string; to: string; candidate: number; kept: number };
type BlockedPayload = { node: string; to: string; wouldBe: number; stays: number };
type TruthPayload = { path: string[]; running: number[]; total: number };
type VerdictPayload = { goal: string; settled: number; truth: number };

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function readGraph(data: unknown): GraphSpec | null {
  const d = data as
    | { nodes?: unknown; edges?: unknown; start?: unknown; goal?: unknown }
    | undefined;
  if (!Array.isArray(d?.nodes) || !Array.isArray(d?.edges)) return null;
  const start = str(d?.start);
  const goal = str(d?.goal);
  if (start === null || goal === null) return null;
  const nodes: string[] = [];
  for (const n of d.nodes) {
    const id = str(n);
    if (id !== null) nodes.push(id);
  }
  const edges: EdgeSpec[] = [];
  for (const raw of d.edges) {
    const e = raw as { from?: unknown; to?: unknown; w?: unknown };
    const from = str(e?.from);
    const to = str(e?.to);
    const w = num(e?.w);
    if (from !== null && to !== null && w !== null) edges.push({ from, to, w });
  }
  if (nodes.length === 0 || edges.length === 0) return null;
  return { nodes, edges, start, goal };
}

function readSettle(payload: unknown): SettlePayload | null {
  const p = payload as { node?: unknown; dist?: unknown } | undefined;
  const node = str(p?.node);
  const dist = num(p?.dist);
  return node !== null && dist !== null ? { node, dist } : null;
}

function readRelax(payload: unknown): RelaxPayload | null {
  const p = payload as
    | { from?: unknown; to?: unknown; candidate?: unknown; kept?: unknown; previous?: unknown }
    | undefined;
  const from = str(p?.from);
  const to = str(p?.to);
  const candidate = num(p?.candidate);
  if (from === null || to === null || candidate === null) return null;
  // kept 는 거절 계열에만 있고, 받아들인 경우엔 previous (∞ 면 null) 다.
  const kept = num(p?.kept) ?? num(p?.previous) ?? Infinity;
  return { from, to, candidate, kept };
}

function readBlocked(payload: unknown): BlockedPayload | null {
  const p = payload as
    | { node?: unknown; to?: unknown; wouldBe?: unknown; stays?: unknown }
    | undefined;
  const node = str(p?.node);
  const to = str(p?.to);
  const wouldBe = num(p?.wouldBe);
  const stays = num(p?.stays);
  if (node === null || to === null || wouldBe === null || stays === null) return null;
  return { node, to, wouldBe, stays };
}

function readTruth(payload: unknown): TruthPayload | null {
  const p = payload as { path?: unknown; running?: unknown; total?: unknown } | undefined;
  const total = num(p?.total);
  if (!Array.isArray(p?.path) || !Array.isArray(p?.running) || total === null) return null;
  const path: string[] = [];
  for (const n of p.path) {
    const id = str(n);
    if (id !== null) path.push(id);
  }
  const running: number[] = [];
  for (const v of p.running) {
    const n = num(v);
    if (n !== null) running.push(n);
  }
  if (path.length < 2 || running.length !== path.length) return null;
  return { path, running, total };
}

function readVerdict(payload: unknown): VerdictPayload | null {
  const p = payload as { goal?: unknown; settled?: unknown; truth?: unknown } | undefined;
  const goal = str(p?.goal);
  const settled = num(p?.settled);
  const truth = num(p?.truth);
  return goal !== null && settled !== null && truth !== null ? { goal, settled, truth } : null;
}

export const negativeEdgeBreaksProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  let graph: GraphSpec | null = null;

  const startCaption = (): void => {
    if (!graph) return;
    stage?.setCaption(
      tr('caption.start', 'Start at {start}. Nothing is settled yet.', { start: graph.start }),
    );
  };

  return {
    onInit(initialData: unknown): void {
      const g = readGraph(initialData);
      if (!g) return;
      graph = g;
      stage?.setGraph(g);
      startCaption();
    },

    onReset(): void {
      stage?.reset();
      startCaption();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      switch (event.type) {
        case 'rewind': {
          stage.reset();
          startCaption();
          return;
        }
        case 'settle': {
          const p = readSettle(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.settle', 'The nearest one left is {node} at {d} — settle it.', {
              node: p.node,
              d: p.dist,
            }),
          );
          await stage.settle(p.node, p.dist);
          return;
        }
        case 'relax-accept': {
          const p = readRelax(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.accept', 'Relax {from}→{to}: {d}. {to} takes it.', {
              from: p.from,
              to: p.to,
              d: p.candidate,
            }),
          );
          await stage.relaxAccept(p);
          return;
        }
        case 'relax-sealed': {
          const p = readRelax(event.payload);
          if (!p) return;
          stage.setCaption(
            tr(
              'caption.sealed',
              '{from}→{to} gives {cand}, shorter than {kept}. But {to} is settled and refuses it.',
              { from: p.from, to: p.to, cand: p.candidate, kept: p.kept },
            ),
          );
          await stage.relaxSealed(p);
          return;
        }
        case 'relax-kept': {
          const p = readRelax(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.kept', '{from}→{to} gives {cand}, no better than {kept}. Nothing moves.', {
              from: p.from,
              to: p.to,
              cand: p.candidate,
              kept: p.kept,
            }),
          );
          await stage.relaxKept(p);
          return;
        }
        case 'news-blocked': {
          const p = readBlocked(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.blocked', 'So {wouldBe} never leaves {node}, and {to} stays {stays}.', {
              wouldBe: p.wouldBe,
              node: p.node,
              to: p.to,
              stays: p.stays,
            }),
          );
          await stage.blockNews(p);
          return;
        }
        case 'truth-trace': {
          const p = readTruth(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.truth', 'The real shortest path is {path} = {total}.', {
              path: p.path.join('→'),
              total: p.total,
            }),
          );
          await stage.traceTruth(p);
          return;
        }
        case 'verdict': {
          const p = readVerdict(event.payload);
          if (!p) return;
          stage.showVerdict(p.goal);
          stage.setCaption(
            tr(
              'caption.verdict',
              '{goal} keeps {settled}, but the answer is {truth}. The settled number is wrong.',
              { goal: p.goal, settled: p.settled, truth: p.truth },
            ),
          );
          return;
        }
        default:
          // 이 facet 이 내보내지 않는 이벤트는 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
