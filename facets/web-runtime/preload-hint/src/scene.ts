/**
 * preload-hint 장면 — 알고리즘의 여섯 이벤트를 상태로 잇는다.
 *
 * 바탕: 문서 넉 줄 · CSS 규칙 · 자원 목록(참조로 쥐지 않고 값을 베낀다).
 * 자취: 각 줄의 읽힘 · 각 자원의 요청/도착 시각 · 첫 장 · "필요해진" 정보 · hero 칸.
 * 이번 걸음: `step` — stage 가 지금 걸음에서 무엇이 새로 일어났는지만 본다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { CssRule, DocLine, DocLineKind, PreloadHintFacetData, ResourceSpec } from './algorithm.js';

export type DocLineScene = {
  id: string;
  kind: DocLineKind;
  code: string;
  resource?: string;
  read: boolean;
};

export type ResourceLane = {
  file: string;
  durationMs: number;
  requestMs: number | null;
  arriveMs: number | null;
  arrived: boolean;
};

export type NeededInfo = {
  file: string;
  receivedMs: number;
  totalMs: number;
  percent: number;
};

export type PreloadHintStep =
  | { kind: 'line-read'; id: string; ms: number; resource?: string }
  | { kind: 'parse-end'; ms: number; ids: string[] }
  | { kind: 'resource-needed'; ms: number; styleFile: string; file: string; receivedMs: number; totalMs: number; percent: number }
  | { kind: 'first-paint'; ms: number }
  | { kind: 'resource-arrived'; ms: number; file: string; slotId: string };

export type PreloadHintScene = {
  lines: DocLineScene[];
  cssRule: CssRule;
  resources: ResourceLane[];
  heroSlotId: string;
  nowMs: number;
  parseEndMs: number | null;
  needed: NeededInfo | null;
  firstPaintMs: number | null;
  heroFilled: boolean;
  step: PreloadHintStep | null;
};

function laneOf(resources: ResourceSpec[]): ResourceLane[] {
  return resources.map((r) => ({
    file: r.file,
    durationMs: r.durationMs,
    requestMs: null,
    arriveMs: null,
    arrived: false,
  }));
}

function linesOf(docLines: DocLine[]): DocLineScene[] {
  return docLines.map((l) => ({ id: l.id, kind: l.kind, code: l.code, resource: l.resource, read: false }));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export const preloadHintScene: ScenePlan<PreloadHintScene> = {
  initial(initialData) {
    const data = initialData as PreloadHintFacetData;
    return {
      lines: linesOf(data.docLines),
      cssRule: { code: data.cssRule.code, slotId: data.cssRule.slotId, refResource: data.cssRule.refResource },
      resources: laneOf(data.resources),
      heroSlotId: data.cssRule.slotId,
      nowMs: 0,
      parseEndMs: null,
      needed: null,
      firstPaintMs: null,
      heroFilled: false,
      step: null,
    };
  },

  reduce(scene, event: FacetRuntimeEvent): PreloadHintScene {
    const p = event.payload;
    if (!isRecord(p)) throw new Error(`preload-hint scene: '${event.type}' 의 payload 가 객체가 아니다`);

    switch (event.type) {
      case 'line-read': {
        const { id, ms, resource } = p;
        if (typeof id !== 'string' || typeof ms !== 'number') {
          throw new Error("preload-hint scene: 'line-read' payload 모양이 다르다");
        }
        const res = typeof resource === 'string' ? resource : undefined;
        return {
          ...scene,
          lines: scene.lines.map((l) => (l.id === id ? { ...l, read: true } : l)),
          resources: res
            ? scene.resources.map((r) => (r.file === res ? { ...r, requestMs: ms } : r))
            : scene.resources,
          nowMs: ms,
          step: { kind: 'line-read', id, ms, resource: res },
        };
      }

      case 'parse-end': {
        const { ms, ids } = p;
        if (typeof ms !== 'number' || !Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) {
          throw new Error("preload-hint scene: 'parse-end' payload 모양이 다르다");
        }
        const idSet = new Set(ids as string[]);
        return {
          ...scene,
          lines: scene.lines.map((l) => (idSet.has(l.id) ? { ...l, read: true } : l)),
          nowMs: ms,
          parseEndMs: ms,
          step: { kind: 'parse-end', ms, ids: ids as string[] },
        };
      }

      case 'resource-needed': {
        const { ms, styleFile, file, receivedMs, totalMs, percent } = p;
        if (
          typeof ms !== 'number' ||
          typeof styleFile !== 'string' ||
          typeof file !== 'string' ||
          typeof receivedMs !== 'number' ||
          typeof totalMs !== 'number' ||
          typeof percent !== 'number'
        ) {
          throw new Error("preload-hint scene: 'resource-needed' payload 모양이 다르다");
        }
        return {
          ...scene,
          resources: scene.resources.map((r) => (r.file === styleFile ? { ...r, arriveMs: ms, arrived: true } : r)),
          nowMs: ms,
          needed: { file, receivedMs, totalMs, percent },
          step: { kind: 'resource-needed', ms, styleFile, file, receivedMs, totalMs, percent },
        };
      }

      case 'first-paint': {
        const { ms } = p;
        if (typeof ms !== 'number') throw new Error("preload-hint scene: 'first-paint' payload 모양이 다르다");
        return {
          ...scene,
          nowMs: ms,
          firstPaintMs: ms,
          step: { kind: 'first-paint', ms },
        };
      }

      case 'resource-arrived': {
        const { ms, file, slotId } = p;
        if (typeof ms !== 'number' || typeof file !== 'string' || typeof slotId !== 'string') {
          throw new Error("preload-hint scene: 'resource-arrived' payload 모양이 다르다");
        }
        return {
          ...scene,
          resources: scene.resources.map((r) => (r.file === file ? { ...r, arriveMs: ms, arrived: true } : r)),
          nowMs: ms,
          heroFilled: slotId === scene.heroSlotId ? true : scene.heroFilled,
          step: { kind: 'resource-arrived', ms, file, slotId },
        };
      }

      default:
        throw new Error(`preload-hint scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
