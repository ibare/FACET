/**
 * naiveShiftByOne 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 무엇을 쥐어야 하나
 *
 * 이 조각의 주장은 **버려지는 것**이다 — 네 글자나 맞히고도 어긋나는 순간 그것을
 * 통째로 버리고 한 칸만 민다. 그러니 "지금 어디를 견주고 있나" 만으로는 모자라고
 * **자리마다 몇 번을 헛짚었는지가 끝까지 남아야** 한다. 명령 방식의 stage 는
 * `clearMarks()` 로 그것을 걸음마다 지우고 있었고, 그래서 완주 화면에 헛수고가
 * 한 톨도 남지 않았다 — 조각의 결론이 화면에서 사라져 있었던 자리다.
 *
 * 그래서 장면은 **시도(attempt)의 목록**을 쥔다. 자리 하나가 시도 하나이고, 그
 * 시도가 앞에서부터 몇 글자를 견뎠고 어떻게 끝났는지를 낱낱이 적는다. 배열 인덱스가
 * 곧 밀린 칸 수이고, 시도 안의 인덱스가 곧 패턴 안의 자리다.
 *
 * ── 여기서 세는 것 · 걸음이 싣는 것
 *
 * 몇 칸 밀렸나(`shift`) · 몇 번째 글자인가(`offset`) · 여태 맞힌 글자 수(`matched`) ·
 * 견준 횟수(`comparisons`) 는 전부 이 구조에서 세진다. 걸음이 실어 오면 같은 물음에
 * 답이 둘이 되므로 받지 않고, algorithm 의 발신에서도 걷어냈다.
 *
 * 싣는 것은 `hit` 하나다. 글자 하나를 견준 결과는 **걸음이 내리는 판정**이고, 그것을
 * 장면이 다시 셈하면 (`text[shift + offset] === pattern[offset]`) 장면이 이 조각의
 * 알고리즘을 통째로 되풀이하는 꼴이 되어 발신이 장식이 된다.
 *
 * 좌표는 담지 않는다 — 글자 수와 칸 수가 자리를 정하므로 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 한 자리에서 앞에서부터 견준 자취.
 *
 * `probes` 의 길이가 곧 그 자리에서 견준 횟수이고, 인덱스가 곧 패턴 안의 자리다.
 * 어긋나는 순간 멈추므로 거짓은 늘 맨 끝에 하나뿐이다.
 */
