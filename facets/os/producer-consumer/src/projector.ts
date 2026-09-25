/**
 * producer-consumer projector — `round` · `tick` 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * 셈은 하지 않는다. 캡션의 수(틱 번호 · 물건 번호 · 끝 틱 · 안 찬 칸 수)는 payload 에 온 값 그대로다.
 * 운동 길이는 걸음마다 `runtime.getSpeed()` 를 읽어 정한다 — 1 배속에서 300ms.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { ProducerConsumerStage, RoundView, TickView } from './producer-consumer-stage.js';

const MOTION_MS = 300;

type Obj = Record<string, unknown>;

function asObj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null) throw new Error(`${what}: payload 가 객체가 아니다`);
  return v as Obj;
}
function num(p: Obj, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}
function bool(p: Obj, key: string): boolean {
  const v = p[key];
  if (typeof v !== 'boolean') throw new Error(`payload.${key} 가 참거짓이 아니다`);
  return v;
}
function str(p: Obj, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`payload.${key} 가 글자가 아니다`);
  return v;
}
function nums(p: Obj, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`payload.${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'number') throw new Error(`payload.${key} 에 수가 아닌 원소`);
    return x;
  });
}
function consumerAct(v: string): TickView['cAct'] {
  if (v === 'blocked' || v === 'asleep' || v === 'use' || v === 'take') return v;
  throw new Error(`모르는 꺼내는 쪽 일: ${v}`);
}
function producerAct(v: string): TickView['pAct'] {
  if (v === 'blocked' || v === 'asleep' || v === 'put' || v === 'idle') return v;
  throw new Error(`모르는 넣는 쪽 일: ${v}`);
}

export const producerConsumerProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ProducerConsumerStage | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  let names = { producer: '', consumer: '', empty: '', full: '' };

  const onRound = async (p: Obj): Promise<void> => {
    const round: RoundView = {
      slots: num(p, 'slots'),
      ticks: num(p, 'ticks'),
      empty: num(p, 'empty'),
      full: num(p, 'full'),
      producer: str(p, 'producer'),
      consumer: str(p, 'consumer'),
      emptyName: str(p, 'emptyName'),
      fullName: str(p, 'fullName'),
    };
    names = { producer: round.producer, consumer: round.consumer, empty: round.emptyName, full: round.fullName };
    stage?.setCaption(t('caption.slots', 'Slots: {c}', { c: round.slots }), '', '');
    await stage?.beginRound(round, motion());
  };

  const onTick = async (p: Obj): Promise<void> => {
    const k: TickView = {
      tick: num(p, 'tick'),
      made: nums(p, 'made'),
      cAct: consumerAct(str(p, 'cAct')),
      cItem: num(p, 'cItem'),
      cGranted: bool(p, 'cGranted'),
      cHandoff: bool(p, 'cHandoff'),
      pAct: producerAct(str(p, 'pAct')),
      pItem: num(p, 'pItem'),
      pGranted: bool(p, 'pGranted'),
      pHandoff: bool(p, 'pHandoff'),
      cLines: nums(p, 'cLines'),
      pLines: nums(p, 'pLines'),
      midBuffer: nums(p, 'midBuffer'),
      midEmpty: num(p, 'midEmpty'),
      midFull: num(p, 'midFull'),
      hand: nums(p, 'hand'),
      buffer: nums(p, 'buffer'),
      inUse: num(p, 'inUse'),
      empty: num(p, 'empty'),
      full: num(p, 'full'),
      pAsleep: bool(p, 'pAsleep'),
      cAsleep: bool(p, 'cAsleep'),
      pHolds: bool(p, 'pHolds'),
      cHolds: bool(p, 'cHolds'),
      last: bool(p, 'last'),
      neverFilled: num(p, 'neverFilled'),
    };
    const doneTick = num(p, 'doneTick');
    const C = names.consumer;
    const P = names.producer;

    const parts: string[] = [];
    for (const i of k.made) parts.push(t('work.made', 'Made item {i}', { i }));
    if (k.cAct === 'blocked') parts.push(t('work.blocked', '{who}: acquire({sem}) blocked, asleep', { who: C, sem: names.full }));
    else if (k.cAct === 'asleep') parts.push(t('work.asleep', '{who}: still asleep', { who: C }));
    else if (k.cAct === 'use') parts.push(t('work.use', '{who}: use()', { who: C }));
    else {
      parts.push(t('work.take', '{who}: took item {i}', { who: C, i: k.cItem }));
      if (k.cHandoff) parts.push(t('work.handoff', 'release({sem}) hands the permit to {to}', { sem: names.empty, to: P }));
    }
    if (k.pAct === 'blocked') parts.push(t('work.blocked', '{who}: acquire({sem}) blocked, asleep', { who: P, sem: names.empty }));
    else if (k.pAct === 'asleep') parts.push(t('work.asleep', '{who}: still asleep', { who: P }));
    else if (k.pAct === 'idle') parts.push(t('work.idle', '{who}: nothing in hand', { who: P }));
    else {
      parts.push(t('work.put', '{who}: put item {i}', { who: P, i: k.pItem }));
      if (k.pHandoff) parts.push(t('work.handoff', 'release({sem}) hands the permit to {to}', { sem: names.full, to: C }));
    }

    let done = '';
    if (k.last) {
      if (doneTick < 0 || k.neverFilled < 0) throw new Error('끝 걸음에 끝 틱 · 안 찬 칸 수가 없다');
      done = `${t('caption.done', 'Done at tick {n}', { n: doneTick })} · ${t('caption.neverFilled', 'Never-filled slots: {n}', { n: k.neverFilled })}`;
    }
    stage?.setCaption(t('caption.tick', 'Tick {n}', { n: k.tick }), parts.join(' · '), done);
    await stage?.playTick(k, motion());
  };

  return {
    async onEvent(e: FacetRuntimeEvent): Promise<void> {
      if (e.type === 'round') await onRound(asObj(e.payload, 'round'));
      else if (e.type === 'tick') await onTick(asObj(e.payload, 'tick'));
    },
    onReset(): void {
      stage?.clearAll();
    },
  };
};
