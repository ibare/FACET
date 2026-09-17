/**
 * ParentTwoChildren 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 번역을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 다음
 * 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 이 조각이 "지금까지 무엇을 갈랐나" 를 아는 길은 **그려진 것들** 뿐이었다.
 *
 * - `nodes` · `branches` — stage 의 Map 셋. 어느 마디가 놓였고 어느 가지가 그어졌나가
 *   거기에만 있었다. 되짚으면 지워지거나 겹쳤다.
 * - `ghosts: Map<string, Ghost>` — 어느 부모의 어느 쪽이 빈 자리인가. `Ghost` 는
 *   `{ side, at }` 로 **뜻(어느 쪽)과 좌표를 한 객체에 묶어** 두었고, 마지막 걸음의
 *   `rejectSwap` 이 `ghosts.get(parent)` 조회로 밀어 볼 방향을 갈랐다. `let` 도
 *   DOM 되읽기도 아니라 눈에 띄지 않는 자리다.
 * - `Branch.side` — 어느 가지가 왼쪽이고 어느 것이 오른쪽인가. 칠(`colorOf(side)`) 과
 *   배지 글자에만 남아 있었고, 되돌릴 때 `branch.side` 로 도로 꺼내 썼다.
 *
 * 이제 `rooted` 와 `opened` 가 그것을 말한다. 갈라진 자리는 **쌓이고 남는다** — 그
 * 자취가 곧 이 조각의 주장이라 정적으로 그릴 때도 전부 세운다. 반대로 마지막 걸음의
 * 밀어 보기는 되돌아오는 운동이라 아무것도 남기지 않으므로 `step` 에만 싣는다.
 * 남는 것과 지나가는 것을 한 필드에 뭉치지 않는다 (S-scene).
 *
 * 좌표는 담지 않는다. 격자 자리는 뿌리부터의 이음(`links`)이 정하므로 그리는 쪽이
 * 캔버스에서 셈한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 한 자리와 그 아래 두 자리의 이음. null 이면 그 쪽 자리는 비어 있다. */
export type ParentTwoChildrenLink = {
  id: string;
  left: string | null;
  right: string | null;
};

/**
 * 갈라진 자리 하나. 차례로 쌓이고 **남는다**.
 *
 * `left` / `right` 가 null 이면 그 쪽은 채워지지 않은 빈 자리다 — 그것이 열린 채로
 * 남는다는 것이 이 조각이 하려는 말이라, 빈 쪽도 함께 담는다.
 */
export type ParentTwoChildrenSplit = {
  parent: string;
  left: string | null;
  right: string | null;
};

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다. */
export type ParentTwoChildrenCaption =
  | { kind: 'seat' }
  | { kind: 'splitRoot' }
  | { kind: 'splitAgain' }
  | { kind: 'splitOne' }
  | { kind: 'sidesFixed' };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 출발 그림은 전부 장면 안의 이음과 배치에서 셈해지므로 계기값을 따로 싣지 않는다
 * — `prev` 에서 출발값을 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene).
 */
export type ParentTwoChildrenStep =
  | { kind: 'root'; id: string }
  | { kind: 'split'; parent: string; left: string | null; right: string | null }
  | { kind: 'reject'; child: string; parent: string };

export type ParentTwoChildrenScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 뿌리 자리의 id. */
  root: string;
  /** 자리들의 이음. 격자 좌표가 여기서 나온다. */
  links: readonly ParentTwoChildrenLink[];

  // ── 걸어온 자취. **남는다.**
  /** 뿌리 자리가 놓였나. */
  rooted: boolean;
  /** 갈라진 자리들. 발신된 차례대로 쌓인다. */
  opened: readonly ParentTwoChildrenSplit[];

  // ── 지나가는 것.
  step: ParentTwoChildrenStep | null;
  caption: ParentTwoChildrenCaption | null;
};

/**
 * 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정하고 되감기가 이것만 물려받는다.
 *
 * `rooted` · `opened` 를 여기에 넣지 않는 것이 요점이다. 걸어온 자취를 바탕과 같은
 * 급으로 묶어 되감기에 넘기면 되감은 화면에 지난 가지가 남는다 (S-scene).
 */
type ParentTwoChildrenBase = Pick<ParentTwoChildrenScene, 'root' | 'links'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: ParentTwoChildrenBase): ParentTwoChildrenScene {
  return {
    root: base.root,
    links: base.links,
    rooted: false,
    opened: [],
    step: null,
    caption: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

/**
 * 이음 하나를 좁힌다.
 *
 * 값을 베껴 담아 바깥 객체의 참조를 쥐지 않는다 — 러너가 주는 초기 자료는
 * mechanism 과 view 가 함께 쓰는 한 객체다 (S-scene).
 */
function toLink(raw: unknown): ParentTwoChildrenLink | null {
  const n = (raw ?? {}) as { id?: unknown; left?: unknown; right?: unknown };
  if (typeof n.id !== 'string') return null;
  return { id: n.id, left: str(n.left), right: str(n.right) };
}

export const parentTwoChildrenScene: ScenePlan<ParentTwoChildrenScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다.
   */
  initial(initialData: unknown): ParentTwoChildrenScene {
    const d = (initialData ?? {}) as { root?: unknown; nodes?: unknown };
    const links: ParentTwoChildrenLink[] = [];
    if (Array.isArray(d.nodes)) {
      for (const raw of d.nodes) {
        const link = toLink(raw);
        if (link !== null) links.push(link);
      }
    }
    return atStart({ root: str(d.root) ?? links[0]?.id ?? '', links });
  },

  reduce(scene: ParentTwoChildrenScene, event: FacetRuntimeEvent): ParentTwoChildrenScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 뿌리 자리 하나가 놓인다.
      case 'root-placed': {
        const id = str(p.id) ?? scene.root;
        if (id === '') return scene;
        return { ...scene, rooted: true, step: { kind: 'root', id }, caption: { kind: 'seat' } };
      }

      // 한 자리에서 아래로 두 자리가 함께 열린다. 채워지지 않은 쪽은 빈 자리로 남는다.
      case 'split': {
        const parent = str(p.parent);
        if (parent === null || parent === '') return scene;
        const left = str(p.left);
        const right = str(p.right);
        const both = left !== null && right !== null;
        // 캡션은 여기서 갈린다 — 뿌리의 첫 갈라짐 · 같은 방식의 되풀이 · 한쪽만 찬 자리.
        const caption: ParentTwoChildrenCaption = both
          ? parent === scene.root
            ? { kind: 'splitRoot' }
            : { kind: 'splitAgain' }
          : { kind: 'splitOne' };
        const already = scene.opened.some((s) => s.parent === parent);
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          opened: already ? scene.opened : [...scene.opened, { parent, left, right }],
          step: { kind: 'split', parent, left, right },
          caption,
        };
      }

      // 하나뿐인 자식을 반대쪽 빈 자리로 밀어 본다. 되돌아오므로 남는 것이 없다.
      case 'sides-fixed': {
        const child = str(p.child);
        const parent = str(p.parent);
        if (child === null || parent === null || child === '' || parent === '') return scene;
        return { ...scene, step: { kind: 'reject', child, parent }, caption: { kind: 'sidesFixed' } };
      }

      case 'rewind':
        // 객체 리터럴로 넘긴다 — 변수를 넘기면 초과 속성 검사가 돌지 않아
        // 좁힌 타입이 아무것도 막지 못한다.
        return atStart({ root: scene.root, links: scene.links });

      default:
        // 이 조각의 algorithm 은 위 넷만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
