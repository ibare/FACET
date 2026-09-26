/**
 * cooperative-yielding — 협조적 양보. 500 행을 쪼개어 다음 조각을 태스크 줄
 * (`setTimeout`) 또는 마이크로태스크 줄(`queueMicrotask`)에 잇는 것에 따라 화면이
 * 사는지 멎는지, 클릭이 얼마나 기다리는지를 셈한다.
 *
 * 이벤트 (모두 `rc.emit` 으로, `phase` 만 silent):
 *   - `round-start` { chunkSize: number; via: 0 | 1; numChunks: number; chunkMs: number }
 *     새 판이 시작됐다. 화면을 처음 상태로 되돌리고 지금 손잡이 값에 맞는 코드
 *     조각을 보인다.
 *   - `chunk` { dom: number } — 조각 하나가 끝나 DOM 행 수가 올랐다.
 *   - `render` { dom: number; atMs: number } — 화면(screen)이 DOM 값을 따라잡아
 *     다시 그려졌다.
 *   - `click` { id: string; arrivalMs: number; waitMs: number } — 클릭이 처리돼
 *     기다림 값이 확정됐다.
 *   - `done` { atMs: number } — 500 행이 모두 DOM 에 들어갔다 (표준 이벤트 재사용).
 *   - `phase` { phase: 'chunk' | 'click' | 'render' } (silent: true) — 코드 패널
 *     동기화용 메타 이벤트. phase 어휘는 `irs.ts` 와 정확히 같다.
 *
 * 계기: `renders`(이번 판의 누적 렌더 횟수) · `longest-wait`(이번 판 클릭 기다림의
 * 최댓값 ms). 둘 다 "지금 보이는 값을 들고 차이만 보내는" 텔레스코핑 헬퍼로 보낸다
 * — `ctx.metric` 은 누적 채널이라 판이 바뀔 때 0 으로 되돌리는 것도 이 헬퍼로 한다.
 *
 * 모형(공통 안내문 · 사양의 "규약" 절 그대로): 태스크 줄은 하나(FIFO, 시각순).
 * `setTimeout` 은 매 조각마다 새 태스크로 다시 줄을 선다(중첩 수준이 5 를 넘으면,
 * 곧 실행 중인 조각의 수준이 5 보다 크면 다음 조각에 4ms 하한이 걸린다).
 * `queueMicrotask` 는 마이크로태스크 줄이 빌 때까지 한 태스크 안에서 전부 돈다.
 * 렌더 기회는 한 태스크가 끝날 때마다, 그리고 할 일이 없어 다음 태스크를 기다리는
 * 동안(idle) 경계를 지날 때마다 온다 — 지금 프레임 경계 번호(`(t*60)//1000`)가
 * 마지막으로 그린 경계보다 크고 DOM 값이 화면 값과 다를 때만 그린다.
 * 500 행이 다 끝난 뒤에도 화면이 DOM 과 다르면 다음 경계에서 마지막으로 한 번 더
 * 그린다. 계산은 전부 정수다(밀리초는 항상 정수, 프레임 경계 비교는 교차곱으로).
 *
 * 걸음(sleep) 은 클릭 도착 · 렌더 · 다 됨(done) 에서만 둔다. 그 사이의 조각 처리는
 * sleep 없이 연달아 emit 한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CooperativeYieldingData = {
  type: 'cooperativeYielding';
  stepMs: number;
  totalRows: number;
  msPer100Rows: number;
  clickIds: string[];
  clickTimes: number[];
  clickProcessMs: number;
  nestingFloorLevel: number;
  nestingFloorMs: number;
  chunkSizes: number[];
  viaOptions: number[];
  chunkSize: number;
  via: number;
  codeSetTimeout: string;
  codeQueueMicrotask: string;
};

/** "지금 보이는 값" 을 들고 차이만 보내는 계기 헬퍼 (호출부는 늘 리터럴 이름). */
function makeMetricSync(rc: ReactiveContext<CooperativeYieldingData>) {
  const shown = new Map<string, number>();
  return (name: string, value: number): void => {
    const prev = shown.get(name) ?? 0;
    rc.metric(name, value - prev);
    shown.set(name, value);
  };
}

