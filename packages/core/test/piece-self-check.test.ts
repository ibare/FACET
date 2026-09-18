/**
 * 장면 조각 자체 검증 — 조각 하나를 좁혀서 잰다.
 *
 * `FACET_ONLY=<디렉터리 이름,...>` 이 있을 때만 돈다. 평소의 `pnpm test` 에서는
 * 건너뛴다 — 흘려 세우는 걸음을 실제 시간으로 돌리므로 전수면 수 분이 든다.
 * 부르는 곳은 `scripts/piece-check.mjs` 다.
 *
 * Scene 이행 때 에이전트마다 이 검사를 임시 파일로 새로 짰다 (한 편에 230 줄 안팎,
 * 스무 편). 어느 조각에나 같은 것을 재므로 여기 한 벌로 둔다. 조각 고유의 주장
 * (완주 화면에 무엇이 남아야 하는가)은 여기서 재지 않는다 — 그것은 사양의 몫이다.
 *
 * 재는 것 (`tasks/scene-migration-protocol.md` 5 절의 축들):
 *
 *   바탕   `initial` 이 넘겨받은 자료를 참조로 쥐지 않는다 — 알고리즘이 자료를
 *          제자리에서 고친 뒤에도 첫 장면이 그대로인가 (S-scene)
 *   순수   `reduce` 가 앞 장면을 고치지 않는다 — 장면을 깊이 얼려 두고 쌓는다.
 *          제자리 수정이 있으면 TypeError 로 곧바로 터진다
 *   축 1   걸음마다 흘려 세운 화면과 곧바로 세운 화면이 글자 하나 다르지 않다
 *   지연   곧바로 세운 뒤 기다려도 화면이 저 혼자 바뀌지 않는다 (`animate:false`
 *          길에 타이머를 걸었는가)
 *   축 2   걸음을 뛰어다닌 뒤 각 화면이 곧바로 세운 것과 같고, 끝으로 돌아오면
 *          처음 완주 화면과 같다 (이웃 + 큰 널뛰기)
 *   축 3   흘려 세우는 도중 `destroy` 하면 `render` 의 Promise 가 마이크로태스크
 *          안에 풀린다. 끊기 전에는 안 풀려 있는 것도 본다 — 그래야 검사가 헛돌지
 *          않는다
 *
 * 되짚기를 실제 러너와 브라우저로 재는 것은 `scripts/scene-audit.mjs` 다. 여기서
 * 통과해도 그것은 배치를 닫을 때 한 번 돈다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import {
  clearRegistry,
  getAlgorithm,
  getFacetById,
  getScenePlan,
  getView,
  listFacets,
  makeTranslator,
  mountView,
  stripPrefix,
} from '../src/runtime/index.js';
import type { ScenePlan } from '../src/runtime/scene.js';
import type { FacetRuntimeEvent } from '../src/types/event.js';
import type { FacetJson } from '../src/types/facet-json.js';
import { FACET_MODULES, FACET_ONLY } from './facet-modules.js';

type Renderer = {
  render(next: unknown, prev: unknown, opts: { animate: boolean }): void | Promise<void>;
  destroy(): void;
};

type Subject = {
  facet: FacetJson;
  plan: ScenePlan;
  run: (ctx: unknown) => Promise<void>;
  viewType: string;
};

/** 지연 발화를 기다리는 시간. 흔한 운동 한 마디(400~700ms)보다 길게 잡는다. */
const SETTLE_MS = 900;
/** 축 3 에서 "운동이 도는 중" 으로 볼 시점. */
const MID_MS = 40;
/** 축 3 을 잴 걸음 수의 상한. 운동이 있는 걸음을 앞에서부터 이만큼. */
const AXIS3_STEPS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 마이크로태스크만 흘린다. 프레임도 타이머도 돌지 않는다 — 축 3 의 이빨이다. */
async function drainMicrotasks(): Promise<void> {
  for (let i = 0; i < 64; i += 1) await Promise.resolve();
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  return Object.freeze(value);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

async function subjectOf(name: string): Promise<Subject> {
  const row = FACET_MODULES.find(([path]) => path.includes(`/${name}/src/`));
  if (!row) throw new Error(`facet 모듈을 찾지 못했다: ${name}`);
  clearRegistry();
  const mod = await row[1]();
  for (const [k, v] of Object.entries(mod)) {
    if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
  }
  const facet = listFacets()
    .map((id) => getFacetById(id))
    .find((f): f is FacetJson => f !== undefined);
  if (!facet) throw new Error(`등록된 facet 이 없다: ${name}`);
  if (typeof facet.scene !== 'string') throw new Error(`장면 조각이 아니다 (scene 선언 없음): ${facet.id}`);
  const plan = getScenePlan(stripPrefix(facet.scene, 'module'));
  if (!plan) throw new Error(`장면 설계 미등록: ${facet.scene}`);
  const run = getAlgorithm(stripPrefix(facet.algorithm, 'module'));
  if (!run) throw new Error(`알고리즘 미등록: ${facet.algorithm}`);
  const viewType = Object.values(facet.blocks)
    .map((b) => (b as { type?: unknown }).type)
    .find((t): t is string => typeof t === 'string' && t !== 'control-bar');
  if (!viewType) throw new Error(`stage 블록이 없다: ${facet.id}`);
  return { facet, plan, run: run as (ctx: unknown) => Promise<void>, viewType };
}

/**
 * 실제 알고리즘을 돌려 발신을 모은다. `sleep` 은 곧바로 true 를 돌려준다.
 *
 * 자동 재생이 끝나는 표지는 둘 중 먼저 오는 것이다 — 함수가 돌아오거나, 손짚기
 * 루프가 `waitForInput` 에서 기다리기 시작하거나.
 */
async function collectEvents(s: Subject, data: unknown): Promise<FacetRuntimeEvent[]> {
  const events: FacetRuntimeEvent[] = [];
  let idle!: () => void;
  const waiting = new Promise<void>((r) => {
    idle = r;
  });
  const ctx = {
    data,
    cancelled: false,
    metric(): void {},
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    waitForInput(): Promise<never> {
      idle();
      return new Promise<never>(() => {});
    },
    pollInput(): null {
      return null;
    },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('알고리즘이 10 초 안에 끝나지 않았다')), 10_000);
  });
  try {
    await Promise.race([s.run(ctx), waiting, cap]);
  } finally {
    clearTimeout(timer);
  }
  return events;
}

