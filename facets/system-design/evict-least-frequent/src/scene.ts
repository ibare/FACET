/**
 * evict-least-frequent 장면 — 이벤트를 잇기만 한다. 적중 판정 · 버릴 키 고르기는 알고리즘이 한다.
 *
 * 바탕: 용량 · 요청 줄 (initial 이 자료에서 베낀다)
 * 자취: 자리마다의 키와 횟수 · 밀려난 키의 차례
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readEvictLeastFrequentData, type LfuEntry } from './algorithm.js';

export type LfuSlot = LfuEntry | null;

export type LfuStep =
  | { kind: 'start' }
  | { kind: 'hit'; index: number; key: string; slot: number }
  | { kind: 'admit'; index: number; key: string; slot: number }
  | {
      kind: 'evict';
      index: number;
      key: string;
      slot: number;
      victim: LfuEntry;
      least: number;
      ties: { key: string; lastUsed: number }[];
    };

export type EvictLeastFrequentScene = {
  capacity: number;
  requests: string[];
  /** 자리 차례는 들어온 자리 그대로다 — 밀려난 자리에 새 키가 선다. */
  slots: LfuSlot[];
  /** 밀려난 차례대로, 밀려날 때의 횟수와 함께. */
  evicted: LfuEntry[];
  /** 지금까지 처리한 요청 수 (0 = 아직 없음). */
  served: number;
  step: LfuStep;
};

function fail(msg: string): never {
  throw new Error(`evict-least-frequent 장면: ${msg}`);
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function int(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${path} 가 정수가 아니다`);
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(`${path} 가 문자열이 아니다`);
  return v;
}

function entry(v: unknown, path: string): LfuEntry {
  const o = obj(v, path);
  return {
    key: str(o.key, `${path}.key`),
    count: int(o.count, `${path}.count`),
    lastUsed: int(o.lastUsed, `${path}.lastUsed`),
  };
}

/** 요청 번호 · 경로가 요청 줄의 다음 차례와 맞는지 본다. */
function checkRequest(scene: EvictLeastFrequentScene, p: Record<string, unknown>): {
  index: number;
  key: string;
} {
  const index = int(p.index, 'payload.index');
  const key = str(p.key, 'payload.key');
  if (index !== scene.served + 1) fail(`payload.index ${index} 가 다음 요청 ${scene.served + 1} 이 아니다`);
  if (scene.requests[index - 1] !== key) fail(`payload.key ${key} 가 요청 ${index} 와 다르다`);
  if (int(p.lastUsed, 'payload.lastUsed') !== index) fail('payload.lastUsed 가 요청 번호와 다르다');
  return { index, key };
}

function slotOf(scene: EvictLeastFrequentScene, key: string): number {
  return scene.slots.findIndex((s) => s !== null && s.key === key);
}

export const evictLeastFrequentScene: ScenePlan<EvictLeastFrequentScene> = {
  initial(initialData: unknown): EvictLeastFrequentScene {
    const data = readEvictLeastFrequentData(initialData);
    return {
      capacity: data.capacity,
      requests: [...data.requests],
      // 사양의 출발 상태: 용량만큼의 빈 자리
      slots: Array.from({ length: data.capacity }, () => null),
      evicted: [],
      served: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: EvictLeastFrequentScene, event: FacetRuntimeEvent): EvictLeastFrequentScene {
    if (event.type !== 'hit' && event.type !== 'admit' && event.type !== 'evict') {
      fail(`모르는 이벤트 ${event.type}`);
    }
    const p = obj(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'hit': {
        const { index, key } = checkRequest(scene, p);
        const slot = slotOf(scene, key);
        if (slot < 0) fail(`hit.key ${key} 가 캐시에 없다`);
        const was = scene.slots[slot]!;
        const count = int(p.count, 'hit.payload.count');
        if (count !== was.count + 1) fail(`hit.count ${count} 가 앞 횟수 ${was.count} + 1 이 아니다`);
        const slots = scene.slots.map((s, i) => (i === slot ? { key, count, lastUsed: index } : s));
        return { ...scene, slots, served: index, step: { kind: 'hit', index, key, slot } };
      }
      case 'admit': {
        const { index, key } = checkRequest(scene, p);
        if (slotOf(scene, key) >= 0) fail(`admit.key ${key} 가 이미 캐시에 있다`);
        const count = int(p.count, 'admit.payload.count');
        if (count !== 1) fail('admit.count 가 1 이 아니다');
        const slot = scene.slots.findIndex((s) => s === null);
        if (slot < 0) fail('admit 인데 빈 자리가 없다');
        const slots = scene.slots.map((s, i) => (i === slot ? { key, count, lastUsed: index } : s));
        return { ...scene, slots, served: index, step: { kind: 'admit', index, key, slot } };
      }
      case 'evict': {
        const { index, key } = checkRequest(scene, p);
        if (scene.slots.some((s) => s === null)) fail('evict 인데 빈 자리가 있다');
        if (slotOf(scene, key) >= 0) fail(`evict.key ${key} 가 이미 캐시에 있다`);
        const count = int(p.count, 'evict.payload.count');
        if (count !== 1) fail('evict.count 가 1 이 아니다');
        const victim = entry(p.victim, 'evict.payload.victim');
        const slot = slotOf(scene, victim.key);
        if (slot < 0) fail(`evict.victim ${victim.key} 가 캐시에 없다`);
        const held = scene.slots[slot]!;
        if (held.count !== victim.count || held.lastUsed !== victim.lastUsed) {
          fail(`evict.victim ${victim.key} 의 기록이 장면과 다르다`);
        }
        const least = int(p.least, 'evict.payload.least');
        if (!Array.isArray(p.ties) || p.ties.length === 0) fail('evict.payload.ties 가 비지 않은 배열이 아니다');
        const ties = p.ties.map((raw, i) => {
          const o = obj(raw, `evict.payload.ties[${i}]`);
          const tk = str(o.key, `evict.payload.ties[${i}].key`);
          const lastUsed = int(o.lastUsed, `evict.payload.ties[${i}].lastUsed`);
          const at = slotOf(scene, tk);
          if (at < 0) fail(`evict.payload.ties[${i}] ${tk} 가 캐시에 없다`);
          const s = scene.slots[at]!;
          if (s.count !== least || s.lastUsed !== lastUsed) fail(`evict.payload.ties[${i}] 가 장면과 다르다`);
          return { key: tk, lastUsed };
        });
        if (!ties.some((x) => x.key === victim.key)) fail('evict.payload.ties 에 victim 이 없다');
        const slots = scene.slots.map((s, i) => (i === slot ? { key, count, lastUsed: index } : s));
        return {
          ...scene,
          slots,
          evicted: [...scene.evicted, victim],
          served: index,
          step: { kind: 'evict', index, key, slot, victim, least, ties },
        };
      }
      default:
        return fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
