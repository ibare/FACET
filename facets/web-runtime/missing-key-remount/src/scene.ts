/**
 * missingKeyRemount 의 장면.
 *
 * 바탕(init 이 한 번 정하는 것) = 새 목록의 값들과, 실제 줄의 첫 모습(옛 목록의 글자·
 * 눌린 칸이 어느 자리에 있었는가). 자취(걸음이 쌓는 것) = 실제 줄 각 자리 노드의
 * 지금 글자. 이번 걸음(step) = 방금 무슨 일이 있었는가(고침 또는 만듦), 그림이 그
 * 자리를 잠깐 반짝이는 데 쓴다.
 *
 * 셈(같은 자리인지·고칠지 만들지)은 algorithm 이 한다. 여기서는 이벤트가 이른 결정을
 * 자취에 옮겨 적을 뿐, 다시 견주지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 항목 하나 = li 노드 하나 + 그 안 input 노드 하나 (common.md 의 데이터 모형). */
const NODES_PER_ITEM = 2;

/** 실제 줄의 자리 하나 — li 노드 하나(그 안 input 포함)에 대응한다. */
export type MissingKeyRemountSlot = {
  /** 이 자리에 서 있는 실제 노드의 이름표. 걸음이 지나도 같은 자리에서는 바뀌지 않는다. */
  id: number;
  /** 지금 이 노드가 보이는 글자. */
  text: string;
  /** 이 노드에 붙은 살아 있는 상태 — input 이 눌려 있는가. */
  checked: boolean;
};

export type MissingKeyRemountStep =
  | { kind: 'patch'; index: number; from: string; to: string }
  | { kind: 'create'; index: number; text: string };

export type MissingKeyRemountScene = {
  /** 바탕 — 새 목록의 값들. 걸음이 지나도 바뀌지 않는다. */
  newItems: string[];
  /** 자취 — 실제 줄, 자리 차례대로. */
  slots: MissingKeyRemountSlot[];
  /** 다음에 만들 노드에 매길 이름표. */
  nextId: number;
  /** 지금까지의 고침 수. */
  patched: number;
  /** 지금까지 만든 노드 수 — 항목 하나(li + 그 안 input) 는 노드 둘이다. */
  created: number;
  /** 이번 걸음 — 처음(걸음 0)이면 null. */
  step: MissingKeyRemountStep | null;
};

function readInitialData(data: unknown): { oldItems: string[]; newItems: string[]; checkedOldIndex: number } {
  if (typeof data !== 'object' || data === null) {
    throw new Error('missingKeyRemount: initialData 가 없다');
  }
  const d = data as Record<string, unknown>;
  const { oldItems, newItems, checkedOldIndex } = d;
  if (!Array.isArray(oldItems) || !oldItems.every((x) => typeof x === 'string')) {
    throw new Error('missingKeyRemount: oldItems 가 문자열 배열이 아니다');
  }
  if (!Array.isArray(newItems) || !newItems.every((x) => typeof x === 'string')) {
    throw new Error('missingKeyRemount: newItems 가 문자열 배열이 아니다');
  }
  if (typeof checkedOldIndex !== 'number' || checkedOldIndex < 0 || checkedOldIndex >= oldItems.length) {
    throw new Error(`missingKeyRemount: checkedOldIndex 가 옛 목록 범위 밖이다 (${String(checkedOldIndex)})`);
  }
  return { oldItems, newItems, checkedOldIndex };
}

export const missingKeyRemountScene: ScenePlan<MissingKeyRemountScene> = {
  initial(initialData) {
    const { oldItems, newItems, checkedOldIndex } = readInitialData(initialData);
    const slots: MissingKeyRemountSlot[] = oldItems.map((text, i) => ({
      id: i + 1,
      text,
      checked: i === checkedOldIndex,
    }));
    return {
      newItems: newItems.slice(),
      slots,
      nextId: slots.length + 1,
      patched: 0,
      created: 0,
      step: null,
    };
  },

  reduce(scene, event: FacetRuntimeEvent): MissingKeyRemountScene {
    if (event.type === 'patch') {
      const payload = event.payload;
      if (typeof payload !== 'object' || payload === null) {
        throw new Error(`missingKeyRemount: patch payload 모양이 아니다 (${JSON.stringify(payload)})`);
      }
      const p = payload as Record<string, unknown>;
      if (typeof p.index !== 'number' || typeof p.from !== 'string' || typeof p.to !== 'string') {
        throw new Error(`missingKeyRemount: patch payload 필드가 다르다 (${JSON.stringify(payload)})`);
      }
      const index = p.index;
      const from = p.from;
      const to = p.to;
      if (index < 0 || index >= scene.slots.length) {
        throw new Error(`missingKeyRemount: patch index 가 실제 줄 범위 밖이다 (${index})`);
      }
      const slots = scene.slots.map((slot, i) => (i === index ? { ...slot, text: to } : slot));
      return {
        ...scene,
        slots,
        patched: scene.patched + 1,
        step: { kind: 'patch', index, from, to },
      };
    }

    if (event.type === 'create') {
      const payload = event.payload;
      if (typeof payload !== 'object' || payload === null) {
        throw new Error(`missingKeyRemount: create payload 모양이 아니다 (${JSON.stringify(payload)})`);
      }
      const p = payload as Record<string, unknown>;
      if (typeof p.index !== 'number' || typeof p.text !== 'string') {
        throw new Error(`missingKeyRemount: create payload 필드가 다르다 (${JSON.stringify(payload)})`);
      }
      const index = p.index;
      const text = p.text;
      if (index !== scene.slots.length) {
        throw new Error(`missingKeyRemount: create index 가 실제 줄 끝이 아니다 (${index} ≠ ${scene.slots.length})`);
      }
      const slots = [...scene.slots, { id: scene.nextId, text, checked: false }];
      return {
        ...scene,
        slots,
        nextId: scene.nextId + 1,
        created: scene.created + NODES_PER_ITEM,
        step: { kind: 'create', index, text },
      };
    }

    throw new Error(`missingKeyRemount: 모르는 이벤트 ${event.type}`);
  },
};
