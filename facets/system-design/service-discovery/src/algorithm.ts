/**
 * 서비스 디스커버리 — 등록부의 만료 길이는 맞바꿈이다.
 *
 * 인스턴스 넷이 틱 0 에 등록부에 오르고, 하트비트 간격마다 소식을 보낸다. 소식은
 * 길에서 잃을 수 있다(판 머리에 미리 뽑은 잃음 표). 등록부는 줄마다 "마지막으로 들은 틱"
 * 을 쥐고, 지금 − 마지막 ≥ 만료면 그 줄을 지운다. 게이트웨이는 틱마다 요청 둘을
 * **그 순간의 명단** 차례대로 보낸다(서버 쪽 디스커버리).
 *
 * 한 틱(1..ticks−1) 안의 차례 — ① 멈춤 ② 소식(하트비트) ③ 만료 ④ 요청.
 *   ① 멈춤: stop.instance 는 stop.tick 부터 소식을 보내지 않는다. 등록부는 모른다.
 *   ② 소식: 살아 있고 하트비트 틱이고 잃지 않았으면 마지막 = 지금. 명단에 없던 것이면 다시 오른다.
 *   ③ 만료: 명단의 인스턴스마다(목록 차례) 지금 − 마지막 ≥ 만료면 지운다.
 *   ④ 요청: 명단(인스턴스 목록 차례, 다시 오른 것도 제자리)의 크기 n 에서 rr mod n 번째를
 *      고르고 rr += 1. 명단이 비면 던진다.
 * 동률 규칙: 명단은 인스턴스 목록 차례 — 같은 틱에 여럿을 지워도 목록 차례로 적는다.
 * 이 데이터(씨앗 42)에서 한 틱에 둘 이상을 지우는 일은 만료 3 에서만 난다.
 *
 * 잃음 표: x ← (75·x + 74) mod 65537, 씨앗에서 시작해 뽑을 때마다 먼저 x 를 넘기고
 * 그 x 를 쓴다. 인스턴스 차례 · 하트비트 차례로 뽑아 floor(x·100 / 65537) < lossPercent
 * 이면 잃는다. 만료 손잡이와 무관한 같은 표다 — 손잡이를 돌려도 같은 소식을 잃는다.
 *
 * 이벤트 (payload 스키마 · silent 여부)
 *   init  (silent)  한 판의 머리. 걸음 0 을 갈아 끼운다.
 *     { expiry: number, service: string, instances: { id: string, addr: string }[],
 *       scaleMax: number, lastTick: number, motionMs: number }
 *   phase (silent)  { phase: 'renew' | 'drop' | 'pick' } — 그 걸음의 발신 바로 앞
 *   tick            걸음 하나 = 틱 하나.
 *     { tick: number, expiry: number, stopped: string | null,
 *       beats: { instance: string, lost: boolean, rejoined: boolean }[],
 *       drops: { instance: string, alive: boolean }[],
 *       picks: { instance: string, dead: boolean }[],
 *       quiet: number[]      (인스턴스 차례, 소식 뒤의 지금 − 마지막)
 *       listed: boolean[]    (인스턴스 차례, 만료 뒤의 명단)
 *       alive: boolean[] }   (인스턴스 차례, 멈춤 뒤)
 *
 * phase 어휘 — 걸음마다 하나: 그 틱에 지움이 있으면 drop, 없고 닿은 소식이 있으면 renew,
 * 둘 다 없으면 pick. irs.ts 의 phase 집합과 같다.
 *
 * 계기 (판마다 0 에서 다시 센다, 틱마다 지금까지의 수)
 *   dead-calls   멈춘 인스턴스를 고른 요청
 *   false-drops  살아 있는 인스턴스를 지운 횟수
 *   stale-ticks  멈춘 뒤 그 인스턴스가 (만료 뒤) 명단에 있던 틱 수
 *
 * 손잡이: expiry (만료 길이) — 사다리 소속만 받는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ServiceDiscoveryInstance = { id: string; addr: string };

export type ServiceDiscoveryData = {
  type: 'service-discovery';
  stepMs: number;
  motionMs: number;
  service: string;
  instances: ServiceDiscoveryInstance[];
  stop: { instance: string; tick: number };
  /** 틱 0..ticks−1 */
  ticks: number;
  beat: number;
  lossPercent: number;
  seed: number;
  callsPerTick: number;
  ladder: number[];
  defaultExpiry: number;
};

export type ServiceDiscoveryPhase = 'renew' | 'drop' | 'pick';

export type ServiceDiscoveryTick = {
  tick: number;
  phase: ServiceDiscoveryPhase;
  stopped: string | null;
  beats: { instance: string; lost: boolean; rejoined: boolean }[];
  drops: { instance: string; alive: boolean }[];
  picks: { instance: string; dead: boolean }[];
  quiet: number[];
  listed: boolean[];
  alive: boolean[];
  deadCalls: number;
  falseDrops: number;
  staleTicks: number;
};

