/**
 * clock-sync — 같은 메시지 열둘을 물리 도장과 램포트 수 두 눈으로 견준다.
 *
 * 프로세스 셋(P1 · P2 · P3)의 시계는 제 빠르기(ms/분 × 배수)로 참 시각에서 벗어나고, 주기 P 분마다
 * 시간 서버와 다시 맞춘다(P 0 = 다시 없음). 맞춘 뒤에도 길의 기울기 (가는 − 오는)/2 만큼은 남는다.
 * 메시지를 보낼 때 보내는 쪽 시계로, 받을 때 받는 쪽 시계로 도장을 찍으면 어긋남이 지연보다 큰 자리에서
 * **받음 도장이 보냄 도장보다 앞선다.** 램포트 수(보냄 +1 · 받음 max + 1)는 그런 일이 없다.
 *
 * ── 모형 규약 (사양 · 공통 안내문)
 *   남는 어긋남 resid(p) = (가는 − 오는) / 2. 홀수 차이면 정수가 아니므로 던진다.
 *   어긋남(p, 분 s) = 빠르기(p) × 배수 × 경과 + resid(p), 경과 = P 0 이면 s, 아니면 s mod P.
 *   메시지가 나는 동안의 드리프트는 넣지 않는다 — 받는 쪽 어긋남도 보낸 분의 값이다.
 *   보냄 도장 = s·60000 + 어긋남(보내는 쪽) · 받음 도장 = s·60000 + 지연 + 어긋남(받는 쪽).
 *   거꾸로 선 메시지 = 받음 도장 < 보냄 도장. 받음 − 보냄 = 0 은 이 데이터에 없다(가장 작은 절댓값 1 ms) —
 *   0 이면 거꾸로가 아니다(엄격한 < ).
 *   가장 큰 벌어짐 = 보낸 분마다 셋의 어긋남 가운데 큰 것 − 작은 것의 최대(그 걸음까지).
 *   램포트: 보냄 = 제 수 + 1, 받음 = max(제 수, 실려 온 수) + 1. 제 일 사건은 없다.
 *   차례 = 보낸 분 차례. 같은 분에 둘이 보내면 차례가 정해지지 않으므로 던진다(IR 은 −1).
 *
 * ── 이벤트 (모두 `type` 리터럴)
 *   phase          { phase: 'send' | 'receive' | 'inverted' }                         silent
 *   clock-init     { drift, resync, lastMinute, processes: string[],                  silent (판 머리 · 걸음 0)
 *                    messages: { id, src, dst }[],     src · dst 는 프로세스 번호(0..)
 *                    before: number[][], after: number[][],  프로세스마다 분 0..lastMinute 의 어긋남 —
 *                                                     before 는 그 분에 닿기 직전, after 는 그 분(맞춤 뒤)
 *                    resyncMinutes: number[],         다시 맞춘 분(1..lastMinute)
 *                    offsets: number[], lamport: number[],
 *                    axes: { offMin, offMax, relMin, relMax, lamportMax } }  사다리 전체에서 셈한 축
 *   clock-send     { index, id, minute, src, dst, stamp, rel, lamport,              걸음
 *                    offsets: number[], skew, hi, lo }
 *                    rel = 보냄 도장 − s·60000 (= 보내는 쪽 어긋남), hi · lo = 어긋남이 가장 큰 · 작은 프로세스
 *   clock-receive  { index, id, minute, src, dst, stamp, rel, sendRel, diff,        걸음
 *                    lamportSend, lamportRecv, inverted, lamportInverted }
 *                    rel = 받음 도장 − s·60000, diff = 받음 − 보냄 도장
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   send      보냄 걸음 — 보냄 도장 · 램포트 +1
 *   receive   받음 걸음(거꾸로가 아니다) — 받음 도장 · 램포트 max + 1
 *   inverted  받음 걸음(받음 도장 < 보냄 도장) — 대표 phase 로 receive 를 덮는다
 *
 * ── 계기 (판마다 0 에서)
 *   physical-inverted   물리 도장 거꾸로 선 메시지 수
 *   lamport-inverted    램포트 수가 거꾸로 선 메시지 수(늘 0 — 견줌 자리)
 *   max-skew-ms         가장 큰 벌어짐(그 걸음까지)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ClockSyncMessage = {
  id: string;
  sendMinute: number;
  src: string;
  dst: string;
  delayMs: number;
};

export type ClockSyncPath = { process: string; goMs: number; backMs: number };

export type ClockSyncData = {
  type: 'clock-sync';
  stepMs: number;
  processes: string[];
  /** 배수 1 에서의 빠르기 ms/분 — processes 와 같은 차례. */
  ratePerMinute: number[];
  /** 시간 서버와 맞출 때의 길 — processes 와 같은 차례. */
  syncPaths: ClockSyncPath[];
  messages: ClockSyncMessage[];
  drifts: number[];
  resyncs: number[];
  initialDrift: number;
  initialResync: number;
};

