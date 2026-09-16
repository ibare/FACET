/**
 * negativeEdgeBreaks 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 projector 의 `let` 은 `graph` 하나뿐이었고 그것은 바탕이다. **진짜 상태는 전부
 * stage 안에 있었고, 그중 어느 것도 `let` 이 아니었다** — 팩토리 스코프의 `const`
 * Map · Set 과, 아예 변수가 없는 SVG 레이어였다 (프로토콜 3-1 의 ⑤).
 *
 * - **`const distVal = new Map<string, number>()`** — **이것이 곧 거리표였다.**
 *   `setChip` 이 고치고, `traceTruth` 가 `val !== distVal.get(to)` 로 **참값 배지를
 *   달지 말지**를 갈랐다. 곧 이 조각의 결론("어디가 어긋났나")이 `const` Map 하나의
 *   조회로 정해졌다. `let` grep 도 projector grep 도 통과한다.
 * - **`const sealed = new Set<string>()`** — 굳은 자리. `setChip` 이 `!sealed.has(node)`
 *   로 칠을 갈랐다 — ③ 의 암묵 분기가 projector 가 아니라 stage 에 있던 꼴이다.
 * - **`layers.fx` 에 쌓이던 노드들** — 이 조각의 알맹이가 통째로 여기 있었다.
 *   튕겨 나간 후보 토큰(가위표), 소식을 막는 막, 참 최단 누계 토큰. 셋 다 지우는
 *   명령이 없어 **쌓이는 것이 정보**였는데 (프로토콜 4 절), 그것을 아는 코드가
 *   하나도 없어 명령을 처음부터 다시 밟아야만 복원됐다.
 * - **`chipBox` 의 `stroke-dasharray`** — `'4 3'` 이면 아직 ∞, `'none'` 이면 값이
 *   앉았다. 값의 유무가 **점선 여부**에만 적혀 있었다.
 * - **`bounceOff` 의 `hardSeal` 되돌림** — 굳은 정점의 테를 붉게 물들였다가
 *   `c.itemSorted` 로 **되돌렸다.** 되돌림이 지우던 것이 정보였다 — "이 자리가 더
 *   짧은 소식을 거절했다" 가 그 조각의 논점 자체인데 260ms 만에 사라졌다.
 *
 * 여기서는 그 전부가 `dist` · `sealed` · `refusals` · `keeps` · `blocks` ·
 * `truthPath` · `judged` 일곱이다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 이 조각은 **굳혀 버린 틀린 수와 참 최단을 나란히 띄워 견주게 한다.** 거리 칸의 수,
 * 참값 배지의 수, 튕긴 후보의 수, 막힌 소식의 수, 캡션의 수가 한 화면에 함께 선다.
 * 갈리면 그림이 제 안에서 거짓이 되므로 **아래 셈 함수들을 모두가 지난다.**
 *
 * 그래서 payload 에서 걷어낸 것이 많다.
 *
 * - `dist` · `candidate` · `kept` · `previous` · `weight` — 거리표와 간선 무게에서
 *   더해진다. 구조에서 세진다.
 * - `wouldBe` · `stays` — 거절당한 후보에 나가려던 간선 무게를 더한 값과, 그 이웃이
 *   지키는 값. 둘 다 장면 안에 있다.
 * - `running` · `total` — 참 최단 경로를 따라 간선 무게를 더한 누계.
 * - `verdict` 의 `goal` · `settled` · `truth` — **조각의 결론이 상수처럼 실려 오던
 *   자리다.** 이제 거리표와 참 경로에서 나온다.
 *
 * 남긴 것은 **`truth-trace` 의 `path`** 하나다. 어느 길이 참 최단인가는 구조를 통째로
 * 훑어야(벨만-포드) 나오는 판정이고, **그 잣대를 떼면 이 조각이 견줄 대상 자체가
 * 사라진다.** 프로토콜 2-4 절 가운데 줄의 경계가 여기다 — 내주면 장면이 알고리즘을
 * 되풀이하는 꼴이 되므로 멈추고 판정만 싣는다.
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 정점과 간선이라는 **구조**만 담고 자리는 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도, 문안에 들어갈 수도 담지 않는다 — 캡션은 무엇을 말할지와
 * 누구에 대해 말할지만 담고 수와 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 방향 간선 하나. 무게가 음수일 수 있다 — 그것이 이 조각의 소재다. */
