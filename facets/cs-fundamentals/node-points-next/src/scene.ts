/**
 * NodePointsNext 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 가로축은 메모리 주소다. 노드 상자 셋이 주소 순서대로 축 위에 떨어져 놓이고,
 * head 가 쥔 주소가 첫 상자 위로 내려앉는다. 상자의 `next` 칸에서 주소의 복제본이
 * 떠올라 호를 그리며 날아가 다음 상자의 머리에 화살로 꽂히고, 마지막 상자가 쥔
 * null 은 옆으로 나가려다 벽에 막힌다. 끝에 값들이 순서 레인으로 내려앉는다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 옮기기 전 이 조각의 상태는 **전부 DOM 안에만** 있었다. projector 에는 `let` 이
 * 하나도 없고 stage 의 `let` 은 배치 밑감(`spec` · `placed` · `slots`)뿐이라,
 * "지금까지 무엇이 그려졌나" 를 말하는 자리가 아무 데도 없었다.
 *
 * - 노드가 내려앉았나 — `placeNodes()` 가 상자의 `opacity` 를 0 에서 1 로 올린 것이
 *   유일한 기록이었다. 이제 `placed` 가 말한다.
 * - head 가 얹혔나 · 어느 호가 그어졌나 · null 이 나갔나 — 걸음마다 `gArcs` 에
 *   덧붙인 요소들이 곧 상태였고, 그것을 셈하는 길이 없어 되짚으면 사라지거나
 *   겹쳤다. 이제 `headAt` · `links` · `nullAt` 가 말한다. 셋 다 **남는 강조**라
 *   정적으로 그릴 때도 들어간다.
 * - 어느 칸에 값이 앉았나 — `collectValue()` 가 슬롯 사각형의 `stroke` 와
 *   `stroke-dasharray` 를 제자리에서 고치고 텍스트를 덧붙였다. 그 속성의 변화가
 *   상태였다. 이제 `collected` 가 말한다.
 * - 순서 레인에 밑줄이 그어졌나 — `seal()` 이 덧붙인 선 하나. 이제 `sealed`.
 *
 * 좌표는 담지 않는다. 주소·값·칸 번호라는 구조만 담고 자리는 그리는 쪽이
 * 캔버스에서 셈한다 (S-piece). 마디를 잇는 화살표도 `from` · `to` 주소만 담는다.
 *
 * 문안도 담지 않는다. 무엇을 말할지만 담고 문자는 그리는 쪽이 `params.t` 로
 * 만든다 — 같은 장면을 다른 locale 로 그릴 수 있어야 하기 때문이다 (C10).
 */

import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';

/** 노드 하나. 화면 배치는 주소 순으로 다시 세우므로 자리는 담지 않는다. */
export type NodePointsNextSceneNode = {
  addr: string;
  value: number;
  next: string | null;
};

/** 그어진 화살표 하나. 자리가 아니라 어느 주소에서 어느 주소로인가다. */
export type NodePointsNextLink = { from: string; to: string };

/** 순서 레인에 내려앉은 값 하나. */
export type NodePointsNextCollected = { addr: string; slot: number; value: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다. */
export type NodePointsNextCaption =
  | { kind: 'scattered' }
  | { kind: 'holdsAddress' }
  | { kind: 'orderExists' };

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 걸음마다 필요한 계기값을 스스로 싣는다 — 출발 그림을 `prev` 에서 꺼내면
 * "`prev` 는 고르는 데만" 을 어기기 때문이다 (S-scene). 이 조각의 운동은 모두
 * 장면 안의 주소와 배치에서 출발 자리가 셈해지므로 따로 `from` 을 싣지 않는다.
 */
export type NodePointsNextStep =
  | { kind: 'place' }
  | { kind: 'head'; addr: string }
  | { kind: 'link'; from: string; to: string }
  | { kind: 'null'; addr: string }
  | { kind: 'collect'; addr: string; slot: number; value: number }
  | { kind: 'seal' };

export type NodePointsNextScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  /** 논리 순서 (head 부터) 로 적힌 노드들. */
  nodes: NodePointsNextSceneNode[];
  /** 첫 노드의 주소. 손에 처음 쥐는 주소다. */
  head: string;
  /** 노드 하나가 차지하는 바이트 수. 칸 폭의 비를 정한다. */
  nodeBytes: number;
  valueBytes: number;
  addressBytes: number;

  /** 상자들이 자리에 내려앉았나. */
  placed: boolean;
  /** head 화살표가 꽂힌 노드의 주소. 아직이면 `null`. **남는다.** */
  headAt: string | null;
  /** 그어진 화살표들. 차례대로 쌓인다. **남는다.** */
  links: NodePointsNextLink[];
  /** null 칩이 나가 벽에 막힌 노드의 주소. **남는다.** */
  nullAt: string | null;
  /** 순서 레인에 앉은 값들. **남는다.** */
  collected: NodePointsNextCollected[];
  /** 순서 레인 밑줄이 그어졌나. */
  sealed: boolean;

  step: NodePointsNextStep | null;
  caption: NodePointsNextCaption | null;
  /** 할 말을 마쳤나. 완료 상태 자체가 정보다 (S-piece). */
  done: boolean;
};

