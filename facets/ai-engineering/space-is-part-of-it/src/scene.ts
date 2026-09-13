/**
 * SpaceIsPartOfIt 장면 설계 — 이벤트를 화면 명령이 아니라 상태로 옮긴다.
 *
 * 이 조각의 화면은 **쌓이기만 한다.** 낱말이 놓이고, 표식이 서고, 붙고, 잘리고,
 * 선반이 채워진다. 지워지는 것은 붙는 순간 사라지는 빈칸 자리뿐이고 그것도 그
 * 걸음의 운동에 딸린 것이라 다음 걸음에는 없는 것이 정상이다. 그래서 장면의
 * 뼈대가 **단계 하나**로 선다 — 어디까지 쌓였는지만 알면 화면이 정해진다.
 *
 * 단계 옆에 붙는 것은 그 걸음이 실어 온 수 셋과 쪼개지는 낱말 하나뿐이다. 이것들은
 * 한 번 들어오면 남으므로 (캡션이 지나가도 조각은 화면에 남아 있다) 단계와 따로
 * 쥔다.
 *
 * ── 담지 않는 것
 *
 * - **좌표**. 어느 낱말이 어디 서는지는 캔버스 폭과 글자 수가 정하므로 stage 가
 *   셈한다 (S-piece).
 * - **문안**. 무엇을 말할지는 단계가 정하고 문자는 stage 가 `params.t` 로 만든다
 *   (C10). 캡션이 단계와 1:1 이라 따로 필드를 두지 않는다.
 * - **낱말 목록**. `initialData` 에 있고 stage 의 mount 가 이미 받았다. 장면에
 *   참조로 담으면 되짚을 때 굴러간 자료를 보게 된다 (S-scene).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 화면이 어디까지 쌓였나.
 *
 * 이벤트 아홉 가지가 단계 아홉에 그대로 대응한다 — 이 조각은 걸음마다 화면에
 * 무언가를 더하고 되물리지 않기 때문이다. `idle` 은 아직 아무것도 없는 자리로,
 * 첫 장면과 `rewind` 뒤가 여기 있다.
 */
export type SpacePhase =
  | 'idle'
  | 'sentence'
  | 'marked'
  | 'attached'
  | 'cut'
  | 'second'
  | 'spaced'
  | 'bare'
  | 'split'
  | 'done';

/**
 * 단계의 순서. 화면은 "이 수 이하의 단계가 쌓아 올린 것" 이므로 stage 가 크기를
 * 견주어 무엇을 그릴지 고른다.
 */
export const PHASE_RANK: Record<SpacePhase, number> = {
  idle: 0,
  sentence: 1,
  marked: 2,
  attached: 3,
  cut: 4,
  second: 5,
  spaced: 6,
  bare: 7,
  split: 8,
  done: 9,
};

/** 통째로는 어휘에 남지 못하는 낱말과 그것이 쪼개져 나오는 조각. */
export type UnseenSplit = { token: string; parts: string[] };

export type SpaceScene = {
  phase: SpacePhase;
  /** 문장이 잘린 조각 수. `cut` 이 실어 온다. */
  pieceCount: number;
  /** 빈칸 때문에 두 자리로 갈린 쌍의 수. `shelf-bare` 가 실어 온다. */
  pairCount: number;
  /** 어휘의 크기. `done` 이 실어 온다. */
  vocabSize: number;
  /** 쪼개지는 낱말. 성하지 않으면 `null` 이고 그 그림을 건너뛴다. */
  split: UnseenSplit | null;
};

const EMPTY: SpaceScene = {
  phase: 'idle',
  pieceCount: 0,
  pairCount: 0,
  vocabSize: 0,
  split: null,
};

/** payload 에서 수 하나를 꺼낸다. 없거나 수가 아니면 0 (C9). */
function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** 쪼개지는 낱말과 그 조각. 어느 한쪽이라도 성하지 않으면 그릴 것이 없다. */
function readSplit(payload: Record<string, unknown>): UnseenSplit | null {
  const token = typeof payload.token === 'string' ? payload.token : '';
  const parts = Array.isArray(payload.parts)
    ? payload.parts.filter((part): part is string => typeof part === 'string')
    : [];
  return token !== '' && parts.length > 0 ? { token, parts } : null;
}

export const spaceIsPartOfItScene: ScenePlan<SpaceScene> = {
  initial(): SpaceScene {
    return EMPTY;
  },

  reduce(scene: SpaceScene, event: FacetRuntimeEvent): SpaceScene {
    // 객체가 아닌 payload 는 빈 것으로 본다. 이 검사가 없으면 원시값이 왔을 때
    // 필드마다 조용히 0 으로 떨어져 잘못이 드러나지 않는다 (C9).
    const raw = event.payload;
    const p: Record<string, unknown> =
      typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
    switch (event.type) {
      case 'sentence':
        return { ...scene, phase: 'sentence' };

      case 'mark-gaps':
        return { ...scene, phase: 'marked' };

      case 'attach':
        return { ...scene, phase: 'attached' };

      case 'cut':
        return { ...scene, phase: 'cut', pieceCount: num(p.count) };

      // 둘째 줄의 낱말 수와 붙은 꼴의 수는 payload 에 실려 오지만 화면에 뜨지
      // 않는다 (그 캡션에는 자리표가 없고, 낱말은 `initialData` 에 있다). 쓰지
      // 않는 수는 장면에 담지 않는다.
      case 'second-line':
        return { ...scene, phase: 'second' };

      case 'shelf-spaced':
        return { ...scene, phase: 'spaced' };

      case 'shelf-bare':
        return { ...scene, phase: 'bare', pairCount: num(p.pairs) };

      case 'split-unseen':
        return { ...scene, phase: 'split', split: readSplit(p) };

      case 'done':
        return { ...scene, phase: 'done', vocabSize: num(p.vocab) };

      case 'rewind':
        return EMPTY;

      default:
        // 이 조각이 내보내는 이벤트는 위가 전부다. 그 밖의 것이 오면 화면에서
        // 할 일이 없으므로 조용히 흘린다 (C2).
        return scene;
    }
  },
};
