/**
 * 화면에 뜨는 수가 참값과 같은지 잰다.
 *
 * **근거의 정본은 스크래치가 아니라 이 파일이다.** 1차 데이터를 `facet.ts` 에서 읽고
 * 그 자리에서 다시 셈해 대조하므로, 선언이 바뀌면 여기가 같이 움직인다. 수를 이
 * 파일에 옮겨 적으면 대조가 아니라 복사가 된다 — 상수와 배율만 읽고 나머지는 전부
 * 여기서 만든다.
 *
 * ── 장면(Scene) 으로 옮기며 재는 자리가 바뀌었다
 *
 * 옛 검사는 발신의 payload 를 곧바로 들여다봤다. 그런데 이제 **두 값도 앞선 쪽도
 * 배수도 발신에 없다** — 자리와 상수만 오고 나머지는 장면이 셈한다. 그러니 재는
 * 자리도 장면과 화면으로 옮긴다. 잠그려는 뜻은 그대로다: 화면에 뜨는 수가 참값과
 * 같은가.
 *
 * 잠그는 것 열.
 *   1. 선언이 1차 데이터만 준다 — 사다리도 만나는 자리도 값도 적혀 있지 않다.
 *   2. **발신이 셈할 수 있는 것을 싣지 않는다** — payload 의 열쇠가 딱 그만큼이다.
 *   3. 눈금은 배율의 거듭제곱이고 가장 먼 기둥의 한 눈금 바깥까지 간다.
 *   4. 짚어 본 세 자리의 두 값이 c·n 과 n² 의 참값과 같고, 그 수가 화면에 뜬다.
 *   5. 만나는 자리에서 두 값이 **정확히** 같고, 그 값이 상수의 제곱이다.
 *   6. 상수를 배율만큼 줄이고 키우면 만나는 자리도 꼭 그만큼 옮겨 앉는다
 *      (알고리즘은 훑어서 찾고 여기서는 닫힌 꼴로 견준다 — 방법이 달라야 대조다).
 *      그리고 화면의 `×10` 이 **실제로 선 두 기둥의 거리**에서 나온다.
 *   7. 화면에 실리는 수가 32비트를 넘지 않는다.
 *   8. 선언한 문안이 고정 데이터에서 **모두 한 번은** 뜬다.
 *   9. **상수를 지운 뒤에도 짚은 자국이 남는다** — "작을 때는 상수가 컸다" 가
 *      마지막 화면에서 사라지지 않는다. 이행이 고친 결함이다.
 *  10. 걸음을 뛰어다녀도 각 화면이 곧바로 세운 것과 글자 하나 다르지 않다 (되짚기).
 *  11. 자동 재생이 끝난 뒤 처음 누르는 advance 가 되감고 첫 걸음까지 간다 (S-piece).
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  FacetRuntimeEvent,
  SceneRenderer,
  Translate,
  ViewInstance,
} from '@ffacet/core/runtime';
import { constantFades, type ConstantFadesData } from '../src/algorithm.js';
import { constantFadesFacet } from '../src/facet.js';
import {
  constantFadesScene,
  marksOf,
  readingAt,
  spansOf,
  type ConstantFadesScene,
} from '../src/scene.js';
import { constantFadesStageView } from '../src/constant-fades-stage.js';

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
    async waitForInput(): Promise<{ type: string }> {
      if (left <= 0) {
        cancelled = true;
        throw new Error('cancelled');
      }
      left -= 1;
      return { type: 'advance' };
    },
    pollInput(): null {
      return null;
    },
  } as unknown as Parameters<typeof constantFades>[0];

  await constantFades(ctx);
  return { events };
}

function payloadOf(event: FacetRuntimeEvent | undefined): Record<string, unknown> {
  const p = event?.payload;
  return typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : {};
}

/**
 * 걸음마다의 장면. 러너의 `SceneTrack` 과 같은 셈이다 — 이 조각은 조용한 발신이
 * 없으므로 발신 하나가 걸음 하나다.
 */
function scenesOf(events: FacetRuntimeEvent[]): ConstantFadesScene[] {
  const out: ConstantFadesScene[] = [constantFadesScene.initial(declared)];
  for (const event of events) {
    out.push(constantFadesScene.reduce(out[out.length - 1]!, event));
  }
  return out;
}

type Stage = ViewInstance & SceneRenderer<ConstantFadesScene>;

/** stage 하나를 세운다. `asked` 에 그리는 쪽이 물어본 문안 열쇠가 쌓인다. */
function mountStage(): { stage: Stage; svg: SVGSVGElement; asked: string[] } {
  const container = document.createElement('div');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.appendChild(container);
  container.appendChild(svg);
  const asked: string[] = [];
  const t: Translate = (key, fallback, vars) => {
    asked.push(key);
    let out = fallback ?? key;
    for (const [k, v] of Object.entries(vars ?? {})) out = out.split(`{${k}}`).join(String(v));
    return out;
  };
  const stage = constantFadesStageView.mount(container, {
    config: {},
    canvas: svg,
    t,
  }) as Stage;
  return { stage, svg, asked };
}

