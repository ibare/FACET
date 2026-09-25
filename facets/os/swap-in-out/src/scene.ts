/**
 * swapInOut 장면 — 이벤트를 이어 메모리 자리 · 디스크 줄 · 도착 줄 · 상태를 쥔다.
 *
 * 바탕: slotKiB, order(프로세스 차례 — 그리기 차례에만 쓴다)
 * 자취: slots · disk · arrival · states · left(프로세스마다 마지막으로 내려간 자리)
 * 이번 걸음: step
 *
 * 누구를 내려보낼지 · 어느 자리로 올릴지는 알고리즘이 셈했다. 장면은 payload 를 그대로 잇는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readSwapData, type ProcState } from './algorithm.js';

export type SwapStep =
  | { kind: 'start' }
  | { kind: 'arrive'; pid: string; free: number }
  | { kind: 'swapOut'; pid: string; slot: number; diskIndex: number }
  | { kind: 'swapIn'; pid: string; slot: number; from: 'arrival' | 'disk'; fromIndex: number }
  | { kind: 'ioDone'; pid: string; where: 'memory' | 'disk' }
  | { kind: 'exit'; pid: string; slot: number; was: ProcState };

export type SwapScene = {
  slotKiB: number;
  order: string[];
  slots: (string | null)[];
  disk: string[];
  arrival: string[];
  /** [pid, 상태] — 살아 있는 것만. 차례는 order 를 따른다. */
  states: [string, ProcState][];
  /** [pid, 마지막으로 내려간 자리] */
  left: [string, number][];
  step: SwapStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`swapInOutScene: ${type}.${key} 가 문자열이 아니다`);
  return v;
}

function int(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`swapInOutScene: ${type}.${key} 가 0 이상의 정수가 아니다`);
  }
  return v;
}

function withState(scene: SwapScene, pid: string, state: ProcState | null): [string, ProcState][] {
  const map = new Map(scene.states);
  if (state === null) map.delete(pid);
  else map.set(pid, state);
  return scene.order.filter((p) => map.has(p)).map((p) => [p, map.get(p) as ProcState]);
}

function setSlot(slots: (string | null)[], slot: number, pid: string | null): (string | null)[] {
  if (slot >= slots.length) throw new Error(`swapInOutScene: 자리 ${slot} 가 없다`);
  return slots.map((p, i) => (i === slot ? pid : p));
}

export const swapInOutScene: ScenePlan<SwapScene> = {
  initial(initialData: unknown): SwapScene {
    const data = readSwapData(initialData);
    const slots: (string | null)[] = Array.from({ length: data.memoryKiB / data.slotKiB }, () => null);
    const states = new Map<string, ProcState>();
    for (const s of data.start) {
      slots[s.slot] = s.pid;
      states.set(s.pid, s.state);
    }
    const order = data.processes.map((p) => p.id);
    return {
      slotKiB: data.slotKiB,
      order,
      slots,
      disk: [],
      arrival: [],
      states: order.filter((p) => states.has(p)).map((p) => [p, states.get(p) as ProcState]),
      left: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: SwapScene, event: FacetRuntimeEvent): SwapScene {
    const p = event.payload;
    if (!isRecord(p)) throw new Error(`swapInOutScene: ${event.type} 의 payload 가 객체가 아니다`);
    const type = event.type;
    if (type === 'arrive') {
      const pid = str(p, 'pid', type);
      const free = int(p, 'free', type);
      return {
        ...scene,
        arrival: [...scene.arrival, pid],
        states: withState(scene, pid, 'ready'),
        step: { kind: 'arrive', pid, free },
      };
    }
    if (type === 'swapOut') {
      const pid = str(p, 'pid', type);
      const slot = int(p, 'slot', type);
      const diskIndex = int(p, 'diskIndex', type);
      if (scene.slots[slot] !== pid) throw new Error(`swapInOutScene: 자리 ${slot} 에 ${pid} 가 없다`);
      const disk = [...scene.disk];
      disk.splice(diskIndex, 0, pid);
      return {
        ...scene,
        slots: setSlot(scene.slots, slot, null),
        disk,
        left: [...scene.left.filter(([q]) => q !== pid), [pid, slot]],
        step: { kind: 'swapOut', pid, slot, diskIndex },
      };
    }
    if (type === 'swapIn') {
      const pid = str(p, 'pid', type);
      const slot = int(p, 'slot', type);
      const fromIndex = int(p, 'fromIndex', type);
      const from = p.from;
      if (from !== 'arrival' && from !== 'disk') throw new Error('swapInOutScene: swapIn.from 을 모른다');
      const line = from === 'disk' ? scene.disk : scene.arrival;
      if (line[fromIndex] !== pid) throw new Error(`swapInOutScene: ${from} 줄 ${fromIndex} 에 ${pid} 가 없다`);
      if (scene.slots[slot] !== null) throw new Error(`swapInOutScene: 자리 ${slot} 가 비어 있지 않다`);
      const rest = line.filter((_, i) => i !== fromIndex);
      return {
        ...scene,
        slots: setSlot(scene.slots, slot, pid),
        disk: from === 'disk' ? rest : scene.disk,
        arrival: from === 'arrival' ? rest : scene.arrival,
        step: { kind: 'swapIn', pid, slot, from, fromIndex },
      };
    }
    if (type === 'ioDone') {
      const pid = str(p, 'pid', type);
      const where = p.where;
      if (where !== 'memory' && where !== 'disk') throw new Error('swapInOutScene: ioDone.where 를 모른다');
      return { ...scene, states: withState(scene, pid, 'ready'), step: { kind: 'ioDone', pid, where } };
    }
    if (type === 'exit') {
      const pid = str(p, 'pid', type);
      const slot = int(p, 'slot', type);
      const was = p.was;
      if (was !== 'running' && was !== 'ready' && was !== 'waiting') {
        throw new Error('swapInOutScene: exit.was 를 모른다');
      }
      if (scene.slots[slot] !== pid) throw new Error(`swapInOutScene: 자리 ${slot} 에 ${pid} 가 없다`);
      return {
        ...scene,
        slots: setSlot(scene.slots, slot, null),
        states: withState(scene, pid, null),
        step: { kind: 'exit', pid, slot, was },
      };
    }
    throw new Error(`swapInOutScene: 모르는 이벤트 ${type}`);
  },
};
