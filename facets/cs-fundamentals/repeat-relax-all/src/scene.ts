/**
 * repeatRelaxAll 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각의 화면이 어떻게 생겼나
 *
 * 위에 정점이 사슬로 놓이고 살핌창 하나가 간선을 보는 순서대로 미끄러진다. 아래
 * 장부는 한 줄이 한 바퀴, 칸 하나가 살핌 하나다. 바퀴가 끝나도 앞 줄을 지우지
 * 않으므로 **장부가 통째로 쌓여** 다 끝난 화면에 "몇 바퀴 만에 굳었나" 가 남는다.
 * 그 쌓임이 이 조각의 결론이다.
 *
 * ── 숨은 상태는 어디에 있었나
 *
 * projector 의 `let` 은 `model` 하나뿐이었고 `.has`/`.get` 으로 갈리는 분기도,
 * DOM 을 도로 읽는 자리도 없었다. **전부 stage 에 있었다.**
 *
 * - **`appliedAt: { round, edgeIndex }[]`** — `const` 로 묶였는데 `push` 와
 *   `length = 0` 으로 제자리에서 고쳐지는 배열이고, 담긴 것이 **이 조각의 결론**
 *   (한 바퀴에 한 칸씩 내려가는 계단) 이었다. 이제 `ledger` 에서 `reckon` 이 센다.
 * - **`cells: CellParts[][]`** — 장부 스물. 살핌의 자취가 ring 의 `fill` 과 dash 의
 *   `opacity` 와 `value.textContent` 에만 있었다. 이제 `ledger` · `scanning` 이 말한다.
 * - **`nodeStates: NodeState[]`** — 정점이 `unknown`/`active`/`settled` 중 어디인가.
 *   `active → settled` 승격이 `round-end` 걸음 안에서만 벌어져 어느 발신에도
 *   실리지 않았다. 이제 **그 거리를 얻은 바퀴가 이미 닫혔나**로 파생된다.
 * - **거리표가 `badgeText.textContent` 에만 있었다.** 정점이 지금 아는 거리를
 *   적어 둔 곳이 화면 글자뿐이라, 되짚어 세운 직후에는 그것이 아직 옛 화면의
 *   수다. 이제 `reckon` 의 `dist` 다.
 * - **`probeX: number | null`** — 살핌창이 선 자리이자 **창이 아직 나타나지
 *   않았나**. 한 변수에 두 뜻이 실려 있었다. 자리는 `probeAt` 이 장부에서
 *   파생시키고, 출발 자리는 `step.from` 이 말한다.
 * - **`activeRound`** — 띠가 얹힌 줄. `openRound` 가 `round === activeRound` 로
 *   갈리는 암묵 분기를 달고 있었다. 이제 장부의 마지막 줄이 그 줄이다.
 * - **`edgeLines[i]` 의 굵은 `stroke`** — 값이 이 간선을 타고 건너간 적 있나.
 *   되돌리는 명령이 없어 쌓이던 자취인데 **그 누적이 주장의 일부**다 (`used`).
 *
 * ── 걸음은 셀 수 있는 수를 싣지 않는다
 *
 * 옛 발신은 `round` · `edgeIndex` · `rounds` · `scans` · `applied` · `nodes` ·
 * `idle` 을 실어 왔다. 전부 **구조에서 세지는 것**이다 — 바퀴는 `round-end` 가
 * 올 때마다 하나씩 쌓이므로 `ledger.length` 가 그 번호이고, 간선 번호는 그 바퀴에
 * 이미 본 살핌 수(`scanning.length`)이며, 셈은 장부를 훑으면 나온다. 장면이 세면
 * 화면과 수가 같은 출처가 된다.
 *
 * 남긴 둘은 이렇다.
 *
 * - **`reason`** — 헛돈 까닭이 '꼬리를 모른다' 인가 '더 짧아지지 않는다' 인가.
 *   걸음이 내리는 **판정**이라 싣는다.
 * - **`dist`** — 간선을 타고 건너간 새 거리. `dist[from] + weight` 는 **벨만-포드의
 *   점화식 그 자체**라 장면에 내주면 장면이 알고리즘을 되풀이하는 꼴이 된다
 *   (프로토콜 4 절 `bottom-up-table` 의 자리). 싣는다.
 *
 * 바퀴 수만은 **함수로 내준다** — `relaxRoundCount`. 셈하는 쪽과 그리는 쪽이 각자
 * `Math.max(1, nodes.length - 1)` 로 자르면 갈린다 (프로토콜 4 절 `coin-flip-height`).
 * 장면이 그 함수로 한 번 좁히고 그리는 쪽은 `scene.rounds` 만 쓴다.
 *
 * 좌표는 담지 않는다. 정점 수와 간선 수가 자리를 정하므로 그리는 쪽이 캔버스에서
 * 역산한다 (S-piece). 문안도 담지 않는다 — 무엇을 말할지와 그 인자만 담고 문자는
 * 그리는 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { relaxRoundCount } from './algorithm.js';

/** 방향 간선 하나. 배열 순서가 곧 펴는 순서다. */
export type RepeatRelaxAllEdge = { readonly from: string; readonly to: string; readonly weight: number };