/** 화면에 뜬 글자 전부. 수는 자리를 끊어 읽으므로 공백을 지우고 견준다. */
function textsOf(svg: SVGSVGElement): string[] {
  return Array.from(svg.querySelectorAll('text')).map((n) => n.textContent ?? '');
}

function digitsOf(svg: SVGSVGElement): string[] {
  return textsOf(svg).map((s) => s.replace(/\s/g, ''));
}

/** 그 장면을 곧바로 세운다 (되짚기와 같은 길). */
async function draw(stage: Stage, scene: ConstantFadesScene): Promise<void> {
  await stage.render(scene, null, { animate: false });
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

  it('장면 방식이라 띠를 달고 projector 를 두지 않는다', () => {
    expect(constantFadesFacet.scene).toBe('module:constantFadesScene');
    expect(constantFadesFacet.projector).toBeUndefined();
    const controls = constantFadesFacet.blocks?.controls as {
      controls?: Array<{ widget: string }>;
    };
    expect(controls.controls?.map((ctl) => ctl.widget)).toContain('timeline');
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

  it('장면이 셈할 수 있는 것을 싣지 않는다', async () => {
    const { events } = await runAuto();
    const keysOf = (type: string): string[][] =>
      events.filter((e) => e.type === type).map((e) => Object.keys(payloadOf(e)).sort());

    // 척도는 만나는 자리에서 나오고 그것을 찾는 것이 이 조각의 알고리즘이라 싣는다.
    expect(keysOf('axis')).toEqual([['ticks']]);
    // 값도 앞선 쪽도 배수도 자리와 상수가 정한다 — 장면이 셈한다.
    expect(keysOf('probe')).toEqual([['coefficient', 'n'], ['coefficient', 'n'], ['coefficient', 'n']]);
    expect(keysOf('boundary')).toEqual([['coefficient', 'meeting']]);
    // 직전 기둥이 어디였나는 자취가 안다.
    expect(keysOf('boundary-move')).toEqual([
      ['coefficient', 'meeting'],
      ['coefficient', 'meeting'],
    ]);
    // 잴 기둥도 몇 배인지도 자취에 있다.
    expect(keysOf('spacing')).toEqual([[]]);
    expect(keysOf('constant-erased')).toEqual([[]]);
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
});

describe('constant-fades 장면이 셈하는 수', () => {
  it('짚어 본 세 자리의 두 값이 참값과 같고 그 수가 화면에 뜬다', async () => {
    const { events } = await runAuto();
    const scenes = scenesOf(events);
    const { stage, svg } = mountStage();
    const stops = [meetingClosedForm(C) / F, meetingClosedForm(C), meetingClosedForm(C) * F];

    // 짚는 걸음은 발신 차례로 둘째부터 셋이다.
    for (let i = 0; i < stops.length; i += 1) {
      const n = stops[i]!;
      const scene = scenes[2 + i]!;
      const probes = scene.probes;
      expect(probes.length).toBe(i + 1);

      const mark = probes[probes.length - 1]!;
      expect(mark.n).toBe(n);
      expect(mark.coefficient).toBe(C);

      const r = readingAt(scene, mark);
      expect(r.linear).toBe(C * n);
      expect(r.quad).toBe(n * n);
      const expectedLead = C * n === n * n ? 'tie' : C * n > n * n ? 'linear' : 'quad';
      expect(r.lead).toBe(expectedLead);
      const big = Math.max(C * n, n * n);
      const small = Math.min(C * n, n * n);
      expect(r.ratio).toBe(expectedLead === 'tie' ? 1 : big / small);

      // 그 두 수가 실제로 칩에 뜬다 — 셈과 화면이 갈리지 않는다.
      await draw(stage, scene);
      const shown = digitsOf(svg);
      expect(shown).toContain(String(C * n));
      expect(shown).toContain(String(n * n));
    }

    // 앞에서는 상수 쪽이 배율만큼 앞서고, 뒤에서는 n² 가 꼭 그만큼 앞선다.
    const read = stops.map((n, i) => readingAt(scenes[2 + i]!, { n, coefficient: C }));
    expect(read[0]!.lead).toBe('linear');
    expect(read[0]!.ratio).toBe(F);
    expect(read[1]!.lead).toBe('tie');
    expect(read[2]!.lead).toBe('quad');
    expect(read[2]!.ratio).toBe(F);

    stage.destroy();
  });

  it('만나는 자리에서 두 값이 정확히 같고 그 값이 상수의 제곱이다', async () => {
    const { events } = await runAuto();
    const scenes = scenesOf(events);

    const tieScene = scenes[3]!;
    const tie = readingAt(tieScene, tieScene.probes[tieScene.probes.length - 1]!);
    expect(tie.n).toBe(meetingClosedForm(C));
    expect(tie.linear).toBe(tie.quad);
    expect(tie.linear).toBe(C * C);

    // 기둥이 선 자리에서도 같은 함수가 같은 답을 낸다.
    const postScene = scenes[5]!;
    const post = postScene.posts[0]!;
    expect(post.coefficient).toBe(C);
    expect(post.meeting).toBe(meetingClosedForm(C));
    const atPost = readingAt(postScene, { n: post.meeting, coefficient: post.coefficient });
    expect(atPost.lead).toBe('tie');
    expect(atPost.linear).toBe(C * C);
  });

  it('상수를 줄이고 키우면 만나는 자리가 꼭 그만큼 옮겨 앉는다', async () => {
    const { events } = await runAuto();
    const scenes = scenesOf(events);

    const afterMoves = scenes[7]!;
    expect(afterMoves.posts.map((p) => p.coefficient)).toEqual([C, C / F, C * F]);
    for (const post of afterMoves.posts) {
      expect(post.meeting).toBe(meetingClosedForm(post.coefficient));
    }

    // 이름표는 n 오름차순으로 선다.
    const marks = marksOf(afterMoves);
    expect(marks.map((m) => m.coefficient)).toEqual([C / F, C, C * F]);

    // 상수가 배율만큼 커질 때 만나는 자리도 배율만큼 커진다 — 이 조각의 주장이다.
    // 그리고 화면의 `×10` 이 **선언의 배율이 아니라 두 기둥의 거리**에서 나온다.
    const spans = spansOf(afterMoves);
    expect(spans.length).toBe(marks.length - 1);
    for (const span of spans) expect(span.ratio).toBe(F);
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

    // 걸음이 싣지 않게 된 수들도 화면에는 뜬다. 장면이 내는 값을 함께 잰다.
    const last = scenesOf(events)[events.length]!;
    for (const mark of last.probes) {
      const r = readingAt(last, mark);
      seen.push(r.linear, r.quad, r.ratio);
    }
    for (const post of last.posts) {
      const r = readingAt(last, { n: post.meeting, coefficient: post.coefficient });
      seen.push(r.linear, r.quad);
    }

    expect(seen.length).toBeGreaterThan(0);
    for (const n of seen) expect(Math.abs(n)).toBeLessThan(2 ** 31);
  });
});

describe('constant-fades 화면', () => {
  it('선언한 문안이 고정 데이터에서 모두 한 번은 뜬다', async () => {
    const { events } = await runAuto();
    const { stage, asked } = mountStage();
    for (const scene of scenesOf(events).slice(1)) await draw(stage, scene);
    expect(new Set(asked)).toEqual(new Set(Object.keys(constantFadesFacet.messages ?? {})));
    stage.destroy();
  });

  it('상수를 지운 뒤에도 짚은 자국이 남는다', async () => {
    const { events } = await runAuto();
    const scenes = scenesOf(events);
    const last = scenes[scenes.length - 1]!;
    expect(last.erased).toBe(true);

    const { stage, svg } = mountStage();
    await draw(stage, last);
    const shown = textsOf(svg);

    // 상수는 화면에서 지워졌다 — `100·n` 같은 표기가 하나도 남지 않는다.
    expect(shown.some((s) => s.includes('·'))).toBe(false);

    // 그런데 어느 자리에서 어느 쪽이 몇 배였는지는 남는다. 그것이 이 조각의
    // 문제 제기(작을 때는 상수가 컸다)이고, 옛 화면은 그것을 지우고 있었다.
    for (const mark of last.probes) {
      const r = readingAt(last, mark);
      const badge = r.lead === 'tie' ? '=' : `×${r.ratio}`;
      expect(shown).toContain(badge);
    }
    expect(last.probes.length).toBe(3);

    stage.destroy();
  });

  it('걸음을 뛰어다녀도 화면이 곧바로 세운 것과 같다', async () => {
    const { events } = await runAuto();
    const scenes = scenesOf(events);

    // 곧바로 세운 화면을 먼저 걷어 둔다.
    const { stage: fresh, svg: freshSvg } = mountStage();
    const settled: string[] = [];
    for (const scene of scenes) {
      await draw(fresh, scene);
      settled.push(freshSvg.innerHTML);
    }
    fresh.destroy();

    // 큰 널뛰기로 오가도 같은 화면이어야 한다 — 되짚기가 가장 깨지기 쉬운 자리다.
    const { stage, svg } = mountStage();
    const last = scenes.length - 1;
    const hops = [last, 7, 0, 5, 2, last, 1, last];
    for (const i of hops) {
      await stage.render(scenes[i]!, null, { animate: false });
      expect(svg.innerHTML).toBe(settled[i]!);
    }
    stage.destroy();
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

  it('되감으면 바탕만 남고 자취가 턴다', async () => {
    const { events } = await runWith(1);
    const scenes = scenesOf(events);
    const first = scenes[0]!;
    const rewound = scenes[events.findIndex((e) => e.type === 'rewind') + 1]!;
    expect(rewound).toEqual(first);

    // 화면도 처음 화면과 글자까지 같다.
    const { stage, svg } = mountStage();
    await draw(stage, first);
    const before = svg.innerHTML;
    await draw(stage, rewound);
    expect(svg.innerHTML).toBe(before);
    stage.destroy();
  });
});