/** 걸음 사이 운동의 길이(ms). stepMs 는 운동이 끝난 뒤 쉬는 몫이다. */
export const CLOCK_SYNC_MOTION_MS = 280;

const MINUTE_MS = 60000;

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

/** `ctx.data` 좁히개 — 모양이 어긋나면 무엇이 어긋났는지 담아 던진다. */
export function narrowClockSyncData(raw: unknown): ClockSyncData {
  if (typeof raw !== 'object' || raw === null) throw new Error('clock-sync: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'clock-sync') throw new Error(`clock-sync: type 이 clock-sync 가 아니다 (${String(d.type)})`);
  if (typeof d.stepMs !== 'number') throw new Error('clock-sync: stepMs 가 없다');
  const processes = d.processes;
  if (!Array.isArray(processes) || !processes.every((p) => typeof p === 'string') || processes.length < 2) {
    throw new Error('clock-sync: processes 는 이름 둘 이상의 목록이어야 한다');
  }
  if (!isIntArray(d.ratePerMinute) || d.ratePerMinute.length !== processes.length) {
    throw new Error('clock-sync: ratePerMinute 가 프로세스 수만큼의 정수가 아니다');
  }
  const paths = d.syncPaths;
  if (!Array.isArray(paths) || paths.length !== processes.length) {
    throw new Error('clock-sync: syncPaths 가 프로세스 수만큼이 아니다');
  }
  const syncPaths: ClockSyncPath[] = paths.map((p, i) => {
    if (typeof p !== 'object' || p === null) throw new Error(`clock-sync: syncPaths[${i}] 가 객체가 아니다`);
    const q = p as Record<string, unknown>;
    if (q.process !== processes[i])
      throw new Error(`clock-sync: syncPaths[${i}] 의 프로세스가 ${String(processes[i])} 가 아니다`);
    if (typeof q.goMs !== 'number' || typeof q.backMs !== 'number')
      throw new Error(`clock-sync: syncPaths[${i}] 의 길이 수가 아니다`);
    return { process: q.process, goMs: q.goMs, backMs: q.backMs };
  });
  const msgs = d.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) throw new Error('clock-sync: messages 가 비었다');
  const messages: ClockSyncMessage[] = msgs.map((m, i) => {
    if (typeof m !== 'object' || m === null) throw new Error(`clock-sync: messages[${i}] 가 객체가 아니다`);
    const q = m as Record<string, unknown>;
    if (typeof q.id !== 'string') throw new Error(`clock-sync: messages[${i}].id 가 없다`);
    if (typeof q.sendMinute !== 'number' || !Number.isInteger(q.sendMinute) || q.sendMinute < 0) {
      throw new Error(`clock-sync: ${q.id} 의 보낸 분이 0 이상 정수가 아니다`);
    }
    if (typeof q.src !== 'string' || !processes.includes(q.src))
      throw new Error(`clock-sync: ${q.id} 의 보내는 쪽을 모른다 (${String(q.src)})`);
    if (typeof q.dst !== 'string' || !processes.includes(q.dst))
      throw new Error(`clock-sync: ${q.id} 의 받는 쪽을 모른다 (${String(q.dst)})`);
    if (q.src === q.dst) throw new Error(`clock-sync: ${q.id} 는 제게 보낸다`);
    if (typeof q.delayMs !== 'number' || !Number.isInteger(q.delayMs) || q.delayMs <= 0) {
      throw new Error(`clock-sync: ${q.id} 의 지연이 양의 정수가 아니다`);
    }
    return {
      id: q.id,
      sendMinute: q.sendMinute,
      src: q.src,
      dst: q.dst,
      delayMs: q.delayMs,
    };
  });
  if (!isIntArray(d.drifts) || d.drifts.length === 0 || d.drifts.some((x) => x < 0)) {
    throw new Error('clock-sync: drifts 사다리가 0 이상 정수 목록이 아니다');
  }
  if (!isIntArray(d.resyncs) || d.resyncs.length === 0 || d.resyncs.some((x) => x < 0)) {
    throw new Error('clock-sync: resyncs 사다리가 0 이상 정수 목록이 아니다');
  }
  if (typeof d.initialDrift !== 'number' || !d.drifts.includes(d.initialDrift)) {
    throw new Error('clock-sync: initialDrift 가 사다리에 없다');
  }
  if (typeof d.initialResync !== 'number' || !d.resyncs.includes(d.initialResync)) {
    throw new Error('clock-sync: initialResync 가 사다리에 없다');
  }
  return {
    type: 'clock-sync',
    stepMs: d.stepMs,
    processes: [...processes],
    ratePerMinute: [...d.ratePerMinute],
    syncPaths,
    messages,
    drifts: [...d.drifts],
    resyncs: [...d.resyncs],
    initialDrift: d.initialDrift,
    initialResync: d.initialResync,
  };
}

