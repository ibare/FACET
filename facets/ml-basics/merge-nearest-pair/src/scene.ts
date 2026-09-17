/**
 * mergeNearestPair 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 의 `let` 이 0 건, 조회로 갈리는 분기도 0 건이었다. 숨은 상태가 없다는
 * 뜻이 아니라 **화면이 통째로 상태**였다는 뜻이고, projector 가 81 줄로 이 도메인에서
 * 가장 얇았던 것도 같은 신호다. 실제로 stage 의 선언과 SVG 속성에 흩어져 있었다
 * (프로토콜 3-1 의 ⑤ 자리).
 *
 * - `const nodes = new Map<string, TreeNode>()` — **나무의 모양이 통째로 여기 있었다.**
 *   `TreeNode = { x, y, span }` 은 손잡이가 아니라 *수치*다. `x`·`y` 는 픽셀이고
 *   `span` 은 그 매듭이 덮는 잎의 범위 — 곧 "무엇과 무엇이 합쳐졌나" 의 유일한
 *   보관처였다. `const` 라 `let` grep 을 통과한다. 지금은 `joins` 하나에서 매듭이
 *   파생되고 자리는 그리는 쪽이 셈한다.
 * - `const chips = new Map<string, SVGRectElement>()` — **그 맵에 자리가 있느냐가 곧
 *   "그 무리가 지금 서 있나" 였다.** `chips.delete(leftId)` · `chips.set(nodeId, a)` 가
 *   무리 집합을 제자리에서 고쳤다. 값은 DOM 손잡이인데 *키*가 상태였다.
 * - `const branches: Branch[]` — 걸린 가로대의 높이 목록. **이 조각의 결론**(낮은
 *   넷과 높은 셋)이 여기 있었고 `finish()` 만 읽었다. `const` 인데 `branches.push`
 *   로 알맹이가 제자리에서 자란다.
 * - `const dots = new Map<string, SVGCircleElement>()` 의 `fill`·`r` — 이 점이 이번에
 *   골라진 둘인가. 한 요소의 두 속성에 국면이 실렸다.
 * - `gEdges` 의 **자식들** — 고른 실이 쌓여 무리의 모양이 되는데 어떤 변수도 그것을
 *   말하지 않았다. `gScan` 의 자식들은 그 반대로, 재 본 후보가 **지워지는** 자리였다.
 * - `countText.textContent` — 지금 몇 무리인가. 이제 `remainingOf` 가 센다.
 * - `let generation` — 되감은 횟수. 기계장치라 장면이 아니라 세대 빗장으로 남는다.
 *
 * 그리고 **DOM 되읽기가 둘** 있었다 — `fuse` 가 `rect.getAttribute('x')` ·
 * `('width')` 로 칸이 자라날 **출발값을 화면에서 되읽었다** (프로토콜 4 절 ④).
 * 되짚어 세운 직후에는 그것이 옛 화면의 칸이라 칸이 엉뚱한 데서 출발한다. 지금은
 * `beforeTreeOf` 가 자취를 한 칸 물려 셈하므로 `prev` 도 화면도 들추지 않는다.
 *
 * ── 이행이 화면을 고친 자리 — "가장" 이 지워지고 있었다
 *
 * 이 조각의 주장은 "**언제나 가장 가까운 짝을 합친다**" 이고 무게는 *가장* 에 있다.
 * 그런데 옛 화면은 후보 실을 다 뻗어 본 뒤 `r.line.remove()` 로 **진 후보를 전부
 * 지우고** 고른 하나만 남겼다. 그래서 어느 걸음의 정지 화면에도 *다른 짝들이 더
 * 멀었다* 는 사실이 없었고, "가장" 은 캡션 글자에만 남았다 (프로토콜 4 절 "한 축에
 * 값을 셋 이상 욱여넣지 않는다" · "조각의 주장이 마지막 화면에 안 남아 있는 수가
 * 있다").
 *
 * 고친 길은 어휘를 두 축으로 가르는 것이다.
 *
 *   **이은 실** (성한 선, 텍스트 색) = 실제로 합쳐진 자국. 걸음마다 쌓인다.
 *   **재 본 실** (점선, 옅은 색)     = 이번 걸음에 재어 보고 진 후보. 서 있다.
 *
 * 그리고 완주 화면에도 남게 하려고, 가로대마다 **그때 다음으로 가까웠던 높이**를
 * 같은 폭의 옅은 점선 가로대로 그 위에 걸었다 (`runnerUpOf`). 고른 것이 늘 그
 * 아래에 서므로 "고른 것이 더 낮았다" 가 여섯 매듭에서 그림으로 읽힌다 (마지막
 * 합침은 잴 쌍이 하나뿐이라 견줄 것이 없다).
 *
 * ── 화면에 나란히 뜨는 수는 한 출처에서만 나온다
 *
 * 옛 발신은 `step` · `leftId` · `rightId` · `nodeId` · `height` · `remaining` 을 전부
 * 실어 보냈다. 전부 구조에서 세지는 것이라 걷어냈다.
 *
 * - `step` · `nodeId` — 몇 번째 합침인가는 `joins.length` 가 센다. 무리 이름도 여기서
 *   짓는다 (`m1`~). algorithm 이 같은 이름을 따로 짓던 코드가 함께 죽었고, 그러면서
 *   algorithm 의 `Cluster` 에서 `id` 필드가 통째로 없어졌다 — 곧 무리에 이름을 붙이는
 *   규칙이 두 곳에 적혀 있던 자리였다.
 * - `remaining` — `dots.length - joins.length` 다.
 * - `leftId` · `rightId` — 고른 두 점을 품은 무리가 곧 합쳐지는 둘이다 (단일 연결이라
 *   그 두 점은 반드시 합쳐지는 두 무리에 하나씩 있다). `holderOf` 가 자취에서 찾는다.
 * - `height` — **고른 짝의 두 점 사이 거리다.** 화면이 그 선을 그리므로 그리는 쪽이
 *   재는 것이 옳다. 실어 오면 가로대의 높이와 캡션의 수가 다른 출처가 된다.
 *
 * **남긴 것은 판정 둘뿐이다** — `links`(이 걸음에 잰 무리쌍은 이것들이다)와
 * `pickFrom`/`pickTo`(그중 이것이 가장 가까웠다). 무리쌍의 거리를 재어 가장 가까운
 * 것을 고르는 셈은 **이 조각의 알고리즘 그 자체**라 내주지 않는다 (프로토콜 4 절
 * B 갈래의 경계). 반대로 두 점 사이의 거리는 바탕 좌표에서 곧바로 나오므로 장면이
 * 잰다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다 — 점이 놓일 자리도 잎의 가로 자리도 자의 눈금도 캔버스에서
 * 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 담는 것은 **값**(점의 좌표)과
 * **구조**(무엇이 무엇과 합쳐졌나)뿐이고, 픽셀로 옮기는 일은 `render` 가 한다.
 *
 * 문안도 담지 않는다. `step` 은 무엇을 흐르게 할지만 말하고, 캡션이 말할 것은 장면
 * 상태에서 파생되며 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 바탕의 점 하나. 선언에 적힌 차례가 곧 잎의 가로 차례다. */
