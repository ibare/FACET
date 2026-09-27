/**
 * 곱의 법칙 장면.
 *
 * - 바탕: `places` (자리마다의 선택지 기호) — initialData 에서 베낀다
 * - 자취: `levels` — 층마다의 끝 목록. `levels[0]` 은 뿌리(빈 결과) 하나, silent init 이 채운다
 * - 이번 걸음: `step` — 처음이거나, 자리 하나를 고른 걸음
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowProductRuleTreeData, type ProductRuleTreeEnd } from './algorithm.js';

export type ProductRuleTreeStep =
  | { kind: 'start'; ends: number }
  | { kind: 'branch'; place: number; before: number; choices: number; after: number };

export type ProductRuleTreeScene = {
  places: string[][];
  levels: ProductRuleTreeEnd[][];
  step: ProductRuleTreeStep | null;
};

function readEnds(raw: unknown, where: string, parentCount: number): ProductRuleTreeEnd[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`product-rule-tree scene: ${where}.ends 는 비지 않은 배열이어야 한다`);
  }
  return raw.map((e: unknown, i) => {
    if (typeof e !== 'object' || e === null) {
      throw new Error(`product-rule-tree scene: ${where}.ends[${i}] 가 객체가 아니다`);
    }
    const o = e as Record<string, unknown>;
    const name = o.name;
    const parent = o.parent;
    if (typeof name !== 'string') {
      throw new Error(`product-rule-tree scene: ${where}.ends[${i}].name 이 문자열이 아니다`);
    }
    if (typeof parent !== 'number' || !Number.isInteger(parent)) {
      throw new Error(`product-rule-tree scene: ${where}.ends[${i}].parent 가 정수가 아니다`);
    }
    if (parentCount === 0 ? parent !== -1 : parent < 0 || parent >= parentCount) {
      throw new Error(
        `product-rule-tree scene: ${where}.ends[${i}].parent ${parent} 가 앞 층(${parentCount})에 없다`,
      );
    }
    return { name, parent };
  });
}

function readInt(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`product-rule-tree scene: branch.payload.${key} 가 정수가 아니다`);
  }
  return v;
}

export const productRuleTreeScene: ScenePlan<ProductRuleTreeScene> = {
  initial(initialData: unknown): ProductRuleTreeScene {
    const data = narrowProductRuleTreeData(initialData);
    return {
      places: data.places.map((p) => [...p]),
      levels: [],
      step: null,
    };
  },

  reduce(scene: ProductRuleTreeScene, event: FacetRuntimeEvent): ProductRuleTreeScene {
    const payload = event.payload;
    if (typeof payload !== 'object' || payload === null) {
      throw new Error(`product-rule-tree scene: ${event.type}.payload 가 객체가 아니다`);
    }
    const p = payload as Record<string, unknown>;

    switch (event.type) {
      case 'init': {
        const ends = readEnds(p.ends, 'init.payload', 0);
        return { places: scene.places, levels: [ends], step: { kind: 'start', ends: ends.length } };
      }
      case 'branch': {
        const place = readInt(p, 'place');
        const before = readInt(p, 'before');
        const choices = readInt(p, 'choices');
        const after = readInt(p, 'after');
        const last = scene.levels[scene.levels.length - 1];
        if (last === undefined) {
          throw new Error('product-rule-tree scene: init 앞에 branch 가 왔다');
        }
        if (place !== scene.levels.length - 1) {
          throw new Error(
            `product-rule-tree scene: branch.payload.place ${place} 가 다음 자리(${scene.levels.length - 1})가 아니다`,
          );
        }
        const symbols = scene.places[place];
        if (symbols === undefined) {
          throw new Error(`product-rule-tree scene: branch.payload.place ${place} 가 자리 목록에 없다`);
        }
        if (before !== last.length) {
          throw new Error(
            `product-rule-tree scene: branch.payload.before ${before} 가 지금 끝의 수(${last.length})와 다르다`,
          );
        }
        if (choices !== symbols.length) {
          throw new Error(
            `product-rule-tree scene: branch.payload.choices ${choices} 가 자리의 선택지 수(${symbols.length})와 다르다`,
          );
        }
        const ends = readEnds(p.ends, 'branch.payload', last.length);
        if (after !== ends.length) {
          throw new Error(
            `product-rule-tree scene: branch.payload.after ${after} 가 끝 목록 길이(${ends.length})와 다르다`,
          );
        }
        return {
          places: scene.places,
          levels: [...scene.levels, ends],
          step: { kind: 'branch', place, before, choices, after },
        };
      }
      default:
        throw new Error(`product-rule-tree scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