/** 한 판을 끝까지 재생한다. 취소되면 false. */
async function playRound(
  rc: ReactiveContext<CooperativeYieldingData>,
  chunkSize: number,
  viaMicro: boolean,
  sync: (name: string, value: number) => void,
): Promise<boolean> {
  const d = rc.data;
  const phase = (name: 'chunk' | 'click' | 'render') => rc.emit({ type: 'phase', payload: { phase: name }, silent: true });

  if (d.totalRows % chunkSize !== 0) throw new Error(`쪼갬 크기 ${chunkSize} 가 총 행수를 나누어떨어뜨리지 못한다`);
  const chunkMs = Math.floor((chunkSize * d.msPer100Rows) / 100);
  const numChunks = Math.floor(d.totalRows / chunkSize);

  await rc.emit({
    type: 'round-start',
    payload: { chunkSize, via: viaMicro ? 1 : 0, numChunks, chunkMs },
  });
  sync('renders', 0);
  sync('longest-wait', 0);

  let t = 0;
  let level = 0;
  let dom = 0;
  let screen = 0;
  let lastBoundary = 0;
  let clickIdx = 0;
  let renders = 0;
  let longestWait = 0;

  /** 지금 t 를 기준으로 프레임 경계를 지났으면 화면을 dom 에 맞춘다. */
  async function checkRenderAtTaskEnd(): Promise<boolean> {
    if (rc.cancelled) return false;
    const k = Math.floor((t * 60) / 1000);
    if (k <= lastBoundary) return true;
    lastBoundary = k;
    if (screen === dom) return true;
    renders += 1;
    await phase('render');
    await rc.emit({ type: 'render', payload: { dom, atMs: t } });
    screen = dom;
    sync('renders', renders);
    return rc.sleep(d.stepMs);
  }

  /** 할 일이 없어 target 까지 idle 로 기다리는 동안 지나가는 경계마다 본다. target 자신과 겹치는 경계는 그 태스크 몫이라 보지 않는다. */
  async function idleRenderUntil(target: number): Promise<boolean> {
    for (;;) {
      if (rc.cancelled) return false;
      const nextBoundary = lastBoundary + 1;
      if (nextBoundary * 1000 >= target * 60) return true;
      lastBoundary = nextBoundary;
      if (screen === dom) continue;
      renders += 1;
      const at = Math.floor((nextBoundary * 1000) / 60);
      await phase('render');
      await rc.emit({ type: 'render', payload: { dom, atMs: at } });
      screen = dom;
      sync('renders', renders);
      if (!(await rc.sleep(d.stepMs))) return false;
    }
  }

  async function runClick(): Promise<boolean> {
    if (rc.cancelled) return false;
    const arrival = d.clickTimes[clickIdx];
    const id = d.clickIds[clickIdx];
    if (arrival === undefined || id === undefined) throw new Error(`클릭 자료가 모자란다: ${clickIdx}`);
    t = Math.max(t, arrival);
    const wait = t - arrival;
    longestWait = Math.max(longestWait, wait);
    await phase('click');
    await rc.emit({ type: 'click', payload: { id, arrivalMs: arrival, waitMs: wait } });
    sync('longest-wait', longestWait);
    if (!(await rc.sleep(d.stepMs))) return false;
    t += d.clickProcessMs;
    clickIdx += 1;
    return checkRenderAtTaskEnd();
  }

  if (viaMicro) {
    // 마이크로태스크 줄 — 조각 전부가 한 태스크 안에서 sleep 없이 돈다.
    for (let i = 0; i < numChunks; i += 1) {
      if (rc.cancelled) return false;
      const add = Math.min(chunkSize, d.totalRows - dom);
      dom += add;
      t += chunkMs;
      await phase('chunk');
      await rc.emit({ type: 'chunk', payload: { dom } });
    }
    if (!(await checkRenderAtTaskEnd())) return false;
    if (rc.cancelled) return false;
    await phase('chunk');
    await rc.emit({ type: 'done', payload: { atMs: t } });
    if (!(await rc.sleep(d.stepMs))) return false;
    while (clickIdx < 3) {
      if (rc.cancelled) return false;
      if (!(await runClick())) return false;
    }
    return true;
  }

  // 태스크 줄 — 조각마다 새 태스크로 다시 선다.
  let scheduledNext = 0;
  let scheduledActive = true;
  while (scheduledActive || clickIdx < 3) {
    if (rc.cancelled) return false;
    const nextClickAt = clickIdx < 3 ? d.clickTimes[clickIdx]! : Number.MAX_SAFE_INTEGER;
    const target = scheduledActive ? Math.min(scheduledNext, nextClickAt) : nextClickAt;
    if (!(await idleRenderUntil(Math.max(t, target)))) return false;
    if (rc.cancelled) return false;

    if (scheduledActive && scheduledNext <= nextClickAt) {
      t = Math.max(t, scheduledNext);
      const add = Math.min(chunkSize, d.totalRows - dom);
      dom += add;
      t += chunkMs;
      await phase('chunk');
      await rc.emit({ type: 'chunk', payload: { dom } });
      if (!(await checkRenderAtTaskEnd())) return false;
      if (rc.cancelled) return false;
      if (dom < d.totalRows) {
        const delay = level > d.nestingFloorLevel ? d.nestingFloorMs : 0;
        scheduledNext = t + delay;
        level += 1;
      } else {
        scheduledActive = false;
        await phase('chunk');
        await rc.emit({ type: 'done', payload: { atMs: t } });
        if (!(await rc.sleep(d.stepMs))) return false;
      }
    } else {
      if (!(await runClick())) return false;
    }
  }

  if (screen !== dom) {
    const nextBoundary = lastBoundary + 1;
    t = Math.floor((nextBoundary * 1000) / 60);
    renders += 1;
    await phase('render');
    await rc.emit({ type: 'render', payload: { dom, atMs: t } });
    sync('renders', renders);
    if (!(await rc.sleep(d.stepMs))) return false;
  }
  return true;
}

export async function cooperativeYieldingAlgorithm(ctx: FacetContext<CooperativeYieldingData>): Promise<void> {
  const rc = ctx as ReactiveContext<CooperativeYieldingData>;
  const sync = makeMetricSync(rc);
  let chunkSize = rc.data.chunkSize;
  let via = rc.data.via;
  try {
    for (;;) {
      if (rc.cancelled) return;
      const ok = await playRound(rc, chunkSize, via === 1, sync);
      if (!ok) return;
      // 알아보는 손잡이 값이 올 때까지 기다린다 — 그 사이의 입력은 continue 로 흘린다.
      for (;;) {
        if (rc.cancelled) return;
        const input = await rc.waitForInput();
        if (rc.cancelled) return;
        if (input.type !== 'chunkSize' && input.type !== 'via') continue;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const rec = payload as Record<string, unknown>;
        if (typeof rec.value !== 'number') continue;
        if (input.type === 'chunkSize') {
          if (!rc.data.chunkSizes.includes(rec.value)) continue;
          chunkSize = rec.value;
        } else {
          if (!rc.data.viaOptions.includes(rec.value)) continue;
          via = rec.value;
        }
        break;
      }
    }
  } catch (err) {
    if (!rc.cancelled) throw err;
  }
}
