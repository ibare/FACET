/**
 * pathCompression 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 상자 다섯은 한 줄에 박혀 한 픽셀도 움직이지 않는다. 걸음마다 달라지는 것은
 * **어느 자리가 어디를 가리키나** 하나뿐이고, 그것이 곧 이 조각의 주장이다.
 * 가리키는 곳을 장면이 쥐면 곡선 화살도, 상자 밑의 `→p` 딱지도, 뿌리에 닿기까지
 * 몇 칸인지도 전부 그 구조에서 셈해진다. projector 시절 그 정보는 화살의 `d`
 * 속성과 딱지의 `textContent` 에만 있었고, 되짚기가 어긋나던 자리가 거기였다.
 *
 * 그래서 가리키는 곳을 두 벌 쥔다.
 *
 *   origin  선언 그대로의 부모 포인터. 아무도 고치지 않는다.
 *   parent  지금 부모 포인터. 접는 걸음이 갈아 끼운다.
 *
 * **옮기기 전후를 견주는 것이 이 조각의 요점이므로 두 벌이 바탕이다.** 한 자리가
 * 전에 몇 칸이었는지는 `origin` 을 밟아 셈하고, 지금 몇 칸인지는 `parent` 를 밟아
 * 셈한다. 총계도 그 셈의 합이다 — algorithm 이 실어 보내는 `hops` · `hopsBefore`
 * · `totalBefore` · `totalAfter` 를 장면에 담지 않는다. 화면에 나란히 뜨는 수가
 * 한 출처에서 나와야 화면이 스스로 참이다.
 *
 * 지나가는 것은 **방금 밟은 걸음** 하나뿐이다 (`step`). 그리는 쪽은 그것을 보고
 * 무엇을 흐르게 할지 고르고, 출발 그림은 걸음에 실린 계기값(`was`)에서 셈한다 —
 * 앞 장면을 그리기 재료로 쓰지 않는다 (S-scene).
 *
 * 좌표는 담지 않는다. 자리의 수가 자리를 정하므로 그리는 쪽이 캔버스에서 역산한다
 * (S-piece). 문안도 담지 않는다. 무엇을 말할지와 그 인자만 담고 문자는 그리는 쪽이
 * `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 방금 밟은 걸음. 지나가는 것이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 되감기만 `null` 이다 — 화면이 통째로 처음 자리로 돌아가는 걸음이라 짚을 표식이
 * 없다. 말만 하는 나머지 둘은 `settle` 을 얹어 얇은 걸음을 면한다.
 */
export type PathCompressionStep =
  /** 한 번의 물음이 시작된다. 커서가 그 자리로 건너뛰고 상자가 한 번 반짝인다. */
  | { readonly kind: 'begin'; readonly node: number }
  /** 커서가 곡선을 따라 한 칸 오른다. */
  | { readonly kind: 'climb'; readonly from: number; readonly to: number }
  /**
   * 지나온 자리 전부가 한 번에 뿌리로 다시 붙는다.
   *
   * `was` 가 출발 그림의 계기값이다 — 붙이기 전 그 자리가 어디를 가리키고 있었나.
   * 이것이 있어야 앞 장면을 들추지 않고 출발 자리를 셈으로 복원한다 (S-scene).
   */
  | {
      readonly kind: 'compress';
      readonly moves: readonly { readonly node: number; readonly was: number }[];
    }
  /**
   * 말만 하는 걸음의 표식이 제자리에 앉는다.
   *
   * 뿌리에 닿았다·다 물어 보았다 는 숲을 옮기지 않아 흐를 것이 없었고, 그래서 걸음
   * 벽시계가 `stepMs` 그대로였다 — S-piece 의 얇은 걸음 잣대(800ms) 아래다. `stepMs`
   * 를 올리는 대신 그 걸음에만 얇은 운동을 준다.
   *
   * `mark` 는 **이 걸음에서 무엇이 새로 앉나**다. 그리는 쪽이 그 표식만 집는다.
   */
  | { readonly kind: 'settle'; readonly mark: 'cursor' | 'answer' | 'summary' };

/**
 * 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다.
 *
 * **수를 인자로 담지 않는다.** 칸 수는 장면의 구조에서 셈해지므로, 여기 실어
 * 두면 같은 수를 두 자리에서 세게 된다.
 */