/**
 * 살핌 하나가 받은 답.
 *
 * "아무 일도 없었다" 를 둘로 가른다 — `unknown` 은 꼬리를 아직 몰라 **잴 것도
 * 없던** 자리이고, `noGain` 은 재 보았는데 더 짧아지지 않던 자리다. 같은 칠로
 * 두면 장부가 그 구분을 지우고, 그러면 "왜 마지막 바퀴가 통째로 헛도는가" 가
 * 화면에서 사라진다.
 */
export type RelaxVerdict = 'unknown' | 'noGain' | 'applied';

/** 장부의 칸 하나. */
export type RelaxScan = {
  readonly verdict: RelaxVerdict;
  /** 일이 됐을 때 머리가 얻은 새 거리. 그 밖에는 `null`. */
  readonly dist: number | null;
};

/**
 * 방금 밟은 걸음. **무엇을 흐르게 할지 고르는 데** 쓰고, 운동의 **출발 자리**도
 * 여기서 나온다.
 *
 * 살핌창은 앞서 선 자리에서 지금 자리로 미끄러진다. 그 출발 자리를 `prev` 에서
 * 꺼내면 "`prev` 는 고르는 데만" 을 어기므로 (S-scene), `reduce` 가 앞 장면에서
 * 읽어 여기 싣는다. `from` 이 `null` 이면 창이 아직 화면에 없었다는 뜻이다.
 *
 * 출발 **그림**은 따로 싣지 않는다 — 장부에서 마지막 살핌 하나를 덜어 내고 다시
 * 셈하면 그대로 나온다 (`stage` 의 `aim: 'before'`).
 */
export type RepeatRelaxAllStep =
  | {
      readonly kind: 'scan';
      /** 지금 보는 간선의 번호. */
      readonly at: number;
      /** 살핌창이 있던 자리. 아직 없었으면 `null`. */
      readonly from: number | null;
      readonly verdict: RelaxVerdict;
      readonly dist: number | null;
    }
  | { readonly kind: 'roundEnd' }
  | { readonly kind: 'finish'; readonly from: number | null };

/** 캡션이 말할 것. 문안이 아니라 무엇을 말할지와 그 인자다 (C10). */
export type RepeatRelaxAllCaption =
  | { readonly kind: 'start' }
  | { readonly kind: 'skip'; readonly at: number; readonly reason: 'unknown' | 'noGain' }
  | { readonly kind: 'apply'; readonly at: number; readonly dist: number }
  /** 방금 닫힌 바퀴의 번호와 셈은 `reckon` 이 센다 — 화면의 장부와 같은 자료다. */
  | { readonly kind: 'roundEnd' }
  | { readonly kind: 'done' };

