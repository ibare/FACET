/**
 * 복제와 CAP — 리더가 쓰기에 OK 를 주기 전에 팔로워 k 를 기다린다.
 *
 * 모형 (사양의 규약 줄 그대로):
 *   - 리더는 쓰기를 받으면 **먼저 닿는 팔로워 수를 센다.** k 보다 적으면 곧바로 거절한다 — 제 로그에도 적지 않는다.
 *     아니면 적고 닿는 팔로워 모두에게 보낸다.
 *   - OK = k 가 0 이면 0 ms, 아니면 닿는 팔로워 가운데 k 번째로 빠른 지연 시각. 한 노드가 적은 시각 = 그 노드의 지연.
 *     k 번째 = 닿는 팔로워 가운데 자기보다 빠른 닿는 팔로워가 정확히 k−1 인 것 (지연은 서로 다르다 — 동률 없음. 검사로 던진다)
 *   - 읽기 — 답 직후(답 시각)와 늦은 읽기 시각에 팔로워마다 한 번씩. 한 노드는 그 시각에 가진 값을 준다.
 *     같은 시각이면 적기가 읽기보다 먼저 (지연 ≤ t 면 새 값).
 *   - 옛 값 = 손님이 OK 를 받은 값보다 앞의 값을 주는 읽기. 거절이면 확정된 값이 처음 값 그대로라 옛 값 0.
 *   - copies-at-answer = 답 시각에 새 값을 가진 노드 수 (리더 포함). 거절이면 0.
 *   - 같은 ms 의 차례: 도착(적기) → OK → 읽기.
 *   - 리더-팔로워 복제다 — 갈라진 뒤 끊긴 쪽이 새 리더를 뽑지 않는다. 갈라짐은 처음부터 끝까지 붙지 않는다.
 *
 * 셈은 IR(`irs.ts`) 의 answerAt · freshAt · staleAt 과 같은 규칙이다 — 아래 `answerAt` · `freshAt` · `staleAt` 가 그 거울.
 *
 * 걸음 (걸음 0 을 넣어 센다): 처음 · 0 ms 쓰기 도착 · [거절] 또는 [답 시각까지의 도착들 · OK] · 답 직후 읽기 ·
 *   답 뒤의 도착들 · 늦은 읽기. 갈라짐 없음 9 · 있음 k 0·1 은 6 · k 2·3·4 는 5.
 *
 * 이벤트 (전부 silent 아님, phase 만 silent):
 *   - `round-start`  { k: number, partition: number, reach: number[] (팔로워마다 1/0), cut: string[] (끊긴 팔로워 이름) }
 *   - `write-arrive` { ms: number, reachable: number, k: number, holders: boolean[] (0 ms 에 새 값을 가진 노드 — 받아들이면 리더),
 *                      blocked: number[] (받아들인 판에서 복제가 끊긴 이음에 막히는 팔로워 색인. 거절이면 빈 배열) }
 *   - `refuse`       { ms: number, reachable: number, k: number }
 *   - `follower-write` { ms: number, follower: number (팔로워 색인 0..), holders: boolean[] (노드마다 새 값을 가졌는가, 리더가 0), copies: number }
 *   - `ok`           { ms: number, holders: boolean[], copies: number }
 *   - `read`         { ms: number, which: 'answer' | 'late', values: number[] (팔로워마다 준 값), stale: boolean[], staleCount: number }
 *   - `phase`        { phase: string } — silent
 *
 * phase 어휘 (irs.ts 와 같다): count-reachable · refuse · ok-now · pick-kth · count-fresh · count-stale
 *
 * 계기 (C5): answer-ms (답 걸음) · copies-at-answer (답 걸음) · stale-at-answer (답 직후 읽기 걸음) ·
 *   stale-later (늦은 읽기 걸음) · refused (거절 걸음에 1). 판을 새로 시작할 때 0 으로 되돌린다 — 지금 값을 들고 차이만 보낸다.
 *
 * 손잡이: `waitFor` (k, kLadder) · `partition` (0 없음 · 1 있음, partitionLadder).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReplicationData = {
  type: 'replication';
  stepMs: number;
  /** 변수 이름 (자료) */
  key: string;
  /** 노드 이름 — 첫 것이 리더, 나머지가 팔로워 (자료) */
  nodes: string[];
  /** 팔로워마다 지연 (ms) — 리더가 적은 때부터 그 팔로워가 적고 응답이 리더에 닿기까지 */
  delays: number[];
  oldValue: number;
  newValue: number;
  /** 늦은 읽기 시각 (ms) */
  lateReadMs: number;
  /** 갈라짐 사다리 값마다 팔로워별 닿음 (1/0) */
  reachByPartition: number[][];
  kLadder: number[];
  partitionLadder: number[];
  waitFor: number;
  partition: number;
};

