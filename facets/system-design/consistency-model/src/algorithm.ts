/**
 * consistency-model — 리더 없는 가십 사본이 결국 같아지는 동안, 손님의 읽기는 무엇을 받는가.
 *
 * 사본 열둘(`s1`..`s12`, 이 차례가 고리 차례)이 키 하나를 든다. 라운드 0 에 손님 `u1` 이 `s1` 에 새 값을 쓰고
 * (버전 2) 그 버전을 제 번호로 든다. 라운드 1..8 마다 ① 라운드 머리에 새 값을 가진 사본이 저마다 짝 f 곳에
 * 밀고(받는 곳이 이미 가졌으면 헛 통) ② 손님이 그 라운드의 사본에 읽기를 묻는다.
 * 읽기 규칙 0 = 아무 사본(물은 사본이 주는 대로), 1 = 번호 확인(버전이 번호에 못 미치면 돌려보내고 고리의 다음 사본으로).
 * 같아진 뒤에도 8 라운드까지 민다 — 사본은 남이 옛것인지 모른다.
 *
 * 무작위: 생성기 x ← (75·x + 74) mod 65537, 씨앗은 자료(42). 판 머리가 아니라 알고리즘 시작에서 **한 번** 뽑는다 —
 * 라운드 r · 사본 i · 칸 k 차례로 j = floor(x · (n − 1) / 65537), j ≥ i 면 j + 1 (짝 표 rounds·n·kmax 칸),
 * 이어서 라운드마다 손님이 처음 물을 사본 floor(x · n / 65537). 퍼뜨림 f 는 칸 0..f−1 만 쓴다(같은 뽑기 열).
 * 한 라운드 안의 차례: 사본 i 오름차순, 칸 k 오름차순 — 같은 라운드에 두 통이 한 옛 사본에 닿으면 **앞쪽**이 새로 주고
 * 뒤쪽은 헛 통이다(동률 규약: 목록의 앞쪽).
 *
 * 이벤트 (silent 가 아닌 것이 걸음이다)
 * - `init` (silent) — 걸음 0. 모든 사본이 옛값.
 *     { replicas: string[], key, client, writer, oldValue, oldVersion, newValue, newVersion,
 *       rounds, fanout, rule, motionMs, oldAxisMax: number (사다리 전체에서 옛 사본 수의 최댓값),
 *       wastedAxisMax: number (사다리 전체에서 헛 통 누계의 최댓값) }
 * - `write` — 걸음 1. 라운드 0 쓰기.
 *     { client, writer, value, version, oldCount }
 * - `push` — 라운드마다 퍼뜨림 걸음.
 *     { round, sends: { from, to, wasted: boolean }[], newly: string[], oldCount, convergedNow: boolean,
 *       convergedRound: number (아직이면 −1), wastedTotal }
 * - `read` — 라운드마다 손님 읽기 걸음.
 *     { round, rule, asked: string[] (물은 차례, 마지막이 준 사본), bounced: string[], served, value, stale: boolean }
 * - `phase` (silent) — { phase }
 *
 * phase 어휘 (irs.ts 와 같다): `write` · `push` · `read-old` · `bounce` · `read`.
 * 걸음의 대표 phase 는 걸음 발신 **앞에** 하나: 쓰기 `write`, 퍼뜨림 `push`, 읽기는 돌려보냈으면 `bounce`,
 * 옛값이면 `read-old`, 아니면 `read`.
 *
 * 계기 (판 머리에서 0, 차이만 보낸다)
 * - `old-copies` 지금 옛 사본 수 · `old-copy-rounds` 옛 사본×라운드 누계 · `messages` 통 누계 ·
 *   `stale-reads` 옛값 읽기 누계 · `bounces` 돌려보냄 누계
 *
 * 손잡이: `fanout` (사다리 `fanouts`) · `readRule` (사다리 `rules`). 한 판을 끝까지 재생한 뒤 입력을 기다린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ConsistencyModelData = {
  type: 'consistency-model';
  stepMs: number;
  motionMs: number;
  /** 고리 차례. 첫 사본이 쓰는 사본이다. */
  replicas: string[];
  key: string;
  client: string;
  writer: string;
  oldValue: number;
  oldVersion: number;
  newValue: number;
  newVersion: number;
  rounds: number;
  seed: number;
  kmax: number;
  fanouts: number[];
  rules: number[];
  defaultFanout: number;
  defaultRule: number;
};

