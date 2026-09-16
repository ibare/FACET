/**
 * verify-vs-find — 화면에 뜨는 수를 그 자리에서 다시 셈해 대조한다.
 *
 * **여기서는 알고리즘의 셈을 빌려 쓰지 않는다.** `facet.ts` 의 1차 데이터(수
 * 여섯과 목표 하나)만 읽어 이 파일이 부분집합을 따로 전수로 세고, 그 결과를
 * 알고리즘이 **발신한 것**과 견준다. 답 셋을 코드에 타이핑하면 호스트의 오타가
 * 검사까지 함께 통과한다.
 *
 * ── 장면(Scene) 으로 옮긴 뒤
 * 발신이 얇아졌다. 후보의 수 · 목표 · 고른 수 · 중간 합 · "지금까지 몇을 보았나"
 * 는 더 이상 payload 에 없고 **장면이 세거나 `expandCandidate` 가 편다.** 그래서
 * 이 파일도 발신을 직접 들추는 대신 **발신을 `reduce` 에 먹여 쌓은 장면**을 재는
 * 쪽으로 옮겼다 — 재는 뜻은 같고, 화면이 실제로 읽는 자리에서 잰다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetRuntimeEvent, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

import {
  candidateCount,
  computeVerifyVsFindResult,
  expandCandidate,
  findSeen,
  verifyVsFind,
  verifyVsFindFacet,
  verifyVsFindScene,
  verifySeen,
  type VerifyVsFindData,
  type VerifyVsFindScene,
} from '../src/index.js';

/** 선언에서 읽는다 — 이 파일에 수를 옮겨 적지 않는다. */
function declaredData(): VerifyVsFindData {
  const d = verifyVsFindFacet.initialData as Record<string, unknown>;
  const values = (d.values as unknown[]).filter((v): v is number => typeof v === 'number');
  return {
    type: String(d.type),
    values,
    target: d.target as number,
    stepMs: d.stepMs as number,
  };
}

/** 이 파일이 따로 세는 전수. 알고리즘과 같은 답에 닿아야 한다. */
function enumerateHere(values: number[], target: number): { total: number; answers: number[][] } {
  const answers: number[][] = [];
  const total = 2 ** values.length;
  for (let mask = 0; mask < total; mask += 1) {
    const picked: number[] = [];
    for (let i = 0; i < values.length; i += 1) {
      if ((mask >> i) % 2 === 1) picked.push(values[i]!);
    }
    if (picked.reduce((a, b) => a + b, 0) === target) answers.push(picked);
  }
  return { total, answers };
}

function maskOf(values: number[], picked: number[]): number {
  let mask = 0;
  const used = new Set<number>();
  for (const p of picked) {
    for (let i = 0; i < values.length; i += 1) {
      if (used.has(i) || values[i] !== p) continue;
      used.add(i);
      mask |= 1 << i;
      break;
    }
  }
  return mask;
}

type Run = { events: FacetRuntimeEvent[]; metrics: number };

/** advance 를 `presses` 번 흘려 준 뒤 취소한다. */
async function run(data: VerifyVsFindData, presses = 0): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  let metrics = 0;
  let cancelled = false;
  let left = presses;

  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(): void {
      metrics += 1;
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    pollInput(): null {
      return null;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      if (left > 0) {
        left -= 1;
        return { type: 'advance' };
      }
      cancelled = true;
      throw new Error('cancelled');
    },
  } as unknown as ReactiveContext<VerifyVsFindData>;

  await verifyVsFind(ctx);
  return { events, metrics };
}

const data = declaredData();
const here = enumerateHere(data.values, data.target);

function payload(e: FacetRuntimeEvent): Record<string, unknown> {
  return (e.payload ?? {}) as Record<string, unknown>;
}

/**
 * 발신을 장면으로 쌓는다. 걸음마다의 장면이 곧 그 걸음의 화면이므로, 화면에 뜨는
 * 수를 재려면 여기를 재는 것이 옳다.
 */
function sceneTrack(events: FacetRuntimeEvent[]): VerifyVsFindScene[] {
  const scenes: VerifyVsFindScene[] = [verifyVsFindScene.initial(data)];
  for (const e of events) scenes.push(verifyVsFindScene.reduce(scenes[scenes.length - 1]!, e));
  return scenes;
}

function lastScene(events: FacetRuntimeEvent[]): VerifyVsFindScene {
  const scenes = sceneTrack(events);
  return scenes[scenes.length - 1]!;
}

