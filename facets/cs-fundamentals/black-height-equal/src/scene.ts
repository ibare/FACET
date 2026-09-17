/**
 * BlackHeightEqual 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드(`visitStep` ·
 * `settlePath` · `settleAll` · `rewind`)를 부르지 않고 그저 다음 장면을 돌려준다는
 * 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (S-scene).
 *
 * ── 이 조각의 주장이 어디에 있었나
 *
 * 이 조각이 말하는 것은 **네 길의 검은 수가 같다** 는 것이다. 그런데 옮기기 전
 * 그 네 수는 화면에만 있었다 — `settlePath` 가 `badgesG` 에 `<g>` 를 하나씩
 * 덧붙인 것이 유일한 기록이고, 그것을 셈하는 자리가 코드 어디에도 없었다.
 * 되짚으면 덧붙인 것들이 사라져 **주장 자체가 사라졌다.** 이제 `settled` 가 말한다.
 *
 * ── 숨어 있던 상태 넷
 *
 * - **길들이 남긴 셈** — 위의 `badgesG` 자식들. 이제 `settled`. 어느 nil 곁에
 *   어느 수가 앉았는지를 장면이 쥔다. **남는다 — 정적 그리기에 반드시 들어간다.**
 * - **커서가 어디 있나** — `cursorG.style.transform` 과 `style.opacity` 에만 있었다.
 *   `let` 도 `Set.has` 도 아니고 **DOM 속성**이라 어느 grep 에도 안 걸린다.
 *   숨어 있나 · 뿌리로 돌아왔나 · 길을 밟는 중인가 셋이 한 자리에 뭉쳐 있었고,
 *   `returnCursorToRoot` 라는 "역명령" 이 그 셋을 오갔다. 이제 `cursorAt`.
 * - **지금 세는 길** — `cursorRing` 의 `stroke`/`stroke-dasharray` 가 "이 자리가
 *   셈에 들었나" 를 말했지만 **그 자리 하나뿐**이었다. 길을 몇 자리 내려왔고 그중
 *   몇이 검었는지는 어디에도 없었다 — payload 의 `runningCount` 를 캡션 문자열로
 *   찍고 버렸다. 이제 `trail` 이 길 전체를 쥔다.
 * - **뿌리의 id** — stage 의 `let rootId`. 되감기가 커서를 되돌릴 자리를 알려고
 *   `init` 때 붙들어 둔 것이다. 이제 `root.id` 에서 곧바로 나온다.
 *
 * ── 바탕(색)과 지나가는 것(셈)을 한 필드로 뭉치지 않는다
 *
 * 마디가 빨강인지 검정인지는 **나무의 성질**이라 걸음이 바꾸지 않는다 (`root`).
 * "지금 이 자리를 세며 지나간다" 는 **길의 일**이라 길이 맺히면 거둔다 (`trail`).
 * 둘을 한 필드에 담으면 되감았을 때 색까지 함께 지워지거나, 색을 남기려다 지난
 * 길의 커서가 함께 남는다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 화면에는 셈이 둘 나란히 뜬다 — 캡션의 "지금까지 {n}" 과 nil 곁의 배지. 발신은
 * 그 수를 `runningCount` · `blackCount` 로 실어 오지만 장면은 **그것을 담지 않는다.**
 * 둘 다 `trail` 의 검은 자리를 세어 나온다 (`countBlack`). 한 출처에서 나오므로
 * 화면이 스스로 참이다 — 배지와 캡션이 갈릴 수가 없다.
 *
 * 마지막 매듭(`all-settled`)의 수도 마찬가지로 `settled` 에서 읽는다. 그 수가 곧
 * "어느 길로 가도 같은 값" 이므로, 만약 한 길이 달랐다면 그 배지가 캡션과 눈에
 * 띄게 어긋나 화면이 스스로 그것을 말한다.
 *
 * 좌표는 담지 않는다 — 나무의 모양이 자리를 정하므로 그리는 쪽이 캔버스에서
 * 셈한다 (S-piece). 문안도 담지 않고 무엇을 말할지만 담는다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type BlackHeightSceneColor = 'red' | 'black';

/**
 * 나무의 마디. **걸음이 고치지 않는 바탕**이다.
 *
 * 자식을 재귀로 안는다 — 자리를 정하는 것이 이 모양이기 때문이다. 좌표는 담지
 * 않고 그리는 쪽이 이 모양에서 셈한다.
 */
