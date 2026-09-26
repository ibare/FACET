/**
 * bisect-halving 장면.
 *
 * 바탕 — 커밋 줄기(`commits`)와 시험 한 번의 분(`testMinutes`). 숨은 값(`firstBad`)은 옮겨 담지 않는다.
 * 자취 — 후보 경계(`good` · `bad`), 알려진 판정(`verdicts`), 치른 시험(`tests`), 시험대 위의 커밋(`bench`), 답(`answer`).
 * 이번 걸음 — `step`. 흐를 운동을 고르는 계기값(`wasGood` · `wasBad`)을 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { commitIndex, type BisectVerdict } from './algorithm.js';

export type BisectMark = { at: number; verdict: BisectVerdict };

export type BisectStep =
  | { kind: 'test'; at: number; verdict: BisectVerdict }
  | {
      kind: 'drop';
      at: number;
      verdict: BisectVerdict;
      from: number;
      to: number;
      wasGood: number;
      wasBad: number;
    }
  | { kind: 'found'; at: number };

export type BisectHalvingScene = {
  commits: string[];
  testMinutes: number;
  good: number;
  bad: number;
  /** 판정이 알려진 커밋, 알려진 차례대로 (두 끝이 먼저). */
  verdicts: BisectMark[];
  /** 치른 시험, 치른 차례대로. */
  tests: BisectMark[];
  minutes: number;
  /** 지금 꺼내 시험 중인 커밋. */
  bench: number | null;
  answer: number | null;
  step: BisectStep | null;
};

function fail(msg: string): never {
  throw new Error(`bisectHalvingScene: ${msg}`);
}

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${type}.payload.${key} 가 정수가 아니다`);
  return v;
}

function verdictOf(p: Record<string, unknown>, type: string): BisectVerdict {
  const v = p.verdict;
  if (v !== 'good' && v !== 'bad') fail(`${type}.payload.verdict 가 good · bad 가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload 가 없다`);
  return p as Record<string, unknown>;
}

function inRange(scene: BisectHalvingScene, at: number, type: string, key: string): void {
  if (at < 0 || at >= scene.commits.length) fail(`${type}.payload.${key} ${at} 가 줄기 밖이다`);
}

export const bisectHalvingScene: ScenePlan<BisectHalvingScene> = {
  initial(initialData: unknown): BisectHalvingScene {
    if (typeof initialData !== 'object' || initialData === null) fail('initialData 가 없다');
    const d = initialData as Record<string, unknown>;
    const commitsRaw = d.commits;
    if (!Array.isArray(commitsRaw) || commitsRaw.length < 2) fail('initialData.commits 는 둘 이상의 배열이어야 한다');
    const commits: string[] = commitsRaw.map((c, i) => {
      if (typeof c !== 'string') fail(`initialData.commits[${i}] 가 글자가 아니다`);
      return c;
    });
    if (typeof d.knownGood !== 'string') fail('initialData.knownGood 가 없다');
    if (typeof d.knownBad !== 'string') fail('initialData.knownBad 가 없다');
    const testMinutes = d.testMinutes;
    if (typeof testMinutes !== 'number' || !(testMinutes > 0)) fail('initialData.testMinutes 가 양수가 아니다');
    const good = commitIndex(commits, d.knownGood, 'knownGood');
    const bad = commitIndex(commits, d.knownBad, 'knownBad');
    if (good >= bad) fail('knownGood 는 knownBad 보다 앞이어야 한다');
    return {
      commits,
      testMinutes,
      good,
      bad,
      verdicts: [
        { at: good, verdict: 'good' },
        { at: bad, verdict: 'bad' },
      ],
      tests: [],
      minutes: 0,
      bench: null,
      answer: null,
      step: null,
    };
  },

  reduce(scene: BisectHalvingScene, event: FacetRuntimeEvent): BisectHalvingScene {
    switch (event.type) {
      case 'test': {
        const p = payloadOf(event);
        const at = num(p, 'at', 'test');
        inRange(scene, at, 'test', 'at');
        const verdict = verdictOf(p, 'test');
        const tests = num(p, 'tests', 'test');
        const minutes = p.minutes;
        if (typeof minutes !== 'number') fail('test.payload.minutes 가 수가 아니다');
        if (tests !== scene.tests.length + 1) fail(`test.payload.tests ${tests} 가 쌓인 시험 수와 어긋난다`);
        return {
          ...scene,
          verdicts: [...scene.verdicts, { at, verdict }],
          tests: [...scene.tests, { at, verdict }],
          minutes,
          bench: at,
          step: { kind: 'test', at, verdict },
        };
      }
      case 'drop': {
        const p = payloadOf(event);
        const at = num(p, 'at', 'drop');
        const verdict = verdictOf(p, 'drop');
        const from = num(p, 'from', 'drop');
        const to = num(p, 'to', 'drop');
        const wasGood = num(p, 'wasGood', 'drop');
        const wasBad = num(p, 'wasBad', 'drop');
        const good = num(p, 'good', 'drop');
        const bad = num(p, 'bad', 'drop');
        for (const [k, v] of [
          ['from', from],
          ['to', to],
          ['good', good],
          ['bad', bad],
          ['wasGood', wasGood],
          ['wasBad', wasBad],
        ] as const) inRange(scene, v, 'drop', k);
        if (wasGood !== scene.good) fail(`drop.payload.wasGood ${wasGood} 가 장면의 good ${scene.good} 와 어긋난다`);
        if (wasBad !== scene.bad) fail(`drop.payload.wasBad ${wasBad} 가 장면의 bad ${scene.bad} 와 어긋난다`);
        if (scene.bench !== at) fail(`drop.payload.at ${at} 가 시험대의 커밋이 아니다`);
        if (from > to) fail(`drop 의 버릴 자리 ${from}..${to} 가 비었다`);
        return {
          ...scene,
          good,
          bad,
          bench: null,
          step: { kind: 'drop', at, verdict, from, to, wasGood, wasBad },
        };
      }
      case 'found': {
        const p = payloadOf(event);
        const at = num(p, 'at', 'found');
        inRange(scene, at, 'found', 'at');
        if (at !== scene.bad || scene.bad - scene.good !== 1) fail(`found.payload.at ${at} 가 남은 후보 하나가 아니다`);
        return { ...scene, answer: at, step: { kind: 'found', at } };
      }
      default:
        return fail(`모르는 이벤트 "${event.type}"`);
    }
  },
};
