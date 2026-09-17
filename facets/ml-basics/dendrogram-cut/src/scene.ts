/**
 * dendrogramCut 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * projector 에는 `let` 이 한 자리도 없었고 조회 분기도 DOM 되읽기도 0 건이었다.
 * **알맹이가 전부 stage 의 `let` 여덟과 타입 선언 하나에 있었다.**
 *
 * - `let layout: Layout | null` — **척도이자 나무의 모양.** `yOf` 가 `layout.topHeight`
 *   로 모든 세로 좌표를 정하고 `x` 맵이 모든 가로 좌표를 정했으므로, 걸음이 한 번
 *   실어 온 것을 stage 가 적어 두고 그 뒤로 화면 전체가 거기서 나왔다. 지금은
 *   장면이 **합침 목록**을 쥐고 나무의 모양은 `treeOf` 가 매번 셈한다.
 * - `let order: string[]` — 잎이 늘어선 차례. `buildLayout` 안에서 `order = leaves`
 *   로 제자리에서 갈렸다. 지금은 `treeOf` 가 중위로 밟아 내는 값이라 상태가 아니다.
 * - `let cutHeight` · `let severed` — **이 조각의 주장 그 자체.** 자른 높이와
 *   잘랐나. 게다가 `slide` 가 `const from = cutHeight ?? 0` 으로 **제 거울을 운동의
 *   출발값**으로 삼았다 (프로토콜 4 절의 DOM 거울). 되짚어 세운 직후에는 그것이 옛
 *   화면의 높이라 가로선이 엉뚱한 데서 출발한다. 지금은 `cuts` 가 밟아 온 자리를
 *   차례대로 쥐고 있어 **한 칸 물린 자리**가 곧 출발 높이다 (`glideFromOf`).
 * - `let clusterCount` — 알약에 뜨는 무리 수. 발신이 실어 온 수를 옮겨 적은 것이라
 *   **그림의 나무와 화면의 수가 다른 출처**였다. 지금은 `crossedAt` 이 센다.
 * - `let bands` — 넓게 빈 구간. 합침 높이만 있으면 나오는 값이라 `wideBandsOf` 를
 *   내주고 여기서 부른다.
 * - `let bandGrow` — **운동의 진행도를 적어 둔 자리.** 0.38 초짜리 보간값이 그대로
 *   화면의 정본이었다. 지금은 보간이 그리는 쪽에만 산다.
 * - `const marked = new Set<number>()` — **어느 구간 안에서 실제로 끊어 봤나.**
 *   `const` 라 `let` grep 을 통과하고 `.add`/`.clear` 로만 자란다. 지금은
 *   `cuts` 의 `severed` 에서 파생된다 (`bandsOf`).
 * - `type Layout = { kids, height, parent, x, span, rootId, topHeight }` — **DOM 은
 *   아니지만 뜻·수치·좌표가 한 객체**였고, 무엇보다 `height.keys()` 의 **삽입 순서**가
 *   가지를 그리는 차례를 정했다. `Map` 의 순서에 화면을 맡기지 않으려고 `treeOf` 가
 *   **잎부터 그 다음 합침 차례대로** 편 배열을 돌려준다.
 *
 * ── 이행이 화면을 고친 자리 — 옮겨 본 자리가 하나도 안 남았다
 *
 * 이 조각의 주장은 **"어디를 자르느냐가 무리 수를 정한다"** 다. 그런데 옛 화면은
 * 가로선이 여덟 자리를 훑고 지나가도 **지나온 자리를 하나도 남기지 않았다.** 무리
 * 수가 8 에서 1 까지 바뀌는 것은 캡션의 글자로만 흘러갔고, 완주 화면에는 마지막
 * 가로선 하나만 서 있었다. 높이를 바꾸면 무리 수가 바뀐다는 것을 **한 화면에서
 * 견줄 수가 없었다.**
 *
 * 지금은 밟은 자리가 `cuts` 에 쌓이고, 정적 그리기가 오른쪽 무리 수 칸에 **높이마다
 * 무리 수만큼 긴 막대**를 세운다. 완주 화면에 여덟 칸짜리 계단이 서고, 그중 실제로
 * 끊은 둘만 넓은 구간의 색으로 도드라진다.
 *
 * ── 어휘를 가른다
 *
 *   **지금 선 자리** = 채운 알약 + 실선 가로선 (`itemActive`).
 *   **지나온 자리**  = 유령 막대 (`ghostOutline`).
 *   **끊어 본 자리** = 넓은 구간과 같은 색 (`accent`) — 구간의 파선 테두리와 짝이다.
 *
 * 헛걸음과 살아 있는 자국을 같은 모양으로 그리지 않는다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 잎 이름표와 합침 목록이라는 **구조**만 담고 화면 자리는
 * 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 문안도 담지 않는다 —
 * `captionOf` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는 쪽이 `params.t` 로
 * 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { topHeightOf, wideBandsOf, type DendrogramMerge } from './algorithm.js';

/** 밟아 본 자리 하나. `severed` 면 거기서 실제로 끊었다. */
export type DendrogramCutMark = { height: number; severed: boolean };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 가로선이 어디서 출발하나는 `cuts` 가 이미 말하고,
 * 띠가 얼마나 자랐나는 운동 자신의 것이다 (S-scene).
 *
 * 정적 그리기는 이것을 읽지 않는다. 머무는 것은 전부 자취에서 나온다.
 */
