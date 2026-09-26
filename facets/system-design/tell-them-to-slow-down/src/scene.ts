/**
 * 배압 장면 — 알고리즘이 셈한 틱을 잇기만 한다.
 *
 * 바탕: 통 식별자 · 자리 수 · 처리 틱 · 마지막 틱(silent init)
 * 자취: 보내는 쪽에 남은 통 · 크레딧 · 받는 쪽이 쥔 통 · 처리 중 · 끝난 통 · 보낸 기록 · 멈춘 틱
 * 이번 걸음: 무엇이 돌아왔고 무엇이 나갔고 무엇이 처리에 들었는가, 그리고 그 운동의 출발 자리
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowTellThemToSlowDownData } from './algorithm.js';

export type SlowDownStep =
  | { kind: 'start' }
  | {
      kind: 'tick';
      tick: number;
      /** 처리가 끝나 자리를 비운 통 (맨 앞 자리에서 떠났다) */
      returned: string | null;
      /** 보낸 통 */
      sent: string | null;
      waited: boolean;
      /** 처리를 시작한 통과, 이 틱이 오기 전 그 통이 앉아 있던 자리 (같은 틱에 들어왔으면 null) */
      started: string | null;
      startedFromSeat: number | null;
      /** 돌아온 크레딧이 앉는 · 나가는 크레딧이 떠나는 지갑 칸 */
      walletSlot: number | null;
    };

export type SlowDownScene = {
  messages: string[];
  seats: number;
  serviceTicks: number;
  lastTick: number | null;
  tick: number | null;
  pending: string[];
  credits: number;
  held: string[];
  busy: { id: string; startedAt: number; endsAt: number } | null;
  done: string[];
  sends: { id: string; tick: number; gap: number | null }[];
  waits: number[];
  step: SlowDownStep;
};

function fail(msg: string): never {
  throw new Error(`tellThemToSlowDownScene: ${msg}`);
}

function readId(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  if (v === null) return null;
  if (typeof v !== 'string') fail(`payload.${key} 가 문자열 · null 이 아니다`);
  return v;
}

function readNum(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`payload.${key} 가 정수가 아니다`);
  return v;
}

function readNumOrNull(p: Record<string, unknown>, key: string): number | null {
  const v = p[key];
  if (v === null) return null;
  return readNum(p, key);
}

export const tellThemToSlowDownScene: ScenePlan<SlowDownScene> = {
  initial(initialData: unknown): SlowDownScene {
    const d = narrowTellThemToSlowDownData(initialData);
    return {
      messages: [...d.messages],
      seats: d.seats,
      serviceTicks: d.serviceTicks,
      lastTick: null,
      tick: null,
      pending: [...d.messages],
      // 자리 수만큼의 크레딧을 보내는 쪽이 쥐고 시작한다 — 모형의 정의다
      credits: d.seats,
      held: [],
      busy: null,
      done: [],
      sends: [],
      waits: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: SlowDownScene, event: FacetRuntimeEvent): SlowDownScene {
    const raw = event.payload;
    if (typeof raw !== 'object' || raw === null) fail(`${event.type} 의 payload 가 객체가 아니다`);
    const p = raw as Record<string, unknown>;

    switch (event.type) {
      case 'init': {
        const lastTick = readNum(p, 'lastTick');
        if (lastTick < 0) fail('payload.lastTick 가 음수다');
        return { ...scene, lastTick, step: { kind: 'start' } };
      }
      case 'tick': {
        const tick = readNum(p, 'tick');
        const expected = scene.tick === null ? 0 : scene.tick + 1;
        if (tick !== expected) fail(`payload.tick ${tick} 가 이어지지 않는다 (기대 ${expected})`);

        const returned = readId(p, 'returned');
        const sent = readId(p, 'sent');
        const gap = readNumOrNull(p, 'gap');
        const started = readId(p, 'started');
        const endsAt = readNumOrNull(p, 'endsAt');
        if (typeof p.waited !== 'boolean') fail('payload.waited 가 참거짓이 아니다');
        const waited = p.waited;

        let pending = [...scene.pending];
        let held = [...scene.held];
        let credits = scene.credits;
        let busy = scene.busy;
        const done = [...scene.done];
        const sends = [...scene.sends];
        const waits = [...scene.waits];
        let walletSlot: number | null = null;

        // ① 돌아옴
        if (returned !== null) {
          if (busy === null || busy.id !== returned) fail(`payload.returned ${returned} 가 처리 중인 통이 아니다`);
          if (busy.endsAt !== tick) fail(`payload.returned ${returned} 의 끝날 틱은 ${busy.endsAt} 이다`);
          if (held[0] !== returned) fail(`payload.returned ${returned} 가 맨 앞 자리에 없다`);
          held = held.slice(1);
          done.push(returned);
          credits += 1;
          busy = null;
          walletSlot = credits - 1;
        }
        // ② 보냄 · 멈춤
        if (sent !== null) {
          if (waited) fail('payload 가 보냄과 멈춤을 함께 말한다');
          if (pending[0] !== sent) fail(`payload.sent ${sent} 가 보내는 쪽 맨 앞 통이 아니다`);
          if (credits <= 0) fail(`payload.sent ${sent} 를 보낼 크레딧이 없다`);
          const prevSend = sends[sends.length - 1];
          const expectGap = prevSend === undefined ? null : tick - prevSend.tick;
          if (gap !== expectGap) fail(`payload.gap ${String(gap)} 가 보낸 기록과 맞지 않다`);
          walletSlot = credits - 1;
          pending = pending.slice(1);
          credits -= 1;
          held = [...held, sent];
          sends.push({ id: sent, tick, gap });
        } else if (waited) {
          if (pending.length === 0) fail('payload.waited 인데 보낼 통이 없다');
          if (credits !== 0) fail('payload.waited 인데 크레딧이 남았다');
          waits.push(tick);
        }
        // ③ 처리 시작
        let startedFromSeat: number | null = null;
        if (started !== null) {
          if (busy !== null) fail(`payload.started ${started} — 받는 쪽이 이미 ${busy.id} 를 처리 중이다`);
          if (held[0] !== started) fail(`payload.started ${started} 가 맨 앞 자리에 없다`);
          if (endsAt === null || endsAt <= tick) fail('payload.endsAt 가 없거나 지난 틱이다');
          const before = scene.held.indexOf(started);
          startedFromSeat = before < 0 ? null : before;
          busy = { id: started, startedAt: tick, endsAt };
        }

        if (credits + held.length !== scene.seats) {
          fail(`틱 ${tick} 크레딧 ${credits} + 쥔 통 ${held.length} ≠ 자리 ${scene.seats}`);
        }
        const heldEcho = p.held;
        if (
          readNum(p, 'credits') !== credits ||
          !Array.isArray(heldEcho) ||
          heldEcho.length !== held.length ||
          heldEcho.some((h, i) => h !== held[i])
        ) {
          fail(`틱 ${tick} 이어 붙인 크레딧 · 쥔 통이 payload.credits · payload.held 와 다르다`);
        }

        return {
          ...scene,
          tick,
          pending,
          credits,
          held,
          busy,
          done,
          sends,
          waits,
          step: { kind: 'tick', tick, returned, sent, waited, started, startedFromSeat, walletSlot },
        };
      }
      default:
        return fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
