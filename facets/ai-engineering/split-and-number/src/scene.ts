/**
 * SplitAndNumber 장면 설계 — 이벤트를 화면 명령이 아니라 상태로 옮긴다.
 *
 * 이 조각의 화면은 세 덩이로 나뉜다.
 *
 *   지금 다루는 줄   평면 위에 점으로 나와 있다. 한 번에 하나뿐이다 — 다음 줄로
 *                    넘어가면 앞 줄의 점과 선은 걷힌다.
 *   이미 앉은 줄들    번호를 받고 대표 곁에 park 된 것들. 걷히지 않고 쌓인다.
 *   마지막 셈        값의 자리와 번호의 자리를 견주는 괄호.
 *
 * "한 번에 한 줄" 이 이 장면을 작게 만든다. 줄마다의 진행을 낱낱이 담을 까닭이
 * 없고, 지금 줄 하나와 앉은 줄들의 목록이면 화면이 정해진다.
 *
 * 문안은 담지 않는다 — 무엇을 말할지와 그 인자만 담고, 문자는 그리는 쪽이 만든다
 * (C10 의 조회는 View 의 `params.t` 로).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 번호를 받아 자리에 앉은 줄. */
export type SettledRow = {
  row: number;
  frontCode: number;
  backCode: number;
  error: number;
};

/** 지금 다루는 줄. */
export type ActiveRow = {
  row: number;
  front: number[];
  back: number[];
  /** 번호가 붙었으면 그 결과. 아직 쪼개기만 했으면 `null`. */
  assigned: {
    frontCode: number;
    backCode: number;
    frontDists: number[];
    backDists: number[];
    error: number;
  } | null;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type SplitCaption =
  | { kind: 'split'; front: number[]; back: number[] }
  | { kind: 'pick'; a: number; b: number }
  | { kind: 'pickSplit'; a: number; b: number }
  | { kind: 'summary'; plainBytes: number; codeBytes: number };

export type SplitScene = {
  active: ActiveRow | null;
  settled: SettledRow[];
  summary: { plainBytes: number; codeBytes: number } | null;
  caption: SplitCaption | null;
};

const EMPTY: SplitScene = { active: null, settled: [], summary: null, caption: null };

/** unknown → 화면이 쓰는 형태 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.map(num) : [];
}

export const splitAndNumberScene: ScenePlan<SplitScene> = {
  initial(): SplitScene {
    return EMPTY;
  },

  reduce(scene: SplitScene, event: FacetRuntimeEvent): SplitScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'split':
        return {
          ...scene,
          active: { row: num(p.row), front: nums(p.front), back: nums(p.back), assigned: null },
          caption: { kind: 'split', front: nums(p.front), back: nums(p.back) },
        };

      case 'assign': {
        if (!scene.active) return scene;
        const frontCode = num(p.frontCode);
        const backCode = num(p.backCode);
        const error = num(p.error);
        const row = num(p.row);
        return {
          ...scene,
          active: {
            ...scene.active,
            assigned: {
              frontCode,
              backCode,
              frontDists: nums(p.frontDists),
              backDists: nums(p.backDists),
              error,
            },
          },
          settled: [...scene.settled, { row, frontCode, backCode, error }],
          // 앞뒤가 서로 다른 번호를 고른 줄은 이 조각의 증거다. 같은 일이므로
          // 걸음을 나누지 않고 문안만 그 사실을 가리킨다.
          caption:
            frontCode === backCode
              ? { kind: 'pick', a: frontCode, b: backCode }
              : { kind: 'pickSplit', a: frontCode, b: backCode },
        };
      }

      case 'summary': {
        const plainBytes = num(p.plainBytes);
        const codeBytes = num(p.codeBytes);
        return {
          ...scene,
          // 마지막 셈에서는 지금 줄의 점과 선을 걷는다. 견줄 것은 자리이지 한 줄이 아니다.
          active: null,
          summary: { plainBytes, codeBytes },
          caption: { kind: 'summary', plainBytes, codeBytes },
        };
      }

      case 'rewind':
        return EMPTY;

      default:
        return scene;
    }
  },
};
