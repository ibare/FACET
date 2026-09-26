/**
 * 반열림 시험 부름의 장면.
 *
 * 바탕   calls (부름이 오는 시각) · end (화면에 오를 가장 늦은 시각, init 이 채운다)
 * 자취   phases (상태가 이어진 구간) · fates (온 부름마다 어떻게 되었나) · inFlight · recoveredAt
 * 이번 걸음 step — 운동이 출발할 시각(from)과 앞 상태(was)를 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowHalfOpenProbe } from './algorithm.js';
import type { BreakerState } from './algorithm.js';

export type Phase = {
  state: BreakerState;
  from: number;
  /** 열림 구간이면 반열림 예정 시각. 나머지는 null */
  until: number | null;
};

export type CallMark =
  | { kind: 'blocked'; t: number; why: 'open' | 'trial' }
  | { kind: 'trial'; t: number; result: 'ok' | 'fail' | null; answerAt: number | null }
  | { kind: 'sent'; t: number; result: 'ok'; answerAt: number };

export type HalfOpenStep =
  | { kind: 'call'; index: number; from: number; was: BreakerState }
  | { kind: 'halfOpen'; from: number; was: BreakerState }
  | { kind: 'answer'; index: number; from: number; was: BreakerState }
  | { kind: 'recover'; from: number; was: BreakerState };

export type HalfOpenScene = {
  calls: number[];
  end: number | null;
  now: number | null;
  state: BreakerState | null;
  alive: boolean | null;
  phases: Phase[];
  marks: CallMark[];
  inFlight: number | null;
  recoveredAt: number | null;
  step: HalfOpenStep | null;
};

function fail(msg: string): never {
  throw new Error(`halfOpenProbeScene: ${msg}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload 가 없다`);
  return p as Record<string, unknown>;
}