export type DendrogramStep = 'tree' | 'glide' | 'bands' | 'sever' | 'done';

/** 넓게 빈 구간 하나. `severed` 는 이 안에서 실제로 끊어 봤나. */
export type DendrogramBand = { lo: number; hi: number; severed: boolean };

/** 나무의 마디 하나. 좌표가 아니라 구조만 담는다. */
export type DendrogramNode = {
  id: string;
  /** 이 마디가 선 높이. 잎은 0. */
  height: number;
  /** 위쪽 끝 — 부모의 합침 높이. 뿌리는 null (위가 열려 있다). */
  upper: number | null;
  /** 합침이면 두 자식, 잎이면 null. */
  kids: readonly [string, string] | null;
  /** 그 마디 아래 잎들이 차지하는 차례 구간. */
  spanFrom: number;
  spanTo: number;
};

/** 합침 목록에서 셈해 낸 나무. 걸음마다 다시 셈하므로 상태가 아니다. */
export type DendrogramTree = {
  /** 잎이 늘어선 차례. 중위로 밟은 것이라 가지가 서로 넘지 않는다. */
  order: readonly string[];
  /** **그리는 차례**. 잎부터, 그 다음 합침 차례대로 — 자식이 늘 부모보다 앞선다. */
  nodes: readonly DendrogramNode[];
  rootId: string;
  /** 높이 축의 위 끝. `algorithm` 과 같은 함수를 지난다. */
  topHeight: number;
};

/** 캡션이 무엇을 말할지와 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type DendrogramCaption =
  | { kind: 'grown' }
  | { kind: 'cut'; height: number; clusters: number }
  | { kind: 'bands'; count: number }
  | { kind: 'settled'; clusters: number }
  | { kind: 'done' };

export type DendrogramCutScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 잎 이름표. **색판의 크기와 가로 칸 수가 여기서 나온다.** 값을 베껴 담는다. */
  leafIds: readonly string[];

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 다 자란 나무. 빈 목록이면 아직 나무가 서지 않았다. */
  merges: readonly DendrogramMerge[];
  /**
   * 밟아 본 자리, 밟은 차례대로. **마지막이 지금 가로선이 선 자리**이고 그 앞이
   * 미끄러짐의 출발 높이다.
   *
   * **남는 자취**다 — 높이를 옮기면 무리 수가 바뀐다는 것이 이 조각의 논증
   * 자체이므로 정적 그리기가 계단으로 세운다.
   */
  cuts: readonly DendrogramCutMark[];
  /** 넓게 빈 구간이 드러났나. 구간 자체는 나무에서 셈한다. */
  bandsShown: boolean;
  /** 논증이 끝났나. */
  done: boolean;

  step: DendrogramStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `merges` 도 자취다 — 나무는 `tree-ready` 가 세우고 `rewind` 가 턴다. 바탕에 넣으면
 * 되감은 화면이 이미 자란 나무를 단 채로 서고 그 위에 algorithm 이 새로 세우는
 * 나무가 겹친다 (S-scene).
 */
type Base = Pick<DendrogramCutScene, 'leafIds'>;

/**
 * 아무것도 서지 않은 처음 화면 — 이름표와 바닥선뿐이다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): DendrogramCutScene {
  return {
    leafIds: base.leafIds,
    merges: [],
    cuts: [],
    bandsShown: false,
    done: false,
    step: null,
  };
}

// ── unknown 좁히개 — 생산자가 같은 패키지라도 경계는 경계다 (C9) ──────────────

function fields(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function toMerges(v: unknown): DendrogramMerge[] {
  if (!Array.isArray(v)) return [];
  const out: DendrogramMerge[] = [];
  for (const item of v) {
    const row = fields(item);
    const height = num(row?.height);
    if (
      typeof row?.id !== 'string' ||
      typeof row.left !== 'string' ||
      typeof row.right !== 'string' ||
      height === null
    ) {
      continue;
    }
    out.push({ id: row.id, left: row.left, right: row.right, height });
  }
  return out;
}

// ── 장면에서 셈해지는 것들 ───────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 가지의 자리도 알약의 수도 이름표 밑 괄호도
// 같은 나무에서 나오므로 갈릴 자리가 없다.

/**
 * 합침 목록에서 나무를 셈한다. 아직 자라지 않았으면 null.
 *
 * **Map 의 삽입 순서에 화면을 맡기지 않는다** — 돌려주는 `nodes` 는 잎부터 그 다음
 * 합침 차례대로 편 배열이라 그리는 차례가 못박혀 있고, 자식이 늘 부모보다 앞서므로
 * 가로 자리를 한 번에 셈하고 나서 그릴 수 있다.
 */
