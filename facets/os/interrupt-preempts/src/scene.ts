import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readInterruptPreemptsData, type InterruptPreemptsHandlerOp } from './algorithm';

export type InterruptSeg = 'program' | 'handler';

/** 실행 자리 — 어느 쪽의 몇째 명령인가 */
export interface InterruptPos {
  seg: InterruptSeg;
  index: number;
}

/** 실행을 마친 명령과 그 시각 */
export interface InterruptRan extends InterruptPos {
  from: number;
  to: number;
}

/** 실행 자리가 건너간 자취 */
export interface InterruptJump {
  kind: 'out' | 'back';
  from: InterruptPos;
  to: InterruptPos;
}

export type InterruptStep =
  | { kind: 'run'; seg: InterruptSeg; index: number; from: number; to: number; call: number | null; was: InterruptPos }
  | { kind: 'accept'; at: number; calledAt: number; wait: number; returnTo: number; was: InterruptPos }
  | { kind: 'return'; at: number; to: number; was: InterruptPos; saved: number };

export interface InterruptPreemptsScene {
  // 바탕
  program: string[];
  handler: InterruptPreemptsHandlerOp[];
  device: 'keyboard';
  // 자취
  t: number;
  at: InterruptPos;
  ran: InterruptRan[];
  /** 부름이 온 시각과 그때 실행 중이던 명령 */
  call: { at: number; index: number } | null;
  /** 부름을 받은 경계와 기다린 몫 */
  accepted: { at: number; wait: number } | null;
  /** 적어 둔 돌아올 자리 (프로그램 명령 번호). 돌아오면 비운다 */
  saved: number | null;
  jumps: InterruptJump[];
  finish: { end: number; plain: number; delay: number } | null;
  // 이번 걸음
  step: InterruptStep | null;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`interrupt-preempts: ${type} 이벤트의 ${key} 가 수가 아니다`);
  }
  return v;
}

function record(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`interrupt-preempts: ${event.type} 이벤트에 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

export const interruptPreemptsScene: ScenePlan<InterruptPreemptsScene> = {
  initial(initialData: unknown): InterruptPreemptsScene {
    const data = readInterruptPreemptsData(initialData);
    return {
      program: [...data.program],
      handler: [...data.handler],
      device: data.device,
      t: 0,
      at: { seg: 'program', index: 0 },
      ran: [],
      call: null,
      accepted: null,
      saved: null,
      jumps: [],
      finish: null,
      step: null,
    };
  },

  reduce(scene: InterruptPreemptsScene, event: FacetRuntimeEvent): InterruptPreemptsScene {
    if (event.type === 'run') {
      const p = record(event);
      const seg = p['seg'];
      if (seg !== 'program' && seg !== 'handler') {
        throw new Error(`interrupt-preempts: run 이벤트의 seg ${String(seg)} 를 모른다`);
      }
      const index = num(p, 'index', 'run');
      const from = num(p, 'from', 'run');
      const to = num(p, 'to', 'run');
      const rawCall = p['call'];
      let call: number | null = null;
      if (rawCall !== null) {
        if (typeof rawCall !== 'number') throw new Error('interrupt-preempts: run 이벤트의 call 이 수가 아니다');
        call = rawCall;
      }
      const rawFinish = p['finish'];
      let finish: InterruptPreemptsScene['finish'] = null;
      if (rawFinish !== null) {
        if (typeof rawFinish !== 'object' || rawFinish === undefined) {
          throw new Error('interrupt-preempts: run 이벤트의 finish 모양을 모른다');
        }
        const f = rawFinish as Record<string, unknown>;
        finish = { end: num(f, 'end', 'run'), plain: num(f, 'plain', 'run'), delay: num(f, 'delay', 'run') };
      }
      const was = { ...scene.at };
      return {
        ...scene,
        t: to,
        at: { seg, index },
        ran: [...scene.ran, { seg, index, from, to }],
        call: call === null ? scene.call : { at: call, index },
        finish: finish ?? scene.finish,
        step: { kind: 'run', seg, index, from, to, call, was },
      };
    }
    if (event.type === 'accept') {
      const p = record(event);
      const at = num(p, 'at', 'accept');
      const calledAt = num(p, 'calledAt', 'accept');
      const wait = num(p, 'wait', 'accept');
      const returnTo = num(p, 'returnTo', 'accept');
      const from = num(p, 'from', 'accept');
      const src: InterruptPos = { seg: 'program', index: from };
      const dst: InterruptPos = { seg: 'handler', index: 0 };
      return {
        ...scene,
        t: at,
        at: dst,
        accepted: { at, wait },
        saved: returnTo,
        jumps: [...scene.jumps, { kind: 'out', from: src, to: dst }],
        step: { kind: 'accept', at, calledAt, wait, returnTo, was: { ...scene.at } },
      };
    }
    if (event.type === 'return') {
      const p = record(event);
      const at = num(p, 'at', 'return');
      const to = num(p, 'to', 'return');
      const from = num(p, 'from', 'return');
      if (scene.saved === null) throw new Error('interrupt-preempts: 적어 둔 돌아올 자리 없이 돌아간다');
      const src: InterruptPos = { seg: 'handler', index: from };
      const dst: InterruptPos = { seg: 'program', index: to };
      return {
        ...scene,
        t: at,
        at: dst,
        saved: null,
        jumps: [...scene.jumps, { kind: 'back', from: src, to: dst }],
        step: { kind: 'return', at, to, was: { ...scene.at }, saved: scene.saved },
      };
    }
    return scene;
  },
};
