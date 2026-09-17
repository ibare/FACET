/**
 * hashFixedLength 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 은 셋이었고 stage 의 `let` 은 둘이었다. 조회로 갈리는 분기도
 * DOM 되읽기도 없었다. **곧 화면이 통째로 상태였다는 뜻이다.**
 *
 * - `let algorithmLabel` · `let hashBits` (projector) — 머리글과 "언제나 N비트"
 *   딱지가 여기서 나왔다. 앞엣것은 바탕이라 장면이 받아 적고, 뒤엣것은 **셈으로
 *   나오는 수**라 받아 적지 않는다 (아래 "결론은 그림과 같은 자료에서 나온다").
 * - `let longestBytes` (projector) — 캡션의 "{bytes} 바이트까지". 행들의 바이트
 *   수에서 최댓값 하나를 고르는 것이라 **장면이 센다** (`longestBytesOf`).
 * - `let rowNodes: RowNodes[]` (stage) — DOM 손잡이 배열인데, **알맹이는 손잡이가
 *   아니라 그 요소의 속성**이었다.
 *   - `input.style.opacity` 가 "입력을 내놓았나",
 *   - `outRow.style.opacity` 가 "해시를 내놓았나",
 *   - `box` 의 `stroke` 가 `none` 이냐 강조색이냐가 "하나같음을 짚었나" 였다.
 *   지금은 `inputsShown` · `outputsShown` · `uniform` 셋이 말한다.
 * - `RowNodes.srcW` — **DOM 손잡이와 수치가 한 객체에 묶인 자리**(함정 24).
 *   접힘이 출발하는 폭인데 입력 글자 수에서 나오는 값이라 상태가 아니다. 그리는
 *   쪽이 바탕에서 매번 셈한다.
 * - `let guides: SVGLineElement[]` (stage) — 안내선의 `style.opacity` 가 다시 한 번
 *   "하나같음을 짚었나" 를 쥐었다. 같은 물음에 답이 둘이던 자리다.
 * - `uniformLabel.textContent` 의 유무 — 셋째 자리. 지금은 `uniform` 하나에서
 *   셋이 함께 나온다.
 *
 * ── 결론은 그림과 같은 자료에서 나온다 (함정 34)
 *
 * 이 조각의 주장은 "입력이 아무리 길어도 해시는 늘 같은 길이다" 다. 그런데 옛
 * 화면은 그 결론을 **셈하지 않고 적어 두고** 있었다.
 *
 * - 상자 폭이 상수 `BOX_W = 200` 이었다. 넷이 같은 폭인 것은 자료가 그래서가 아니라
 *   **코드가 그렇게 그려서**였다. 지금은 폭이 `hash.length` 에서 나오므로, 길이가
 *   다른 해시를 넣으면 상자가 실제로 어긋난다.
 * - "언제나 N비트" 의 N 이 선언의 `hashBits: 256` 이었다. 화면에 뜨는 해시 문자열과
 *   **두 출처**여서, 자료가 바뀌면 글자가 조용히 거짓이 된다. 지금은 hex 한 자리가
 *   4 비트라는 것만 알고 `hash.length` 에서 센다 (`outputBitsOf`).
 *
 * 그래서 `uniformHexDigitsOf` 가 **길이가 하나같을 때만** 자릿수를 돌려준다. 하나같지
 * 않으면 `null` 이고 "언제나 N비트" 도 그 캡션도 서지 않는다 — 화면이 참이 아닌 것을
 * 말하지 않게 하는 자리다.
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 가장 긴 입력의 바이트 수 · 출력 비트 수 · 길이가 하나같은가 | **장면이 센다** |
 * | 입력 문자열 · 바이트 수 · 해시 문자열 | **`init` 이 값을 베껴 싣는다** |
 *
 * `bytes` 는 `input` 에서 셀 수 있어 보이지만 **저작 자료**로 남긴다. 입력 칸은
 * 보여 주는 글자이고 바이트 수는 그 입력이 실제로 얼마인가라, 둘이 갈리는 행(글의
 * 3.7MB 파일 같은 것)을 저작자가 적을 수 있어야 한다. 셈해 버리면 그 문이 닫힌다.
 *
 * 좌표는 담지 않는다. 행의 차례와 해시의 자릿수가 자리를 정하므로 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 한 행 — 입력 하나와 그 해시. 값이지 화면 자리가 아니다. */