export function treeOf(scene: DendrogramCutScene): DendrogramTree | null {
  if (scene.merges.length === 0 || scene.leafIds.length === 0) return null;

  const kids = new Map<string, readonly [string, string]>();
  const height = new Map<string, number>();
  const upper = new Map<string, number>();
  for (const id of scene.leafIds) height.set(id, 0);
  for (const m of scene.merges) {
    kids.set(m.id, [m.left, m.right]);
    height.set(m.id, m.height);
    upper.set(m.left, m.height);
    upper.set(m.right, m.height);
  }
  const rootId = scene.merges[scene.merges.length - 1]!.id;

  // 잎 차례는 나무가 정한다 — 중위로 밟아야 가지가 서로 넘지 않는다.
  // 같은 마디를 두 번 밟지 않는다: 장면은 순수해야 하고 멈춰야 한다 (S-scene).
  const order: string[] = [];
  const seen = new Set<string>();
  const walk = (id: string): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const pair = kids.get(id);
    if (pair === undefined) {
      order.push(id);
      return;
    }
    walk(pair[0]);
    walk(pair[1]);
  };
  walk(rootId);

  const span = new Map<string, [number, number]>();
  order.forEach((id, i) => span.set(id, [i, i]));
  for (const m of scene.merges) {
    const ls = span.get(m.left) ?? [0, 0];
    const rs = span.get(m.right) ?? [0, 0];
    span.set(m.id, [Math.min(ls[0], rs[0]), Math.max(ls[1], rs[1])]);
  }

  const nodes: DendrogramNode[] = [];
  const add = (id: string): void => {
    const s = span.get(id) ?? [0, 0];
    nodes.push({
      id,
      height: height.get(id) ?? 0,
      upper: upper.get(id) ?? null,
      kids: kids.get(id) ?? null,
      spanFrom: s[0],
      spanTo: s[1],
    });
  };
  for (const id of order) add(id);
  for (const m of scene.merges) add(m.id);

  return { order, nodes, rootId, topHeight: topHeightOf(scene.merges) };
}

/**
 * 높이 h 의 가로선이 지나는 세로 가지들, 왼쪽부터.
 *
 * 가지 하나는 제 높이에서 부모의 높이까지 뻗는다. 뿌리 위는 열려 있다.
 * 지나는 가지들의 잎 구간은 서로 겹치지 않으므로 `spanFrom` 이 곧 왼쪽부터의 차례다.
 */
export function crossedAt(tree: DendrogramTree, h: number): readonly DendrogramNode[] {
  return tree.nodes
    .filter((node) => node.height < h && h < (node.upper ?? Infinity))
    .sort((a, b) => a.spanFrom - b.spanFrom);
}

/**
 * 높이 h 에서 자르면 무리가 몇인가.
 *
 * **그림의 나무를 그대로 센다.** 이 수를 발신이 실어 오면 화면의 가지와 알약의 수가
 * 다른 출처가 되어 언젠가 갈린다 (프로토콜 4 절).
 */
export function clustersAt(tree: DendrogramTree, h: number): number {
  return crossedAt(tree, h).length;
}

/** 지금 가로선이 선 자리. 아직 한 번도 안 밟았으면 null. */
export function currentCutOf(scene: DendrogramCutScene): DendrogramCutMark | null {
  return scene.cuts[scene.cuts.length - 1] ?? null;
}

/**
 * 미끄러짐의 출발 높이 — 한 칸 물린 자리. 처음이면 바닥(0)에서 올라온다.
 *
 * 자취를 물려 셈하므로 `prev` 를 들추지 않는다. 어느 걸음에서 와도 같은 곳에서
 * 출발한다 (S-scene).
 */
export function glideFromOf(scene: DendrogramCutScene): number {
  return scene.cuts[scene.cuts.length - 2]?.height ?? 0;
}

/**
 * 밟아 본 자리들, 높이 순으로. 같은 높이를 두 번 밟았으면 한 칸으로 접고
 * 끊은 적이 있으면 끊은 것으로 본다.
 *
 * **오른쪽 무리 수 칸의 계단이 이것이다.** 정렬해 돌려주므로 밟은 차례가 화면을
 * 가르지 않는다.
 */
