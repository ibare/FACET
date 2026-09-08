/**
 * splitWhenFull projector — algorithm 이벤트를 split-when-full-stage 호출로 번역한다.
 *
 * `event.payload` 는 설계상 `unknown` 이므로 (C9) 각 이벤트마다 좁은 가드로
 * 검증한 뒤 정형 객체를 조립해 stage 로 넘긴다. stage 는 절대 원본 payload 를
 * 그대로 받지 않는다.
 */

import type { ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type {
  DescendPayload,
  DividePayload,
  OverflowPayload,
  PromotePayload,
  SplitWhenFullData,
} from './algorithm.js';
import type { SplitWhenFullStageInstance } from './split-when-full-stage.js';

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number');
}

function asDescend(p: unknown): DescendPayload | null {
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Record<string, unknown>;
  if (
    typeof o.childIndex !== 'number' ||
    typeof o.insertKey !== 'number' ||
    typeof o.parentKeyIndex !== 'number' ||
    typeof o.comparedKey !== 'number'
  ) {
    return null;
  }
  return {
    childIndex: o.childIndex,
    insertKey: o.insertKey,
    parentKeyIndex: o.parentKeyIndex,
    comparedKey: o.comparedKey,
  };
}

function asOverflow(p: unknown): OverflowPayload | null {
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Record<string, unknown>;
  if (typeof o.childIndex !== 'number' || !isNumberArray(o.tempKeys) || typeof o.insertedIndex !== 'number') {
    return null;
  }
  return { childIndex: o.childIndex, tempKeys: o.tempKeys, insertedIndex: o.insertedIndex };
}

function asPromote(p: unknown): PromotePayload | null {
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Record<string, unknown>;
  if (
    typeof o.childIndex !== 'number' ||
    typeof o.middleKey !== 'number' ||
    typeof o.middleIndex !== 'number' ||
    typeof o.parentInsertIndex !== 'number' ||
    !isNumberArray(o.parentKeysAfter)
  ) {
    return null;
  }
  return {
    childIndex: o.childIndex,
    middleKey: o.middleKey,
    middleIndex: o.middleIndex,
    parentInsertIndex: o.parentInsertIndex,
    parentKeysAfter: o.parentKeysAfter,
  };
}

function asDivide(p: unknown): DividePayload | null {
  if (typeof p !== 'object' || p === null) return null;
  const o = p as Record<string, unknown>;
  if (typeof o.childIndex !== 'number' || !isNumberArray(o.leftKeys) || !isNumberArray(o.rightKeys)) {
    return null;
  }
  return { childIndex: o.childIndex, leftKeys: o.leftKeys, rightKeys: o.rightKeys };
}

function isSplitWhenFullData(v: unknown): v is SplitWhenFullData {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return o.type === 'split-when-full' && typeof o.capacity === 'number';
}

export const splitWhenFullProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SplitWhenFullStageInstance;
  const tr = runtime?.t ?? makeTranslator();
  let capacity = 0;
  let before: { parentKeys: number[]; childrenKeys: number[][] } = { parentKeys: [], childrenKeys: [] };

  function toStart(data: SplitWhenFullData): void {
    capacity = data.capacity;
    before = {
      parentKeys: [...data.parent.keys],
      childrenKeys: data.children.map((c) => [...c.keys]),
    };
    stage.setTree(before.parentKeys, before.childrenKeys);
    stage.setCaption('');
  }

  const instance: ProjectorInstance = {
    onInit(initialData: unknown) {
      if (!isSplitWhenFullData(initialData)) return;
      toStart(initialData);
    },
    async onEvent(event) {
      switch (event.type) {
        case 'descend': {
          const p = asDescend(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.descend', '{key} is less than {compared}, so it heads into this child.', {
              key: p.insertKey,
              compared: p.comparedKey,
            }),
          );
          await stage.showDescend(p);
          return;
        }
        case 'overflow': {
          const p = asOverflow(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.overflow', 'This slot already holds {capacity} keys — adding one overflows it to {count}.', {
              capacity,
              count: p.tempKeys.length,
            }),
          );
          await stage.showOverflow(p);
          return;
        }
        case 'promote': {
          const p = asPromote(event.payload);
          if (!p) return;
          stage.setCaption(tr('caption.promote', 'The middle key {key} rises into the parent.', { key: p.middleKey }));
          await stage.showPromote(p);
          return;
        }
        case 'divide': {
          const p = asDivide(event.payload);
          if (!p) return;
          stage.setCaption(
            tr('caption.divide', 'What remains splits in two — {left} and {right}.', {
              left: `[${p.leftKeys.join(', ')}]`,
              right: `[${p.rightKeys.join(', ')}]`,
            }),
          );
          await stage.showDivide(p);
          return;
        }
        case 'rewind': {
          stage.setTree(before.parentKeys, before.childrenKeys);
          stage.setCaption('');
          return;
        }
        default:
          // 표준 이벤트가 이 알고리즘에서 발신되지 않으므로 조용히 무시.
          return;
      }
    },
    onReset() {
      stage.setCaption('');
    },
  };
  return instance;
};