/** 남는 어긋남 (가는 − 오는) / 2. 홀수 차이는 정수가 아니므로 던진다. */
export function residualOffsets(data: ClockSyncData): number[] {
  return data.syncPaths.map((p) => {
    const diff = p.goMs - p.backMs;
    if (diff % 2 !== 0)
      throw new Error(`clock-sync: ${p.process} 의 길 차이 ${diff} 가 홀수라 남는 어긋남이 정수가 아니다`);
    return diff / 2;
  });
}

function elapsedMinutes(minute: number, period: number): number {
  return period > 0 ? minute % period : minute;
}

function offsetsAt(data: ClockSyncData, resid: number[], scale: number, period: number, minute: number): number[] {
  const el = elapsedMinutes(minute, period);
  return data.ratePerMinute.map((r, p) => r * scale * el + resid[p]!);
}

export type ClockSendStep = {
  kind: 'send';
  index: number;
  id: string;
  minute: number;
  src: number;
  dst: number;
  stamp: number;
  rel: number;
  lamport: number;
  offsets: number[];
  skew: number;
  hi: number;
  lo: number;
  maxSkew: number;
};

export type ClockReceiveStep = {
  kind: 'receive';
  index: number;
  id: string;
  minute: number;
  src: number;
  dst: number;
  stamp: number;
  rel: number;
  sendRel: number;
  diff: number;
  lamportSend: number;
  lamportRecv: number;
  inverted: boolean;
  lamportInverted: boolean;
  physicalInverted: number;
  lamportInvertedCount: number;
};

export type ClockRound = {
  steps: (ClockSendStep | ClockReceiveStep)[];
  physicalInverted: number;
  lamportInverted: number;
  maxSkew: number;
};

/** 메시지를 보낸 분 차례로 — 같은 분이 둘이면 던진다. 원래 자리 번호를 함께 돌려준다. */
function sendOrder(data: ClockSyncData): number[] {
  const order = data.messages.map((_, i) => i);
  order.sort((a, b) => data.messages[a]!.sendMinute - data.messages[b]!.sendMinute);
  for (let k = 1; k < order.length; k += 1) {
    const prev = data.messages[order[k - 1]!]!;
    const cur = data.messages[order[k]!]!;
    if (prev.sendMinute === cur.sendMinute) {
      throw new Error(
        `clock-sync: ${prev.id} 와 ${cur.id} 가 같은 분 ${cur.sendMinute} 에 보낸다 — 차례가 정해지지 않는다`,
      );
    }
  }
  return order;
}

