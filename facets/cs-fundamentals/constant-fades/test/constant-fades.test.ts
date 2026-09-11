/**
 * 화면에 뜨는 수가 참값과 같은지 잰다.
 *
 * **근거의 정본은 스크래치가 아니라 이 파일이다.** 1차 데이터를 `facet.ts` 에서 읽고
 * 그 자리에서 다시 셈해 대조하므로, 선언이 바뀌면 여기가 같이 움직인다. 수를 이
 * 파일에 옮겨 적으면 대조가 아니라 복사가 된다 — 상수와 배율만 읽고 나머지는 전부
 * 여기서 만든다.
 *
 * 잠그는 것 여덟.
 *   1. 선언이 1차 데이터만 준다 — 사다리도 만나는 자리도 값도 적혀 있지 않다.
 *   2. 눈금은 배율의 거듭제곱이고 가장 먼 기둥의 한 눈금 바깥까지 간다.
 *   3. 짚어 본 세 자리의 두 값이 c·n 과 n² 의 참값과 같다.
 *   4. 만나는 자리에서 두 값이 **정확히** 같고, 그 값이 상수의 제곱이다.
 *   5. 상수를 배율만큼 줄이고 키우면 만나는 자리도 꼭 그만큼 옮겨 앉는다
 *      (알고리즘은 훑어서 찾고 여기서는 닫힌 꼴로 견준다 — 방법이 달라야 대조다).
 *   6. 화면에 실리는 수가 32비트를 넘지 않는다.
 *   7. 선언한 문안이 고정 데이터에서 **모두 한 번은** 뜬다.
 *   8. 자동 재생이 끝난 뒤 처음 누르는 advance 가 되감고 첫 걸음까지 간다 (S-piece).
 */

import { describe, expect, it } from 'vitest';
import type {
  FacetRuntimeEvent,
  ProjectorViews,
  ReactiveContext,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { constantFades, type ConstantFadesData } from '../src/algorithm.js';
import { constantFadesFacet } from '../src/facet.js';
import { constantFadesProjector } from '../src/projector.js';

/** 선언에서 읽는다. 이 넷과 stepMs 말고는 선언에 아무 수도 없어야 한다. */
const declared = constantFadesFacet.initialData as unknown as ConstantFadesData;
const C = declared.constant;
const F = declared.factor;

/** 차수가 1 과 2 면 c·n = n² 의 답은 n = c 다. 알고리즘은 훑어서 찾으므로 방법이 다르다. */
function meetingClosedForm(coefficient: number): number {
  return coefficient ** (1 / (declared.quadraticDegree - declared.linearDegree));
}

function clone(): ConstantFadesData {
  return JSON.parse(JSON.stringify(declared)) as ConstantFadesData;
}

type Run = { events: FacetRuntimeEvent[] };

/** 자동 재생만 굴린다 — 끝에서 기다리는 입력은 취소로 깨운다. */
async function runAuto(): Promise<Run> {
  return runWith(0);
}

/** advance 를 `count` 번 눌러 준 뒤 취소한다. */
async function runWith(count: number): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  let left = count;
  let cancelled = false;
  const ctx = {
    data: clone(),
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(): void {
      throw new Error('조각은 metric 을 부르지 않는다 (S-piece)');
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      if (left <= 0) {
        cancelled = true;
        throw new Error('cancelled');
      }
      left -= 1;
      return { type: 'advance' };
    },
    pollInput(): ReactiveInputEvent | null {
      return null;
    },
  } as unknown as ReactiveContext<ConstantFadesData>;

  await constantFades(ctx);
  return { events };
}

function payloadOf(event: FacetRuntimeEvent | undefined): Record<string, unknown> {
  const p = event?.payload;
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}

describe('constant-fades 선언', () => {
  it('1차 데이터만 준다 — 사다리도 값도 적혀 있지 않다', () => {
    expect(Object.keys(declared).sort()).toEqual(
      ['constant', 'factor', 'linearDegree', 'quadraticDegree', 'stepMs', 'type'].sort(),
    );
    for (const value of Object.values(declared)) {
      expect(Array.isArray(value)).toBe(false);
    }
    expect(declared.type).toBe('constant-fades');
    expect(declared.linearDegree).toBe(1);
    expect(declared.quadraticDegree).toBe(2);
  });

  it('걸음 간격이 바닥선 아래로 내려가지 않는다 (S-piece 800ms)', () => {
    expect(declared.stepMs).toBeGreaterThanOrEqual(800);
  });
});

