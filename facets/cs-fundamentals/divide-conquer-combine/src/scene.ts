/**
 * divideConquerCombine 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 다음
 * 장면을 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 본체는 "어느 자리가 무엇을 들고 있나" 다
 *
 * 자리(프레임) 하나마다 값 목록 하나. 그것이 전부다. 층이 몇 개인지도, 어느 자리가
 * 문제이고 어느 자리가 답인지도, 칸이 몇 개인지도 전부 그 목록과 부모-자식 잇기에서
 * 파생된다. **화면에 나란히 뜨는 수가 갈릴 자리가 없다** — 캡션의 "3번 잘랐다" 와
 * 배지의 `↓3` 이 같은 배열(`splitSeq`)을 센다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * 명령형 stage 는 `let` 이 거의 없었다. 상태는 전부 **`const nodes: Map<string,
 * StageNode>`** 안에 있었고, `StageNode` 는 DOM 손잡이(`group`)와 뜻·수치(`values` ·
 * `state` · `splitOrder` · `mergeOrder`)가 한 객체로 묶인 꼴이었다. 게다가 걸음
 * 함수가 그 알맹이를 **제자리에서 고쳤다** (`parent.splitOrder = spec.order` ·
 * `parent.values = spec.values.slice()` · `node.state = 'answer'`). `const` 라
 * `let` grep 을 통과하고, 타입 선언만 보아서는 그것이 "지금 몇 층까지 갈렸나 · 어느
 * 층이 합쳐졌나" 라는 **이 조각의 결론 자체**인 줄 알기 어렵다.
 *
 * - **`nodes` 의 `values` · `state`** — 그 자리가 문제를 들었나 답을 들었나. 이제
 *   `frames[].values` 와 `frames[].settled` 다.
 * - **`nodes` 의 `splitOrder` · `mergeOrder`** — 배지에 새기는 차례. 걸음이 실어 온
 *   `order` 를 그대로 받아 적고 있었다. 이제 `splitSeq` · `mergeSeq` 의 자리 번호라
 *   **발신 순서가 그대로 답이 된다** (algorithm 의 `order` 는 걷어냈다).
 * - **`links: Map<string, SVGLineElement>`** — 어느 가지가 그려졌나. `let` 도
 *   `Set.has` 도 아닌 조회 명부였다. 이제 `parentId` 에서 파생된다.
 * - **`rootId`** — 뿌리가 누구인가. stage 가 `makeNode('r', …)` 로 id 를 **손수
 *   박아** 두었다. 이름을 정하는 자리가 둘이었다. 이제 `rootId` 하나이고 그 이름은
 *   발신의 `target` 에서만 온다.
 * - **`emphasized`** — 다 끝났나. 논증 단계를 stage 가 혼자 쥔 `let` 이었다. 이제
 *   `concluded` 다.
 * - **테(ring) 요소** — `finish()` 가 `frameLayer` 에 직접 붙이던 `rect`. "끝났다"
 *   를 DOM 에만 적어 둔 것이라 되짚으면 복원되지 않았다. 이제 `concluded` 에서
 *   파생된다.
 * - **부모의 **문제** 값** — 합쳐진 뒤에는 `values` 가 답으로 덮여 사라졌다. 이제
 *   `problemValuesOf` 가 아래 잎에서 셈한다 (잎의 값은 어느 걸음에서도 안 바뀐다).
 *
 * ── 좌표도 문안도 담지 않는다
 *
 * 자리는 부모-자식 잇기가 정하는 깊이·차례에서 그리는 쪽이 캔버스에 역산한다
 * (S-piece). 캡션은 무엇을 말할지만 담고 문자는 그리는 쪽이 `params.t` 로 만든다
 * (C10) — 쪼갬/합침 횟수도 싣지 않는다. 배지의 수와 두 출처가 되기 때문이다.
 *
 * ── 어느 자리의 일인지는 `target` 만 말한다
 *
 * 걸음이 가리키는 자리의 이름을 payload 에서 또 받지 않는다. 수가 아니라 이름일
 * 뿐 "두 자리에서 세기" 와 같은 병이고, 한쪽만 고치면 조용히 갈린다. 식별자 파싱은
 * `parseTarget` 을 경유한다 (원칙 4).
 */

