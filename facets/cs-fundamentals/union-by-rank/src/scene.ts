/**
 * unionByRank 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드(`init` · `compareRoots` ·
 * `attach` · `growRank` · `rewind` · `markDone`)를 부르지 않고 그저 다음 장면을
 * 돌려준다는 것뿐이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`packages/core/src/runtime/scene.ts`).
 *
 * ── 이 조각의 주장이 무엇인가
 *
 * **어느 쪽이 높아서 위에 서는가.** 두 뿌리의 랭크가 배지로 나란히 뜨고, 낮은 쪽이
 * 높은 쪽 밑으로 들어가면 나무의 세로가 그대로이고 같을 때만 는다. 그러니 화면에
 * 뜨는 랭크와 눈에 보이는 세로 폭은 **같은 것의 두 얼굴**이어야 한다.
 *
 * ── 같은 수를 두 자리에서 세지 않는다
 *
 * 옮기기 전에는 그 둘이 갈려 있었다. 세로 폭은 stage 가 쥔 `parent` 배열에서 나왔고,
 * 배지의 수는 payload 가 실어 온 `rankA` · `rankB` · `loserRank` · `winnerRank` ·
 * `rank` 였다. 한 화면에 나란히 뜨는 두 항이 다른 출처였던 셈이라, 갈리는 날 그림이
 * 스스로 거짓이 된다 — 그리고 이 조각의 주장은 바로 그 둘이 같다는 것이다.
 *
 * 그래서 랭크를 **나무에서 센다.** `rankAt` 이 그 정본이고 payload 에서 오는 수는
 * 하나도 없다. 경로 압축이 없는 union-find 에서 뿌리의 랭크는 곧 그 밑에 달린
 * 서브트리의 깊이이므로, 세로로 몇 층인지 세면 그 수가 나온다.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * - **`stage.parent`** — 지금 숲이 어떤 모양인가. 배치·가지·배지 보임 여부가 전부
 *   여기서 나왔는데 `attach()` 가 제자리에서 고치고 `rewind()` 가 통째로 갈아
 *   끼웠다. 되짚기가 그 자리로 갈 길이 없었다.
 * - **`stage.rank`** — 자리마다의 랭크. 위와 같은 `let` 이고, 값의 출처가 payload 라
 *   화면의 세로와 어긋날 수 있었다. 이제 필드가 아니라 `rankAt` 의 셈이다.
 * - **`stage.n`** — 자리 수. `init()` 안에서만 세워졌고 `init()` 이 사라진다.
 * - **`type NodeState`** — 선언만 있고 값이 어디에도 저장되지 않는 타입이다. 어느
 *   자리가 견주는 중이고 어느 쪽이 졌는지가 오직 원의 `fill` · `stroke` 에만
 *   있었다 (프로토콜 3-1 의 ⑤). 이제 `step` 이 말한다.
 * - **`edges` Map 의 조회** — `layoutAndPlace` 가 `edges.get(i)` 로 "이 가지가 이미
 *   걸려 있나" 를 갈랐다. `let` 도 아니고 눈에 띄지도 않는 암묵 분기다. 가지는
 *   `parent` 에서 파생되므로 그 Map 자체가 그림의 손잡이로 내려앉는다.
 * - **배지의 `display` 와 `textContent`** — "이 자리가 뿌리인가" 와 그 랭크가 DOM
 *   속성에만 적혀 있었다. 둘 다 `parent` 에서 파생된다.
 *
 * ── 붙이는 운동의 출발 그림
 *
 * 진 쪽 서브트리가 통째로 미끄러져 붙는 것이 이 조각의 동사다. 그 출발 그림을
 * `prev` 에서 꺼내면 "`prev` 는 고르는 데만" 을 어긴다 (S-scene). 여기서는 꺼낼
 * 까닭도 없다 — **붙기 전 숲은 지금 숲에서 그 가지 하나만 떼면 나온다**
 * (`detached`). 그리는 쪽이 `layout(detached) → layout(parent)` 를 보간 하나로
 * 푼다.
 *
 * 좌표는 담지 않는다. 숲의 모양이 자리를 정하므로 `render` 가 캔버스에서 셈한다
 * (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 자리 번호만 담고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 방금 밟은 걸음. 머무는 강조(어느 자리가 견주는 중인가)와 지나가는 운동(무엇이
 * 미끄러지는가)을 겸한다 — 같은 자료라 둘로 나눌 까닭이 없다. 정적 그리기가 강조를
 * 세우고, `animate` 일 때만 운동이 얹힌다 (S-scene PREFER).
 *
 * 수는 하나도 없다. 랭크는 전부 `rankAt` 이 숲에서 센다.
 */
