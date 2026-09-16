/**
 * halveTheRange 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 축
 *
 * **지금 구간이 어디부터 어디까지인가.** 그 폭이 곧 남은 후보의 수이고, 걸음마다
 * 그 폭이 반으로 줄어드는 것이 이 조각의 주장이다. 그러므로 `span` 이 이 장면의
 * 중심이고 나머지는 거기서 파생되거나 거기에 쌓인다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 stage 의 `let` 은 열둘이었는데 절반이 **그리기의 표시값**(`bandX` ·
 * `bandW` · `caretX` · `cellW` · `originX` · `n`)이었고, 뜻을 쥔 것은 다음 넷이었다.
 *
 * - **`let bandX` · `let bandW`** — 화면의 띠 좌표. 이 조각의 축인 **지금 구간**이
 *   여기에만 있었다. 논리 값이 아니라 픽셀이라 홀짝이나 셈으로 되짚을 수 없고,
 *   `collapse` 가 `const fromX = bandX` 로 그것을 **출발값으로 되읽었다** — 되감아
 *   세운 직후에는 옛 화면의 좌표라 띠가 엉뚱한 데서 출발한다. 이제 `span` 이 자리
 *   번호로 말하고 출발 자리는 `step.from` 이 실어 온다 (S-scene — `prev` 는 고르는
 *   데만).
 * - **`const sunk: boolean[]`** — **어느 자리가 후보에서 빠졌나**. `const` 라 `let`
 *   grep 을 통과하는데 `narrow()` 가 `sunk[i] = true` 로 제자리에서 고쳤다
 *   (프로토콜 3-1 의 ⑤). 여기서는 `sweeps` 가 그것을 **무리째** 말한다 — 아래를 보라.
 * - **`chipsG` 의 자식들** — **몇 번 반으로 줄었고 그때마다 몇이 빠졌나.** 이 조각의
 *   결론이 코드 어디에도 없고 DOM 에만 쌓이고 있었다. `addChip` 이 붙이기만 하고
 *   지우는 것은 `hardReset` 뿐이라 "명령이 남긴 누적" 의 전형이었고, 장면으로 옮기며
 *   지워 버리면 **화면이 말하던 것이 통째로 줄어드는** 자리다 (프로토콜 4절).
 *   그래서 `sweeps` 를 일부러 장면에 올린다.
 * - **`let caretShown` · `let probeIdx` · `let foundIdx`** — 짚은 자리와 그 형편.
 *   `caretShown` 은 좌표가 아니라 **논증의 단계**("아직 한 번도 안 짚었다")를 말하는
 *   깃발이었다. 이제 `probes` 의 길이가 그것까지 함께 말한다.
 *
 * ── 화면에 나란히 뜨는 수는 한 자로 잰다
 *
 * 걸음이 실어 오던 `lo` · `hi` · `index` · `value` · `removed` · `swept` ·
 * `remaining` · `comparisons` · `initialRemaining` 을 전부 걷어냈다.
 *
 * - **남은 후보 수**는 구간의 폭이다 (`remainingOf`).
 * - **걷힌 자리와 그 개수**는 지금 구간과 가운데와 판정에서 나온다.
 * - **견줌 횟수**는 `probe` 발신 수다 — `probes.length`.
 * - **처음 후보 수**는 줄의 길이다.
 * - **가운데 자리**만은 구조에서 셀 수 없고 **바탕 + 순수 함수**로 나온다. 그것은
 *   algorithm 이 내주는 `midOf` 를 여기서 부른다 (프로토콜 4절 B 갈래). payload 로
 *   받으면 다음 사람이 집어 쓸 문이 열린 채로 남고, 양쪽이 각자 `Math.floor` 를
 *   셈하면 폭이 짝수일 때 갈린다.
 *
 * 남는 것은 **걸음이 내리는 판정** 하나뿐이다 — `narrow` 의 `cmp`. 어느 쪽 절반이
 * 걷히는지는 값을 견주어 봐야 아는 것이라 구조에서 셀 수 없다.
 *
 * 좌표는 담지 않는다. 자리 번호가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { midOf } from './algorithm.js';

/** 살아 있는 구간. 좌표가 아니라 자리 번호다 (S-piece). */
export type HalveTheRangeSpan = {
  readonly lo: number;
  readonly hi: number;
};

/**
 * 한 번의 견줌으로 후보에서 걷힌 무리.
 *
 * **이 목록이 이 조각의 결론이다.** 걸음마다 지우면 "몇 번 반으로 줄었나" 가 화면에
 * 남지 않는다. 다 끝나 정지한 그림에서도 무리가 그대로 서 있어야 셀 수 있다.
 */