export function ladderOf(scene: DendrogramCutScene): readonly DendrogramCutMark[] {
  const severedAt = new Map<number, boolean>();
  for (const cut of scene.cuts) {
    severedAt.set(cut.height, (severedAt.get(cut.height) ?? false) || cut.severed);
  }
  return [...severedAt]
    .map(([height, severed]) => ({ height, severed }))
    .sort((a, b) => a.height - b.height);
}

/**
 * 넓게 빈 구간들. 아직 드러나지 않았으면 빈 목록.
 *
 * 어느 구간이 넓은지는 `algorithm` 이 내준 술어 하나가 정하고, 그 안에서 끊어
 * 봤는지는 밟은 자리에서 파생된다 — 옛 stage 의 `marked` 집합이 없어진 자리다.
 */
export function bandsOf(scene: DendrogramCutScene): readonly DendrogramBand[] {
  if (!scene.bandsShown) return [];
  return wideBandsOf(scene.merges).map((band) => ({
    lo: band.lo,
    hi: band.hi,
    severed: scene.cuts.some(
      (cut) => cut.severed && band.lo <= cut.height && cut.height <= band.hi,
    ),
  }));
}

/**
 * 캡션이 무엇을 말할지.
 *
 * **`step` 을 읽지 않는다.** 논증이 한 방향으로만 나아가므로 자취만 보아도 지금
 * 무슨 말을 할 차례인지 정해진다 — 흘려 세운 화면과 곧바로 세운 화면이 같은 말을
 * 하는 것이 구조로 보장된다.
 */
export function captionOf(scene: DendrogramCutScene): DendrogramCaption | null {
  const tree = treeOf(scene);
  if (tree === null) return null;
  if (scene.done) return { kind: 'done' };
  const cut = currentCutOf(scene);
  if (cut !== null && cut.severed) {
    return { kind: 'settled', clusters: clustersAt(tree, cut.height) };
  }
  if (scene.bandsShown) return { kind: 'bands', count: wideBandsOf(scene.merges).length };
  if (cut !== null) {
    return { kind: 'cut', height: cut.height, clusters: clustersAt(tree, cut.height) };
  }
  return { kind: 'grown' };
}

export const dendrogramCutScene: ScenePlan<DendrogramCutScene> = {
  /**
   * 첫 장면은 잎 이름표만 쥔다.
   *
   * 넘겨받은 것을 **참조로 쥐지 않는다** — 이름표를 하나씩 베껴 담는다. 러너가
   * 주는 배열은 mechanism 과 view 가 함께 쓰는 한 객체다 (S-scene).
   */
  initial(initialData: unknown): DendrogramCutScene {
    const d = fields(initialData);
    const leafIds: string[] = [];
    if (Array.isArray(d?.points)) {
      for (const raw of d.points) {
        const point = fields(raw);
        if (typeof point?.id === 'string') leafIds.push(point.id);
      }
    }
    return atStart({ leafIds });
  },

  reduce(scene: DendrogramCutScene, event: FacetRuntimeEvent): DendrogramCutScene {
    const p = fields(event.payload);

    switch (event.type) {
      /*
       * 나무가 다 자란 채로 나타난다. 자라는 과정은 이 조각의 주장이 아니다 —
       * 나무는 이미 있고 남은 일은 높이 하나를 고르는 것뿐이다.
       */
      case 'tree-ready': {
        const merges = toMerges(p?.merges);
        if (merges.length === 0) return scene;
        return { ...atStart({ leafIds: scene.leafIds }), merges, step: 'tree' };
      }

      /* 가로선이 그 높이로 미끄러진다. 지나온 자리로 쌓인다. */
      case 'cut-moved': {
        const height = num(p?.height);
        if (height === null) return scene;
        return {
          ...scene,
          cuts: [...scene.cuts, { height, severed: false }],
          step: 'glide',
        };
      }

      /* 넓게 빈 구간이 드러난다. 어느 구간인지는 나무가 말한다. */
      case 'gaps-marked':
        return { ...scene, bandsShown: true, step: 'bands' };

      /* 넓은 구간 안에 자리 잡고 실제로 끊는다. */
      case 'cut-settled': {
        const height = num(p?.height);
        if (height === null) return scene;
        return {
          ...scene,
          cuts: [...scene.cuts, { height, severed: true }],
          step: 'sever',
        };
      }

      /* 나무는 고르지 않는다. 화면은 이미 할 말을 다 했고 캡션만 바뀐다. */
      case 'done':
        return { ...scene, done: true, step: 'done' };

      /* 손으로 짚기 시작 — 바탕만 남기고 자취를 전부 턴다 (S-scene). */
      case 'rewind':
        return atStart({ leafIds: scene.leafIds });

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