function fail(what: string): never {
  throw new Error(`consistency-model: ${what}`);
}

function intField(o: Record<string, unknown>, name: string): number {
  const v = o[name];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${name} 가 정수가 아니다`);
  return v;
}

function strField(o: Record<string, unknown>, name: string): string {
  const v = o[name];
  if (typeof v !== 'string' || v.length === 0) fail(`${name} 가 문자열이 아니다`);
  return v;
}

function intList(o: Record<string, unknown>, name: string): number[] {
  const v = o[name];
  if (!Array.isArray(v) || v.length === 0) fail(`${name} 가 비었거나 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) fail(`${name}[${i}] 가 정수가 아니다`);
    return x;
  });
}

/** `ctx.data` 좁히개 — 모양이 어긋나면 던진다. */
export function readConsistencyModelData(raw: unknown): ConsistencyModelData {
  if (typeof raw !== 'object' || raw === null) fail('자료가 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'consistency-model') fail(`type 이 consistency-model 이 아니다: ${String(o.type)}`);
  const replicasRaw = o.replicas;
  if (!Array.isArray(replicasRaw) || replicasRaw.length < 2) fail('replicas 가 둘 이상의 배열이 아니다');
  const replicas = replicasRaw.map((x, i) => {
    if (typeof x !== 'string' || x.length === 0) fail(`replicas[${i}] 가 문자열이 아니다`);
    return x;
  });
  if (new Set(replicas).size !== replicas.length) fail('replicas 에 같은 이름이 있다');
  const data: ConsistencyModelData = {
    type: 'consistency-model',
    stepMs: intField(o, 'stepMs'),
    motionMs: intField(o, 'motionMs'),
    replicas,
    key: strField(o, 'key'),
    client: strField(o, 'client'),
    writer: strField(o, 'writer'),
    oldValue: intField(o, 'oldValue'),
    oldVersion: intField(o, 'oldVersion'),
    newValue: intField(o, 'newValue'),
    newVersion: intField(o, 'newVersion'),
    rounds: intField(o, 'rounds'),
    seed: intField(o, 'seed'),
    kmax: intField(o, 'kmax'),
    fanouts: intList(o, 'fanouts'),
    rules: intList(o, 'rules'),
    defaultFanout: intField(o, 'defaultFanout'),
    defaultRule: intField(o, 'defaultRule'),
  };
  if (data.writer !== replicas[0]) fail(`쓰는 사본 ${data.writer} 가 고리의 첫 사본이 아니다`);
  if (data.newVersion <= data.oldVersion) fail('새 버전이 옛 버전보다 크지 않다');
  if (data.rounds < 1) fail('rounds 가 1 보다 작다');
  if (data.kmax < 1) fail('kmax 가 1 보다 작다');
  for (const f of data.fanouts) if (f < 1 || f > data.kmax) fail(`퍼뜨림 ${f} 가 1..${data.kmax} 밖이다`);
  for (const r of data.rules) if (r !== 0 && r !== 1) fail(`읽기 규칙 ${r} 를 모른다`);
  if (!data.fanouts.includes(data.defaultFanout)) fail('defaultFanout 가 사다리에 없다');
  if (!data.rules.includes(data.defaultRule)) fail('defaultRule 이 사다리에 없다');
  return data;
}

export type GossipTable = {
  /** partners[((r − 1) · n + i) · kmax + k] = 라운드 r 사본 i 의 칸 k 짝 (0 부터). */
  partners: number[];
  /** reads[r − 1] = 라운드 r 에 손님이 처음 물을 사본. */
  reads: number[];
};

const MOD = 65537;

/** 씨앗 생성기로 짝 표와 손님 읽기를 한 번 뽑는다. */
export function drawGossipTable(seed: number, rounds: number, n: number, kmax: number): GossipTable {
  let x = seed;
  const draw = (): number => {
    x = (75 * x + 74) % MOD;
    return x;
  };
  const partners: number[] = [];
  for (let r = 1; r <= rounds; r += 1) {
    for (let i = 0; i < n; i += 1) {
      for (let k = 0; k < kmax; k += 1) {
        let j = Math.floor((draw() * (n - 1)) / MOD);
        if (j >= i) j += 1;
        partners.push(j);
      }
    }
  }
  const reads: number[] = [];
  for (let r = 1; r <= rounds; r += 1) reads.push(Math.floor((draw() * n) / MOD));
  return { partners, reads };
}

export type GossipSend = { from: number; to: number; wasted: boolean };

export type GossipRound = {
  round: number;
  sends: GossipSend[];
  newly: number[];
  oldCount: number;
  convergedNow: boolean;
  convergedRound: number;
  oldCopyRounds: number;
  messages: number;
  wasted: number;
  asked: number[];
  bounced: number[];
  served: number;
  stale: boolean;
  staleReads: number;
  bounces: number;
};

export type GossipRun = {
  /** 쓰기 걸음 뒤의 옛 사본 수. */
  oldAfterWrite: number;
  rounds: GossipRound[];
  /** IR `result` 와 같은 차례: 같아진 라운드(−1) · 옛 사본×라운드 · 통 · 헛 통 · 옛값 읽기 · 돌려보냄. */
  result: [number, number, number, number, number, number];
};

/** 한 판을 셈한다. 모르는 퍼뜨림 · 규칙, 한 바퀴 안에 끝나지 않는 읽기는 던진다. */
export function runGossip(
  n: number,
  fanout: number,
  rounds: number,
  rule: number,
  kmax: number,
  table: GossipTable,
): GossipRun {
  if (!Number.isInteger(fanout) || fanout < 1 || fanout > kmax) fail(`퍼뜨림 ${fanout} 가 1..${kmax} 밖이다`);
  if (rule !== 0 && rule !== 1) fail(`읽기 규칙 ${rule} 를 모른다`);
  if (table.partners.length !== rounds * n * kmax) fail('짝 표 길이가 rounds·n·kmax 가 아니다');
  if (table.reads.length !== rounds) fail('손님 읽기 수가 rounds 가 아니다');
  const gotAt: number[] = new Array<number>(n).fill(-1);
  gotAt[0] = 0;
  let converged = -1;
  let area = 0;
  let messages = 0;
  let wasted = 0;
  let staleReads = 0;
  let bounces = 0;
  const out: GossipRound[] = [];
  for (let r = 1; r <= rounds; r += 1) {
    const sends: GossipSend[] = [];
    const newly: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const got = gotAt[i];
      if (got === undefined) fail(`사본 ${i} 가 없다`);
      if (got === -1 || got >= r) continue; // 라운드 머리에 새 값을 가진 사본만 민다
      for (let k = 0; k < fanout; k += 1) {
        const j = table.partners[((r - 1) * n + i) * kmax + k];
        if (j === undefined || j < 0 || j >= n || j === i) fail(`짝 표 칸 (${r}, ${i}, ${k}) 가 어긋났다`);
        messages += 1;
        if (gotAt[j] === -1) {
          gotAt[j] = r;
          newly.push(j);
          sends.push({ from: i, to: j, wasted: false });
        } else {
          wasted += 1;
          sends.push({ from: i, to: j, wasted: true });
        }
      }
    }
    const oldCount = gotAt.filter((g) => g === -1).length;
    area += oldCount;
    const convergedNow = oldCount === 0 && converged === -1;
    if (convergedNow) converged = r;

    const first = table.reads[r - 1];
    if (first === undefined || first < 0 || first >= n) fail(`라운드 ${r} 의 손님 읽기가 어긋났다`);
    const asked: number[] = [first];
    const bounced: number[] = [];
    let q = first;
    let stale = false;
    if (rule === 0) {
      if (gotAt[q] === -1) {
        stale = true;
        staleReads += 1;
      }
    } else {
      while (gotAt[q] === -1) {
        bounced.push(q);
        bounces += 1;
        if (bounced.length >= n) fail(`라운드 ${r} 읽기가 고리를 한 바퀴 돌아도 끝나지 않는다`);
        q = (q + 1) % n;
        asked.push(q);
      }
    }
    out.push({
      round: r,
      sends,
      newly,
      oldCount,
      convergedNow,
      convergedRound: converged,
      oldCopyRounds: area,
      messages,
      wasted,
      asked,
      bounced,
      served: q,
      stale,
      staleReads,
      bounces,
    });
  }
  return {
    oldAfterWrite: n - 1,
    rounds: out,
    result: [converged, area, messages, wasted, staleReads, bounces],
  };
}