export type UnionByRankStep =
  /** 두 뿌리의 랭크를 나란히 놓고 견준다. */
  | { readonly kind: 'compare'; readonly a: number; readonly b: number }
  /** 진 쪽 뿌리가 서브트리째 이긴 쪽 밑으로 옮겨 붙는다. */
  | { readonly kind: 'attach'; readonly loser: number; readonly winner: number }
  /** 랭크가 같아 어쩔 수 없이 키가 하나 늘었다. */
  | { readonly kind: 'grow'; readonly root: number }
  /** 처음으로 되감았다. */
  | { readonly kind: 'rewound' }
  /** 이번 한 바퀴를 마쳤다. */
  | { readonly kind: 'done' };

export type UnionByRankScene = {
  /** 자리 수. **걸음이 고치지 않는 바탕**이다. */
  readonly n: number;
  /**
   * 지금의 가리킴. `parent[i] === i` 면 그 자리가 뿌리다.
   *
   * **걸음이 고치는 것이 이것이다.** 그래서 되감기의 바탕에 넣지 않는다 (아래 `Base`).
   * 배치·가지·배지·랭크가 전부 여기서 파생된다.
   */
  readonly parent: readonly number[];
  readonly step: UnionByRankStep | null;
};

/**
 * 되감기가 딛는 바탕 — 걸음이 **고치지 않는** 것만 추린다.
 *
 * `parent` 를 일부러 뺀다. 숲의 모양은 걸음이 고치는 것이라 바탕과 같은 급으로 묶어
 * 넘기면 되감은 화면이 **이미 다 합쳐진 숲**으로 서고, 그 위에 algorithm 이 처음부터
 * 다시 합치는 걸음이 겹친다 (프로토콜 4 절).
 *
 * 좁힌 타입이 실제로 막으려면 **호출부가 객체 리터럴**이어야 한다 — 변수를 넘기면
 * 초과 속성 검사가 돌지 않아 장면 전체가 그대로 통과한다.
 */
type Base = Pick<UnionByRankScene, 'n'>;

/** 아무도 아직 합쳐지지 않은 처음 숲 — 자리마다 제가 제 뿌리다. */
function atStart(base: Base): UnionByRankScene {
  return { n: base.n, parent: Array.from({ length: base.n }, (_, i) => i), step: null };
}

// ── 숲에서 세는 것들 ───────────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 이 아래를 지난다. 배지의 랭크도, 캡션의 랭크도, 랭크가
// 같은지 다른지의 판정도 — payload 에서 오는 수가 하나도 없다.

/** 그 자리가 뿌리인가. 배지가 뜨는 자리이기도 하다. */
export function isRoot(parent: readonly number[], id: number): boolean {
  return parent[id] === id;
}

/** 자리마다의 자식 목록. 오름차순 자리 번호 그대로라 배치가 순회 순서를 타지 않는다. */
export function childrenOf(n: number, parent: readonly number[]): number[][] {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const p = parent[i];
    if (p === undefined || p === i) continue;
    if (p < 0 || p >= n) continue;
    out[p]!.push(i);
  }
  return out;
}

/**
 * 그 자리 밑에 달린 서브트리의 깊이 — **이 조각이 랭크라 부르는 수**.
 *
 * 잎이면 0 이고, 한 층 내려갈 때마다 하나씩 는다. 경로 압축이 없으므로 이것이 곧
 * union-find 가 세는 랭크이고, 동시에 **화면에서 눈으로 세는 세로 층수**다. 그래서
 * 배지의 수와 나무의 생김새가 갈릴 수가 없다.
 *
 * 자료에 고리가 있어도 멎도록 밟은 자리를 기억한다 — 되짚기는 어떤 장면이든 그릴
 * 수 있어야 하고, 셈이 안 끝나면 화면이 통째로 선다.
 */
export function rankAt(n: number, parent: readonly number[], id: number): number {
  const kids = childrenOf(n, parent);
  const walk = (cur: number, seen: ReadonlySet<number>): number => {
    if (seen.has(cur)) return 0;
    const next = new Set(seen).add(cur);
    let deep = 0;
    for (const c of kids[cur] ?? []) deep = Math.max(deep, 1 + walk(c, next));
    return deep;
  };
  if (id < 0 || id >= n) return 0;
  return walk(id, new Set());
}

