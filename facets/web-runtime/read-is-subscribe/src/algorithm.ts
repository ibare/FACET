/**
 * 이벤트 (silent 아님. 걸음 하나 = emit 하나)
 *
 *   read  { view: string; name: string; value: number | string; output?: number | string }
 *     view 가 name 을 읽어 value 를 얻고, 그 값에서 그 view 로 처음 줄이 생긴다.
 *     output 은 이 읽기가 view 의 첫 돌기를 끝냈을 때만 실려, 그 view 의 새 출력을 담는다
 *     (뷰의 마지막 의존을 읽는 걸음에만 있다).
 *
 *   write { name: string; value: number | string; targets: string[]; reruns: { view: string; output: number | string }[] }
 *     name 에 value 를 쓴다. targets 는 그 값에 걸린 구독을 줄이 그어진 차례대로 담고,
 *     reruns 는 그 순서대로 다시 돈 view 와 그 새 출력을 담는다 (targets 가 비면 reruns 도 빈다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ReadIsSubscribeOp = 'first' | 'product';

export type ReadIsSubscribeValueSpec = {
  name: string;
  value: number | string;
};

export type ReadIsSubscribeViewSpec = {
  name: string;
  code: string[];
  deps: string[];
  op: ReadIsSubscribeOp;
};

export type ReadIsSubscribeWriteSpec = {
  name: string;
  value: number | string;
};

export type ReadIsSubscribeFacetData = {
  type: 'read-is-subscribe';
  values: ReadIsSubscribeValueSpec[];
  views: ReadIsSubscribeViewSpec[];
  writes: ReadIsSubscribeWriteSpec[];
  stepMs: number;
};

type ReadOp = {
  view: ReadIsSubscribeViewSpec;
  name: string;
  isLast: boolean;
};

/** view 가 지금까지 읽은 값들로 출력을 셈한다. 모르는 연산 · 모자란 의존은 던진다 (C6). */
function computeOutput(view: ReadIsSubscribeViewSpec, values: Map<string, number | string>): number | string {
  const args: (number | string)[] = [];
  for (const dep of view.deps) {
    const v = values.get(dep);
    if (v === undefined) throw new Error(`알 수 없는 값 이름: ${dep} (view ${view.name})`);
    args.push(v);
  }
  if (view.op === 'first') {
    const first = args[0];
    if (first === undefined) throw new Error(`view ${view.name} 에 읽을 의존이 없다`);
    return first;
  }
  if (view.op === 'product') {
    if (args.length !== 2) throw new Error(`product 연산은 의존 두 개가 필요하다: ${view.name} (${args.length})`);
    const a = args[0];
    const b = args[1];
    if (typeof a !== 'number' || typeof b !== 'number') {
      throw new Error(`product 연산은 수만 받는다: ${view.name}`);
    }
    return a * b;
  }
  throw new Error(`알 수 없는 view 연산: ${view.name} (${String(view.op)})`);
}

export async function readIsSubscribe(ctx: FacetContext<ReadIsSubscribeFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<ReadIsSubscribeFacetData>;
  const data = rc.data;
  const stepMs = data.stepMs;

  const values = new Map<string, number | string>(data.values.map((v) => [v.name, v.value]));
  const viewByName = new Map<string, ReadIsSubscribeViewSpec>(data.views.map((v) => [v.name, v]));
  const subs = new Map<string, string[]>(data.values.map((v) => [v.name, []]));

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  // 걸음 0 은 값 넷 · 뷰 셋 · 아직 없는 줄을 보인다 — 읽을 것이 있는 화면이니 첫 발신 앞에도 쉰다.
  if (!(await pause())) return;

  const reads: ReadOp[] = [];
  for (const view of data.views) {
    view.deps.forEach((name, i) => {
      reads.push({ view, name, isLast: i === view.deps.length - 1 });
    });
  }

  for (const op of reads) {
    if (rc.cancelled) return;
    const value = values.get(op.name);
    if (value === undefined) throw new Error(`알 수 없는 값 이름: ${op.name}`);
    const list = subs.get(op.name);
    if (list === undefined) throw new Error(`알 수 없는 값 이름: ${op.name}`);
    if (!list.includes(op.view.name)) list.push(op.view.name);
    const output = op.isLast ? computeOutput(op.view, values) : undefined;
    await rc.emit({
      type: 'read',
      payload: {
        view: op.view.name,
        name: op.name,
        value,
        ...(output !== undefined ? { output } : {}),
      },
    });
    if (!(await pause())) return;
  }

  for (const w of data.writes) {
    if (rc.cancelled) return;
    const before = values.get(w.name);
    if (before === undefined) throw new Error(`알 수 없는 값 이름: ${w.name}`);
    if (before === w.value) throw new Error(`같은 값 쓰기는 이 조각이 다루지 않는다: ${w.name}`);
    values.set(w.name, w.value);
    const targets = subs.get(w.name);
    if (targets === undefined) throw new Error(`알 수 없는 값 이름: ${w.name}`);
    const reruns: { view: string; output: number | string }[] = [];
    for (const viewName of targets) {
      const view = viewByName.get(viewName);
      if (view === undefined) throw new Error(`알 수 없는 뷰 이름: ${viewName}`);
      reruns.push({ view: viewName, output: computeOutput(view, values) });
    }
    await rc.emit({
      type: 'write',
      payload: { name: w.name, value: w.value, targets: [...targets], reruns },
    });
    if (!(await pause())) return;
  }
}
