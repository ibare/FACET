/**
 * time-slice-rotate 장면.
 *
 * 바탕: 몫 · 프로세스 목록(식별자 · 도착 · 길이). initial 이 initialData 에서 세운다.
 * 자취: 각자의 남은 양 · 어디에 있는가 · 줄의 차례 · 줄 끝으로 돌아간 횟수 · 끝난 차례.
 * 이번 걸음(step): 이 경계에서 일어난 일과, 그 앞의 자리(계기값 — 운동의 출발점).
 *
 * 누가 다음에 오를지는 알고리즘이 셈했다. 장면은 boundary 가 말한 대로 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readRotateData } from './algorithm.js';

export type RotateWhere = 'pending' | 'queued' | 'cpu' | 'done';

export type RotateProc = {
  id: string;
  arrive: number;
  len: number;
  left: number;
  where: RotateWhere;
  /** 몫을 다 써 줄 끝으로 돌아간 횟수 */
  laps: number;
  doneAt: number | null;
};

export type RotateStep = {
  fromTick: number;
  ran: { id: string; before: number; after: number } | null;
  finished: string | null;
  /** 바깥(아직 안 옴)에서 줄 끝으로 걸어 들어온 것 */
  arrived: string[];
  back: { id: string; left: number } | null;
  picked: string | null;
  /** 이 경계 앞의 자리 — 운동이 여기서 출발한다 */
  was: { cpu: string | null; queue: string[]; pending: string[]; done: string[] };
};

export type TimeSliceRotateScene = {
  quantum: number;
  tick: number;
  procs: RotateProc[];
  queue: string[];
  cpu: string | null;
  done: string[];
  backs: number;
  step: RotateStep | null;
};

function pendingOf(procs: readonly RotateProc[]): string[] {
  return procs.filter((p) => p.where === 'pending').map((p) => p.id);
}

function readTick(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error('time-slice-rotate 장면: tick 이 틀렸다');
  return v;
}

function readId(v: unknown, known: ReadonlySet<string>, what: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string' || !known.has(v)) throw new Error(`time-slice-rotate 장면: ${what} 가 모르는 식별자다`);
  return v;
}

function readIdLeft(v: unknown, known: ReadonlySet<string>, what: string): { id: string; left: number } | null {
  if (v === null) return null;
  if (typeof v !== 'object') throw new Error(`time-slice-rotate 장면: ${what} 가 틀렸다`);
  const r = v as Record<string, unknown>;
  const id = readId(r.id, known, what);
  if (id === null || typeof r.left !== 'number' || !Number.isInteger(r.left) || r.left < 0) {
    throw new Error(`time-slice-rotate 장면: ${what} 가 틀렸다`);
  }
  return { id, left: r.left };
}

export const timeSliceRotateScene: ScenePlan<TimeSliceRotateScene> = {
  initial(initialData: unknown): TimeSliceRotateScene {
    const { quantum, procs } = readRotateData(initialData);
    // 걸음 0 = t0 직전. t0 에 도착하는 것들은 목록 차례로 이미 줄에 서 있다.
    const rows: RotateProc[] = procs.map((p) => ({
      id: p.id,
      arrive: p.arrive,
      len: p.len,
      left: p.len,
      where: p.arrive === 0 ? 'queued' : 'pending',
      laps: 0,
      doneAt: null,
    }));
    return {
      quantum,
      tick: 0,
      procs: rows,
      queue: rows.filter((p) => p.where === 'queued').map((p) => p.id),
      cpu: null,
      done: [],
      backs: 0,
      step: null,
    };
  },

  reduce(scene: TimeSliceRotateScene, event: FacetRuntimeEvent): TimeSliceRotateScene {
    if (event.type !== 'boundary') return scene;
    const pl = event.payload;
    if (typeof pl !== 'object' || pl === null) throw new Error('time-slice-rotate 장면: boundary 에 payload 가 없다');
    const rec = pl as Record<string, unknown>;
    const known = new Set(scene.procs.map((p) => p.id));
    const tick = readTick(rec.tick);
    const finished = readId(rec.finished, known, 'finished');
    const picked = readId(rec.picked, known, 'picked');
    const back = readIdLeft(rec.back, known, 'back');
    const ranRaw = readIdLeft(rec.ran, known, 'ran');
    if (!Array.isArray(rec.arrived)) throw new Error('time-slice-rotate 장면: arrived 가 배열이 아니다');
    const arrivedAll = rec.arrived.map((a): string => {
      const id = readId(a, known, 'arrived');
      if (id === null) throw new Error('time-slice-rotate 장면: arrived 원소가 틀렸다');
      return id;
    });

    const procs = scene.procs.map((p) => ({ ...p }));
    const byId = new Map(procs.map((p) => [p.id, p]));
    const get = (id: string): RotateProc => byId.get(id) as RotateProc;
    const was = {
      cpu: scene.cpu,
      queue: [...scene.queue],
      pending: pendingOf(scene.procs),
      done: [...scene.done],
    };

    let ran: RotateStep['ran'] = null;
    if (ranRaw !== null) {
      if (ranRaw.id !== scene.cpu) throw new Error(`time-slice-rotate 장면: ${ranRaw.id} 가 CPU 에 있지 않았다`);
      const p = get(ranRaw.id);
      ran = { id: p.id, before: p.left, after: ranRaw.left };
      p.left = ranRaw.left;
    }

    let cpu = scene.cpu;
    const queue = [...scene.queue];
    const done = [...scene.done];
    let backs = scene.backs;

    if (finished !== null) {
      if (finished !== cpu) throw new Error(`time-slice-rotate 장면: 끝난 ${finished} 가 CPU 에 있지 않았다`);
      const p = get(finished);
      p.where = 'done';
      p.doneAt = tick;
      done.push(finished);
      cpu = null;
    }
    if (back !== null && back.id !== cpu) throw new Error(`time-slice-rotate 장면: 돌아간 ${back.id} 가 CPU 에 있지 않았다`);
    if (back !== null) cpu = null;

    const walkedIn: string[] = [];
    for (const id of arrivedAll) {
      const p = get(id);
      if (p.where === 'pending') {
        p.where = 'queued';
        queue.push(id);
        walkedIn.push(id);
      } else if (!(tick === 0 && p.where === 'queued' && p.arrive === 0)) {
        // t0 도착은 걸음 0 에 이미 서 있다. 그 밖의 겹친 도착은 모형이 틀린 것이다.
        throw new Error(`time-slice-rotate 장면: ${id} 가 두 번 도착했다`);
      }
    }

    if (back !== null) {
      const p = get(back.id);
      p.where = 'queued';
      p.left = back.left;
      p.laps += 1;
      queue.push(back.id);
      backs += 1;
    }

    if (picked !== null) {
      const at = queue.indexOf(picked);
      if (at < 0) throw new Error(`time-slice-rotate 장면: 오른 ${picked} 가 줄에 없었다`);
      queue.splice(at, 1);
      get(picked).where = 'cpu';
      cpu = picked;
    }

    return {
      quantum: scene.quantum,
      tick,
      procs,
      queue,
      cpu,
      done,
      backs,
      step: { fromTick: scene.tick, ran, finished, arrived: walkedIn, back, picked, was },
    };
  },
};
