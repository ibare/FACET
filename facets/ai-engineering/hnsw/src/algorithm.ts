/**
 * HNSW — 층을 쌓으면 어디서 출발해도 닿는다.
 *
 * ── 이 화면이 말하는 것
 *
 * 진입점 여섯에서 **한꺼번에** 걷는다. 층이 얕으면 걸음이 저마다 엉뚱한 데서
 * 멎고, 층을 쌓을수록 어느 자리에서 출발해도 같은 답에 닿는다.
 *
 * **층이 사는 값은 "덜 보는 것" 이 아니다.** 층을 쌓을수록 본 점은 오히려
 * 늘어난다 (5.67 → 11.00). 층이 사는 것은 **먼 데서 출발해도 맞히는 것**이다 —
 * 한 층뿐이면 가까운 이웃만 따라가다 국소에 갇히는데, 위에 성긴 층을 얹으면 큰
 * 걸음으로 먼저 대충 옮겨 놓아 그 갇힘을 벗어난다. 값을 치르고 확실함을 산다.
 * ("덜 본다" 는 조각 `coarseThenFine` 이 이미 말했다.)
 *
 * ── 걷는 법
 *
 *   층마다 (위에서 아래로):
 *     들어간 점에서 그 층의 이웃들을 본다
 *       질의에 더 가까운 것이 있으면 가장 가까운 쪽으로 옮기고 되풀이
 *       없으면 그 층에서 멈춘다
 *     멈춘 자리를 다음 층의 진입점으로 물려준다
 *     (진입점이 그 층에 없으면 그 층에서 질의에 가장 가까운 점을 쓴다)
 *
 * 층 `L` 의 구성원은 번호가 `2^L` 의 배수인 점이다. 본 점은 이웃으로 들여다본
 * 것까지 전부 세고, 물려받은 자리는 다시 세지 않는다 (`seen` 이 집합이라 구조로
 * 보장된다).
 *
 * ── 동률 규칙
 *
 * **거리가 같으면 번호가 앞선 쪽을 앞세운다.** 이웃을 고를 때도, 옮겨 갈 곳을
 * 고를 때도, 참 최근접을 정할 때도 같다. 좌표가 정수라 거리의 제곱도 정수이고,
 * 그래서 이 비교는 부동소수 오차 없이 정확하다 — 제곱근을 뽑지 않는 까닭이다.
 * 정하지 않으면 실행마다 다른 화면이 나온다.
 *
 * ── 이벤트 (facet 고유 확장, C2)
 *
 *   layers-set    { levels, members, truth }
 *                 층 구조를 세운다. `members[L]` 은 그 층의 점 id 배열.
 *                 silent 아님 — 층이 바뀌면 화면이 바뀐다.
 *   walkers-step  { tick, levels, walkers }
 *                 여섯 걸음이 **한꺼번에** 한 칸 나아간다. 순차 emit 루프로 풀면
 *                 동시성이라는 기획 의도가 훼손되므로 집합 이벤트 하나로 묶는다
 *                 (C2 의 `layer-discovered` 와 같은 취지).
 *                 `walkers[i]` = { entry, at, level, probed, seen, done }.
 *                 silent 아님.
 *   round-done    { levels, hits, seenSum, truth }
 *                 한 회차가 끝났다. silent 아님.
 *
 * 코드 패널이 없으므로 `phase` 는 발신하지 않는다 (C3 all-or-none, `irs.ts` 참조).
 *
 * ── 계기 (C5)
 *
 *   hit-count  맞힌 진입점 수      1 · 2 · 6 · 6
 *   visit-sum  본 점 합계          34 · 49 · 65 · 66
 *
 * **평균 대신 합계를 낸다.** 평균(5.67 · 8.17 · 10.83 · 11.00)은 소수라 계기로
 * 낼 수 없다 — `ctx.metric` 은 정수 델타를 쌓는 채널이고, 소수를 실으면 회차를
 * 거듭할수록 부동소수 오차가 누적된다. 합계는 정수이고 같은 것을 말한다
 * (여섯으로 나누면 평균이다).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HnswPoint = { id: string; x: number; y: number };

export type HnswData = {
  type: string;
  /** 평면의 점. 배열 차례가 곧 번호이고, 번호가 층 소속을 정한다. */
  points: HnswPoint[];
  query: { x: number; y: number };
  /** 각 점이 자기 층 안에서 들고 있는 이웃의 수. */
  neighborCount: number;
  /** 한꺼번에 걷기 시작하는 자리들. */
  entries: string[];
  /** 처음 층 수. 컨트롤바 손잡이의 `default` 구간과 같아야 한다. */
  levels: number;
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

