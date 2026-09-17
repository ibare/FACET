/**
 * mutuallyReachable 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면은 무엇으로 정해지나
 *
 * 정점 다섯이 지그재그 한 줄로 서고 방향 간선이 그 사이를 잇는다. 걸음마다
 * 달라지는 것은 셋이다 — **지금 어느 짝을 짚어 어느 방향을 물었고 그 답이
 * 무엇이었나**, **지금까지 어느 짝이 어떻게 판정되었나**, 그리고 **어느 정점이
 * 어느 무리에 들었나**.
 *
 * ── 숨어 있던 상태를 여기로 끌어올린다
 *
 * projector 에는 `let` 도 조회 분기도 없었다 (①③ 0 건). DOM 을 도로 읽는 자리도
 * 없었다 (④ 0 건). 상태는 전부 stage 의 모듈 스코프 선언에, 그중 절반은 `let` 이
 * 아니라 **제자리에서 고쳐지는 `const` 배열·집합**에 있었다.
 *
 * - `chipState: ChipState[]` · `chipNote` · `chipRoute` — **`const` 로 묶였는데
 *   알맹이가 `chipState[0] = 'asking'` 으로 제자리에서 고쳐지는 배열 셋**이다.
 *   `type ChipState = 'idle'|'asking'|'found'|'blocked'` 는 그 배열에만 저장되고
 *   화면에서는 칠(`fill`·`stroke`·`stroke-width`)로만 산다. 어느 방향을 물었고
 *   무엇이 나왔나가 곧 이 조각의 물음인데 그것이 칠에만 있었다. 이제 `probe` 가
 *   두 갈래(`forward`·`backward`)를 쥐고 검사기의 형편은 거기서 파생된다.
 * - `litEdges` · `drawT` · `onPath` · `flooded` · `outsideDim` · `wallBox` —
 *   답사의 자취 여섯이 따로 놀았고 `clearProbeMarks()` 가 걸음마다 통째로
 *   비웠다. 여섯이 사실은 한 가지, **그 방향의 답사가 무엇이었나**(길이냐 얼룩이냐)
 *   에서 나오는 파생이다. 이제 `Trial` 하나가 그것을 말하고 나머지는 그리는 쪽이
 *   셈한다.
 * - `settled: string[][]` 과 `groupOfNode: Map<string, number>` — **같은 것을 두
 *   자리에 적어 두고** `settleGroup` 과 `splitApart` 가 둘 다 고쳤다. 이제
 *   `groups` 하나이고 소속은 `groupIndexOf` 가 파생한다.
 * - `bridgeKeys: Set<string>` — 무리 사이를 잇는 간선. algorithm 이 실어 보낸 것을
 *   stage 가 받아 쥐고 있었다. `groups` 와 바탕의 `edges` 에서 나오므로 파생으로
 *   바꿨다 (`bridgesOf`).
 * - `endpoints: [string, string] | null` — 짚은 두 끝. `showReached`/`showBlocked`
 *   가 **이 값을 조회해 어느 칸(lane)에 결과를 적을지 갈랐다.** 되짚어 세운 직후에는
 *   이것이 옛 화면의 것이라 결과가 엉뚱한 칸에 앉는다. 이제 갈래를 `reduce` 가
 *   장면 안에서 정한다 (`path[0]`/`region[0]` 이 곧 출발점이다).
 * - `stripDim` · `tieT` · `crackT` · `chipShift` · `flowT` · `wallT` — 운동의
 *   진행도와 끝 형편이 한 변수에 섞여 있었다. 끝 형편만 장면이 쥐고(`verdict` ·
 *   `finished` · `split`) 진행도는 그리는 쪽이 프레임 안에서만 쥔다.
 *
 * ── 이행이 화면을 고친 자리 — 짚어 본 짝이 하나도 안 남고 있었다
 *
 * 이 조각의 결론은 "무리가 이렇게 갈렸다" 가 아니라 **"어느 짝을 짚어 양쪽을
 * 물었고, 어느 방향이 막혀서 갈렸나"** 다. 그런데 명령형 stage 는 검사기 칸 둘을
 * 다음 `askPair` 가 통째로 덮어써서, 완주 화면에는 마지막 짝의 판정 하나만
 * 남았다. 그래서 끝 그림이 "무리가 이렇게 나왔다" 만 말하고 **왜 그렇게 갈렸는지**를
 * 말하지 않았다.
 *
 * `marks` 가 그 자리다. 짚어 본 짝마다 두 방향의 답(`found`/`blocked`)과 판정을
 * 적어 쌓고, 정적 그리기가 그것을 화면에 세운다. 한쪽만 닿은 짝은 **막힌 방향이
 * 그대로 남아** 갈린 까닭이 끝까지 읽힌다.
 *
 * ── 수는 한 자리에서만 센다
 *
 * 화면에 뜨는 수 — 무리 수 · 무리의 크기 · 무리 사이를 잇는 간선 수 · 그중 한
 * 방향뿐인 것의 수 — 는 전부 `groups` 와 바탕의 `edges` 에서 나온다. algorithm 은
 * 한때 `group` · `groups` · `bridges` · `oneWayCount` · `groupCount` · `from` ·
 * `to` · `u` · `v` 를 함께 실어 보냈고 화면은 그중 어느 것도 믿을 필요가 없었다.
 * 실려 있으면 다음 사람이 집어 쓰므로 **발신 쪽에서 걷어냈다.**
 *
 * 남긴 것은 셋이다 — 짚을 짝(`u`·`v`), 답사의 결과(`path`·`region`), 그리고 판정
 * (`mutual`·`members`). 앞의 둘은 **이 조각의 알고리즘 그 자체**라 장면에 내주면
 * 장면이 도달 가능성을 스스로 되풀이하는 꼴이 되고 발신이 장식이 된다 (프로토콜
 * 4 절의 가운데 줄 경계). 뒤의 하나는 걸음이 내리는 판정이다.
 *
 * 좌표는 담지 않는다. 정점의 차례와 무리의 소속만 담고 자리는 그리는 쪽이
 * 캔버스에서 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 어느 갈래인지만
 * 담고 문자는 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 방향 간선 하나. `from` 에서 `to` 로 한 방향으로만 간다. */
