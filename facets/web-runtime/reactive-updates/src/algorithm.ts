/**
 * reactive-updates — 의존 추적 + 배칭.
 *
 * 같은 값 · 같은 뷰 · 같은 쓰기 순서를 두고, "무엇을 다시 그릴지 아는 방법" 과
 * "언제 그리는가" 만 바꿔 다시 그리기 수가 어떻게 갈리는지를 본다.
 *
 * 한 판(round) = "첫 돌기(구독 확립 + 초기 렌더) → 쓰기 k개 → (모드별 마무리) →
 * waitForInput". 손잡이를 돌리면 다음 판을 처음부터 다시 돈다 — 이전 판의
 * 값 변화를 이어받지 않는다(각 판은 `initialData.values` 에서 새로 시작한다).
 *
 * ── 이벤트 (모두 `ctx.emit`, `phase` 만 silent)
 *
 *   phase        { phase: string }                                   silent
 *   subscribe    { value: string; view: string }                     — 첫 돌기: 값→뷰 줄이 그어진다
 *   render       { view: string; text: string;
 *                  mode: 'init' | 'sync' | 'flush' | 'scan'; via?: string }
 *                                                                     — 뷰의 출력이 갱신된다.
 *                  mode==='sync' 일 때만 via(그 값 이름)가 있어 줄을 따라가는 이동을 그릴 수 있다
 *   stash        { name: string; value: string }                     — 줄·모아서: 값이 상자로 들어간다
 *   flush        { count: number }                                   — 줄·모아서: 상자가 비워진다
 *   scan-tick    { index: number; name: string; changed: boolean }    — 훑기: 커서가 값 하나를 지난다
 *
 * ── phase 어휘
 *   read-init(첫 돌기) · write-sync · write-batch · flush-batch · write-scan · scan-round
 *
 * ── 계기
 *   looked    훑기의 "들여다본 수" 누적 (줄·곧바로/줄·모아서에서는 늘 0)
 *   rendered  다시 그린 수 누적 — 줄·곧바로는 줄 수만큼 중복 포함, 나머지 둘은 뷰 집합 크기
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ReactiveValue = number | string | boolean;

export type ReactiveUpdatesValueEntry = { name: string; value: ReactiveValue };
export type ReactiveUpdatesViewEntry = { name: string; body: string; reads: string[] };
export type ReactiveUpdatesWriteEntry = { name: string; value: ReactiveValue };

export type ReactiveUpdatesData = {
  type: 'reactiveUpdates';
  stepMs: number;
  values: ReactiveUpdatesValueEntry[];
  views: ReactiveUpdatesViewEntry[];
  writes: ReactiveUpdatesWriteEntry[];
  modeIds: string[];
};

/** 방식 사다리 — segments[].value 와 같다. */
const MODE_VALUES = [0, 1, 2];
/** 쓰기 수 사다리 — segments[].value 와 같다. */
const WRITE_COUNT_VALUES = [1, 2, 4, 8];

function valueIndex(data: ReactiveUpdatesData, name: string): number {
  const i = data.values.findIndex((v) => v.name === name);
  if (i < 0) throw new Error(`알 수 없는 값 이름: ${name}`);
  return i;
}

/**
 * 값×뷰 구독표를 평평한 0/1 배열로 만든다 — IR 의 `subs` 와 같은 모양이다.
 * `subs[v * viewCount + w] === 1` 이면 뷰 w 가 값 v 를 읽는다.
 */
export function buildSubs(data: ReactiveUpdatesData): number[] {
  const viewCount = data.views.length;
  const subs = new Array<number>(data.values.length * viewCount).fill(0);
  data.views.forEach((view, w) => {
    for (const name of view.reads) {
      subs[valueIndex(data, name) * viewCount + w] = 1;
    }
  });
  return subs;
}

/** `writes` 의 앞 k 개를 값 색인으로 옮긴다 — IR 의 `writes` 인자와 같은 모양이다. */
export function buildWriteIndices(data: ReactiveUpdatesData, k: number): number[] {
  return data.writes.slice(0, k).map((w) => valueIndex(data, w.name));
}

/** subs 표에서 값 이름 하나가 구독된 뷰 이름들을 순서대로 꺼낸다. */
function viewsReading(data: ReactiveUpdatesData, subs: number[], name: string): string[] {
  const viewCount = data.views.length;
  const v = valueIndex(data, name);
  const out: string[] = [];
  for (let w = 0; w < viewCount; w += 1) {
    if (subs[v * viewCount + w] === 1) out.push(data.views[w]!.name);
  }
  return out;
}

