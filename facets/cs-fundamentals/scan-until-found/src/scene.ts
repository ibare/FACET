/**
 * scanUntilFound 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **훑은 자취의 길이.** 한 훑기는 도중에 멎고 한 훑기는 끝을 지나 빠져나가는데,
 * 그 두 길이가 나란히 놓여야 "없다고 답하려면 끝까지 봐야 한다" 가 보인다. 그러니
 * 화면이 반드시 쥐고 있어야 하는 것은 **훑기마다 어느 칸을 차례로 짚어 보았나**
 * 다. 짚은 자취는 지나가는 깜빡임이 아니라 **남는 표식**이라 정적 그리기에도
 * 들어간다 (S-scene).
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었고 stage 에도 `destroyed` 를 빼면
 * 하나뿐이었다. **화면이 통째로 상태였다는 뜻이다.**
 *
 * - **`type CellState`** — `'idle' | 'looking' | 'seen' | 'found'` 가 선언만 되어
 *   있고 **저장되는 곳이 어디에도 없었다.** 칠에만 쓰였고, 지금 어느 칸이 무슨
 *   형편인지는 `rect` 의 `fill` 속성 안에만 있었다. 이제 `passes[k].probed` 와
 *   `values` · `target` 이 그것을 말한다.
 * - **`type Lane = { laneY, chip, chipText, marks, count }`** — DOM 손잡이와 뜻이
 *   한 객체에 묶여 있었다. 그중 `marks` 는 `<g>` 하나인데 **그 자식 수가 곧 "이번
 *   훑기가 몇 칸을 짚었나"** 라는 이 조각의 결론이었다. 수를 적어 둔 변수가 코드
 *   어디에도 없고 DOM 자식 목록에만 있었다. 이제 `probed.length` 다.
 * - **`chipText.textContent` · `probeText.textContent`** — 이 훑기가 무엇을 찾고
 *   있는지가 글자 안에만 있었다. 이제 `passes[k].target` 이다.
 * - **`count.textContent` 와 그 `x` 속성** — 본 칸 수가 글자와 좌표 두 군데에
 *   따로 적혀 있었다. 이제 한 곳에서 나온다.
 * - **`gProbe` 의 `transform`** — 좌표가 아니라 **단계**를 말하고 있었다. 줄 앞에
 *   섰나 · 몇 번 칸을 보고 있나 · 줄 밖으로 나갔나가 전부 `translate(x 0)` 안에만
 *   있었다. 이제 `gazeOf()` 가 장면에서 셈한다.
 * - **`let farEndX`** — 자취가 닿은 가장 오른쪽. 자 눈금을 그을 때 쓰였고, 되감으면
 *   0 으로 돌아가지만 화면의 자취는 그대로여서 둘이 어긋날 자리였다. 이제 `passes`
 *   에서 셈한다.
 * - **자의 네 끝점** — `dropLine` · `measureLine` · `tickL` · `tickR` 의 `x1`/`x2`
 *   속성. 이 조각의 결론인 두 수(4 와 5)가 좌표 문자열 안에만 있었다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편** — 아직 안 보았나 · 보았더니 다르더냐 · 같더냐. **테두리는
 * 짚음의 표식** — 여기까지 보았다. 옮기기 전에는 `paintCell` 이 한 상태에서 `fill`
 * 과 `stroke` 를 **함께** 정해 두 뜻이 한 채널에 겹쳐 있었다. 겹치면 어느 쪽도
 * 되짚기에서 복원되지 않고, 무엇보다 "보았는데 달랐다" 와 "아직 안 보았다" 를
 * 화면이 구별하지 못한다 — 회색 한 칠이 둘을 겸했다.
 *
 * ── 걸음이 싣고 오던 수를 걷어냈다
 *
 * `pass` · `index` · `value` · `target` · `seen` · `stopped` · `exhausted` 가 전부
 * payload 로 왔는데 하나도 남김없이 구조에서 나온다. 차례는 발신이 오는 순서가
 * 이미 말하고(`passes.length`), 짚은 칸은 식별자(`index:<i>`)가 말하고, 본 칸 수는
 * `probed.length` 이고, 값과 찾는 값은 바탕 자료에 있다. 그래서 다섯 발신의
 * payload 가 전부 비었다.
 *
 * 좌표는 담지 않는다. 칸 수가 폭을 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

/** 한 훑기의 결말. 도는 중이면 `null` 이다. */
export type ScanOutcome =
  /** 찾아서 그 자리에 멎었다. `at` 은 마지막으로 짚은 칸이다. */
  | { kind: 'found'; at: number }
  /** 끝까지 갔는데 없었다. 자취가 줄 밖으로 빠져나간다. */
  | { kind: 'overrun' };

