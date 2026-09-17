/**
 * 두 방식이 같은 답에 닿는지, 그리고 각자 더 쓴 칸 수가 몇인지 잰다.
 *
 * 화면에 뜨는 "추가 n칸" 은 지어낸 값이 아니라 이 셈의 결과다 (S-piece).
 *
 * **넓이는 발신이 아니라 장면에서 잰다.** algorithm 은 걸음이 내리는 판정 둘만
 * 싣고(`dropTo` · `takeFrom`), 넓이도 결과 배열도 장면이 구조에서 센다. 그래서
 * 이 검사도 이벤트를 `reduce` 에 먹여 나온 장면을 본다 — 화면이 보는 것과 같은
 * 수를 재는 셈이다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  computeInPlaceVsExtraResult,
  inPlaceVsExtra,
  type InPlaceVsExtraData,
} from '../src/algorithm.js';
import {
  copiedValuesOf,
  extraCellsOf,
  inPlaceVsExtraScene,
  type InPlaceVsExtraScene,
} from '../src/scene.js';

const DATA: InPlaceVsExtraData = {
  type: 'in-place-vs-extra',
  values: [8, 3, 5, 1],
  stepMs: 0,
};

/** 자동 재생 한 바퀴만 돌리고 멈추는 최소 컨텍스트. */
async function runOnce(data: InPlaceVsExtraData): Promise<FacetRuntimeEvent[]> {
  const events: FacetRuntimeEvent[] = [];
  const ctx = {
    data: { ...data, values: [...data.values] },
    cancelled: false,
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(): void {},
    // 재생을 마친 뒤의 대기는 곧 취소로 본다 — 한 바퀴만 재고 끝낸다.
    async waitForInput(): Promise<never> {
      throw new Error('cancelled');
    },
    pollInput(): null {
      return null;
    },
    async sleep(): Promise<boolean> {
      return true;
    },
  };
  try {
    await inPlaceVsExtra(ctx as unknown as FacetContext<InPlaceVsExtraData>);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }
  return events;
}

/** 걸음마다의 장면. 러너가 `SceneTrack` 으로 쌓는 것과 같은 것을 손으로 쌓는다. */
function scenesOf(events: FacetRuntimeEvent[], data: InPlaceVsExtraData): InPlaceVsExtraScene[] {
  const track: InPlaceVsExtraScene[] = [inPlaceVsExtraScene.initial(data)];
  for (const event of events) {
    track.push(inPlaceVsExtraScene.reduce(track[track.length - 1], event));
  }
  return track;
}

describe('inPlaceVsExtra', () => {
  it('두 방식이 같은 순서에 닿는다', async () => {
    const events = await runOnce(DATA);
    const scenes = scenesOf(events, DATA);
    const last = scenes[scenes.length - 1];

    expect(last.inPlace).toEqual([1, 3, 5, 8]);
    expect(copiedValuesOf(last)).toEqual([1, 3, 5, 8]);
    expect(computeInPlaceVsExtraResult(DATA)).toEqual([1, 3, 5, 8]);
  });

  it('제자리는 한 칸, 빌리는 쪽은 원본만큼 더 쓴다', async () => {
    const events = await runOnce(DATA);
    const scenes = scenesOf(events, DATA);
    const extras = scenes.map((scene) => extraCellsOf(scene));

    // 처음 · 값이 놓인 뒤 · 라운드 넷 · 마무리.
    expect(extras.map((e) => e.inPlace)).toEqual([0, 0, 1, 1, 1, 1, 1]);
    expect(extras.map((e) => e.copy)).toEqual([0, 0, 1, 2, 3, 4, 4]);
    expect(extras[extras.length - 1]).toEqual({ inPlace: 1, copy: DATA.values.length });
  });

  it('걸음은 시작 · 라운드 넷 · 마무리이고, 라운드는 판정 둘만 싣는다', async () => {
    const events = await runOnce(DATA);
    expect(events.map((e) => e.type)).toEqual([
      'begin',
      'round',
      'round',
      'round',
      'round',
      'done',
    ]);
    // 넓이도 차례도 배열도 싣지 않는다 — 전부 장면이 구조에서 센다.
    for (const event of events) {
      const keys = Object.keys(event.payload ?? {});
      expect(keys).toEqual(event.type === 'round' ? ['dropTo', 'takeFrom'] : []);
    }
  });

  it('재생을 마친 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다', async () => {
    // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    const events: FacetRuntimeEvent[] = [];
    let advances = 3;
    const ctx = {
      data: { ...DATA, values: [...DATA.values] },
      cancelled: false,
      async emit(event: FacetRuntimeEvent): Promise<void> {
        events.push(event);
      },
      metric(): void {},
      async waitForInput(): Promise<{ type: string }> {
        if (advances-- <= 0) throw new Error('cancelled');
        return { type: 'advance' };
      },
      pollInput(): null {
        return null;
      },
      async sleep(): Promise<boolean> {
        return true;
      },
    };
    try {
      await inPlaceVsExtra(ctx as unknown as FacetContext<InPlaceVsExtraData>);
    } catch (err) {
      if ((err as Error).message !== 'cancelled') throw err;
    }
    expect(events.map((e) => e.type)).toEqual([
      'begin',
      'round',
      'round',
      'round',
      'round',
      'done',
      // 첫 누름 — 되감고 곧바로 첫 걸음.
      'rewind',
      'begin',
      // 그 뒤로는 한 번에 한 걸음.
      'round',
      'round',
    ]);

    // 되감기는 걸어온 자취를 턴다 — 바탕만 남고 넓이가 0 으로 돌아간다.
    const scenes = scenesOf(events.slice(0, 7), DATA);
    const rewound = scenes[scenes.length - 1];
    expect(rewound.inPlace).toEqual([]);
    expect(rewound.takenCells).toEqual([]);
    expect(extraCellsOf(rewound)).toEqual({ inPlace: 0, copy: 0 });
    expect(rewound.values).toEqual(DATA.values);
  });
});
