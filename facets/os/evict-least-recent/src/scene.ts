/**
 * evictLeastRecentScene — 알고리즘 이벤트를 장면으로 잇는다.
 *
 * 바탕: 참조 차례 · 프레임 수 (initialData 에서 베낀다)
 * 자취: 프레임마다 들어 있는 페이지와 들어온 때 · 마지막 쓴 때, 내보낸 페이지들, 폴트 · 적중 수
 * 이번 걸음: step — 교체 선택 같은 셈은 알고리즘이 했고 장면은 싣고 온 값을 그대로 둔다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LruSlot = { page: number; loadedAt: number; lastUsed: number } | null;

export type LruStays = { page: number; loadedAt: number; used: number };

export type LruStep =
  | { kind: 'start' }
  | { kind: 'fill'; t: number; page: number; frame: number }
  | { kind: 'hit'; t: number; page: number; frame: number; was: number }
  | {
      kind: 'evict';
      t: number;
      page: number;
      frame: number;
      victim: number;
      reach: number[];
      stays: LruStays | null;
    };

export type EvictLeastRecentScene = {
  refs: number[];
  frames: LruSlot[];
  /** 지금까지 처리한 참조의 때 (0 = 아직 없음) */
  now: number;
  out: { page: number; t: number }[];
  faults: number;
  hits: number;
  step: LruStep;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`evictLeastRecentScene: ${what} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function int(o: Record<string, unknown>, key: string, what: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`evictLeastRecentScene: ${what}.${key} 가 정수가 아니다`);
  }
  return v;
}

function slotAt(scene: EvictLeastRecentScene, frame: number, what: string): LruSlot {
  if (frame < 0 || frame >= scene.frames.length) {
    throw new Error(`evictLeastRecentScene: ${what} 의 프레임 ${frame} 이 범위 밖이다`);
  }
  return scene.frames[frame] ?? null;
}

function withSlot(frames: LruSlot[], frame: number, slot: LruSlot): LruSlot[] {
  return frames.map((s, k) => (k === frame ? slot : s));
}

export const evictLeastRecentScene: ScenePlan<EvictLeastRecentScene> = {
  initial(initialData: unknown): EvictLeastRecentScene {
    const d = rec(initialData, 'initialData');
    const n = int(d, 'frames', 'initialData');
    if (n < 1) throw new Error('evictLeastRecentScene: 프레임 수가 1 보다 작다');
    const refsRaw = d.refs;
    if (!Array.isArray(refsRaw) || refsRaw.length === 0) {
      throw new Error('evictLeastRecentScene: initialData.refs 가 비었거나 배열이 아니다');
    }
    const refs = refsRaw.map((p: unknown, i) => {
      if (typeof p !== 'number' || !Number.isInteger(p)) {
        throw new Error(`evictLeastRecentScene: 참조 t${i + 1} 가 정수가 아니다`);
      }
      return p;
    });
    return {
      refs,
      frames: Array.from({ length: n }, () => null),
      now: 0,
      out: [],
      faults: 0,
      hits: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: EvictLeastRecentScene, event: FacetRuntimeEvent): EvictLeastRecentScene {
    if (event.type === 'fill') {
      const p = rec(event.payload, 'fill');
      const t = int(p, 't', 'fill');
      const page = int(p, 'page', 'fill');
      const frame = int(p, 'frame', 'fill');
      if (slotAt(scene, frame, 'fill') !== null) {
        throw new Error(`evictLeastRecentScene: t${t} 채울 프레임 ${frame} 이 비어 있지 않다`);
      }
      return {
        ...scene,
        frames: withSlot(scene.frames, frame, { page, loadedAt: t, lastUsed: t }),
        now: t,
        faults: scene.faults + 1,
        step: { kind: 'fill', t, page, frame },
      };
    }
    if (event.type === 'hit') {
      const p = rec(event.payload, 'hit');
      const t = int(p, 't', 'hit');
      const page = int(p, 'page', 'hit');
      const frame = int(p, 'frame', 'hit');
      const was = int(p, 'was', 'hit');
      const cur = slotAt(scene, frame, 'hit');
      if (cur === null || cur.page !== page) {
        throw new Error(`evictLeastRecentScene: t${t} 적중한 프레임 ${frame} 에 페이지 ${page} 가 없다`);
      }
      return {
        ...scene,
        frames: withSlot(scene.frames, frame, { ...cur, lastUsed: t }),
        now: t,
        hits: scene.hits + 1,
        step: { kind: 'hit', t, page, frame, was },
      };
    }
    if (event.type === 'evict') {
      const p = rec(event.payload, 'evict');
      const t = int(p, 't', 'evict');
      const page = int(p, 'page', 'evict');
      const frame = int(p, 'frame', 'evict');
      const victim = int(p, 'victim', 'evict');
      const reachRaw = p.reach;
      if (!Array.isArray(reachRaw) || reachRaw.length !== scene.frames.length) {
        throw new Error(`evictLeastRecentScene: t${t} reach 길이가 프레임 수와 다르다`);
      }
      const reach = reachRaw.map((v: unknown, k) => {
        if (typeof v !== 'number' || !Number.isInteger(v)) {
          throw new Error(`evictLeastRecentScene: t${t} reach[${k}] 가 정수가 아니다`);
        }
        return v;
      });
      let stays: LruStays | null = null;
      if (p.stays !== null) {
        const s = rec(p.stays, 'evict.stays');
        stays = {
          page: int(s, 'page', 'evict.stays'),
          loadedAt: int(s, 'loadedAt', 'evict.stays'),
          used: int(s, 'used', 'evict.stays'),
        };
      }
      const cur = slotAt(scene, frame, 'evict');
      if (cur === null || cur.page !== victim) {
        throw new Error(`evictLeastRecentScene: t${t} 프레임 ${frame} 에 내보낼 페이지 ${victim} 가 없다`);
      }
      return {
        ...scene,
        frames: withSlot(scene.frames, frame, { page, loadedAt: t, lastUsed: t }),
        now: t,
        out: [...scene.out, { page: victim, t }],
        faults: scene.faults + 1,
        step: { kind: 'evict', t, page, frame, victim, reach, stays },
      };
    }
    throw new Error(`evictLeastRecentScene: 모르는 이벤트 ${event.type}`);
  },
};
