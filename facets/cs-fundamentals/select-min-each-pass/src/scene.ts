/**
 * selectMinEachPass 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 세 켜다. 위쪽 레일에는 눈길이 지나며 자국을 남기고, 가운데 칸에는 값이 앉아
 * 있고, 아래 레일에는 "지금까지 가장 작았던 자리" 표식이 건너다닌다. 훑는 동안
 * 값은 하나도 움직이지 않고, 다 훑은 뒤에 비로소 한 번 옮긴다.
 *
 * ── 숨은 상태는 어디에 있었나
 *
 * 옮기기 전 projector 에는 `let` 이 하나도 없었고, 상태는 전부 stage 의 DOM 에
 * 있었다.
 *
 * - **표식이 지금 어디 있나** — `chip` 의 `style.transform` 에만 있었다. 이 조각의
 *   주장이 바로 그 자리("더 작은 것을 만나면 표식이 옮겨 붙는다")인데, 그것을
 *   적어 둔 변수가 코드 어디에도 없었다. 이제 `best` 다.
 * - **표식이 쥔 값** — `chipValue.textContent`. 이제 `values` 와 `settled` 에서
 *   셈한다 (그리는 쪽의 `heldValue`).
 * - **표식이 아직 살아 있나** — `chipRect` 의 `fill` 이 pivot 이냐 회색이냐로만
 *   갈렸다. 이제 `retired` 다.
 * - **눈길이 아직 화면에 있나 · 어디 있나** — `eye` 는 `SVGGElement | null` 이라
 *   존재만 말했고, 자리는 역시 `style.transform` 에 있었다. `endScan` 이
 *   `` `${target.style.transform} translate(0px,-46px)` `` 로 **화면을 도로 읽어**
 *   물러날 자리를 셈했다 (프로토콜 3-1 의 ④). 이제 `eye: number | null` 이다.
 * - **어디까지 훑어 보았나** — `trailLayer` 에 쌓이던 점들. 되돌리는 명령이 없어
 *   누적되고 있었고, 그 누적이 곧 "이 바퀴에서 견줌이 몇 번 일어났나" 라는
 *   주장이었다. 지우면 조각이 말하던 것이 줄어든다 — `scanned` 로 올린다.
 * - **어느 자국에서 표식이 건너갔나** — `lastTrailDot` 을 굵게 칠하는 것으로만
 *   남았다. `hopAt` 으로 올린다.
 * - **어느 칸이 어느 형편인가** — `type CellState` 는 선언만 있고 저장되는 곳이
 *   없었다. 칠에만 쓰였고, 지금 어느 칸이 무슨 상태인지는 `rect` 의 `fill`
 *   속성에만 있었다 (프로토콜 3-1 의 ⑤). 이제 `settled` · `best` · `looking` 이
 *   말한다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**(맨 앞으로 옮겨져 확정됐나), **테두리는 견줌·훑음의 표식**
 * (표식이 가리키나 · 지금 견주나) 이다. 옮기기 전에는 표식 자리를 채움(`marked`)
 * 으로 칠했는데, 값이 맨 앞으로 간 뒤 그 자리에는 밀려난 값이 앉으므로 **읽기가
 * 뒤집혔다.** 갈라 두면 부딪히지 않는다.
 *
 * 좌표는 담지 않는다. 칸 수가 폭을 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import { toIndexArray, type FacetRuntimeEvent, type ScenePlan } from '@ffacet/core/runtime';

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type SelectMinEachPassCaption =
  | { kind: 'remember' }
  /**
   * 견줌 한 번. `smaller` 가 거짓이면 그 걸음 안에서 답까지 난다 — 물음 뒤에
   * "아니다" 를 잇는다. 참이면 다음 걸음(`hop`)이 답을 말한다.
   */
  | { kind: 'compare'; value: number; best: number; smaller: boolean }
  | { kind: 'hop'; value: number }
  | { kind: 'scanEnd'; compares: number; hops: number }
  | { kind: 'move' }
  | { kind: 'done'; compares: number; moves: number };

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다.
 *
 * 눈길도 표식도 값도 자리를 옮기는 조각이라 출발 자리가 꼭 필요하다. 그것을
 * `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 어느 자리에서
 * 어느 자리로 갔는지를 `reduce` 가 앞 장면에서 읽어 여기 싣는다.
 */
export type SelectMinEachPassStep =
  /** 표식이 아래에서 올라와 첫 자리에 앉는다. */
  | { kind: 'mark'; at: number }
  /** 눈길이 한 칸 걸어가 표식과 견준다. `smaller` 면 잇는 선이 남고, 아니면 걷힌다. */
  | { kind: 'scan'; from: number; to: number; smaller: boolean }
  /** 표식만 새 자리로 건너간다. 값은 그대로다. */
  | { kind: 'hop'; from: number; to: number }
  /** 훑는 장치가 물러난다. 값을 옮길 자리가 여기서 비워진다. */
  | { kind: 'endScan'; from: number }
  /** 비로소 한 번. 표식이 가리킨 값과 맨 앞 값이 자리를 맞바꾼다. */
  | { kind: 'move'; from: number; to: number }
  /** 남은 자국을 하나씩 세어 본다 — 견줌이 몇 번이었나. */
  | { kind: 'tally' };

export type SelectMinEachPassScene = {
  /**
   * 처음 늘어선 값. `rewind` 가 여기로 돌아오고, 칸 수와 폭도 여기 길이가 정한다.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly origin: readonly number[];
  /** 자리마다 지금 앉아 있는 값. 훑는 동안에는 `origin` 과 같다. */
  readonly values: readonly number[];
  /** 표식이 가리키는 자리. 아직 놓이지 않았으면 `null`. */
  readonly best: number | null;
  /** 표식이 답을 내놓고 손을 뗐나. 뗀 뒤에는 "어디서 나왔나" 만 남긴다. */
  readonly retired: boolean;
  /** 눈길이 선 자리. 훑기가 끝나면 `null` — 장치가 물러난 것이다. */
  readonly eye: number | null;
  /** 지금 견주고 있는 자리. **지나가는 강조**라 다음 걸음에 옮겨 간다. */
  readonly looking: number | null;
  /**
   * 훑어 본 자리들. 위 레일에 자국으로 남는 **머무는 강조**다.
   *
   * 길이가 곧 견줌 횟수다 — 캡션의 `compares` 를 여기서 센다. 화면에 뜨는 수와
   * 화면의 구조가 같은 출처라야 갈리지 않는다.
   */
  readonly scanned: readonly number[];
  /** 그 자국들 중 표식이 건너온 자리. 길이가 곧 표식 이동 횟수다. */
  readonly hopAt: readonly number[];
  /** 맨 앞으로 옮겨져 확정된 자리. **머무는 강조**다. */
  readonly settled: number | null;
  readonly step: SelectMinEachPassStep | null;
  readonly caption: SelectMinEachPassCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `values` · `scanned` · `best` 를 여기 넣지 않는다. 그것들은 걸음이 고치는
 * 자취라, 바탕으로 묶어 되감기에 넘기면 되감은 화면이 자국을 단 채로 서고 그
 * 위에 algorithm 이 처음부터 다시 밟는다. 타입으로 좁혀 구조적으로 못 넘어가게
 * 하고, 부르는 쪽은 **객체 리터럴**로 넘긴다 — 변수로 넘기면 초과 속성 검사가
 * 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 */
type SelectMinEachPassBase = Pick<SelectMinEachPassScene, 'origin'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: SelectMinEachPassBase): SelectMinEachPassScene {
  return {
    origin: base.origin,
    values: [...base.origin],
    best: null,
    retired: false,
    eye: null,
    looking: null,
    scanned: [],
    hopAt: [],
    settled: null,
    step: null,
    caption: null,
  };
}

/** 그 자리에 앉은 값. 자리가 칸 밖이면 `null`. */
function valueAt(scene: SelectMinEachPassScene, index: number): number | null {
  const v = scene.values[index];
  return typeof v === 'number' ? v : null;
}

/** 걸음이 가리키는 한 자리. 식별자 파싱은 `toIndexArray` 를 경유한다 (원칙 4). */
function targetIndex(event: FacetRuntimeEvent): number | null {
  const i = toIndexArray(event.target)[0];
  return typeof i === 'number' ? i : null;
}

export const selectMinEachPassScene: ScenePlan<SelectMinEachPassScene> = {
  /**
   * 첫 장면은 처음 늘어선 값들이다.
   *
   * 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만 **참조로
   * 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한 벌이라,
   * 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): SelectMinEachPassScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const origin = Array.isArray(raw.values)
      ? raw.values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      : [];
    return atStart({ origin });
  },

  reduce(
    scene: SelectMinEachPassScene,
    event: FacetRuntimeEvent,
  ): SelectMinEachPassScene {
    switch (event.type) {
      // 후보 표식을 첫 자리에 놓는다. 눈길도 거기서 출발한다. 아직 아무것도
      // 견주지 않았으므로 `looking` 은 비어 있다.
      case 'mark-init': {
        const at = targetIndex(event);
        if (at === null || valueAt(scene, at) === null) return scene;
        return {
          ...scene,
          best: at,
          eye: at,
          looking: null,
          step: { kind: 'mark', at },
          caption: { kind: 'remember' },
        };
      }

      // 눈길이 한 칸 옮겨 가 표식이 쥔 값과 견준다. 값은 건드리지 않는다.
      //
      // `smaller` 는 두 값이 다 장면에 있으므로 여기서 센다 — 걸음이 실어 오면
      // 화면에 뜨는 판정과 화면의 구조가 다른 출처가 된다. 한 번 세어 걸음과
      // 캡션이 같은 값을 쓴다.
      case 'scan-step': {
        const at = targetIndex(event);
        if (at === null || scene.best === null) return scene;
        const value = valueAt(scene, at);
        const best = valueAt(scene, scene.best);
        if (value === null || best === null) return scene;
        const smaller = value < best;
        const from = scene.eye === null ? at : scene.eye;
        return {
          ...scene,
          eye: at,
          looking: at,
          scanned: [...scene.scanned, at],
          step: { kind: 'scan', from, to: at, smaller },
          caption: { kind: 'compare', value, best, smaller },
        };
      }

      // 더 작았으므로 표식만 새 자리로 건너간다. 건너온 자리의 자국이 굵어진다.
      case 'mark-hop': {
        const to = targetIndex(event);
        if (to === null || scene.best === null) return scene;
        const value = valueAt(scene, to);
        if (value === null) return scene;
        return {
          ...scene,
          best: to,
          hopAt: [...scene.hopAt, to],
          step: { kind: 'hop', from: scene.best, to },
          caption: { kind: 'hop', value },
        };
      }

      // 훑기가 끝났다. 훑는 장치가 물러나 값을 옮길 자리를 비운다.
      // 자국은 지우지 않는다 — 그것이 "여기까지 보았다" 는 이 조각의 주장이다.
      case 'scan-end': {
        const from = scene.eye;
        if (from === null) return scene;
        return {
          ...scene,
          eye: null,
          looking: null,
          step: { kind: 'endScan', from },
          caption: {
            kind: 'scanEnd',
            compares: scene.scanned.length,
            hops: scene.hopAt.length,
          },
        };
      }

      // 비로소 한 번. 표식이 가리킨 값과 맨 앞 값이 자리를 맞바꾼다.
      // 표식은 답을 내놓았으므로 손을 떼고, 어디서 나왔는지만 남긴다.
      case 'value-move': {
        const from = scene.best;
        if (from === null || from === 0) return scene;
        const moving = valueAt(scene, from);
        const displaced = valueAt(scene, 0);
        if (moving === null || displaced === null) return scene;
        const values = scene.values.slice();
        values[0] = moving;
        values[from] = displaced;
        return {
          ...scene,
          values,
          retired: true,
          looking: null,
          settled: 0,
          step: { kind: 'move', from, to: 0 },
          caption: { kind: 'move' },
        };
      }

      // 한 바퀴의 셈. 화면에 남은 자국 수가 곧 견줌 수이고, 옮겨진 자리가
      // 있었나가 곧 이동 수다 — 둘 다 구조에서 나온다.
      case 'done':
        return {
          ...scene,
          looking: null,
          step: { kind: 'tally' },
          caption: {
            kind: 'done',
            compares: scene.scanned.length,
            moves: scene.settled === null ? 0 : 1,
          },
        };

      case 'rewind':
        return atStart({ origin: scene.origin });

      default:
        // 이 facet 의 algorithm 은 위 일곱만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