function numField(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${type}.payload.${key} 가 수가 아니다`);
  return v;
}

/** 장면이 이미 init 을 받았는지 — 받지 않았으면 걸음 사건은 어휘가 어긋난 것이다. */
function ready(scene: HalfOpenScene, type: string): { now: number; state: BreakerState } {
  if (scene.now === null || scene.state === null) fail(`init 전에 ${type} 가 왔다`);
  return { now: scene.now, state: scene.state };
}

function checkTime(t: number, now: number, type: string): void {
  if (t < now) fail(`${type}.payload.t (${t}) 가 지금 시각 ${now} 보다 이르다`);
}

export const halfOpenProbeScene: ScenePlan<HalfOpenScene> = {
  initial(initialData: unknown): HalfOpenScene {
    const data = narrowHalfOpenProbe(initialData);
    return {
      calls: [...data.calls],
      end: null,
      now: null,
      state: null,
      alive: null,
      phases: [],
      marks: [],
      inFlight: null,
      recoveredAt: null,
      step: null,
    };
  },

  reduce(scene: HalfOpenScene, event: FacetRuntimeEvent): HalfOpenScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const t = numField(p, 't', 'init');
        const halfOpenAt = numField(p, 'halfOpenAt', 'init');
        const end = numField(p, 'end', 'init');
        if (p.state !== 'open') fail(`init.payload.state 는 open 이어야 한다 (${String(p.state)})`);
        if (p.alive !== false) fail('init.payload.alive 는 false 여야 한다');
        if (halfOpenAt <= t) fail('init.payload.halfOpenAt 이 열린 시각보다 이르다');
        const last = scene.calls[scene.calls.length - 1];
        if (last === undefined || end < last) fail('init.payload.end 가 마지막 부름보다 이르다');
        return {
          ...scene,
          end,
          now: t,
          state: 'open',
          alive: false,
          phases: [{ state: 'open', from: t, until: halfOpenAt }],
          marks: [],
          inFlight: null,
          recoveredAt: null,
          step: null,
        };
      }

      case 'call': {
        const { now, state } = ready(scene, 'call');
        const p = payloadOf(event);
        const index = numField(p, 'index', 'call');
        const t = numField(p, 't', 'call');
        checkTime(t, now, 'call');
        if (index !== scene.marks.length) fail(`call.payload.index (${index}) 가 온 차례 ${scene.marks.length} 와 다르다`);
        const at = scene.calls[index];
        if (at === undefined) fail(`call.payload.index (${index}) 가 부름 목록에 없다`);
        if (at !== t) fail(`call.payload.t (${t}) 가 부름 ${index} 의 시각 ${at} 과 다르다`);
        const step: HalfOpenStep = { kind: 'call', index, from: now, was: state };
        let mark: CallMark;
        let inFlight = scene.inFlight;
        switch (p.fate) {
          case 'blocked-open':
            if (state !== 'open') fail(`call.payload.fate blocked-open 인데 상태가 ${state}`);
            mark = { kind: 'blocked', t, why: 'open' };
            break;
          case 'blocked-trial':
            if (state !== 'half_open' || inFlight === null) fail('call.payload.fate blocked-trial 인데 나가 있는 시험 부름이 없다');
            mark = { kind: 'blocked', t, why: 'trial' };
            break;
          case 'trial':
            if (state !== 'half_open' || inFlight !== null) fail('call.payload.fate trial 인데 반열림이 아니거나 이미 나가 있다');
            mark = { kind: 'trial', t, result: null, answerAt: null };
            inFlight = index;
            break;
          case 'sent': {
            if (state !== 'closed') fail(`call.payload.fate sent 인데 상태가 ${state}`);
            if (p.result !== 'ok') fail('call.payload.result 가 ok 가 아니다');
            const answerAt = numField(p, 'answerAt', 'call');
            if (answerAt <= t) fail('call.payload.answerAt 이 보낸 시각보다 이르다');
            mark = { kind: 'sent', t, result: 'ok', answerAt };
            break;
          }
          default:
            fail(`call.payload.fate 를 모른다 (${String(p.fate)})`);
        }
        return { ...scene, now: t, marks: [...scene.marks, mark], inFlight, step };
      }

      case 'halfOpen': {
        const { now, state } = ready(scene, 'halfOpen');
        const t = numField(payloadOf(event), 't', 'halfOpen');
        checkTime(t, now, 'halfOpen');
        const cur = scene.phases[scene.phases.length - 1];
        if (state !== 'open' || !cur || cur.state !== 'open') fail(`halfOpen 인데 상태가 ${state}`);
        if (cur.until !== t) fail(`halfOpen.payload.t (${t}) 가 반열림 예정 시각 ${String(cur.until)} 과 다르다`);
        return {
          ...scene,
          now: t,
          state: 'half_open',
          phases: [...scene.phases, { state: 'half_open', from: t, until: null }],
          step: { kind: 'halfOpen', from: now, was: state },
        };
      }

      case 'answer': {
        const { now, state } = ready(scene, 'answer');
        const p = payloadOf(event);
        const index = numField(p, 'index', 'answer');
        const t = numField(p, 't', 'answer');
        checkTime(t, now, 'answer');
        if (state !== 'half_open') fail(`answer 인데 상태가 ${state}`);
        if (scene.inFlight !== index) fail(`answer.payload.index (${index}) 가 나가 있는 부름 ${String(scene.inFlight)} 과 다르다`);
        const was = scene.marks[index];
        if (!was || was.kind !== 'trial' || was.result !== null) fail(`answer.payload.index (${index}) 가 답을 기다리는 시험 부름이 아니다`);
        let phase: Phase;
        let result: 'ok' | 'fail';
        if (p.result === 'ok') {
          if (p.state !== 'closed') fail('answer.payload.state 는 ok 뒤 closed 여야 한다');
          result = 'ok';
          phase = { state: 'closed', from: t, until: null };
        } else if (p.result === 'fail') {
          if (p.state !== 'open') fail('answer.payload.state 는 fail 뒤 open 이어야 한다');
          const halfOpenAt = numField(p, 'halfOpenAt', 'answer');
          if (halfOpenAt <= t) fail('answer.payload.halfOpenAt 이 답 시각보다 이르다');
          result = 'fail';
          phase = { state: 'open', from: t, until: halfOpenAt };
        } else {
          fail(`answer.payload.result 를 모른다 (${String(p.result)})`);
        }
        const marks = scene.marks.map((m, i) => (i === index ? { ...was, result, answerAt: t } : m));
        return {
          ...scene,
          now: t,
          state: phase.state,
          phases: [...scene.phases, phase],
          marks,
          inFlight: null,
          step: { kind: 'answer', index, from: now, was: state },
        };
      }

      case 'recover': {
        const { now, state } = ready(scene, 'recover');
        const t = numField(payloadOf(event), 't', 'recover');
        checkTime(t, now, 'recover');
        if (scene.alive !== false) fail('recover 인데 서비스가 이미 살아 있다');
        return { ...scene, now: t, alive: true, recoveredAt: t, step: { kind: 'recover', from: now, was: state } };
      }

      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