/** IR answerAt 의 거울 — 닿는 수 < k 면 -1, k == 0 이면 0, 아니면 k 번째로 빠른 닿는 팔로워의 지연. */
export function answerAt(delays: readonly number[], reach: readonly number[], n: number, k: number): number {
  let reachable = 0;
  for (let i = 0; i < n; i += 1) if (reach[i] === 1) reachable += 1;
  if (reachable < k) return -1;
  if (k === 0) return 0;
  for (let i = 0; i < n; i += 1) {
    if (reach[i] !== 1) continue;
    let faster = 0;
    for (let j = 0; j < n; j += 1) {
      if (reach[j] === 1 && (delays[j] as number) < (delays[i] as number)) faster += 1;
    }
    if (faster === k - 1) return delays[i] as number;
  }
  return -1;
}

/** IR freshAt 의 거울 — 시각 t 에 새 값을 가진 팔로워 수 (닿고 지연 ≤ t). */
export function freshAt(delays: readonly number[], reach: readonly number[], n: number, t: number): number {
  let fresh = 0;
  for (let i = 0; i < n; i += 1) if (reach[i] === 1 && (delays[i] as number) <= t) fresh += 1;
  return fresh;
}

/** IR staleAt 의 거울 — accepted 가 0 이면 0, 아니면 n − freshAt. */
export function staleAt(delays: readonly number[], reach: readonly number[], n: number, t: number, accepted: number): number {
  if (accepted === 0) return 0;
  return n - freshAt(delays, reach, n, t);
}

/** 판 하나의 셈 — 화면과 검사가 함께 쓴다. */
export type ReplicationRound = {
  k: number;
  partition: number;
  reach: number[];
  reachable: number;
  accepted: boolean;
  /** 답 시각 (거절이면 0) */
  answerMs: number;
  copies: number;
  staleAtAnswer: number;
  staleLater: number;
  refused: number;
  /** 걸음 수 (걸음 0 포함) */
  steps: number;
};

function validate(d: ReplicationData): void {
  if (d.nodes.length !== d.delays.length + 1) throw new Error('노드 수가 팔로워 지연 수 + 1 이 아니다');
  for (const r of d.reachByPartition) {
    if (r.length !== d.delays.length) throw new Error('닿음 배열의 길이가 팔로워 수와 다르다');
    for (const v of r) if (v !== 0 && v !== 1) throw new Error(`닿음은 0 또는 1 이다: ${v}`);
  }
  if (d.reachByPartition.length !== d.partitionLadder.length) throw new Error('갈라짐 사다리와 닿음 표의 길이가 다르다');
  const seen = new Set<number>();
  for (const x of d.delays) {
    if (!Number.isInteger(x) || x <= 0) throw new Error(`지연은 양의 정수 ms 다: ${x}`);
    if (seen.has(x)) throw new Error(`지연이 겹친다 (${x}) — k 번째가 하나로 정해지지 않는다`);
    seen.add(x);
  }
  if (!d.kLadder.includes(d.waitFor)) throw new Error(`기본 k ${d.waitFor} 가 사다리에 없다`);
  if (!d.partitionLadder.includes(d.partition)) throw new Error(`기본 갈라짐 ${d.partition} 이 사다리에 없다`);
}

