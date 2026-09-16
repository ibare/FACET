/**
 * WalkPerCharacter 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **몇 글자를 걸어 어디까지 왔고, 거기서 어떻게 끝났나.** 그러니 화면이 반드시
 * 쥐고 있어야 하는 것은 **걸어온 자취**다. 뿌리에서 지금 선 자리까지 밟아 온 노드
 * 들이고, 그것이 곧 "몇 글자를 확인했나" 이기도 하다. 남는 강조이므로 정적
 * 그리기에도 들어간다 — 빠뜨리면 되짚었을 때 주장이 통째로 사라진다 (S-scene).
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 이 조각의 상태는 **어느 `let` 에도 없었다.** stage 의 `let` 은
 * `colors` 와 `positions` 뿐이고 둘 다 배치 밑감이다. 화면이 아는 것은 전부 칠과
 * 속성 안에만 있었다.
 *
 * - **걸어온 자취** — `setNodeVisual(fromId, 'onPath')` 가 노드의 `fill` 을,
 *   `setEdgeVisual(fromId, toId, true)` 가 가지의 `stroke` 를 칠했다. "어디까지
 *   내려왔나" 가 그 두 칠에만 남았다. 이제 `path` 가 말한다.
 * - **커서 자리** — 링 하나의 `cx` · `cy` · `opacity` 속성에만 있었다. 이제
 *   `path` 의 끝(비었으면 뿌리)에서 나온다 — 따로 담지 않는다.
 * - **몇 글자를 걸었나** — `counterText` 의 `textContent` 에만 있었고, 그 값은
 *   payload 가 실어 온 `charIndex + 1` 이었다. **같은 수를 두 자리에서 세던
 *   자리다.** 이제 `path.length` 하나에서 낸다 — 화면에 뜨는 수와 칠해진 칸이 한
 *   출처여야 한다.
 * - **답이 난 자리와 그 종류** — `type NodeVisual` 은 선언만 있고 값이 어디에도
 *   저장되지 않았다. 노드의 `fill` 에만 쓰였고, 되감으면 `resetVisuals()` 없이도
 *   그냥 사라졌다. 이제 `outcome` 이 말한다.
 * - **막힌 글자 딱지** — `badgeG` 의 자식 유무와 그 `textContent` 에만 있었다.
 *   이제 `outcome.blockedChar`.
 * - **지금 무엇을 몇 번째로 찾는가** — projector 가 payload 로 지어 넘긴 캡션
 *   **문자열** 안에만 있었다. stage 는 문자열만 쥐어 되짚을 근거가 없었다. 이제
 *   `query`.
 * - **트라이 뼈대** — `init(words)` 한 번으로 DOM 에만 들어갔다. `init` 이 사라진
 *   자리라 캔버스 세로도 정적 그리기가 매번 다시 정해야 한다. 이제 `words`.
 *
 * 좌표는 담지 않는다. 담긴 말과 밟아 온 노드 id 라는 **구조**만 담고 자리는 그리는
 * 쪽이 셈한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 뿌리 노드의 id. algorithm 과 stage 가 같은 규칙을 쓴다 (접두사 문자열). */
export const WALK_ROOT_ID = 'root';

/** 걸음이 끝난 세 결말. 화면에서 셋이 서로 다른 색으로 갈린다. */
export type WalkVerdict = 'found' | 'no-word' | 'blocked';

/** 지금 찾는 말과 그 차례. 캡션의 인자는 전부 여기서 나온다. */
export type WalkQuery = { text: string; index: number; total: number };

/**
 * 답이 난 자리의 형편.
 *
 * **어느 노드에서 났는지는 담지 않는다** — 셋 다 마지막으로 내려간 노드, 곧
 * `path` 의 끝이다. 담아 두면 같은 자리를 두 곳에서 세는 꼴이 된다.
 */
export type WalkOutcome = {
  verdict: WalkVerdict;
  /** `verdict === 'blocked'` 일 때 없던 가지의 글자. 그 외에는 `null`. */
  blockedChar: string | null;
};

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**다 (C10).
 *
 * 인자를 따로 싣지 않는다 — 말할 거리가 전부 장면의 다른 필드에 이미 있고,
 * 한 번 더 실으면 화면에 나란히 뜨는 두 수가 갈릴 여지가 생긴다. 내려간 글자는
 * 그 노드에 새겨진 글자를 그대로 읽어 쓴다.
 */