export type SceneEdge = { from: string; to: string };

/** 그림의 바탕. 걸음이 고치지 않는다. */
export type ReachGraph = {
  nodes: string[];
  edges: SceneEdge[];
};

/**
 * 한 방향을 물어 본 결과.
 *
 * 화면에서 이 둘은 서로 다른 일로 보인다 — 길이 있으면 토큰이 간선을 타고
 * **움직이고**, 없으면 출발점이 닿는 곳으로 얼룩이 **번진 뒤** 그 둘레에 벽이
 * 닫힌다. 어느 쪽이든 출발점은 목록의 맨 앞이다.
 */
export type Trial =
  | { kind: 'found'; path: string[] }
  | { kind: 'blocked'; region: string[] };

/**
 * 지금 짚은 짝과 두 방향의 답.
 *
 * `forward` 는 `u → v`, `backward` 는 `v → u` 다. 아직 묻지 않은 방향은 `null` 이고,
 * 앞 방향이 막히면 뒤는 **묻지 않는다** — 한쪽이 막힌 것만으로 판정이 서기 때문이다.
 */
export type Probe = {
  u: string;
  v: string;
  forward: Trial | null;
  backward: Trial | null;
  /** 두 방향을 다 물어 본 뒤의 판정. 아직이면 `null`. */
  verdict: boolean | null;
  /**
   * 그래프에 답사의 자취(켜진 길 · 얼룩 · 벽)를 아직 보이는가.
   *
   * 무리가 확정되면 걷힌다 — 그 자리는 이제 무리의 색이 말하므로 자취가 겹치면
   * 두 어휘가 한 칸에서 부딪힌다. 검사기와 짚음 기록은 그대로 남는다.
   */
  trail: boolean;
};

