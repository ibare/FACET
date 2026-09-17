/**
 * UnrepresentableFraction 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 이 조각의 주장은 **"같은 나머지가 다시 나온다"** 이다. 그러려면 지나온 나머지가
 * 전부 화면에 남아 있어야 하는데, 옛 stage 는 그것을 자료로 들고 있지 않았다.
 *
 * - `const tiles = new Map<number, TileRef>()` — **어느 자리에 어떤 나머지가 앉았나.**
 *   이 조각의 알맹이인데 `TileRef = { group, frame, label }` 로 DOM 손잡이와 한
 *   객체였고, 나머지 값 자체는 `label.textContent` 에만 있었다. `let` 도 아니고
 *   `new Map` 한 줄이라 어느 grep 에도 안 걸린다. 이제 `slots` 가 그것이다 —
 *   **차례가 곧 자리 번호**다.
 * - `const digitNodes: SVGTextElement[]` — **뽑혀 나온 2진 자리 열 그 자체**가 SVG
 *   text 노드 배열로만 있었다. `const` 인데 `digitNodes.length = keep` 으로
 *   제자리에서 잘린다. 이제 `digits` 다.
 * - `let cursor` — 토큰이 선 자리. **algorithm 의 `at` 과 두 벌**이었다. 되돌아오는
 *   걸음에서 algorithm 은 `at` 을 옮기고 stage 는 `cursor` 를 그대로 두어 둘이
 *   갈렸고, `lap` 이 그 `cursor` 를 **운동의 출발값**으로 삼았다 (화면의 거울을
 *   되읽는 자리 — 프로토콜 4 절). 이제 `at` 하나다.
 * - `let cycleFrom` · `let cycleTo` — 고리의 두 끝. 토큰이 다음에 어느 자리로 갈지가
 *   여기서 갈렸다. 이제 `loop` 이다.
 * - `let tail` · `let rule` — `null` 인지 아닌지가 "꼬리가 잘렸나" · "되풀이 밑줄이
 *   섰나" 를 말했다. 이제 `cut` 과 `loop` 에서 파생한다.
 * - `TileRef.frame` 의 `stroke` 1.5/3 — **한 속성에 두 뜻**이었다. 되돌아온 자리를
 *   짚는 표식을 값이 앉았다는 칠과 같은 축에 실어, 되짚어 세우면 어느 쪽도
 *   복원되지 않았다.
 *
 * ── 어떤 수를 싣고 어떤 수를 셈하나 (프로토콜 4 절)
 *
 * | 무엇 | 어디서 |
 * | --- | --- |
 * | 어느 자리에서 어느 자리로 갔나 · 고리의 두 끝 · 몇 번째 바퀴인가 · 한 바퀴에 몇 자리 | 장면이 센다 |
 * | 10진 표기 (`fractionDecimalText`) · 그릇이 담은 전개 (`float32Expansion`) | algorithm 이 내주고 장면이 부른다 |
 * | 떼어 낸 자리와 남은 값 (`digit` · `rest`) | **싣는다** |
 *
 * 가운데 줄에 경계가 있다. 두 함수 모두 **재거나 옮겨 적는** 일이라 떼어 내도
 * "2 를 곱해 자리를 뽑으면 되풀이한다" 는 말이 그대로 남는다. 게다가 옛 걸음이
 * 싣던 `keep` · `flipAt` · `flipTo` 는 **그릇 선이 서는 자리와 올림되는 자리를 띠에
 * 쌓인 자리들과 다른 출처**로 만들고 있었다 — 이제 `flipIndexOf` 가 자취와 그릇의
 * 전개를 왼쪽부터 견주어 세므로 한 출처다.
 *
 * 반대로 `digit = ⌊rest·2 / den⌋` 과 `rest' = rest·2 − digit·den` 은 **이 조각의
 * 알고리즘 그 자체**다. 내주면 장면이 그 점화를 되풀이하고 발신이 장식이 된다.
 * 그래서 그 둘만 싣는다 (`bottom-up-table` 의 피보나치 점화식이 그 자리였다).
 *
 * 좌표는 담지 않는다. 자리 번호와 자리 수라는 **구조**만 담고 타일 폭도 칸 폭도
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece).
 *
 * 문안도 담지 않는다. `step` 이 무엇을 말할지만 말하고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { float32Expansion } from './algorithm.js';

/** 고리의 두 끝. `from` 에서 `to` 로 되돌아온다. */
export type FractionLoop = { from: number; to: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `from` 은 운동이 출발하는 자리다. `prev` 에서 꺼내면 위반이라 장면이 계기값으로
 * 싣는다 (S-scene — `step.from` 관용구).
 */
export type UnrepresentableFractionStep =
  | { kind: 'seed' }
  | { kind: 'peel'; from: number; to: number; fresh: boolean }
  | { kind: 'close'; from: number; to: number }
  | { kind: 'lap'; from: number; count: number }
  | { kind: 'cut' }
  | { kind: 'done' };

export type UnrepresentableFractionScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 뽑아낼 분수의 분자. */
  numerator: number;
  /** 분모. */
  denominator: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /**
   * 자리마다 앉은 남은 값(분자). **차례가 곧 자리 번호**다.
   *
   * 같은 분자가 두 번 나올 수 없으므로 `indexOf` 가 곧 "그 값이 앞에 어디서
   * 나왔나" 이고, 그것이 이 조각의 되풀이 판정이다. 옛 화면은 이 값을
   * 타일 글자에만 두고 있었다.
   */
  slots: readonly number[];
  /** 토큰이 선 자리. 되돌아오는 걸음에는 머물고, 고리를 닫는 걸음에 옮겨 간다. */
  at: number;
  /** 지금 남은 값의 분자. */
  rest: number;
  /** 뽑혀 나온 2진 자리들. 차례가 곧 소수점 아래 몇째 자리인가다. */
  digits: readonly number[];
  /** 고리가 닫혔으면 그 두 끝. 아직이면 `null`. */
  loop: FractionLoop | null;
  /** 고리를 몇 바퀴 돌았나. 한 걸음에 도는 바퀴 수가 이 수로 정해진다. */
  laps: number;
  /** 그릇이 찼다 — 넘은 자리가 잘려 나갔다. */
  cut: boolean;
  /** 마무리 걸음까지 왔나. */
  done: boolean;

  step: UnrepresentableFractionStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `slots` · `digits` · `loop` 은 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은
 * 화면이 다 뽑힌 자리를 단 채로 서고 그 위에 algorithm 이 처음부터 다시 뽑는 자리가
 * 겹친다 (프로토콜 4 절 14 번).
 */
type FractionBase = Pick<UnrepresentableFractionScene, 'numerator' | 'denominator'>;

/**
 * 아무것도 뽑히지 않은 처음 화면. 빈 자리와 빈 띠만 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (프로토콜 4 절 15 번).
 */
function atStart(base: FractionBase): UnrepresentableFractionScene {
  return {
    numerator: base.numerator,
    denominator: base.denominator,
    slots: [],
    at: 0,
    rest: base.numerator,
    digits: [],
    loop: null,
    laps: 0,
    cut: false,
    done: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function int(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : fallback;
}

// ── 화면에 나란히 뜨는 수는 전부 아래를 지난다 ────────────────────────────────

/**
 * 그릇(float32)이 실제로 담은 2진 전개.
 *
 * 걸음이 `keep` 을 실어 오던 자리다. 그릇 선이 서는 자리도, 올림으로 바뀌는 자리도
 * 전부 여기서 나온다 — 화면의 띠와 한 자료를 쓴다.
 */
export function vesselDigits(scene: UnrepresentableFractionScene): readonly number[] {
  const den = scene.denominator === 0 ? 1 : scene.denominator;
  const bits = float32Expansion(scene.numerator / den);
  const out: number[] = [];
  for (const ch of bits) out.push(ch === '1' ? 1 : 0);
  return out;
}

/** 그릇이 담는 자리 수. */
export function keepOf(scene: UnrepresentableFractionScene): number {
  return vesselDigits(scene).length;
}

/**
 * 올림으로 값이 바뀌는 자리 (1 부터). 바뀌는 자리가 없으면 0.
 *
 * **자취와 그릇의 전개를 왼쪽부터 견주어 센다.** 걸음이 `flipAt` 을 상수처럼 실어
 * 오던 자리라, 지금은 띠에 쌓인 자리와 같은 자료에서 그 수가 나온다
 * (프로토콜 4 절 10 번).
 */
export function flipIndexOf(scene: UnrepresentableFractionScene): number {
  const vessel = vesselDigits(scene);
  for (let i = 0; i < vessel.length; i += 1) {
    if (scene.digits[i] === undefined) return 0;
    if (scene.digits[i] !== vessel[i]) return i + 1;
  }
  return 0;
}

/**
 * 되풀이되는 자리 묶음.
 *
 * 고리의 두 끝이 자리 번호를 말하고, 그 자리에서 뽑힌 자리들이 곧 무늬다 —
 * `digits` 의 차례가 자리 번호와 나란하기 때문이다 (자리 `i` 에 서서 뽑은 것이
 * `digits[i]`).
 */
export function patternOf(scene: UnrepresentableFractionScene): readonly number[] {
  const loop = scene.loop;
  if (loop === null) return [];
  return scene.digits.slice(loop.to, loop.from + 1);
}

/**
 * 띠의 `i` 번째 자리에 실제로 뜨는 값.
 *
 * 잘린 뒤에는 올림된 자리 하나가 그릇이 담은 값으로 바뀐다. 그 갈림을 여기 한
 * 자리에만 두어 정적 그리기와 캡션이 같은 답을 본다.
 */
export function digitAt(scene: UnrepresentableFractionScene, i: number): number | undefined {
  if (scene.cut) {
    const flip = flipIndexOf(scene);
    if (flip > 0 && i === flip - 1) return vesselDigits(scene)[i];
  }
  return scene.digits[i];
}

/** 고리가 있을 때 자리 `i` 다음에 오는 자리. 고리의 끝에서는 처음으로 되돌아간다. */
export function nextSlot(i: number, loop: FractionLoop | null): number {
  if (loop !== null && i === loop.from) return loop.to;
  return i + 1;
}

export const unrepresentableFractionScene: ScenePlan<UnrepresentableFractionScene> = {
  /**
   * 첫 장면은 바탕만 안다 — 분수는 저작 선언이 정하므로 띠 왼쪽의 `1/10 = 0.` 이
   * 첫 화면부터 서 있어야 한다. 넘겨받은 객체를 쥐지 않고 **값만 복사해** 온다
   * (S-scene).
   */
  initial(initialData: unknown): UnrepresentableFractionScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const den = int(d.denominator, 10);
    return atStart({
      numerator: Math.max(0, int(d.numerator, 1)),
      denominator: den === 0 ? 10 : den,
    });
  },

  reduce(
    scene: UnrepresentableFractionScene,
    event: FacetRuntimeEvent,
  ): UnrepresentableFractionScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 첫 남은 값이 첫 자리에 놓인다. 그 값은 분자가 이미 말한다.
      case 'seed':
        return {
          ...scene,
          slots: [scene.numerator],
          at: 0,
          rest: scene.numerator,
          step: { kind: 'seed' },
        };

      /*
       * 자리 하나를 뽑는다.
       *
       * 실려 오는 것은 떼어 낸 자리와 남은 값뿐이다. **그 남은 값이 앞에 어디서
       * 나왔나**는 장면이 제 표에서 찾는다 — 그것이 이 조각의 되풀이 판정이고,
       * 걸음이 `to` 를 실어 오면 같은 판정이 두 곳에 적힌다.
       *
       * 되돌아온 걸음에는 토큰을 옮기지 않는다. 되돌아가는 운동은 고리를 닫는
       * 다음 걸음이 맡는다 — 옛 화면이 `cursor` 를 그대로 두던 것과 같되, 이제
       * algorithm 쪽에 두 벌째 커서가 없다.
       */
      case 'peel': {
        const digit = int(p.digit, -1);
        const rest = int(p.rest, -1);
        if (digit < 0 || rest < 0 || scene.slots.length === 0) return scene;
        const known = scene.slots.indexOf(rest);
        const fresh = known < 0;
        const to = fresh ? scene.slots.length : known;
        return {
          ...scene,
          slots: fresh ? [...scene.slots, rest] : scene.slots,
          at: fresh ? to : scene.at,
          rest,
          digits: [...scene.digits, digit],
          step: { kind: 'peel', from: scene.at, to, fresh },
        };
      }

      // 고리가 닫힌다. 두 끝은 표에서 찾고 토큰이 되돌아간다.
      case 'repeat-found': {
        const to = scene.slots.indexOf(scene.rest);
        if (to < 0) return scene;
        const from = scene.at;
        return { ...scene, at: to, loop: { from, to }, step: { kind: 'close', from, to } };
      }

      /*
       * 고리를 다시 돈다.
       *
       * 이번 걸음에 몇 자리가 나오나는 **몇 번째 바퀴인가**로 정해지고, 그것은
       * 발신이 쌓인 수라 장면이 센다 (프로토콜 4 절 "몇 번째 걸음인가는 늘 장면이").
       * 무늬 자체도 자취에서 나오므로 "되풀이된다" 는 결론이 화면에 쌓인 자리와
       * 같은 자료를 쓴다.
       */
      case 'lap': {
        const pattern = patternOf(scene);
        if (pattern.length === 0) return scene;
        const laps = scene.laps + 1;
        const chunk: number[] = [];
        for (let i = 0; i < laps; i += 1) for (const d of pattern) chunk.push(d);
        let at = scene.at;
        for (let i = 0; i < chunk.length; i += 1) at = nextSlot(at, scene.loop);
        return {
          ...scene,
          laps,
          at,
          digits: [...scene.digits, ...chunk],
          step: { kind: 'lap', from: scene.at, count: chunk.length },
        };
      }

      // 그릇이 찼다. 어디서 잘리는지는 `keepOf` 가, 어느 자리가 바뀌는지는
      // `flipIndexOf` 가 자취와 견주어 잰다.
      case 'cut':
        return { ...scene, cut: true, step: { kind: 'cut' } };

      case 'done':
        return { ...scene, done: true, step: { kind: 'done' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ numerator: scene.numerator, denominator: scene.denominator });

      default:
        // 이 algorithm 이 발신하는 것은 위 일곱이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
