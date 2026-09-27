/**
 * 에라토스테네스의 체 — 장면.
 *
 * 바탕: 판 끝 n · 칸 2..n · 차례가 오는 소수(sieving, silent init 이 채운다)
 * 자취: 지운 칸과 그 지운 이(struck, 지운 차례대로) · 차례를 마친 소수(done)
 * 이번 걸음: step — 판 · 한 소수의 차례 · 멈춤
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { boardOf, narrowSieveData, type SieveHit } from './algorithm.js';

export type SieveStep =
  | { kind: 'board' }
  | { kind: 'sieve'; p: number; sq: number; hits: SieveHit[] }
  | { kind: 'stop'; p: number; sq: number; primes: number[] };

export type SieveScene = {
  n: number;
  cells: number[];
  sieving: number[] | null;
  struck: Array<{ n: number; by: number }>;
  done: number[];
  step: SieveStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function intField(obj: Record<string, unknown>, key: string, path: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`sieve-of-eratosthenes scene: ${path}.${key} 가 정수가 아니다`);
  }
  return v;
}

function intList(v: unknown, path: string): number[] {
  if (!Array.isArray(v)) throw new Error(`sieve-of-eratosthenes scene: ${path} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) {
      throw new Error(`sieve-of-eratosthenes scene: ${path}[${i}] 가 정수가 아니다`);
    }
    return x;
  });
}

function byOf(scene: SieveScene, m: number): number | undefined {
  return scene.struck.find((s) => s.n === m)?.by;
}

function reduceInit(scene: SieveScene, payload: unknown): SieveScene {
  if (!isRecord(payload)) throw new Error('sieve-of-eratosthenes scene: init.payload 가 없다');
  const sieving = intList(payload.sieving, 'init.payload.sieving');
  for (const p of sieving) {
    if (!scene.cells.includes(p)) {
      throw new Error(`sieve-of-eratosthenes scene: init.payload.sieving 의 ${p} 가 판에 없다`);
    }
  }
  return { ...scene, sieving, step: { kind: 'board' } };
}

function reduceSieve(scene: SieveScene, payload: unknown): SieveScene {
  if (!isRecord(payload)) throw new Error('sieve-of-eratosthenes scene: sieve.payload 가 없다');
  if (scene.sieving === null) throw new Error('sieve-of-eratosthenes scene: init 앞에 sieve 가 왔다');
  const p = intField(payload, 'p', 'sieve.payload');
  const sq = intField(payload, 'sq', 'sieve.payload');
  if (!scene.sieving.includes(p)) {
    throw new Error(`sieve-of-eratosthenes scene: sieve.payload.p ${p} 가 차례 목록에 없다`);
  }
  if (byOf(scene, p) !== undefined) {
    throw new Error(`sieve-of-eratosthenes scene: sieve.payload.p ${p} 는 이미 지워졌다`);
  }
  if (sq !== p * p) throw new Error(`sieve-of-eratosthenes scene: sieve.payload.sq ${sq} 가 p × p 가 아니다`);
  if (!Array.isArray(payload.hits)) throw new Error('sieve-of-eratosthenes scene: sieve.payload.hits 가 배열이 아니다');
  const hits: SieveHit[] = [];
  const added: Array<{ n: number; by: number }> = [];
  payload.hits.forEach((raw: unknown, i: number) => {
    const path = `sieve.payload.hits[${i}]`;
    if (!isRecord(raw)) throw new Error(`sieve-of-eratosthenes scene: ${path} 가 객체가 아니다`);
    const n = intField(raw, 'n', path);
    const k = intField(raw, 'k', path);
    const by = intField(raw, 'by', path);
    if (!scene.cells.includes(n)) throw new Error(`sieve-of-eratosthenes scene: ${path}.n ${n} 가 판에 없다`);
    if (n !== p * k) throw new Error(`sieve-of-eratosthenes scene: ${path}.n ${n} 가 ${p} × ${k} 가 아니다`);
    const prior = byOf(scene, n);
    if (by === p) {
      if (prior !== undefined) {
        throw new Error(`sieve-of-eratosthenes scene: ${path} 는 새로 지운다지만 이미 ${prior} 가 지웠다`);
      }
      added.push({ n, by });
    } else if (prior !== by) {
      throw new Error(`sieve-of-eratosthenes scene: ${path}.by ${by} 가 앞 장면의 지운 이 ${String(prior)} 와 다르다`);
    }
    hits.push({ n, k, by });
  });
  return {
    ...scene,
    struck: [...scene.struck, ...added],
    done: [...scene.done, p],
    step: { kind: 'sieve', p, sq, hits },
  };
}

function reduceStop(scene: SieveScene, payload: unknown): SieveScene {
  if (!isRecord(payload)) throw new Error('sieve-of-eratosthenes scene: stop.payload 가 없다');
  const p = intField(payload, 'p', 'stop.payload');
  const sq = intField(payload, 'sq', 'stop.payload');
  const primes = intList(payload.primes, 'stop.payload.primes');
  if (sq !== p * p || sq <= scene.n) {
    throw new Error(`sieve-of-eratosthenes scene: stop.payload.sq ${sq} 가 판 끝을 넘는 p × p 가 아니다`);
  }
  const left = scene.cells.filter((m) => byOf(scene, m) === undefined);
  if (left.length !== primes.length || left.some((m, i) => primes[i] !== m)) {
    throw new Error('sieve-of-eratosthenes scene: stop.payload.primes 가 지우지 않은 칸과 다르다');
  }
  if (!primes.includes(p)) throw new Error(`sieve-of-eratosthenes scene: stop.payload.p ${p} 가 남은 수에 없다`);
  return { ...scene, step: { kind: 'stop', p, sq, primes } };
}

export const sieveOfEratosthenesScene: ScenePlan<SieveScene> = {
  initial(initialData: unknown): SieveScene {
    const data = narrowSieveData(initialData);
    return {
      n: data.n,
      cells: boardOf(data.n),
      sieving: null,
      struck: [],
      done: [],
      step: { kind: 'board' },
    };
  },
  reduce(scene: SieveScene, event: FacetRuntimeEvent): SieveScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'sieve':
        return reduceSieve(scene, event.payload);
      case 'stop':
        return reduceStop(scene, event.payload);
      default:
        throw new Error(`sieve-of-eratosthenes scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