export type ServiceDiscoveryRun = {
  ticks: ServiceDiscoveryTick[];
  deadCalls: number;
  falseDrops: number;
  staleTicks: number;
};

const MOD = 65537;

function isInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

/** ctx.data 좁히개 — 모양이 어긋나면 무엇이 없는지 담아 던진다. 무대의 initial 도 이것을 부른다. */
export function readServiceDiscoveryData(raw: unknown): ServiceDiscoveryData {
  if (typeof raw !== 'object' || raw === null) throw new Error('service-discovery: 자료가 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'service-discovery') throw new Error(`service-discovery: type 이 다르다 (${String(r.type)})`);
  for (const k of ['stepMs', 'motionMs', 'ticks', 'beat', 'lossPercent', 'seed', 'callsPerTick', 'defaultExpiry'] as const) {
    if (!isInt(r[k]) || (r[k] as number) < 0) throw new Error(`service-discovery: ${k} 가 음이 아닌 정수가 아니다`);
  }
  if (typeof r.service !== 'string') throw new Error('service-discovery: service 가 없다');
  if (!Array.isArray(r.instances) || r.instances.length === 0) throw new Error('service-discovery: instances 가 없다');
  const instances: ServiceDiscoveryInstance[] = r.instances.map((x, i) => {
    if (typeof x !== 'object' || x === null) throw new Error(`service-discovery: instances[${i}] 가 객체가 아니다`);
    const o = x as Record<string, unknown>;
    if (typeof o.id !== 'string' || typeof o.addr !== 'string') throw new Error(`service-discovery: instances[${i}] 에 id · addr 가 없다`);
    return { id: o.id, addr: o.addr };
  });
  const stop = r.stop as Record<string, unknown> | undefined;
  if (typeof stop !== 'object' || stop === null || typeof stop.instance !== 'string' || !isInt(stop.tick)) {
    throw new Error('service-discovery: stop { instance, tick } 가 없다');
  }
  if (!instances.some((x) => x.id === stop.instance)) throw new Error(`service-discovery: 멈출 인스턴스 ${stop.instance} 가 목록에 없다`);
  if (!Array.isArray(r.ladder) || r.ladder.length === 0 || !r.ladder.every((v) => isInt(v) && v > 0)) {
    throw new Error('service-discovery: ladder 가 양의 정수 목록이 아니다');
  }
  const ladder = r.ladder as number[];
  const defaultExpiry = r.defaultExpiry as number;
  if (!ladder.includes(defaultExpiry)) throw new Error(`service-discovery: defaultExpiry ${defaultExpiry} 가 사다리에 없다`);
  const beat = r.beat as number;
  if (beat === 0) throw new Error('service-discovery: beat 가 0 이다');
  return {
    type: 'service-discovery',
    stepMs: r.stepMs as number,
    motionMs: r.motionMs as number,
    service: r.service,
    instances,
    stop: { instance: stop.instance, tick: stop.tick },
    ticks: r.ticks as number,
    beat,
    lossPercent: r.lossPercent as number,
    seed: r.seed as number,
    callsPerTick: r.callsPerTick as number,
    ladder: [...ladder],
    defaultExpiry,
  };
}

/** 하트비트 수 — 틱 beat · 2·beat · … ≤ ticks − 1 */
export function serviceDiscoveryBeatCount(data: ServiceDiscoveryData): number {
  return Math.floor((data.ticks - 1) / data.beat);
}

/** 잃음 표 (1 = 잃음). lost[i·nb + (tick/beat − 1)]. 판 머리에 한 번 뽑는다. */
export function serviceDiscoveryLossTable(data: ServiceDiscoveryData): number[] {
  const nb = serviceDiscoveryBeatCount(data);
  const lost: number[] = [];
  let x = data.seed;
  for (let i = 0; i < data.instances.length; i += 1) {
    for (let h = 0; h < nb; h += 1) {
      x = (75 * x + 74) % MOD;
      lost.push(Math.floor((x * 100) / MOD) < data.lossPercent ? 1 : 0);
    }
  }
  return lost;
}

/** 한 판을 셈한다 — 화면에 뜨는 값은 모두 여기서 나온다. */
export function serviceDiscoveryRun(
  data: ServiceDiscoveryData,
  expiry: number,
  lost: readonly number[],
): ServiceDiscoveryRun {
  const n = data.instances.length;
  const nb = serviceDiscoveryBeatCount(data);
  if (lost.length !== n * nb) throw new Error(`service-discovery: 잃음 표 길이 ${lost.length} ≠ ${n * nb}`);
  const deadIdx = data.instances.findIndex((x) => x.id === data.stop.instance);
  if (deadIdx < 0) throw new Error(`service-discovery: 멈출 인스턴스 ${data.stop.instance} 가 목록에 없다`);
  const last = new Array<number>(n).fill(0);
  const listed = new Array<boolean>(n).fill(true);
  let rr = 0;
  let deadCalls = 0;
  let falseDrops = 0;
  let staleTicks = 0;
  const out: ServiceDiscoveryTick[] = [];
  const isAlive = (i: number, tick: number): boolean => !(i === deadIdx && tick >= data.stop.tick);

  for (let tick = 1; tick < data.ticks; tick += 1) {
    // ① 멈춤
    const stopped = tick === data.stop.tick ? data.stop.instance : null;
    const alive = data.instances.map((_, i) => isAlive(i, tick));
    // ② 소식
    const beats: ServiceDiscoveryTick['beats'] = [];
    if (tick % data.beat === 0) {
      const h = tick / data.beat - 1;
      for (let i = 0; i < n; i += 1) {
        if (!alive[i]) continue; // 멈춘 인스턴스는 소식을 보내지 않는다 — 모형의 규약
        const cell = lost[i * nb + h];
        if (cell !== 0 && cell !== 1) throw new Error(`service-discovery: 잃음 표 칸 ${i * nb + h} 가 0/1 이 아니다`);
        const id = data.instances[i]!.id;
        if (cell === 1) {
          beats.push({ instance: id, lost: true, rejoined: false });
        } else {
          const rejoined = !listed[i];
          last[i] = tick;
          listed[i] = true;
          beats.push({ instance: id, lost: false, rejoined });
        }
      }
    }
    const quiet = last.map((l) => tick - l);
    // ③ 만료
    const drops: ServiceDiscoveryTick['drops'] = [];
    for (let i = 0; i < n; i += 1) {
      if (listed[i] && tick - last[i]! >= expiry) {
        listed[i] = false;
        drops.push({ instance: data.instances[i]!.id, alive: alive[i]! });
        if (alive[i]) falseDrops += 1;
      }
    }
    if (!alive[deadIdx] && listed[deadIdx]) staleTicks += 1;
    // ④ 요청
    const picks: ServiceDiscoveryTick['picks'] = [];
    const roster: number[] = [];
    for (let i = 0; i < n; i += 1) if (listed[i]) roster.push(i);
    for (let c = 0; c < data.callsPerTick; c += 1) {
      if (roster.length === 0) throw new Error(`service-discovery: 틱 ${tick} 에 명단이 빈 채 요청해야 한다`);
      const i = roster[rr % roster.length]!;
      rr += 1;
      const dead = !alive[i];
      if (dead) deadCalls += 1;
      picks.push({ instance: data.instances[i]!.id, dead });
    }
    const phase: ServiceDiscoveryPhase =
      drops.length > 0 ? 'drop' : beats.some((b) => !b.lost) ? 'renew' : 'pick';
    out.push({
      tick,
      phase,
      stopped,
      beats,
      drops,
      picks,
      quiet,
      listed: [...listed],
      alive,
      deadCalls,
      falseDrops,
      staleTicks,
    });
  }
  return { ticks: out, deadCalls, falseDrops, staleTicks };
}

export async function serviceDiscoveryAlgorithm(ctx: FacetContext<ServiceDiscoveryData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ServiceDiscoveryData>;
  const data = readServiceDiscoveryData(ctx.data);
  const lost = serviceDiscoveryLossTable(data);
  const scaleMax = Math.max(...data.ladder) + 1;

  // 계기는 누적 채널 — 지금 보이는 값을 쥐고 차이만 보낸다. 처음 한 번은 차이 0 도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined) {
      ctx.metric(name, value);
    } else if (value !== prev) {
      ctx.metric(name, value - prev);
    }
    shown.set(name, value);
  };
  const phase = (name: ServiceDiscoveryPhase) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let expiry = data.defaultExpiry;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = serviceDiscoveryRun(data, expiry, lost);
      setMetric('dead-calls', 0);
      setMetric('false-drops', 0);
      setMetric('stale-ticks', 0);
      await ctx.emit({
        type: 'init',
        payload: {
          expiry,
          service: data.service,
          instances: data.instances.map((x) => ({ id: x.id, addr: x.addr })),
          scaleMax,
          lastTick: data.ticks - 1,
          motionMs: data.motionMs,
        },
        silent: true,
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      for (const rec of run.ticks) {
        if (ctx.cancelled) return;
        if (rec.phase === 'drop') await phase('drop');
        else if (rec.phase === 'renew') await phase('renew');
        else await phase('pick');
        await ctx.emit({
          type: 'tick',
          payload: {
            tick: rec.tick,
            expiry,
            stopped: rec.stopped,
            beats: rec.beats,
            drops: rec.drops,
            picks: rec.picks,
            quiet: rec.quiet,
            listed: rec.listed,
            alive: rec.alive,
          },
        });
        setMetric('dead-calls', rec.deadCalls);
        setMetric('false-drops', rec.falseDrops);
        setMetric('stale-ticks', rec.staleTicks);
        if (!(await rctx.sleep(data.stepMs + data.motionMs))) return;
      }

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘리고, 사다리 밖 값은 받지 않는다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'expiry') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number' || !data.ladder.includes(value)) continue;
        expiry = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