export type HalveTheRangeSweep = {
  /** 이번에 빠진 자리들. 오름차순. `found` 에서는 찾은 자리를 사이에 두고 갈린다. */
  readonly slots: readonly number[];
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 그림**도
 * 여기서 셈한다.
 *
 * 정적 그리기가 정본이라 띠도 커서도 이미 끝 자리에 서 있다. 흐르게 하려면 출발
 * 자리를 알아야 하는데 그것을 `prev` 에서 꺼내거나 화면을 되읽으면 S-scene 위반이다
 * (옮기기 전 `collapse` 가 `const fromX = bandX` 로 정확히 그 짓을 했다). 그래서
 * 출발 자리를 걸음이 자리 번호로 실어 온다.
 */
export type HalveTheRangeStep =
  /** 구간이 처음 선다. 바깥에서 줄 위로 좁혀 들어온다 — 이 조각의 동사 그대로. */
  | { kind: 'open'; to: HalveTheRangeSpan }
  /** 커서가 가운데로 간다. `from` 이 `null` 이면 처음 짚는 자리다. */
  | { kind: 'probe'; from: number | null; to: number }
  /** 구간이 좁아지고, 걷힌 무리가 자취 선반으로 내려앉는다. */
  | { kind: 'collapse'; from: HalveTheRangeSpan; to: HalveTheRangeSpan; swept: readonly number[] }
  /** 끝. 걷힌 무리들을 훑어 셈을 매듭짓는다. */
  | { kind: 'tally' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type HalveTheRangeCaption =
  | { kind: 'start'; n: number; target: number }
  | { kind: 'probe'; left: number; mid: number }
  | { kind: 'narrow'; mid: number; rel: 'lt' | 'gt'; target: number; swept: number; left: number }
  | { kind: 'found'; mid: number; target: number; swept: number; left: number }
  | { kind: 'done'; comparisons: number; n: number; left: number };

export type HalveTheRangeScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /**
   * 줄이 선 값.
   *
   * 모든 장면이 같은 배열을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly values: readonly number[];
  /** 찾는 값. 캡션이 견줌을 말할 때 한 항으로 쓰인다. */
  readonly target: number;

  // ── 걸어온 자취.
  /** 지금 살아 있는 구간. 아직 안 섰으면 `null` 이고 그때는 띠를 그리지 않는다. */
  readonly span: HalveTheRangeSpan | null;
  /**
   * 짚어 본 자리들. 차례대로 쌓인다.
   *
   * **길이가 곧 견줌 횟수**라 그 수가 한 자리에만 있다. 마지막 것이 지금 짚고 있는
   * 자리이므로 "아직 한 번도 안 짚었다" 는 깃발도 따로 두지 않는다.
   */
  readonly probes: readonly number[];
  /** 찾은 자리. 없으면 `null`. **채움**이 여기서 갈린다. */
  readonly found: number | null;
  /** 걷힌 무리들. 걸음마다 하나씩 쌓이고 지워지지 않는다. */
  readonly sweeps: readonly HalveTheRangeSweep[];
  /** 다 끝났다. */
  readonly finished: boolean;
  readonly step: HalveTheRangeStep | null;
  readonly caption: HalveTheRangeCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `span` · `probes` · `sweeps` 를 여기 넣지 않는다. 전부 걸어오며 쌓은 자취라,
 * 바탕으로 묶어 되감기에 넘기면 되감은 화면이 이미 다 좁혀진 띠와 내려앉은 자리를
 * 단 채로 서고 그 위에 algorithm 이 처음부터 다시 밟는다. 타입으로 좁혀 두어
 * 구조적으로 못 넘어가게 한다 (프로토콜 4절).
 */
type HalveTheRangeBase = Pick<HalveTheRangeScene, 'values' | 'target'>;

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function numbersOf(raw: unknown): number[] {
  return Array.isArray(raw)
    ? raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
}

/** a..b 의 자리 번호를 편다. */
function slots(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i += 1) out.push(i);
  return out;
}

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: HalveTheRangeBase): HalveTheRangeScene {
  return {
    values: base.values,
    target: base.target,
    span: null,
    probes: [],
    found: null,
    sweeps: [],
    finished: false,
    step: null,
    caption: null,
  };
}

/**
 * 지금 남은 후보 수.
 *
 * **구간의 폭이 곧 그 수다.** 띠 위의 라벨도 캡션의 `left` 도 전부 이 함수를
 * 지난다 — 두 자리에서 세면 언젠가 갈린다.
 */
export function remainingOf(span: HalveTheRangeSpan | null): number {
  if (span === null) return 0;
  return Math.max(0, span.hi - span.lo + 1);
}

/**
 * 어느 자리가 후보에서 빠졌나 — 걷힌 무리들을 합쳐 자리마다 참/거짓으로 편다.
 *
 * 구간 밖인지로 가릴 수도 있지만 그러면 `found` 걸음에서 찾은 자리 양옆이 한꺼번에
 * 구간 밖이 되어 **어느 무리가 언제 빠졌는지**가 사라진다. 누적이 곧 결론이라
 * 무리 목록에서 편다.
 */