export type PathCompressionCaption =
  | { readonly kind: 'queryBegin'; readonly node: number }
  | { readonly kind: 'climb'; readonly from: number; readonly to: number }
  /** 접기 전에 뿌리에 닿았다. 견줄 앞 자리가 아직 없다. */
  | { readonly kind: 'rootFirst'; readonly node: number }
  /** 접은 뒤에 뿌리에 닿았다. 전에는 몇 칸이었는지와 나란히 놓는다. */
  | { readonly kind: 'rootAfter'; readonly node: number }
  | { readonly kind: 'compress' }
  | { readonly kind: 'summary' }
  | { readonly kind: 'rewind' };

export type PathCompressionScene = {
  /**
   * 선언 그대로의 부모 포인터. `parent[i] === i` 면 뿌리다.
   *
   * 모든 장면이 같은 목록을 나눠 쥐지만 **누구도 고치지 않는다** — 고치면 과거가
   * 함께 바뀐다 (S-scene 의 Exception). 접기 전 칸 수는 여기를 밟아 셈한다.
   */
  readonly origin: readonly number[];
  /** 지금 부모 포인터. 접는 걸음이 갈아 끼운다. 지금 칸 수는 여기를 밟아 셈한다. */
  readonly parent: readonly number[];
  /** 뿌리의 자리. `origin` 에서 한 번 셈해 둔다. */
  readonly root: number;
  /**
   * 이번 물음에서 지나온 자리. 첫 칸이 물어본 자리다.
   *
   * 몇 칸을 올랐나는 이 목록의 길이에서 나온다 — 따로 세지 않는다.
   */
  readonly path: readonly number[];
  /** 커서가 화면에 있나. 총계가 뜨면 물러난다. */
  readonly cursorOn: boolean;
  /** 접었나. 뿌리에 닿았다는 말이 견줌을 담을지 가른다. */
  readonly folded: boolean;
  /**
   * 접은 뒤 다시 물어 답이 난 자리들, 물은 차례대로.
   *
   * 칸 수는 담지 않는다 — 자리 번호만 있으면 `origin` 과 `parent` 에서 둘 다
   * 셈해지고, 총계도 그 셈의 합이다.
   */
  readonly answered: readonly number[];
  /** 총계 줄이 떴나. 수 자체는 `answered` 에서 셈한다. */
  readonly summary: boolean;
  readonly step: PathCompressionStep | null;
  readonly caption: PathCompressionCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 자리 번호 목록을 **복사해** 읽는다. 참조를 쥐지 않는다 (S-scene). */
function readInts(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const item of v) out.push(num(item));
  return out;
}

/**
 * 접기 전후를 함께 셈하는 자리 — 어느 포인터 벌을 주느냐로 갈린다.
 *
 * 고리(순환) 자료를 대비해 자리 수만큼 오르면 멎는다. 화면에 나란히 뜨는 두 수가
 * **같은 함수**를 지나야 화면이 스스로 참이다.
 */
export function hopsToRoot(pointers: readonly number[], from: number): number {
  let cur = from;
  for (let i = 0; i < pointers.length; i += 1) {
    const up = pointers[cur];
    if (up === undefined || up === cur) return i;
    cur = up;
  }
  return pointers.length;
}

/**
 * 걸음이 고치는 것은 바탕이 아니다.
 *
 * `parent` 를 여기 넣으면 되감은 화면이 **이미 접힌 포인터**로 서고, 그 위에
 * algorithm 이 새로 셈한 처음 칸 수가 겹쳐 화면 안에서 두 수가 어긋난다. 바탕은
 * 아무도 고치지 않는 `origin` 과 거기서 나온 `root` 뿐이고, 나머지는 선언에서
 * 다시 셈한다.
 */
type Base = Pick<PathCompressionScene, 'origin' | 'root'>;

/** 처음 자리로 돌아간 장면. `initial` 과 `rewind` 가 같은 자리를 쓴다. */
function atStart(base: Base): PathCompressionScene {
  return {
    origin: base.origin,
    parent: [...base.origin],
    root: base.root,
    path: [],
    cursorOn: false,
    folded: false,
    answered: [],
    summary: false,
    step: null,
    caption: null,
  };
}

/** 자기 자신을 가리키는 자리. 없으면 0 으로 받는다. */
function rootOf(pointers: readonly number[]): number {
  const found = pointers.findIndex((p, i) => p === i);
  return found >= 0 ? found : 0;
}