function reachOf(d: ReplicationData, partition: number): number[] {
  const idx = d.partitionLadder.indexOf(partition);
  const reach = d.reachByPartition[idx];
  if (idx < 0 || !reach) throw new Error(`갈라짐 값 ${partition} 이 사다리에 없다`);
  return reach;
}

/** 판 하나를 셈만 한다 (발신 없이). */
export function computeReplication(d: ReplicationData, k: number, partition: number): ReplicationRound {
  validate(d);
  const reach = reachOf(d, partition);
  const n = d.delays.length;
  let reachable = 0;
  for (const r of reach) reachable += r;
  const ans = answerAt(d.delays, reach, n, k);
  if (ans < 0 && reachable >= k) throw new Error(`닿는 수 ${reachable} ≥ k ${k} 인데 답이 없다`);
  const accepted = ans >= 0;
  const answerMs = accepted ? ans : 0;
  const acc = accepted ? 1 : 0;
  const freshAtAnswer = accepted ? freshAt(d.delays, reach, n, answerMs) : 0;
  let steps = 2; // 처음 · 쓰기 도착
  if (accepted) {
    steps += reachable + 1; // 도착들(닿는 팔로워 모두) · OK
  } else {
    steps += 1; // 거절
  }
  steps += 2; // 읽기 둘
  return {
    k,
    partition,
    reach: [...reach],
    reachable,
    accepted,
    answerMs,
    copies: accepted ? 1 + freshAtAnswer : 0,
    staleAtAnswer: staleAt(d.delays, reach, n, answerMs, acc),
    staleLater: staleAt(d.delays, reach, n, d.lateReadMs, acc),
    refused: accepted ? 0 : 1,
    steps,
  };
}

type MetricName = 'answer-ms' | 'copies-at-answer' | 'stale-at-answer' | 'stale-later' | 'refused';

