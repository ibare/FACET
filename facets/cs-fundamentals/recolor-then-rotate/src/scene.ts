/**
 * RecolorThenRotate 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 번역을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 다음
 * 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 어디에 상태를 숨겨 두었나
 *
 * 넷이 나왔고, 넷 다 되짚으면 어긋나던 자리다.
 *
 * - **`shadow: Map<string, ShadowNode>`** (projector) — 나무 전체가 여기에만 있었다.
 *   값·색·부모·어느 쪽인가를 쥐고 `existing.color = …` · `existing.parentId = …` 로
 *   **제자리에서 고쳤다.** `let` 이 아니라 `Map` 이라 눈에 띄지 않는다 (숨은 상태 ③).
 *   되감기가 성립한 것은 algorithm 이 처음부터 다시 발신해 주었기 때문이지 화면이
 *   되돌릴 수 있어서가 아니었다.
 *
 * - **`NodeEls = { g, circle, text, x, y }`** (stage) — 원이 **지금 어느 자리에
 *   서 있나**가 DOM 손잡이와 한 객체에 묶여 있었다 (숨은 상태 ⑤). `el.x !== x` 로
 *   "움직였나" 를 갈랐고, 위반 고리와 가지 끝점도 그 수에서 나왔다. 되감아 세운
 *   직후에는 그 수가 아직 옛 화면의 것이다.
 *
 * - **`let marks: SVGElement[]`** (stage) — 위반으로 짚인 셋(자식·부모·옆자리)이
 *   거기에만 있었다. 이 조각의 **논증의 자리**가 곧 그것인데, 그리는 명령
 *   (`markViolation`) 과 지우는 명령 (`clearMarks`) 뿐이라 되짚으면 사라졌다.
 *
 * - **"색칠로 끝나나, 돌아야 하나" 라는 판정이 어디에도 없었다.** 옆자리의 색을
 *   보고 갈린 그 판정이 캡션 문자열과 다음에 오는 이벤트의 종류로만 드러났다.
 *   그것이 이 조각의 주장 자체다 — 아래 `route` 가 그 자리를 받는다.
 *
 * ── 되감기의 바탕이 비어 있다
 *
 * 다른 조각은 `Pick<Scene, …>` 로 바탕을 좁혀 걸음이 고치는 값이 되감기에 섞이지
 * 않게 막는다. 여기서는 **나무 전체가 걸음이 짓는 것**이라 물려받을 바탕이 아예
 * 없다 — `initial` 도 `rewind` 도 빈 장면을 돌려준다. 마디의 색은 바탕처럼 보이지만
 * `recolor` 가 고치는 값이므로, 섞일 자리를 아예 만들지 않는 편이 좁히는 것보다
 * 세다. `atStart()` 가 인자를 받지 않는 것이 그 표현이다.
 *
 * 좌표는 담지 않는다. 자리는 뿌리→자신 L/R 경로가 정하고 그 경로는 `parentId` ·
 * `side` 에서 나오므로, 그리는 쪽이 캔버스에서 역산한다 (S-piece). 깊이도 담지
 * 않는다 — 경로의 길이다. 문안도 담지 않는다. 무엇을 말할지와 **누구에 대해**
 * 말할지만 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type RecolorThenRotateColor = 'red' | 'black';
/** 부모의 어느 쪽 자식인가. 뿌리는 `null`. */
export type RecolorThenRotateSide = 'L' | 'R' | null;

/**
 * 나무의 마디 하나.
 *
 * **색이 값이다** — 빨강/검정이 이 조각이 말하는 대상이지 꾸밈이 아니다. 그래서
 * 장면이 들고, 그리는 쪽은 그것을 칠로 옮길 뿐이다.
 */
export type RecolorThenRotateNode = {
  readonly id: string;
  readonly value: number;
  readonly color: RecolorThenRotateColor;
  readonly parentId: string | null;
  readonly side: RecolorThenRotateSide;
};

/** 위반을 판정할 때 본 옆자리(부모의 형제). 비어 있으면 어느 쪽이 비었는지만 안다. */
export type RecolorThenRotateUncle =
  | { readonly kind: 'node'; readonly id: string }
  | { readonly kind: 'nil'; readonly side: 'L' | 'R' };