describe('verify-vs-find', () => {
  it('1차 데이터는 수와 목표뿐이다 — 후보 수도 답도 선언에 없다', () => {
    const keys = Object.keys(verifyVsFindFacet.initialData).sort();
    expect(keys).toEqual(['stepMs', 'target', 'type', 'values']);
    expect(verifyVsFindFacet.initialData.type).toBe('verify-vs-find');
  });

  it('후보의 수를 그 자리에서 셈한다 — 발신이 아니라 장면이 센다', async () => {
    const { events } = await run(data);
    const setup = events.find((e) => e.type === 'setup');
    expect(setup).toBeDefined();
    // 후보의 수는 구조에서 나오므로 payload 에 없다. 그 문이 닫혀 있는지 본다.
    expect(Object.keys(payload(setup!))).toEqual([]);

    const scenes = sceneTrack(events);
    expect(candidateCount(scenes[1]!)).toBe(here.total);
    // 답의 수도 미리 실어 오지 않는다 — 다 훑고 나서야 셋이 된다.
    expect(lastScene(events).found.length).toBe(here.answers.length);
    // 판을 그릴 수 있는 크기인가 — 이 조각이 곧이곧대로 그리는 근거다.
    expect(here.total).toBe(2 ** data.values.length);
  });

  it('건네받는 후보는 번호가 가장 작은 답이고, 더한 자취가 합에 닿는다', async () => {
    const { events } = await run(data);
    const given = events.find((e) => e.type === 'verify-candidate');
    expect(given).toBeDefined();
    const p = payload(given!);

    const wantPicked = [...here.answers]
      .map((picked) => ({ picked, mask: maskOf(data.values, picked) }))
      .sort((a, b) => a.mask - b.mask)[0]!;

    // 싣는 것은 판정 하나 — 어느 후보를 건네받았나. 나머지는 번호에서 펼쳐진다.
    expect(Object.keys(p).sort()).toEqual(['mask']);
    expect(p.mask).toBe(wantPicked.mask);

    // 화면이 읽는 자리에서 잰다. 고른 수 · 합 · 더한 자취가 전부 여기서 나온다.
    const expanded = expandCandidate(data.values, wantPicked.mask);
    expect(expanded.picked).toEqual(wantPicked.picked);
    expect(expanded.sum).toBe(data.target);

    // partials 는 왼쪽부터 하나씩 더해 온 자취다.
    let acc = 0;
    const wantPartials = wantPicked.picked.map((v) => (acc += v));
    expect(expanded.partials).toEqual(wantPartials);
    expect(wantPartials[wantPartials.length - 1]).toBe(data.target);

    // 장면이 그 후보를 쥐고 있고, 확인 줄이 들여다본 것은 그 하나뿐이다.
    const scenes = sceneTrack(events);
    expect(scenes[2]!.given).toBe(wantPicked.mask);
    expect(verifySeen(scenes[2]!)).toBe(1);
  });

  it('찾기는 후보를 묶어 훑되 하나도 빠뜨리지 않는다', async () => {
    const { events } = await run(data);
    const sweeps = events.filter((e) => e.type === 'sweep-block');

    // 걸음 벽시계 — 낱낱이 보이면 걸음이 예순넷이 된다. 여덟을 넘지 않는다.
    expect(sweeps.length).toBeLessThanOrEqual(8);
    expect(sweeps.length).toBeGreaterThan(1);

    // `from` 도 `seen` 도 `total` 도 싣지 않는다 — 차례는 발신이 오는 순서가 말하고
    // 지금까지 본 수는 장면의 자취가 센다.
    for (const s of sweeps) expect(Object.keys(payload(s)).sort()).toEqual(['found', 'to']);

    // 장면의 자취가 빠짐없이 이어지는가. 앞 걸음이 멈춘 자리에서 다음이 이어야 한다.
    const scenes = sceneTrack(events);
    const swept = scenes.map((s) => s.swept);
    let cursor = 0;
    for (const s of sweeps) {
      expect(payload(s).to).toBeGreaterThan(cursor);
      cursor = payload(s).to as number;
    }
    expect(cursor).toBe(here.total);
    expect(swept[swept.length - 1]).toBe(here.total);
    expect(findSeen(lastScene(events))).toBe(here.total);
  });

  it('답을 셋 다 보인다 — 첫 답에서 멈추지 않는다', async () => {
    const { events } = await run(data);
    const sweeps = events.filter((e) => e.type === 'sweep-block');

    // 선반에 오른 답이 곧 화면이 말하는 답이다.
    const wantMasks = here.answers.map((picked) => maskOf(data.values, picked)).sort((a, b) => a - b);
    const shelf = lastScene(events).found;
    expect([...shelf].sort((a, b) => a - b)).toEqual(wantMasks);
    for (const mask of shelf) expect(expandCandidate(data.values, mask).sum).toBe(data.target);

    // 첫 답이 마지막 묶음보다 앞에 있는데도 훑기가 끝까지 간다.
    const firstHitAt = sweeps.findIndex((s) => (payload(s).found as unknown[]).length > 0);
    expect(firstHitAt).toBeGreaterThanOrEqual(0);
    expect(firstHitAt).toBeLessThan(sweeps.length - 1);
  });

  it('선언한 캡션이 고정 데이터에서 모두 한 번은 뜬다', async () => {
    const { events } = await run(data);
    const sweeps = events.filter((e) => e.type === 'sweep-block');
    const withHit = sweeps.filter((s) => (payload(s).found as unknown[]).length > 0);
    const without = sweeps.filter((s) => (payload(s).found as unknown[]).length === 0);

    // caption.hit / caption.sweep 가 갈리는 자리다. 한쪽이 0 이면 죽은 문안이 생긴다.
    expect(withHit.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);

    const declared = Object.keys(verifyVsFindFacet.messages ?? {}).sort();
    expect(declared).toEqual([
      'caption.done',
      'caption.hit',
      'caption.setup',
      'caption.sweep',
      'caption.verify',
      'label.find',
      'label.target',
      'label.verify',
    ]);
  });

  it('두 줄이 같은 단위를 센다 — 들여다본 후보의 수', async () => {
    const { events, metrics } = await run(data);
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    // 이 조각의 자랑인 두 수가 상수로 실려 오지 않는다. 화면의 자취가 센다.
    expect(Object.keys(payload(done!))).toEqual([]);

    const end = lastScene(events);
    expect(verifySeen(end)).toBe(1);
    expect(findSeen(end)).toBe(here.total);
    // 자취가 곧 그 수다 — 확인 줄의 칸 하나, 찾기 줄의 훑은 칸 전부.
    expect(end.given).not.toBeNull();
    expect(end.swept).toBe(here.total);

    // 조각은 셀 것이 없으므로 metric 을 부르지 않는다 (S-piece · C5).
    expect(metrics).toBe(0);
  });

  it('걸음의 차례가 논증이 된다 — 문제 · 건네받은 하나 · 전수 · 매듭', async () => {
    const { events } = await run(data);
    const kinds = events.map((e) => e.type);
    expect(kinds[0]).toBe('setup');
    expect(kinds[1]).toBe('verify-candidate');
    expect(kinds[kinds.length - 1]).toBe('done');
    expect(new Set(kinds)).toEqual(new Set(['setup', 'verify-candidate', 'sweep-block', 'done']));
  });

  it('자동 재생이 끝난 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 간다', async () => {
    const auto = await run(data);
    const pressed = await run(data, 1);

    const after = pressed.events.slice(auto.events.length).map((e) => e.type);
    expect(after[0]).toBe('rewind');
    expect(after[1]).toBe('setup');
    expect(after.length).toBeGreaterThan(1);
  });

  it('조각의 선언 — 장면 방식이라 띠를 달고, 계기도 머리말도 배치도 없다', () => {
    expect(verifyVsFindFacet.layout).toBeUndefined();
    // 장면과 projector 는 하나만 선언한다 (S-scene).
    expect(verifyVsFindFacet.scene).toBe('module:verifyVsFindScene');
    expect(verifyVsFindFacet.projector).toBeUndefined();

    const blocks = verifyVsFindFacet.blocks as Record<string, Record<string, unknown>>;
    expect(Object.keys(blocks).sort()).toEqual(['controls', 'stage']);
    expect(blocks.stage!.type).toBe('verify-vs-find-stage');
    expect(blocks.controls!.metrics).toBeUndefined();

    // 띠와 `advance` 를 함께 두지 않는다 (S-piece).
    const controls = blocks.controls!.controls as { action: string }[];
    expect(controls.map((c) => c.action).sort()).toEqual(['reset', 'seek']);
  });

  it('되감기가 바탕만 남긴다 — 걸어온 자취가 딸려 오지 않는다', async () => {
    const { events } = await run(data);
    const end = lastScene(events);
    expect(end.swept).toBeGreaterThan(0);

    const rewound = verifyVsFindScene.reduce(end, { type: 'rewind' });
    expect(rewound).toEqual(verifyVsFindScene.initial(data));
  });

  it('첫 장면이 선언을 참조로 쥐지 않는다 — 걸음이 굴린 자료가 바탕을 물들이지 않는다', () => {
    const live = { ...data, values: [...data.values] };
    const first = verifyVsFindScene.initial(live);
    live.values[0] = 999;
    expect(first.values).toEqual(data.values);
  });

  it('밖으로 낸 셈이 알고리즘의 발신과 같은 답에 닿는다', () => {
    const result = computeVerifyVsFindResult(data);
    expect(result.candidates).toBe(here.total);
    expect(result.answers.map((a) => a.picked)).toEqual(
      [...here.answers]
        .map((picked) => ({ picked, mask: maskOf(data.values, picked) }))
        .sort((a, b) => a.mask - b.mask)
        .map((a) => a.picked),
    );
    expect(result.given.sum).toBe(data.target);
  });
});