export type WalkCaption =
  | { kind: 'searchBegin' }
  | { kind: 'stepDown' }
  | { kind: 'found' }
  | { kind: 'noWord' }
  | { kind: 'blocked' };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `down` 이 `from` 을 싣는 까닭 — 커서가 미끄러지는 운동은 **떠나온 노드에서
 * 출발**하는데, 그것을 `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다
 * (S-scene). 닿는 자리는 `path` 의 끝이라 싣지 않는다.
 */
export type WalkStep =
  | { kind: 'begin' }
  | { kind: 'down'; from: string }
  | { kind: 'settle' };

export type WalkPerCharacterScene = {
  /** 트라이에 담긴 말들. 바탕 — 걸음이 바꾸지 않는다. 뼈대가 여기서 나온다. */
  words: string[];
  /** 지금 찾는 말. 아직 아무 찾기도 시작하지 않았으면 `null`. */
  query: WalkQuery | null;
  /**
   * 뿌리에서 지금 선 자리까지 밟아 온 노드 id. 뿌리는 들어 있지 않다.
   *
   * 이 조각의 주장 그 자체다. **남는 강조**라 정적 그리기에도 들어가고,
   * 길이가 곧 "몇 글자를 확인했나" 라 화면의 셈도 여기 하나에서 낸다.
   */
  path: string[];
  /** 답이 난 형편. 아직 걷는 중이면 `null` — 커서 링이 그때만 선다. */
  outcome: WalkOutcome | null;
  step: WalkStep | null;
  caption: WalkCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면과 새 찾기가 함께 쓴다.
 *
 * **`path` 와 `outcome` 을 여기 넣지 않는다.** 걸어온 자취는 바탕이 아니다. 넣어
 * 두면 되감은 화면이 이미 다 걸어간 길을 칠한 채로 서고 그 위에 algorithm 이
 * 처음부터 다시 내려가므로, 화면 안에서 두 이야기가 어긋난다 (S-scene).
 */
type WalkBase = Pick<WalkPerCharacterScene, 'words'>;

/**
 * 바탕만 남기고 걸어온 자취를 거둔 장면.
 *
 * 부르는 쪽은 **객체 리터럴**로 넘긴다 — 변수를 넘기면 TypeScript 의 초과 속성
 * 검사가 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 */
function atStart(base: WalkBase): WalkPerCharacterScene {
  return {
    words: base.words,
    query: null,
    path: [],
    outcome: null,
    step: null,
    caption: null,
  };
}

/** 커서가 선 노드. 아직 한 칸도 못 내려갔으면 뿌리다. 따로 담지 않고 여기서 낸다. */
export function walkCursorOf(scene: WalkPerCharacterScene): string {
  return scene.path.length === 0 ? WALK_ROOT_ID : scene.path[scene.path.length - 1];
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
}

function verdictOf(v: unknown): WalkVerdict {
  return v === 'found' || v === 'no-word' || v === 'blocked' ? v : 'no-word';
}

export const walkPerCharacterScene: ScenePlan<WalkPerCharacterScene> = {
  /**
   * 첫 장면은 아무도 걷지 않은 빈 트라이다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 담긴 말을 여기서 좁힌다. 다만
   * 넘겨받은 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가
   * 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게
   * 된다 (S-scene). `strs` 가 새 배열을 낸다.
   */
  initial(initialData: unknown): WalkPerCharacterScene {
    const d = (initialData ?? {}) as { words?: unknown };
    return atStart({ words: strs(d.words) });
  },

  reduce(scene: WalkPerCharacterScene, event: FacetRuntimeEvent): WalkPerCharacterScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /**
       * 새 찾기를 시작한다 — **이 갈래가 곧 되감기다.**
       *
       * algorithm 이 `rewind` 를 따로 발신하지 않는다. 커서를 뿌리로 되돌리고 앞
       * 강조를 지우는 일이 곧 되감기이고, 그것을 걸음표 첫 줄인 `search-begin` 이
       * 겸한다 (algorithm.ts 의 주석). 그러니 걸어온 자취를 여기서 거둔다 —
       * 바탕은 담긴 말뿐이고, 객체 리터럴로 넘겨 그 좁힘이 실제로 걸리게 한다.
       */
      case 'search-begin':
        return {
          ...atStart({ words: scene.words }),
          query: {
            text: str(p.query, ''),
            index: num(p.queryIndex, 0),
            total: num(p.queryTotal, 0),
          },
          step: { kind: 'begin' },
          caption: { kind: 'searchBegin' },
        };

      // 글자 하나를 따라 가지를 타고 한 칸 내려간다. 떠나온 자리가 자취로 남는다.
      case 'step-down': {
        const to = str(p.toId, '');
        if (to === '') return scene;
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          path: [...scene.path, to],
          step: { kind: 'down', from: str(p.fromId, walkCursorOf(scene)) },
          caption: { kind: 'stepDown' },
        };
      }

      /**
       * 답이 났다. 세 결말이 갈리는 자리다.
       *
       * 어느 노드에서 났는지와 몇 글자를 걸었는지는 `path` 에서 나온다. 그래서
       * algorithm 도 그 둘을 payload 에 싣지 않는다 — 실려 있으면 다음 사람이
       * 집어 쓰고, 그 순간 같은 수의 출처가 둘이 된다.
       */
      case 'search-result': {
        const verdict = verdictOf(p.verdict);
        return {
          ...scene,
          outcome: {
            verdict,
            blockedChar: verdict === 'blocked' ? str(p.blockedChar, '') || null : null,
          },
          step: { kind: 'settle' },
          caption:
            verdict === 'found'
              ? { kind: 'found' }
              : verdict === 'no-word'
                ? { kind: 'noWord' }
                : { kind: 'blocked' },
        };
      }

      default:
        // 이 facet 이 내보내는 이벤트는 위 셋이 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
