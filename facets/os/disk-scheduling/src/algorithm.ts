/**
 * 디스크 스케줄링 — 같은 요청 여덟을 다섯 정책이 받을 때 팔이 움직인 실린더 합.
 *
 * 한 판 = 손잡이 두 값(정책 · 팔 시작 자리)으로 팔을 끝까지 움직인다. 판이 끝나면 입력을 기다리고,
 * 받은 값으로 다시 한 판을 돈다.
 *
 * ── 규약 ──────────────────────────────────────────────────────────────
 *   실린더 0..top (top = 199). 거리 = |다음 자리 − 팔 자리|. 받은 뒤 팔은 그 실린더에 있다.
 *   처음 방향은 위(큰 번호 쪽) — `direction: 'up'` 만 받는다 (IR 이 위로 출발만 옮긴다).
 *   fcfs   온 차례.
 *   sstf   남은 것 가운데 팔에서 가장 가까운 것. **동률이면 번호가 작은 것.**
 *          (이 데이터의 세 시작 자리에서 동률은 한 번도 걸리지 않는다 — `countSstfTies` 가 센다)
 *   scan   가는 쪽에 남은 것 가운데 가장 가까운 것. 가는 쪽에 없으면 끝 실린더(위 top · 아래 0)까지
 *          간 뒤 돌아선다. 끝까지 가는 것도 한 걸음이고 그 거리도 합에 든다.
 *   look   scan 과 같되 끝까지 가지 않고 그 자리에서 돌아선다.
 *   c-look 돌아서지 않고 가장 낮은 남은 요청으로 건너뛴 뒤 다시 위로 간다. 건너뛴 거리도 합에 든다.
 *   팔 자리와 같은 실린더의 요청 · 고를 것이 없음은 던진다.
 *
 * ── 이벤트 ────────────────────────────────────────────────────────────
 *   round   { policy: number, start: number, top: number, requests: number[],
 *             visits: number[], totals: number[], shortest: number }
 *           판 시작 (걸음 0). visits 는 이번 판에 팔이 차례로 서는 실린더 (SCAN 은 끝 실린더 포함).
 *           totals 는 이번 시작 자리에서 다섯 정책의 거리 합, shortest 는 그 가운데 가장 짧은 정책
 *           (동률이면 앞 번호 — 이 데이터에서는 걸리지 않는다).
 *   move    { step: number, from: number, to: number, dist: number, total: number,
 *             kind: 'arrival' | 'nearest' | 'ahead' | 'edge' | 'turn' | 'wrap',
 *             request: number, up: boolean }
 *           팔의 움직임 하나 (한 걸음). step 은 1 부터. request 는 받은 요청의 온 차례 색인,
 *           끝 실린더로 가는 걸음이면 -1. up 은 움직인 뒤의 가는 쪽.
 *   finish  { policy: number, total: number }   판 끝 (입력 대기 직전)
 *   phase   { phase }   silent
 *
 * ── phase 어휘 (irs.ts 와 같다) ──────────────────────────────────────
 *   pick-arrival · pick-nearest · pick-ahead · sweep-edge · turn-back · wrap-lowest
 *
 * ── 계기 ─────────────────────────────────────────────────────────────
 *   seek-distance   팔이 움직인 실린더 합. 판 시작에 0 으로 되돌리고 걸음마다 그 걸음의 거리만 더한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DiskSchedulingData = {
  type: 'disk-scheduling';
  stepMs: number;
  /** 끝 실린더 번호 (실린더는 0..top) */
  top: number;
  /** 요청 실린더, 온 차례 */
  requests: number[];
  /** 처음 가는 쪽 — 'up' 만 받는다 */
  direction: string;
  /** 정책 식별자. 손잡이 값 = 이 목록의 색인 */
  policies: string[];
  /** 팔 시작 자리 사다리 = 손잡이 armStart 의 구간 값 */
  startLadder: number[];
  /** 첫 판 정책 (색인) */
  policy: number;
  /** 첫 판 팔 시작 자리 */
  armStart: number;
};

export type MoveKind = 'arrival' | 'nearest' | 'ahead' | 'edge' | 'turn' | 'wrap';

export type Move = {
  from: number;
  to: number;
  dist: number;
  total: number;
  kind: MoveKind;
  /** 받은 요청의 온 차례 색인. 끝 실린더로 가는 걸음이면 -1 */
  request: number;
  /** 움직인 뒤의 가는 쪽 */
  up: boolean;
};