/**
 * 짚어 본 짝 하나의 기록. **짚은 차례대로** 쌓이고 끝까지 남는다.
 *
 * 이 조각의 결론이 여기 있다 — 어느 짝을 물었고, 어느 방향이 막혔고, 그래서
 * 한 무리인가 아닌가. 두 방향의 답을 그대로 적어 두므로 "한쪽으로만 갈 수 있다"
 * 가 완주 화면에서 읽힌다.
 */
export type PairMark = {
  u: string;
  v: string;
  /** `u → v` 의 답. */
  forward: 'found' | 'blocked' | null;
  /** `v → u` 의 답. 앞이 막혀 묻지 않았으면 `null`. */
  backward: 'found' | 'blocked' | null;
  mutual: boolean;
};

/**
 * 이번 걸음에 달라진 것. 무엇을 흐르게 할지 고르는 표식이다.
 *
 * 출발 그림은 싣지 않는다 — 이 조각의 운동은 전부 그 장면 자체가 말하는 자리
 * (짚은 두 끝 · 길 · 얼룩이 번질 덩이 · 처음 늘어선 줄)에서 출발하므로 앞 장면을
 * 들출 까닭이 없다. 되짚기(`animate` 거짓)에서는 쳐다보지 않는다.
 *
 * `lane` 은 방금 답이 적힌 칸이다. 0 이 `u → v`, 1 이 `v → u`.
 */
export type MutuallyReachableStep =
  | { kind: 'ask' }
  | { kind: 'walk'; lane: 0 | 1 }
  | { kind: 'flood'; lane: 0 | 1 }
  | { kind: 'verdict' }
  | { kind: 'settle' }
  | { kind: 'split' };

/**
 * 캡션이 말할 것. 문안이 아니라 **무엇을 말할지**와 어느 갈래인지다.
 *
 * 인자를 담지 않는다 — 거기 들어갈 것(짚은 두 정점 · 출발점과 목적지 · 닿는 곳의
 * 목록 · 무리의 크기 · 간선 수)은 전부 그 장면의 `probe` · `groups` · `graph` 에서
 * 유일하게 나오므로, 담아 두면 같은 것을 두 자리에서 세게 된다.
 */
export type MutuallyReachableCaption =
  | { kind: 'intro' }
  | { kind: 'ask' }
  | { kind: 'reached'; lane: 0 | 1 }
  | { kind: 'blocked'; lane: 0 | 1 }
  | { kind: 'verdict' }
  | { kind: 'settled' }
  | { kind: 'split' };

export type MutuallyReachableScene = {
  /** 정점과 방향 간선. 걸음이 고치지 않는 바탕이고 되감기가 여기로 돌아간다. */
  graph: ReachGraph;
  /** 지금 짚은 짝. 다음 짝을 짚을 때까지 검사기에 남는다. */
  probe: Probe | null;
  /** 짚어 본 짝들의 기록. 차례가 곧 물어 본 차례다. */
  marks: PairMark[];
  /**
   * 확정된 무리들. **차례가 곧 무리 번호**이고 색은 그리는 쪽이 정한다.
   *
   * 소속이 칠에만 남으면 되짚었을 때 주장이 사라지므로 장면이 직접 쥔다.
   */
  groups: string[][];
  /** 무리끼리 자리를 갈라섰나. 갈라선 뒤에는 배치가 달라진다. */
  split: boolean;
  /** 할 말을 마쳤나. 검사기가 흐려진다. */
  finished: boolean;
  step: MutuallyReachableStep | null;
  caption: MutuallyReachableCaption | null;
};

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 빈 문자열을 걸러 낸 이름 목록. 넘겨받은 배열을 **값으로 복사**한다 (S-scene). */
function nameList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    const s = str(item);
    if (s.length > 0) out.push(s);
  }
  return out;
}

