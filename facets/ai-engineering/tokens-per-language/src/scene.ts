/**
 * TokensPerLanguage 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * 이 조각의 화면은 세 덩이로 나뉜다.
 *
 *   어휘 띠      말뭉치에서 배운 조각들. 한 번 뜨면 끝까지 그대로 있다.
 *   문장 다섯    낱글자로 드러났다가, 자를 차례가 온 줄부터 틈이 벌어진다.
 *   으뜸 표시선  마지막에 세로로 내려 긋는 선. 으뜸 언어의 끝이 어디였는지.
 *
 * 줄은 한 번 잘리면 그 모습으로 **남는다** — 지금 자르는 줄 하나만 쥐어서는
 * 화면이 정해지지 않는다. 그래서 자른 줄들을 차례대로 목록에 쌓는다. 대신
 * 자를 때 물드는 테두리는 한 줄에만 걸리므로 코드 하나(`activeCode`)로 족하다.
 *
 * 좌표는 담지 않는다. 어휘 칩이 몇 줄로 접히는지도, 조각 경계가 몇 픽셀 벌어지는지도
 * 캔버스 너비가 정하는 것이라 그리는 쪽이 셈한다 (S-piece).
 *
 * 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이 만든다 —
 * 같은 장면을 다른 locale 로 그릴 수 있어야 하고, 저작자 오버라이드도 View 의
 * `params.t` 로만 온다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 어휘 띠에 뜰 것. 칩을 어떻게 접을지는 그리는 쪽이 정한다. */
export type VocabBand = {
  corpusWords: number;
  tokens: string[];
};

/** 이미 잘린 줄 하나. 조각 경계와 그 수, 그리고 으뜸 대비 배수. */
export type CutRow = {
  code: string;
  /** 조각들. 길이가 곧 어디서 틈이 벌어지는지를 정한다. */
  pieces: string[];
  pieceCount: number;
  /** 으뜸 언어 대비 배수를 열 배로 셈한 정수 (35 = 3.5배). */
  ratioTenths: number;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type TokensCaption =
  | { kind: 'vocab'; words: number; n: number }
  | { kind: 'sentences' }
  | { kind: 'scatter'; chars: number; pieces: number }
  | { kind: 'done'; min: number; max: number };

export type TokensScene = {
  /** 어휘 띠. 아직 배우기 전이면 `null`. */
  vocab: VocabBand | null;
  /** 문장의 낱글자가 드러났나. 한 번 서면 끝까지 선다. */
  lettersShown: boolean;
  /** 자른 줄들. 잘린 차례대로 쌓이고 걷히지 않는다. */
  cuts: CutRow[];
  /**
   * 테두리가 물든 줄. 자르는 동안만 그 줄에 걸리고 마지막 셈에서 걷힌다 —
   * 지나가는 강조라 목록이 아니라 코드 하나로 잡는다.
   */
  activeCode: string | null;
  /** 으뜸 언어. 그 줄 끝에 표시선을 내린다. 마지막 걸음 전에는 `null`. */
  baseCode: string | null;
  caption: TokensCaption | null;
};

const EMPTY: TokensScene = {
  vocab: null,
  lettersShown: false,
  cuts: [],
  activeCode: null,
  baseCode: null,
  caption: null,
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((item): item is string => typeof item === 'string') : [];
}

export const tokensPerLanguageScene: ScenePlan<TokensScene> = {
  /**
   * 첫 장면은 비어 있다.
   *
   * 문장 다섯은 `initialData` 에 있지만 여기서 쥐지 않는다 — 러너가 주는 것은
   * mechanism 과 view 가 함께 쓰는 한 객체다. 바탕 그림은 stage 가 마운트할 때
   * 제 손으로 읽고, 걸음이 얹는 것만 장면에 담는다 (S-scene).
   */
  initial(): TokensScene {
    return EMPTY;
  },

  reduce(scene: TokensScene, event: FacetRuntimeEvent): TokensScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'vocab-learned': {
        const corpusWords = num(p.corpusWords);
        const tokens = strs(p.tokens);
        return {
          ...scene,
          vocab: { corpusWords, tokens },
          caption: { kind: 'vocab', words: corpusWords, n: tokens.length },
        };
      }

      case 'sentences-shown':
        return {
          ...scene,
          lettersShown: true,
          caption: { kind: 'sentences' },
        };

      case 'scatter': {
        const code = str(p.code);
        const pieces = strs(p.pieces);
        const pieceCount = num(p.pieceCount);
        return {
          ...scene,
          // 자른 줄은 남는다. 앞 목록을 고치지 않고 새 배열을 만든다 — 고치면
          // 되짚기가 다시 쓰는 과거의 장면까지 함께 바뀐다.
          cuts: [...scene.cuts, { code, pieces, pieceCount, ratioTenths: num(p.ratioTenths) }],
          activeCode: code,
          caption: { kind: 'scatter', chars: num(p.chars), pieces: pieceCount },
        };
      }

      case 'done':
        return {
          ...scene,
          // 강조는 하나로 모은다 — 자를 때 물들었던 테두리를 거두고 표시선만 남긴다.
          activeCode: null,
          baseCode: str(p.baseCode),
          caption: { kind: 'done', min: num(p.minCount), max: num(p.maxCount) },
        };

      case 'rewind':
        return EMPTY;

      default:
        // 이 조각이 내보내는 것은 위 다섯뿐이다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
