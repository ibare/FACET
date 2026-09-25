/**
 * polymorphism — 메서드 찾기: 받는 객체의 클래스에서 위로.
 *
 * 같은 부르는 줄 `s.<이름>()` 이 어느 몸으로 가는지를 **찾기를 실제로 돌려** 셈한다. 받는 객체가 가리키는
 * 클래스에서 출발해 한 층씩 부모로 오르고, 그 이름이 처음 나온 층에서 멈춘다. 뿌리까지 보고도 없으면
 * `NoMethod`. 찾기는 판마다 받는 객체의 클래스에서 새로 시작한다 — 앞 판이 어디서 찾았는지 기억하지 않는다.
 *
 * 손잡이 둘(`receiver` · `method`)을 받는 reactive 알고리즘이다. 한 판을 끝까지 재생하고 입력을 기다린다.
 *
 * ## 이벤트 (모두 silent 아님 — 걸음 경계는 sleep 과 입력 대기)
 *
 * | type     | payload                                                                  | 걸음 |
 * | -------- | ------------------------------------------------------------------------ | ---- |
 * | `start`  | `{ receiver: string, method: string }`                                   | 1    |
 * | `stamp`  | `{ cls: string }` — 객체가 찍혀 나온 클래스                              | 2    |
 * | `look`   | `{ cls: string, method: string, found: boolean, looked: number }` — looked 는 1 부터 | 3.. |
 * | `run`    | `{ owner: string, method: string, out: string, levels: number, slot: boolean }` | 끝 |
 * | `fail`   | `{ method: string, looked: number, root: string }`                       | 끝   |
 *
 * `slot` 은 부른 이름이 약속(`promise.methods`)에 있어 찾아낸 몸이 약속의 그 칸에 꽂히는가.
 * `levels` = 올라간 층 = looked − 1.
 *
 * ## phase 어휘
 *
 * 없다 — 코드 패널을 두지 않는다 (`irs.ts` 가 까닭을 적는다). phase 를 보내지 않는다.
 *
 * ## 계기 (그 판 하나의 값 — 지금 값을 들고 차이만 보낸다)
 *
 * - `classes-looked` — 들여다본 클래스 수 (출발한 클래스 포함). 판 첫머리에 0 으로 되돌린다
 * - `lookup-errors`  — 그 판의 찾기 실패 (0 또는 1)
 *
 * ## 던지는 자리 (C6)
 *
 * 모르는 클래스 이름 · 부모 사슬의 고리(상한 10 층) · 사다리 밖 손잡이 값 · 약속을 구현한다는 클래스가 없음.
 *
 * 동률 규칙 — 해당 없음 (찾기는 처음 나온 층에서 멈춘다. 같은 층에 같은 이름이 둘이면 데이터 오류로 던진다).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PolymorphismMethod = { name: string; out: string };
export type PolymorphismClass = { name: string; parent: string | null; methods: PolymorphismMethod[] };
export type PolymorphismPromise = { name: string; methods: string[]; implementedBy: string };

export type PolymorphismData = {
  type: 'polymorphism';
  stepMs: number;
  classes: PolymorphismClass[];
  promise: PolymorphismPromise;
  /** receiver 사다리 — 색인 = segments value */
  receivers: string[];
  /** method 사다리 — 색인 = segments value */
  methods: string[];
  /** 손잡이 기본값 (사다리 색인) */
  receiver?: number;
  method?: number;
};

/** 부모 사슬 상한 — 이보다 길면 고리로 본다. */
export const MAX_CHAIN = 10;

export type LookupResult = {
  /** 들여다본 클래스, 차례대로 (출발한 클래스 먼저) */
  visited: string[];
  /** 찾은 몸의 클래스, 없으면 null */
  owner: string | null;
  /** 찾은 몸의 출력 글자, 없으면 null */
  out: string | null;
};

function classOf(data: PolymorphismData, name: string): PolymorphismClass {
  const c = data.classes.find((k) => k.name === name);
  if (!c) throw new Error(`polymorphism: 모르는 클래스 '${name}'`);
  return c;
}