/** `{ from, to }` 짝들을 간선 목록으로. 양 끝이 정점 명부에 있어야 한다. */
function edgeList(v: unknown, nodes: string[]): SceneEdge[] {
  if (!Array.isArray(v)) return [];
  const known = new Set(nodes);
  const out: SceneEdge[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as { from?: unknown; to?: unknown };
    const from = str(row.from);
    const to = str(row.to);
    if (from.length === 0 || to.length === 0) continue;
    if (!known.has(from) || !known.has(to)) continue;
    out.push({ from, to });
  }
  return out;
}

/** 정점 → 무리 번호. 아직 무리가 없는 정점은 들어 있지 않다. */
export function groupIndexOf(groups: string[][]): Map<string, number> {
  const map = new Map<string, number>();
  groups.forEach((members, gi) => {
    for (const id of members) map.set(id, gi);
  });
  return map;
}

/**
 * 서로 다른 무리를 잇는 간선들. **`groups` 와 바탕에서만 나온다.**
 *
 * 한때 algorithm 이 이것을 세어 실어 보냈다. 화면에 "사이를 잇는 간선 {n} 개" 가
 * 뜨면서 실제로 굵게 그려지는 간선이 따로 셈해지면 두 수가 언젠가 갈린다.
 */
export function bridgesOf(graph: ReachGraph, groups: string[][]): SceneEdge[] {
  const at = groupIndexOf(groups);
  return graph.edges.filter((e) => {
    const a = at.get(e.from);
    const b = at.get(e.to);
    return a !== undefined && b !== undefined && a !== b;
  });
}

/**
 * 잇는 간선 중 **되돌아오는 짝이 없는** 것의 수. 건너가면 돌아올 길이 없다는 말이
 * 여기서 나온다.
 */
export function oneWayCountOf(bridges: SceneEdge[]): number {
  return bridges.filter((e) => !bridges.some((o) => o.from === e.to && o.to === e.from)).length;
}

/**
 * 처음 자리로 돌아간 장면. `initial` 과 되감기가 같은 자리를 쓴다.
 *
 * 바탕은 `graph` **하나뿐**이다. 걸음이 고치는 것(`probe` · `marks` · `groups` ·
 * `split` · `finished`)을 여기로 넘기면 되감은 화면에 지난 주행의 판정과 무리가
 * 남는다. 타입으로 좁혀 두고 호출부는 객체 리터럴로 넘겨 초과 속성 검사가 실제로
 * 돌게 한다 (변수를 넘기면 검사가 돌지 않아 좁힌 타입이 아무것도 못 막는다).
 */
function atStart(base: Pick<MutuallyReachableScene, 'graph'>): MutuallyReachableScene {
  return {
    graph: base.graph,
    probe: null,
    marks: [],
    groups: [],
    split: false,
    finished: false,
    step: null,
    caption: { kind: 'intro' },
  };
}

/** 답사의 출발점이 `u` 쪽이면 0 번 칸, 아니면 1 번 칸이다. */
function laneOf(probe: Probe, from: string): 0 | 1 {
  return from === probe.u ? 0 : 1;
}

/** 물어 본 두 방향을 기록 한 줄로 접는다. */
function markOf(probe: Probe, mutual: boolean): PairMark {
  return {
    u: probe.u,
    v: probe.v,
    forward: probe.forward === null ? null : probe.forward.kind,
    backward: probe.backward === null ? null : probe.backward.kind,
    mutual,
  };
}

