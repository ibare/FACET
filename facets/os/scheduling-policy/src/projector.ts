/**
 * CPU 스케줄 정책 projector — round · step · phase 를 stage 와 코드 패널로 옮긴다.
 *
 * payload 는 typeof 로 읽고, 모양이 다르면 던진다 (지어내지 않는다).
 * 운동 길이는 재생 속도를 그때그때 읽어 셈한다.
 */
import { type ProjectorFactory } from '@ffacet/core/runtime';
import type { SchedulingPolicyStage, StageEvent, StageProc, StageRound, StageStep } from './scheduling-policy-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

/** 운동 상한 (재생 속도 1 에서) — 사양의 400ms 안 */
const MOTION_MS = 380;

const EVENT_KINDS = ['finish', 'arrive', 'demote', 'preempt', 'dispatch'] as const;

function rec(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`scheduling-policy: ${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function num(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number') throw new Error(`scheduling-policy: '${key}' 가 수가 아니다`);
  return v;
}
function nums(o: Record<string, unknown>, key: string): number[] {
  return list(o, key).map((x) => {
    if (typeof x !== 'number') throw new Error(`scheduling-policy: '${key}' 에 수가 아닌 것이 있다`);
    return x;
  });
}
function list(o: Record<string, unknown>, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`scheduling-policy: '${key}' 가 배열이 아니다`);
  return v;
}

export const schedulingPolicyProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SchedulingPolicyStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  let policies: string[] = [];
  let workloads: string[] = [];
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  const showPhase = (payload: unknown): void => {
    const p = rec(payload, 'phase payload').phase;
    if (typeof p !== 'string') throw new Error('scheduling-policy: phase 가 글자가 아니다');
    code?.highlightPhase?.(p);
  };

  const beginRound = (payload: unknown): void => {
    const p = rec(payload, 'round payload');
    const policy = policies[num(p, 'policy')];
    const workload = workloads[num(p, 'workload')];
    if (policy === undefined || workload === undefined) throw new Error('scheduling-policy: 사다리 밖의 판');
    const procs: StageProc[] = list(p, 'procs').map((x) => {
      const o = rec(x, '프로세스');
      if (typeof o.id !== 'string') throw new Error('scheduling-policy: 프로세스 식별자가 글자가 아니다');
      return { id: o.id, arrive: num(o, 'arrive'), burst: num(o, 'burst') };
    });
    if (typeof p.mlfq !== 'boolean') throw new Error('scheduling-policy: mlfq 가 참거짓이 아니다');
    const round: StageRound = {
      policy: policy.toUpperCase(),
      workload,
      procs,
      quanta: nums(p, 'quanta'),
      mlfq: p.mlfq,
    };
    stage?.beginRound(round, motion());
  };

  const showStep = async (payload: unknown): Promise<void> => {
    const p = rec(payload, 'step payload');
    if (typeof p.last !== 'boolean') throw new Error('scheduling-policy: last 가 참거짓이 아니다');
    const events: StageEvent[] = list(p, 'events').map((x) => {
      const o = rec(x, '사건');
      const kind = EVENT_KINDS.find((k) => k === o.kind);
      if (!kind) throw new Error(`scheduling-policy: 모르는 사건 '${String(o.kind)}'`);
      return {
        kind,
        proc: num(o, 'proc'),
        fromLevel: num(o, 'fromLevel'),
        toLevel: num(o, 'toLevel'),
        left: num(o, 'left'),
        by: num(o, 'by'),
        byLeft: num(o, 'byLeft'),
      };
    });
    let run: StageStep['run'] = null;
    if (p.run !== null) {
      const r = rec(p.run, 'run');
      run = { proc: num(r, 'proc'), from: num(r, 'from'), to: num(r, 'to') };
    }
    const step: StageStep = {
      last: p.last,
      from: num(p, 'from'),
      to: num(p, 'to'),
      events,
      run,
      queue: nums(p, 'queue'),
      levels: nums(p, 'levels'),
      running: num(p, 'running'),
      done: nums(p, 'done'),
      waits: nums(p, 'waits'),
      totalWait: num(p, 'totalWait'),
    };
    await stage?.showStep(step, motion());
  };

  return {
    onInit(data: unknown) {
      const d = rec(data, 'initialData');
      policies = list(d, 'policies').map((p) => {
        if (typeof p !== 'string') throw new Error('scheduling-policy: 정책 이름이 글자가 아니다');
        return p;
      });
      workloads = list(d, 'workloads').map((w) => {
        const id = rec(w, '일감').id;
        if (typeof id !== 'string') throw new Error('scheduling-policy: 일감 식별자가 글자가 아니다');
        return id;
      });
    },
    async onEvent(e) {
      switch (e.type) {
        case 'phase':
          showPhase(e.payload);
          return;
        case 'round':
          beginRound(e.payload);
          return;
        case 'step':
          await showStep(e.payload);
          return;
        default:
          return;
      }
    },
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
  };
};