export type MergeDot = { id: string; x: number; y: number };

/** 무리쌍 하나 — 그 거리를 실현한 점 두 개의 이름 (단일 연결). */
export type MergePair = { from: string; to: string };

/**
 * 합침 하나.
 *
 * `links` 는 그 걸음에 잰 무리쌍 전부이고 `pick` 은 그중 가장 가까웠던 것이다.
 * 둘 다 걸음이 내리는 **판정**이라 발신이 싣는다. 나머지(이름 · 높이 · 남은 수)는
 * 여기서 파생된다.
 */
export type MergeJoin = {
  /** 합쳐 생긴 무리의 이름. 합친 차례에서 나온다 (`m1`~). */
  nodeId: string;
  /** 합쳐진 무리 하나 — `pick.from` 을 품고 있던 무리. */
  leftId: string;
  /** 합쳐진 무리 둘 — `pick.to` 를 품고 있던 무리. */
  rightId: string;
  /** 이 걸음에 잰 무리쌍 전부. *가장* 이 그림에 서는 재료다. */
  links: readonly MergePair[];
  /** 그중 가장 가까웠던 쌍. */
  pick: MergePair;
};

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 실이 뻗는 출발점도, 기둥이 올라가는 출발 높이도, 칸이
 * 자라는 출발 폭도 `beforeTreeOf` 가 자취에서 셈한다. `prev` 를 들출 까닭이 없다
 * (S-scene).
 */
export type MergeStep =
  /** 무리쌍을 재고 가장 가까운 둘이 합쳐져 그 거리만큼 올라가 걸린다. */
  | { kind: 'merge' }
  /** 걸린 높이들이 매듭에서 떨어져 나와 자로 옮겨 붙는다. */
  | { kind: 'gather' };