/** 한 판 — 배수 scale · 주기 period 로 메시지 열둘을 보낸 분 차례로 돌린다. */
export function clockRound(data: ClockSyncData, scale: number, period: number): ClockRound {
  if (!Number.isInteger(scale) || scale < 0) throw new Error(`clock-sync: 배수 ${scale} 가 0 이상 정수가 아니다`);
  if (!Number.isInteger(period) || period < 0) throw new Error(`clock-sync: 주기 ${period} 가 0 이상 정수가 아니다`);
  const resid = residualOffsets(data);
  const lamport = data.processes.map(() => 0);
  const steps: (ClockSendStep | ClockReceiveStep)[] = [];
  let physicalInverted = 0;
  let lamportInverted = 0;
  let maxSkew = 0;
  for (const i of sendOrder(data)) {
    const m = data.messages[i]!;
    const a = data.processes.indexOf(m.src);
    const b = data.processes.indexOf(m.dst);
    if (a < 0 || b < 0) throw new Error(`clock-sync: ${m.id} 의 프로세스를 모른다`);
    const s = m.sendMinute;
    const offsets = offsetsAt(data, resid, scale, period, s);
    let hi = 0;
    let lo = 0;
    for (let p = 1; p < offsets.length; p += 1) {
      if (offsets[p]! > offsets[hi]!) hi = p;
      if (offsets[p]! < offsets[lo]!) lo = p;
    }
    const skew = offsets[hi]! - offsets[lo]!;
    if (skew > maxSkew) maxSkew = skew;
    const rel = offsets[a]!;
    lamport[a] = lamport[a]! + 1;
    const sent = lamport[a]!;
    steps.push({
      kind: 'send',
      index: i,
      id: m.id,
      minute: s,
      src: a,
      dst: b,
      stamp: s * MINUTE_MS + rel,
      rel,
      lamport: sent,
      offsets,
      skew,
      hi,
      lo,
      maxSkew,
    });
    const recvRel = m.delayMs + offsets[b]!;
    lamport[b] = Math.max(lamport[b]!, sent) + 1;
    const lamportBack = lamport[b]! <= sent;
    if (lamportBack) lamportInverted += 1;
    const inverted = recvRel < rel;
    if (inverted) physicalInverted += 1;
    steps.push({
      kind: 'receive',
      index: i,
      id: m.id,
      minute: s,
      src: a,
      dst: b,
      stamp: s * MINUTE_MS + recvRel,
      rel: recvRel,
      sendRel: rel,
      diff: recvRel - rel,
      lamportSend: sent,
      lamportRecv: lamport[b]!,
      inverted,
      lamportInverted: lamportBack,
      physicalInverted,
      lamportInvertedCount: lamportInverted,
    });
  }
  return { steps, physicalInverted, lamportInverted, maxSkew };
}

/** 마지막 보낸 분 — 톱니 곡선의 끝. */
export function lastMinuteOf(data: ClockSyncData): number {
  return data.messages.reduce((m, x) => Math.max(m, x.sendMinute), 0);
}

/** 톱니 — 프로세스마다 분 0..last 의 (닿기 직전 · 그 분) 어긋남, 다시 맞춘 분. */
export function sawtooth(
  data: ClockSyncData,
  scale: number,
  period: number,
): { before: number[][]; after: number[][]; resyncMinutes: number[] } {
  const resid = residualOffsets(data);
  const last = lastMinuteOf(data);
  const before: number[][] = data.processes.map(() => []);
  const after: number[][] = data.processes.map(() => []);
  const resyncMinutes: number[] = [];
  for (let s = 0; s <= last; s += 1) {
    const now = offsetsAt(data, resid, scale, period, s);
    const synced = s > 0 && period > 0 && s % period === 0;
    if (synced) resyncMinutes.push(s);
    for (let p = 0; p < now.length; p += 1) {
      after[p]!.push(now[p]!);
      before[p]!.push(synced ? data.ratePerMinute[p]! * scale * period + resid[p]! : now[p]!);
    }
  }
  return { before, after, resyncMinutes };
}

export type ClockAxes = {
  offMin: number;
  offMax: number;
  relMin: number;
  relMax: number;
  lamportMax: number;
};

/** 축 — 사다리 전체(배수 × 주기)에서 셈한다. 손잡이를 돌려도 축이 움직이지 않아야 화살표가 옮겨 가는 것이 보인다. */
export function clockAxes(data: ClockSyncData): ClockAxes {
  let offMin = 0;
  let offMax = 0;
  let relMin = 0;
  let relMax = 0;
  let lamportMax = 0;
  for (const scale of data.drifts) {
    for (const period of data.resyncs) {
      const tooth = sawtooth(data, scale, period);
      for (const row of [...tooth.before, ...tooth.after]) {
        for (const v of row) {
          offMin = Math.min(offMin, v);
          offMax = Math.max(offMax, v);
        }
      }
      for (const st of clockRound(data, scale, period).steps) {
        relMin = Math.min(relMin, st.rel);
        relMax = Math.max(relMax, st.rel);
        lamportMax = Math.max(lamportMax, st.kind === 'send' ? st.lamport : st.lamportRecv);
      }
    }
  }
  return { offMin, offMax, relMin, relMax, lamportMax };
}

