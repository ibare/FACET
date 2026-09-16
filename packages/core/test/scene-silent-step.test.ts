/**
 * 조용한 발신은 걸음을 늘리지 않는다 — 걸음 번호와 장면 번호가 같아야 한다.
 *
 * 띠는 `renderStep(step)` 으로 걸음 번호를 건네고, 러너는 그것으로 `SceneTrack.at(step)`
 * 을 꺼내 그린다. 그러니 **두 셈이 같은 것을 세야 한다.**
 *
 * `Timeline` 은 걸음의 경계를 `silent` 가 아닌 발신으로 가른다 (`timeline.ts` 의 `ends`,
 * S-runtime 의 silent 규약). `SceneTrack` 이 조용한 발신에도 장면을 하나 더 쌓으면 그
 * 순간부터 **뒤의 모든 걸음이 한 칸씩 밀린다.**
 *
 * 눈으로는 거의 안 잡힌다. 조용한 발신 자체는 대개 화면을 바꾸지 않아 그 걸음은 멀쩡해
 * 보이고, 어긋나는 것은 그 뒤다. 되짚기 감사(`scene-audit`)도 화면만 보므로 조용한
 * 발신이 화면을 안 바꾸면 통과시킨다.
 *
 * 실제로 `bst-compare-and-go` 를 옮기다 나왔다. 조각 87 개가 `silent: true` 를 쓰므로
 * 남은 이행 전체가 이 자리를 지난다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { SceneTrack } from '../src/runtime/scene.js';
import type { ScenePlan } from '../src/runtime/scene.js';
import type { FacetRuntimeEvent } from '../src/types/event.js';

/** 받은 발신의 종류를 차례로 이어 붙이기만 하는 장면. 무엇이 반영됐는지 눈에 보인다. */
const plan: ScenePlan<string[]> = {
  initial: () => [],
  reduce: (scene, event) => [...scene, event.type],
};

describe('장면과 걸음의 셈', () => {
  it('조용한 발신은 걸음을 늘리지 않는다', () => {
    const track = new SceneTrack(plan, {});

    track.push({ type: 'a' } as FacetRuntimeEvent);
    track.push({ type: 'quiet', silent: true } as FacetRuntimeEvent);
    track.push({ type: 'b' } as FacetRuntimeEvent);

    // 걸음은 둘이다 — `a` 와 `b`. 조용한 발신은 그 사이에 끼어 걸음을 만들지 않는다.
    expect(track.length).toBe(2);

    // 그러면서도 조용한 발신이 화면에 남긴 것은 장면에 반영돼 있다.
    expect(track.at(1)).toEqual(['a', 'quiet']);
    expect(track.at(2)).toEqual(['a', 'quiet', 'b']);
  });

  it('조용한 발신이 이어져도 걸음은 하나다', () => {
    const track = new SceneTrack(plan, {});

    track.push({ type: 'a' } as FacetRuntimeEvent);
    track.push({ type: 'q1', silent: true } as FacetRuntimeEvent);
    track.push({ type: 'q2', silent: true } as FacetRuntimeEvent);

    expect(track.length).toBe(1);
    expect(track.at(1)).toEqual(['a', 'q1', 'q2']);
  });

  it('첫 걸음 앞의 조용한 발신은 첫 장면에 든다', () => {
    const track = new SceneTrack(plan, {});

    track.push({ type: 'quiet', silent: true } as FacetRuntimeEvent);

    // 걸음 0 은 여전히 첫 장면이고, 조용한 발신이 그 장면에 반영돼 있다.
    expect(track.length).toBe(0);
    expect(track.at(0)).toEqual(['quiet']);
  });

  it('조용한 발신이 끼어도 걸음 번호로 꺼낸 장면이 그 걸음의 것이다', () => {
    const track = new SceneTrack(plan, {});
    const log: FacetRuntimeEvent[] = [
      { type: 's1' },
      { type: 'quiet', silent: true },
      { type: 's2' },
      { type: 's3' },
    ] as FacetRuntimeEvent[];

    // Timeline 이 세는 것과 같은 잣대로 걸음의 마지막 장면을 따로 적어 둔다.
    const expected: string[][] = [];
    const seen: string[] = [];
    for (const event of log) {
      seen.push(event.type);
      if (event.silent !== true) expected.push([...seen]);
      else if (expected.length > 0) expected[expected.length - 1] = [...seen];
    }

    for (const event of log) track.push(event);

    expect(track.length).toBe(expected.length);
    for (let step = 1; step <= expected.length; step += 1) {
      expect(track.at(step)).toEqual(expected[step - 1]);
    }
  });
});