/** 한 걸음 — 한 자리에서 이웃을 보고, 더 가까운 데가 있으면 옮긴 결과. */
export type HnswStep = {
  level: number;
  at: string;
  /** 이 걸음에서 들여다본 이웃. 첫 걸음(자리 잡기)은 비어 있다. */
  probed: string[];
  /** 여기까지 본 점 전부. 세는 배열과 그리는 배열이 이것 하나다. */
  seen: string[];
  moved: boolean;
};

export type HnswWalk = {
  entry: string;
  steps: HnswStep[];
  landed: string;
  seenCount: number;
  hit: boolean;
};

export type HnswRound = {
  levels: number;
  /** `members[L]` = 층 L 의 점 id. 위층일수록 성기다. */
  members: string[][];
  truth: string;
  walks: HnswWalk[];
  hits: number;
  seenSum: number;
};

/** 손잡이가 주는 층 수의 범위. 컨트롤바 구간과 같다. */
const MIN_LEVELS = 1;
const MAX_LEVELS = 4;

function clampLevels(n: number): number {
  return Math.max(MIN_LEVELS, Math.min(MAX_LEVELS, Math.floor(n)));
}

/** 거리의 제곱. 좌표가 정수라 값도 정수이고 비교가 정확하다. */
function dist2(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

/**
 * 한 회차를 통째로 셈한다. 순수 함수 — `ctx` 를 받지 않으므로 C8 의 대상이
 * 아니고, 검사가 이것만 따로 돌려 표와 맞댈 수 있다.
 */
export function computeHnswRound(data: HnswData, levelCount: number): HnswRound {
  const levels = clampLevels(levelCount);
  const points = data.points;
  const query = data.query;
  const k = data.neighborCount;

  const byId = new Map<string, HnswPoint>();
  const orderOf = new Map<string, number>();
  points.forEach((p, i) => {
    byId.set(p.id, p);
    orderOf.set(p.id, i);
  });

  const at = (id: string): HnswPoint => byId.get(id) ?? { id, x: 0, y: 0 };
  const order = (id: string): number => orderOf.get(id) ?? 0;

  /** 질의에 더 가까운가. 같으면 번호가 앞선 쪽. */
  const closerToQuery = (a: string, b: string): boolean => {
    const da = dist2(at(a), query);
    const db = dist2(at(b), query);
    return da < db || (da === db && order(a) < order(b));
  };

  // 층 L 의 구성원은 번호가 2^L 의 배수인 점.
  const members: string[][] = [];
  for (let L = 0; L < levels; L += 1) {
    const stride = 1 << L;
    members.push(points.filter((_, i) => i % stride === 0).map((p) => p.id));
  }

  // 각 점이 자기 층 안에서 들고 있는 가장 가까운 넷. 동률은 번호가 앞선 쪽.
  const neighbors: Array<Map<string, string[]>> = members.map((ids) => {
    const table = new Map<string, string[]>();
    for (const from of ids) {
      const sorted = ids
        .filter((id) => id !== from)
        .sort((x, y) => dist2(at(x), at(from)) - dist2(at(y), at(from)) || order(x) - order(y))
        .slice(0, k);
      table.set(from, sorted);
    }
    return table;
  });

  // 참 최근접 — 동률이면 번호가 앞선 쪽.
  let truth = points[0]?.id ?? '';
  for (const p of points) if (closerToQuery(p.id, truth)) truth = p.id;

  const walks: HnswWalk[] = data.entries.map((entry) => {
    const seen: string[] = [];
    const seenSet = new Set<string>();
    const see = (id: string): void => {
      if (seenSet.has(id)) return;
      seenSet.add(id);
      seen.push(id);
    };

    const steps: HnswStep[] = [];
    let cur = '';
    let placed = false;

    for (let L = levels - 1; L >= 0; L -= 1) {
      const ids = members[L] ?? [];
      if (!placed) {
        // 첫 층에서만 자리를 잡는다. 아래 층은 위층 구성원을 모두 품으므로
        // (2^L 의 배수는 2^(L-1) 의 배수다) 물려받은 자리가 없는 일이 없다.
        cur = ids.includes(entry)
          ? entry
          : ids.reduce((best, id) => (closerToQuery(id, best) ? id : best), ids[0] ?? entry);
        placed = true;
        see(cur);
        steps.push({ level: L, at: cur, probed: [], seen: [...seen], moved: false });
      }
      for (;;) {
        const ns = neighbors[L]?.get(cur) ?? [];
        for (const n of ns) see(n);
        let best: string = cur;
        for (const n of ns) if (closerToQuery(n, best)) best = n;
        const moved = best !== cur;
        cur = best;
        steps.push({ level: L, at: cur, probed: ns, seen: [...seen], moved });
        if (!moved) break;
      }
    }

    const landed = placed ? cur : entry;
    return { entry, steps, landed, seenCount: seen.length, hit: landed === truth };
  });

  return {
    levels,
    members,
    truth,
    walks,
    hits: walks.filter((w) => w.hit).length,
    seenSum: walks.reduce((s, w) => s + w.seenCount, 0),
  };
}

/** 한 시각의 걸음 하나 — 여섯이 한꺼번에 나아가므로 tick 으로 잘라 본다. */
export type HnswWalkerFrame = {
  entry: string;
  at: string;
  level: number;
  probed: string[];
  seen: string[];
  done: boolean;
};

function frameAt(walk: HnswWalk, tick: number): HnswWalkerFrame {
  const last = walk.steps.length - 1;
  const i = Math.min(tick, last);
  const step = walk.steps[i];
  return {
    entry: walk.entry,
    at: step?.at ?? walk.landed,
    level: step?.level ?? 0,
    probed: step?.probed ?? [],
    seen: step?.seen ?? [],
    done: tick >= last,
  };
}

/** 컨트롤바의 구간 슬라이더가 보내는 payload 에서 층 수를 읽는다 (C9). */
function readLevels(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const raw = typeof p.value === 'number'
    ? p.value
    : typeof p.levels === 'string'
      ? Number(p.levels)
      : Number.NaN;
  if (!Number.isFinite(raw)) return null;
  return clampLevels(raw);
}

export async function hnswAlgorithm(ctxIn: FacetContext<HnswData>): Promise<void> {
  // reactive 메커니즘이 주입하는 확장 컨텍스트. 등록 시그니처는 FacetContext 이므로
  // 여기서 한 번 단언하고 아래로는 좁혀진 것만 쓴다 (C9).
  const ctx = ctxIn as ReactiveContext<HnswData>;
  const data = ctx.data;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 560;

  /**
   * 계기는 **누적 채널**이다. 러너는 되감기 때만 계기를 비우는데, 손잡이를 돌려
   * 다시 도는 것은 되감기가 아니다. 그래서 지금 값을 들고 **차이만** 보낸다.
   *
   * **델타가 0 이어도 보낸다.** 층 3 과 4 는 정답이 둘 다 6 이라 이 자리를 실제로
   * 만나는데, 안 보내면 그 회차에 계기 이름이 통째로 빠져 "선언한 계기가 없는 것"
   * 과 구별되지 않는다.
   *
   * 이름은 부르는 자리에 리터럴로 남으므로 grep 으로 잡힌다 (C5).
   */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    ctx.metric(name, value - (shown.get(name) ?? 0));
    shown.set(name, value);
  };

  /** 한 회차를 재생한다. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  const playRound = async (levelCount: number): Promise<boolean> => {
    const round = computeHnswRound(data, levelCount);
    if (ctx.cancelled) return false;

    await ctx.emit({
      type: 'layers-set',
      payload: { levels: round.levels, members: round.members, truth: round.truth },
    });

    // 회차가 새로 시작하므로 계기를 원점으로 되돌린다. 그대로 두면 앞 회차의
    // 수가 남아 손잡이와 무관한 값이 뜬다.
    gauge('hit-count', 0);
    gauge('visit-sum', 0);

    const ticks = round.walks.reduce((m, w) => Math.max(m, w.steps.length), 0);
    for (let tick = 0; tick < ticks; tick += 1) {
      if (ctx.cancelled) return false;
      // 첫 걸음은 기다리지 않는다 — 기다릴 앞걸음이 없고, 문을 먼저 두면
      // stepMs 만큼 빈 화면이 보인 뒤에야 그림이 선다.
      if (tick > 0 && !(await ctx.sleep(stepMs))) return false;

      const walkers = round.walks.map((w) => frameAt(w, tick));
      // 화면이 말하는 수와 화면이 그린 것은 같은 배열에서 나온다 — 계기도
      // 프레임의 `seen` 을 세고, stage 도 같은 `seen` 을 그린다.
      gauge('visit-sum', walkers.reduce((s, f) => s + f.seen.length, 0));
      gauge('hit-count', walkers.filter((f) => f.done && f.at === round.truth).length);

      await ctx.emit({
        type: 'walkers-step',
        payload: { tick, levels: round.levels, walkers },
      });
    }

    if (ctx.cancelled) return false;
    await ctx.emit({
      type: 'round-done',
      payload: {
        levels: round.levels,
        hits: round.hits,
        seenSum: round.seenSum,
        truth: round.truth,
      },
    });
    return true;
  };

  let levels = clampLevels(typeof data.levels === 'number' ? data.levels : 3);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(levels))) return;

      // 손잡이가 다음 층 수를 줄 때까지 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'levels') continue;
        const next = readLevels(input.payload);
        if (next === null) continue;
        levels = next;
        break;
      }
    }
  } catch (err) {
    // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
    // 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
  }
}
