/**
 * round-robin-lb — 로드 밸런싱. 한 요청 흐름 위에서 고르는 법을 갈아 끼우면 치우침과 붙듦이 맞바뀐다.
 *
 * 흐름: 틱 0..requests−1 에 요청 하나씩. 요청 i 마다 생성기 x 를 둘 뽑는다 — 먼저 사용자
 * `floor(x·keys/65537)`, 다음 걸림 `baseHold − s + floor(x·(2s+1)/65537)`. 생성기는
 * x ← (75·x + 74) mod 65537, 씨앗 `seed`. 손잡이 값이 달라도 x 열은 같다.
 *
 * 한 틱 안의 차례: 끝남(끝나는 틱 ≤ 지금인 연결은 빠짐) → 빠짐(틱 dropTick 이면 dropServer 를
 * 산 목록에서 뺀다 — 따로 한 걸음) → 도착 → 고르기. 빠진 서버의 열린 연결은 제 걸림대로 끝난다(드레인).
 *
 * 고르는 법 (policy):
 *   0 차례       원래 목록 색인을 가리키는 표 하나(처음 0). 가리킨 서버가 빠졌으면 다음 색인으로 건너뛴 뒤 고르고 한 칸 돈다
 *   1 최소 연결  지금 열린 연결 수가 가장 적은 산 서버. **동률은 목록 앞쪽**
 *   2 나머지 해시 산 서버를 원래 차례로 다시 번호 매겨 `산 목록[(h32 mod 12) mod 산 수]` — 12 는 4 와 3 을 모두 나누는 수라
 *                 h mod 4 · h mod 3 을 함께 낸다
 *   3 링 해시    링 자리 `floor(h32 × 100 / 2^32)`, 키 자리 이상에서 가장 작은 자리의 산 서버, 없으면 가장 작은 자리의 산 서버.
 *                 가상 노드 없음
 * h32 = fmix32(FNV-1a 32) — UTF-8 바이트 위에서.
 *
 * 이벤트 (payload 스키마):
 *   init (silent)        { policy, spread, servers: string[], keys: string[], serverRing: number[], keyRing: number[],
 *                          requests, dropTick, openAxis, imbalanceAxis }
 *                        openAxis · imbalanceAxis 는 **손잡이 사다리 전체**에서 가장 큰 열린 수 · 치우침 합 — 손잡이를 돌려도 축이 그대로다
 *   phase (silent)       { phase }
 *   drop-server          { tick, server, alive: number[], open: number[] }   open = 끝남을 치른 뒤의 서버별 열린 수
 *   route                { index, tick, key, hold, pick, from, moved: boolean, gap, imbalanceSum, peak, movedSum,
 *                          open: number[], alive: number[], lastOf: number[] }
 *                        from = 그 사용자의 앞 요청이 간 서버(없으면 −1), open = 이 요청이 든 뒤의 열린 수,
 *                        lastOf = 사용자마다 마지막으로 간 서버(없으면 −1)
 *
 * phase 어휘 (irs.ts 와 같은 집합): pick-turn · pick-idlest · pick-mod · pick-ring · drop-server.
 *   요청 걸음은 그 방식의 pick phase, 빠짐 걸음은 drop-server — 각 걸음 발신 **앞에** 보낸다.
 *
 * 계기: imbalance (치우침 합 — 틱마다 요청이 든 뒤 산 서버의 열린 수 최대 − 최소의 합) ·
 *       peak-open (산 서버 하나의 열린 수 최대) · moved (그 사용자의 앞 요청과 다른 서버로 간 요청 수, 첫 요청은 세지 않는다).
 *       걸음마다 지금 값을 들고 차이만 보낸다. 판 머리에서 0 으로 되돌린다.
 *
 * 손잡이: policy (0..3) · spread (0 · 1 · 3 · 5). 한 판을 끝까지 재생 → 입력 대기 → 받은 값으로 다시 재생.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RoundRobinLbData = {
  type: 'round-robin-lb';
  stepMs: number;
  servers: string[];
  keys: string[];
  requests: number;
  baseHold: number;
  dropServer: string;
  dropTick: number;
  seed: number;
  policies: number[];
  spreads: number[];
  defaultPolicy: number;
  defaultSpread: number;
};

export const LCG_M = 65537;

/** 이 완제품의 phase 어휘 — irs.ts 와 같은 집합이다 (test 가 잠근다). */
export const PHASES = ['pick-turn', 'pick-idlest', 'pick-mod', 'pick-ring', 'drop-server'] as const;

