/**
 * VoteByNeighbors 장면 설계 — 이벤트를 화면 **명령**이 아니라 **상태**로 옮긴다.
 *
 * projector 가 하던 일을 대신한다. 다른 점은 stage 의 메서드를 부르지 않고 그저
 * 다음 장면을 돌려준다는 것이다. 그래서 어느 걸음의 화면이든 셈으로 얻는다
 * (`@ffacet/core/runtime` 의 `runtime/scene.ts`).
 *
 * ── 이 조각이 화면에 대해 알던 것은 어디에 있었나
 *
 * 옛 코드에는 **뜻을 쥔 변수가 하나도 없었다.** projector 의 `let` 0 건, DOM 되읽기
 * 0 건, 조회 분기는 `labels.includes` 한 줄(바탕에서 이름표를 세는 자리)뿐이었다.
 * stage 의 `let` 셋도 전부 기계장치였다 — `destroyed` · `raf` · `scene`.
 * 곧 **화면이 통째로 상태**였다는 뜻이고, 실제로 SVG 속성과 **타입 선언에 얹힌
 * 필드**에 흩어져 있었다 (프로토콜 3-1 의 ⑤ 자리).
 *
 * - `Scene = { caption, ring, ringR, seats, queryG, …, columns, slips, fly }` —
 *   이름은 장면이지만 알맹이는 **DOM 손잡이 묶음**이었다. 그 안에 뜻을 쥔 것이 둘.
 *   - `ringR: number` — **부름이 어디까지 닿았나.** `castVote` 가 `scene.ringR = to`
 *     로 제자리에서 고쳤고, 다음 부름의 출발 반지름이 거기서 나왔다. `let` 이 아니라
 *     객체의 필드라 ①② 어느 grep 에도 안 걸린다.
 *   - `slips` 의 자식 수 — 지금까지 몇 표가 놓였나. `<g>` 자식 수가 진행을 쥐었다.
 * - `Column = { label, box, plate, count, x, filled }` — **DOM 손잡이와 뜻·수치가
 *   한 객체.** `filled` 가 그 상자에 쌓인 표의 수이고 다음 표가 앉을 칸이 거기서
 *   나왔다. `col.filled += 1` 로 `const columns` 의 알맹이가 제자리에서 고쳐졌다.
 * - `count` 의 글자 — 그 이름표가 받은 표 수. 걸음이 실어 온 `tally` 를 받아 적었다.
 * - `seat.g` 의 `opacity` 0 — **이 이웃이 불려 나갔나.** 되돌리는 명령이 없었다.
 * - `seat.g` 의 `transform` — 좌표가 아니라 **어느 국면인가**. 제자리(1배) · 부풀어
 *   오름(1.24배) · 쪼그라들어 밖으로 밀림(0.7배 + 7px)이 한 속성에 실렸다.
 * - `seat.ghost` 의 `opacity` · `seat.spoke` 의 `opacity`/`stroke-width` — 표를 낸
 *   이웃과 잠잠해진 이웃을 가르던 자리. 전부 칠에만 있었다.
 * - `ring` 의 `stroke-dasharray` `'none'` — **안팎이 갈렸나.** 이 조각의 주장인
 *   "k 밖은 말하지 않는다" 가 점선 하나의 유무로만 적혀 있었다.
 * - `queryMark` 의 글자와 `queryCircle` 의 `fill` — 답이 나왔나, 무엇으로 나왔나.
 *
 * 여기서는 그 전부가 `arrived` · `order` · `votes` · `silenced` · `decided`
 * 다섯으로 줄었다. 고리의 반지름도 표가 앉을 칸도 상자의 셈도 승자도 그 다섯에서
 * 파생된다.
 *
 * ── 수는 한 출처에서만 나온다
 *
 * 화면에는 표 딱지의 순위·거리, 상자의 표 수, 고리의 반지름, 그리고 캡션의 승자가
 * **나란히** 뜬다. 옛 발신은 그 전부를 payload 로 실어 왔다 — `rank` · `label` ·
 * `tally` · `winner` · `indices` 가 화면이 세는 것과 다른 출처였다.
 *
 * 이제 남은 payload 는 하나뿐이다.
 *
 * - **`neighbors-ranked` 의 `order` · `distances` 는 싣는다 (판정).** 이웃까지의
 *   거리를 재고 가까운 순으로 줄 세우는 것이 이 조각의 알고리즘 **그 자체**다.
 *   내주면 장면이 조각이 피하려는 셈을 대신 하게 된다 (프로토콜 4 절 B 갈래의
 *   경계). 잰 것과 줄 세운 것이 한 발신에 함께 실려 서로 갈릴 자리가 없다.
 * - **몇 번째로 불렸나는 발신이 온 차례가 말한다.** `voter-called` 는 올 때마다
 *   하나씩 쌓이므로 `votes` 가 곧 그 순위이고, 누가 불렸는지는 `order[votes - 1]`
 *   이다. 이름표는 바탕에 있고 표 수는 장면이 센다.
 * - **잠잠해진 이웃도 싣지 않는다.** 부름을 받은 만큼을 뺀 나머지가 그들이다 —
 *   `order.slice(votes)`.
 * - **승자도 싣지 않는다.** 상자에 쌓인 표에서 나온다. 조각의 결론이 그림과 **같은
 *   자료**를 쓰게 하는 것이 이행의 알맹이다 (프로토콜 4 절 10 · 34).
 *
 * ── 담는 것과 담지 않는 것
 *
 * 좌표는 담지 않는다. 점의 값과 거리라는 **구조**만 담고, 화면의 자리도 고리의
 * 픽셀 반지름도 캔버스에서 역산하는 값이라 그리는 쪽의 몫이다 (S-piece). 두 축의
 * 배율을 같게 잡는 것도 그리는 쪽에서 정한다.
 *
 * 문안도 담지 않는다. `captionFor` 가 무엇을 말할지와 그 인자만 내고 문자는 그리는
 * 쪽이 `params.t` 로 만든다 (C10).
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { voteCallCount, type VoteByNeighborsPoint } from './algorithm.js';

/**
 * 방금 밟은 걸음. **지나가는 것**이라 무엇을 흐르게 할지 고르는 데만 쓴다.
 *
 * 계기값을 하나도 싣지 않는다 — 출발 그림이 필요한 자리가 하나(부름이 닿는 고리가
 * 어디서 자라기 시작하나)인데, 그것도 `votes - 1` 까지의 장면에서 같은 함수로
 * 셈해 낸다. `prev` 를 들출 까닭이 없다 (S-scene).
 */