export type RepeatRelaxAllScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 바꾸지 않는다.
  readonly nodes: readonly string[];
  readonly edges: readonly RepeatRelaxAllEdge[];
  readonly source: string;
  /** 굴릴 바퀴 수. `relaxRoundCount` 가 한 번 좁힌 값이다. */
  readonly rounds: number;

  // ── 걸어온 자취.
  /** 마친 바퀴들. 한 줄이 한 바퀴이고 **길이가 곧 마친 바퀴 수**다. */
  readonly ledger: readonly (readonly RelaxScan[])[];
  /** 지금 도는 바퀴의 살핌들. **길이가 곧 다음에 볼 간선의 번호**다. */
  readonly scanning: readonly RelaxScan[];
  /** 다 끝났나. 살핌창이 물러나고 계단이 드러난다. */
  readonly finished: boolean;

  readonly step: RepeatRelaxAllStep | null;
  readonly caption: RepeatRelaxAllCaption;
};

/**
 * 걸음이 **바꾸지 않는** 부분. 첫 장면이 한 번 정한다.
 *
 * `ledger` · `scanning` · `finished` 를 여기 넣지 않는다. 그것들은 걸어온 자취라,
 * 바탕으로 묶어 되감기에 넘기면 되감은 화면이 장부를 채운 채로 서고 그 위에
 * algorithm 이 처음부터 다시 센다. 타입으로 좁혀 두고 **부르는 쪽은 객체 리터럴**로
 * 넘긴다 — 변수로 넘기면 초과 속성 검사가 돌지 않아 좁힌 타입이 아무것도 막지 못한다.
 */
type RepeatRelaxAllBase = Pick<RepeatRelaxAllScene, 'nodes' | 'edges' | 'source' | 'rounds'>;