/** `SceneTrack` 과 같은 규칙으로 쌓는다 — silent 는 걸음을 늘리지 않고 갈아 끼운다. */
function buildFrozen(plan: ScenePlan, first: unknown, events: readonly FacetRuntimeEvent[]): unknown[] {
  const scenes: unknown[] = [deepFreeze(clone(first))];
  for (const event of events) {
    const next = deepFreeze(plan.reduce(scenes[scenes.length - 1], event));
    if (event.silent === true) scenes[scenes.length - 1] = next;
    else scenes.push(next);
  }
  return scenes;
}

type Mounted = { svg: () => string; view: Renderer; kill: () => void };

function mountStage(s: Subject, data: unknown): Mounted {
  const view = getView(s.viewType);
  if (!view) throw new Error(`view 미등록: ${s.viewType}`);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const inst = mountView(view, container, {
    config: { type: s.viewType },
    initialData: data as Record<string, unknown>,
    t: makeTranslator('ko', s.facet.messages),
  }) as unknown as Renderer;
  if (typeof inst.render !== 'function') throw new Error(`stage 에 render 가 없다: ${s.viewType}`);
  return {
    svg: () => container.querySelector('svg')?.outerHTML ?? '',
    view: inst,
    kill: () => {
      inst.destroy();
      container.remove();
    },
  };
}

/**
 * 두 화면이 같은지. 다르면 **처음 갈리는 자리** 앞뒤를 보인다 — 기본 메시지는
 * 앞 40 자만 보여 줘서 둘 다 `<svg viewBox=…` 로 시작하는 한 어디가 다른지 모른다.
 */
function expectSame(got: string, want: string, what: string): void {
  if (got === want) return;
  let at = 0;
  while (at < got.length && at < want.length && got[at] === want[at]) at += 1;
  const from = Math.max(0, at - 80);
  throw new Error(
    `${what}\n  처음 갈리는 자리 (${at} 번째 글자)\n  기대: …${want.slice(from, at + 80)}…\n  실제: …${got.slice(from, at + 80)}…`,
  );
}

/** 이웃 뛰기와 큰 널뛰기. 같은 자리 연속은 뺀다. */
function hopsFor(last: number): number[] {
  const raw = [1, 3, 0, 4, 2, last, Math.floor(last / 2), 0, last - 1, 1, last];
  const out: number[] = [];
  for (const h of raw) {
    const v = Math.max(0, Math.min(last, h));
    if (out[out.length - 1] !== v) out.push(v);
  }
  return out;
}

const names = FACET_ONLY ?? [];