/**
 * 뷰의 출력 문자열을 셈한다.
 *
 * `views[].body` 는 pseudo-notation 코드 글자(자료)일 뿐 파싱해서 실행하지
 * 않는다 — 이 완제품이 다루는 네 뷰(badge·summary·banner·hud)의 셈법은 사양이
 * 구조로 주지 않아 스스로 정했다: 읽는 값이 하나면 그 값 그대로, 둘이면
 * `summary` 는 곱, `hud` 는 합(사양의 "둘 다 수이므로 산술로 잇는다"를 그대로
 * 따른다). 이 매핑 밖의 뷰가 오면 지어내지 않고 던진다.
 */
function computeViewOutput(view: ReactiveUpdatesViewEntry, values: Record<string, ReactiveValue>): string {
  const num = (name: string): number => {
    const v = values[name];
    if (typeof v !== 'number') throw new Error(`뷰 ${view.name} 이 수가 아닌 값을 읽는다: ${name}`);
    return v;
  };
  if (view.reads.length === 1) {
    const only = values[view.reads[0]!];
    if (only === undefined) throw new Error(`알 수 없는 값 이름: ${view.reads[0]}`);
    return String(only);
  }
  if (view.name === 'summary') return String(num(view.reads[0]!) * num(view.reads[1]!));
  if (view.name === 'hud') return String(view.reads.reduce((sum, r) => sum + num(r), 0));
  throw new Error(`뷰 ${view.name} 의 출력 계산 규약이 없다 — reads ${view.reads.length}개는 사양 밖이다`);
}

type Reported = { looked: number; rendered: number };

/** 계기 헬퍼 — 지금 값을 들고 차이만 보낸다. 처음 한 번은 차이 0 이어도 보낸다. */
function reportLooked(rc: ReactiveContext<ReactiveUpdatesData>, current: number, reported: Reported): void {
  const first = reported.looked < 0;
  const delta = current - (first ? 0 : reported.looked);
  if (first || delta !== 0) {
    rc.metric('looked', delta);
    reported.looked = current;
  }
}

/** 계기 헬퍼 — rendered 판. */
function reportRendered(rc: ReactiveContext<ReactiveUpdatesData>, current: number, reported: Reported): void {
  const first = reported.rendered < 0;
  const delta = current - (first ? 0 : reported.rendered);
  if (first || delta !== 0) {
    rc.metric('rendered', delta);
    reported.rendered = current;
  }
}

function readKnobInput(input: ReactiveInputEvent): { knob: 'mode' | 'writeCount'; value: number } | null {
  if (input.type !== 'mode' && input.type !== 'writeCount') return null;
  const payload = input.payload;
  if (typeof payload !== 'object' || payload === null) return null;
  const raw = (payload as Record<string, unknown>).value;
  if (typeof raw !== 'number') return null;
  const ladder = input.type === 'mode' ? MODE_VALUES : WRITE_COUNT_VALUES;
  if (!ladder.includes(raw)) return null;
  return { knob: input.type, value: raw };
}