export const pathCompressionScene: ScenePlan<PathCompressionScene> = {
  /**
   * 첫 장면 — 아무도 손대지 않은 포인터 다섯.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 다만
   * **참조로 쥐지 않는다** — 러너가 주는 객체는 mechanism 과 view 가 함께 쓰는 한
   * 벌이고 algorithm 이 제자리에서 고친다 (`parent[node] = root`). 참조를 쥐면
   * 되짚을 때 이미 접힌 포인터로 바탕을 그린다 (S-scene). `readInts` 가 새 배열을
   * 만든다.
   */
  initial(initialData: unknown): PathCompressionScene {
    const raw = (initialData ?? {}) as Record<string, unknown>;
    const origin = readInts(raw.parent);
    return atStart({ origin, root: rootOf(origin) });
  },

  reduce(scene: PathCompressionScene, event: FacetRuntimeEvent): PathCompressionScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 한 번의 물음이 시작된다. 지나온 자취를 새로 연다 — 커서는 건너뛰어 앉는다.
      case 'query-begin': {
        const node = num(p.node);
        return {
          ...scene,
          path: [node],
          cursorOn: true,
          step: { kind: 'begin', node },
          caption: { kind: 'queryBegin', node },
        };
      }

      // 한 칸 오른다. 자취가 한 칸 길어지고, 그 길이가 곧 올라온 칸 수다.
      case 'climb': {
        const from = num(p.from);
        const to = num(p.to);
        const last = scene.path[scene.path.length - 1];
        const path = last === from ? [...scene.path, to] : [from, to];
        return {
          ...scene,
          path,
          cursorOn: true,
          step: { kind: 'climb', from, to },
          caption: { kind: 'climb', from, to },
        };
      }

      // 뿌리에 닿았다. 말만 하는 걸음이라 흐르게 할 것이 없다.
      //
      // 접기 전이냐 뒤냐로 말이 갈린다 — 접은 뒤에만 견줄 앞 자리가 있다.
      // payload 의 `hopsBefore` 로 가르지 않는다. 그것은 수이고, 수는 장면의
      // 구조에서 셈해야 한다.
      case 'root-found': {
        const node = num(p.queriedNode);
        // 접기 전에는 커서가, 접은 뒤에는 방금 난 답 줄이 이 걸음의 표식이다.
        if (!scene.folded) {
          return {
            ...scene,
            step: { kind: 'settle', mark: 'cursor' },
            caption: { kind: 'rootFirst', node },
          };
        }
        return {
          ...scene,
          answered: [...scene.answered, node],
          step: { kind: 'settle', mark: 'answer' },
          caption: { kind: 'rootAfter', node },
        };
      }

      // 접는다 — 지나온 자리 전부가 한 번에 뿌리로 다시 붙는다.
      //
      // 붙이기 전 어디를 가리키고 있었는지는 여기서 계기값으로 실어 둔다. 그리는
      // 쪽이 앞 장면을 들추지 않고 출발 그림을 세우게 하는 것이 그 값의 몫이다.
      case 'compress': {
        const nodes = readInts(p.nodes);
        const parent = [...scene.parent];
        const moves: { node: number; was: number }[] = [];
        for (const node of nodes) {
          const was = parent[node];
          if (was === undefined) continue;
          moves.push({ node, was });
          parent[node] = scene.root;
        }
        return {
          ...scene,
          parent,
          folded: true,
          step: { kind: 'compress', moves },
          caption: { kind: 'compress' },
        };
      }

      // 총계가 남는다. 수는 `answered` 를 `origin` 과 `parent` 로 각각 밟아 낸다 —
      // payload 의 `totalBefore` · `totalAfter` 를 쓰지 않는다.
      case 'done':
        return {
          ...scene,
          summary: true,
          cursorOn: false,
          step: { kind: 'settle', mark: 'summary' },
          caption: { kind: 'summary' },
        };

      // 손으로 짚기 시작 — 자료는 그대로 두고 처음 자리로 돌아간다.
      //
      // 바탕을 **객체 리터럴로** 넘긴다. 변수를 넘기면 초과 속성 검사가 돌지 않아
      // 걸음이 고치는 `parent` 가 그대로 딸려 들어가도 타입이 막지 못한다.
      case 'rewind':
        return {
          ...atStart({ origin: scene.origin, root: scene.root }),
          caption: { kind: 'rewind' },
        };

      default:
        // 이 facet 의 algorithm 은 위 여섯만 발신한다. 그 밖의 것은 흘린다 (C2).
        return scene;
    }
  },
};
