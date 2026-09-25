/**
 * 2차 기회의 장면.
 *
 * 바탕 — 참조 목록 (init 이 따로 없다. initial() 이 initialData 에서 베낀다)
 * 자취 — 칸마다 페이지와 표시 · 바늘 자리 · 지나간 참조 수 · 기다리는 페이지 ·
 *        내보낸 페이지들 · 짚은 칸 수
 * 이번 걸음 — step. 운동의 계기값(바늘이 떠난 칸 `from`)을 싣는다
 *
 * 셈(적중 판정 · 어느 칸을 내보낼지)은 알고리즘이 한다. 장면은 이벤트가 말한 것을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readSecondChanceData, type SecondChanceSlot } from './algorithm.js';

export type SecondChanceStep =
  | { kind: 'start' }
  | { kind: 'hit'; page: number; slot: number; was: 0 | 1 }
  | { kind: 'miss'; page: number }
  | { kind: 'spare'; page: number; slot: number; from: number }
  | { kind: 'evict'; page: number; out: number; slot: number; from: number };

export type SecondChanceScene = {
  refs: number[];
  slots: SecondChanceSlot[];
  hand: number;
  /** 지금 다루는 참조의 자리. 아직 없으면 -1 */
  cursor: number;
  /** 폴트로 칸을 기다리는 페이지. 없으면 null */
  pending: number | null;
  /** 내보낸 페이지, 나간 차례로 */
  evicted: number[];
  /** 바늘이 짚은 칸 수 */
  looked: number;
  step: SecondChanceStep;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`second-chance scene: '${type}' 의 ${key} 가 정수가 아니다`);
  }
  return v;
}

function fields(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`second-chance scene: '${event.type}' 에 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

function slotIndex(scene: SecondChanceScene, i: number, type: string): number {
  if (i < 0 || i >= scene.slots.length) {
    throw new Error(`second-chance scene: '${type}' 의 칸 ${i} 가 범위 밖이다`);
  }
  return i;
}

function withSlot(slots: SecondChanceSlot[], i: number, s: SecondChanceSlot): SecondChanceSlot[] {
  return slots.map((old, k) => (k === i ? s : { page: old.page, bit: old.bit }));
}

export const secondChanceScene: ScenePlan<SecondChanceScene> = {
  initial(initialData: unknown): SecondChanceScene {
    const d = readSecondChanceData(initialData);
    return {
      refs: [...d.refs],
      slots: d.slots.map((s) => ({ page: s.page, bit: s.bit })),
      hand: d.hand,
      cursor: -1,
      pending: null,
      evicted: [],
      looked: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: SecondChanceScene, event: FacetRuntimeEvent): SecondChanceScene {
    switch (event.type) {
      case 'hit': {
        const p = fields(event);
        const page = num(p, 'page', 'hit');
        const slot = slotIndex(scene, num(p, 'slot', 'hit'), 'hit');
        return {
          ...scene,
          slots: withSlot(scene.slots, slot, { page, bit: 1 }),
          cursor: num(p, 'ref', 'hit'),
          evicted: [...scene.evicted],
          step: { kind: 'hit', page, slot, was: scene.slots[slot]!.bit },
        };
      }
      case 'miss': {
        const p = fields(event);
        const page = num(p, 'page', 'miss');
        return {
          ...scene,
          slots: scene.slots.map((s) => ({ page: s.page, bit: s.bit })),
          cursor: num(p, 'ref', 'miss'),
          pending: page,
          evicted: [...scene.evicted],
          step: { kind: 'miss', page },
        };
      }
      case 'spare': {
        const p = fields(event);
        const slot = slotIndex(scene, num(p, 'slot', 'spare'), 'spare');
        const page = num(p, 'page', 'spare');
        const next = slotIndex(scene, num(p, 'next', 'spare'), 'spare');
        return {
          ...scene,
          slots: withSlot(scene.slots, slot, { page, bit: 0 }),
          hand: next,
          evicted: [...scene.evicted],
          looked: scene.looked + 1,
          step: { kind: 'spare', page, slot, from: slot },
        };
      }
      case 'evict': {
        const p = fields(event);
        const slot = slotIndex(scene, num(p, 'slot', 'evict'), 'evict');
        const out = num(p, 'out', 'evict');
        const page = num(p, 'page', 'evict');
        const next = slotIndex(scene, num(p, 'next', 'evict'), 'evict');
        return {
          ...scene,
          slots: withSlot(scene.slots, slot, { page, bit: 1 }),
          hand: next,
          pending: null,
          evicted: [...scene.evicted, out],
          looked: scene.looked + 1,
          step: { kind: 'evict', page, out, slot, from: slot },
        };
      }
      default:
        return scene;
    }
  },
};