describe.skipIf(names.length === 0)('장면 조각 자체 검증', () => {
  for (const name of names) {
    it(`${name} — 바탕 · 순수 · 축 1 · 지연 · 축 2`, async () => {
      const s = await subjectOf(name);
      const data = clone(s.facet.initialData);

      // 러너처럼 한 객체를 장면·알고리즘이 함께 쓴다. 첫 장면은 알고리즘보다 먼저 선다.
      const first = s.plan.initial(data);
      const firstBefore = JSON.stringify(first);
      const events = await collectEvents(s, data);
      expect(events.length, '발신이 하나도 없다 — sleep 스텁이 접혔거나 알고리즘이 곧바로 끝났다').toBeGreaterThan(0);
      expect(JSON.stringify(first), '`initial` 이 넘겨받은 자료를 참조로 쥐고 있다 — 알고리즘이 고친 자료가 첫 장면에 비친다 (S-scene)').toBe(firstBefore);

      // 깊이 얼려 쌓는다. 제자리 수정이 있으면 여기서 TypeError 로 터진다.
      const scenes = buildFrozen(s.plan, first, events);
      const last = scenes.length - 1;
      expect(last, '걸음이 없다').toBeGreaterThan(0);
      const twin = buildFrozen(s.plan, s.plan.initial(clone(s.facet.initialData)), events);
      for (let i = 0; i <= last; i += 1) {
        expect(JSON.stringify(twin[i]), `걸음 ${i} — 같은 발신으로 두 번 쌓은 장면이 다르다 (reduce 가 순수하지 않다)`).toBe(JSON.stringify(scenes[i]));
      }

      // 기준선: 걸음마다 곧바로 세운 화면.
      const inst = mountStage(s, clone(s.facet.initialData));
      const instant: string[] = [];
      for (let i = 0; i <= last; i += 1) {
        await inst.view.render(scenes[i], null, { animate: false });
        instant.push(inst.svg());
      }
      const complete = instant[last] ?? '';
      expect(complete.length, '완주 화면이 비었다').toBeGreaterThan(0);

      // 지연: 곧바로 세운 뒤 저 혼자 바뀌지 않는다.
      await delay(SETTLE_MS);
      expectSame(inst.svg(), complete, '지연 — 곧바로 세운(animate:false) 뒤 화면이 저 혼자 바뀌었다. 되짚기 길에 타이머나 프레임을 걸었다 (S-scene)');
      inst.kill();

      // 축 1: 흘려 세운 화면.
      const flow = mountStage(s, clone(s.facet.initialData));
      for (let i = 0; i <= last; i += 1) {
        await flow.view.render(scenes[i], i === 0 ? null : scenes[i - 1], { animate: i > 0 });
        expectSame(flow.svg(), instant[i] ?? '', `축 1 — 걸음 ${i} 을 흘려 세운 화면이 곧바로 세운 화면과 다르다 (운동이 남긴 속성·보간 끝자리)`);
      }

      // 축 2: 뛰어다닌 뒤.
      let from = last;
      for (const to of hopsFor(last)) {
        await flow.view.render(scenes[to], scenes[from], { animate: false });
        expectSame(flow.svg(), instant[to] ?? '', `축 2 — ${from} 에서 ${to} 로 뛴 화면이 곧바로 세운 화면과 다르다`);
        from = to;
      }
      await flow.view.render(scenes[last], scenes[from], { animate: false });
      expectSame(flow.svg(), complete, '축 2 — 끝으로 돌아온 화면이 처음 완주 화면과 다르다');
      flow.kill();

      console.log(`[piece-self-check] ${name}: 걸음 ${last} · 발신 ${events.length}`);
    }, 180_000);

    it(`${name} — 축 3 (흘리는 도중 destroy)`, async () => {
      const s = await subjectOf(name);
      const data = clone(s.facet.initialData);
      const first = s.plan.initial(data);
      const events = await collectEvents(s, data);
      const scenes = buildFrozen(s.plan, first, events);
      const last = scenes.length - 1;

      let moving = 0;
      for (let i = 1; i <= last && moving < AXIS3_STEPS; i += 1) {
        const stage = mountStage(s, clone(s.facet.initialData));
        await stage.view.render(scenes[i - 1], null, { animate: false });
        let settled = false;
        const running = Promise.resolve(stage.view.render(scenes[i], scenes[i - 1], { animate: true })).then(() => {
          settled = true;
        });
        await delay(MID_MS);
        if (settled) {
          // 이 걸음은 흐를 것이 없다. 끊을 자리가 없으니 다음 걸음을 본다.
          stage.kill();
          continue;
        }
        moving += 1;
        stage.view.destroy();
        await drainMicrotasks();
        expect(settled, `축 3 — 걸음 ${i} 을 흘리는 도중 destroy 했는데 render 의 Promise 가 풀리지 않았다 (S-piece destroy 조항)`).toBe(true);
        await running;
        stage.kill();
      }
      console.log(`[piece-self-check] ${name}: 운동을 끊어 본 걸음 ${moving}${moving === 0 ? ' — 흐르는 걸음이 하나도 없다' : ''}`);
    }, 120_000);
  }
});