describe('constant-fades 자동 재생', () => {
  it('아홉 걸음을 이 순서로 낸다', async () => {
    const { events } = await runAuto();
    expect(events.map((e) => e.type)).toEqual([
      'axis',
      'probe',
      'probe',
      'probe',
      'boundary',
      'boundary-move',
      'boundary-move',
      'spacing',
      'constant-erased',
    ]);
    // 걸음마다 화면이 바뀐다 — 조용히 지나가는 걸음이 없다.
    expect(events.filter((e) => e.silent === true)).toEqual([]);
  });

  it('눈금이 배율의 거듭제곱이고 가장 먼 기둥의 한 눈금 바깥까지 간다', async () => {
    const { events } = await runAuto();
    const ticks = payloadOf(events[0]).ticks as number[];
    const farthest = meetingClosedForm(C * F);
    const expected: number[] = [];
    for (let v = 1; v <= farthest * F; v *= F) expected.push(v);
    expect(ticks).toEqual(expected);
    expect(ticks[0]).toBe(1);
    expect(ticks[ticks.length - 1]).toBe(farthest * F);
  });

  it('짚어 본 세 자리의 두 값이 참값과 같다', async () => {
    const { events } = await runAuto();
    const probes = events.filter((e) => e.type === 'probe').map((e) => payloadOf(e));
    const stops = [meetingClosedForm(C) / F, meetingClosedForm(C), meetingClosedForm(C) * F];

    expect(probes.map((p) => p.n)).toEqual(stops);
    probes.forEach((p, i) => {
      const n = stops[i]!;
      expect(p.coefficient).toBe(C);
      expect(p.linear).toBe(C * n);
      expect(p.quad).toBe(n * n);
      const expectedLead = C * n === n * n ? 'tie' : C * n > n * n ? 'linear' : 'quad';
      expect(p.lead).toBe(expectedLead);
      const big = Math.max(C * n, n * n);
      const small = Math.min(C * n, n * n);
      expect(p.ratio).toBe(expectedLead === 'tie' ? 1 : big / small);
    });

    // 앞에서는 상수 쪽이 배율만큼 앞서고, 뒤에서는 n² 가 꼭 그만큼 앞선다.
    expect(probes[0]!.lead).toBe('linear');
    expect(probes[0]!.ratio).toBe(F);
    expect(probes[1]!.lead).toBe('tie');
    expect(probes[2]!.lead).toBe('quad');
    expect(probes[2]!.ratio).toBe(F);
  });

  it('만나는 자리에서 두 값이 정확히 같고 그 값이 상수의 제곱이다', async () => {
    const { events } = await runAuto();
    const tie = payloadOf(events.find((e) => e.type === 'probe' && payloadOf(e).lead === 'tie'));
    expect(tie.n).toBe(meetingClosedForm(C));
    expect(tie.linear).toBe(tie.quad);
    expect(tie.linear).toBe(C * C);

    const boundary = payloadOf(events.find((e) => e.type === 'boundary'));
    expect(boundary.coefficient).toBe(C);
    expect(boundary.meeting).toBe(meetingClosedForm(C));
    expect(boundary.value).toBe(C * C);
  });

  it('상수를 줄이고 키우면 만나는 자리가 꼭 그만큼 옮겨 앉는다', async () => {
    const { events } = await runAuto();
    const moves = events.filter((e) => e.type === 'boundary-move').map((e) => payloadOf(e));

    expect(moves[0]!.coefficient).toBe(C / F);
    expect(moves[0]!.meeting).toBe(meetingClosedForm(C / F));
    expect(moves[0]!.previous).toBe(meetingClosedForm(C));
    expect(moves[0]!.value).toBe((C / F) * meetingClosedForm(C / F));

    expect(moves[1]!.coefficient).toBe(C * F);
    expect(moves[1]!.meeting).toBe(meetingClosedForm(C * F));
    expect(moves[1]!.previous).toBe(meetingClosedForm(C / F));
    expect(moves[1]!.value).toBe(C * F * meetingClosedForm(C * F));

    const spacing = payloadOf(events.find((e) => e.type === 'spacing'));
    expect(spacing.factor).toBe(F);
    const marks = spacing.marks as Array<{ coefficient: number; meeting: number }>;
    expect(marks.map((m) => m.coefficient)).toEqual([C / F, C, C * F]);
    // 상수가 배율만큼 커질 때 만나는 자리도 배율만큼 커진다 — 이것이 이 조각의 주장이다.
    marks.forEach((m) => expect(m.meeting).toBe(meetingClosedForm(m.coefficient)));
    expect(marks[1]!.meeting / marks[0]!.meeting).toBe(F);
    expect(marks[2]!.meeting / marks[1]!.meeting).toBe(F);
  });

  it('화면에 실리는 수가 32비트를 넘지 않는다', async () => {
    const { events } = await runAuto();
    const seen: number[] = [];
    const walk = (value: unknown): void => {
      if (typeof value === 'number') seen.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (typeof value === 'object' && value !== null) Object.values(value).forEach(walk);
    };
    events.forEach((e) => walk(e.payload));
    expect(seen.length).toBeGreaterThan(0);
    for (const n of seen) expect(Math.abs(n)).toBeLessThan(2 ** 31);
  });
});

describe('constant-fades 문안', () => {
  it('선언한 문안이 고정 데이터에서 모두 한 번은 뜬다', async () => {
    const { events } = await runAuto();
    const asked: string[] = [];
    const stage = {
      showAxis: (): void => {},
      showProbe: (): void => {},
      plantBoundary: (): void => {},
      moveBoundary: (): void => {},
      showSpacing: (): void => {},
      eraseConstants: (): void => {},
      setCaption: (): void => {},
      rewind: (): void => {},
    };
    const projector = constantFadesProjector({ stage } as unknown as ProjectorViews, {
      getSpeed: () => 1,
      t: (key: string, fallback: string) => {
        asked.push(key);
        return fallback;
      },
    });
    for (const event of events) await projector.onEvent(event);

    expect(new Set(asked)).toEqual(new Set(Object.keys(constantFadesFacet.messages ?? {})));
  });
});

describe('constant-fades 한 걸음씩', () => {
  it('자동 재생이 끝난 뒤 처음 누르는 advance 가 되감고 첫 걸음까지 간다', async () => {
    const auto = await runAuto();
    const { events } = await runWith(1);

    expect(events.length).toBe(auto.events.length + 2);
    expect(events[auto.events.length]!.type).toBe('rewind');
    expect(events[auto.events.length + 1]!.type).toBe('axis');
  });
});