export type FixedLengthSceneRow = {
  /** 입력 문자열. 빈 문자열도 유효한 입력이다. */
  input: string;
  /** 입력의 바이트 수. 저작 자료라 그대로 실려 온다. */
  bytes: number;
  /** 이 입력의 해시 (소문자 hex, 실측값). 길이가 곧 출력 길이다. */
  hash: string;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 접힘이 어느 폭에서 출발하는지도 안내선이 어디에
 * 서는지도 전부 바탕에서 셈하므로 `prev` 를 들출 일이 없다 (S-scene).
 */
export type FixedLengthStep =
  /** 길이가 제각각인 입력들이 놓인다. */
  | { kind: 'inputs' }
  /** 입력이 상자 폭으로 접혀 건너가고 해시가 놓인다. */
  | { kind: 'outputs' }
  /** 출력의 폭이 하나같음을 좌우 안내선이 짚는다. */
  | { kind: 'uniform' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type FixedLengthCaption =
  | { kind: 'inputsVary'; bytes: number }
  | { kind: 'outputsUniform'; bits: number };

export type HashFixedLengthScene = {
  // ── 바탕. `init` 이 값을 베껴 채우고 걸음이 고치지 않는다.
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 보여 줄 행들. */
  rows: readonly FixedLengthSceneRow[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 길이가 제각각인 입력들을 내놓았나. */
  inputsShown: boolean;
  /** 각각의 해시를 내놓았나. */
  outputsShown: boolean;
  /** 출력의 폭이 하나같음을 짚었나. 안내선 · 상자 테두리 · 딱지가 함께 선다. */
  uniform: boolean;

  step: FixedLengthStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `inputsShown` 부터 `uniform` 까지는 걸어온 자취라 여기 넣지 않는다 — 넣으면
 * 되감은 화면이 이미 다 짚은 채로 서고 그 위에 algorithm 이 처음부터 다시 세우는
 * 것이 겹친다 (S-scene).
 */
type Base = Pick<HashFixedLengthScene, 'algorithmLabel' | 'rows'>;

/**
 * 되돌린 뒤의 장면 — 아무것도 서 있지 않다. 첫 걸음이 입력을 놓는다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 TypeScript 의 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로
 * 통과한다 (프로토콜 4 절).
 */
function atStart(base: Base): HashFixedLengthScene {
  return {
    algorithmLabel: base.algorithmLabel,
    rows: base.rows,
    inputsShown: false,
    outputsShown: false,
    uniform: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function fields(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * 행들을 값으로 베껴 온다.
 *
 * **새 배열에 새 객체를 담는다.** 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
 * 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readRows(raw: unknown): FixedLengthSceneRow[] {
  if (!Array.isArray(raw)) return [];
  const out: FixedLengthSceneRow[] = [];
  for (const item of raw) {
    const row = fields(item);
    if (row === null) continue;
    out.push({ input: str(row.input), bytes: num(row.bytes), hash: str(row.hash) });
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 상자의 폭도 딱지의 비트 수도 캡션의 수도
// 같은 함수를 부르므로 갈릴 자리가 없다.

/** 가장 긴 입력의 바이트 수. 캡션이 "{bytes} 바이트까지" 로 인쇄한다. */
export function longestBytesOf(scene: HashFixedLengthScene): number {
  return scene.rows.reduce((most, row) => Math.max(most, row.bytes), 0);
}

/**
 * 출력의 hex 자릿수 — **넷이 하나같을 때만** 그 수, 아니면 `null`.
 *
 * 이 조각의 결론 그 자체다. 상수로 적어 두지 않고 화면에 그려지는 바로 그 해시
 * 문자열에서 센다 (함정 34). 하나같지 않으면 아무 수도 돌려주지 않아, 화면이
 * "언제나 N비트" 라고 말하지 못한다.
 */
export function uniformHexDigitsOf(scene: HashFixedLengthScene): number | null {
  const first = scene.rows[0];
  if (first === undefined) return null;
  const digits = first.hash.length;
  if (digits === 0) return null;
  return scene.rows.every((row) => row.hash.length === digits) ? digits : null;
}

/** 출력의 비트 수. hex 한 자리가 네 비트다. 길이가 하나같지 않으면 `null`. */
export function outputBitsOf(scene: HashFixedLengthScene): number | null {
  const digits = uniformHexDigitsOf(scene);
  return digits === null ? null : digits * 4;
}

/**
 * 지금 화면이 말할 것.
 *
 * 걸음이 아니라 **자취**에서 나온다 — 정적 그리기가 `step` 을 읽지 않아야 흘려
 * 세운 화면과 곧바로 세운 화면이 같아진다 (S-scene).
 */
export function captionOf(scene: HashFixedLengthScene): FixedLengthCaption | null {
  const bits = outputBitsOf(scene);
  if (scene.uniform && bits !== null) return { kind: 'outputsUniform', bits };
  if (scene.inputsShown) return { kind: 'inputsVary', bytes: longestBytesOf(scene) };
  return null;
}

export const hashFixedLengthScene: ScenePlan<HashFixedLengthScene> = {
  /**
   * 첫 장면은 비어 있다 — 행도 이름도 `init` 이 실어 온다.
   *
   * 넘겨받은 `initialData` 를 쳐다보지 않는다. 그것은 algorithm 이 제자리에서 고칠
   * 수 있는 객체라, 참조는 물론이고 한 번 읽어 두는 것도 되짚기의 바탕으로 삼기엔
   * 위태롭다 (S-scene).
   */
  initial(): HashFixedLengthScene {
    return atStart({ algorithmLabel: '', rows: [] });
  },

  reduce(scene: HashFixedLengthScene, event: FacetRuntimeEvent): HashFixedLengthScene {
    switch (event.type) {
      /* 바탕이 들어선다. 값을 베껴 담는다 — 새 배열에 새 객체다. */
      case 'init': {
        const p = fields(event.payload);
        return atStart({
          algorithmLabel: str(p?.algorithmLabel),
          rows: readRows(p?.rows),
        });
      }

      /* 길이가 제각각인 입력들이 놓인다. 몇 개이고 얼마나 긴가는 바탕이 말한다. */
      case 'reveal-inputs':
        return { ...scene, inputsShown: true, step: { kind: 'inputs' } };

      /* 입력이 접혀 건너가고 해시가 놓인다. 상자 폭은 해시 자릿수가 정한다. */
      case 'reveal-outputs':
        return { ...scene, outputsShown: true, step: { kind: 'outputs' } };

      /* 하나같음을 짚는다. 무엇이 하나같은가는 장면이 센다. */
      case 'mark-uniform':
        return { ...scene, uniform: true, step: { kind: 'uniform' } };

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 턴다. 객체 리터럴을 넘긴다. */
      case 'rewind':
        return atStart({ algorithmLabel: scene.algorithmLabel, rows: scene.rows });

      default:
        // 이 algorithm 이 발신하는 것은 위 다섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
