/**
 * BstInorderSorted 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저 다음
 * 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다 (S-scene).
 *
 * ── 이 조각의 주장이 어디에 있었나
 *
 * 이 조각이 말하는 것은 **훑어 나온 차례가 쌓인다** 는 것이다. 그런데 옮기기 전
 * 그 줄은 화면에만 있었다 — `flowOut()` 이 `outputG` 에 `<g>` 를 하나씩 덧붙인 것이
 * 유일한 기록이고, 그것을 셈하는 자리가 코드 어디에도 없었다. 되짚으면 덧붙인
 * 것들이 사라지거나 겹쳐 **주장 자체가 사라졌다.** 이제 `out` 이 말한다.
 *
 * ── 숨어 있던 상태 넷
 *
 * - **나온 값의 줄** — 위의 `outputG` 자식들. 이제 `out`. 어느 칸에 어느 값이
 *   앉았는지가 배열의 차례로 그대로 드러난다. **남는다.**
 * - **몇 개가 나왔나** — projector 의 `let outCount` 와 stage 의 `let outCount` 가
 *   **같은 수를 두 자리에서** 세고 있었다. 하나는 캡션의 `{n}`, 하나는 다음 칸의
 *   번호였고 되감기 경로가 둘을 따로 0 으로 되돌렸다. 이제 어느 쪽도 세지 않는다 —
 *   캡션도 칸 번호도 `out` 의 **줄 길이**에서 나온다.
 * - **서 있는 마디들** — stage `NodeEntry.standing`. `highlight` 로 켜지고 자기
 *   값을 내놓은 뒤에야 꺼지므로 **한 번에 여럿이 켜진다** — 뿌리부터 지금 자리까지의
 *   재귀 경로 그 자체다. 이제 `standing`.
 * - **굳은 마디들** — stage `NodeEntry.filled: 'default' | 'settled'`. `let` 도
 *   `Set.has` 도 아니고 **타입 선언에 얹힌 상태**라 grep 에 걸리지 않는다. 이제
 *   `settled`. **남는 표식이라 지나가는 강조(`standing`)와 한 필드로 뭉치지 않는다.**
 *
 * 좌표는 담지 않는다. 값과 좌우 자식이라는 **구조**만 담고 자리는 그리는 쪽이
 * 캔버스에서 셈한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import { parseTarget } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 마디 하나. 자리는 값과 좌우 자식이 정하므로 좌표는 담지 않는다. */
export type BstInorderSortedSceneNode = {
  value: number;
  left: number | null;
  right: number | null;
};

/**
 * 이번 걸음에 흐르게 할 것.
 *
 * 흐르는 것은 하나뿐이다 — 마디의 값이 자기 자리에서 줄의 다음 빈 칸으로 내려앉는
 * 운동. 서기·굳기·떠나기는 칠이 갈리는 일이라 흐를 것이 없어 `null` 로 둔다.
 *
 * 내려앉을 칸은 싣지 않는다. 방금 앉은 값은 언제나 `out` 의 마지막이므로 줄 길이가
 * 곧 그 번호다 — 같은 수를 두 자리에서 세지 않는다.
 */
export type BstInorderSortedStep = { kind: 'flow'; value: number };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지다. 수는 장면에서 센다. */
export type BstInorderSortedCaption =
  | { kind: 'stand'; value: number }
  | { kind: 'output'; value: number }
  | { kind: 'done' };

export type BstInorderSortedScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 나무의 마디들. 그리는 차례가 아니라 명부다. */
  nodes: BstInorderSortedSceneNode[];
  /** 뿌리의 값. 여기서 내려가며 자리를 셈한다. */
  rootValue: number;

  // ── 걸어온 자취.
  /**
   * 지금 서 있는 마디들. 뿌리부터 지금 자리까지의 재귀 경로다.
   *
   * 한 번에 하나가 아니다 — 자기 값을 내놓기 전까지 서 있으므로, 왼쪽으로 내려가는
   * 동안 조상들이 모두 선 채로 남는다. "먼저 왼쪽을 비우러 내려간다" 가 그 줄로 보인다.
   */
  standing: number[];
  /**
   * 값을 내놓고 굳은 마디들. **남는 표식**이라 정적으로 그릴 때도 들어간다.
   *
   * `out` 과 값의 집합이 같아 보이지만 `mark` 는 `append` 의 **다음 걸음**이라 그
   * 사이 한 걸음에서 갈린다. 밟은 마디와 아직 안 밟은 마디의 구별이므로 지나가는
   * 강조인 `standing` 과 한 필드로 뭉치지 않는다.
   */
  settled: number[];
  /**
   * 훑어 나온 차례. **이 조각의 주장 그 자체**라 정적 그리기에도 반드시 들어간다.
   *
   * 칸 번호도 캡션의 개수도 이 배열의 길이에서 나온다.
   */
  out: number[];

  step: BstInorderSortedStep | null;
  caption: BstInorderSortedCaption | null;
  /** 할 말을 마쳤나. 완료 상태 자체가 정보다 (S-piece). */
  done: boolean;
};

