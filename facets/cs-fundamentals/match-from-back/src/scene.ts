/**
 * matchFromBack 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **얼마나 적게 보고 물러났나.** 뒤에서 한 글자만 견주고 자리 하나가 통째로 날아가는
 * 것이 이 조각의 알맹이다. 그러니 화면이 반드시 쥐고 있어야 하는 것은 **자리마다
 * 몇 글자를 짚어 보았나** 이고, 그것은 지나가는 깜빡임이 아니라 **남는 자국**이라
 * 정적 그리기에도 들어간다 (S-scene).
 *
 * 옮기기 전에는 그 자국이 없었다. 한 자리를 떠날 때 `clearLook()` 이 짚은 자취와
 * 안 읽은 표시를 통째로 지워, 다 끝난 화면에는 "어느 자리에서 몇 글자만 보고
 * 물러났나" 가 남지 않았다. 되짚기 이전에 이미 주장이 안 보였던 것이다.
 * 이제 `attempts` 가 그것을 말하고, 그리는 쪽이 자리마다 자국 한 줄을 세운다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 이 하나도 없었고 stage 에도 넷뿐이었다 — **화면이 통째로
 * 상태였다는 뜻이다.**
 *
 * - **`type CellKind = 'idle' | 'comparing' | …`** — 선언만 있고 **저장되는 곳이
 *   어디에도 없었다.** 칸의 형편은 `rect` 의 `fill`·`stroke`·`stroke-dasharray`
 *   안에만 있었다. 이제 `attempts` 와 바탕 글자에서 셈해 나온다.
 * - **`const ticks = new Map<number, SVGRectElement>()`** — 열쇠가 곧 "이 글자를
 *   읽었나" 였다. **DOM 손잡이와 이 조각의 결론이 한 표에** 묶여 있었고,
 *   `dropUnread()` 가 `ticks.has(i)` 로 갈라 한 번도 안 본 글자를 정했다. 화면이
 *   제 칠을 도로 읽어 결론을 셈한 자리다. 이제 `lookedOf()` 가 자취에서 센다.
 * - **`let slabX` · `let slabY` · `let probeX`** — 화면의 지금 자리를 따로 적어 둔
 *   **거울**이고, 운동의 **출발값**이 거기서 나왔다 (`const fromX = slabX`).
 *   `getAttribute` 도 `textContent` 도 안 쓰니 되읽기 grep 을 통과하지만 병은
 *   같다 — 되짚어 세운 직후에는 그 거울이 옛 화면의 것이라 슬래브가 엉뚱한
 *   자리에서 출발한다. 이제 `step.from` 이 계기값을 싣는다.
 * - **패턴 칸 `<g>` 의 `transform`** — 좌표가 아니라 **단계**를 말했다. 짚어서
 *   들렸나(`translate(0 -6)`) 내려앉았나가 거기에만 있었다. 이제 짚은 횟수와
 *   바탕 글자에서 나온다.
 * - **글 칸 `<g>` 의 `transform`** — 끝내 안 본 글자가 내려앉았나. 이제 `tallied`
 *   와 `lookedOf()` 가 말한다.
 * - **`trail` 의 `x2` 속성** — 이 자리에서 **어디까지 거슬러 왔나**. 이 조각이
 *   세는 수가 좌표 문자열 안에만 있었다. 이제 `attempts[k].probed` 다.
 *
 * ── 걸음이 싣고 오던 수를 걷어냈다
 *
 * `shift` · `patIndex` · `matched` · `tailMatched` · `unread` · `comparisons` ·
 * `never` 일곱이 payload 로 왔는데 하나도 남김없이 구조나 바탕에서 나온다.
 * 자리는 차례가 정하고(`shifts[attempts.length]`), 짚는 자리는 뒤에서부터라 짚은
 * 횟수가 정하고(`m - 1 - k`), 같더냐 다르더냐는 바탕 두 글자를 견주면 나오고,
 * 견줌 횟수와 안 본 글자 수는 자취에서 센다. 그래서 여섯 발신의 payload 가 전부
 * 비었다.
 *
 * 좌표는 담지 않는다. 글자 수가 폭을 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 한 자리에서 견준 일.
 *
 * `probed` 가 이 조각의 요점이다 — **몇 글자를 짚어 보았나.** 뒤에서부터라 짚은
 * 자리는 `pattern.length - 1 - k` 로 풀리므로 수 하나면 자취가 통째로 복원된다.
 */