export type VoteStep =
  /** 이름표 없는 점이 내려앉는다. */
  | { kind: 'arrive' }
  /** 살이 뻗어 나가며 거리를 재고 순위가 그 끝에 실린다. */
  | { kind: 'measure' }
  /** 하나가 불려 나와 상자로 날아가 표가 된다. */
  | { kind: 'cast' }
  /** 나머지가 자리에서 쪼그라들고 고리가 안팎을 가르는 선이 된다. */
  | { kind: 'hush' }
  /** 이긴 상자의 이름표가 물음점으로 돌아온다. */
  | { kind: 'crown' };

/** 캡션이 말할 것과 그 인자. 문자는 그리는 쪽이 만든다 (C10). */
export type VoteCaption =
  /** 이름표 없는 점 하나가 들어왔다. */
  | { kind: 'arrive' }
  /** 거리를 재어 가까운 순으로 줄 세웠다. */
  | { kind: 'ranked' }
  /** 몇 번째로 가까운 이웃이 어느 상자에 표를 넣었나. */
  | { kind: 'call'; rank: number; label: string }
  /** 남은 이웃은 표를 내지 못한다. */
  | { kind: 'silenced' }
  /** 표가 더 많은 쪽. */
  | { kind: 'verdict'; winner: string };

/** 표 딱지 하나 — 상자 안에 앉은 표. 화면의 순위·거리·칸이 여기서 나온다. */
export type VoteSlip = {
  /** 바탕 점 목록에서의 자리. */
  index: number;
  label: string;
  /** 1 부터. 가까운 순. */
  rank: number;
  /** 물음점까지의 거리. 재는 일은 algorithm 이 했다. */
  distance: number;
  /** 이 표까지 합한 그 이름표의 표 수. */
  tally: number;
  /** 그 상자 안에서 아래에서 몇 번째 칸인가. */
  slot: number;
};

