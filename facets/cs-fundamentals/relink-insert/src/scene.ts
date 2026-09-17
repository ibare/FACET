/**
 * relinkInsert 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 상자는 처음 자리에서 한 픽셀도 움직이지 않는다. 걸음마다 달라지는 것은 **어느
 * 마디의 next 가 어디에 닿아 있는가** 하나뿐이다. 그러니 장면이 쥐어야 할 머무는
 * 것은 셋이다.
 *
 *   links   마디 id → 그 next 가 닿은 곳. 이 조각의 본체다.
 *   staged  줄 밖 마디가 화면에 나타났나.
 *   tally   끝나고 남는 집계 (고쳐 쓴 화살표 수 · 옮긴 상자 수).
 *
 * 화살표를 하나하나 고쳐 쓰는 명령은 두지 않는다. `links` 가 구조를 말하면 화살표의
 * 곡선도, 촉이 비었는지도, 떨어져 나간 자리에 남는 빈 고리도 전부 그 구조에서
 * 셈해진다. projector 시절 잇는 곳이 어디서 어디로 바뀌었나는 화살표 `d` 속성에만
 * 있었고, 그것이 되짚기가 어긋나던 자리였다.
 *
 * 지나가는 것은 **방금 밟은 걸음** 하나뿐이다 (`step`). 그리는 쪽은 그것을 보고
 * 무엇을 흐르게 할지 고르고, 출발 그림은 걸음에 실린 계기값(`was` · `to`)과 `links`
 * 에서 스스로 셈한다 — 앞 장면을 그리기 재료로 쓰지 않는다 (S-scene).
 *
 * 좌표는 담지 않는다. 마디의 수와 순서가 자리를 정하므로 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 마디 하나. 자리는 없다 — 이름표와 값이라는 구조만 담는다. */
export type RelinkSceneNode = {
  readonly id: string;
  readonly value: number;
};

/**
 * 한 마디의 next 가 어디에 닿아 있나.
 *
 * 화살표의 모양은 여기서 셈해진다 — 어느 마디를 가리키면 그 마디로 뻗고, 끝이면
 * null 표식으로, 떨어져 있으면 허공에 걸린 채 촉이 빈다.
 */
export type RelinkLink =
  /** 그 id 의 마디를 가리킨다. */
  | { readonly kind: 'to'; readonly id: string }
  /** 사슬의 끝. 아무 마디도 뒤에 없다. */
  | { readonly kind: 'end' }
  /** 떼어 내 아무 데도 닿지 않는다. */
  | { readonly kind: 'loose' }
  /** 아직 화살표 자체가 없다 — 줄 밖에서 기다리는 마디. */
  | { readonly kind: 'absent' };

/** 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다. */
export type RelinkStep =
  /** 줄 밖 마디가 아래에서 올라와 선다. */
  | { readonly kind: 'enter' }
  /** 줄 밖 마디가 내민 화살표가 자라 뒤 마디에 닿는다. */
  | { readonly kind: 'grow'; readonly from: string; readonly to: string }
  /**
   * 줄에 선 마디의 화살표 끝이 떨어져 허공에 걸린다.
   *
   * `was` 가 출발 그림의 계기값이다 — 떼기 전에 어디에 닿아 있었나. 이것이 있어야
   * 앞 장면을 들추지 않고 출발 자리를 셈으로 복원한다 (S-scene).
   */
  | { readonly kind: 'detach'; readonly from: string; readonly was: string }
  /** 허공에 걸려 있던 그 끝이 줄 밖 마디의 머리에 내려앉는다. */
  | { readonly kind: 'land'; readonly from: string; readonly to: string }
  /** 이어진 사슬을 점 하나가 처음부터 끝까지 훑는다. */
  | { readonly kind: 'trace' };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다. */
