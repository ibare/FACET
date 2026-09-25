import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readConvoyJobs, type ConvoyJob } from './algorithm.js';

/** 이번 걸음 — 무엇이 일어났는지 종류와 인자만. */
export type ConvoyStep =
  | { kind: 'none' }
  | { kind: 'start'; tick: number; run: string }
  | {
      kind: 'tick';
      from: number;
      to: number;
      run: string | null;
      arrive: string[];
      started: boolean;
      waiting: string[];
      finished: boolean;
    }
  | { kind: 'finish'; ran: number; waited: number; during: number; after: number };

export type ConvoyScene = {
  /** 바탕 — 자료의 프로세스 목록 (목록 차례). */
  jobs: ConvoyJob[];
  /** 바탕 — 맨 처음 CPU 에 오른 것. start 가 정한다. */
  lead: string | null;
  /** 자취 — 지금 보이는 경계의 시각. */
  now: number;
  /** 자취 — 도착한 것 (도착 차례). */
  present: string[];
  /** 자취 — CPU 의 주인과 그 남은 양. 주인이 끝나도 다음이 오르기 전까지 남은 양 0 으로 둔다. */
  cpu: string | null;
  left: number;
  /** 자취 — 프로세스마다 기다린 틱 하나하나. 값은 그 틱에 CPU 를 쥐었던 것의 식별자 (없으면 ''). */
  cells: Record<string, string[]>;
  /** 자취 — 끝난 시각. */
  ends: Record<string, number>;
  step: ConvoyStep;
};

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`convoy-effect 장면: ${what} 가 배열이 아니다`);
  return v.map((x: unknown) => {
    if (typeof x !== 'string') throw new Error(`convoy-effect 장면: ${what} 에 문자열 아닌 것이 있다`);
    return x;
  });
}

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`convoy-effect 장면: ${what} 가 정수가 아니다`);
  return v;
}

function bool(v: unknown, what: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`convoy-effect 장면: ${what} 가 참거짓이 아니다`);
  return v;
}

function record(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error('convoy-effect 장면: payload 가 객체가 아니다');
  return v as Record<string, unknown>;
}

function knownId(scene: ConvoyScene, id: string): string {
  if (!scene.jobs.some((j) => j.id === id)) throw new Error(`convoy-effect 장면: 모르는 식별자 ${id}`);
  return id;
}

/** 뒤따른 것들이 지금까지 기다린 틱 합 — 화면의 합계와 기둥 높이가 같은 셈을 쓴다. */
export function followersWaited(scene: ConvoyScene): number {
  let sum = 0;
  for (const j of scene.jobs) {
    if (j.id === scene.lead) continue;
    const c = scene.cells[j.id];
    if (c !== undefined) sum += c.length;
  }
  return sum;
}

export const convoyEffectScene: ScenePlan<ConvoyScene> = {
  initial(initialData: unknown): ConvoyScene {
    const data = typeof initialData === 'object' && initialData !== null ? (initialData as Record<string, unknown>) : {};
    const jobs = data['jobs'] === undefined ? [] : readConvoyJobs(data['jobs']);
    const cells: Record<string, string[]> = {};
    for (const j of jobs) cells[j.id] = [];
    return {
      jobs: jobs.map((j) => ({ ...j })),
      lead: null,
      now: 0,
      present: [],
      cpu: null,
      left: 0,
      cells,
      ends: {},
      step: { kind: 'none' },
    };
  },

  reduce(scene: ConvoyScene, event: FacetRuntimeEvent): ConvoyScene {
    if (event.type === 'start') {
      const p = record(event.payload);
      const tick = int(p['tick'], 'tick');
      const run = knownId(scene, typeof p['run'] === 'string' ? p['run'] : '');
      const arrive = strings(p['arrive'], 'arrive').map((id) => knownId(scene, id));
      const length = scene.jobs.find((j) => j.id === run)?.length;
      if (length === undefined) throw new Error(`convoy-effect 장면: ${run} 의 길이가 없다`);
      return {
        ...scene,
        lead: run,
        now: tick,
        present: [...scene.present, ...arrive],
        cpu: run,
        left: length,
        step: { kind: 'start', tick, run },
      };
    }

    if (event.type === 'tick') {
      const p = record(event.payload);
      const from = int(p['from'], 'from');
      const to = int(p['to'], 'to');
      const rawRun = p['run'];
      if (rawRun !== null && typeof rawRun !== 'string') throw new Error('convoy-effect 장면: run 이 문자열도 null 도 아니다');
      const run = rawRun === null ? null : knownId(scene, rawRun);
      const arrive = strings(p['arrive'], 'arrive').map((id) => knownId(scene, id));
      const waiting = strings(p['waiting'], 'waiting').map((id) => knownId(scene, id));
      const started = bool(p['started'], 'started');
      const finished = bool(p['finished'], 'finished');
      const remaining = int(p['remaining'], 'remaining');

      const cells: Record<string, string[]> = {};
      for (const j of scene.jobs) {
        const had = scene.cells[j.id] ?? [];
        cells[j.id] = waiting.includes(j.id) ? [...had, run ?? ''] : [...had];
      }
      const ends = { ...scene.ends };
      if (finished && run !== null) ends[run] = to;

      return {
        ...scene,
        now: to,
        present: [...scene.present, ...arrive],
        cpu: run ?? scene.cpu,
        left: run === null ? scene.left : remaining,
        cells,
        ends,
        step: { kind: 'tick', from, to, run, arrive, started, waiting, finished },
      };
    }

    if (event.type === 'finish') {
      const p = record(event.payload);
      return {
        ...scene,
        cpu: null,
        left: 0,
        step: {
          kind: 'finish',
          ran: int(p['ran'], 'ran'),
          waited: int(p['waited'], 'waited'),
          during: int(p['during'], 'during'),
          after: int(p['after'], 'after'),
        },
      };
    }

    return scene;
  },
};
