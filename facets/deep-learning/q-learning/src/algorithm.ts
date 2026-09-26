/**
 * Q-러닝과 탐험 — 복도 네 칸에서 행위자 다섯이 같은 ε 로 판 60 을 배운다.
 *
 * 복도: 칸 0 작은 목표(끝) · 1 출발 · 2 · 3 큰 목표(끝). 들어가는 이동의 상은 `rewards`.
 * 행동 0 왼 · 1 오른. Q 는 여덟 칸 목록, 색인 2·s + a (끝 칸의 Q 네 칸은 0 에 머문다).
 *
 * ── 생성기 (행위자마다 제 씨앗의 생성기 하나 · 씨앗은 `seeds`)
 *   Park–Miller 최소 표준: x ← 48271 · x mod 2147483647, u = x / 2147483647.
 *   뽑는 차례 (이동마다): 탐험 주사위 u₁ → u₁ < ε 일 때만 방향 주사위 u₂.
 *   탐험이 아니면 u₂ 를 뽑지 않고 −1 을 넘긴다. ε 0 에서도 u₁ 은 이동마다 뽑는다.
 *
 * ── 셈 (IR 과 한 벌)
 *   chooseAction: u₁ < ε 이면 탐험 — u₂ < 0.5 이면 왼, 아니면 오른. 아니면 greedyAction.
 *   greedyAction: Q(s, 왼) ≥ Q(s, 오른) 이면 왼 (동률이면 왼 — 첫 판에 다섯 모두 이 동률로 작은 목표를 밟는다).
 *   qUpdate: 목표값 = r (s′ 가 끝 칸) 또는 r + γ·max(Q(s′, 왼), Q(s′, 오른)). Q(s, a) ← Q + α·(목표값 − Q).
 *   한 판은 출발에서 고르고 → 옮기고 → 갱신을 끝 칸에 들 때까지. `moveLimit` 에 닿으면 던진다.
 *   손잡이를 돌리면 Q 0 · 같은 씨앗에서 처음부터 다시 배운다 (앞 판의 학습을 이어 쓰지 않는다).
 *
 * ── 이벤트 (payload 스키마)
 *   corridor (silent)  { cells: number, start: number, terminal: boolean[], rewards: number[],
 *                        roles: ('small' | 'big' | 'start' | 'path')[], agents: number, episodes: number, qMax: number }
 *                      판 머리마다 보낸다 — 무대가 복도 · 막대 축척을 세우는 값 (qMax = 상의 최댓값)
 *   round              { epsilon: number, q: number[][] (다섯 × 여덟, 모두 0), positions: number[] (다섯 모두 출발) }
 *                      걸음 0. 앞 판의 결론(표지 · 끝 칸 · 탐욕 화살표)을 걷는다
 *   episode            { episode: number, episodes: number, ends: number[] (행위자마다 이번 판의 끝 칸),
 *                        q: number[][] (판 끝의 Q), reached: boolean[] (지금까지 큰 목표를 밟았나),
 *                        greedy: number[] (지금 출발 칸의 탐욕 행동), bigNow: number (이번 판에 큰 목표로 끝난 수),
 *                        reachedCount: number, preferCount: number }
 *   final              { greedy: number[], preferCount: number, leftCount: number, agents: number, episodes: number }
 *                      끝 걸음 — 출발 칸 탐욕 읽기
 *   phase (silent)     { phase: 'choose' | 'update' }
 *
 * ── 걸음 (걸음 0 포함 62)
 *   걸음 0 (phase 없음, edgeMs) → 판 1..60 을 판 하나에 한 걸음 (phase update, stepMs) → 끝 걸음 (phase choose, edgeMs).
 *   phase 는 그 걸음의 이벤트(episode · final) **바로 앞**에 보낸다 — 되짚을 때 자취가 같은 걸음에 묶는다.
 *
 * ── phase 어휘: choose · update (irs.ts 와 같다)
 *   판마다 prefer-big 을 셀 때도 greedyAction 을 쓰되 phase 를 보내지 않는다.
 *
 * ── 계기 (이번 판의 지금 값 · 차이만 보낸다 · 판 머리 0)
 *   episode      지난 판 수
 *   reached-big  지금까지 큰 목표를 한 번이라도 밟은 행위자 수
 *   prefer-big   지금 출발 칸의 탐욕이 오른쪽인 행위자 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type QLearningData = {
  type: 'q-learning';
  stepMs: number;
  edgeMs: number;
  rewards: number[];
  terminal: boolean[];
  start: number;
  alpha: number;
  gamma: number;
  episodes: number;
  moveLimit: number;
  seeds: number[];
  epsilonLadder: number[];
  epsilon: number;
};

const MODULUS = 2147483647;
const MULTIPLIER = 48271;
const AGENT_COUNT = 5;

/** 행동 번호 — 0 왼 · 1 오른. */
const LEFT = 0;
const RIGHT = 1;