/** 찾기 — 받는 객체의 클래스에서 출발해 위로. 처음 나온 층에서 멈춘다. */
export function lookup(data: PolymorphismData, receiver: string, method: string): LookupResult {
  const visited: string[] = [];
  let cur: string | null = receiver;
  while (cur !== null) {
    if (visited.length >= MAX_CHAIN) throw new Error(`polymorphism: 부모 사슬이 ${MAX_CHAIN} 층을 넘는다 — 고리?`);
    if (visited.includes(cur)) throw new Error(`polymorphism: 부모 사슬에 고리가 있다 ('${cur}')`);
    const c = classOf(data, cur);
    visited.push(c.name);
    const hits = c.methods.filter((m) => m.name === method);
    if (hits.length > 1) throw new Error(`polymorphism: '${c.name}' 에 '${method}' 가 둘 이상`);
    if (hits.length === 1) return { visited, owner: c.name, out: hits[0]!.out };
    cur = c.parent;
  }
  return { visited, owner: null, out: null };
}

/** 사다리 색인 → 이름. 사다리 밖이면 던진다. */
function rung(ladder: string[], value: number, what: string): string {
  if (!Number.isInteger(value) || value < 0 || value >= ladder.length) {
    throw new Error(`polymorphism: ${what} 값 ${value} 이 사다리 밖이다 (0..${ladder.length - 1})`);
  }
  return ladder[value]!;
}

export async function polymorphismAlgorithm(ctx: FacetContext<PolymorphismData>): Promise<void> {
  const rc = ctx as ReactiveContext<PolymorphismData>;
  const data = rc.data;
  const stepMs = typeof data.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : 1100;
  if (!data.classes.some((c) => c.name === data.promise.implementedBy)) {
    throw new Error(`polymorphism: 약속을 구현한다는 클래스 '${data.promise.implementedBy}' 가 없다`);
  }
  let receiver = data.receiver ?? data.receivers.length - 1;
  let method = data.method ?? data.methods.length - 1;
  rung(data.receivers, receiver, 'receiver');
  rung(data.methods, method, 'method');

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: 'classes-looked' | 'lookup-errors', value: number): void => {
    const prev = shown.get(name);
    if (prev === value) return;
    shown.set(name, value);
    rc.metric(name, value - (prev ?? 0));
  };

  const pause = (): Promise<boolean> => rc.sleep(stepMs);

  try {
    for (;;) {
      if (rc.cancelled) return;
      const recvName = rung(data.receivers, receiver, 'receiver');
      const methodName = rung(data.methods, method, 'method');
      const result = lookup(data, recvName, methodName);

      // 1. 시작 — 부르는 줄은 흐림
      setMetric('classes-looked', 0);
      setMetric('lookup-errors', 0);
      await rc.emit({ type: 'start', payload: { receiver: recvName, method: methodName } });
      if (!(await pause())) return;

      // 2. 찍기 — 객체가 제 클래스에서 찍혀 나와 그 클래스를 가리킨다
      await rc.emit({ type: 'stamp', payload: { cls: recvName } });
      if (!(await pause())) return;

      // 3.. 들여다봄 — 한 걸음에 클래스 하나
      for (let i = 0; i < result.visited.length; i += 1) {
        if (rc.cancelled) return;
        const cls = result.visited[i]!;
        const found = result.owner === cls;
        setMetric('classes-looked', i + 1);
        await rc.emit({ type: 'look', payload: { cls, method: methodName, found, looked: i + 1 } });
        if (!(await pause())) return;
      }

      // 끝 — 돈다 / 실패
      if (result.owner !== null && result.out !== null) {
        await rc.emit({
          type: 'run',
          payload: {
            owner: result.owner,
            method: methodName,
            out: result.out,
            levels: result.visited.length - 1,
            slot: data.promise.methods.includes(methodName),
          },
        });
      } else {
        setMetric('lookup-errors', 1);
        await rc.emit({
          type: 'fail',
          payload: { method: methodName, looked: result.visited.length, root: result.visited[result.visited.length - 1] ?? recvName },
        });
      }

      // 입력 대기 — 우리 손잡이만 받는다
      for (;;) {
        if (rc.cancelled) return;
        const input = await rc.waitForInput();
        if (rc.cancelled) return;
        const payload = input?.payload;
        const value = typeof payload === 'object' && payload !== null ? (payload as { value?: unknown }).value : undefined;
        if (input?.type === 'receiver' && typeof value === 'number') {
          rung(data.receivers, value, 'receiver');
          receiver = value;
          break;
        }
        if (input?.type === 'method' && typeof value === 'number') {
          rung(data.methods, value, 'method');
          method = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!rc.cancelled) throw err;
  }
}