export function sunkSlots(scene: HalveTheRangeScene): boolean[] {
  const out = new Array<boolean>(scene.values.length).fill(false);
  for (const sweep of scene.sweeps) {
    for (const i of sweep.slots) if (i >= 0 && i < out.length) out[i] = true;
  }
  return out;
}

export const halveTheRangeScene: ScenePlan<HalveTheRangeScene> = {
  /**
   * 첫 장면은 줄만 선 화면이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이다. 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
   * 아래 `filter` 가 새 배열을 만든다.
   */
  initial(initialData: unknown): HalveTheRangeScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const target = raw.target;
    return atStart({
      values: numbersOf(raw.values),
      target: typeof target === 'number' && Number.isFinite(target) ? target : 0,
    });
  },

  reduce(scene: HalveTheRangeScene, event: FacetRuntimeEvent): HalveTheRangeScene {
    switch (event.type) {
      // 구간이 선다. 줄 전체가 후보라 실어 올 것이 없다.
      case 'range-set': {
        const hi = scene.values.length - 1;
        if (hi < 0) return scene;
        const to: HalveTheRangeSpan = { lo: 0, hi };
        return {
          ...scene,
          span: to,
          step: { kind: 'open', to },
          caption: { kind: 'start', n: scene.values.length, target: scene.target },
        };
      }

      // 가운데를 짚는다. 어느 자리인지는 지금 구간과 `midOf` 가 정한다 —
      // algorithm 과 같은 함수를 부르므로 잣대가 갈리지 않는다.
      case 'probe': {
        const span = scene.span;
        if (span === null) return scene;
        const mid = midOf(span.lo, span.hi);
        const value = scene.values[mid];
        if (typeof value !== 'number') return scene;
        const last = scene.probes.length > 0 ? scene.probes[scene.probes.length - 1] : null;
        return {
          ...scene,
          probes: [...scene.probes, mid],
          step: { kind: 'probe', from: last, to: mid },
          caption: { kind: 'probe', left: remainingOf(span), mid: value },
        };
      }

      // 견줌 결과로 한쪽 절반이 통째로 걷힌다. 판정만 실어 오고 나머지는 여기서 센다.
      case 'narrow': {
        const span = scene.span;
        if (span === null) return scene;
        const raw = (event.payload ?? {}) as { cmp?: unknown };
        const rel = raw.cmp === 'lt' ? 'lt' : raw.cmp === 'gt' ? 'gt' : null;
        if (rel === null) return scene;
        const mid = midOf(span.lo, span.hi);
        const value = scene.values[mid];
        if (typeof value !== 'number') return scene;
        // 가운데가 작으면 왼쪽 절반과 가운데가, 크면 가운데와 오른쪽 절반이 걷힌다.
        const swept = rel === 'lt' ? slots(span.lo, mid) : slots(mid, span.hi);
        const to: HalveTheRangeSpan =
          rel === 'lt' ? { lo: mid + 1, hi: span.hi } : { lo: span.lo, hi: mid - 1 };
        return {
          ...scene,
          span: to,
          sweeps: [...scene.sweeps, { slots: swept }],
          step: { kind: 'collapse', from: span, to, swept },
          caption: {
            kind: 'narrow',
            mid: value,
            rel,
            target: scene.target,
            swept: swept.length,
            left: remainingOf(to),
          },
        };
      }

      // 가운데가 찾던 값이었다. 구간이 그 한 자리로 접히고 양옆의 남은 후보도 빠진다.
      case 'found': {
        const span = scene.span;
        if (span === null) return scene;
        const mid = midOf(span.lo, span.hi);
        const value = scene.values[mid];
        if (typeof value !== 'number') return scene;
        const swept = slots(span.lo, span.hi).filter((i) => i !== mid);
        const to: HalveTheRangeSpan = { lo: mid, hi: mid };
        return {
          ...scene,
          span: to,
          found: mid,
          sweeps: swept.length > 0 ? [...scene.sweeps, { slots: swept }] : scene.sweeps,
          step: { kind: 'collapse', from: span, to, swept },
          caption: {
            kind: 'found',
            mid: value,
            target: scene.target,
            swept: swept.length,
            left: remainingOf(to),
          },
        };
      }

      // 끝. 견줌 횟수는 짚은 자리의 수이고 처음 후보 수는 줄의 길이다.
      case 'done':
        return {
          ...scene,
          finished: true,
          step: { kind: 'tally' },
          caption: {
            kind: 'done',
            comparisons: scene.probes.length,
            n: scene.values.length,
            left: remainingOf(scene.span),
          },
        };

      case 'rewind':
        // 바탕만 넘긴다. 객체 리터럴로 넘겨야 초과 속성 검사가 돌아 자취가 섞여
        // 들어가는 것을 타입이 막는다 (프로토콜 4절).
        return atStart({ values: scene.values, target: scene.target });

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