// ── 좁히개 — ctx.data 의 모양을 보고 어긋나면 던진다

function isNumberList(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function isBoolList(v: unknown): v is boolean[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'boolean');
}

function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`q-learning: ${key} 가 수가 아니다`);
  return v;
}

export function narrowQLearningData(raw: unknown): QLearningData {
  if (typeof raw !== 'object' || raw === null) throw new Error('q-learning: initialData 가 없다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'q-learning') throw new Error(`q-learning: type 이 'q-learning' 이 아니다`);
  const { rewards, terminal, seeds, epsilonLadder } = o;
  if (!isNumberList(rewards) || rewards.length < 3) throw new Error('q-learning: rewards 가 수 목록이 아니다');
  if (!isBoolList(terminal) || terminal.length !== rewards.length) throw new Error('q-learning: terminal 이 rewards 와 길이가 다르다');
  if (!isNumberList(seeds) || seeds.length !== AGENT_COUNT) throw new Error(`q-learning: seeds 는 ${AGENT_COUNT} 개다`);
  for (const s of seeds) {
    if (!Number.isInteger(s) || s < 1 || s >= MODULUS) throw new Error(`q-learning: 씨앗 ${s} 은 1 ≤ x < 2³¹−1 인 정수가 아니다`);
  }
  if (!isNumberList(epsilonLadder) || epsilonLadder.length === 0) throw new Error('q-learning: epsilonLadder 가 없다');
  const data: QLearningData = {
    type: 'q-learning',
    stepMs: num(o, 'stepMs'),
    edgeMs: num(o, 'edgeMs'),
    rewards: [...rewards],
    terminal: [...terminal],
    start: num(o, 'start'),
    alpha: num(o, 'alpha'),
    gamma: num(o, 'gamma'),
    episodes: num(o, 'episodes'),
    moveLimit: num(o, 'moveLimit'),
    seeds: [...seeds],
    epsilonLadder: [...epsilonLadder],
    epsilon: num(o, 'epsilon'),
  };
  if (!Number.isInteger(data.start) || data.start < 0 || data.start >= rewards.length || terminal[data.start]) {
    throw new Error('q-learning: start 가 끝 칸이 아닌 칸 번호가 아니다');
  }
  if (!terminal[0] || !terminal[terminal.length - 1]) throw new Error('q-learning: 복도의 두 끝이 끝 칸이 아니다');
  // 큰 목표는 오른쪽 끝이라는 것이 이 데이터의 약속이다 (reached-big · prefer-big 이 그 끝을 센다)
  if (!(rewards[rewards.length - 1]! > rewards[0]!)) throw new Error('q-learning: 오른쪽 끝의 상이 왼쪽 끝보다 크지 않다');
  if (!Number.isInteger(data.episodes) || data.episodes < 1) throw new Error('q-learning: episodes 가 양의 정수가 아니다');
  if (!Number.isInteger(data.moveLimit) || data.moveLimit < 1) throw new Error('q-learning: moveLimit 가 양의 정수가 아니다');
  if (!data.epsilonLadder.includes(data.epsilon)) throw new Error(`q-learning: 기본 ε ${data.epsilon} 이 사다리에 없다`);
  return data;
}

// ── 생성기

/** Park–Miller 최소 표준 — 씨앗 하나의 흐름. 곱의 최대 ≈ 1.04e14 < 2⁵³ 이라 number 로 정확하다. */
export function makeGenerator(seed: number): () => number {
  let x = seed;
  return () => {
    x = (MULTIPLIER * x) % MODULUS;
    return x / MODULUS;
  };
}

// ── 셈 (IR 과 한 벌)

export function greedyAction(q: readonly number[], s: number): number {
  if (q[2 * s]! >= q[2 * s + 1]!) return LEFT;
  return RIGHT;
}

export function chooseAction(q: readonly number[], s: number, uExplore: number, uDir: number, epsilon: number): number {
  if (uExplore < epsilon) {
    if (uDir < 0.5) return LEFT;
    return RIGHT;
  }
  return greedyAction(q, s);
}

export function qUpdate(
  q: number[],
  s: number,
  a: number,
  reward: number,
  s2: number,
  terminal: boolean,
  alpha: number,
  gamma: number,
): number {
  let target = reward;
  if (!terminal) {
    let best = q[2 * s2]!;
    if (q[2 * s2 + 1]! > best) best = q[2 * s2 + 1]!;
    target = reward + gamma * best;
  }
  const i = 2 * s + a;
  q[i] = q[i]! + alpha * (target - q[i]!);
  return q[i]!;
}

/** 한 이동의 기록 — 검사가 IR 과 견준다. */
export type MoveRecord = {
  q: number[];
  s: number;
  uExplore: number;
  uDir: number;
  action: number;
  s2: number;
  reward: number;
  terminal: boolean;
  newQ: number;
};

export type EpisodeRecord = {
  end: number;
  moves: number;
  q: number[];
  greedy: number;
  rewardGot: number;
};

export type AgentRun = {
  episodes: EpisodeRecord[];
  firstBig: number | null;
  moves: MoveRecord[];
};

/** 행위자 하나의 판 전부. 처음 상태(Q 0) · 제 씨앗에서 시작한다. */
export function runAgent(data: QLearningData, epsilon: number, seed: number): AgentRun {
  const cells = data.rewards.length;
  const q = new Array<number>(2 * cells).fill(0);
  const draw = makeGenerator(seed);
  const big = cells - 1;
  const episodes: EpisodeRecord[] = [];
  const moves: MoveRecord[] = [];
  let firstBig: number | null = null;
  for (let ep = 1; ep <= data.episodes; ep += 1) {
    let s = data.start;
    let count = 0;
    for (;;) {
      if (count >= data.moveLimit) throw new Error(`q-learning: 판 ${ep} 이 한도 ${data.moveLimit} 이동에 닿았다`);
      const uExplore = draw();
      let uDir = -1;
      if (uExplore < epsilon) uDir = draw();
      const before = [...q];
      const action = chooseAction(q, s, uExplore, uDir, epsilon);
      const s2 = action === LEFT ? s - 1 : s + 1;
      const reward = data.rewards[s2]!;
      const terminal = data.terminal[s2]!;
      const newQ = qUpdate(q, s, action, reward, s2, terminal, data.alpha, data.gamma);
      moves.push({ q: before, s, uExplore, uDir, action, s2, reward, terminal, newQ });
      count += 1;
      s = s2;
      if (terminal) break;
    }
    if (s === big && firstBig === null) firstBig = ep;
    episodes.push({ end: s, moves: count, q: [...q], greedy: greedyAction(q, data.start), rewardGot: data.rewards[s]! });
  }
  return { episodes, firstBig, moves };
}

/** 손잡이 값 하나의 판 전부 — 다섯이 나란히. */
export function runAll(data: QLearningData, epsilon: number): AgentRun[] {
  return data.seeds.map((seed) => runAgent(data, epsilon, seed));
}

// ── 알고리즘

export async function qLearningAlgorithm(ctx: FacetContext<QLearningData>): Promise<void> {
  const rc = ctx as ReactiveContext<QLearningData>;
  const data = narrowQLearningData(ctx.data);
  const big = data.rewards.length - 1;
  const qMax = Math.max(...data.rewards);

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다 (처음 한 번은 0 이어도 보낸다)
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown.get(name) ?? 0));
    shown.set(name, value);
  };
  const phase = (name: string): Promise<void> => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let epsilon = data.epsilon;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const runs = runAll(data, epsilon);

      // 걸음 0 — 다섯 모두 출발 · Q 모두 0
      await ctx.emit({
        type: 'corridor',
        payload: {
          cells: data.rewards.length,
          start: data.start,
          terminal: [...data.terminal],
          rewards: [...data.rewards],
          roles: data.rewards.map((_, i) => (i === 0 ? 'small' : i === big ? 'big' : i === data.start ? 'start' : 'path')),
          agents: runs.length,
          episodes: data.episodes,
          qMax,
        },
        silent: true,
      });
      await ctx.emit({
        type: 'round',
        payload: {
          epsilon,
          q: runs.map(() => new Array<number>(2 * data.rewards.length).fill(0)),
          positions: runs.map(() => data.start),
        },
      });
      setMetric('episode', 0);
      setMetric('reached-big', 0);
      setMetric('prefer-big', 0);
      if (!(await rc.sleep(data.edgeMs))) return;

      // 판 1..episodes — 판 하나에 한 걸음, 다섯이 한 판씩 동시에
      const reached = runs.map(() => false);
      for (let ep = 0; ep < data.episodes; ep += 1) {
        if (ctx.cancelled) return;
        const rows = runs.map((r) => r.episodes[ep]!);
        rows.forEach((row, i) => {
          if (row.end === big) reached[i] = true;
        });
        const greedy = rows.map((row) => row.greedy);
        const reachedCount = reached.filter(Boolean).length;
        const preferCount = greedy.filter((g) => g === RIGHT).length;
        const bigNow = rows.filter((row) => row.end === big).length;
        // phase 는 걸음 이벤트 앞에 — 자취가 걸음 이벤트와 같은 걸음에 묶는다
        await phase('update');
        await ctx.emit({
          type: 'episode',
          payload: {
            episode: ep + 1,
            episodes: data.episodes,
            ends: rows.map((row) => row.end),
            q: rows.map((row) => [...row.q]),
            reached: [...reached],
            greedy,
            bigNow,
            reachedCount,
            preferCount,
          },
        });
        setMetric('episode', ep + 1);
        setMetric('reached-big', reachedCount);
        setMetric('prefer-big', preferCount);
        if (!(await rc.sleep(data.stepMs))) return;
      }

      // 끝 걸음 — 출발 칸 탐욕 읽기
      const lastQ = runs.map((r) => r.episodes[r.episodes.length - 1]!.q);
      const finalGreedy = lastQ.map((q) => greedyAction(q, data.start));
      await phase('choose');
      await ctx.emit({
        type: 'final',
        payload: {
          greedy: finalGreedy,
          preferCount: finalGreedy.filter((g) => g === RIGHT).length,
          leftCount: finalGreedy.filter((g) => g === LEFT).length,
          agents: runs.length,
          episodes: data.episodes,
        },
      });
      if (!(await rc.sleep(data.edgeMs))) return;

      // 손잡이 기다리기 — 우리 것이 아닌 입력은 흘리고, 값은 사다리 소속을 확인한다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'epsilon') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const value = (p as { value?: unknown }).value;
        if (typeof value !== 'number' || !data.epsilonLadder.includes(value)) continue;
        epsilon = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