export type BlackHeightSceneNode = {
  id: string;
  value: number;
  color: BlackHeightSceneColor;
  left: BlackHeightSceneNode | null;
  right: BlackHeightSceneNode | null;
};

/**
 * 지금 세며 내려가는 길의 한 자리. **지나가는 것**이라 길이 맺히면 거둔다.
 *
 * `counted` 는 algorithm 이 그 자리에서 내린 판정이다 (검정이거나 nil 이면 참).
 * 마디의 색이 아니다 — 색은 `root` 가 쥐고 여기는 "셈에 들었나" 만 쥔다.
 */
export type BlackHeightTrailStep = {
  id: string;
  kind: 'node' | 'nil';
  counted: boolean;
};

/**
 * 다 내려간 길 하나가 남긴 셈. **머무는 것**이라 정적 그리기에 반드시 들어간다.
 *
 * `blackCount` 는 발신이 실어 온 수가 아니라 그 길의 `trail` 을 세어 굳힌 값이다.
 */
export type SettledPath = {
  /** 길이 맺힌 nil 자리. 배지가 그 곁에 앉는다. */
  nilId: string;
  blackCount: number;
};

/** 커서가 어디 있나. 자리는 `trail` 과 `root` 가 말하므로 여기엔 형편만 담는다. */
export type BlackHeightCursor =
  /** 아직 아무 길도 밟지 않았다 — 뿌리 위에 숨는다. */
  | 'hidden'
  /** 길 하나를 맺고 뿌리로 돌아왔다. */
  | 'root'
  /** 길을 밟는 중 — 그 자리는 `trail` 의 마지막이 말한다. */
  | 'walking';