/**
 * 그 가지를 떼기 **전**의 숲.
 *
 * 붙이는 운동의 출발 그림이자, 랭크가 같았는지 달랐는지를 판정하는 자리다. `prev`
 * 를 들추지 않고 지금 장면과 걸음만으로 복원된다 — 붙이는 걸음이 바꾼 것은 가리킴
 * 하나뿐이기 때문이다 (S-scene).
 */
export function detached(parent: readonly number[], child: number): readonly number[] {
  return parent.map((p, i) => (i === child ? i : p));
}

/**
 * 붙이기 전 두 뿌리의 랭크가 같았나.
 *
 * 같았으면 키가 하나 늘 수밖에 없었고, 달랐으면 그대로다 — 이 조각의 결론이 갈리는
 * 자리라 판정을 한 곳에만 둔다. 두 항 모두 붙기 전 숲에서 센다.
 */
export function attachWasTie(
  scene: UnionByRankScene,
  step: Extract<UnionByRankStep, { kind: 'attach' }>,
): boolean {
  const before = detached(scene.parent, step.loser);
  return rankAt(scene.n, before, step.loser) === rankAt(scene.n, before, step.winner);
}

// ── 선언 읽기 ──────────────────────────────────────────────────────────────

/** 자리 수를 선언에서 읽는다. 값만 베끼므로 넘겨받은 객체를 참조로 쥐지 않는다. */
function readCount(initialData: unknown): number {
  const d = (initialData ?? {}) as { n?: unknown };
  if (typeof d.n !== 'number' || !Number.isFinite(d.n) || d.n <= 0) return 0;
  return Math.floor(d.n);
}

/** 걸음이 실어 오는 자리 번호. 범위 밖이면 그 걸음을 조용히 버린다 (C9). */
function readSlot(v: unknown, n: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (v < 0 || v >= n) return null;
  return v;
}

export const unionByRankScene: ScenePlan<UnionByRankScene> = {
  /**
   * 첫 장면은 아직 아무것도 합쳐지지 않은 숲이다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 이벤트가 없으므로 선언에서 읽는다. 자리 수
   * 하나뿐이라 값으로 베껴 담으면 끝난다 (S-scene MUST).
   */
  initial(initialData: unknown): UnionByRankScene {
    return atStart({ n: readCount(initialData) });
  },

  reduce(scene: UnionByRankScene, event: FacetRuntimeEvent): UnionByRankScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 합칠 두 뿌리를 나란히 짚는다. 랭크는 싣지 않는다 — 그 숲에서 센다.
      case 'rank-compare': {
        const a = readSlot(p.rootA, scene.n);
        const b = readSlot(p.rootB, scene.n);
        if (a === null || b === null || a === b) return scene;
        if (!isRoot(scene.parent, a) || !isRoot(scene.parent, b)) return scene;
        return { ...scene, step: { kind: 'compare', a, b } };
      }

      // 진 쪽이 이긴 쪽 밑으로 들어간다. 숲이 달라지는 유일한 걸음이다.
      case 'attach': {
        const loser = readSlot(p.loser, scene.n);
        const winner = readSlot(p.winner, scene.n);
        if (loser === null || winner === null || loser === winner) return scene;
        // 뿌리가 아닌 자리를 다시 붙이면 고리가 생긴다. 그런 걸음은 버린다.
        if (!isRoot(scene.parent, loser) || !isRoot(scene.parent, winner)) return scene;
        const parent = scene.parent.slice();
        parent[loser] = winner;
        return { ...scene, parent, step: { kind: 'attach', loser, winner } };
      }

      // 랭크가 같아 키가 하나 늘었다. **숲은 이미 그만큼 자란 뒤다** — 붙는 순간
      // 세로가 늘었고, 이 걸음은 그 사실에 이름을 붙인다. 그래서 새 랭크 값을
      // 싣지 않는다 (싣으면 배지와 다른 출처가 된다).
      case 'rank-grow': {
        const root = readSlot(p.root, scene.n);
        if (root === null || !isRoot(scene.parent, root)) return scene;
        return { ...scene, step: { kind: 'grow', root } };
      }

      // 손으로 짚기 시작 — 처음 숲으로 돌아간다.
      //
      // 객체 리터럴로 넘긴다. 변수를 넘기면 초과 속성 검사가 돌지 않아 좁힌 타입이
      // 아무것도 막지 못한다 (프로토콜 4 절).
      case 'rewind':
        return { ...atStart({ n: scene.n }), step: { kind: 'rewound' } };

      case 'done':
        return { ...scene, step: { kind: 'done' } };

      default:
        // 이 facet 의 algorithm 은 위가 전부다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