export type VoteByNeighborsScene = {
  // ── 바탕. `initial` 이 한 번 정하고 걸음이 고치지 않는다.
  /** 이름표 없는 물음점. */
  query: { readonly x: number; readonly y: number };
  /** 이름표가 붙어 있는 이웃들. 자리 번호가 곧 점의 식별자다. */
  points: readonly VoteByNeighborsPoint[];
  /**
   * 부를 수. 표 상자의 칸 높이가 여기서 정해진다.
   *
   * 선언의 `k` 를 그대로 쓰지 않고 algorithm 이 내준 `voteCallCount` 를 지난다 —
   * 두 군데서 각자 자르면 상자의 칸 수와 실제로 불린 수가 갈린다.
   */
  k: number;

  // ── 자취. 걸음이 쌓고 `rewind` 가 턴다.
  /** 물음점이 내려앉았나. */
  arrived: boolean;
  /**
   * 가까운 순으로 줄 세운 점의 자리 번호. 아직 재지 않았으면 비어 있다.
   *
   * 재는 일과 줄 세우는 일이 이 조각의 알고리즘이므로 걸음이 실어 온다 (판정).
   */
  order: readonly number[];
  /** 점의 자리 번호마다 물음점까지의 거리. `order` 와 한 발신에 함께 실린다. */
  distances: readonly number[];
  /**
   * 지금까지 불려 나온 이웃의 수.
   *
   * 이 하나가 진행을 통째로 말한다 — 놓인 표도, 상자의 셈도, 고리가 닿은 데도,
   * 자리를 뜬 이웃도 전부 여기서 파생된다.
   */
  votes: number;
  /** 부름을 받지 못한 나머지가 잠잠해졌나. */
  silenced: boolean;
  /** 답이 나왔나. */
  decided: boolean;

  step: VoteStep | null;
};

/**
 * 걸음이 고치지 않는 바탕.
 *
 * `arrived` 아래 여섯은 전부 걸어온 자취라 여기 넣지 않는다 — 넣으면 되감은 화면이
 * 이미 표가 다 쌓이고 답까지 나온 채로 선다 (S-scene).
 */
type Base = Pick<VoteByNeighborsScene, 'query' | 'points' | 'k'>;

/**
 * 아직 아무도 오지 않은 처음 화면 — 이웃만 제자리에 앉아 있다.
 *
 * 타입을 `Pick` 으로 좁혀 두었으므로 **호출부는 객체 리터럴로 넘긴다.** 변수를
 * 넘기면 초과 속성 검사가 돌지 않아 자취가 실린 장면도 그대로 통과한다 (S-scene).
 */
function atStart(base: Base): VoteByNeighborsScene {
  return {
    query: base.query,
    points: base.points,
    k: base.k,
    arrived: false,
    order: [],
    distances: [],
    votes: 0,
    silenced: false,
    decided: false,
    step: null,
  };
}

/** unknown → 화면이 쓰는 형태. 생산자가 같은 패키지라도 경계는 경계다 (C9). */
function numberList(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

/**
 * 선언의 점 목록을 좁힌다.
 *
 * **새 배열과 새 객체를 낸다.** 러너가 주는 것은 mechanism 과 view 가 함께 쓰는 한
 * 객체라 참조로 쥐면 되짚을 때 이미 굴러간 자료로 바탕을 그린다 (S-scene).
 */
function readPoints(value: unknown): VoteByNeighborsPoint[] {
  if (!Array.isArray(value)) return [];
  const out: VoteByNeighborsPoint[] = [];
  for (const item of value) {
    const p = item as { x?: unknown; y?: unknown; label?: unknown };
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number' || typeof p?.label !== 'string') {
      continue;
    }
    out.push({ x: p.x, y: p.y, label: p.label });
  }
  return out;
}

function readQuery(value: unknown): { x: number; y: number } {
  const q = value as { x?: unknown; y?: unknown } | undefined;
  return {
    x: typeof q?.x === 'number' ? q.x : 0,
    y: typeof q?.y === 'number' ? q.y : 0,
  };
}

// ── 파생. 화면이 쓰는 수는 전부 여기를 지난다 ───────────────────────────────

/** 거리를 재어 줄을 세웠나. */
export function isRanked(scene: VoteByNeighborsScene): boolean {
  return scene.order.length > 0;
}

