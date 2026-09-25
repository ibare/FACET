/**
 * producer-consumer — 유한 버퍼 + 세마포어 둘 (empty · full).
 *
 * 넣는 쪽은 `makeAt` 의 틱마다 물건을 하나씩 만들어 손에 쥐고, 한 틱에 한 번
 * `acquire(empty) · put() · release(full)` 을 한다. 꺼내는 쪽은 한 틱에
 * `acquire(full) · take() · release(empty)` 를 하고 `use()` 를 `useTicks` 틱 쓴다.
 * 두 쪽은 한 틱에 **각자 한 번씩** 움직인다 (두 쪽이 따로 도는 모형).
 *
 * 한 틱의 차례:
 *   ① 이 틱에 만들어지는 물건이 넣는 쪽 손 끝에 쥐어진다 (물건 번호 1 부터)
 *   ② 꺼내는 쪽 — 잠들어 있으면 잠든 틱 +1 · use() 중이면 한 틱 쓴다 · 표를 넘겨받았으면 take() ·
 *      아니면 acquire(full): 표가 있으면 −1 하고 take(), 0 이면 잠들어 full 의 줄에 선다
 *   ③ 넣는 쪽 — 잠들어 있으면 잠든 틱 +1 · 표를 넘겨받았으면 put() · 손에 물건이 있으면 acquire(empty):
 *      표가 있으면 −1 하고 put(), 0 이면 잠들어 empty 의 줄에 선다 · 손이 비었으면 쉰다
 *   take() = 버퍼 맨 앞을 꺼내고 곧바로 release(empty). put() = 손 맨 앞을 버퍼 끝에 넣고 곧바로 release(full).
 *   release(s) 는 s 의 줄에 잠든 쪽이 있으면 표를 **곧바로 건넨다** — 표 수는 그대로, 받은 쪽은 제 다음
 *   차례에 acquire 를 다시 하지 않는다. 줄이 없으면 표 수 +1.
 *   막힌 시도 틱도 잠든 틱으로 센다. 동률 · 겨룸은 없다 — 차례가 고정이라 한 틱의 일은 하나로 정해진다.
 *
 * 던지는 자리 (C6): 빈 버퍼에서 꺼냄 · 찬 버퍼에 넣음 · 빈손으로 put · 불변식 깨짐
 * (버퍼 물건 = full + 꺼내는 쪽이 넘겨받은 표, 빈 칸 = empty + 넣는 쪽이 넘겨받은 표) ·
 * `makeAt` 이 오름차순이 아님 · 사다리 밖 칸 수 · 지평(100 틱) 안에 끝나지 않음.
 *
 * 이벤트 (모두 걸음 — silent 아님):
 *   - `round`  한 판의 걸음 0.
 *       payload { slots: number, ticks: number (이 판에 밟을 틱 수 = 끝 틱 + 1), empty: number, full: number,
 *                 producer: string, consumer: string, emptyName: string, fullName: string }
 *   - `tick`   틱 하나.
 *       payload { tick: number, made: number[],
 *                 cAct: 'blocked' | 'asleep' | 'use' | 'take', cItem: number (꺼낸 물건 · 아니면 0),
 *                 cGranted: boolean (넘겨받은 표로 꺼냄), cHandoff: boolean (release(empty) 를 넣는 쪽에게 건넴),
 *                 pAct: 'blocked' | 'asleep' | 'put' | 'idle', pItem: number (넣은 물건 · 아니면 0),
 *                 pGranted: boolean, pHandoff: boolean (release(full) 을 꺼내는 쪽에게 건넴),
 *                 cLines: number[], pLines: number[] (이 틱의 일이 걸린 코드 줄 색인 — consumerCode · producerCode),
 *                 midBuffer: number[], midEmpty: number, midFull: number (꺼내는 쪽 차례가 끝난 때의 버퍼 · 표 수),
 *                 hand: number[], buffer: number[] (맨 앞이 [0]), inUse: number (쓰는 중인 물건 · 없으면 0),
 *                 empty: number, full: number, pAsleep: boolean, cAsleep: boolean, pHolds: boolean, cHolds: boolean,
 *                 last: boolean, doneTick: number (끝 틱 · last 가 아니면 -1), neverFilled: number (last 가 아니면 -1) }
 *   phase 는 보내지 않는다 — 코드 패널이 없다 (IR 을 두지 않는다. irs.ts 참고).
 *
 * 코드 줄 색인: producerCode = [acquire(empty), put(), release(full)],
 *               consumerCode = [acquire(full), take(), release(empty), use()].
 *   막힘 · 잠듦 → acquire 줄. acquire 로 넣음/꺼냄 → 앞 세 줄. 넘겨받은 표로 → put()/take() 와 release 두 줄. use → use().
 *
 * 계기 (그 판 하나의 값 — 지금 값을 들고 차이만 보낸다):
 *   - `producer-sleep`  넣는 쪽이 제 차례에 잠들어 있던 틱 수 (막힌 시도 틱 포함)
 *   - `producer-done`   마지막 물건을 넣은 틱 (틱 번호)
 *   - `consumer-done`   마지막 물건을 꺼낸 틱 (틱 번호)
 *   - `peak-fill`       틱 끝마다 잰 버퍼 물건 수의 최대
 *
 * 입력: `slots` — payload.value 가 slotsLadder 에 든 number. 사다리 밖이면 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface ProducerConsumerData {
  type: 'producer-consumer';
  stepMs: number;
  slotsLadder: number[];
  slots: number;
  makeAt: number[];
  useTicks: number;
  producer: string;
  consumer: string;
  semaphores: string[];
  producerCode: string[];
  consumerCode: string[];
}

export type ConsumerAct = 'blocked' | 'asleep' | 'use' | 'take';
export type ProducerAct = 'blocked' | 'asleep' | 'put' | 'idle';

export interface TickRow {
  tick: number;
  made: number[];
  cAct: ConsumerAct;
  cItem: number;
  cGranted: boolean;
  cHandoff: boolean;
  pAct: ProducerAct;
  pItem: number;
  pGranted: boolean;
  pHandoff: boolean;
  cLines: number[];
  pLines: number[];
  midBuffer: number[];
  midEmpty: number;
  midFull: number;
  hand: number[];
  buffer: number[];
  inUse: number;
  empty: number;
  full: number;
  pAsleep: boolean;
  cAsleep: boolean;
  pHolds: boolean;
  cHolds: boolean;
}

export interface RoundResult {
  slots: number;
  rows: TickRow[];
  producerSleep: number;
  consumerSleep: number;
  producerDone: number;
  consumerDone: number;
  peakFill: number;
  neverFilled: number;
}

const HORIZON = 100;

/** 한 판을 끝까지 셈한다. 화면과 계기는 모두 이 결과에서 나온다. */
export function simulateRound(data: ProducerConsumerData, slots: number): RoundResult {
  if (!data.slotsLadder.includes(slots)) throw new Error(`사다리 밖 칸 수: ${slots}`);
  for (let i = 1; i < data.makeAt.length; i += 1) {
    if (data.makeAt[i]! < data.makeAt[i - 1]!) throw new Error('makeAt 이 오름차순이 아니다');
  }
  if (data.makeAt.length === 0) throw new Error('makeAt 이 비었다 — 만들 물건이 없다');
  if (!(data.useTicks >= 0)) throw new Error(`useTicks 가 셈할 수 없는 값: ${data.useTicks}`);

  const total = data.makeAt.length;
  const buffer: number[] = [];
  const hand: number[] = [];
  let empty = slots;
  let full = 0;
  let nextItem = 1;
  const P = { asleep: false, granted: false, sleep: 0 };
  const Q = { asleep: false, granted: false, sleep: 0, use: 0 };
  let taken = 0;
  let inUse = 0;
  let lastPut = -1;
  let peak = 0;
  const rows: TickRow[] = [];

  for (let tick = 0; tick < HORIZON; tick += 1) {
    const made: number[] = [];
    for (const m of data.makeAt) {
      if (m === tick) {
        hand.push(nextItem);
        made.push(nextItem);
        nextItem += 1;
      }
    }

    let cHandoff = false;
    let pHandoff = false;
    const take = (): number => {
      const item = buffer.shift();
      if (item === undefined) throw new Error(`빈 버퍼에서 꺼냄 (틱 ${tick})`);
      taken += 1;
      inUse = item;
      Q.use = data.useTicks;
      if (P.asleep) {
        P.asleep = false;
        P.granted = true;
        cHandoff = true;
      } else {
        empty += 1;
      }
      return item;
    };
    const put = (): number => {
      if (buffer.length >= slots) throw new Error(`찬 버퍼에 넣음 (틱 ${tick})`);
      const item = hand.shift();
      if (item === undefined) throw new Error(`빈손으로 넣으려 함 (틱 ${tick})`);
      buffer.push(item);
      lastPut = tick;
      if (Q.asleep) {
        Q.asleep = false;
        Q.granted = true;
        pHandoff = true;
      } else {
        full += 1;
      }
      return item;
    };

    // 꺼내는 쪽 먼저
    let cAct: ConsumerAct;
    let cItem = 0;
    let cGranted = false;
    let cLines: number[];
    if (Q.asleep) {
      Q.sleep += 1;
      cAct = 'asleep';
      cLines = [0];
    } else if (Q.use > 0) {
      Q.use -= 1;
      cAct = 'use';
      cLines = [3];
    } else if (Q.granted) {
      Q.granted = false;
      cGranted = true;
      cItem = take();
      cAct = 'take';
      cLines = [1, 2];
    } else if (full > 0) {
      full -= 1;
      cItem = take();
      cAct = 'take';
      cLines = [0, 1, 2];
    } else {
      Q.asleep = true;
      Q.sleep += 1;
      cAct = 'blocked';
      cLines = [0];
    }

    const midBuffer = [...buffer];
    const midEmpty = empty;
    const midFull = full;

    // 넣는 쪽
    let pAct: ProducerAct;
    let pItem = 0;
    let pGranted = false;
    let pLines: number[];
    if (P.asleep) {
      P.sleep += 1;
      pAct = 'asleep';
      pLines = [0];
    } else if (P.granted) {
      P.granted = false;
      pGranted = true;
      pItem = put();
      pAct = 'put';
      pLines = [1, 2];
    } else if (hand.length > 0) {
      if (empty > 0) {
        empty -= 1;
        pItem = put();
        pAct = 'put';
        pLines = [0, 1, 2];
      } else {
        P.asleep = true;
        P.sleep += 1;
        pAct = 'blocked';
        pLines = [0];
      }
    } else {
      pAct = 'idle';
      pLines = [];
    }

    peak = Math.max(peak, buffer.length);
    if (buffer.length !== full + (Q.granted ? 1 : 0)) throw new Error(`full 불변식 깨짐 (틱 ${tick})`);
    if (slots - buffer.length !== empty + (P.granted ? 1 : 0)) throw new Error(`empty 불변식 깨짐 (틱 ${tick})`);
    if (empty < 0 || full < 0) throw new Error(`표 수가 음수 (틱 ${tick})`);

    rows.push({
      tick,
      made,
      cAct,
      cItem,
      cGranted,
      cHandoff,
      pAct,
      pItem,
      pGranted,
      pHandoff,
      cLines,
      pLines,
      midBuffer,
      midEmpty,
      midFull,
      hand: [...hand],
      buffer: [...buffer],
      inUse,
      empty,
      full,
      pAsleep: P.asleep,
      cAsleep: Q.asleep,
      pHolds: P.granted,
      cHolds: Q.granted,
    });

    if (taken === total) {
      if (lastPut < 0) throw new Error('넣은 틱이 없다');
      return {
        slots,
        rows,
        producerSleep: P.sleep,
        consumerSleep: Q.sleep,
        producerDone: lastPut,
        consumerDone: tick,
        peakFill: peak,
        neverFilled: slots - peak,
      };
    }
  }
  throw new Error(`지평(${HORIZON} 틱) 안에 끝나지 않았다`);
}

