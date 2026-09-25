/**
 * ethernet — CSMA/CD 물러나기. 한 선을 N 스테이션이 나눠 쓸 때, 충돌마다 물러날 범위를
 * 고정(0..1)으로 두는 것과 두 배로 넓히는 것이 무엇을 바꾸는지 슬롯 단위로 재생한다.
 *
 * 손잡이 셋 (reactive — 한 판을 끝까지 재생하고 입력을 기다렸다가 받은 값으로 다시 돈다)
 *   stations  N ∈ initialData.stationCounts (2 · 4 · 8)
 *   backoff   0 고정 · 1 두 배 (initialData.policies 의 순번)
 *   seed      생성기 씨앗 ∈ initialData.seeds (1 · 42 · 1234)
 *
 * 규약 (조각 collision-and-backoff 와 같다 + 생성기)
 *   - 슬롯은 정수. 슬롯 t 머리에서 기다림 상태이고 listen ≤ t 인 스테이션이 보낼 차례.
 *     차례가 된 이가 하나면 그 슬롯부터 frameSlots(3) 슬롯을 보낸다 (그 동안 선이 차 있어
 *     다른 이는 듣기만 한다 — 1-지속). 둘 이상이면 충돌 — 그 슬롯 끝에 모두 멈춘다.
 *     멈춤 신호는 충돌 슬롯 안에 접는다. 프레임 사이 틈 없음. 전파 지연 0.
 *   - 충돌한 이(스테이션 차례 A → H): 충돌 횟수 c += 1. c == maxAttempts(16) 이면 버림.
 *     아니면 창(span): 고정 = 2, 두 배 = min(앞 창 × 2, windowCap) (처음 창 1).
 *     k = 생성기에서 하나, 다시 들을 슬롯 = t + 1 + k.
 *   - 생성기 (판마다 새로): x = (mul · x + add) % mod, k = (x // shift) % span, x 처음 = seed % mod.
 *     한 판의 모든 스테이션이 생성기 하나를 차례로 쓴다. 중간값 최대 25173 · 65535 + 13849 < 2^31.
 *   - 모두 보냈거나 버렸으면 끝. 끝 슬롯 = 마지막 보냄이 끝난 슬롯 또는 마지막 충돌 슬롯 + 1.
 *     슬롯 MAX_SLOTS(5000) 에 닿으면 던진다.
 *   - 동률 규칙: 한 슬롯에서 여럿이 충돌하면 스테이션 차례로 처리하고 이벤트 안의 picks 도 그 차례.
 *
 * 이벤트 (silent 가 아닌 것은 걸음을 이룬다 — 걸음 경계는 sleep 과 입력 대기)
 *   round     { stations: string[]; policy: number; seed: number; frameSlots: number }
 *             판 머리 (걸음 0). 코드 줄을 끈다
 *   collide   { slot: number; picks: { station: number; attempt: number; dropped: boolean;
 *                                      k: number; span: number; listen: number }[] }
 *             버린 이는 k · span · listen 이 -1
 *   send      { slot: number; station: number; until: number; free: number }
 *             until = slot + frameSlots - 1 · free = 선이 다시 비는 슬롯 (until + 1)
 *   finish    { slot: number; collisions: number; sent: number; dropped: number }
 *             판 끝 (입력 대기 직전 — 새 걸음을 만들지 않는다)
 *   phase     { phase: string }  silent
 *
 * phase 어휘 (irs.ts 와 같다) — 걸음 경계에서 그 걸음에서 실제로 간 가지
 *   send        혼자 보냄
 *   widen       충돌 · 버린 이 없음 · 두 배
 *   pick-wait   충돌 · 버린 이 없음 · 고정
 *   drop        충돌 · 버린 이 있음
 *   걸음 0 에는 phase 가 없다.
 *
 * 계기 (판마다 0 에서 다시 센다 — 지금 값을 들고 차이만 보낸다)
 *   collisions       충돌 걸음마다 +1
 *   sent-frames      send 걸음마다 +1
 *   dropped-frames   버린 이마다 +1 (한 걸음에 둘도 된다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EthernetData = {
  type: 'ethernet';
  stepMs: number;
  /** 스테이션 기호 (자료 — 번역하지 않는다). N 이면 앞에서 N */
  stations: string[];
  stationCounts: number[];
  policies: string[];
  seeds: number[];
  frameSlots: number;
  maxAttempts: number;
  windowCap: number;
  /** 첫 판의 손잡이 값 */
  initialStations: number;
  initialBackoff: number;
  initialSeed: number;
};