import { parseTarget } from '@ffacet/core/runtime';
import type { ScenePlan, FacetRuntimeEvent } from '@ffacet/core/runtime';
import type { DcSide } from './algorithm.js';

export type { DcSide };

/**
 * 재귀 나무의 한 자리.
 *
 * 깊이도 차례도 담지 않는다 — `parentId` 와 `side` 를 따라 오르면 둘 다 나오고,
 * 담아 두면 같은 물음에 두 답이 생긴다 (걸음 payload 의 `depth` 를 걷어낸 것과 같은
 * 까닭이다).
 */
export type DcFrame = {
  readonly id: string;
  readonly parentId: string | null;
  readonly side: DcSide | null;
  /** 지금 들고 있는 것. 내려갈 때는 문제, 올라온 뒤에는 답이다. */
  readonly values: readonly number[];
  /** 답이 되었나. 낱개가 되어 바닥에 닿았거나, 두 답이 합쳐져 올라왔거나. */
  readonly settled: boolean;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * `merge` 만 계기값을 하나 싣는다 — 값이 **어느 쪽에서** 차례로 올라왔는가. 그것이
 * 합침의 유일한 판정이고, 나머지(부모의 값·각 값이 온 칸 번호)는 전부 거기서
 * 풀린다. `prev` 를 들추지 않고 출발 그림을 셈으로 복원하는 표식이다 (S-scene).
 */
export type DcMark =
  | { readonly kind: 'seed'; readonly id: string }
  | { readonly kind: 'split'; readonly id: string }
  | { readonly kind: 'settled'; readonly ids: readonly string[] }
  | { readonly kind: 'merge'; readonly id: string; readonly from: readonly DcSide[] }
  | { readonly kind: 'conclude' };

/** 캡션이 말할 것. 문안도 수도 아니고 **무엇을 말할지**뿐이다 (C10). */
export type DcCaption =
  | { readonly kind: 'problem' }
  | { readonly kind: 'splitRoot' }
  | { readonly kind: 'split' }
  | { readonly kind: 'bottom' }
  | { readonly kind: 'merge' }
  | { readonly kind: 'mergeRoot' }
  | { readonly kind: 'done' };

export type DivideConquerCombineScene = {
  /** 뿌리의 이름. algorithm 이 정한 것을 그대로 쓴다. 아직 없으면 `null`. */
  readonly rootId: string | null;
  /** 서 있는 자리들. 층 순서로 쌓이므로 부모가 늘 자식보다 앞에 온다. */
  readonly frames: readonly DcFrame[];
  /** 쪼개진 차례. 자리 번호 + 1 이 곧 `↓n` 의 n 이고 길이가 곧 쪼갬 횟수다. */
  readonly splitSeq: readonly string[];
  /** 합쳐진 차례. `↑n` 과 합침 횟수가 여기서 나온다. */
  readonly mergeSeq: readonly string[];
  /** 맨 처음 쪼갠 자리가 맨 마지막에 합쳐졌다 — 정지 화면에 남는 결론. */
  readonly concluded: boolean;
  readonly mark: DcMark | null;
  readonly caption: DcCaption | null;
};

/**
 * 아직 아무것도 놓이지 않은 화면.
 *
 * 되감기도 여기로 돌아간다 — 걸음이 고치는 것을 바탕으로 넘길 여지가 없다. 뒤이어
 * `seed` 가 다시 와서 문제를 놓는다.
 */
const EMPTY: DivideConquerCombineScene = {
  rootId: null,
  frames: [],
  splitSeq: [],
  mergeSeq: [],
  concluded: false,
  mark: null,
  caption: null,
};

// ── 구조에서 세는 것들 ──────────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 이 아래를 지난다. 배지의 차례도, 캡션의 횟수도, 칸의
// 개수도 — payload 에서 곧바로 오는 수가 하나도 없다.

export function frameOf(
  scene: DivideConquerCombineScene,
  id: string,
): DcFrame | null {
  return scene.frames.find((f) => f.id === id) ?? null;
}

/** 그 자리에서 갈려 나온 둘. 아직 갈리지 않았으면 둘 다 `null`. */
export function childrenOf(
  scene: DivideConquerCombineScene,
  id: string,
): { left: DcFrame | null; right: DcFrame | null } {
  let left: DcFrame | null = null;
  let right: DcFrame | null = null;
  for (const f of scene.frames) {
    if (f.parentId !== id) continue;
    if (f.side === 'L') left = f;
    else if (f.side === 'R') right = f;
  }
  return { left, right };
}

/** 몇 번째로 쪼개진 자리인가. 아직 안 쪼개졌으면 0. */
export function splitBadge(scene: DivideConquerCombineScene, id: string): number {
  return scene.splitSeq.indexOf(id) + 1;
}

/** 몇 번째로 합쳐진 자리인가. 아직 안 합쳐졌으면 0. */
export function mergeBadge(scene: DivideConquerCombineScene, id: string): number {
  return scene.mergeSeq.indexOf(id) + 1;
}

/**
 * `from` 이 말하는 차례대로, 각 값이 **어느 쪽 몇 번 칸**에서 왔는지 푼다.
 *
 * `reduce` 가 부모의 값을 셈할 때도, 그리는 쪽이 값이 오르는 길을 그릴 때도 이
 * 한 함수를 지난다. 그래서 부모 칸의 글자와 그 칸으로 날아온 복제본의 글자가
 * 갈릴 수가 없다.
 */
export function mergeSources(
  from: readonly DcSide[],
): { side: DcSide; slot: number }[] {
  let i = 0;
  let j = 0;
  return from.map((side) =>
    side === 'L' ? { side, slot: i++ } : { side, slot: j++ },
  );
}

/**
 * 그 자리가 **처음 받았던 문제**.
 *
 * 합쳐진 뒤에는 `values` 가 답으로 덮이지만, 아래 잎의 값은 어느 걸음에서도 바뀌지
 * 않으므로 잎을 왼쪽부터 이으면 그대로 나온다. 값이 올라오는 동안 부모 자리가
 * 무엇을 들고 있었는지 그릴 때 쓴다 — `prev` 를 들추지 않고 셈으로 복원한다.
 */
export function problemValuesOf(
  scene: DivideConquerCombineScene,
  id: string,
): readonly number[] {
  const { left, right } = childrenOf(scene, id);
  if (!left || !right) return frameOf(scene, id)?.values ?? [];
  return [...problemValuesOf(scene, left.id), ...problemValuesOf(scene, right.id)];
}

// ── 선언 읽기 ──────────────────────────────────────────────────────────────

/** 수 배열을 **복사해** 읽는다. 참조를 쥐면 과거가 함께 바뀐다 (S-scene). */
function readNumbers(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is number => typeof v === 'number');
}