type Gauges = { set(name: string, value: number): void };

/** 계기 — 지금 값을 들고 차이만 보낸다. 처음 한 번은 차이 0 이어도 보낸다. */
function makeGauges(ctx: FacetContext<unknown>): Gauges {
  const shown = new Map<string, number>();
  return {
    set(name, value) {
      const prev = shown.get(name);
      if (prev === undefined) {
        ctx.metric(name, value);
      } else if (value !== prev) {
        ctx.metric(name, value - prev);
      }
      shown.set(name, value);
    },
  };
}

export async function clockSyncAlgorithm(ctx: FacetContext<ClockSyncData>): Promise<void> {
  const rc = ctx as ReactiveContext<ClockSyncData>;
  const data = narrowClockSyncData(ctx.data);
  const axes = clockAxes(data);
  const resid = residualOffsets(data);
  const gauges = makeGauges(ctx as FacetContext<unknown>);
  const phase = (name: string) => rc.emit({ type: 'phase', payload: { phase: name }, silent: true });
  let drift = data.initialDrift;
  let resync = data.initialResync;

  try {
    await playRounds();
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }

  async function playRounds(): Promise<void> {
    for (;;) {
      if (ctx.cancelled) return;
      // 판 머리 — 계기를 0 으로, 걸음 0 을 새로 짓는다.
      gauges.set('physical-inverted', 0);
      gauges.set('lamport-inverted', 0);
      gauges.set('max-skew-ms', 0);
      const round = clockRound(data, drift, resync);
      const tooth = sawtooth(data, drift, resync);
      await rc.emit({
        type: 'clock-init',
        silent: true,
        payload: {
          drift,
          resync,
          lastMinute: lastMinuteOf(data),
          processes: [...data.processes],
          messages: data.messages.map((m) => ({
            id: m.id,
            src: data.processes.indexOf(m.src),
            dst: data.processes.indexOf(m.dst),
          })),
          before: tooth.before,
          after: tooth.after,
          resyncMinutes: tooth.resyncMinutes,
          offsets: [...resid],
          lamport: data.processes.map(() => 0),
          axes,
        },
      });
      // 걸음 0 의 경계 — 판 머리 운동(톱니 · 커서 되감기)과 캡션 "분 0" 이 첫 보냄에 끊기지 않게 쉰다.
      if (!(await rc.sleep(data.stepMs + CLOCK_SYNC_MOTION_MS))) return;

      for (const st of round.steps) {
        if (ctx.cancelled) return;
        if (st.kind === 'send') {
          gauges.set('max-skew-ms', st.maxSkew);
          await phase('send');
          await rc.emit({
            type: 'clock-send',
            payload: {
              index: st.index,
              id: st.id,
              minute: st.minute,
              src: st.src,
              dst: st.dst,
              stamp: st.stamp,
              rel: st.rel,
              lamport: st.lamport,
              offsets: [...st.offsets],
              skew: st.skew,
              hi: st.hi,
              lo: st.lo,
            },
          });
        } else {
          gauges.set('physical-inverted', st.physicalInverted);
          gauges.set('lamport-inverted', st.lamportInvertedCount);
          if (st.inverted) await phase('inverted');
          else await phase('receive');
          await rc.emit({
            type: 'clock-receive',
            payload: {
              index: st.index,
              id: st.id,
              minute: st.minute,
              src: st.src,
              dst: st.dst,
              stamp: st.stamp,
              rel: st.rel,
              sendRel: st.sendRel,
              diff: st.diff,
              lamportSend: st.lamportSend,
              lamportRecv: st.lamportRecv,
              inverted: st.inverted,
              lamportInverted: st.lamportInverted,
            },
          });
        }
        if (!(await rc.sleep(data.stepMs + CLOCK_SYNC_MOTION_MS))) return;
      }

      // 한 판이 끝났다 — 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (input.type === 'drift') {
          if (typeof value !== 'number' || !data.drifts.includes(value)) {
            throw new Error(`clock-sync: 빠르기 배수 ${String(value)} 는 사다리에 없다`);
          }
          drift = value;
          break;
        }
        if (input.type === 'resync') {
          if (typeof value !== 'number' || !data.resyncs.includes(value)) {
            throw new Error(`clock-sync: 다시 맞춤 주기 ${String(value)} 는 사다리에 없다`);
          }
          resync = value;
          break;
        }
      }
    }
  }
}