/** 바탕만 남기고 걸어온 자취를 거둔 장면. 첫 장면과 되감기가 함께 쓴다. */
function atStart(base: RepeatRelaxAllBase): RepeatRelaxAllScene {
  return {
    nodes: base.nodes,
    edges: base.edges,
    source: base.source,
    rounds: base.rounds,
    ledger: [],
    scanning: [],
    finished: false,
    step: null,
    caption: { kind: 'start' },
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dist(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * 선언에서 정점 이름을 읽는다.
 *
 * 값만 베껴 담아 참조를 쥐지 않는다 — 러너가 주는 것은 mechanism 과 view 가 함께
 * 쓰는 한 객체라, 참조를 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readNodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) if (typeof raw === 'string' && raw.length > 0) out.push(raw);
  return out;
}

/** 선언에서 간선을 읽는다. 성하지 않은 것은 버린다. */
function readEdges(value: unknown): RepeatRelaxAllEdge[] {
  if (!Array.isArray(value)) return [];
  const out: RepeatRelaxAllEdge[] = [];
  for (const item of value) {
    const edge = item as { from?: unknown; to?: unknown; weight?: unknown };
    if (typeof edge?.from !== 'string' || edge.from.length === 0) continue;
    if (typeof edge?.to !== 'string' || edge.to.length === 0) continue;
    if (typeof edge?.weight !== 'number' || !Number.isFinite(edge.weight)) continue;
    out.push({ from: edge.from, to: edge.to, weight: edge.weight });
  }
  return out;
}

/** 그려야 할 장부 줄들. 진행 중인 바퀴가 마지막 줄로 붙는다. */
export function rowsOf(scene: RepeatRelaxAllScene): readonly (readonly RelaxScan[])[] {
  return scene.scanning.length > 0 ? [...scene.ledger, scene.scanning] : scene.ledger;
}

/**
 * 살핌창이 선 간선 번호. 마지막 살핌이 곧 그 자리다.
 *
 * 다 끝났으면 `null` — 볼 것이 없으니 창이 물러난다.
 */
export function probeAt(scene: RepeatRelaxAllScene): number | null {
  if (scene.finished) return null;
  const rows = rowsOf(scene);
  const last = rows[rows.length - 1];
  if (!last || last.length === 0) return null;
  return last.length - 1;
}

/** 정점의 형편. 채움이 이것을 말한다 — 모름 / 방금 얻음 / 굳음. */
export type RelaxNodeState = 'unknown' | 'active' | 'settled';

/**
 * 장면 하나에서 나오는 셈 전부.
 *
 * **화면에 나란히 뜨는 수는 전부 여기를 지난다.** 거리 배지 · 장부 칸 · 줄마다의
 * 셈 · 계단 · 마감 문장이 각자 셈해지면 언젠가 갈린다 (프로토콜 4 절).
 */
export type RepeatRelaxAllReckoning = {
  /** 정점마다 지금 아는 거리. 모르면 `null` (화면에서 ∞). */
  readonly dist: readonly (number | null)[];
  readonly state: readonly RelaxNodeState[];
  /** 간선마다 값이 타고 건너간 적 있나. 되돌리는 명령이 없던 자취다. */
  readonly used: readonly boolean[];
  /** 마친 바퀴마다의 셈. 진행 중인 바퀴는 들지 않는다 — 아직 셀 때가 아니다. */
  readonly tallies: readonly { readonly applied: number; readonly scans: number }[];
  /** 일이 된 살핌의 자리. 이으면 한 바퀴에 한 칸씩 내려가는 계단이 된다. */
  readonly stair: readonly { readonly row: number; readonly at: number }[];
  readonly scans: number;
  readonly applied: number;
};

/**
 * 장부를 훑어 화면이 쓰는 수를 전부 셈한다. 순수 함수다.
 *
 * @param rows 그릴 장부 줄들.
 * @param closed 그중 **이미 닫힌** 바퀴 수. 닫힌 바퀴에서 얻은 거리는 굳은 것이고,
 *   진행 중인 바퀴에서 얻은 거리는 아직 방금 얻은 것이다 — 옛 stage 가
 *   `finishRound` 안에서 `active → settled` 로 승격시키던 바로 그 갈림이다.
 */
export function reckonRows(
  scene: RepeatRelaxAllScene,
  rows: readonly (readonly RelaxScan[])[],
  closed: number,
): RepeatRelaxAllReckoning {
  const dists: (number | null)[] = scene.nodes.map((name) => (name === scene.source ? 0 : null));
  const state: RelaxNodeState[] = scene.nodes.map((name) =>
    name === scene.source ? 'settled' : 'unknown',
  );
  const used: boolean[] = scene.edges.map(() => false);
  const tallies: { applied: number; scans: number }[] = [];
  const stair: { row: number; at: number }[] = [];
  let scans = 0;
  let applied = 0;

  for (let row = 0; row < rows.length; row += 1) {
    const line = rows[row];
    let rowApplied = 0;
    for (let at = 0; at < line.length; at += 1) {
      scans += 1;
      const scan = line[at];
      if (scan.verdict !== 'applied' || scan.dist === null) continue;
      applied += 1;
      rowApplied += 1;
      used[at] = true;
      stair.push({ row, at });
      const edge = scene.edges[at];
      if (!edge) continue;
      const head = scene.nodes.indexOf(edge.to);
      if (head < 0) continue;
      dists[head] = scan.dist;
      state[head] = row < closed ? 'settled' : 'active';
    }
    if (row < closed) tallies.push({ applied: rowApplied, scans: line.length });
  }

  return { dist: dists, state, used, tallies, stair, scans, applied };
}

/** 지금 장면 그대로의 셈. */
export function reckon(scene: RepeatRelaxAllScene): RepeatRelaxAllReckoning {
  return reckonRows(scene, rowsOf(scene), scene.ledger.length);
}

/**
 * 마지막 살핌 하나를 덜어 낸 장부. 살핌 걸음의 **출발 그림**이 여기서 나온다.
 *
 * 값이 간선을 타고 건너가는 운동은 "아직 건너오지 않은" 그림에서 출발해야 하는데,
 * 그 그림을 `prev` 에서 꺼내면 S-scene 위반이다. 장부에서 한 칸을 덜면 같은 것이
 * 셈으로 나온다.
 */
export function rowsBeforeLastScan(
  rows: readonly (readonly RelaxScan[])[],
): readonly (readonly RelaxScan[])[] {
  if (rows.length === 0) return rows;
  const last = rows[rows.length - 1];
  if (last.length <= 1) return rows.slice(0, -1);
  return [...rows.slice(0, -1), last.slice(0, -1)];
}

export const repeatRelaxAllScene: ScenePlan<RepeatRelaxAllScene> = {
  /**
   * 첫 장면은 선언에 적힌 사슬과 굴릴 바퀴 수다.
   *
   * 이 조각은 바탕을 실어 보내는 `init` 발신이 없으므로 선언에서 읽는다.
   */
  initial(initialData: unknown): RepeatRelaxAllScene {
    const raw = (initialData ?? {}) as { nodes?: unknown; edges?: unknown; source?: unknown };
    const nodes = readNodes(raw.nodes);
    const edges = readEdges(raw.edges);
    const source = str(raw.source) !== '' ? str(raw.source) : (nodes[0] ?? '');
    return atStart({ nodes, edges, source, rounds: relaxRoundCount(nodes.length) });
  },

  reduce(scene: RepeatRelaxAllScene, event: FacetRuntimeEvent): RepeatRelaxAllScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;

    switch (event.type) {
      // 간선 하나를 봤는데 아무 일도 없었다. **몇 번째 간선인가는 이 바퀴에 이미
      // 본 살핌 수**가 말한다 — 발신이 오는 차례가 곧 그 번호다.
      case 'relax-skip': {
        const at = scene.scanning.length;
        if (scene.finished || at >= scene.edges.length) return scene;
        const reason = p.reason === 'noGain' ? 'noGain' : 'unknown';
        return {
          ...scene,
          scanning: [...scene.scanning, { verdict: reason, dist: null }],
          step: { kind: 'scan', at, from: probeAt(scene), verdict: reason, dist: null },
          caption: { kind: 'skip', at, reason },
        };
      }

      // 값이 간선을 타고 건너가 머리의 거리가 정해졌다.
      case 'relax-apply': {
        const at = scene.scanning.length;
        if (scene.finished || at >= scene.edges.length) return scene;
        const next = dist(p.dist);
        if (next === null) return scene;
        return {
          ...scene,
          scanning: [...scene.scanning, { verdict: 'applied', dist: next }],
          step: { kind: 'scan', at, from: probeAt(scene), verdict: 'applied', dist: next },
          caption: { kind: 'apply', at, dist: next },
        };
      }

      // 한 바퀴가 끝났다. 줄이 닫히면서 그 바퀴에 얻은 거리가 굳는다.
      case 'round-end': {
        if (scene.finished || scene.scanning.length === 0) return scene;
        return {
          ...scene,
          ledger: [...scene.ledger, scene.scanning],
          scanning: [],
          step: { kind: 'roundEnd' },
          caption: { kind: 'roundEnd' },
        };
      }

      // 다 굴렸다. 살핌창이 물러나고 일이 된 자리를 이은 계단이 드러난다.
      case 'done':
        return {
          ...scene,
          // 바퀴가 덜 닫힌 채 끝나도 장부는 온전해야 한다.
          ledger: scene.scanning.length > 0 ? [...scene.ledger, scene.scanning] : scene.ledger,
          scanning: [],
          finished: true,
          step: { kind: 'finish', from: probeAt(scene) },
          caption: { kind: 'done' },
        };

      // 손으로 짚기 시작 — 장부를 통째로 거두고 처음 화면으로 돌아간다.
      case 'rewind':
        return atStart({
          nodes: scene.nodes,
          edges: scene.edges,
          source: scene.source,
          rounds: scene.rounds,
        });

      default:
        // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 버린다 (C2).
        return scene;
    }
  },
};