export async function replicationAlgorithm(base: FacetContext<ReplicationData>): Promise<void> {
  const ctx = base as ReactiveContext<ReplicationData>;
  const d = ctx.data;
  validate(d);
  const n = d.delays.length;
  const followers = d.nodes.slice(1);

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<MetricName, number>();
  const setMetric = (name: MetricName, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined || prev !== value) ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(d.stepMs);

  /** 시각 t 에 노드마다 새 값을 가졌는가 (리더가 0). */
  const holdersAt = (reach: readonly number[], accepted: boolean, t: number): boolean[] => {
    const out = [accepted];
    for (let i = 0; i < n; i += 1) out.push(accepted && reach[i] === 1 && (d.delays[i] as number) <= t);
    return out;
  };
  const countOf = (xs: readonly boolean[]): number => xs.filter(Boolean).length;

  const readAt = async (reach: readonly number[], accepted: boolean, t: number, which: 'answer' | 'late'): Promise<number> => {
    const holders = holdersAt(reach, accepted, t).slice(1);
    const values = holders.map((h) => (h ? d.newValue : d.oldValue));
    // 옛 값 = OK 를 받은 새 값보다 앞의 값. 거절이면 확정된 값이 처음 값이라 옛 값이 없다.
    const stale = values.map((v) => accepted && v !== d.newValue);
    const staleCount = countOf(stale);
    const viaIr = staleAt(d.delays, reach, n, t, accepted ? 1 : 0);
    if (staleCount !== viaIr) throw new Error(`옛 값 읽기 수가 갈린다: ${staleCount} ≠ ${viaIr}`);
    await ctx.emit({ type: 'read', payload: { ms: t, which, values, stale, staleCount } });
    return staleCount;
  };

  /** 판 하나. 취소되면 false. */
  const playRound = async (k: number, partition: number): Promise<boolean> => {
    const r = computeReplication(d, k, partition);
    const reach = r.reach;
    const cut = followers.filter((_, i) => reach[i] !== 1);

    // 걸음 0 — 처음. 계기를 0 으로 되돌린다.
    setMetric('answer-ms', 0);
    setMetric('copies-at-answer', 0);
    setMetric('stale-at-answer', 0);
    setMetric('stale-later', 0);
    setMetric('refused', 0);
    await ctx.emit({ type: 'round-start', payload: { k, partition, reach: [...reach], cut } });
    if (!(await pause())) return false;

    // 걸음 1 — 0 ms 쓰기가 리더에 닿고, 리더가 닿는 팔로워를 센다.
    await phase('count-reachable');
    const blocked = r.accepted ? reach.flatMap((v, i) => (v === 1 ? [] : [i])) : [];
    const holders0 = holdersAt(reach, r.accepted, 0);
    await ctx.emit({ type: 'write-arrive', payload: { ms: 0, reachable: r.reachable, k, holders: holders0, blocked } });
    if (!(await pause())) return false;

    if (!r.accepted) {
      await phase('refuse');
      setMetric('answer-ms', 0);
      setMetric('copies-at-answer', 0);
      setMetric('refused', 1);
      await ctx.emit({ type: 'refuse', payload: { ms: 0, reachable: r.reachable, k } });
      if (!(await pause())) return false;
    }

    // 닿는 팔로워의 도착 차례 (지연 오름차순)
    const order = reach
      .map((v, i) => ({ v, i, ms: d.delays[i] as number }))
      .filter((x) => x.v === 1)
      .sort((a, b) => a.ms - b.ms);

    const arrive = async (i: number, ms: number): Promise<boolean> => {
      await phase('count-fresh');
      const holders = holdersAt(reach, true, ms);
      const copies = countOf(holders);
      if (copies !== 1 + freshAt(d.delays, reach, n, ms)) throw new Error('사본 수가 freshAt 과 갈린다');
      await ctx.emit({ type: 'follower-write', payload: { ms, follower: i, holders, copies } });
      return pause();
    };

    if (r.accepted) {
      // 답 시각까지의 도착들 (같은 ms 면 적기가 OK 보다 먼저)
      for (const a of order) {
        if (ctx.cancelled) return false;
        if (a.ms > r.answerMs) break;
        if (!(await arrive(a.i, a.ms))) return false;
      }
      await phase(k === 0 ? 'ok-now' : 'pick-kth');
      const holders = holdersAt(reach, true, r.answerMs);
      if (countOf(holders) !== r.copies) throw new Error('OK 때 사본 수가 셈과 갈린다');
      setMetric('answer-ms', r.answerMs);
      setMetric('copies-at-answer', r.copies);
      await ctx.emit({ type: 'ok', payload: { ms: r.answerMs, holders, copies: r.copies } });
      if (!(await pause())) return false;
    }

    // 답 직후 읽기
    await phase('count-stale');
    const s1 = await readAt(reach, r.accepted, r.answerMs, 'answer');
    if (s1 !== r.staleAtAnswer) throw new Error('답 직후 옛 값 수가 셈과 갈린다');
    setMetric('stale-at-answer', s1);
    if (!(await pause())) return false;

    // 답 뒤의 도착들
    if (r.accepted) {
      for (const a of order) {
        if (ctx.cancelled) return false;
        if (a.ms <= r.answerMs) continue;
        if (!(await arrive(a.i, a.ms))) return false;
      }
    }

    // 늦은 읽기 — 마지막 걸음. 걸음 경계는 이어지는 입력 대기다.
    await phase('count-stale');
    const s2 = await readAt(reach, r.accepted, d.lateReadMs, 'late');
    if (s2 !== r.staleLater) throw new Error('늦은 읽기 옛 값 수가 셈과 갈린다');
    setMetric('stale-later', s2);
    return !ctx.cancelled;
  };

  let k = d.waitFor;
  let partition = d.partition;
  try {
    while (!ctx.cancelled) {
      if (ctx.cancelled) return;
      if (!(await playRound(k, partition))) return;
      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'waitFor' && input.type !== 'partition') continue;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null && 'value' in p ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') throw new Error(`손잡이 ${input.type} 의 값이 수가 아니다`);
        if (input.type === 'waitFor') {
          if (!d.kLadder.includes(value)) throw new Error(`k ${value} 가 사다리에 없다`);
          k = value;
        } else {
          if (!d.partitionLadder.includes(value)) throw new Error(`갈라짐 ${value} 이 사다리에 없다`);
          partition = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