/** 자리 번호 `index` 의 순위 (1 부터). 아직 재지 않았거나 없는 점이면 0. */
export function rankOf(scene: VoteByNeighborsScene, index: number): number {
  const at = scene.order.indexOf(index);
  return at < 0 ? 0 : at + 1;
}

/** 이미 불려 나온 이웃들. 가까운 순. */
export function calledOf(scene: VoteByNeighborsScene): number[] {
  return scene.order.slice(0, scene.votes);
}

/**
 * 잠잠해진 이웃들 — 부름을 받은 만큼을 뺀 나머지.
 *
 * 걸음이 실어 오지 않는다. 아직 잠잠해지지 않았으면 빈 목록이다 — **머무는 자취**라
 * 정적 그리기가 그것을 세운다. 이 조각의 주장이 마지막 화면에 남는 자리다.
 */
export function hushedOf(scene: VoteByNeighborsScene): number[] {
  return scene.silenced ? scene.order.slice(scene.votes) : [];
}

/** 자리 번호 `index` 의 물음점까지의 거리. 재지 않았으면 0. */
export function distanceOf(scene: VoteByNeighborsScene, index: number): number {
  return scene.distances[index] ?? 0;
}

/**
 * 부름이 닿은 데까지의 거리. 아직 아무도 안 불렀으면 0.
 *
 * `votes` 를 인자로 받으므로 **한 걸음 앞의 반지름도 같은 함수로 낸다** — 고리가
 * 자라는 운동의 출발값을 `prev` 에서 꺼내지 않는다 (S-scene).
 */
export function reachAt(scene: VoteByNeighborsScene, votes: number): number {
  const n = Math.max(0, Math.min(votes, scene.order.length));
  if (n === 0) return 0;
  return distanceOf(scene, scene.order[n - 1] ?? 0);
}

/** 지금 부름이 닿은 데까지의 거리. */
export function reachOf(scene: VoteByNeighborsScene): number {
  return reachAt(scene, scene.votes);
}

/**
 * 상자에 앉은 표들. 순위 · 거리 · 표 수 · 칸이 **한 자리**에서 나온다.
 *
 * 옛 화면은 순위와 거리와 표 수를 걸음이 실어 온 것으로 적고 칸은 `Column.filled`
 * 로 세었다 — 같은 물음에 답이 둘이었다.
 */
export function slipsOf(scene: VoteByNeighborsScene): VoteSlip[] {
  const out: VoteSlip[] = [];
  const running = new Map<string, number>();
  const called = calledOf(scene);
  for (let at = 0; at < called.length; at += 1) {
    const index = called[at] ?? 0;
    const label = scene.points[index]?.label ?? '';
    const tally = (running.get(label) ?? 0) + 1;
    running.set(label, tally);
    out.push({
      index,
      label,
      rank: at + 1,
      distance: distanceOf(scene, index),
      tally,
      slot: tally - 1,
    });
  }
  return out;
}

/** 그 이름표가 지금까지 받은 표 수. */
export function tallyOf(scene: VoteByNeighborsScene, label: string): number {
  let n = 0;
  for (const slip of slipsOf(scene)) if (slip.label === label) n += 1;
  return n;
}

/**
 * 표가 가장 많은 이름표. 아직 답이 나오지 않았으면 null.
 *
 * **상자에 쌓인 것과 같은 자료에서 나온다.** 가까운 순으로 세면서 최다에 먼저 닿는
 * 쪽을 잡으므로 동수가 나와도 더 가까운 쪽이 이긴다 — algorithm 이 걷던 잣대와
 * 같고, 이제 그 잣대가 화면의 표와 한 출처를 쓴다 (프로토콜 4 절 34).
 */
export function winnerOf(scene: VoteByNeighborsScene): string | null {
  if (!scene.decided) return null;
  let winner = '';
  let best = 0;
  for (const slip of slipsOf(scene)) {
    if (slip.tally > best) {
      best = slip.tally;
      winner = slip.label;
    }
  }
  return best === 0 ? null : winner;
}

/**
 * 지금 화면이 할 말. 아직 아무 말도 없으면 null.
 *
 * `step` 이 아니라 **상태**에서 낸다 — 같은 걸음을 몇 번 다시 그려도 같은 말이
 * 나와야 하고, 장면에 캡션 필드를 두면 같은 것을 두 자리에 적는 꼴이다.
 */