export type ShiftAttempt = {
  /** 앞에서부터 한 글자씩 견준 결과. */
  probes: boolean[];
  /** 이 자리가 어떻게 끝났나. 아직 견주는 중이면 `null`. */
  outcome: 'found' | 'dropped' | null;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type NaiveShiftCaption =
  | { kind: 'align'; shift: number }
  | { kind: 'retreat'; matched: number }
  | { kind: 'retreatNone' }
  | { kind: 'found'; shift: number }
  | { kind: 'done'; comparisons: number };

/**
 * 방금 밟은 걸음. 지나가는 것이라 **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 계기값을 따로 싣지 않는다 — 출발 그림(앞 자리 · 앞 커서 자리 · 앞 띠 폭)이 전부
 * `attempts` 에서 셈으로 나오므로, `prev` 도 `step` 의 짐도 필요가 없다.
 */
export type NaiveShiftStep = { kind: 'align' | 'compare' | 'retreat' | 'found' | 'done' };

export type NaiveShiftByOneScene = {
  /** 패턴을 찾아 넣을 텍스트. 걸음이 고치지 않는 바탕이다. */
  text: string;
  /** 찾을 패턴. 걸음이 고치지 않는 바탕이다. */
  pattern: string;
  /** 자리 0 부터 차례로. **배열 인덱스가 곧 밀린 칸 수다.** */
  attempts: ShiftAttempt[];
  /** 더 밀 자리가 없다. 견줄 것이 없으니 커서를 거둔다. */
  finished: boolean;
  step: NaiveShiftStep | null;
  caption: NaiveShiftCaption | null;
};

/**
 * 걸음이 고치지 않는 것만 묶은 바탕.
 *
 * `attempts` · `finished` 는 걸음이 쌓는 자취라 여기 들지 않는다. 되감기가 바탕만
 * 넘겨받고 나머지를 다시 셈하게 해 두면 지나온 자취가 되감은 화면에 남지 않는다.
 */
type Base = Pick<NaiveShiftByOneScene, 'text' | 'pattern'>;

/**
 * 바탕만 남은 첫 화면.
 *
 * 호출부는 **객체 리터럴**로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아
 * 좁힌 타입이 아무것도 막지 못한다.
 */
function atStart(base: Base): NaiveShiftByOneScene {
  return {
    text: base.text,
    pattern: base.pattern,
    attempts: [],
    finished: false,
    step: null,
    caption: null,
  };
}

/** 지금까지 맞힌 글자 수. 어긋나면 거기서 멈추므로 앞에서부터 이어진 참의 수다. */
export function matchedOf(attempt: ShiftAttempt): number {
  let count = 0;
  for (const hit of attempt.probes) {
    if (!hit) break;
    count += 1;
  }
  return count;
}

/** 처음부터 여기까지 견준 횟수. 짚은 자리 목록의 길이를 다 더한 것이다. */
export function comparisonsOf(attempts: readonly ShiftAttempt[]): number {
  let total = 0;
  for (const attempt of attempts) total += attempt.probes.length;
  return total;
}

/**
 * 마지막 시도를 갈아 끼운 새 목록.
 *
 * 앞 장면의 배열을 제자리에서 고치지 않는다 — 되짚기는 지나온 장면들을 그대로 다시
 * 쓰므로, 고치면 과거가 함께 바뀐다 (S-scene).
 */
function withLast(attempts: ShiftAttempt[], attempt: ShiftAttempt): ShiftAttempt[] {
  const next = attempts.slice();
  next[next.length - 1] = attempt;
  return next;
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export const naiveShiftByOneScene: ScenePlan<NaiveShiftByOneScene> = {
  /**
   * 텍스트와 패턴은 여기서 좁힌다.
   *
   * 둘 다 문자열이라 값으로 복사된다 — 러너가 주는 객체를 참조로 쥐면 되짚을 때
   * 이미 다 굴러간 자료로 바탕을 그리게 되지만, 그 위험이 여기에는 없다 (S-scene).
   */
  initial(initialData: unknown): NaiveShiftByOneScene {
    const d = (
      typeof initialData === 'object' && initialData !== null ? initialData : {}
    ) as Record<string, unknown>;
    return atStart({ text: str(d.text), pattern: str(d.pattern) });
  },

  reduce(scene: NaiveShiftByOneScene, event: FacetRuntimeEvent): NaiveShiftByOneScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    const last = scene.attempts[scene.attempts.length - 1];

    switch (event.type) {
      // 자리를 하나 더 잡는다. 몇 칸 밀렸는지는 목록의 길이가 말한다.
      case 'align':
        return {
          ...scene,
          attempts: [...scene.attempts, { probes: [], outcome: null }],
          step: { kind: 'align' },
          caption: { kind: 'align', shift: scene.attempts.length },
        };

      // 한 글자를 견줬다. 몇 번째 글자인지는 그 자리의 짚은 목록 길이가 말한다.
      case 'compare': {
        // 자리를 잡지 않은 채로 견줄 수는 없다. 조용히 흘린다 (C2).
        if (!last || last.outcome !== null) return scene;
        return {
          ...scene,
          attempts: withLast(scene.attempts, {
            probes: [...last.probes, p.hit === true],
            outcome: null,
          }),
          step: { kind: 'compare' },
        };
      }

      // 어긋나서 도로 물러난다. 버리게 된 글자 수는 이 자리의 자취가 말한다.
      case 'retreat': {
        if (!last || last.outcome !== null) return scene;
        const matched = matchedOf(last);
        return {
          ...scene,
          attempts: withLast(scene.attempts, { probes: last.probes, outcome: 'dropped' }),
          step: { kind: 'retreat' },
          caption: matched === 0 ? { kind: 'retreatNone' } : { kind: 'retreat', matched },
        };
      }

      // 통째로 맞았다. 여기서 멈추지 않고 남은 자리도 마저 훑는다.
      case 'found': {
        if (!last || last.outcome !== null) return scene;
        return {
          ...scene,
          attempts: withLast(scene.attempts, { probes: last.probes, outcome: 'found' }),
          step: { kind: 'found' },
          caption: { kind: 'found', shift: scene.attempts.length - 1 },
        };
      }

      // 더 밀 자리가 없다. 견준 횟수는 화면에 선 자취를 그대로 센 값이다.
      case 'done':
        return {
          ...scene,
          finished: true,
          step: { kind: 'done' },
          caption: { kind: 'done', comparisons: comparisonsOf(scene.attempts) },
        };

      // 자취만 걷고 바탕은 남긴다.
      case 'rewind':
        return atStart({ text: scene.text, pattern: scene.pattern });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
