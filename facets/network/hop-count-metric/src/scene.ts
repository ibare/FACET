/**
 * hop-count-metric 의 장면.
 *
 * 바탕: 라우터 · 선 · 망 · 망이 붙은 라우터 (initialData 에서 베낀다).
 * 자취: 표(라우터마다 수와 다음 홉) — initial() 이 startTable 로 첫 표를, round 가 라운드 뒤의 표를 준다.
 * 이번 걸음: start · round(알림 전부) · choose(지켜보는 라우터에서의 견줌).
 * 셈은 알고리즘이 한다. 장면은 이벤트를 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { startTable } from './algorithm.js';

export interface SceneEntry {
  dist: number;
  via: string | null;
}

export interface SceneOffer {
  from: string;
  to: string;
  sent: number;
  value: number;
  kept: boolean;
}

export interface SceneCandidate {
  via: string;
  value: number;
}

export type HopStep =
  | { kind: 'start' }
  | { kind: 'round'; round: number; offers: SceneOffer[]; before: Array<SceneEntry | null> }
  | { kind: 'choose'; router: string; candidates: SceneCandidate[]; keptVia: string };

export interface HopCountMetricScene {
  routers: string[];
  links: Array<[string, string]>;
  net: string;
  attached: string;
  table: Array<SceneEntry | null>;
  step: HopStep;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v) if (typeof x === 'string') out.push(x);
  return out;
}

function readLinks(v: unknown): Array<[string, string]> {
  if (!Array.isArray(v)) return [];
  const out: Array<[string, string]> = [];
  for (const x of v) {
    if (Array.isArray(x) && typeof x[0] === 'string' && typeof x[1] === 'string') out.push([x[0], x[1]]);
  }
  return out;
}

function readTable(v: unknown, size: number): Array<SceneEntry | null> {
  const out: Array<SceneEntry | null> = [];
  const arr = Array.isArray(v) ? v : [];
  for (let i = 0; i < size; i += 1) {
    const x: unknown = arr[i];
    if (isRecord(x) && typeof x.dist === 'number' && (typeof x.via === 'string' || x.via === null)) {
      out.push({ dist: x.dist, via: x.via });
    } else {
      out.push(null);
    }
  }
  return out;
}

function readOffers(v: unknown): SceneOffer[] {
  if (!Array.isArray(v)) return [];
  const out: SceneOffer[] = [];
  for (const x of v) {
    if (
      isRecord(x) &&
      typeof x.from === 'string' &&
      typeof x.to === 'string' &&
      typeof x.sent === 'number' &&
      typeof x.value === 'number' &&
      typeof x.kept === 'boolean'
    ) {
      out.push({ from: x.from, to: x.to, sent: x.sent, value: x.value, kept: x.kept });
    }
  }
  return out;
}

function readCandidates(v: unknown): SceneCandidate[] {
  if (!Array.isArray(v)) return [];
  const out: SceneCandidate[] = [];
  for (const x of v) {
    if (isRecord(x) && typeof x.via === 'string' && typeof x.value === 'number') out.push({ via: x.via, value: x.value });
  }
  return out;
}

function copyTable(table: ReadonlyArray<SceneEntry | null>): Array<SceneEntry | null> {
  return table.map((e) => (e ? { dist: e.dist, via: e.via } : null));
}

export const hopCountMetricScene: ScenePlan<HopCountMetricScene> = {
  initial(initialData: unknown): HopCountMetricScene {
    const d = isRecord(initialData) ? initialData : {};
    const routers = readStrings(d.routers);
    const attached = typeof d.attached === 'string' ? d.attached : '';
    return {
      routers,
      links: readLinks(d.links),
      net: typeof d.net === 'string' ? d.net : '',
      attached,
      table: startTable(routers, attached),
      step: { kind: 'start' },
    };
  },

  reduce(scene: HopCountMetricScene, event: FacetRuntimeEvent): HopCountMetricScene {
    const p = isRecord(event.payload) ? event.payload : {};
    const size = scene.routers.length;
    switch (event.type) {
      case 'round': {
        if (typeof p.round !== 'number') return scene;
        return {
          ...scene,
          table: readTable(p.table, size),
          step: { kind: 'round', round: p.round, offers: readOffers(p.offers), before: copyTable(scene.table) },
        };
      }
      case 'choose': {
        if (typeof p.router !== 'string' || typeof p.keptVia !== 'string') return scene;
        return {
          ...scene,
          table: copyTable(scene.table),
          step: { kind: 'choose', router: p.router, candidates: readCandidates(p.candidates), keptVia: p.keptVia },
        };
      }
      default:
        return scene;
    }
  },
};
