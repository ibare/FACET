/**
 * blocked-waits-event 의 장면.
 *
 * 바탕 — 프로세스 차례 · 사건 차례 · 마지막 틱 (`init`)
 * 자취 — 줄들의 지금 모습 · CPU 가 누구에게 쓰였는지(구간) · 아직 오지 않은 사건
 * 이번 걸음 — 그 틱에 일어난 일과, 일마다 줄이 어떻게 바뀌었는지의 차례(`frames`)
 *
 * 장면은 셈하지 않는다. 알고리즘이 보낸 일을 줄에 얹을 뿐이고, 얹을 수 없는 일
 * (준비 줄 맨 앞이 아닌 것을 올리기 · 줄 맨 앞이 아닌 것을 깨우기)은 던진다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 줄들의 한 순간. `wait` 은 사건 차례(`events`)를 따른다. */
export type Snapshot = {
  ready: string[];
  cpu: string | null;
  wait: string[][];
  done: string[];
};

export type SceneHappening =
  | { kind: 'done'; proc: string }
  | { kind: 'sleep'; proc: string; event: number; due: number | null }
  | { kind: 'wake'; proc: string; event: number; slept: number }
  | { kind: 'run'; proc: string };

export type RunSpan = { proc: string; from: number; to: number | null };

export type Arrival = { event: number; at: number };

export type BlockedWaitsEventScene = {
  procs: string[];
  events: string[];
  horizon: number;
  now: Snapshot;
  tick: number | null;
  runs: RunSpan[];
  arrivals: Arrival[];
  step: null | {
    tick: number;
    idle: number;
    happenings: SceneHappening[];
    /** 일 하나마다 한 장. 길이는 happenings + 1 — 첫 장이 이 틱 앞의 줄들이다. */
    frames: Snapshot[];
  };
};

function copySnap(s: Snapshot): Snapshot {
  return { ready: [...s.ready], cpu: s.cpu, wait: s.wait.map((q) => [...q]), done: [...s.done] };
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function readString(o: Record<string, unknown>, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`장면: ${key} 가 글자가 아니다`);
  return v;
}

function readNumber(o: Record<string, unknown>, key: string): number {
  const v = o[key];
  if (typeof v !== 'number') throw new Error(`장면: ${key} 가 수가 아니다`);
  return v;
}

function eventIndex(events: string[], id: string): number {
  const i = events.indexOf(id);
  if (i < 0) throw new Error(`장면: 모르는 사건 ${id}`);
  return i;
}

function readHappening(x: unknown, events: string[]): SceneHappening {
  if (!isRecord(x)) throw new Error('장면: 일의 모양이 틀렸다');
  const kind = readString(x, 'kind');
  const proc = readString(x, 'proc');
  if (kind === 'done' || kind === 'run') return { kind, proc };
  if (kind === 'sleep') {
    const due = x['due'];
    if (due !== null && typeof due !== 'number') throw new Error('장면: due 가 수도 null 도 아니다');
    return { kind, proc, event: eventIndex(events, readString(x, 'event')), due };
  }
  if (kind === 'wake') {
    return { kind, proc, event: eventIndex(events, readString(x, 'event')), slept: readNumber(x, 'slept') };
  }
  throw new Error(`장면: 모르는 일 ${kind}`);
}

function readIds(list: unknown, what: string): string[] {
  if (!Array.isArray(list)) throw new Error(`장면: ${what} 목록이 없다`);
  return list.map((item) => {
    if (!isRecord(item)) throw new Error(`장면: ${what} 의 모양이 틀렸다`);
    return readString(item, 'id');
  });
}

export const blockedWaitsEventScene: ScenePlan<BlockedWaitsEventScene> = {
  initial(initialData) {
    const data = isRecord(initialData) ? initialData : {};
    const procs = Array.isArray(data['procs']) ? readIds(data['procs'], 'procs') : [];
    const events = Array.isArray(data['events']) ? readIds(data['events'], 'events') : [];
    const arrivals: Arrival[] = [];
    if (Array.isArray(data['events'])) {
      data['events'].forEach((ev, i) => {
        if (isRecord(ev) && typeof ev['at'] === 'number') arrivals.push({ event: i, at: ev['at'] });
      });
    }
    return {
      procs,
      events,
      horizon: 0,
      now: { ready: [...procs], cpu: null, wait: events.map(() => []), done: [] },
      tick: null,
      runs: [],
      arrivals,
      step: null,
    };
  },

  reduce(scene, event: FacetRuntimeEvent) {
    const payload = isRecord(event.payload) ? event.payload : {};

    if (event.type === 'init') {
      return { ...scene, horizon: readNumber(payload, 'horizon'), step: null };
    }

    if (event.type !== 'tick') return scene;

    const tick = readNumber(payload, 'tick');
    const idle = readNumber(payload, 'idle');
    const raw = payload['happenings'];
    if (!Array.isArray(raw)) throw new Error('장면: happenings 가 없다');
    const happenings = raw.map((h) => readHappening(h, scene.events));

    let snap = copySnap(scene.now);
    const frames: Snapshot[] = [copySnap(snap)];
    const runs = scene.runs.map((r) => ({ ...r }));
    let arrivals = scene.arrivals.map((a) => ({ ...a }));

    function closeRun(proc: string): void {
      const open = runs[runs.length - 1];
      if (open === undefined || open.proc !== proc || open.to !== null) {
        throw new Error(`장면: 틱 ${tick} — ${proc} 의 실행 구간이 열려 있지 않다`);
      }
      open.to = tick;
    }

    for (const h of happenings) {
      snap = copySnap(snap);
      if (h.kind === 'run') {
        if (snap.cpu !== null || snap.ready[0] !== h.proc) {
          throw new Error(`장면: 틱 ${tick} — ${h.proc} 는 준비 줄 맨 앞이 아니거나 CPU 가 차 있다`);
        }
        snap.ready.shift();
        snap.cpu = h.proc;
        runs.push({ proc: h.proc, from: tick, to: null });
      } else if (h.kind === 'done' || h.kind === 'sleep') {
        if (snap.cpu !== h.proc) throw new Error(`장면: 틱 ${tick} — ${h.proc} 는 실행 중이 아니다`);
        snap.cpu = null;
        closeRun(h.proc);
        if (h.kind === 'done') {
          snap.done.push(h.proc);
        } else {
          const q = snap.wait[h.event];
          if (q === undefined) throw new Error(`장면: 틱 ${tick} — 대기 줄 ${h.event} 가 없다`);
          q.push(h.proc);
          if (h.due !== null) arrivals = [...arrivals, { event: h.event, at: h.due }];
        }
      } else {
        const q = snap.wait[h.event];
        if (q === undefined || q[0] !== h.proc) {
          throw new Error(`장면: 틱 ${tick} — ${h.proc} 는 그 대기 줄 맨 앞이 아니다`);
        }
        q.shift();
        snap.ready.push(h.proc);
        const at = arrivals.findIndex((a) => a.event === h.event && a.at === tick);
        if (at < 0) throw new Error(`장면: 틱 ${tick} — 예약되지 않은 도착`);
        arrivals = arrivals.filter((_, i) => i !== at);
      }
      frames.push(copySnap(snap));
    }

    return {
      ...scene,
      now: snap,
      tick,
      runs,
      arrivals,
      step: { tick, idle, happenings, frames },
    };
  },
};
