/**
 * thrashing 장면 — `reference` 이벤트를 잇기만 한다. 교체 선택은 알고리즘이 셈했다.
 *
 * 바탕: 프로세스와 그 페이지 · 프레임 수 · 참조 열 (initialData 에서 베낌)
 * 자취: 프레임에 지금 있는 페이지 · 걸음마다의 기록
 * 이번 걸음: `step` — 마지막 기록의 번호 (0 이면 처음 장면)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type ThrashingRecord = {
  t: number;
  page: string;
  fault: boolean;
  frame: number;
  victim: string | null;
  outAt: number | null;
  backAfter: number | null;
};

export type ThrashingScene = {
  processes: { id: string; pages: string[] }[];
  refs: string[];
  frames: (string | null)[];
  records: ThrashingRecord[];
  step: number;
};

function readProcesses(raw: unknown): { id: string; pages: string[] }[] {
  if (!Array.isArray(raw)) return [];
  const out: { id: string; pages: string[] }[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const id = (item as { id?: unknown }).id;
    const pages = (item as { pages?: unknown }).pages;
    if (typeof id !== 'string' || !Array.isArray(pages)) continue;
    out.push({ id, pages: pages.filter((p): p is string => typeof p === 'string') });
  }
  return out;
}

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

export const thrashingScene: ScenePlan<ThrashingScene> = {
  initial(initialData: unknown): ThrashingScene {
    const d = (typeof initialData === 'object' && initialData !== null ? initialData : {}) as Record<
      string,
      unknown
    >;
    const n = typeof d.frames === 'number' && Number.isInteger(d.frames) && d.frames > 0 ? d.frames : 0;
    const refs = Array.isArray(d.refs) ? d.refs.filter((r): r is string => typeof r === 'string') : [];
    return {
      processes: readProcesses(d.processes),
      refs,
      frames: Array.from({ length: n }, () => null),
      records: [],
      step: 0,
    };
  },

  reduce(scene: ThrashingScene, event: FacetRuntimeEvent): ThrashingScene {
    if (event.type !== 'reference') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) return scene;
    const o = p as Record<string, unknown>;
    if (
      typeof o.t !== 'number' ||
      typeof o.page !== 'string' ||
      typeof o.fault !== 'boolean' ||
      typeof o.frame !== 'number'
    ) {
      return scene;
    }
    const rec: ThrashingRecord = {
      t: o.t,
      page: o.page,
      fault: o.fault,
      frame: o.frame,
      victim: typeof o.victim === 'string' ? o.victim : null,
      outAt: numOrNull(o.outAt),
      backAfter: numOrNull(o.backAfter),
    };
    const frames = scene.frames.slice();
    frames[rec.frame] = rec.page;
    return {
      processes: scene.processes,
      refs: scene.refs,
      frames,
      records: [...scene.records, rec],
      step: rec.t,
    };
  },
};