export type CsmaPick = {
  station: number;
  attempt: number;
  dropped: boolean;
  k: number;
  span: number;
  listen: number;
};

export type CsmaEvent =
  | { kind: 'collide'; slot: number; picks: CsmaPick[] }
  | { kind: 'send'; slot: number; station: number; until: number };

export type CsmaRun = {
  events: CsmaEvent[];
  finish: number;
  collisions: number;
  sent: number;
  dropped: number;
};

/** 한 판을 끝까지 셈한다 — irs.ts 의 csmaRun 과 같은 짜임 */
export function simulateCsma(
  data: EthernetData,
  n: number,
  policy: number,
  seed: number,
): CsmaRun {
  if (!data.stationCounts.includes(n)) throw new Error(`사다리 밖 스테이션 수: ${n}`);
  if (policy !== 0 && policy !== 1) throw new Error(`사다리 밖 물러나기: ${policy}`);
  if (!data.seeds.includes(seed)) throw new Error(`사다리 밖 씨앗: ${seed}`);
  if (n > data.stations.length) throw new Error(`기호가 모자란다: ${n}`);

  const listen = new Array<number>(n).fill(0);
  const collided = new Array<number>(n).fill(0);
  const span = new Array<number>(n).fill(1);
  const state = new Array<number>(n).fill(0); // 0 기다림 · 1 다 보냄 · 2 버림
  let x = seed % LCG.mod;
  const draw = (s: number): number => {
    x = (LCG.mul * x + LCG.add) % LCG.mod;
    return Math.floor(x / LCG.shift) % s;
  };

  const events: CsmaEvent[] = [];
  let t = 0;
  let finish = 0;
  let collisions = 0;
  let sent = 0;
  let left = n;
  while (left > 0) {
    if (t >= MAX_SLOTS) throw new Error(`끝나지 않는 슬롯: ${t}`);
    let ready = 0;
    for (let i = 0; i < n; i++) if (state[i] === 0 && listen[i]! <= t) ready++;
    if (ready === 1) {
      for (let i = 0; i < n; i++) {
        if (state[i] === 0 && listen[i]! <= t) {
          state[i] = 1;
          left--;
          sent++;
          events.push({ kind: 'send', slot: t, station: i, until: t + data.frameSlots - 1 });
        }
      }
      t += data.frameSlots;
      finish = t;
    } else if (ready >= 2) {
      collisions++;
      const picks: CsmaPick[] = [];
      for (let i = 0; i < n; i++) {
        if (state[i] === 0 && listen[i]! <= t) {
          collided[i] = collided[i]! + 1;
          if (collided[i]! >= data.maxAttempts) {
            state[i] = 2;
            left--;
            picks.push({ station: i, attempt: collided[i]!, dropped: true, k: -1, span: -1, listen: -1 });
          } else {
            span[i] = policy === 1 ? Math.min(span[i]! * 2, data.windowCap) : 2;
            const k = draw(span[i]!);
            listen[i] = t + 1 + k;
            picks.push({ station: i, attempt: collided[i]!, dropped: false, k, span: span[i]!, listen: listen[i]! });
          }
        }
      }
      events.push({ kind: 'collide', slot: t, picks });
      t += 1;
      finish = t;
    } else {
      t += 1;
    }
  }
  return { events, finish, collisions, sent, dropped: n - sent };
}

/**
 * 선형 합동 생성기 상수 — 곱 · 더함 · 법 · 꺼냄 나눗수. 알고리즘과 IR 이 이 한 곳에서 읽는다.
 * 위 비트(x // shift)에서 꺼낸다 — 낮은 비트는 씨앗이 달라도 같은 열을 낸다.
 */