export type SeekRun = { moves: Move[]; total: number; ties: number };

/** 정책 식별자 — 순서가 곧 IR 의 policy 번호다 (0 FCFS · 1 SSTF · 2 SCAN · 3 LOOK · 4 C-LOOK) */
export const POLICY_IDS = ['fcfs', 'sstf', 'scan', 'look', 'c-look'] as const;
export type PolicyId = (typeof POLICY_IDS)[number];

function asPolicy(id: string): PolicyId {
  const found = POLICY_IDS.find((p) => p === id);
  if (found === undefined) throw new Error(`disk-scheduling: 모르는 정책 식별자 '${id}'`);
  return found;
}

/** 남은 것 가운데 head 에서 가장 가까운 요청의 색인. 동률이면 번호가 작은 것. */
function nearest(reqs: readonly number[], done: readonly boolean[], head: number): { pick: number; tie: boolean } {
  let best = -1;
  let tie = false;
  for (let i = 0; i < reqs.length; i += 1) {
    if (done[i]) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const d = Math.abs(reqs[i] - head);
    const bd = Math.abs(reqs[best] - head);
    if (d < bd) {
      best = i;
      tie = false;
    } else if (d === bd) {
      tie = true;
      if (reqs[i] < reqs[best]) best = i;
    }
  }
  return { pick: best, tie };
}

/** 가는 쪽(up 이면 head 보다 큰 쪽)에 남은 것 가운데 가장 가까운 요청의 색인. 없으면 -1 */
function ahead(reqs: readonly number[], done: readonly boolean[], head: number, up: boolean): number {
  let best = -1;
  for (let i = 0; i < reqs.length; i += 1) {
    if (done[i]) continue;
    const gap = up ? reqs[i] - head : head - reqs[i];
    if (gap <= 0) continue;
    const bestGap = best < 0 ? 0 : up ? reqs[best] - head : head - reqs[best];
    if (best < 0 || gap < bestGap) best = i;
  }
  return best;
}

/** 한 정책으로 팔을 끝까지 움직인다. 팔이 서는 자리마다 Move 하나. */
export function seekRun(requests: readonly number[], start: number, policyId: string, top: number): SeekRun {
  const policy = asPolicy(policyId);
  if (requests.includes(start)) throw new Error(`disk-scheduling: 팔 자리 ${start} 와 같은 실린더의 요청`);
  const done = requests.map(() => false);
  const moves: Move[] = [];
  let head = start;
  let up = true;
  let total = 0;
  let ties = 0;
  const go = (to: number, kind: MoveKind, request: number): void => {
    const dist = Math.abs(to - head);
    total += dist;
    moves.push({ from: head, to, dist, total, kind, request, up });
    head = to;
    if (request >= 0) done[request] = true;
  };
  for (let step = 0; step < requests.length; step += 1) {
    if (policy === 'fcfs') {
      go(requests[step], 'arrival', step);
      continue;
    }
    if (policy === 'sstf') {
      const r = nearest(requests, done, head);
      if (r.pick < 0) throw new Error('disk-scheduling: 고를 요청이 없다');
      if (r.tie) ties += 1;
      go(requests[r.pick], 'nearest', r.pick);
      continue;
    }
    const pick = ahead(requests, done, head, up);
    if (pick >= 0) {
      go(requests[pick], 'ahead', pick);
      continue;
    }
    if (policy === 'scan') {
      go(up ? top : 0, 'edge', -1);
    }
    if (policy === 'c-look') {
      const low = ahead(requests, done, -1, true);
      if (low < 0) throw new Error('disk-scheduling: 건너뛸 요청이 없다');
      go(requests[low], 'wrap', low);
      continue;
    }
    up = !up;
    const back = ahead(requests, done, head, up);
    if (back < 0) throw new Error('disk-scheduling: 돌아선 쪽에도 요청이 없다');
    go(requests[back], 'turn', back);
  }
  return { moves, total, ties };
}

/** SSTF 에서 동률이 걸린 고르기 수 (보고용) */
export function countSstfTies(requests: readonly number[], start: number, top: number): number {
  return seekRun(requests, start, 'sstf', top).ties;
}