type MetricName = 'producer-sleep' | 'producer-done' | 'consumer-done' | 'peak-fill';

export async function producerConsumerAlgorithm(ctx: FacetContext<ProducerConsumerData>): Promise<void> {
  const rc = ctx as ReactiveContext<ProducerConsumerData>;
  const data = ctx.data;
  const [emptyName, fullName] = data.semaphores;
  if (emptyName === undefined || fullName === undefined) throw new Error('semaphores 에 이름 둘이 없다');

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<MetricName, number>();
  const setMetric = (name: MetricName, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  const playRound = async (slots: number): Promise<boolean> => {
    const r = simulateRound(data, slots);
    await ctx.emit({
      type: 'round',
      payload: {
        slots,
        ticks: r.rows.length,
        empty: slots,
        full: 0,
        producer: data.producer,
        consumer: data.consumer,
        emptyName,
        fullName,
      },
    });
    setMetric('producer-sleep', 0);
    setMetric('producer-done', 0);
    setMetric('consumer-done', 0);
    setMetric('peak-fill', 0);
    if (!(await rc.sleep(data.stepMs))) return false;

    let sleepSoFar = 0;
    let peakSoFar = 0;
    for (let i = 0; i < r.rows.length; i += 1) {
      if (ctx.cancelled) return false;
      const row = r.rows[i]!;
      const last = i === r.rows.length - 1;
      await ctx.emit({
        type: 'tick',
        payload: {
          ...row,
          last,
          doneTick: last ? r.consumerDone : -1,
          neverFilled: last ? r.neverFilled : -1,
        },
      });
      if (row.pAct === 'blocked' || row.pAct === 'asleep') sleepSoFar += 1;
      peakSoFar = Math.max(peakSoFar, row.buffer.length);
      setMetric('producer-sleep', sleepSoFar);
      setMetric('peak-fill', peakSoFar);
      if (row.pAct === 'put') setMetric('producer-done', row.tick);
      if (last) setMetric('consumer-done', r.consumerDone);
      if (!last && !(await rc.sleep(data.stepMs))) return false;
    }
    if (sleepSoFar !== r.producerSleep || peakSoFar !== r.peakFill) throw new Error('걸음으로 센 계기가 판의 셈과 다르다');
    return true;
  };

  try {
    let slots = data.slots;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(slots))) return;
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'slots') continue;
        const payload = input.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (typeof value !== 'number') throw new Error('slots 입력의 value 가 수가 아니다');
        if (!data.slotsLadder.includes(value)) throw new Error(`사다리 밖 칸 수: ${value}`);
        next = value;
      }
      slots = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