/** 걸음이 바꾸지 않는 부분. 첫 장면이 한 번 정한다. */
type NodePointsNextBase = Pick<
  NodePointsNextScene,
  'nodes' | 'head' | 'nodeBytes' | 'valueBytes' | 'addressBytes'
>;

const DEFAULT_NODE_BYTES = 8;
const DEFAULT_HALF_BYTES = 4;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: NodePointsNextBase): NodePointsNextScene {
  return {
    nodes: base.nodes,
    head: base.head,
    nodeBytes: base.nodeBytes,
    valueBytes: base.valueBytes,
    addressBytes: base.addressBytes,
    placed: false,
    headAt: null,
    links: [],
    nullAt: null,
    collected: [],
    sealed: false,
    step: null,
    caption: null,
    done: false,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** 노드 하나를 좁힌다. 값을 베껴 담아 바깥 객체의 참조를 쥐지 않는다 (S-scene). */
function toNode(raw: unknown): NodePointsNextSceneNode | null {
  const n = (raw ?? {}) as { addr?: unknown; value?: unknown; next?: unknown };
  if (typeof n.addr !== 'string' || typeof n.value !== 'number') return null;
  return { addr: n.addr, value: n.value, next: typeof n.next === 'string' ? n.next : null };
}

/** 캡션 키 → 갈래. 그리는 쪽이 갈래를 빠뜨리면 tsc 가 잡는다. */
function captionOf(key: string): NodePointsNextCaption | null {
  switch (key) {
    case 'caption.scattered':
      return { kind: 'scattered' };
    case 'caption.holdsAddress':
      return { kind: 'holdsAddress' };
    case 'caption.orderExists':
      return { kind: 'orderExists' };
    default:
      return null;
  }
}

export const nodePointsNextScene: ScenePlan<NodePointsNextScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 노드 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께
   * 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene).
   */
  initial(initialData: unknown): NodePointsNextScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const nodes: NodePointsNextSceneNode[] = [];
    if (Array.isArray(d.nodes)) {
      for (const raw of d.nodes) {
        const node = toNode(raw);
        if (node) nodes.push(node);
      }
    }
    return atStart({
      nodes,
      head: str(d.head, nodes[0]?.addr ?? ''),
      nodeBytes: num(d.nodeBytes, DEFAULT_NODE_BYTES),
      valueBytes: num(d.valueBytes, DEFAULT_HALF_BYTES),
      addressBytes: num(d.addressBytes, DEFAULT_HALF_BYTES),
    });
  },

  reduce(scene: NodePointsNextScene, event: FacetRuntimeEvent): NodePointsNextScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 캡션만 갈린다. 화면의 다른 것은 그대로다.
      case 'caption-changed': {
        const caption = captionOf(str(p.textKey, ''));
        return { ...scene, step: null, caption: caption ?? scene.caption };
      }

      // 상자들이 각자의 주소 자리로 내려앉는다.
      case 'nodes-placed':
        return { ...scene, placed: true, step: { kind: 'place' } };

      // head 가 쥔 주소가 미끄러져 와 첫 상자에 얹힌다.
      case 'head-attached': {
        const addr = str(p.addr, scene.head);
        return { ...scene, headAt: addr, step: { kind: 'head', addr } };
      }

      // next 칸의 주소가 날아가 그 주소의 상자를 가리킨다. 그어진 선은 남는다.
      case 'pointer-followed': {
        const from = str(p.from, '');
        const to = str(p.to, '');
        if (from === '' || to === '') return scene;
        const already = scene.links.some((l) => l.from === from && l.to === to);
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          links: already ? scene.links : [...scene.links, { from, to }],
          step: { kind: 'link', from, to },
        };
      }

      // 마지막 상자가 쥔 것은 null 이라 갈 곳이 없다.
      case 'pointer-null': {
        const addr = str(p.addr, '');
        if (addr === '') return scene;
        return { ...scene, nullAt: addr, step: { kind: 'null', addr } };
      }

      // 가리킨 차례대로 값이 순서 레인으로 내려간다.
      case 'value-collected': {
        const addr = str(p.addr, '');
        const slot = num(p.slot, -1);
        const value = num(p.value, 0);
        if (addr === '' || slot < 0) return scene;
        const kept = scene.collected.filter((c) => c.slot !== slot);
        return {
          ...scene,
          collected: [...kept, { addr, slot, value }],
          step: { kind: 'collect', addr, slot, value },
        };
      }

      // 순서가 다 드러났다. 레인 밑에 밑줄이 그어진다.
      case 'done':
        return { ...scene, sealed: true, done: true, step: { kind: 'seal' } };

      case 'rewind':
        return atStart(scene);

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
