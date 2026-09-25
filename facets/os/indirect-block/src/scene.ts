/**
 * indirect-block 장면 — 이벤트를 잇기만 한다. 할당 · 읽기 수 셈은 알고리즘이 한다.
 *
 * - 바탕: 디스크 크기 · 다른 파일의 블록 · 칸 수 · 파일 식별자 (initialData 에서 베낀다)
 * - 자취: 직접 칸에 적힌 번호 · 간접 블록의 번호 · 간접 블록에 적힌 번호
 * - 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type IndirectBlockStep =
  | { kind: 'place'; k: number; block: number; slot: number; reads: number }
  | { kind: 'spill'; block: number; capBefore: number; capAfter: number }
  | {
      kind: 'placeIndirect';
      k: number;
      block: number;
      slot: number;
      indirectAt: number;
      reads: number;
    };

export type IndirectBlockScene = {
  diskSize: number;
  usedByOthers: number[];
  file: string;
  directSlots: number;
  ptrsPerBlock: number;
  /** 직접 칸 차례대로 적힌 블록 번호 */
  direct: number[];
  /** 간접 칸에 적힌 블록 번호 — 아직 없으면 null */
  indirectAt: number | null;
  /** 간접 블록의 칸 차례대로 적힌 블록 번호 */
  indirect: number[];
  step: IndirectBlockStep | null;
};

function num(o: Record<string, unknown>, key: string, type: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`indirect-block 장면: ${type} 의 ${key} 가 수가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`indirect-block 장면: ${event.type} 의 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

function withAt(list: readonly number[], at: number, value: number): number[] {
  if (at !== list.length) {
    throw new Error(`indirect-block 장면: 칸 ${at} 는 다음 빈칸(${list.length})이 아니다`);
  }
  return [...list, value];
}

export const indirectBlockScene: ScenePlan<IndirectBlockScene> = {
  initial(initialData: unknown): IndirectBlockScene {
    const d =
      typeof initialData === 'object' && initialData !== null
        ? (initialData as Record<string, unknown>)
        : {};
    const pick = (key: string): number => {
      const v = d[key];
      return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 0;
    };
    const others = Array.isArray(d.usedByOthers)
      ? d.usedByOthers.filter((b): b is number => typeof b === 'number')
      : [];
    return {
      diskSize: pick('diskSize'),
      usedByOthers: [...others],
      file: typeof d.file === 'string' ? d.file : '',
      directSlots: pick('directSlots'),
      ptrsPerBlock: pick('ptrsPerBlock'),
      direct: [],
      indirectAt: null,
      indirect: [],
      step: null,
    };
  },

  reduce(scene: IndirectBlockScene, event: FacetRuntimeEvent): IndirectBlockScene {
    if (event.type === 'place') {
      const p = payloadOf(event);
      const k = num(p, 'k', event.type);
      const block = num(p, 'block', event.type);
      const slot = num(p, 'slot', event.type);
      const reads = num(p, 'reads', event.type);
      return {
        ...scene,
        direct: withAt(scene.direct, slot, block),
        step: { kind: 'place', k, block, slot, reads },
      };
    }
    if (event.type === 'spill') {
      const p = payloadOf(event);
      const block = num(p, 'block', event.type);
      const capBefore = num(p, 'capBefore', event.type);
      const capAfter = num(p, 'capAfter', event.type);
      return {
        ...scene,
        indirectAt: block,
        step: { kind: 'spill', block, capBefore, capAfter },
      };
    }
    if (event.type === 'placeIndirect') {
      const p = payloadOf(event);
      const k = num(p, 'k', event.type);
      const block = num(p, 'block', event.type);
      const slot = num(p, 'slot', event.type);
      const indirectAt = num(p, 'indirectAt', event.type);
      const reads = num(p, 'reads', event.type);
      return {
        ...scene,
        indirect: withAt(scene.indirect, slot, block),
        step: { kind: 'placeIndirect', k, block, slot, indirectAt, reads },
      };
    }
    return scene;
  },
};