export const LCG = { mul: 25173, add: 13849, mod: 65536, shift: 64 } as const;

/** 끝나지 않는 판을 끊는 슬롯 — IR 의 while 조건과 같다 */
export const MAX_SLOTS = 5000;

/** 창의 상한 — IR 의 min(span * 2, 1024) 리터럴. initialData.windowCap 과 같다 (검사가 잠근다) */
export const WINDOW_CAP_IN_IR = 1024;

type Knobs = { stations: number; backoff: number; seed: number };

export async function ethernetAlgorithm(baseCtx: FacetContext<EthernetData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<EthernetData>;
  const data = ctx.data;
  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다 (판마다 0 에서)
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number) => {
    const before = shown.get(name);
    const delta = value - (before ?? 0);
    if (before === undefined || delta !== 0) ctx.metric(name, delta);
    shown.set(name, value);
  };

  const knobs: Knobs = {
    stations: data.initialStations,
    backoff: data.initialBackoff,
    seed: data.initialSeed,
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = simulateCsma(data, knobs.stations, knobs.backoff, knobs.seed);

      // 걸음 0 — 준비
      setMetric('collisions', 0);
      setMetric('sent-frames', 0);
      setMetric('dropped-frames', 0);
      await ctx.emit({
        type: 'round',
        payload: {
          stations: data.stations.slice(0, knobs.stations),
          policy: knobs.backoff,
          seed: knobs.seed,
          frameSlots: data.frameSlots,
        },
      });
      if (!(await ctx.sleep(data.stepMs))) return;

      let collisions = 0;
      let sent = 0;
      let dropped = 0;
      for (let e = 0; e < run.events.length; e++) {
        if (ctx.cancelled) return;
        const ev = run.events[e]!;
        if (ev.kind === 'send') {
          sent++;
          await ctx.emit({
            type: 'send',
            payload: { slot: ev.slot, station: ev.station, until: ev.until, free: ev.until + 1 },
          });
          await phase('send');
          setMetric('sent-frames', sent);
        } else {
          collisions++;
          const drops = ev.picks.filter((p) => p.dropped).length;
          dropped += drops;
          await ctx.emit({
            type: 'collide',
            payload: { slot: ev.slot, picks: ev.picks.map((p) => ({ ...p })) },
          });
          if (drops > 0) await phase('drop');
          else if (knobs.backoff === 1) await phase('widen');
          else await phase('pick-wait');
          setMetric('collisions', collisions);
          setMetric('dropped-frames', dropped);
        }
        // 마지막 걸음의 경계는 입력 대기가 맡는다
        if (e < run.events.length - 1) {
          if (!(await ctx.sleep(data.stepMs))) return;
        }
      }
      if (collisions !== run.collisions || sent !== run.sent || dropped !== run.dropped) {
        throw new Error('판 끝 셈이 사건 목록과 어긋난다');
      }
      await ctx.emit({
        type: 'finish',
        payload: { slot: run.finish, collisions, sent, dropped },
      });

      // 입력 대기 — 우리 손잡이만 받는다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const key = input.type;
        if (key !== 'stations' && key !== 'backoff' && key !== 'seed') continue;
        const payload = input.payload as { value?: unknown } | undefined;
        const value = payload?.value;
        if (typeof value !== 'number') throw new Error(`손잡이 값이 수가 아니다: ${key}`);
        if (key === 'stations') {
          if (!data.stationCounts.includes(value)) throw new Error(`사다리 밖 스테이션 수: ${value}`);
          knobs.stations = value;
        } else if (key === 'backoff') {
          if (value < 0 || value >= data.policies.length || !Number.isInteger(value)) {
            throw new Error(`사다리 밖 물러나기: ${value}`);
          }
          knobs.backoff = value;
        } else {
          if (!data.seeds.includes(value)) throw new Error(`사다리 밖 씨앗: ${value}`);
          knobs.seed = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
