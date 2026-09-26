/**
 * key-to-value — 키-값 저장소는 열쇠로 값을 찾고, 값 속의 것을 물으면 값을 전부 꺼내 연다.
 *
 * 규약 (사양에서 옮김):
 *  - 저장소가 아는 연산은 열쇠로 하는 것뿐이다 (GET). 값 속을 걸러 주는 연산은 없다 —
 *    물음 ② 는 바깥(앱)이 열쇠마다 GET 해서 받은 값을 열어 본다.
 *  - 물음 ① 은 `get` 열쇠 하나로 GET. 물음 ② 는 `field` 가 `want` 인 값.
 *  - ② 의 훑기 차례 = 데이터 차례. 맞은 것이 나와도 멈추지 않는다 — 끝까지 연다.
 *  - "꺼낸 값" 은 저장소 밖으로 나온 값의 개수다. ① 과 ② 는 따로 센다 (② 는 0 에서 다시).
 *  - 값 속에 `field` 가 없으면 던진다. 값이 글자로 된 객체가 아니어도 던진다.
 *  - 한 걸음 = 값 하나를 꺼내는 일. 걸음 0 은 저장소 (장면의 initial 이 채운다).
 *
 * 이벤트 (모두 silent 아님):
 *  - get   { key: string; value: string; taken: number }
 *            ① 열쇠로 꺼낸 값. taken = ① 에서 꺼낸 값의 개수
 *  - scan  { key: string; value: string; found: string; match: boolean; taken: number; matched: number }
 *            ② 열쇠 하나의 값을 꺼내 바깥에서 연 것. found = 값 속 field 의 값,
 *            taken = ② 에서 꺼낸 값의 개수, matched = ② 에서 맞은 것의 개수
 *  - done  { byKey: number; byField: number; matched: string[] }
 *            끝. byKey = ① 의 꺼낸 값, byField = ② 의 꺼낸 값, matched = 맞은 열쇠들 (차례대로)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KeyValuePair = { key: string; value: string };

export type KeyToValueFacetData = {
  type: 'key-to-value';
  stepMs: number;
  /** 저장소의 짝. 차례 = 훑기 차례 */
  pairs: KeyValuePair[];
  /** 물음 ① 의 열쇠 */
  get: string;
  /** 물음 ② 가 값 속에서 보는 칸 */
  field: string;
  /** 물음 ② 가 찾는 값 */
  want: string;
};

/** 저장소의 유일한 연산 — 열쇠로 값을 통째로 돌려준다. 없는 열쇠는 던진다. */
function storeGet(store: Map<string, string>, key: string): string {
  const value = store.get(key);
  if (value === undefined) throw new Error(`key-to-value: 저장소에 없는 열쇠 ${key}`);
  return value;
}

/** 바깥(앱)이 꺼낸 값을 연다. 값 속의 field 가 글자가 아니면 던진다. */
function openField(value: string, field: string, key: string): string {
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`key-to-value: ${key} 의 값이 객체가 아니다`);
  }
  if (!Object.prototype.hasOwnProperty.call(parsed, field)) {
    throw new Error(`key-to-value: ${key} 의 값에 ${field} 가 없다`);
  }
  const found: unknown = (parsed as Record<string, unknown>)[field];
  if (typeof found !== 'string') {
    throw new Error(`key-to-value: ${key} 의 ${field} 가 글자가 아니다`);
  }
  return found;
}

export async function keyToValue(context: FacetContext<KeyToValueFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<KeyToValueFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 저장소를 세운다 — 열쇠가 겹치면 던진다
  const store = new Map<string, string>();
  for (const pair of data.pairs) {
    if (ctx.cancelled) return;
    if (store.has(pair.key)) throw new Error(`key-to-value: 열쇠가 겹친다 ${pair.key}`);
    store.set(pair.key, pair.value);
  }

  // 걸음 0 (저장소) 을 읽을 틈
  if (!(await pause())) return;

  // ① 열쇠로 곧장 하나
  let byKey = 0;
  const got = storeGet(store, data.get);
  byKey += 1;
  await ctx.emit({ type: 'get', payload: { key: data.get, value: got, taken: byKey } });

  // ② 값 속으로 — 저장소는 값을 열지 못하니 열쇠마다 GET 해서 바깥에서 연다
  let byField = 0;
  const hits: string[] = [];
  for (const key of store.keys()) {
    if (!(await pause())) return;
    const value = storeGet(store, key);
    byField += 1;
    const found = openField(value, data.field, key);
    const match = found === data.want;
    if (match) hits.push(key);
    await ctx.emit({
      type: 'scan',
      payload: { key, value, found, match, taken: byField, matched: hits.length },
    });
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'done', payload: { byKey, byField, matched: [...hits] } });
}