/**
 * 걸음이 고치지 않는 부분. 첫 장면이 한 번 정한다.
 *
 * 걸음이 고치는 `standing` · `settled` · `out` 은 여기 들지 않는다 — 들면 되감은
 * 화면이 이미 다 훑어 나온 줄을 단 채로 선다 (프로토콜 4절).
 */
type BstInorderSortedBase = Pick<BstInorderSortedScene, 'nodes' | 'rootValue'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: BstInorderSortedBase): BstInorderSortedScene {
  return {
    nodes: base.nodes,
    rootValue: base.rootValue,
    standing: [],
    settled: [],
    out: [],
    step: null,
    caption: null,
    done: false,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function childOf(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 마디 하나를 좁힌다. 값을 베껴 담아 바깥 객체의 참조를 쥐지 않는다 (S-scene). */
function toNode(raw: unknown): BstInorderSortedSceneNode | null {
  const n = (raw ?? {}) as { value?: unknown; left?: unknown; right?: unknown };
  if (typeof n.value !== 'number' || !Number.isFinite(n.value)) return null;
  return { value: n.value, left: childOf(n.left), right: childOf(n.right) };
}

/** `node:<값>` 에서 값을 꺼낸다. 식별자 파싱은 `parseTarget` 을 경유한다 (원칙 4). */
function nodeValue(target: FacetRuntimeEvent['target']): number | null {
  if (typeof target !== 'string') return null;
  const parsed = parseTarget(target);
  if (!parsed || parsed.prefix !== 'node') return null;
  const value = Number(parsed.id);
  return Number.isFinite(value) ? value : null;
}

export const bstInorderSortedScene: ScenePlan<BstInorderSortedScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 마디 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께
   * 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그리게 된다
   * (S-scene).
   */
  initial(initialData: unknown): BstInorderSortedScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const nodes: BstInorderSortedSceneNode[] = [];
    if (Array.isArray(d.nodes)) {
      for (const raw of d.nodes) {
        const node = toNode(raw);
        if (node) nodes.push(node);
      }
    }
    return atStart({ nodes, rootValue: num(d.rootValue, nodes[0]?.value ?? 0) });
  },

  reduce(scene: BstInorderSortedScene, event: FacetRuntimeEvent): BstInorderSortedScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 이 자리에 선다. 먼저 왼쪽을 비우러 내려가므로 조상들은 선 채로 남는다.
      case 'highlight': {
        const value = nodeValue(event.target);
        if (value === null) return scene;
        return {
          ...scene,
          // 앞 장면의 배열을 제자리에서 고치지 않는다 — 고치면 과거가 함께 바뀐다.
          standing: scene.standing.includes(value) ? scene.standing : [...scene.standing, value],
          step: null,
          caption: { kind: 'stand', value },
        };
      }

      // 값을 내놓은 뒤 서 있음을 뜨고 오른쪽으로 넘어간다.
      case 'unhighlight': {
        const value = nodeValue(event.target);
        if (value === null) return scene;
        return { ...scene, standing: scene.standing.filter((v) => v !== value), step: null };
      }

      // 내놓은 자리를 "다녀왔다" 로 굳힌다. 남는 표식이다.
      case 'mark': {
        const value = nodeValue(event.target);
        if (value === null) return scene;
        return {
          ...scene,
          settled: scene.settled.includes(value) ? scene.settled : [...scene.settled, value],
          step: null,
        };
      }

      // 이 마디의 값이 흘러나와 줄 끝에 쌓인다. 걸음의 핵심 순간.
      case 'append': {
        const value = num(p.value, nodeValue(event.target) ?? Number.NaN);
        if (!Number.isFinite(value)) return scene;
        return {
          ...scene,
          out: [...scene.out, value],
          step: { kind: 'flow', value },
          caption: { kind: 'output', value },
        };
      }

      // 아홉 값이 모두 나와 줄이 오름차순으로 완성됐다.
      case 'done':
        return { ...scene, step: null, caption: { kind: 'done' }, done: true };

      // 바탕만 남기고 자취를 거둔다. 걸음이 고치는 것은 바탕에 들지 않았으므로
      // 여기서 다시 셈할 것이 없다 (호출부를 객체 리터럴로 넘겨 초과 속성 검사를
      // 실제로 돌게 한다 — 프로토콜 4절).
      case 'rewind':
        return atStart({ nodes: scene.nodes, rootValue: scene.rootValue });

      default:
        // algorithm.ts 가 발신하는 것은 위가 전부다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