const MOTION_MS = 300;

function intArray(raw: unknown, name: string): number[] {
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'number' || !Number.isInteger(v))) {
    throw new Error(`round-robin-lb: ${name} 는 정수 배열이어야 한다`);
  }
  return raw as number[];
}

function strArray(raw: unknown, name: string): string[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.some((v) => typeof v !== 'string')) {
    throw new Error(`round-robin-lb: ${name} 는 비지 않은 문자열 배열이어야 한다`);
  }
  return raw as string[];
}

function int(raw: unknown, name: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw)) {
    throw new Error(`round-robin-lb: ${name} 는 정수여야 한다`);
  }
  return raw;
}

/** ctx.data · 무대 initialData 의 좁히개 — 모양이 어긋나면 던진다. */
export function readRoundRobinLbData(raw: unknown): RoundRobinLbData {
  if (typeof raw !== 'object' || raw === null) throw new Error('round-robin-lb: 데이터가 없다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'round-robin-lb') throw new Error(`round-robin-lb: type 이 다르다 (${String(o.type)})`);
  const servers = strArray(o.servers, 'servers');
  const keys = strArray(o.keys, 'keys');
  const dropServer = o.dropServer;
  if (typeof dropServer !== 'string' || !servers.includes(dropServer)) {
    throw new Error(`round-robin-lb: dropServer 가 서버 목록에 없다 (${String(dropServer)})`);
  }
  if (servers.length < 2) throw new Error('round-robin-lb: 서버가 둘 이상이어야 빠짐 뒤에도 고를 수 있다');
  const data: RoundRobinLbData = {
    type: 'round-robin-lb',
    stepMs: int(o.stepMs, 'stepMs'),
    servers,
    keys,
    requests: int(o.requests, 'requests'),
    baseHold: int(o.baseHold, 'baseHold'),
    dropServer,
    dropTick: int(o.dropTick, 'dropTick'),
    seed: int(o.seed, 'seed'),
    policies: intArray(o.policies, 'policies'),
    spreads: intArray(o.spreads, 'spreads'),
    defaultPolicy: int(o.defaultPolicy, 'defaultPolicy'),
    defaultSpread: int(o.defaultSpread, 'defaultSpread'),
  };
  if (!data.policies.includes(data.defaultPolicy)) throw new Error('round-robin-lb: defaultPolicy 가 사다리에 없다');
  if (!data.spreads.includes(data.defaultSpread)) throw new Error('round-robin-lb: defaultSpread 가 사다리에 없다');
  for (const s of data.spreads) {
    if (s < 0 || s >= data.baseHold) throw new Error(`round-robin-lb: 들쭉날쭉 ${s} 는 0 이상 baseHold 미만이어야 한다`);
  }
  for (const p of data.policies) {
    if (p < 0 || p > 3) throw new Error(`round-robin-lb: 모르는 고르는 법 ${p}`);
  }
  return data;
}

// ---------------------------------------------------------------- 해시 (조각 규약 그대로)

const UTF8 = new TextEncoder();

export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (const b of UTF8.encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function fmix32(input: number): number {
  let h = input >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function h32(s: string): number {
  return fmix32(fnv1a32(s));
}

/** 링 자리 0..99 — `h % 100` 이 아니라 `floor(h × 100 / 2^32)`. */
export function ringPos(s: string): number {
  return Math.floor((h32(s) * 100) / 4294967296);
}

// ---------------------------------------------------------------- 뽑기

/** 요청마다 x 둘 — 사용자 색인과 걸림. 손잡이 값이 달라도 x 열은 같다. */
export function drawRequests(data: RoundRobinLbData, spread: number): { user: number[]; hold: number[] } {
  let x = data.seed;
  const next = (): number => {
    x = (75 * x + 74) % LCG_M;
    return x;
  };
  const user: number[] = [];
  const hold: number[] = [];
  for (let i = 0; i < data.requests; i++) {
    user.push(Math.floor((next() * data.keys.length) / LCG_M));
    hold.push(data.baseHold - spread + Math.floor((next() * (2 * spread + 1)) / LCG_M));
  }
  return { user, hold };
}

// ---------------------------------------------------------------- 한 판의 셈

export type DropStep = { kind: 'drop'; tick: number; server: number; alive: number[]; open: number[] };
export type RouteStep = {
  kind: 'route';
  index: number;
  tick: number;
  key: number;
  hold: number;
  pick: number;
  from: number;
  moved: boolean;
  /** 최소 연결에서 가장 적은 열린 수를 나눠 가진 산 서버가 둘 이상이었는가 (보고용) */
  tie: boolean;
  gap: number;
  imbalanceSum: number;
  peak: number;
  movedSum: number;
  open: number[];
  alive: number[];
  lastOf: number[];
};
export type LbStep = DropStep | RouteStep;

export type RoundResult = {
  steps: LbStep[];
  imbalance: number;
  peak: number;
  moved: number;
  chosen: number[];
  gapAt: number[];
};

export type Hashes = { serverRing: number[]; keyRing: number[]; keyHash12: number[] };

export function hashesOf(data: RoundRobinLbData): Hashes {
  return {
    serverRing: data.servers.map(ringPos),
    keyRing: data.keys.map(ringPos),
    keyHash12: data.keys.map((k) => h32(k) % 12),
  };
}

export function simulateRound(data: RoundRobinLbData, policy: number, spread: number): RoundResult {
  if (!data.policies.includes(policy)) throw new Error(`round-robin-lb: 모르는 고르는 법 ${policy}`);
  if (!data.spreads.includes(spread)) throw new Error(`round-robin-lb: 사다리에 없는 들쭉날쭉 ${spread}`);
  const { user, hold } = drawRequests(data, spread);
  const { serverRing, keyRing, keyHash12 } = hashesOf(data);
  const nS = data.servers.length;
  const dropIndex = data.servers.indexOf(data.dropServer);
  const alive = data.servers.map(() => 1);
  const endAt: number[] = [];
  const chosen: number[] = [];
  const gapAt: number[] = [];
  const lastOf = data.keys.map(() => -1);
  const steps: LbStep[] = [];
  let turn = 0;
  let imbalance = 0;
  let peak = 0;
  let moved = 0;

  const openAt = (tick: number): number[] => {
    const open = data.servers.map(() => 0);
    for (let j = 0; j < tick; j++) {
      if (endAt[j] > tick) open[chosen[j]] += 1;
    }
    return open;
  };

  for (let tick = 0; tick < data.requests; tick++) {
    if (tick === data.dropTick) {
      alive[dropIndex] = 0;
      steps.push({ kind: 'drop', tick, server: dropIndex, alive: [...alive], open: openAt(tick) });
    }
    const open = openAt(tick);
    const key = user[tick];
    let pick = -1;
    let tie = false;
    if (policy === 0) {
      let guard = 0;
      while (alive[turn] === 0) {
        turn = (turn + 1) % nS;
        guard += 1;
        if (guard > nS) throw new Error('round-robin-lb: 산 서버가 없다');
      }
      pick = turn;
      turn = (turn + 1) % nS;
    } else if (policy === 1) {
      for (let s = 0; s < nS; s++) {
        if (alive[s] !== 1) continue; // 빠진 서버는 고를 수 없다 — 셈을 건너뛰는 것이 아니라 규약이다
        if (pick === -1 || open[s] < open[pick]) pick = s;
      }
      if (pick !== -1) tie = alive.filter((a, s) => a === 1 && open[s] === open[pick]).length > 1;
    } else if (policy === 2) {
      const live = alive.reduce((a, b) => a + b, 0);
      let r = keyHash12[key] % live;
      for (let s = 0; s < nS; s++) {
        if (alive[s] !== 1) continue;
        if (pick === -1) {
          if (r === 0) pick = s;
          r -= 1;
        }
      }
    } else if (policy === 3) {
      for (let s = 0; s < nS; s++) {
        if (alive[s] === 1 && serverRing[s] >= keyRing[key] && (pick === -1 || serverRing[s] < serverRing[pick])) pick = s;
      }
      if (pick === -1) {
        for (let s = 0; s < nS; s++) {
          if (alive[s] === 1 && (pick === -1 || serverRing[s] < serverRing[pick])) pick = s;
        }
      }
    } else {
      throw new Error(`round-robin-lb: 모르는 고르는 법 ${policy}`);
    }
    if (pick === -1) throw new Error('round-robin-lb: 고를 산 서버가 없다');
    const from = lastOf[key];
    const isMoved = from !== -1 && from !== pick;
    if (isMoved) moved += 1;
    lastOf[key] = pick;
    chosen.push(pick);
    endAt.push(tick + hold[tick]);
    open[pick] += 1;
    let hi = -1;
    let lo = -1;
    for (let s = 0; s < nS; s++) {
      if (alive[s] !== 1) continue;
      if (hi === -1 || open[s] > hi) hi = open[s];
      if (lo === -1 || open[s] < lo) lo = open[s];
    }
    const gap = hi - lo;
    gapAt.push(gap);
    imbalance += gap;
    peak = Math.max(peak, hi);
    steps.push({
      kind: 'route',
      index: tick,
      tick,
      key,
      hold: hold[tick],
      pick,
      from,
      moved: isMoved,
      tie,
      gap,
      imbalanceSum: imbalance,
      peak,
      movedSum: moved,
      open: [...open],
      alive: [...alive],
      lastOf: [...lastOf],
    });
  }
  return { steps, imbalance, peak, moved, chosen, gapAt };
}

/** 축 범위 — 사다리 전체에서 가장 큰 열린 수 · 치우침 합. */
export function axesOf(data: RoundRobinLbData): { openAxis: number; imbalanceAxis: number } {
  let openAxis = 0;
  let imbalanceAxis = 0;
  for (const p of data.policies) {
    for (const s of data.spreads) {
      const r = simulateRound(data, p, s);
      openAxis = Math.max(openAxis, r.peak);
      imbalanceAxis = Math.max(imbalanceAxis, r.imbalance);
    }
  }
  return { openAxis, imbalanceAxis };
}

// ---------------------------------------------------------------- 재생

export async function roundRobinLbAlgorithm(base: FacetContext<RoundRobinLbData>): Promise<void> {
  const ctx = base as ReactiveContext<RoundRobinLbData>;
  const data = readRoundRobinLbData(ctx.data);
  const { serverRing, keyRing } = hashesOf(data);
  const axes = axesOf(data);
  const shown = { imbalance: 0, peak: 0, moved: 0 };
  const setImbalance = (v: number): void => {
    ctx.metric('imbalance', v - shown.imbalance);
    shown.imbalance = v;
  };
  const setPeak = (v: number): void => {
    ctx.metric('peak-open', v - shown.peak);
    shown.peak = v;
  };
  const setMoved = (v: number): void => {
    ctx.metric('moved', v - shown.moved);
    shown.moved = v;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const stepWait = data.stepMs + MOTION_MS;

  let policy = data.defaultPolicy;
  let spread = data.defaultSpread;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = simulateRound(data, policy, spread);
      setImbalance(0);
      setPeak(0);
      setMoved(0);
      await ctx.emit({
        type: 'init',
        silent: true,
        payload: {
          policy,
          spread,
          servers: [...data.servers],
          keys: [...data.keys],
          serverRing,
          keyRing,
          requests: data.requests,
          dropTick: data.dropTick,
          openAxis: axes.openAxis,
          imbalanceAxis: axes.imbalanceAxis,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      for (const step of round.steps) {
        if (ctx.cancelled) return;
        if (step.kind === 'drop') {
          await phase('drop-server');
          await ctx.emit({
            type: 'drop-server',
            payload: { tick: step.tick, server: step.server, alive: step.alive, open: step.open },
          });
        } else {
          if (policy === 0) await phase('pick-turn');
          else if (policy === 1) await phase('pick-idlest');
          else if (policy === 2) await phase('pick-mod');
          else await phase('pick-ring');
          setImbalance(step.imbalanceSum);
          setPeak(step.peak);
          setMoved(step.movedSum);
          await ctx.emit({
            type: 'route',
            payload: {
              index: step.index,
              tick: step.tick,
              key: step.key,
              hold: step.hold,
              pick: step.pick,
              from: step.from,
              moved: step.moved,
              gap: step.gap,
              imbalanceSum: step.imbalanceSum,
              peak: step.peak,
              movedSum: step.movedSum,
              open: step.open,
              alive: step.alive,
              lastOf: step.lastOf,
            },
          });
        }
        if (!(await ctx.sleep(stepWait))) return;
      }

      // 한 판이 끝났다 — 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        if (input.type === 'policy' && data.policies.includes(value)) {
          policy = value;
          break;
        }
        if (input.type === 'spread' && data.spreads.includes(value)) {
          spread = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