export type RelinkCaption =
  | { readonly kind: 'chain' }
  | { readonly kind: 'staged'; readonly value: number }
  | { readonly kind: 'attachNew'; readonly source: string; readonly target: string }
  | { readonly kind: 'detach'; readonly source: string; readonly target: string }
  | { readonly kind: 'attachBack'; readonly source: string; readonly target: string }
  | { readonly kind: 'done' };

/** 끝나고 남는 집계. 세어서 0 이 아니라 일어나지 않아서 0 이다. */
export type RelinkTally = {
  readonly rewires: number;
  readonly moves: number;
};

export type RelinkInsertScene = {
  /**
   * 줄에 선 마디들. 순서가 곧 처음 사슬의 순서다.
   *
   * 모든 장면이 같은 목록을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception).
   */
  readonly nodes: readonly RelinkSceneNode[];
  /** 줄 밖에서 기다리는 마디. 선언이 성립하지 않으면 null 이다. */
  readonly incoming: RelinkSceneNode | null;
  /** next 를 고쳐 쓸 마디. 이 조각의 주어다. */
  readonly anchorId: string;
  /** 마디 id → 그 next 가 닿은 곳. 줄 밖 마디까지 포함해 모두 들어 있다. */
  readonly links: Readonly<Record<string, RelinkLink>>;
  /** 줄 밖 마디가 화면에 나타났나. */
  readonly staged: boolean;
  /** 끝나고 남는 집계. 아직이면 null. */
  readonly tally: RelinkTally | null;
  readonly step: RelinkStep | null;
  readonly caption: RelinkCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 마디 하나를 읽어 **복사해** 담는다. 참조를 쥐지 않는다 (S-scene). */
function readNode(v: unknown): RelinkSceneNode | null {
  if (typeof v !== 'object' || v === null) return null;
  const raw = v as { id?: unknown; value?: unknown };
  const id = str(raw.id);
  if (id === '') return null;
  return { id, value: num(raw.value) };
}

/**
 * 아무도 손대지 않은 사슬 — 줄에 선 순서대로 이어지고 마지막은 끝이다.
 *
 * 줄 밖 마디는 아직 화살표가 없다.
 */
function freshLinks(
  nodes: readonly RelinkSceneNode[],
  incoming: RelinkSceneNode | null,
): Record<string, RelinkLink> {
  const links: Record<string, RelinkLink> = {};
  for (let i = 0; i < nodes.length; i += 1) {
    const after = nodes[i + 1];
    links[nodes[i].id] = after === undefined ? { kind: 'end' } : { kind: 'to', id: after.id };
  }
  if (incoming !== null) links[incoming.id] = { kind: 'absent' };
  return links;
}

/** 처음 자리로 돌아간 장면. `initial` 과 `rewind` 와 `chain-shown` 이 같은 자리를 쓴다. */
function atStart(
  nodes: readonly RelinkSceneNode[],
  incoming: RelinkSceneNode | null,
  anchorId: string,
): RelinkInsertScene {
  return {
    nodes,
    incoming,
    anchorId,
    links: freshLinks(nodes, incoming),
    staged: false,
    tally: null,
    step: null,
    caption: null,
  };
}

/** 링크 하나를 갈아 끼운 **새** 지도. 앞 장면의 것은 건드리지 않는다 (S-scene). */
function withLink(
  links: Readonly<Record<string, RelinkLink>>,
  id: string,
  link: RelinkLink,
): Record<string, RelinkLink> {
  return { ...links, [id]: link };
}

/**
 * algorithm 이 보내는 **키** 를 장면이 쥘 뜻으로 옮긴다. 문안은 여기 없다 (C10).
 *
 * `caption.attachNew` 와 `caption.attachBack` 은 같은 `link-attached` 걸음에서
 * 갈린다 — 누가 화살표를 내미느냐가 다르다. projector 시절 이 갈림은 `incomingId`
 * 라는 숨은 `let` 이 쥐고 있었고, 이제 장면이 말한다.
 */
function readCaption(p: Record<string, unknown>): RelinkCaption | null {
  switch (p.textKey) {
    case 'caption.chain':
      return { kind: 'chain' };
    case 'caption.staged':
      return { kind: 'staged', value: num(p.value) };
    case 'caption.attachNew':
      return { kind: 'attachNew', source: str(p.from), target: str(p.to) };
    case 'caption.detach':
      return { kind: 'detach', source: str(p.from), target: str(p.was) };
    case 'caption.attachBack':
      return { kind: 'attachBack', source: str(p.from), target: str(p.to) };
    case 'caption.done':
      return { kind: 'done' };
    default:
      return null;
  }
}

export const relinkInsertScene: ScenePlan<RelinkInsertScene> = {
  /**
   * 첫 장면 — 아무도 손대지 않은 사슬과, 줄 밖에서 아직 보이지 않는 마디.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다 (S-scene).
   * 아래 `readNode` 가 마디마다 새 객체를 만든다.
   */
  initial(initialData: unknown): RelinkInsertScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const nodes: RelinkSceneNode[] = [];
    for (const item of Array.isArray(raw.nodes) ? raw.nodes : []) {
      const node = readNode(item);
      if (node !== null) nodes.push(node);
    }
    const incoming = readNode(raw.incoming);

    // 마지막 마디 뒤에 넣는 배치는 이 조각이 말하려는 장면이 아니다 — 뒤 마디가
    // 있어야 "떼어 내 옮긴다" 가 성립하므로 앞으로 당긴다.
    const asked = str(raw.insertAfter);
    const at = nodes.findIndex((n) => n.id === asked);
    const anchorAt = at >= 0 && at < nodes.length - 1 ? at : 0;
    const anchorId = nodes[anchorAt]?.id ?? '';

    return atStart(nodes, incoming, anchorId);
  },

  reduce(scene: RelinkInsertScene, event: FacetRuntimeEvent): RelinkInsertScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 사슬을 보인다. 말만 하는 걸음이라 흐르게 할 것이 없다.
      case 'chain-shown':
        return { ...atStart(scene.nodes, scene.incoming, scene.anchorId), caption: readCaption(p) };

      // 줄 밖 마디가 나타난다. 아직 어디에도 이어져 있지 않다.
      case 'node-staged':
        return {
          ...scene,
          staged: true,
          step: { kind: 'enter' },
          caption: readCaption(p),
        };

      // 한 마디의 next 가 어딘가에 닿는다. 누가 내미느냐로 몸짓이 갈린다 —
      // 줄 밖 마디의 화살표는 자라나고, 줄에 선 마디의 화살표는 내려앉는다.
      case 'link-attached': {
        const from = str(p.from);
        const to = str(p.to);
        if (from === '' || to === '') return scene;
        const fromStage = scene.incoming !== null && from === scene.incoming.id;
        return {
          ...scene,
          links: withLink(scene.links, from, { kind: 'to', id: to }),
          step: fromStage ? { kind: 'grow', from, to } : { kind: 'land', from, to },
          caption: readCaption(p),
        };
      }

      // 끝이 떨어진다. 이 사이 그 화살표는 아무 데도 닿지 않는다.
      case 'link-detached': {
        const from = str(p.from);
        const was = str(p.was);
        if (from === '' || was === '') return scene;
        return {
          ...scene,
          links: withLink(scene.links, from, { kind: 'loose' }),
          step: { kind: 'detach', from, was },
          caption: readCaption(p),
        };
      }

      // 다 이어졌다. 점 하나가 사슬을 훑고, 집계가 남는다.
      case 'done':
        return {
          ...scene,
          tally: { rewires: num(p.rewires), moves: num(p.moves) },
          step: { kind: 'trace' },
          caption: readCaption(p),
        };

      // 손으로 짚기 시작 — 자료는 그대로 두고 처음 자리로 돌아간다.
      case 'rewind':
        return atStart(scene.nodes, scene.incoming, scene.anchorId);

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖의 것은 흘린다 (C2).
        return scene;
    }
  },
};
