/**
 * 장면 — 두 CPU 에 틱마다 쌓인 일.
 *
 * 바탕: `slots` (쌓일 칸 수, 알고리즘의 silent `init` 이 정한다)
 * 자취: `rows` (지나간 틱마다 장치 상태와 두 CPU 가 한 일) · `pollDone` · `intrDone`
 * 이번 걸음: `step` (방금 지난 틱. 걸음 0 이면 null)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { IntrWork, PollWork } from './algorithm.js';

export type TickRow = {
  tick: number;
  ready: boolean;
  poll: PollWork | null;
  intr: IntrWork | null;
};

export type PollingVsInterruptScene = {
  slots: number;
  rows: TickRow[];
  pollDone: number | null;
  intrDone: number | null;
  step: TickRow | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readPoll(v: unknown): PollWork | null {
  if (v === null) return null;
  if (v === 'no' || v === 'yes' || v === 'take') return v;
  throw new Error(`polling-vs-interrupt 장면: 모르는 폴링 일 ${String(v)}`);
}

function readIntr(v: unknown): IntrWork | null {
  if (v === null) return null;
  if (v === 'other' || v === 'enter' || v === 'take') return v;
  throw new Error(`polling-vs-interrupt 장면: 모르는 인터럽트 일 ${String(v)}`);
}

function readDone(v: unknown): number | null {
  if (v === null) return null;
  if (typeof v === 'number') return v;
  throw new Error(`polling-vs-interrupt 장면: 끝 시각이 수가 아니다 ${String(v)}`);
}

export const pollingVsInterruptScene: ScenePlan<PollingVsInterruptScene> = {
  initial(): PollingVsInterruptScene {
    return { slots: 0, rows: [], pollDone: null, intrDone: null, step: null };
  },

  reduce(scene, event: FacetRuntimeEvent): PollingVsInterruptScene {
    const p = event.payload;
    if (event.type === 'init') {
      if (!isRecord(p) || typeof p.slots !== 'number') {
        throw new Error('polling-vs-interrupt 장면: init 에 slots 가 없다');
      }
      return { ...scene, slots: p.slots, step: null };
    }
    if (event.type === 'tick') {
      if (!isRecord(p) || typeof p.tick !== 'number' || typeof p.ready !== 'boolean') {
        throw new Error('polling-vs-interrupt 장면: tick 의 모양이 틀렸다');
      }
      const row: TickRow = {
        tick: p.tick,
        ready: p.ready,
        poll: readPoll(p.poll),
        intr: readIntr(p.intr),
      };
      const pollDone = readDone(p.pollDone);
      const intrDone = readDone(p.intrDone);
      return {
        slots: scene.slots,
        rows: [...scene.rows, row],
        pollDone: pollDone ?? scene.pollDone,
        intrDone: intrDone ?? scene.intrDone,
        step: row,
      };
    }
    return scene;
  },
};
