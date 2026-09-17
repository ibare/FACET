/**
 * unknownBecomesKnown 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 무엇을 담으면 이 걸음의 화면이 다시 서는가
 *
 * 이 조각의 화면은 세 층인데, 그중 **가운데(토막 줄)에는 한 번에 낱말 하나만
 * 선다.** 갈라진 토막은 선반으로 내려가 사라지고 다음 낱말이 그 자리를 쓴다.
 * 그러니 지금 다루는 낱말 하나(`active`)면 충분하고 목록이 필요 없다.
 *
 * 반대로 **받아 낸 낱말은 낱말 줄에 남는다.** 그것만 목록(`received`)으로 쌓는다.
 *
 * 선반이 섰는지(`shelfLaid`)와 마무리로 한 번 들어 보였는지(`finished`)는 켜고
 * 끄는 값 하나씩이다.
 *
 * ── 담지 않는 것
 *
 * 좌표를 담지 않는다. 선반의 자리도 낱말 줄의 칸도 캔버스 폭에서 역산하는 값이라
 * 그리는 쪽이 셈한다 (S-piece).
 *
 * 문안을 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 stage 가 `params.t`
 * 로 만든다 — 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도
 * 그 통로로만 온다 (C10). 조각 글자(`pieces`)는 데이터라 문안이 아니지만, 그것을
 * `·` 로 잇는 모양은 그리는 쪽이 정한다.
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/**
 * 지금 다루는 낱말이 어디까지 왔나.
 *
 *   missed  통째로 어휘를 훑었으나 맞는 것이 없었다 — 낱말 줄에 붉게 선다
 *   split   갈라진 토막이 토막 줄에 벌어져 있다
 *   locked  토막이 선반까지 내려가 제 조각과 맞물렸다 — 선반 조각이 켜져 있다
 */
export type WordPhase = 'missed' | 'split' | 'locked';

/** 지금 다루는 낱말. `missed` 단계에서는 아직 어떻게 갈릴지 모르므로 조각이 비었다. */
export type ActiveWord = { word: string; pieces: string[]; phase: WordPhase };

/** 받아 내어 낱말 줄에 남은 낱말. 조각을 드러낸 채 머문다. */
export type ReceivedWord = { word: string; pieces: string[] };

/** 캡션이 무엇을 말할지와 그 인자. 문자는 stage 가 만든다. */
export type UnknownCaption =
  | { kind: 'vocab'; count: number }
  | { kind: 'missed'; word: string }
  | { kind: 'seenSplit'; word: string; pieces: string[] }
  | { kind: 'split'; word: string; pieces: string[] }
  | { kind: 'lock'; pieces: string[] }
  | { kind: 'seenTaken'; word: string }
  | { kind: 'received'; word: string; pieces: string[] }
  | { kind: 'done'; count: number };

export type UnknownBecomesKnownScene = {
  /** 어휘 선반이 섰나. 첫 걸음이 세운다. */
  shelfLaid: boolean;
  /** 지금 다루는 낱말 하나. 화면 가운데에 한 번에 하나만 서므로 목록이 아니다. */
  active: ActiveWord | null;
  /** 받아 낸 낱말들. 낱말 줄에 차례대로 남는다. */
  received: ReceivedWord[];
  /** 받아 낸 낱말들을 한 번 들어 보였나. */
  finished: boolean;
  caption: UnknownCaption | null;
};

const EMPTY: UnknownBecomesKnownScene = {
  shelfLaid: false,
  active: null,
  received: [],
  finished: false,
  caption: null,
};

/** 걸음 하나에 실려 온 낱말과 그 조각들. */
type WordStep = { word: string; pieces: string[]; seen: boolean };

/** unknown → 장면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function readCount(payload: unknown): number {
  const p = payload as { count?: unknown; received?: unknown } | undefined;
  if (typeof p?.count === 'number') return p.count;
  if (typeof p?.received === 'number') return p.received;
  return 0;
}

function readWordOnly(payload: unknown): string | null {
  const p = payload as { word?: unknown } | undefined;
  return typeof p?.word === 'string' ? p.word : null;
}

function readWordStep(payload: unknown): WordStep | null {
  const p = payload as { word?: unknown; pieces?: unknown; seen?: unknown } | undefined;
  if (typeof p?.word !== 'string') return null;
  if (!Array.isArray(p.pieces)) return null;
  const pieces = p.pieces.filter((piece): piece is string => typeof piece === 'string');
  if (pieces.length === 0) return null;
  return { word: p.word, pieces, seen: p.seen === true };
}

export const unknownBecomesKnownScene: ScenePlan<UnknownBecomesKnownScene> = {
  /**
   * 첫 장면은 비어 있다.
   *
   * 선반에 무엇을 세울지와 낱말 줄의 칸은 stage 가 mount 때 `initialData` 에서
   * 셈한다 — 캔버스 폭이 있어야 정해지는 값이라 장면이 쥘 것이 아니다. 장면은
   * 걸음이 무엇을 보였는지만 쌓는다.
   */
  initial(): UnknownBecomesKnownScene {
    return EMPTY;
  },

  reduce(scene: UnknownBecomesKnownScene, event: FacetRuntimeEvent): UnknownBecomesKnownScene {
    switch (event.type) {
      case 'vocab-laid': {
        const count = readCount(event.payload);
        return { ...scene, shelfLaid: true, caption: { kind: 'vocab', count } };
      }

      case 'whole-missed': {
        const word = readWordOnly(event.payload);
        if (word === null) return scene;
        // 아직 어떻게 갈릴지 모른다. 통짜 낱말만 서는 단계다.
        return {
          ...scene,
          active: { word, pieces: [], phase: 'missed' },
          caption: { kind: 'missed', word },
        };
      }

      case 'word-splits': {
        const step = readWordStep(event.payload);
        if (step === null) return scene;
        return {
          ...scene,
          active: { word: step.word, pieces: step.pieces, phase: 'split' },
          caption: step.seen
            ? { kind: 'seenSplit', word: step.word, pieces: step.pieces }
            : { kind: 'split', word: step.word, pieces: step.pieces },
        };
      }

      case 'pieces-lock': {
        const step = readWordStep(event.payload);
        if (step === null) return scene;
        return {
          ...scene,
          active: { word: step.word, pieces: step.pieces, phase: 'locked' },
          caption: { kind: 'lock', pieces: step.pieces },
        };
      }

      case 'word-received': {
        const step = readWordStep(event.payload);
        if (step === null) return scene;
        return {
          ...scene,
          active: null,
          received: [...scene.received, { word: step.word, pieces: step.pieces }],
          caption: step.seen
            ? { kind: 'seenTaken', word: step.word }
            : { kind: 'received', word: step.word, pieces: step.pieces },
        };
      }

      case 'done': {
        const count = readCount(event.payload);
        return { ...scene, active: null, finished: true, caption: { kind: 'done', count } };
      }

      case 'rewind':
        return EMPTY;

      default:
        // 그 밖의 이벤트는 이 조각이 발신하지 않는다. 와도 조용히 흘린다 (C2).
        return scene;
    }
  },
};