export const mutuallyReachableScene: ScenePlan<MutuallyReachableScene> = {
  /**
   * 첫 장면은 바탕만 세운다. 아직 아무것도 묻지 않았다.
   *
   * 이 조각은 `init` 이벤트를 내지 않으므로 바탕을 여기서 좁힌다. 다만 넘겨받은
   * 배열을 **참조로 쥐지 않는다** — 러너가 주는 것은 mechanism 과 view 가 함께 쓰는
   * 한 객체다 (S-scene).
   */
  initial(initialData: unknown): MutuallyReachableScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const nodes = nameList(d.nodes);
    return atStart({ graph: { nodes, edges: edgeList(d.edges, nodes) } });
  },

  reduce(scene: MutuallyReachableScene, event: FacetRuntimeEvent): MutuallyReachableScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 두 정점을 짚는다. 아직 아무것도 묻지 않았다.
      case 'probe-begin': {
        const u = str(p.u);
        const v = str(p.v);
        if (u.length === 0 || v.length === 0) return scene;
        return {
          ...scene,
          probe: { u, v, forward: null, backward: null, verdict: null, trail: true },
          step: { kind: 'ask' },
          caption: { kind: 'ask' },
        };
      }

      // 한 방향으로 가는 길을 찾았다. 출발점은 길의 맨 앞이다.
      case 'reach-found': {
        const path = nameList(p.path);
        const probe = scene.probe;
        if (probe === null || path.length === 0) return scene;
        const lane = laneOf(probe, path[0] as string);
        const trial: Trial = { kind: 'found', path };
        return {
          ...scene,
          probe:
            lane === 0
              ? { ...probe, forward: trial }
              : { ...probe, backward: trial },
          step: { kind: 'walk', lane },
          caption: { kind: 'reached', lane },
        };
      }

      // 한 방향으로 갈 길이 없다. 닿는 곳 전부가 `region` 이고 맨 앞이 출발점이다.
      case 'reach-blocked': {
        const region = nameList(p.region);
        const probe = scene.probe;
        if (probe === null || region.length === 0) return scene;
        const lane = laneOf(probe, region[0] as string);
        const trial: Trial = { kind: 'blocked', region };
        return {
          ...scene,
          probe:
            lane === 0
              ? { ...probe, forward: trial }
              : { ...probe, backward: trial },
          step: { kind: 'flood', lane },
          caption: { kind: 'blocked', lane },
        };
      }

      // 두 방향을 다 물어 본 뒤의 판정. 기록이 한 줄 쌓인다 — 여기가 조각의 결론이다.
      case 'pair-verdict': {
        const probe = scene.probe;
        if (probe === null) return scene;
        const mutual = p.mutual === true;
        return {
          ...scene,
          probe: { ...probe, verdict: mutual },
          marks: [...scene.marks, markOf(probe, mutual)],
          step: { kind: 'verdict' },
          caption: { kind: 'verdict' },
        };
      }

      // 대표의 무리가 확정됐다. 무리 번호는 payload 가 아니라 쌓인 수에서 나온다.
      case 'group-settled': {
        const members = nameList(p.members);
        if (members.length === 0) return scene;
        return {
          ...scene,
          groups: [...scene.groups, members],
          probe: scene.probe === null ? null : { ...scene.probe, trail: false },
          step: { kind: 'settle' },
          caption: { kind: 'settled' },
        };
      }

      // 무리끼리 갈라선다. 사이를 잇는 간선은 바탕과 무리에서 파생된다.
      case 'split':
        return {
          ...scene,
          split: true,
          probe: scene.probe === null ? null : { ...scene.probe, trail: false },
          step: { kind: 'split' },
          caption: { kind: 'split' },
        };

      // 할 말을 마쳤다. 검사기가 흐려질 뿐 화면의 주장은 그대로 남는다.
      case 'done':
        return { ...scene, finished: true, step: null };

      // 처음 자리로. 판정도 무리도 갈라선 배치도 함께 사라진다.
      case 'rewind':
        return atStart({ graph: scene.graph });

      default:
        // 이 facet 이 내보내는 이벤트는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
        return scene;
    }
  },
};
