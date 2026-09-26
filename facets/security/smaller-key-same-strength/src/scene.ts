/**
 * smaller-key-same-strength 장면.
 *
 *   바탕  table — 강도 단 목록(표준의 표). initial() 이 initialData 에서 베낀다
 *   자취  rows  — 지금까지 드러난 단. 알고리즘이 셈한 배율 · 차를 함께 쥔다
 *   이번  step  — 방금 드러난 단과, 두 열쇠가 길어지기 시작한 길이(앞 단의 길이)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowSmallerKeyData, type StrengthLevel } from './algorithm.js';

export type RevealedLevel = {
  readonly strength: number;
  readonly rsa: number;
  readonly ecc: number;
  readonly ratio: number;
  readonly gap: number;
};

export type LevelStep = {
  readonly index: number;
  /** 길어지기 시작한 길이 — 앞 단의 두 열쇠. 첫 단이면 0 에서. */
  readonly fromRsa: number;
  readonly fromEcc: number;
};

export type SmallerKeyScene = {
  readonly table: readonly StrengthLevel[];
  readonly rows: readonly RevealedLevel[];
  readonly step: LevelStep | null;
};

function num(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`smallerKeySameStrengthScene: level.payload.${key} 가 수가 아니다`);
  }
  return v;
}

export const smallerKeySameStrengthScene: ScenePlan<SmallerKeyScene> = {
  initial(initialData: unknown): SmallerKeyScene {
    const data = narrowSmallerKeyData(initialData);
    return {
      table: data.levels.map((l) => ({ strength: l.strength, rsa: l.rsa, ecc: l.ecc })),
      rows: [],
      step: null,
    };
  },

  reduce(scene: SmallerKeyScene, event: FacetRuntimeEvent): SmallerKeyScene {
    switch (event.type) {
      case 'level': {
        const p = event.payload;
        if (typeof p !== 'object' || p === null) {
          throw new Error('smallerKeySameStrengthScene: level.payload 가 객체가 아니다');
        }
        const payload = p as Record<string, unknown>;
        const index = num(payload, 'index');
        if (index !== scene.rows.length) {
          throw new Error(
            `smallerKeySameStrengthScene: level.payload.index ${index} 가 다음 단 ${scene.rows.length} 이 아니다`,
          );
        }
        const base = scene.table[index];
        if (base === undefined) {
          throw new Error(`smallerKeySameStrengthScene: level.payload.index ${index} 가 표 밖이다`);
        }
        const strength = num(payload, 'strength');
        const rsa = num(payload, 'rsa');
        const ecc = num(payload, 'ecc');
        if (strength !== base.strength || rsa !== base.rsa || ecc !== base.ecc) {
          throw new Error(`smallerKeySameStrengthScene: level.payload 가 표의 ${index} 단과 어긋났다`);
        }
        const before = scene.rows[index - 1];
        return {
          table: scene.table,
          rows: [...scene.rows, { strength, rsa, ecc, ratio: num(payload, 'ratio'), gap: num(payload, 'gap') }],
          step: {
            index,
            fromRsa: before === undefined ? 0 : before.rsa,
            fromEcc: before === undefined ? 0 : before.ecc,
          },
        };
      }
      default:
        throw new Error(`smallerKeySameStrengthScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