export type MergeNearestPairScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /**
   * 무리로 묶을 점들.
   *
   * **이 장면의 척도가 여기서 나온다** — 왼쪽 무대의 가로세로 축척도, 잎이 나눠
   * 앉는 칸도 이 목록 **전체**에서 정해진다. 담는 것은 좌표가 아니라 **값의 범위**다.
   */
  dots: readonly MergeDot[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 합친 차례대로의 합침들. 나무의 모양이 전부 여기서 나온다. */
  joins: readonly MergeJoin[];
  /** 걸린 높이들이 자로 모였나. 맺음 화면인지를 가르는 유일한 상태다. */
  gathered: boolean;

  step: MergeStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `joins` 도 `gathered` 도 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 다 자란 나무를 단 채로 서고, 그 위에 algorithm 이 처음부터 다시 세우는 것이
 * 겹친다 (S-scene).
 */
type Base = Pick<MergeNearestPairScene, 'dots'>;

/**
 * 아무것도 합쳐지지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): MergeNearestPairScene {
  return { dots: base.dots, joins: [], gathered: false, step: null };
}

// ── unknown 좁히개 — 생산자가 같은 패키지라도 경계는 경계다 (C9) ──────────────

function fields(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toPairs(v: unknown): MergePair[] {
  if (!Array.isArray(v)) return [];
  const out: MergePair[] = [];
  for (const item of v) {
    const rec = fields(item);
    if (typeof rec?.from !== 'string' || typeof rec.to !== 'string') continue;
    out.push({ from: rec.from, to: rec.to });
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ───────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 가로대의 높이도 캡션의 수도 자에 옮겨 붙는
// 눈금도 같은 함수를 부르므로 갈릴 자리가 없다.

/** 두 점 사이의 거리. 걸린 높이가 곧 이 값이다. */
export function gapOf(dots: readonly MergeDot[], pair: MergePair): number {
  const a = dots.find((d) => d.id === pair.from);
  const b = dots.find((d) => d.id === pair.to);
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 나무의 매듭 하나.
 *
 * 좌표가 아니라 **구조**다 — 어느 잎을 덮는가와 얼마나 높이 걸렸는가만 말하고,
 * 픽셀로 옮기는 일은 그리는 쪽이 한다 (S-piece).
 */
export type MergeKnot = {
  id: string;
  /** 덮는 잎의 차례들, 오름차순. 잎이면 자기 하나. */
  leaves: readonly number[];
  /** 걸린 높이 = 고른 짝의 거리. 잎은 0. */
  height: number;
  /** 아래 두 매듭의 이름. 잎이면 null. */
  children: readonly [string, string] | null;
};

/** 자취를 얹어 얻는 나무. `standing` 은 지금 서 있는 무리들이다. */
export type MergeTree = {
  knots: ReadonlyMap<string, MergeKnot>;
  /** 지금 서 있는 무리의 이름들. 합쳐진 것은 빠진다. */
  standing: readonly string[];
};

/** `joins` 를 차례로 얹어 나무를 세운다. 잎은 선언에 적힌 차례 그대로다. */
export function treeOf(dots: readonly MergeDot[], joins: readonly MergeJoin[]): MergeTree {
  const knots = new Map<string, MergeKnot>();
  const standing = new Set<string>();
  for (let i = 0; i < dots.length; i += 1) {
    const dot = dots[i];
    if (!dot) continue;
    knots.set(dot.id, { id: dot.id, leaves: [i], height: 0, children: null });
    standing.add(dot.id);
  }
  for (const join of joins) {
    const left = knots.get(join.leftId);
    const right = knots.get(join.rightId);
    if (!left || !right) continue;
    knots.set(join.nodeId, {
      id: join.nodeId,
      leaves: [...left.leaves, ...right.leaves].sort((a, b) => a - b),
      height: gapOf(dots, join.pick),
      children: [join.leftId, join.rightId],
    });
    standing.delete(join.leftId);
    standing.delete(join.rightId);
    standing.add(join.nodeId);
  }
  return { knots, standing: [...standing] };
}

/** 지금 선 나무. */
export function standingTreeOf(scene: MergeNearestPairScene): MergeTree {
  return treeOf(scene.dots, scene.joins);
}

/**
 * 마지막 합침이 오기 **전**의 나무.
 *
 * 기둥이 올라가는 출발 높이와 띠의 칸이 자라는 출발 폭이 여기서 나온다. 자취를 한
 * 칸 물려 셈하므로 `prev` 도 화면도 들추지 않는다 — 어느 걸음에서 와도 같은 데서
 * 출발한다 (S-scene).
 */
export function beforeTreeOf(scene: MergeNearestPairScene): MergeTree {
  return treeOf(scene.dots, scene.joins.slice(0, -1));
}

/** 방금 한 합침. 아직 하나도 안 합쳤으면 null. */
export function lastJoinOf(scene: MergeNearestPairScene): MergeJoin | null {
  return scene.joins[scene.joins.length - 1] ?? null;
}

/** 지금 몇 무리인가. 합칠 때마다 하나씩 줄어든다. */
export function remainingOf(scene: MergeNearestPairScene): number {
  return Math.max(0, scene.dots.length - scene.joins.length);
}

/** 합친 차례대로의 걸린 높이들. */
export function heightsOf(scene: MergeNearestPairScene): number[] {
  return scene.joins.map((join) => gapOf(scene.dots, join.pick));
}

/**
 * 그 걸음에 **다음으로** 가까웠던 거리. 잰 쌍이 하나뿐이면 null.
 *
 * 이것이 화면에 서야 "가장" 이 그림에 남는다 — 고른 높이 위에 이 눈금이 서므로
 * 진 후보가 더 멀었다는 것이 정지 화면에서 읽힌다.
 */
export function runnerUpOf(scene: MergeNearestPairScene, join: MergeJoin): number | null {
  const gaps = join.links.map((link) => gapOf(scene.dots, link)).sort((a, b) => a - b);
  return gaps.length < 2 ? null : (gaps[1] ?? null);
}

/**
 * 낮게 몰린 것과 높이 뛴 것의 수.
 *
 * 걸린 높이들을 줄 세워 **가장 크게 벌어진 자리**에서 가른다. 그 빈 자리가 곧
 * "여기부터는 남이다" 라고 말하는 대목이라, 이 조각의 결론을 상수로 적어 두지 않고
 * 그림과 같은 자료에서 셈한다 (프로토콜 4 절 "결론을 셈하지 않고 적어 둔 자리").
 */
export function lowHighOf(heights: readonly number[]): { low: number; high: number } {
  if (heights.length < 2) return { low: heights.length, high: 0 };
  const sorted = [...heights].sort((a, b) => a - b);
  let cut = 1;
  let widest = -1;
  for (let k = 1; k < sorted.length; k += 1) {
    const gap = (sorted[k] ?? 0) - (sorted[k - 1] ?? 0);
    if (gap > widest) {
      widest = gap;
      cut = k;
    }
  }
  return { low: cut, high: sorted.length - cut };
}

/**
 * 그 점을 품고 있는, 지금 서 있는 무리.
 *
 * 단일 연결이라 고른 두 점은 반드시 합쳐지는 두 무리에 하나씩 있다. 그러니 발신이
 * 무리 이름을 실어 올 까닭이 없다 — 자취가 이미 안다.
 */
function holderOf(dots: readonly MergeDot[], tree: MergeTree, pointId: string): string | null {
  const leaf = dots.findIndex((d) => d.id === pointId);
  if (leaf < 0) return null;
  for (const id of tree.standing) {
    if (tree.knots.get(id)?.leaves.includes(leaf) === true) return id;
  }
  return null;
}

export const mergeNearestPairScene: ScenePlan<MergeNearestPairScene> = {
  /**
   * 첫 장면은 점만 세우고 비어 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 넘겨받은
   * 것을 **참조로 쥐지 않는다** — 점마다 새 객체를 지어 담는다. 러너가 주는 배열은
   * mechanism 과 view 가 함께 쓰는 한 객체다 (S-scene).
   */
  initial(initialData: unknown): MergeNearestPairScene {
    const d = fields(initialData);
    const dots: MergeDot[] = [];
    if (Array.isArray(d?.points)) {
      for (const raw of d.points) {
        const p = fields(raw);
        const x = num(p?.x);
        const y = num(p?.y);
        if (typeof p?.id !== 'string' || x === null || y === null) continue;
        dots.push({ id: p.id, x, y });
      }
    }
    return atStart({ dots });
  },

  reduce(scene: MergeNearestPairScene, event: FacetRuntimeEvent): MergeNearestPairScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 가장 가까운 둘이 합쳐진다. 발신이 싣는 것은 판정 둘 — 무엇을 재었고 그중
       * 무엇이 가장 가까웠나. 이름 · 높이 · 남은 수는 여기서 파생된다.
       */
      case 'merge-rise': {
        if (!p) return scene;
        const links = toPairs(p.links);
        if (typeof p.pickFrom !== 'string' || typeof p.pickTo !== 'string') return scene;
        const pick: MergePair = { from: p.pickFrom, to: p.pickTo };
        const tree = treeOf(scene.dots, scene.joins);
        const leftId = holderOf(scene.dots, tree, pick.from);
        const rightId = holderOf(scene.dots, tree, pick.to);
        if (leftId === null || rightId === null || leftId === rightId) return scene;
        return {
          ...scene,
          joins: [
            ...scene.joins,
            { nodeId: `m${scene.joins.length + 1}`, leftId, rightId, links, pick },
          ],
          step: { kind: 'merge' },
        };
      }

      /* 하나만 남았다. 걸린 높이들이 자로 모여 벌어짐이 한 줄에 선다. */
      case 'done':
        return { ...scene, gathered: true, step: { kind: 'gather' } };

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 전부 턴다 (S-scene). */
      case 'rewind':
        return atStart({ dots: scene.dots });

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