/** 캡션이 말할 것. 문안도 수도 담지 않는다 — 수는 장면에서 센다 (C10). */
export type BlackHeightCaption = {
  kind: 'visit' | 'settled' | 'allSettled' | 'rewind';
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데만** 쓴다.
 *
 * 흐름의 출발 자리는 여기 싣지 않는다 — `walk` 는 `trail` 의 바로 앞 자리에서,
 * `settle` 은 방금 맺은 `settled` 의 nil 에서 출발한다. 둘 다 장면이 말하므로
 * `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type BlackHeightStep = {
  kind: 'walk' | 'settle' | 'emphasize';
};

export type BlackHeightEqualScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 레드-블랙 트리. 마디의 색도 여기 있다. */
  root: BlackHeightSceneNode | null;

  // ── 걸어온 자취.
  /** 지금 세며 내려가는 길. 길이 맺히면 비워진다. */
  trail: readonly BlackHeightTrailStep[];
  /** 다 내려간 길들이 남긴 셈. 이 조각의 주장 그 자체다. */
  settled: readonly SettledPath[];
  cursorAt: BlackHeightCursor;
  /** 네 길이 다 같은 수임을 매듭지었나. 배지의 테두리가 여기서 나온다. */
  allSettled: boolean;

  caption: BlackHeightCaption | null;
  step: BlackHeightStep | null;
};

/**
 * 걸음이 **고치지 않는** 것만 추린 바탕.
 *
 * `trail` · `settled` · `cursorAt` · `allSettled` 는 여기 들지 않는다 — 들면
 * 되감은 화면이 이미 걸어온 배지를 단 채로 서고 그 위에 algorithm 이 다시 밟는
 * 걸음이 겹쳐, 화면 안에서 두 셈이 어긋난다 (프로토콜 4 절).
 */
type BlackHeightBase = Pick<BlackHeightEqualScene, 'root'>;

/** 아무 길도 밟지 않은 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: BlackHeightBase): BlackHeightEqualScene {
  return {
    root: base.root,
    trail: [],
    settled: [],
    cursorAt: 'hidden',
    allSettled: false,
    caption: null,
    step: null,
  };
}

/**
 * 길의 검은 자리를 센다. 화면에 뜨는 모든 수가 이 함수 하나에서 나온다.
 *
 * stage 도 이것을 불러 캡션을 만든다 — 같은 규칙을 두 번 구현하면 "화면이 스스로
 * 참" 이라는 주장의 근거가 절반이 된다.
 */
export function countBlack(trail: readonly BlackHeightTrailStep[]): number {
  let n = 0;
  for (const s of trail) if (s.counted) n += 1;
  return n;
}

/** 같은 nil 에 두 번 맺히면 덮어쓴다. 앞 장면을 제자리에서 고치지 않는다 (S-scene). */
function withSettled(list: readonly SettledPath[], path: SettledPath): readonly SettledPath[] {
  const i = list.findIndex((p) => p.nilId === path.nilId);
  if (i < 0) return [...list, path];
  return list.map((p, j) => (j === i ? path : p));
}

/**
 * 나무를 재귀로 좁혀 **값을 베껴 담는다** (C9).
 *
 * 참조로 쥐지 않는 것이 요점이다 — 러너가 주는 것은 mechanism 과 view 가 함께
 * 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readNode(raw: unknown): BlackHeightSceneNode | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const n = raw as Record<string, unknown>;
  if (typeof n.id !== 'string') return null;
  if (typeof n.value !== 'number' || !Number.isFinite(n.value)) return null;
  if (n.color !== 'red' && n.color !== 'black') return null;
  return {
    id: n.id,
    value: n.value,
    color: n.color,
    left: readNode(n.left),
    right: readNode(n.right),
  };
}

export const blackHeightEqualScene: ScenePlan<BlackHeightEqualScene> = {
  /**
   * 첫 장면은 나무만 선 화면이다. 커서는 뿌리 위에 숨어 있다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 발신이 없으므로 선언에서 읽는다.
   */
  initial(initialData: unknown): BlackHeightEqualScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌 타입이
    // 아무것도 막지 못한다 (프로토콜 4 절).
    return atStart({ root: readNode(d.root) });
  },

  reduce(scene: BlackHeightEqualScene, event: FacetRuntimeEvent): BlackHeightEqualScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      // 커서가 한 자리 내려간다. 길이 한 자리 길어진다.
      //
      // 발신이 실어 온 `runningCount` 는 담지 않는다 — 길에서 세면 되는 수를
      // 한 번 더 담으면 언젠가 갈린다.
      case 'walk-step': {
        if (typeof p.id !== 'string') return scene;
        if (p.kind !== 'node' && p.kind !== 'nil') return scene;
        if (typeof p.counted !== 'boolean') return scene;
        return {
          ...scene,
          trail: [...scene.trail, { id: p.id, kind: p.kind, counted: p.counted }],
          cursorAt: 'walking',
          caption: { kind: 'visit' },
          step: { kind: 'walk' },
        };
      }

      // 길 하나가 맺힌다. 그 길의 검은 수를 nil 곁에 남기고 길을 거둔다.
      //
      // 맺힌 자리도 셈도 `trail` 에서 나온다 — 발신의 `nilId` · `blackCount` 를
      // 쓰면 길과 배지가 각자 다른 출처를 갖게 된다.
      case 'path-settled': {
        const last = scene.trail[scene.trail.length - 1];
        if (!last || last.kind !== 'nil') return scene;
        return {
          ...scene,
          trail: [],
          settled: withSettled(scene.settled, {
            nilId: last.id,
            blackCount: countBlack(scene.trail),
          }),
          cursorAt: 'root',
          caption: { kind: 'settled' },
          step: { kind: 'settle' },
        };
      }

      // 네 길을 다 돌았다. 남은 배지가 전부 같은 수라는 것을 매듭짓는다 —
      // 배지의 테두리로 **남는** 강조라 정적 그리기에도 들어간다 (S-scene PREFER).
      case 'all-settled':
        return {
          ...scene,
          allSettled: true,
          caption: { kind: 'allSettled' },
          step: { kind: 'emphasize' },
        };

      // 처음으로 되감는다. 바탕(나무)만 넘기고 걸어온 자취는 선언에서 다시 셈한다.
      // 커서만 뿌리에 세워 둔다 — "뿌리로 돌아왔다" 가 이 걸음이 하는 말이다.
      case 'rewind':
        return {
          ...atStart({ root: scene.root }),
          cursorAt: 'root',
          caption: { kind: 'rewind' },
        };

      default:
        // 이 facet 의 algorithm 은 위 넷만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