export type MatchAttempt = {
  /** 패턴을 맞춰 놓은 자리. `shifts` 의 그 자리 값이다. */
  readonly shift: number;
  /** 짚어 본 횟수. 오른쪽 끝에서 왼쪽으로 하나씩 쌓인다. */
  readonly probed: number;
  /** 결말. 아직 짚는 중이면 `null`. */
  readonly verdict: 'rejected' | 'found' | null;
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 자리**도
 * 여기서 말한다.
 *
 * 슬래브와 표지가 둘 다 자리를 옮기는 조각이라 출발 자리가 꼭 필요하다. 그것을
 * `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), 어디서
 * 왔는지를 `reduce` 가 앞 장면에서 읽어 여기 싣는다.
 */
export type MatchStep =
  /** 패턴이 그 자리로 미끄러진다. `from` 이 `null` 이면 아직 아무 자리도 안 밟았다. */
  | { kind: 'land'; from: number | null }
  /** 표지가 한 칸 왼쪽으로 옮겨 가 짚는다. `from` 이 `null` 이면 슬래브 오른쪽 끝에서 출발한다. */
  | { kind: 'probe'; from: number | null }
  /** 어긋났다 — 자리가 한 번 꿀렁하고 자국이 아래에 남는다. */
  | { kind: 'reject' }
  /** 뒤에서부터 전부 맞았다 — 슬래브가 글에 붙는다. */
  | { kind: 'found' }
  /** 한 번도 안 본 글자가 줄에서 내려앉는다. */
  | { kind: 'tally' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type MatchCaption =
  | { kind: 'land'; shift: number }
  | { kind: 'killedAtOnce'; unread: number }
  | { kind: 'brokeAfterTail'; matched: number }
  | { kind: 'found'; shift: number }
  | { kind: 'tally'; comparisons: number; never: number };

export type MatchFromBackScene = {
  /** 훑을 글. **바탕** — 걸음이 고치지 않는다. */
  readonly text: string;
  /** 찾을 패턴. 바탕. */
  readonly pattern: string;
  /**
   * 밟아 볼 자리들. 바탕이고, **길이가 곧 자국 줄 수**라 캔버스 세로도 여기서 난다.
   *
   * 어느 자리를 보일지는 저작 결정이라 선언에 있다 (algorithm 의 주석을 보라).
   * 걸음이 그 값을 도로 실어 오면 같은 물음에 답이 둘 생긴다.
   */
  readonly shifts: readonly number[];
  /** 지금까지 밟은 자리들. 마지막이 슬래브가 서 있는 자리다. */
  readonly attempts: readonly MatchAttempt[];
  /** 셈을 마쳤나. 안 본 글자가 줄에서 내려앉는 **남는 표식**이다. */
  readonly tallied: boolean;
  readonly step: MatchStep | null;
  readonly caption: MatchCaption | null;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `attempts` 와 `tallied` 를 여기 넣지 않는다. 그것은 걸어온 자취라, 바탕으로 묶어
 * 되감기에 넘기면 되감은 화면이 자국을 단 채로 서고 그 위에 algorithm 이 처음부터
 * 다시 밟는다. 타입으로 좁혀 구조적으로 못 넘어가게 하고, 부르는 쪽은 **객체
 * 리터럴**로 넘긴다 — 변수로 넘기면 초과 속성 검사가 돌지 않아 좁힌 타입이
 * 아무것도 막지 못한다.
 */
type MatchBase = Pick<MatchFromBackScene, 'text' | 'pattern' | 'shifts'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: MatchBase): MatchFromBackScene {
  return {
    text: base.text,
    pattern: base.pattern,
    shifts: base.shifts,
    attempts: [],
    tallied: false,
    step: null,
    caption: null,
  };
}

/** 슬래브가 서 있는 자리. 아직 하나도 안 밟았으면 `null`. */
export function currentAttempt(scene: MatchFromBackScene): MatchAttempt | null {
  return scene.attempts[scene.attempts.length - 1] ?? null;
}

/**
 * `k` 번째로 짚은 패턴 칸.
 *
 * **뒤에서부터**가 이 조각의 이름이라 차례가 곧 자리다. 걸음이 `patIndex` 를 실어
 * 오면 같은 규칙이 두 곳에 적힌다.
 */
export function probedIndex(k: number, patternLength: number): number {
  return patternLength - 1 - k;
}

/**
 * 이 자리에서 **아직 손대지 않은** 패턴 칸의 수. 곧 왼쪽 끝 자리이기도 하다.
 *
 * 짚은 것이 `[m - probed, m - 1]` 이므로 앞의 `m - probed` 칸은 읽히지 않았다.
 */
export function unreadFront(attempt: MatchAttempt, patternLength: number): number {
  return Math.max(0, patternLength - attempt.probed);
}

/** 이 자리에서 그 패턴 칸을 짚어 보았나. */
export function wasProbed(
  attempt: MatchAttempt,
  patIndex: number,
  patternLength: number,
): boolean {
  return patIndex >= unreadFront(attempt, patternLength);
}

/**
 * 그 패턴 칸의 글자가 그 자리의 글자와 같더냐.
 *
 * 바탕 두 글자를 견주면 나오는 술어라 걸음이 실어 오지 않는다. 이 함수만 떼어 내도
 * "뒤에서부터 견주다 어긋나면 멈춘다" 는 주장은 그대로 남는다 — 멈출지 말지는
 * algorithm 이 정하고 발신으로 말한다.
 */
export function sameAt(scene: MatchFromBackScene, shift: number, patIndex: number): boolean {
  return scene.pattern[patIndex] === scene.text[shift + patIndex];
}

/**
 * 한 번이라도 읽은 글의 자리들.
 *
 * 눈금도 이것으로 서고 마지막에 내려앉는 글자도 이것으로 갈린다 — 화면과 결론이
 * 한 자료를 쓴다.
 */
export function lookedOf(scene: MatchFromBackScene): Set<number> {
  const m = scene.pattern.length;
  const seen = new Set<number>();
  for (const attempt of scene.attempts) {
    for (let k = 0; k < attempt.probed; k += 1) {
      seen.add(attempt.shift + probedIndex(k, m));
    }
  }
  return seen;
}

/** 견준 횟수. 자국의 길이를 다 더한 것이다. */
export function comparisonsOf(scene: MatchFromBackScene): number {
  let total = 0;
  for (const attempt of scene.attempts) total += attempt.probed;
  return total;
}

/** 한 번도 안 본 글자 수. 줄에서 내려앉는 칸의 수와 같은 셈이다. */
export function neverOf(scene: MatchFromBackScene): number {
  return Math.max(0, scene.text.length - lookedOf(scene).size);
}

/**
 * 마지막 자리만 갈아 낀 새 목록. **앞 장면의 배열을 제자리에서 고치지 않는다** —
 * 고치면 과거가 함께 바뀐다 (S-scene).
 */
function replaceLast(
  attempts: readonly MatchAttempt[],
  attempt: MatchAttempt,
): readonly MatchAttempt[] {
  return [...attempts.slice(0, -1), attempt];
}

export const matchFromBackScene: ScenePlan<MatchFromBackScene> = {
  /**
   * 첫 장면은 아직 아무 자리도 안 밟은 화면이다.
   *
   * 바탕을 실어 오는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만 **참조로 쥐지
   * 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한 벌이라, 참조를
   * 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene). 아래 `filter`
   * 가 새 배열을 만들고 글자는 값이라 복사가 필요 없다.
   */
  initial(initialData: unknown): MatchFromBackScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string => (typeof v === 'string' ? v : '');
    const shifts = Array.isArray(raw.shifts)
      ? raw.shifts.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
      : [];
    return atStart({ text: str(raw.text), pattern: str(raw.pattern), shifts });
  },

  reduce(scene: MatchFromBackScene, event: FacetRuntimeEvent): MatchFromBackScene {
    switch (event.type) {
      /**
       * 패턴이 다음 자리에 내려앉는다.
       *
       * 어느 자리인지는 **차례가 정한다** — 이번이 몇 번째 자리인가는 발신이 오는
       * 순서가 이미 말하고(`attempts.length`), 그 자리의 값은 바탕에 있다.
       */
      case 'land': {
        const shift = scene.shifts[scene.attempts.length];
        if (typeof shift !== 'number') return scene;
        const before = currentAttempt(scene);
        return {
          ...scene,
          attempts: [...scene.attempts, { shift, probed: 0, verdict: null }],
          step: { kind: 'land', from: before === null ? null : before.shift },
          caption: { kind: 'land', shift },
        };
      }

      /**
       * 표지가 한 칸 왼쪽으로 옮겨 가 짚는다.
       *
       * 같더냐 다르더냐는 여기서 적어 두지 않는다 — 바탕 두 글자를 견주면 나오므로
       * 장면에 적으면 같은 물음에 답이 둘 남는다 (`sameAt`). 캡션도 바꾸지 않는다.
       * "맞춰 놓은 자리 N" 이 그 자리 내내 서 있어야 하기 때문이다.
       */
      case 'probe': {
        const attempt = currentAttempt(scene);
        if (attempt === null || attempt.verdict !== null) return scene;
        if (attempt.probed >= scene.pattern.length) return scene;
        return {
          ...scene,
          attempts: replaceLast(scene.attempts, { ...attempt, probed: attempt.probed + 1 }),
          // 직전에 짚은 자리. 처음이면 슬래브 오른쪽 끝에서 출발한다.
          step: {
            kind: 'probe',
            from: attempt.probed === 0 ? null : scene.pattern.length - attempt.probed,
          },
          caption: scene.caption,
        };
      }

      /**
       * 어긋났다 — 이 자리가 통째로 날아간다.
       *
       * 뒤에서 한 번 만에 끝난 자리와 네 글자 맞다가 어긋난 자리는 같은 사실을 다르게
       * 말해야 한다. 어느 쪽인지는 짚은 횟수가 정한다.
       */
      case 'reject': {
        const attempt = currentAttempt(scene);
        if (attempt === null || attempt.verdict !== null || attempt.probed === 0) return scene;
        const tailMatched = attempt.probed - 1;
        return {
          ...scene,
          attempts: replaceLast(scene.attempts, { ...attempt, verdict: 'rejected' }),
          step: { kind: 'reject' },
          caption:
            tailMatched === 0
              ? { kind: 'killedAtOnce', unread: unreadFront(attempt, scene.pattern.length) }
              : { kind: 'brokeAfterTail', matched: tailMatched },
        };
      }

      // 뒤에서부터 전부 맞았다. 슬래브가 그 자리에 붙어 **남는다**.
      case 'found': {
        const attempt = currentAttempt(scene);
        if (attempt === null || attempt.verdict !== null) return scene;
        return {
          ...scene,
          attempts: replaceLast(scene.attempts, { ...attempt, verdict: 'found' }),
          step: { kind: 'found' },
          caption: { kind: 'found', shift: attempt.shift },
        };
      }

      /**
       * 셈을 말한다. 두 수 다 **자국에서 센다** — 캡션의 수와 줄에서 내려앉는 칸이
       * 같은 자료를 쓰므로 갈릴 자리가 없다.
       */
      case 'done':
        return {
          ...scene,
          tallied: true,
          step: { kind: 'tally' },
          caption: {
            kind: 'tally',
            comparisons: comparisonsOf(scene),
            never: neverOf(scene),
          },
        };

      case 'rewind':
        // 바탕은 글과 패턴과 밟을 자리들뿐이다. 걸어온 자국은 여기서 비워진다.
        return atStart({ text: scene.text, pattern: scene.pattern, shifts: scene.shifts });

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
