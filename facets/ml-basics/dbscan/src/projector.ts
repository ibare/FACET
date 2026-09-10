/**
 * DBSCAN projector — 알고리즘 이벤트를 stage 메서드 호출과 코드 패널 phase 로 옮긴다.
 *
 * 여기에는 그림도 문안도 없다. 좌표는 stage 가 셈하고 (S-piece 7), 문장은
 * `facet.ts` 의 `messages` 가 정한다 (C10). projector 가 하는 일은 어느 키를
 * 고를지 정하는 것까지다 — 알고리즘이 보내는 `note` 는 갈래 이름이지 문안이 아니다.
 */

import type { ProjectorFactory, ProjectorInstance, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { DbscanData } from './algorithm.js';

/** stage 가 노출하는 메서드. 열린 `ViewInstance` 를 이 모양으로 좁힌다 (C9). */
type DbscanStage = {
  setScene?(points: Array<{ x: number; y: number }>): void;
  setParams?(eps: number, minPts: number, epsIndex: number, minPtsIndex: number): void;
  setProbe?(index: number, count: number, core: boolean): void;
  markNoise?(index: number): void;
  openCluster?(index: number, cluster: number): void;
  joinCluster?(index: number, cluster: number, from: number, border: boolean): void;
  setStack?(cells: number[], top: number): void;
  setResult?(
    labels: number[],
    core: boolean[],
    links: Array<[number, number]>,
    clusters: number,
    noise: number,
  ): void;
  recordTally?(epsIndex: number, minPtsIndex: number, clusters: number, noise: number): void;
  setCaption?(text: string): void;
  reset?(): void;
};

/** 코드 패널. 러너 밖 마운트에서는 아예 없을 수 있다. */
type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

type NumberPair = [number, number];

function isPointArray(v: unknown): v is Array<{ x: number; y: number }> {
  return Array.isArray(v) && v.every((p) => {
    if (typeof p !== 'object' || p === null) return false;
    const r = p as Record<string, unknown>;
    return typeof r.x === 'number' && typeof r.y === 'number';
  });
}

function numbers(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : [];
}

function booleans(v: unknown): boolean[] {
  return Array.isArray(v) ? v.map((b) => b === true) : [];
}

function pairs(v: unknown): NumberPair[] {
  if (!Array.isArray(v)) return [];
  const out: NumberPair[] = [];
  for (const item of v) {
    if (Array.isArray(item) && typeof item[0] === 'number' && typeof item[1] === 'number') {
      out.push([item[0], item[1]]);
    }
  }
  return out;
}

export const dbscanProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as DbscanStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  /** 지금 놓인 손잡이. 캡션이 값을 같이 말해야 해서 들고 있는다. */
  let eps = 0;
  let minPts = 0;

  const say = (text: string): void => stage?.setCaption?.(text);

  return {
    onInit(initialData: unknown) {
      const data = initialData as Partial<DbscanData> | undefined;
      const points = isPointArray(data?.points) ? data.points : [];
      stage?.reset?.();
      stage?.setScene?.(points);
      say(tr('caption.start', 'Points on the plane: {n}. No group yet.', { n: points.length }));
    },

    async onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = event.payload as { phase?: unknown } | undefined;
          codePanel?.highlightPhase?.(typeof p?.phase === 'string' ? p.phase : null);
          return;
        }

        case 'params-set': {
          const p = event.payload as
            | { eps?: unknown; minPts?: unknown; epsIndex?: unknown; minPtsIndex?: unknown; note?: unknown }
            | undefined;
          if (typeof p?.eps === 'number') eps = p.eps;
          if (typeof p?.minPts === 'number') minPts = p.minPts;
          const ei = typeof p?.epsIndex === 'number' ? p.epsIndex : 0;
          const mi = typeof p?.minPtsIndex === 'number' ? p.minPtsIndex : 0;
          stage?.setParams?.(eps, minPts, ei, mi);
          switch (p?.note) {
            case 'eps-up':
              say(tr('caption.epsUp', 'eps raised to {eps} — what was apart now links up.', { eps }));
              break;
            case 'eps-down':
              say(tr('caption.epsDown', 'eps lowered to {eps} — the links snap and groups fall apart.', { eps }));
              break;
            case 'min-pts-up':
              say(tr('caption.minPtsUp', 'minPts raised to {minPts} — thin blobs lose their core first.', { minPts }));
              break;
            case 'min-pts-down':
              say(tr('caption.minPtsDown', 'minPts lowered to {minPts} — thin blobs get their core back.', { minPts }));
              break;
            default:
              // 'start' — 첫 자리에서는 캡션을 onInit 이 이미 놓았다.
              break;
          }
          return;
        }

        case 'probe': {
          const p = event.payload as
            | { index?: unknown; count?: unknown; core?: unknown }
            | undefined;
          if (typeof p?.index !== 'number' || typeof p.count !== 'number') return;
          const core = p.core === true;
          stage?.setProbe?.(p.index, p.count, core);
          say(
            core
              ? tr('caption.core', 'Neighbours here: {n}. That reaches minPts, so this point is a core.', { n: p.count })
              : tr('caption.thin', 'Neighbours here: {n}. Short of minPts {minPts}.', { n: p.count, minPts }),
          );
          return;
        }

        case 'noise-marked': {
          const p = event.payload as { index?: unknown } | undefined;
          if (typeof p?.index !== 'number') return;
          stage?.markNoise?.(p.index);
          say(tr('caption.noise', 'Too few neighbours — this one is left as noise.'));
          return;
        }

        case 'cluster-opened': {
          const p = event.payload as { index?: unknown; cluster?: unknown } | undefined;
          if (typeof p?.index !== 'number' || typeof p.cluster !== 'number') return;
          stage?.openCluster?.(p.index, p.cluster);
          say(tr('caption.opened', 'A new group opens here. Groups so far: {n}.', { n: p.cluster }));
          return;
        }

        case 'spread-to': {
          const p = event.payload as
            | { index?: unknown; cluster?: unknown; from?: unknown }
            | undefined;
          if (typeof p?.index !== 'number' || typeof p.cluster !== 'number') return;
          const from = typeof p.from === 'number' ? p.from : p.index;
          stage?.joinCluster?.(p.index, p.cluster, from, false);
          say(tr('caption.spread', 'It catches on the neighbour of a neighbour and goes on the stack.'));
          return;
        }

        case 'border-reclaimed': {
          const p = event.payload as
            | { index?: unknown; cluster?: unknown; from?: unknown }
            | undefined;
          if (typeof p?.index !== 'number' || typeof p.cluster !== 'number') return;
          const from = typeof p.from === 'number' ? p.from : p.index;
          stage?.joinCluster?.(p.index, p.cluster, from, true);
          say(tr('caption.reclaim', 'A point once called noise becomes a border and joins the group.'));
          return;
        }

        case 'stack-changed': {
          const p = event.payload as { cells?: unknown; top?: unknown } | undefined;
          stage?.setStack?.(numbers(p?.cells), typeof p?.top === 'number' ? p.top : 0);
          return;
        }

        case 'settled': {
          const p = event.payload as
            | {
                labels?: unknown;
                core?: unknown;
                links?: unknown;
                clusters?: unknown;
                noise?: unknown;
                epsIndex?: unknown;
                minPtsIndex?: unknown;
              }
            | undefined;
          const clusters = typeof p?.clusters === 'number' ? p.clusters : 0;
          const noise = typeof p?.noise === 'number' ? p.noise : 0;
          stage?.setResult?.(numbers(p?.labels), booleans(p?.core), pairs(p?.links), clusters, noise);
          if (typeof p?.epsIndex === 'number' && typeof p?.minPtsIndex === 'number') {
            stage?.recordTally?.(p.epsIndex, p.minPtsIndex, clusters, noise);
          }
          say(
            tr('caption.settled', 'eps {eps} with minPts {minPts} — groups {clusters}, noise {noise}.', {
              eps,
              minPts,
              clusters,
              noise,
            }),
          );
          codePanel?.clearHighlight?.();
          return;
        }

        default:
          // 위 아홉이 이 알고리즘이 내는 전부다. 그 밖의 type 은 조용히 흘린다.
          return;
      }
    },

    onReset() {
      stage?.reset?.();
      codePanel?.clearHighlight?.();
    },
  };
};