export function captionFor(scene: VoteByNeighborsScene): VoteCaption | null {
  if (scene.decided) {
    const winner = winnerOf(scene);
    return winner === null ? null : { kind: 'verdict', winner };
  }
  if (scene.silenced) return { kind: 'silenced' };
  if (scene.votes > 0) {
    const last = scene.order[scene.votes - 1] ?? 0;
    return { kind: 'call', rank: scene.votes, label: scene.points[last]?.label ?? '' };
  }
  if (isRanked(scene)) return { kind: 'ranked' };
  return scene.arrived ? { kind: 'arrive' } : null;
}

export const voteByNeighborsScene: ScenePlan<VoteByNeighborsScene> = {
  /**
   * 첫 장면은 바탕만 세우고 비어 있다 — 이름표 붙은 이웃들만 앉아 있다.
   *
   * 이 조각은 `init` 이벤트를 발신하지 않으므로 바탕을 여기서 좁힌다. `readPoints`
   * 가 **새 배열**을 내므로 러너가 준 객체를 참조로 쥐지 않는다 (S-scene).
   */
  initial(initialData: unknown): VoteByNeighborsScene {
    const d = (initialData ?? {}) as Record<string, unknown>;
    const points = readPoints(d['points']);
    return atStart({
      query: readQuery(d['query']),
      points,
      k: voteCallCount(d['k'], points.length),
    });
  },

  reduce(scene: VoteByNeighborsScene, event: FacetRuntimeEvent): VoteByNeighborsScene {
    switch (event.type) {
      /*
       * 이름표 없는 점이 들어온다. 한 회차의 첫 걸음이므로 자취를 새로 깐다 —
       * 되감지 않고 곧바로 다시 재생하는 길도 있다.
       */
      case 'query-arrived':
        return {
          ...atStart({ query: scene.query, points: scene.points, k: scene.k }),
          arrived: true,
          step: { kind: 'arrive' },
        };

      /*
       * 거리를 재어 줄을 세웠다. 재는 일이 이 조각의 알고리즘이므로 판정을 싣는다.
       * 잰 것과 줄 세운 것이 한 발신에 함께 와 서로 갈릴 자리가 없다.
       */
      case 'neighbors-ranked': {
        const p = event.payload as { order?: unknown; distances?: unknown } | undefined;
        const order = numberList(p?.order);
        if (order.length === 0) return scene;
        return {
          ...scene,
          order,
          distances: numberList(p?.distances),
          votes: 0,
          silenced: false,
          decided: false,
          step: { kind: 'measure' },
        };
      }

      /*
       * 하나가 불려 나와 표를 놓는다. 누가 몇 번째로 불렸는지도, 어느 이름표인지도,
       * 표가 몇이 되었는지도 실어 오지 않는다 — **이 발신의 차례가 곧 순위**이고
       * 나머지는 바탕과 `order` 가 말한다.
       */
      case 'voter-called':
        if (scene.votes >= scene.order.length) return scene;
        return { ...scene, votes: scene.votes + 1, step: { kind: 'cast' } };

      /*
       * 나머지가 잠잠해진다. 누가 남았는지 실어 오지 않는다 — 부른 만큼을 뺀
       * 나머지가 그들이다.
       */
      case 'outsiders-silenced':
        if (!isRanked(scene)) return scene;
        return { ...scene, silenced: true, step: { kind: 'hush' } };

      /*
       * 답이 나왔다. 승자를 실어 오지 않는다 — 상자에 쌓인 표에서 나온다
       * (프로토콜 4 절 10 · 34).
       */
      case 'done':
        if (scene.votes === 0) return scene;
        return { ...scene, decided: true, step: { kind: 'crown' } };

      case 'rewind':
        // 바탕만 남기고 자취를 턴다. 변수가 아니라 객체 리터럴을 넘긴다 (S-scene).
        return atStart({ query: scene.query, points: scene.points, k: scene.k });

      default:
        // 이 algorithm 이 발신하는 것은 위 여섯이 전부다. 그 밖은 조용히 흘린다 (C2).
        return scene;
    }
  },
};