/** 한 판을 끝까지 돈다. 취소되면 false. */
async function runRound(
  rc: ReactiveContext<ReactiveUpdatesData>,
  data: ReactiveUpdatesData,
  mode: number,
  writeCount: number,
  reported: Reported,
): Promise<boolean> {
  const phase = (name: string) => rc.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const values: Record<string, ReactiveValue> = {};
  for (const v of data.values) values[v.name] = v.value;
  const initialSnapshot: Record<string, ReactiveValue> = { ...values };
  const subs = buildSubs(data);
  const viewsByName = new Map(data.views.map((v) => [v.name, v] as const));

  reportLooked(rc, 0, reported);
  reportRendered(rc, 0, reported);

  // ── 첫 돌기 — 뷰 순서대로 읽고, 그 안에서 읽는 값 순서대로 줄이 그어진다.
  await phase('read-init');
  for (const view of data.views) {
    if (rc.cancelled) return false;
    for (const name of view.reads) {
      if (rc.cancelled) return false;
      await rc.emit({ type: 'subscribe', payload: { value: name, view: view.name } });
    }
    const text = computeViewOutput(view, values);
    await rc.emit({ type: 'render', payload: { view: view.name, text, mode: 'init' } });
  }
  {
    const cont = await rc.sleep(data.stepMs);
    if (!cont) return false;
  }

  // ── 쓰기 k 개.
  const dirty = new Set<string>();
  let syncRendered = 0;
  for (let i = 0; i < writeCount; i += 1) {
    if (rc.cancelled) return false;
    const w = data.writes[i];
    if (!w) throw new Error(`writes 배열이 writeCount(${writeCount}) 보다 짧다`);
    values[w.name] = w.value;

    if (mode === 0) {
      await phase('write-sync');
      for (const viewName of viewsReading(data, subs, w.name)) {
        if (rc.cancelled) return false;
        const view = viewsByName.get(viewName);
        if (!view) throw new Error(`알 수 없는 뷰: ${viewName}`);
        const text = computeViewOutput(view, values);
        await rc.emit({ type: 'render', payload: { view: viewName, text, mode: 'sync', via: w.name } });
        syncRendered += 1;
      }
      reportRendered(rc, syncRendered, reported);
    } else if (mode === 1) {
      await phase('write-batch');
      await rc.emit({ type: 'stash', payload: { name: w.name, value: String(w.value) } });
      for (const viewName of viewsReading(data, subs, w.name)) dirty.add(viewName);
    } else {
      await phase('write-scan');
      // 훑기는 쓰기 때 아무에게도 알리지 않는다 — phase 만 켠다.
    }

    const cont = await rc.sleep(data.stepMs);
    if (!cont) return false;
  }

  // ── 마무리 — 모드별.
  if (mode === 1) {
    await phase('flush-batch');
    const dirtyViews = [...dirty];
    await rc.emit({ type: 'flush', payload: { count: dirtyViews.length } });
    for (const viewName of dirtyViews) {
      if (rc.cancelled) return false;
      const view = viewsByName.get(viewName);
      if (!view) throw new Error(`알 수 없는 뷰: ${viewName}`);
      const text = computeViewOutput(view, values);
      await rc.emit({ type: 'render', payload: { view: viewName, text, mode: 'flush' } });
    }
    reportRendered(rc, dirtyViews.length, reported);
    const cont = await rc.sleep(data.stepMs);
    if (!cont) return false;
  } else if (mode === 2) {
    let lastSnapshot = initialSnapshot;
    let lookedTotal = 0;
    const renderedViews = new Set<string>();
    for (let round = 0; round < 2; round += 1) {
      if (rc.cancelled) return false;
      await phase('scan-round');
      const changedNames: string[] = [];
      for (let i = 0; i < data.values.length; i += 1) {
        if (rc.cancelled) return false;
        const name = data.values[i]!.name;
        const changed = values[name] !== lastSnapshot[name];
        await rc.emit({ type: 'scan-tick', payload: { index: i, name, changed } });
        if (changed) changedNames.push(name);
      }
      lookedTotal += data.values.length;
      reportLooked(rc, lookedTotal, reported);
      if (changedNames.length > 0) {
        for (const name of changedNames) {
          for (const viewName of viewsReading(data, subs, name)) renderedViews.add(viewName);
        }
        for (const viewName of renderedViews) {
          if (rc.cancelled) return false;
          const view = viewsByName.get(viewName);
          if (!view) throw new Error(`알 수 없는 뷰: ${viewName}`);
          const text = computeViewOutput(view, values);
          await rc.emit({ type: 'render', payload: { view: viewName, text, mode: 'scan' } });
        }
        reportRendered(rc, renderedViews.size, reported);
      }
      lastSnapshot = { ...values };
      const cont = await rc.sleep(data.stepMs);
      if (!cont) return false;
      if (changedNames.length === 0) break;
    }
  }

  return true;
}

export async function reactiveUpdatesAlgorithm(ctx: FacetContext<ReactiveUpdatesData>): Promise<void> {
  const rc = ctx as ReactiveContext<ReactiveUpdatesData>;
  const data = rc.data;
  let mode = 0;
  let writeCount = 4;
  const reported: Reported = { looked: -1, rendered: -1 };
  try {
    for (;;) {
      if (rc.cancelled) return;
      const finished = await runRound(rc, data, mode, writeCount, reported);
      if (!finished || rc.cancelled) return;
      for (;;) {
        if (rc.cancelled) return;
        const input = await rc.waitForInput();
        if (rc.cancelled) return;
        const knob = readKnobInput(input);
        if (!knob) continue;
        if (knob.knob === 'mode') mode = knob.value;
        else writeCount = knob.value;
        break;
      }
    }
  } catch (err) {
    if (!rc.cancelled) throw err;
  }
}
