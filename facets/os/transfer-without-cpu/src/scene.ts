import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 이번 걸음. 흐르게 할 운동의 계기값을 싣는다 (`…Was`). */
export type TransferStep =
  | { kind: 'start' }
  | { kind: 'program' }
  | {
      kind: 'move';
      index: number;
      slot: number;
      to: number;
      word: number;
      add: number;
      addrWas: number;
      countWas: number;
      sumWas: number;
    }
  | { kind: 'interrupt' }
  | { kind: 'ack'; moved: number };

export type TransferScene = {
  // 바탕 — init 이 한 번 정한다
  words: number[];
  slots: number[];
  job: number[];
  // 자취 — 걸음이 쌓는다
  /** 메모리 칸의 값. 아직 안 온 칸은 null */
  memory: (number | null)[];
  /** 제어기의 주소 · 개수. 적기 전엔 null */
  addr: number | null;
  count: number | null;
  direction: 'deviceToMemory' | null;
  /** 장치에서 읽혀 나간 낱말 수 */
  taken: number;
  /** CPU 가 더한 수의 개수 */
  done: number;
  sum: number;
  /** 부름의 자리 — 없음 · 올라옴 · 받음 */
  call: 'none' | 'raised' | 'taken';
  calls: number;
  step: TransferStep;
};

function intList(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const x of v) {
    if (typeof x !== 'number') return null;
    out.push(x);
  }
  return out;
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`transferWithoutCpuScene: ${type} 의 ${key} 가 수가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`transferWithoutCpuScene: ${event.type} 에 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

function emptyScene(words: number[], job: number[]): TransferScene {
  return {
    words,
    slots: [],
    job,
    memory: [],
    addr: null,
    count: null,
    direction: null,
    taken: 0,
    done: 0,
    sum: 0,
    call: 'none',
    calls: 0,
    step: { kind: 'start' },
  };
}

export const transferWithoutCpuScene: ScenePlan<TransferScene> = {
  initial(initialData: unknown): TransferScene {
    // 낱말과 CPU 의 수는 선언에 이미 있다 — 베껴 둔다. 주소는 init 이 채운다
    if (typeof initialData !== 'object' || initialData === null) return emptyScene([], []);
    const d = initialData as Record<string, unknown>;
    return emptyScene(intList(d.words) ?? [], intList(d.job) ?? []);
  },

  reduce(scene: TransferScene, event: FacetRuntimeEvent): TransferScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const words = intList(p.words);
        const slots = intList(p.slots);
        const job = intList(p.job);
        if (!words || !slots || !job || slots.length !== words.length) {
          throw new Error('transferWithoutCpuScene: init 의 words · slots · job 이 맞지 않는다');
        }
        return { ...emptyScene(words, job), slots, memory: slots.map(() => null) };
      }
      case 'program': {
        const p = payloadOf(event);
        if (p.direction !== 'deviceToMemory') {
          throw new Error(`transferWithoutCpuScene: 모르는 방향 — ${String(p.direction)}`);
        }
        return {
          ...scene,
          addr: num(p, 'addr', 'program'),
          count: num(p, 'count', 'program'),
          direction: p.direction,
          step: { kind: 'program' },
        };
      }
      case 'move': {
        const p = payloadOf(event);
        const index = num(p, 'index', 'move');
        const slot = num(p, 'slot', 'move');
        if (scene.addr === null || scene.count === null) {
          throw new Error('transferWithoutCpuScene: 제어기에 적기 전에 move 가 왔다');
        }
        if (slot < 0 || slot >= scene.memory.length) {
          throw new Error(`transferWithoutCpuScene: 메모리 칸 ${slot} 이 없다`);
        }
        const word = num(p, 'word', 'move');
        const memory = scene.memory.slice();
        memory[slot] = word;
        return {
          ...scene,
          memory,
          addr: num(p, 'addr', 'move'),
          count: num(p, 'count', 'move'),
          taken: index + 1,
          done: index + 1,
          sum: num(p, 'sum', 'move'),
          step: {
            kind: 'move',
            index,
            slot,
            to: num(p, 'to', 'move'),
            word,
            add: num(p, 'add', 'move'),
            addrWas: scene.addr,
            countWas: scene.count,
            sumWas: scene.sum,
          },
        };
      }
      case 'interrupt': {
        const p = payloadOf(event);
        return { ...scene, call: 'raised', calls: num(p, 'calls', 'interrupt'), step: { kind: 'interrupt' } };
      }
      case 'ack': {
        const p = payloadOf(event);
        return {
          ...scene,
          call: 'taken',
          calls: num(p, 'calls', 'ack'),
          step: { kind: 'ack', moved: num(p, 'moved', 'ack') },
        };
      }
      default:
        throw new Error(`transferWithoutCpuScene: 모르는 이벤트 — ${event.type}`);
    }
  },
};