/**
 * 지금 짚여 있는 위반. **머무는 강조**라 정적 그리기에도 들어간다 (S-scene).
 *
 * `route` 가 이 조각의 주장이다 — 옆자리가 빨강이면 색칠로 끝나고(`'recolor'`),
 * 검정이거나 비어 있으면 돌아야 한다(`'rotate'`). 그 판정을 캡션 문자열에만 두면
 * 되짚었을 때 "먼저 색으로 해 보고 안 되면 돈다" 는 차례가 사라진다.
 */
export type RecolorThenRotateViolation = {
  readonly childId: string;
  readonly parentId: string;
  readonly grandparentId: string;
  readonly uncle: RecolorThenRotateUncle;
  readonly route: 'recolor' | 'rotate';
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 색이 바뀌는 걸음과 도는 걸음은 **출발 그림**이 있어야 흐를 수 있는데, 그것을
 * `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene). 그래서 걸음이
 * 스스로 계기값을 싣는다 — `from` 은 바뀌기 전의 색이고, `fromParentId` ·
 * `fromSide` 는 돌기 전의 이음이다. 그리는 쪽은 그 둘로 옛 그림을 셈으로 되세운다.
 *
 * 위반을 짚는 걸음은 흐를 것이 없어 `step` 이 `null` 이다 — 고리는 `violation` 이
 * 말하는 머무는 강조이지 지나가는 운동이 아니다.
 */
export type RecolorThenRotateStep =
  | { readonly kind: 'insert'; readonly id: string }
  | {
      readonly kind: 'recolor';
      readonly changes: readonly { readonly id: string; readonly from: RecolorThenRotateColor }[];
    }
  | {
      readonly kind: 'rotate';
      readonly moved: readonly {
        readonly id: string;
        readonly fromParentId: string | null;
        readonly fromSide: RecolorThenRotateSide;
      }[];
    };

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 **누구에 대해** 말할지다 (C10).
 *
 * 인자로 수를 싣지 않고 마디의 id 를 싣는다. 값은 장면이 이미 알고 있으므로
 * (`nodes`) 같은 수를 두 자리에서 세지 않는다.
 */
export type RecolorThenRotateCaption =
  | { readonly kind: 'insertRoot'; readonly id: string }
  | { readonly kind: 'insertRed'; readonly id: string; readonly parentId: string }
  | {
      readonly kind: 'violationRed';
      readonly childId: string;
      readonly parentId: string;
      readonly uncleId: string;
    }
  | { readonly kind: 'violationNil'; readonly childId: string; readonly parentId: string }
  | {
      readonly kind: 'recolorApplied';
      readonly parentId: string;
      readonly uncleId: string;
      readonly grandparentId: string;
    }
  | { readonly kind: 'rootFixApplied'; readonly rootId: string }
  | { readonly kind: 'rotateApplied'; readonly riserId: string; readonly pivotId: string }
  | { readonly kind: 'rotateSwapApplied'; readonly riserId: string; readonly pivotId: string };

export type RecolorThenRotateScene = {
  /** 나무 전체. 들어온 차례대로 쌓인다. 걸음이 색과 이음을 고친다. */
  readonly nodes: readonly RecolorThenRotateNode[];
  readonly violation: RecolorThenRotateViolation | null;
  readonly step: RecolorThenRotateStep | null;
  readonly caption: RecolorThenRotateCaption | null;
};

/**
 * 아직 아무 걸음도 밟지 않은 화면 — 빈 나무.
 *
 * 인자를 받지 않는다. 이 조각은 `init` 을 발신하지 않고 마디가 전부 `insert-node`
 * 로 들어오므로 되감기가 물려받을 바탕이 없다. 인자가 없으면 걸음이 고친 값이
 * 되감기에 섞일 자리도 없다 (파일 머리말의 "되감기의 바탕이 비어 있다").
 */
function atStart(): RecolorThenRotateScene {
  return { nodes: [], violation: null, step: null, caption: null };
}

// ── unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9).

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function color(v: unknown): RecolorThenRotateColor | null {
  return v === 'red' || v === 'black' ? v : null;
}

function side(v: unknown): RecolorThenRotateSide {
  return v === 'L' || v === 'R' ? v : null;
}

function nodeOf(
  nodes: readonly RecolorThenRotateNode[],
  id: string | null,
): RecolorThenRotateNode | null {
  if (id === null) return null;
  return nodes.find((n) => n.id === id) ?? null;
}

/**
 * 마디 하나를 갈아 끼운 새 목록.
 *
 * 앞 장면의 배열도 그 안의 마디도 제자리에서 고치지 않는다 — 되짚기는 지나온
 * 장면들을 그대로 다시 쓰므로, 고치면 과거가 함께 바뀐다 (S-scene).
 */
function withNode(
  nodes: readonly RecolorThenRotateNode[],
  id: string,
  patch: Partial<RecolorThenRotateNode>,
): readonly RecolorThenRotateNode[] {
  return nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
}

export const recolorThenRotateScene: ScenePlan<RecolorThenRotateScene> = {
  /**
   * 첫 장면은 빈 나무다.
   *
   * `initialData` 를 들여다보지 않는다. 러너가 주는 그 객체는 mechanism 과 view 가
   * 함께 쓰는 한 벌이고 algorithm 이 제자리에서 고치므로, 참조는커녕 값도 쥘 까닭이
   * 없다 — 나무는 전부 `insert-node` 가 짓는다 (S-scene).
   */
  initial(): RecolorThenRotateScene {
    return atStart();
  },

  reduce(scene: RecolorThenRotateScene, event: FacetRuntimeEvent): RecolorThenRotateScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 새 마디가 나무에 붙는다. 뿌리면 검정, 그 외에는 빨강으로 들어온다.
      case 'insert-node': {
        const id = str(p.id);
        const c = color(p.color);
        if (id === null || c === null) return scene;
        const parentId = str(p.parentId);
        const node: RecolorThenRotateNode = {
          id,
          value: num(p.value),
          color: c,
          parentId,
          side: side(p.side),
        };
        return {
          nodes: [...scene.nodes, node],
          // 새 값이 들어오면 앞 위반은 이미 끝난 이야기다.
          violation: null,
          step: { kind: 'insert', id },
          caption:
            parentId === null
              ? { kind: 'insertRoot', id }
              : { kind: 'insertRed', id, parentId },
        };
      }

      // 빨강 아래 빨강이 걸렸다. 옆자리의 색이 곧 갈래를 정한다.
      case 'violation-found': {
        const childId = str(p.childId);
        const parentId = str(p.parentId);
        const grandparentId = str(p.grandparentId);
        const uncleSide = side(p.uncleSide);
        if (childId === null || parentId === null || grandparentId === null || uncleSide === null) {
          return scene;
        }
        const uncleId = str(p.uncleId);
        const uncleNode = nodeOf(scene.nodes, uncleId);
        // payload 의 `uncleColor` 는 보지 않는다. 옆자리의 색은 장면이 이미 아는
        // 것이고, 빈 자리는 관례대로 검정이다 — 같은 수를 두 자리에서 세지 않는다.
        const uncleColor: RecolorThenRotateColor = uncleNode?.color ?? 'black';
        const uncle: RecolorThenRotateUncle =
          uncleNode !== null ? { kind: 'node', id: uncleNode.id } : { kind: 'nil', side: uncleSide };
        return {
          ...scene,
          violation: {
            childId,
            parentId,
            grandparentId,
            uncle,
            route: uncleColor === 'red' ? 'recolor' : 'rotate',
          },
          // 고리는 머무는 강조다. 흐를 운동이 없어 걸음은 비운다.
          step: null,
          caption:
            uncle.kind === 'node'
              ? { kind: 'violationRed', childId, parentId, uncleId: uncle.id }
              : { kind: 'violationNil', childId, parentId },
        };
      }

      // 색만 바꾼다. 위반을 푸는 색칠일 수도, 뿌리 불변식을 되돌리는 색칠일 수도 있다.
      case 'recolor': {
        if (!Array.isArray(p.changes)) return scene;
        const asked: { id: string; to: RecolorThenRotateColor }[] = [];
        for (const raw of p.changes) {
          const c = (raw ?? {}) as { id?: unknown; color?: unknown };
          const id = str(c.id);
          const to = color(c.color);
          if (id !== null && to !== null) asked.push({ id, to });
        }
        if (asked.length === 0) return scene;

        // 바뀌기 전 색을 걸음에 실어 둔다 — 그리는 쪽이 출발 색을 `prev` 에서
        // 꺼내면 위반이다 (S-scene).
        const changes: { id: string; from: RecolorThenRotateColor }[] = [];
        let nodes = scene.nodes;
        for (const a of asked) {
          const before = nodeOf(nodes, a.id);
          if (before === null) continue;
          changes.push({ id: a.id, from: before.color });
          nodes = withNode(nodes, a.id, { color: a.to });
        }
        if (changes.length === 0) return scene;

        const reason = str(p.reason);
        let caption: RecolorThenRotateCaption | null = null;
        if (reason === 'siblingRecolor' && changes.length === 3) {
          // changes 의 차례가 역할을 말한다 — [부모, 옆자리, 조부모] (algorithm.ts).
          caption = {
            kind: 'recolorApplied',
            parentId: changes[0].id,
            uncleId: changes[1].id,
            grandparentId: changes[2].id,
          };
        } else if (reason === 'rootFix' && changes.length === 1) {
          caption = { kind: 'rootFixApplied', rootId: changes[0].id };
        } else if (reason === 'rotationSwap' && changes.length === 2) {
          caption = { kind: 'rotateSwapApplied', riserId: changes[0].id, pivotId: changes[1].id };
        }

        // 짚어 둔 위반은 **그것에 답하는 걸음까지** 남는다. 색칠 갈래의 답이
        // 'siblingRecolor' 이고, 자리가 움직이지 않으므로 고리는 계속 그 셋을
        // 가리킨다 — 여기서 지우면 "색칠로 풀렸다" 가 누구 이야기인지 화면에서
        // 끊긴다. 뿌리 불변식을 되돌리는 'rootFix' 는 그 다음 일이라 지운다.
        const answered =
          scene.violation !== null &&
          scene.violation.route === 'recolor' &&
          reason === 'siblingRecolor';

        return {
          nodes,
          violation: answered ? scene.violation : null,
          step: { kind: 'recolor', changes },
          caption,
        };
      }

      // 축을 중심으로 돈다. 부모/자식이 바뀐 마디만 payload 가 싣는다.
      case 'rotate': {
        const pivotId = str(p.pivot);
        if (pivotId === null || !Array.isArray(p.edges)) return scene;
        const moved: {
          id: string;
          fromParentId: string | null;
          fromSide: RecolorThenRotateSide;
        }[] = [];
        let nodes = scene.nodes;
        for (const raw of p.edges) {
          const e = (raw ?? {}) as { id?: unknown; parentId?: unknown; side?: unknown };
          const id = str(e.id);
          if (id === null) continue;
          const before = nodeOf(nodes, id);
          if (before === null) continue;
          // 돌기 전의 이음을 걸음에 실어 둔다. 미끄러지는 운동의 출발 그림이 이것으로
          // 셈해진다 — 옛 나무를 `prev` 에서 꺼내 오지 않는다 (S-scene).
          moved.push({ id, fromParentId: before.parentId, fromSide: before.side });
          nodes = withNode(nodes, id, { parentId: str(e.parentId), side: side(e.side) });
        }
        if (moved.length === 0) return scene;
        const riserId = moved[0].id;
        return {
          nodes,
          // 나무의 모양이 바뀌었다. 특히 빈 자리(NIL)는 조부모의 자리에서 나오는데
          // 그 자리가 방금 옮겨 갔으므로, 고리를 그대로 두면 엉뚱한 곳을 가리킨다.
          violation: null,
          step: { kind: 'rotate', moved },
          caption: { kind: 'rotateApplied', riserId, pivotId },
        };
      }

      // 손으로 짚기 시작 — 빈 나무로 돌아간다.
      case 'rewind':
        return atStart();

      default:
        // 이 조각의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