function isIntList(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

function readData(d: DiskSchedulingData): DiskSchedulingData {
  if (typeof d.stepMs !== 'number' || typeof d.top !== 'number') throw new Error('disk-scheduling: stepMs · top 이 없다');
  if (!isIntList(d.requests) || d.requests.length === 0) throw new Error('disk-scheduling: requests 가 없다');
  if (d.requests.some((r) => r < 0 || r > d.top)) throw new Error('disk-scheduling: 실린더 범위 밖 요청');
  if (new Set(d.requests).size !== d.requests.length) throw new Error('disk-scheduling: 같은 실린더의 요청이 겹친다');
  if (d.direction !== 'up') throw new Error(`disk-scheduling: 처음 방향 '${String(d.direction)}' 은 받지 않는다`);
  if (!Array.isArray(d.policies)) throw new Error('disk-scheduling: policies 가 없다');
  d.policies.forEach((p, i) => {
    if (p !== POLICY_IDS[i]) throw new Error(`disk-scheduling: policies[${i}] 는 '${POLICY_IDS[i]}' 여야 한다`);
  });
  if (!isIntList(d.startLadder)) throw new Error('disk-scheduling: startLadder 가 없다');
  if (!d.startLadder.includes(d.armStart)) throw new Error('disk-scheduling: armStart 가 사다리 밖');
  // 팔 자리와 같은 실린더의 요청은 `ahead` 가 가는 쪽 어디에도 넣지 못한다 — 말없이 빠지지 않게 여기서 던진다
  for (const s of d.startLadder) {
    if (d.requests.includes(s)) throw new Error(`disk-scheduling: 팔 시작 자리 ${s} 와 같은 실린더의 요청`);
  }
  if (!(d.policy >= 0 && d.policy < d.policies.length)) throw new Error('disk-scheduling: policy 가 목록 밖');
  return d;
}

export async function diskSchedulingAlgorithm(ctx: FacetContext<DiskSchedulingData>): Promise<void> {
  const rctx = ctx as ReactiveContext<DiskSchedulingData>;
  const data = readData(ctx.data);
  let policy = data.policy;
  let armStart = data.armStart;

  // 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다.
  let shownDistance = 0;
  const setDistance = (value: number): void => {
    ctx.metric('seek-distance', value - shownDistance);
    shownDistance = value;
  };

  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const phaseOf = async (kind: MoveKind): Promise<void> => {
    switch (kind) {
      case 'arrival':
        return phase('pick-arrival');
      case 'nearest':
        return phase('pick-nearest');
      case 'ahead':
        return phase('pick-ahead');
      case 'edge':
        return phase('sweep-edge');
      case 'turn':
        return phase('turn-back');
      case 'wrap':
        return phase('wrap-lowest');
    }
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const policyId = data.policies[policy];
      const run = seekRun(data.requests, armStart, policyId, data.top);
      const totals = data.policies.map((id) => seekRun(data.requests, armStart, id, data.top).total);
      let shortest = 0;
      totals.forEach((v, i) => {
        if (v < totals[shortest]) shortest = i;
      });

      setDistance(0);
      await ctx.emit({
        type: 'round',
        payload: {
          policy,
          start: armStart,
          top: data.top,
          requests: [...data.requests],
          visits: run.moves.map((m) => m.to),
          totals,
          shortest,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      for (let i = 0; i < run.moves.length; i += 1) {
        if (ctx.cancelled) return;
        const m = run.moves[i];
        await phaseOf(m.kind);
        await ctx.emit({
          type: 'move',
          payload: {
            step: i + 1,
            from: m.from,
            to: m.to,
            dist: m.dist,
            total: m.total,
            kind: m.kind,
            request: m.request,
            up: m.up,
          },
        });
        setDistance(m.total);
        if (!(await rctx.sleep(data.stepMs))) return;
      }
      await ctx.emit({ type: 'finish', payload: { policy, total: run.total } });

      // 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null && 'value' in payload
            ? (payload as { value: unknown }).value
            : undefined;
        if (input.type === 'policy') {
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= data.policies.length) {
            throw new Error(`disk-scheduling: 정책 값 ${String(value)} 은 사다리 밖`);
          }
          policy = value;
          break;
        }
        if (input.type === 'armStart') {
          if (typeof value !== 'number' || !data.startLadder.includes(value)) {
            throw new Error(`disk-scheduling: 팔 시작 값 ${String(value)} 은 사다리 밖`);
          }
          armStart = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
