/**
 * verify-vs-find — 화면에 뜨는 수를 그 자리에서 다시 셈해 대조한다.
 *
 * **여기서는 알고리즘의 셈을 빌려 쓰지 않는다.** `facet.ts` 의 1차 데이터(수
 * 여섯과 목표 하나)만 읽어 이 파일이 부분집합을 따로 전수로 세고, 그 결과를
 * 알고리즘이 **발신한 것**과 견준다. 답 셋을 코드에 타이핑하면 호스트의 오타가
 * 검사까지 함께 통과한다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetRuntimeEvent, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

import {
  computeVerifyVsFindResult,
  verifyVsFind,
  verifyVsFindFacet,
  type VerifyVsFindData,
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

describe('verify-vs-find', () => {
  it('1차 데이터는 수와 목표뿐이다 — 후보 수도 답도 선언에 없다', () => {
    const keys = Object.keys(verifyVsFindFacet.initialData).sort();
    expect(keys).toEqual(['stepMs', 'target', 'type', 'values']);
    expect(verifyVsFindFacet.initialData.type).toBe('verify-vs-find');
  });

  it('후보의 수를 그 자리에서 셈한다', async () => {
    const { events } = await run(data);
    const setup = events.find((e) => e.type === 'setup');
    expect(setup).toBeDefined();
    expect(payload(setup!).candidates).toBe(here.total);
    expect(payload(setup!).answers).toBe(here.answers.length);
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

    expect(p.picked).toEqual(wantPicked.picked);
    expect(p.mask).toBe(wantPicked.mask);
    expect(p.sum).toBe(data.target);
    expect(p.ok).toBe(true);

    // partials 는 왼쪽부터 하나씩 더해 온 자취다.
    let acc = 0;
    const wantPartials = wantPicked.picked.map((v) => (acc += v));
    expect(p.partials).toEqual(wantPartials);
    expect(wantPartials[wantPartials.length - 1]).toBe(data.target);
  });

  it('찾기는 후보를 묶어 훑되 하나도 빠뜨리지 않는다', async () => {
    const { events } = await run(data);
    const sweeps = events.filter((e) => e.type === 'sweep-block');

    // 걸음 벽시계 — 낱낱이 보이면 걸음이 예순넷이 된다. 여덟을 넘지 않는다.
    expect(sweeps.length).toBeLessThanOrEqual(8);
    expect(sweeps.length).toBeGreaterThan(1);

    let cursor = 0;
    for (const s of sweeps) {
      const p = payload(s);
      expect(p.from).toBe(cursor);
      expect(p.seen).toBe(p.to);
      expect(p.total).toBe(here.total);
      cursor = p.to as number;
    }
    expect(cursor).toBe(here.total);
  });

  it('답을 셋 다 보인다 — 첫 답에서 멈추지 않는다', async () => {
    const { events } = await run(data);
    const sweeps = events.filter((e) => e.type === 'sweep-block');
    const hits = sweeps.flatMap((s) => (payload(s).hits as { mask: number; picked: number[]; sum: number }[]));

    const wantMasks = here.answers.map((picked) => maskOf(data.values, picked)).sort((a, b) => a - b);
    expect(hits.map((h) => h.mask).sort((a, b) => a - b)).toEqual(wantMasks);
    for (const h of hits) expect(h.sum).toBe(data.target);

    // 첫 답이 마지막 묶음보다 앞에 있는데도 훑기가 끝까지 간다.
    const firstHitAt = sweeps.findIndex((s) => (payload(s).hits as unknown[]).length > 0);
    expect(firstHitAt).toBeGreaterThanOrEqual(0);
    expect(firstHitAt).toBeLessThan(sweeps.length - 1);
  });

  it('선언한 캡션이 고정 데이터에서 모두 한 번은 뜬다', async () => {
    const { events } = await run(data);
    const sweeps = events.filter((e) => e.type === 'sweep-block');
    const withHit = sweeps.filter((s) => (payload(s).hits as unknown[]).length > 0);
    const without = sweeps.filter((s) => (payload(s).hits as unknown[]).length === 0);

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
    expect(payload(done!).verifySeen).toBe(1);
    expect(payload(done!).findSeen).toBe(here.total);

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

  it('조각의 선언 — 컨트롤 둘, 계기도 머리말도 배치도 없다', () => {
    expect(verifyVsFindFacet.layout).toBeUndefined();
    const blocks = verifyVsFindFacet.blocks as Record<string, Record<string, unknown>>;
    expect(Object.keys(blocks).sort()).toEqual(['controls', 'stage']);
    expect(blocks.stage!.type).toBe('verify-vs-find-stage');
    expect(blocks.controls!.metrics).toBeUndefined();

    const controls = blocks.controls!.controls as { action: string }[];
    expect(controls.map((c) => c.action).sort()).toEqual(['advance', 'reset']);
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