/**
 * 훑기 하나.
 *
 * `probed` 가 이 조각의 요점이다 — 짚어 본 칸들을 짚은 차례대로 쥔다. **길이가 곧
 * 본 칸 수**이므로 캡션의 수와 자취의 길이가 한 출처에서 나온다.
 */
export type ScanPass = {
  /** 이번에 찾는 값. `queries` 의 그 자리 값이다. */
  readonly target: number;
  /** 짚어 본 칸들. 차례대로. */
  readonly probed: readonly number[];
  readonly outcome: ScanOutcome | null;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type ScanCaption =
  | { kind: 'looking'; target: number }
  | { kind: 'found'; seen: number }
  | { kind: 'overrun'; seen: number }
  | { kind: 'gap'; stopped: number; exhausted: number };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 자리**도
 * 여기서 말한다.
 *
 * 눈길이 자리를 옮기는 조각이라 출발 자리가 꼭 필요하다. 그것을 `prev` 에서
 * 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 어디서 어디로 갔는지를
 * `reduce` 가 앞 장면에서 읽어 여기 싣는다.
 */
export type ScanStep =
  /** 새 훑기가 선다. 눈길이 줄 왼쪽 밖에서 줄 앞으로 들어온다. */
  | { kind: 'begin' }
  /** 눈길이 한 칸 옮겨 가 들여다본다. `from` 이 `null` 이면 줄 앞에서 출발한다. */
  | { kind: 'look'; from: number | null; to: number }
  /** 자취 끝에 벽이 서고 눈길이 그 자리에서 멎는다. */
  | { kind: 'stop'; at: number }
  /** 자취가 줄 끝을 지나 화살로 뻗고 눈길도 밖으로 빠져나간다. */
  | { kind: 'overrun'; from: number | null }
  /** 두 자취의 길이 차이를 잰다. */
  | { kind: 'measure' };

export type ScanUntilFoundScene = {
  /**
   * 줄에 늘어선 값. **바탕** — 걸음이 고치지 않는다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 누구도 고치지 않는다 (S-scene 의 Exception).
   */
  readonly values: readonly number[];
  /** 차례로 찾아 볼 값들. 바탕이고, 길이가 곧 훑기 횟수이자 자취 줄 수다. */
  readonly queries: readonly number[];
  /** 지금까지 시작된 훑기들. 마지막이 지금 도는 것이다. */
  readonly passes: readonly ScanPass[];
  /** 길이 차이를 재는 자가 섰나. 마지막 걸음이 세우는 **남는 표식**이다. */
  readonly concluded: boolean;
  readonly step: ScanStep | null;
  readonly caption: ScanCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `passes` 를 여기 넣지 않는다. 그것은 걸어온 자취라, 바탕으로 묶어 되감기에
 * 넘기면 되감은 화면이 자취를 단 채로 서고 그 위에 algorithm 이 처음부터 다시
 * 밟는다. 타입으로 좁혀 구조적으로 못 넘어가게 하고, 부르는 쪽은 **객체 리터럴**
 * 로 넘긴다 — 변수로 넘기면 초과 속성 검사가 돌지 않아 좁힌 타입이 아무것도 막지
 * 못한다.
 */
type ScanBase = Pick<ScanUntilFoundScene, 'values' | 'queries'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: ScanBase): ScanUntilFoundScene {
  return {
    values: base.values,
    queries: base.queries,
    passes: [],
    concluded: false,
    step: null,
    caption: null,
  };
}

/** 눈길이 선 자리. 좌표가 아니라 **어느 단계에 있나** 이고, 자리는 그리는 쪽이 셈한다. */
export type ScanGaze =
  /** 아직 줄에 들어오지 않았다. */
  | { kind: 'away' }
  /** 줄 앞에 섰다. 아직 아무 칸도 보지 않았다. */
  | { kind: 'ready' }
  /** 그 칸을 들여다보고 있다 (찾아서 멎은 자리도 여기다). */
  | { kind: 'at'; index: number }
  /** 줄 밖으로 빠져나갔다. */
  | { kind: 'gone' };

/**
 * 눈길이 어디 있나 — **장면에서 셈한다.**
 *
 * 따로 필드로 두면 같은 물음에 두 답이 생겨 언젠가 갈린다. 자취가 이미 그 답을
 * 쥐고 있으므로 여기서 한 번만 읽는다.
 */
export function gazeOf(scene: ScanUntilFoundScene): ScanGaze {
  const pass = scene.passes[scene.passes.length - 1];
  if (pass === undefined) return { kind: 'away' };
  if (pass.outcome !== null) {
    return pass.outcome.kind === 'found'
      ? { kind: 'at', index: pass.outcome.at }
      : { kind: 'gone' };
  }
  const last = pass.probed[pass.probed.length - 1];
  return typeof last === 'number' ? { kind: 'at', index: last } : { kind: 'ready' };
}

/** 견줄 두 훑기. 멎은 쪽과 없다고 답한 쪽. */
export type ScanTally = {
  readonly stopped: ScanPass | null;
  readonly exhausted: ScanPass | null;
};

/**
 * 견줄 두 훑기를 고른다.
 *
 * 캡션의 두 수(`stopped` · `exhausted`)와 자 눈금의 두 좌표가 **같은 함수**를
 * 지나게 한다. 화면에 나란히 뜨는 수가 두 출처에서 나오면 언젠가 갈린다.
 */
export function tallyOf(passes: readonly ScanPass[]): ScanTally {
  let stopped: ScanPass | null = null;
  let exhausted: ScanPass | null = null;
  for (const pass of passes) {
    if (pass.outcome === null) continue;
    if (pass.outcome.kind === 'found') stopped = pass;
    else exhausted = pass;
  }
  return { stopped, exhausted };
}

/** 지금 도는 훑기. 아직 하나도 서지 않았으면 `null`. */
function currentPass(scene: ScanUntilFoundScene): ScanPass | null {
  return scene.passes[scene.passes.length - 1] ?? null;
}

/**
 * 마지막 훑기만 갈아 낀 새 목록. **앞 장면의 배열을 제자리에서 고치지 않는다** —
 * 고치면 과거가 함께 바뀐다 (S-scene).
 */
function replaceLast(passes: readonly ScanPass[], pass: ScanPass): readonly ScanPass[] {
  return [...passes.slice(0, -1), pass];
}

/** 걸음이 가리키는 한 자리. 식별자 파싱은 `toIndexArray` 를 경유한다 (원칙 4). */
function targetIndex(event: FacetRuntimeEvent): number | null {
  const i = toIndexArray(event.target)[0];
  return typeof i === 'number' ? i : null;
}

export const scanUntilFoundScene: ScenePlan<ScanUntilFoundScene> = {
  /**
   * 첫 장면은 빈 줄 하나다 — 값은 놓였지만 아무도 아직 보지 않았다.
   *
   * 바탕을 실어 오는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만 **참조로 쥐지
   * 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한 벌이라, 참조를
   * 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene). 아래 `filter`
   * 가 새 배열을 만든다.
   */
  initial(initialData: unknown): ScanUntilFoundScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const nums = (v: unknown): number[] =>
      Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : [];
    return atStart({ values: nums(raw.values), queries: nums(raw.queries) });
  },

  reduce(scene: ScanUntilFoundScene, event: FacetRuntimeEvent): ScanUntilFoundScene {
    switch (event.type) {
      /**
       * 새 훑기가 선다.
       *
       * 무엇을 찾는지는 **차례가 정한다** — 이번이 몇 번째 훑기인가는 발신이 오는
       * 순서가 이미 말하고(`passes.length`), 그 자리의 찾을 값은 바탕에 있다.
       * 걸음이 실어 오면 같은 물음에 두 답이 생긴다.
       */
      case 'scan-begin': {
        const target = scene.queries[scene.passes.length];
        if (typeof target !== 'number') return scene;
        return {
          ...scene,
          passes: [...scene.passes, { target, probed: [], outcome: null }],
          step: { kind: 'begin' },
          caption: { kind: 'looking', target },
        };
      }

      /**
       * 눈길이 한 칸으로 옮겨 가 들여다본다.
       *
       * 같더냐 다르더냐는 여기서 셈하지 않는다 — 그리는 쪽이 `values` 와 `target`
       * 을 견주면 나오므로, 판정을 장면에 적어 두면 같은 물음에 두 답이 남는다.
       * 캡션은 바꾸지 않는다. "찾는 값 N" 이 훑기 내내 서 있어야 하기 때문이다.
       */
      case 'highlight': {
        const to = targetIndex(event);
        const pass = currentPass(scene);
        if (to === null || pass === null || pass.outcome !== null) return scene;
        const last = pass.probed[pass.probed.length - 1];
        return {
          ...scene,
          passes: replaceLast(scene.passes, { ...pass, probed: [...pass.probed, to] }),
          step: { kind: 'look', from: typeof last === 'number' ? last : null, to },
          caption: scene.caption,
        };
      }

      // 찾았다. 자취가 그 자리에서 벽에 막혀 멎는다.
      case 'mark': {
        const at = targetIndex(event);
        const pass = currentPass(scene);
        if (at === null || pass === null || pass.outcome !== null) return scene;
        return {
          ...scene,
          passes: replaceLast(scene.passes, { ...pass, outcome: { kind: 'found', at } }),
          step: { kind: 'stop', at },
          caption: { kind: 'found', seen: pass.probed.length },
        };
      }

      // 끝까지 갔는데 없다. 자취가 줄 밖으로 빠져나간다 — 이 조각의 다른 결말이다.
      case 'overrun': {
        const pass = currentPass(scene);
        if (pass === null || pass.outcome !== null) return scene;
        const last = pass.probed[pass.probed.length - 1];
        return {
          ...scene,
          passes: replaceLast(scene.passes, { ...pass, outcome: { kind: 'overrun' } }),
          step: { kind: 'overrun', from: typeof last === 'number' ? last : null },
          caption: { kind: 'overrun', seen: pass.probed.length },
        };
      }

      /**
       * 두 자취의 길이를 견준다. 이 조각이 하려던 말이 여기서 다 나온다.
       *
       * 두 수는 자취에서 센다 — 자 눈금을 긋는 그리는 쪽도 같은 `tallyOf` 를 지나
       * 좌표를 얻으므로, 화면에 나란히 뜨는 수와 그림이 한 출처다.
       */
      case 'done': {
        const { stopped, exhausted } = tallyOf(scene.passes);
        if (stopped === null || exhausted === null) return scene;
        return {
          ...scene,
          concluded: true,
          step: { kind: 'measure' },
          caption: {
            kind: 'gap',
            stopped: stopped.probed.length,
            exhausted: exhausted.probed.length,
          },
        };
      }

      case 'rewind':
        // 바탕은 줄과 찾을 값들뿐이다. 훑은 자취는 여기서 다시 비워진다.
        return atStart({ values: scene.values, queries: scene.queries });

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