function readSides(raw: unknown): DcSide[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is DcSide => v === 'L' || v === 'R');
}

/** `node:<이름>` 하나에서 자리 이름을 꺼낸다. 식별자 파싱은 `parseTarget` 경유 (원칙 4). */
function nodeId(target: FacetRuntimeEvent['target']): string | null {
  if (typeof target !== 'string') return null;
  const parsed = parseTarget(target);
  if (!parsed || parsed.prefix !== 'node' || parsed.id === '') return null;
  return parsed.id;
}

/**
 * `node:<이름>` 여럿에서 자리 이름들을 꺼낸다.
 *
 * 한 층이 **한꺼번에** 답이 되는 걸음이라 목록이 곧 그 걸음의 대상이다 — 같은
 * 목록을 payload 에 또 담지 않는다.
 */
function nodeIds(target: FacetRuntimeEvent['target']): string[] {
  if (!Array.isArray(target)) return [];
  const out: string[] = [];
  for (const raw of target) {
    const id = nodeId(raw);
    if (id !== null) out.push(id);
  }
  return out;
}

export const divideConquerCombineScene: ScenePlan<DivideConquerCombineScene> = {
  /**
   * 첫 장면은 비어 있다.
   *
   * 초기 자료를 참조로도 값으로도 담지 않는다 — 첫 걸음인 `seed` 가 문제를 놓는
   * 것이 이 조각의 논증이고, 놓기 전에 이미 놓여 있으면 그 걸음이 할 말이 없다
   * (S-scene).
   */
  initial(): DivideConquerCombineScene {
    return EMPTY;
  },

  reduce(
    scene: DivideConquerCombineScene,
    event: FacetRuntimeEvent,
  ): DivideConquerCombineScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 문제 하나가 뿌리에 놓인다. 뿌리의 이름도 여기서 온다.
      case 'seed': {
        const id = nodeId(event.target);
        if (id === null) return scene;
        return {
          ...EMPTY,
          rootId: id,
          frames: [
            { id, parentId: null, side: null, values: readNumbers(p.values), settled: false },
          ],
          mark: { kind: 'seed', id },
          caption: { kind: 'problem' },
        };
      }

      // 한 자리가 절반씩 두 자리로 갈라져 내려간다.
      //
      // 자식의 값은 payload 로 받지 않는다 — 부모의 값을 `mid` 에서 자르면 나오고,
      // 그래야 "부모 칸 수 = 자식 칸 수의 합" 이 구조적으로 어긋날 수 없다. 자를
      // 자리만이 걸음이 내리는 판정이라 그것만 싣는다.
      case 'split': {
        const id = nodeId(event.target);
        const leftId = p.leftId;
        const rightId = p.rightId;
        const mid = p.mid;
        if (
          id === null ||
          typeof leftId !== 'string' ||
          typeof rightId !== 'string' ||
          typeof mid !== 'number'
        ) {
          return scene;
        }
        const parent = frameOf(scene, id);
        if (!parent) return scene;
        return {
          ...scene,
          frames: [
            ...scene.frames,
            {
              id: leftId,
              parentId: id,
              side: 'L',
              values: parent.values.slice(0, mid),
              settled: false,
            },
            {
              id: rightId,
              parentId: id,
              side: 'R',
              values: parent.values.slice(mid),
              settled: false,
            },
          ],
          splitSeq: [...scene.splitSeq, id],
          mark: { kind: 'split', id },
          caption: { kind: id === scene.rootId ? 'splitRoot' : 'split' },
        };
      }

      // 바닥. 낱개는 이미 답이라 그 층이 한꺼번에 답이 되고 방향이 바뀐다.
      case 'layer-settled': {
        const ids = nodeIds(event.target);
        if (ids.length === 0) return scene;
        return {
          ...scene,
          frames: scene.frames.map((f) => (ids.includes(f.id) ? { ...f, settled: true } : f)),
          mark: { kind: 'settled', ids },
          caption: { kind: 'bottom' },
        };
      }

      // 두 답이 부모 자리로 되짚어 올라 하나가 된다.
      //
      // 부모의 값은 payload 로 받지 않는다. `from` 이 말하는 차례대로 자식의 칸을
      // 꺼내면 나오고, 그래야 부모 칸의 글자와 올라오는 복제본의 글자가 한 출처다.
      // 합쳐질 두 자식의 이름도 받지 않는다 — 이미 갈라져 나무에 있다.
      case 'merge': {
        const id = nodeId(event.target);
        const from = readSides(p.from);
        if (id === null || from.length === 0) return scene;
        const { left, right } = childrenOf(scene, id);
        if (!left || !right) return scene;
        const values: number[] = [];
        for (const { side, slot } of mergeSources(from)) {
          const v = (side === 'L' ? left.values : right.values)[slot];
          if (typeof v !== 'number') return scene;
          values.push(v);
        }
        return {
          ...scene,
          frames: scene.frames.map((f) =>
            f.id === id ? { ...f, values, settled: true } : f,
          ),
          mergeSeq: [...scene.mergeSeq, id],
          mark: { kind: 'merge', id, from },
          caption: { kind: id === scene.rootId ? 'mergeRoot' : 'merge' },
        };
      }

      // 다 끝났다. 쪼갬/합침 횟수는 싣지 않는다 — `splitSeq` · `mergeSeq` 가 센다.
      case 'done':
        return {
          ...scene,
          concluded: true,
          mark: { kind: 'conclude' },
          caption: { kind: 'done' },
        };

      // 손으로 짚기 시작 — 아무것도 놓이지 않은 화면으로 돌아간다.
      case 'rewind':
        return EMPTY;

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
