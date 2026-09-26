/**
 * microtask-cuts-in 의 장면.
 *
 * 바탕  코드 6 줄 (initialData 에서 그대로).
 * 자취  출력 줄(output) · 태스크 줄(taskQueue) · 마이크로태스크 줄(microQueue) ·
 *       약속에 걸려 아직 줄에 서지 않은 콜백(waiting).
 * 이번 걸음  이 걸음에 무엇이 일어났는가 — 문안 대신 종류와 인자만 담는다.
 */
import type { ScenePlan } from '@ffacet/core/runtime';

export type MicrotaskCutsInWaiting = { readonly id: string; readonly after: string; readonly line: number };

export type MicrotaskCutsInStep =
  | { readonly kind: 'init' }
  | { readonly kind: 'log'; readonly id: string; readonly lines: readonly number[] }
  | { readonly kind: 'scheduleTimer'; readonly id: string; readonly lines: readonly number[] }
  | {
      readonly kind: 'scheduleChain';
      readonly first: string;
      readonly firstLine: number;
      readonly waiting: readonly MicrotaskCutsInWaiting[];
      readonly lines: readonly number[];
    }
  | { readonly kind: 'runMicrotask'; readonly id: string; readonly line: number; readonly promoted: readonly string[] }
  | { readonly kind: 'runTask'; readonly id: string; readonly line: number };

export type MicrotaskCutsInScene = {
  readonly code: readonly string[];
  readonly output: readonly string[];
  readonly taskQueue: readonly string[];
  readonly microQueue: readonly string[];
  readonly waiting: readonly MicrotaskCutsInWaiting[];
  readonly step: MicrotaskCutsInStep;
};

function asCode(v: unknown): string[] {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  throw new Error('microtaskCutsInScene: initialData.code 가 문자열 배열이 아니다');
}

function asRecord(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`microtaskCutsInScene: ${where} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function asString(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Error(`microtaskCutsInScene: ${where} 가 문자열이 아니다`);
  return v;
}

function asNumber(v: unknown, where: string): number {
  if (typeof v !== 'number') throw new Error(`microtaskCutsInScene: ${where} 가 수가 아니다`);
  return v;
}

function asNumberArray(v: unknown, where: string): number[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number')) {
    throw new Error(`microtaskCutsInScene: ${where} 가 수 배열이 아니다`);
  }
  return v as number[];
}

function asWaitingArray(v: unknown, where: string): MicrotaskCutsInWaiting[] {
  if (!Array.isArray(v)) throw new Error(`microtaskCutsInScene: ${where} 가 배열이 아니다`);
  return v.map((raw, i) => {
    const rec = asRecord(raw, `${where}[${i}]`);
    return {
      id: asString(rec.id, `${where}[${i}].id`),
      after: asString(rec.after, `${where}[${i}].after`),
      line: asNumber(rec.line, `${where}[${i}].line`),
    };
  });
}

function asStringArray(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) {
    throw new Error(`microtaskCutsInScene: ${where} 가 문자열 배열이 아니다`);
  }
  return v as string[];
}

export const microtaskCutsInScene: ScenePlan<MicrotaskCutsInScene> = {
  initial(initialData) {
    const rec = asRecord(initialData, 'initialData');
    return {
      code: asCode(rec.code),
      output: [],
      taskQueue: [],
      microQueue: [],
      waiting: [],
      step: { kind: 'init' },
    };
  },

  reduce(scene, event) {
    const payload = asRecord(event.payload, `${event.type} payload`);
    switch (event.type) {
      case 'log': {
        const id = asString(payload.id, 'log.id');
        const lines = asNumberArray(payload.lines, 'log.lines');
        return { ...scene, output: [...scene.output, id], step: { kind: 'log', id, lines } };
      }
      case 'schedule-timer': {
        const id = asString(payload.id, 'schedule-timer.id');
        const lines = asNumberArray(payload.lines, 'schedule-timer.lines');
        return { ...scene, taskQueue: [...scene.taskQueue, id], step: { kind: 'scheduleTimer', id, lines } };
      }
      case 'schedule-chain': {
        const first = asString(payload.first, 'schedule-chain.first');
        const firstLine = asNumber(payload.firstLine, 'schedule-chain.firstLine');
        const waiting = asWaitingArray(payload.waiting, 'schedule-chain.waiting');
        const lines = asNumberArray(payload.lines, 'schedule-chain.lines');
        return {
          ...scene,
          microQueue: [...scene.microQueue, first],
          waiting: [...scene.waiting, ...waiting],
          step: { kind: 'scheduleChain', first, firstLine, waiting, lines },
        };
      }
      case 'run-microtask': {
        const id = asString(payload.id, 'run-microtask.id');
        const line = asNumber(payload.line, 'run-microtask.line');
        const promoted = asStringArray(payload.promoted, 'run-microtask.promoted');
        if (scene.microQueue[0] !== id) {
          throw new Error(`microtaskCutsInScene: 마이크로태스크 줄 앞머리(${scene.microQueue[0]})가 ${id} 와 다르다`);
        }
        return {
          ...scene,
          output: [...scene.output, id],
          microQueue: [...scene.microQueue.slice(1), ...promoted],
          waiting: scene.waiting.filter((w) => !promoted.includes(w.id)),
          step: { kind: 'runMicrotask', id, line, promoted },
        };
      }
      case 'run-task': {
        const id = asString(payload.id, 'run-task.id');
        const line = asNumber(payload.line, 'run-task.line');
        if (scene.taskQueue[0] !== id) {
          throw new Error(`microtaskCutsInScene: 태스크 줄 앞머리(${scene.taskQueue[0]})가 ${id} 와 다르다`);
        }
        return {
          ...scene,
          output: [...scene.output, id],
          taskQueue: scene.taskQueue.slice(1),
          step: { kind: 'runTask', id, line },
        };
      }
      default:
        throw new Error(`microtaskCutsInScene: 모르는 이벤트 타입 ${event.type}`);
    }
  },
};