type MetricName = 'old-copies' | 'old-copy-rounds' | 'messages' | 'stale-reads' | 'bounces';

export async function consistencyModelAlgorithm(base: FacetContext<ConsistencyModelData>): Promise<void> {
  const ctx = base as ReactiveContext<ConsistencyModelData>;
  const data = readConsistencyModelData(ctx.data);
  const n = data.replicas.length;
  const table = drawGossipTable(data.seed, data.rounds, n, data.kmax);
  const name = (i: number): string => {
    const id = data.replicas[i];
    if (id === undefined) fail(`사본 ${i} 가 없다`);
    return id;
  };

  // 축 범위 — 사다리 전체에서 셈해 init 으로 싣는다.
  let oldAxisMax = 0;
  let wastedAxisMax = 0;
  for (const f of data.fanouts) {
    for (const rule of data.rules) {
      const run = runGossip(n, f, data.rounds, rule, data.kmax, table);
      oldAxisMax = Math.max(oldAxisMax, run.oldAfterWrite);
      wastedAxisMax = Math.max(wastedAxisMax, run.result[3]);
    }
  }

  const shown: Record<MetricName, number> = {
    'old-copies': 0,
    'old-copy-rounds': 0,
    messages: 0,
    'stale-reads': 0,
    bounces: 0,
  };
  const setMetric = (metric: MetricName, value: number): void => {
    ctx.metric(metric, value - shown[metric]);
    shown[metric] = value;
  };
  const phase = (p: string) => ctx.emit({ type: 'phase', payload: { phase: p }, silent: true });
  const pause = () => ctx.sleep(data.stepMs + data.motionMs);

  let fanout = data.defaultFanout;
  let rule = data.defaultRule;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = runGossip(n, fanout, data.rounds, rule, data.kmax, table);

      // 판 머리 — 계기를 0 으로 (첫 판에도 차이 0 을 보낸다)
      setMetric('old-copies', 0);
      setMetric('old-copy-rounds', 0);
      setMetric('messages', 0);
      setMetric('stale-reads', 0);
      setMetric('bounces', 0);

      await ctx.emit({
        type: 'init',
        payload: {
          replicas: [...data.replicas],
          key: data.key,
          client: data.client,
          writer: data.writer,
          oldValue: data.oldValue,
          oldVersion: data.oldVersion,
          newValue: data.newValue,
          newVersion: data.newVersion,
          rounds: data.rounds,
          fanout,
          rule,
          motionMs: data.motionMs,
          oldAxisMax,
          wastedAxisMax,
        },
        silent: true,
      });

      await phase('write');
      await ctx.emit({
        type: 'write',
        payload: {
          client: data.client,
          writer: data.writer,
          value: data.newValue,
          version: data.newVersion,
          oldCount: run.oldAfterWrite,
        },
      });
      setMetric('old-copies', run.oldAfterWrite);
      if (!(await pause())) return;

      for (const rec of run.rounds) {
        if (ctx.cancelled) return;

        await phase('push');
        await ctx.emit({
          type: 'push',
          payload: {
            round: rec.round,
            sends: rec.sends.map((s) => ({ from: name(s.from), to: name(s.to), wasted: s.wasted })),
            newly: rec.newly.map(name),
            oldCount: rec.oldCount,
            convergedNow: rec.convergedNow,
            convergedRound: rec.convergedRound,
            wastedTotal: rec.wasted,
          },
        });
        setMetric('old-copies', rec.oldCount);
        setMetric('old-copy-rounds', rec.oldCopyRounds);
        setMetric('messages', rec.messages);
        if (!(await pause())) return;

        if (rec.bounced.length > 0) await phase('bounce');
        else if (rec.stale) await phase('read-old');
        else await phase('read');
        await ctx.emit({
          type: 'read',
          payload: {
            round: rec.round,
            rule,
            asked: rec.asked.map(name),
            bounced: rec.bounced.map(name),
            served: name(rec.served),
            value: rec.stale ? data.oldValue : data.newValue,
            stale: rec.stale,
          },
        });
        setMetric('stale-reads', rec.staleReads);
        setMetric('bounces', rec.bounces);
        if (!(await pause())) return;
      }

      // 손잡이를 기다린다 — 우리 것이 아닌 입력 · 사다리 밖 값은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'fanout' && input.type !== 'readRule') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        if (input.type === 'fanout') {
          if (!data.fanouts.includes(value)) continue;
          fanout = value;
        } else {
          if (!data.rules.includes(value)) continue;
          rule = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