export type NegativeEdgeLink = { from: string; to: string; weight: number };

/**
 * 굳은 자리가 **받지 않은** 더 짧은 후보. 이 조각의 논점이 쌓이는 자리다.
 *
 * `candidate` 와 `kept` 는 payload 가 아니라 `reduce` 가 그 걸음의 거리표에서 셈해
 * 담은 값이다. 뒤 걸음에서 다시 셈하지 않고 여기 남기는 까닭은 하나 — 거절한 뒤에도
 * 이 표식이 화면에 남는데, 그때 셈하면 그 사이에 달라진 거리표를 읽게 된다.
 */
export type NegativeRefusal = { from: string; to: string; candidate: number; kept: number };

/** 지금 값보다 낫지 않아 그대로 둔 후보. 거절과 **어휘를 갈라** 남긴다. */
export type NegativeKeep = { from: string; to: string; candidate: number; kept: number };

/** 거절당해 밖으로 나가지 못한 소식. 막과 함께 남는다. */
export type NegativeBlock = { node: string; to: string; wouldBe: number; stays: number };

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 싣지 않는다 — 날아오는 후보의 출발 자리도 튕겨 나갈 자리도 전부 `next`
 * 에서 되셈된다. 그러니 `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type NegativeEdgeBreaksStep =
  /** 뚜껑이 거리 칸 위로 내려앉아 값을 물린다. */
  | { kind: 'settle'; node: string }
  /** 후보가 간선을 따라 날아가 거리 칸에 앉는다. */
  | { kind: 'accept'; from: string; to: string }
  /** 후보가 굳은 자리에 부딪혀 튕겨 나간다. */
  | { kind: 'refuse'; from: string; to: string }
  /** 후보가 닿기는 하나 낫지 않아 옆으로 비켜선다. */
  | { kind: 'keep'; from: string; to: string }
  /** 갇힌 소식이 밖으로 나가려다 막에 되밀린다. */
  | { kind: 'block'; node: string; to: string }
  /** 누계가 참 최단 경로를 밟아 간다. */
  | { kind: 'truth' }
  /** 굳힌 수와 참값이 나란히 부풀었다 돌아온다. */
  | { kind: 'judge' };

/**
 * 캡션이 말할 것. 문안도 **수도** 담지 않는다.
 *
 * 무엇을 말할지와 누구에 대해 말할지(정점 이름)만 담는다. 수는 그리는 쪽이 장면의
 * 셈 함수로 얻으므로 화면의 칸과 갈릴 자리가 없다.
 */
export type NegativeEdgeBreaksCaption =
  | { kind: 'start' }
  | { kind: 'settle'; node: string }
  | { kind: 'accept'; from: string; to: string }
  | { kind: 'sealed'; from: string; to: string }
  | { kind: 'kept'; from: string; to: string }
  | { kind: 'blocked'; node: string; to: string }
  | { kind: 'truth' }
  | { kind: 'verdict' };

export type NegativeEdgeBreaksScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  nodes: string[];
  edges: NegativeEdgeLink[];
  start: string;
  goal: string;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 지금 아는 거리. 키가 없으면 아직 ∞ 다. */
  dist: Record<string, number>;
  /** 굳은 차례대로. 길이가 곧 몇 개를 굳혔나다. */
  sealed: string[];
  /** 굳어서 거절당한 더 짧은 후보들. **남는 표식**이라 정적 그리기에도 든다. */
  refusals: NegativeRefusal[];
  /** 낫지 않아 그대로 둔 후보들. 거절과 다른 어휘로 남는다. */
  keeps: NegativeKeep[];
  /** 밖으로 못 나간 소식들. 막이 함께 선다. */
  blocks: NegativeBlock[];
  /** 참 최단 경로. 비어 있으면 아직 재지 않았다. */
  truthPath: string[];
  /** 굳힌 수와 참값을 나란히 세웠나. 이름표와 가위표가 여기서 붙는다. */
  judged: boolean;

  step: NegativeEdgeBreaksStep | null;
  caption: NegativeEdgeBreaksCaption | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `dist` 도 `sealed` 도 여기 들지 않는다 — 걸음이 고치는 것을 되감기에 그대로
 * 넘기면 되감은 화면이 이미 다 굴러간 거리표를 단 채로 선다 (S-scene). 첫 거리표는
 * `atStart` 가 출발점에서 다시 셈한다.
 */
type Base = Pick<NegativeEdgeBreaksScene, 'nodes' | 'edges' | 'start' | 'goal'>;

/**
 * 아직 아무것도 굳지 않은 처음 화면.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다** — 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): NegativeEdgeBreaksScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    start: base.start,
    goal: base.goal,
    // 출발점만 0 이고 나머지는 키가 없다 (∞). 걸어오며 고친 거리를 물려받지 않는다.
    dist: base.start === '' ? {} : { [base.start]: 0 },
    sealed: [],
    refusals: [],
    keeps: [],
    blocks: [],
    truthPath: [],
    judged: false,
    step: null,
    caption: { kind: 'start' },
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' && v.length > 0 ? v : '';
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** 값만 베껴 담는다 — 넘겨받은 배열을 쥐지 않는다 (S-scene). */
function names(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((n): n is string => typeof n === 'string' && n.length > 0);
}

/** 선언에 적힌 간선을 좁힌다. 안쪽 객체까지 새로 만들어 참조를 쥐지 않는다. */
function readEdges(v: unknown): NegativeEdgeLink[] {
  if (!Array.isArray(v)) return [];
  const edges: NegativeEdgeLink[] = [];
  for (const item of v) {
    const e = item as { from?: unknown; to?: unknown; w?: unknown };
    const from = str(e?.from);
    const to = str(e?.to);
    const weight = num(e?.w);
    if (from === '' || to === '' || weight === null) continue;
    edges.push({ from, to, weight });
  }
  return edges;
}

// ── 장면에서 셈해지는 수들 ──────────────────────────────────────────────────
//
// 화면에 뜨는 수는 전부 여기를 지난다. 거리 칸도 참값 배지도 캡션의 수도 같은 함수를
// 부르므로 갈릴 자리가 없다.

/** 지금 아는 거리. `null` 이면 아직 ∞ 다. */
export function distOf(scene: NegativeEdgeBreaksScene, node: string): number | null {
  const d = scene.dist[node];
  return d === undefined ? null : d;
}

/**
 * 그 짝을 잇는 간선의 무게. 없으면 `null`.
 *
 * 같은 짝이 둘인 그래프는 이 조각에 오지 않는다 — 온다면 첫 간선이 이긴다. 발신도
 * 간선을 하나씩 도므로 같은 규칙이다.
 */
export function weightOf(
  scene: NegativeEdgeBreaksScene,
  from: string,
  to: string,
): number | null {
  const e = scene.edges.find((x) => x.from === from && x.to === to);
  return e === undefined ? null : e.weight;
}

/** 그 간선을 폈을 때 나오는 후보. 출발이 아직 ∞ 면 `null`. */
export function candidateOf(
  scene: NegativeEdgeBreaksScene,
  from: string,
  to: string,
): number | null {
  const base = distOf(scene, from);
  const w = weightOf(scene, from, to);
  return base === null || w === null ? null : base + w;
}

/** 그 정점이 굳었나. 굳은 차례 목록이 답한다. */
export function isSealed(scene: NegativeEdgeBreaksScene, node: string): boolean {
  return scene.sealed.includes(node);
}

/** 그 정점이 더 짧은 소식을 거절한 적 있나. **머무는 표식**이다. */
export function refusedAt(scene: NegativeEdgeBreaksScene, node: string): boolean {
  return scene.refusals.some((r) => r.to === node);
}

/**
 * 참 최단 경로를 따라 쌓이는 누계.
 *
 * 경로와 간선 무게에서 더해진다 — 옛 발신이 `running` 으로 실어 오던 것이다.
 * 경로가 비어 있으면 빈 배열.
 */
export function truthRunning(scene: NegativeEdgeBreaksScene): number[] {
  const path = scene.truthPath;
  if (path.length === 0) return [];
  const running: number[] = [0];
  for (let i = 1; i < path.length; i += 1) {
    running.push(running[i - 1] + (weightOf(scene, path[i - 1], path[i]) ?? 0));
  }
  return running;
}

/** 참 최단의 총합. 아직 재지 않았으면 `null`. */
export function truthTotal(scene: NegativeEdgeBreaksScene): number | null {
  const running = truthRunning(scene);
  return running.length === 0 ? null : running[running.length - 1];
}

/**
 * 참 최단과 굳혀 놓은 수가 **어긋난 자리**. 이 조각이 보이려는 그 자리다.
 *
 * 굳힌 수가 아직 없는 정점(∞)도 어긋난 것으로 본다 — 참값은 있는데 화면에 아무
 * 수도 없으면 그것이야말로 가장 크게 어긋난 자리다.
 */
export function truthMismatches(
  scene: NegativeEdgeBreaksScene,
): Array<{ node: string; value: number }> {
  const running = truthRunning(scene);
  const out: Array<{ node: string; value: number }> = [];
  scene.truthPath.forEach((node, i) => {
    if (distOf(scene, node) !== running[i]) out.push({ node, value: running[i] });
  });
  return out;
}

/** 이번 걸음에 방금 쌓인 거절. 그 걸음이 아니면 `null`. */
export function lastRefusal(scene: NegativeEdgeBreaksScene): NegativeRefusal | null {
  return scene.refusals[scene.refusals.length - 1] ?? null;
}

/** 이번 걸음에 방금 쌓인 유지. */
export function lastKeep(scene: NegativeEdgeBreaksScene): NegativeKeep | null {
  return scene.keeps[scene.keeps.length - 1] ?? null;
}

/** 이번 걸음에 방금 막힌 소식. */
export function lastBlock(scene: NegativeEdgeBreaksScene): NegativeBlock | null {
  return scene.blocks[scene.blocks.length - 1] ?? null;
}

export const negativeEdgeBreaksScene: ScenePlan<NegativeEdgeBreaksScene> = {
  /**
   * 첫 장면은 그래프와 빈 거리표만 세운다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열과 그 안의 객체를 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과
   * view 가 함께 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을
   * 그리게 된다 (S-scene).
   */
  initial(initialData: unknown): NegativeEdgeBreaksScene {
    const d = (initialData ?? {}) as {
      nodes?: unknown;
      edges?: unknown;
      start?: unknown;
      goal?: unknown;
    };
    return atStart({
      nodes: names(d.nodes),
      edges: readEdges(d.edges),
      start: str(d.start),
      goal: str(d.goal),
    });
  },

  reduce(
    scene: NegativeEdgeBreaksScene,
    event: FacetRuntimeEvent,
  ): NegativeEdgeBreaksScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      /*
       * 아직 굳지 않은 것 중 가장 가까운 정점을 굳힌다.
       *
       * 거리는 실려 오지 않는다 — 굳히는 일은 거리표를 고치지 않으므로 지금 값이
       * 곧 그 값이다.
       */
      case 'settle': {
        const node = str(p.node);
        if (node === '' || isSealed(scene, node)) return scene;
        return {
          ...scene,
          sealed: [...scene.sealed, node],
          step: { kind: 'settle', node },
          caption: { kind: 'settle', node },
        };
      }

      // 굳지 않은 정점이 더 짧은 후보를 받는다. 후보값은 여기서 셈한다.
      case 'relax-accept': {
        const from = str(p.from);
        const to = str(p.to);
        const cand = candidateOf(scene, from, to);
        if (from === '' || to === '' || cand === null) return scene;
        return {
          ...scene,
          // 앞 장면의 묶음을 제자리에서 고치지 않는다. 새 객체를 만든다 (S-scene).
          dist: { ...scene.dist, [to]: cand },
          step: { kind: 'accept', from, to },
          caption: { kind: 'accept', from, to },
        };
      }

      /*
       * 더 짧은데도 굳어 있어 받지 않는다 — 이 조각이 보이려는 그 순간이다.
       *
       * 거절한 뒤에도 표식이 남으므로 그때의 두 수를 여기서 셈해 담는다.
       */
      case 'relax-sealed': {
        const from = str(p.from);
        const to = str(p.to);
        const cand = candidateOf(scene, from, to);
        const kept = distOf(scene, to);
        if (from === '' || to === '' || cand === null || kept === null) return scene;
        return {
          ...scene,
          refusals: [...scene.refusals, { from, to, candidate: cand, kept }],
          step: { kind: 'refuse', from, to },
          caption: { kind: 'sealed', from, to },
        };
      }

      // 닿기는 하나 낫지 않아 그대로 둔다. 거절과 어휘를 갈라 남긴다.
      case 'relax-kept': {
        const from = str(p.from);
        const to = str(p.to);
        const cand = candidateOf(scene, from, to);
        const kept = distOf(scene, to);
        if (from === '' || to === '' || cand === null) return scene;
        return {
          ...scene,
          // 아직 ∞ 인 자리에 낫지 않은 후보가 올 수는 없지만, 와도 화면은 서야 한다.
          keeps: [...scene.keeps, { from, to, candidate: cand, kept: kept ?? cand }],
          step: { kind: 'keep', from, to },
          caption: { kind: 'kept', from, to },
        };
      }

      /*
       * 거절당한 소식이 그 정점 밖으로 나가지 못한다.
       *
       * 얼마가 되었을지는 **방금 거절당한 후보 + 나가려던 간선 무게**다. 그 후보를
       * 방금 쌓은 거절이 쥐고 있으므로 payload 는 어느 간선인지만 말한다.
       */
      case 'news-blocked': {
        const node = str(p.node);
        const to = str(p.to);
        const w = weightOf(scene, node, to);
        const stays = distOf(scene, to);
        const refusal = lastRefusal(scene);
        if (node === '' || to === '' || w === null) return scene;
        if (refusal === null || refusal.to !== node) return scene;
        return {
          ...scene,
          blocks: [
            ...scene.blocks,
            {
              node,
              to,
              wouldBe: refusal.candidate + w,
              // 아직 ∞ 인 이웃은 화면에서도 ∞ 로 남는다. 그리는 쪽이 갈라 읽는다.
              stays: stays ?? Number.POSITIVE_INFINITY,
            },
          ],
          step: { kind: 'block', node, to },
          caption: { kind: 'blocked', node, to },
        };
      }

      /*
       * 음수 간선을 견디는 방법으로 다시 센 참 최단 경로.
       *
       * 경로만 실려 온다. 다리마다의 누계는 `truthRunning` 이 간선 무게에서 더한다.
       */
      case 'truth-trace': {
        const path = names(p.path);
        if (path.length < 2) return scene;
        return {
          ...scene,
          truthPath: path,
          step: { kind: 'truth' },
          caption: { kind: 'truth' },
        };
      }

      /*
       * 굳혀 놓은 수와 참값을 나란히 놓는다.
       *
       * payload 가 비어 있다 — 두 수는 거리표와 참 경로에 이미 있다. 옛 발신은 이
       * 조각의 **결론을 통째로 실어 왔고**, 그래서 화면의 칸과 캡션이 다른 출처를
       * 가졌다 (프로토콜 4 절 "조각의 결론이 상수로 박혀 있을 수 있다").
       */
      case 'verdict':
        return { ...scene, judged: true, step: { kind: 'judge' }, caption: { kind: 'verdict' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({
          nodes: scene.nodes,
          edges: scene.edges,
          start: scene.start,
          goal: scene.goal,
        });

      default:
        // 이 algorithm 이 발신하는 것은 위가 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
