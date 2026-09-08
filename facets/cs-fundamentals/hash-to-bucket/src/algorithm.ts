/**
 * hash-to-bucket — 값을 자리 번호로 바꾼다 (조각, S-piece).
 *
 * 길이도 종류도 제각각인 키가 **두 번 접혀** 정해진 개수의 자리 중 하나로 눌려
 * 들어간다.
 *   1) 해시 함수가 키를 하나의 정수로 접는다 — Java `String.hashCode` 의
 *      `h = h * 31 + c` 를 32비트 넘침까지 그대로 재현한다.
 *   2) 부호 비트를 떨어뜨린 뒤 (`h & 0x7FFFFFFF`) 나머지 연산이 그 정수를
 *      자리 수만큼으로 다시 접는다.
 *
 * 화면에 뜨는 수는 전부 이 파일이 실제로 계산한 값이다. 지어낸 값은 없다.
 *
 * ── 이벤트 (facet 고유 확장, C2)
 *
 * | type            | payload                                                                | silent |
 * |-----------------|------------------------------------------------------------------------|--------|
 * | `key-shown`     | `{ keyIndex: number; key: string }`                                    | no |
 * | `hash-folded`   | `{ keyIndex: number; key: string; hash: number; signBit: number }`     | no |
 * | `sign-dropped`  | `{ keyIndex: number; hash: number; masked: number; signBit: number }`  | no |
 * | `bucket-landed` | `{ keyIndex: number; key: string; masked: number; slot: number; bucketCount: number }` | no |
 * | `rewind`        | 없음 — 한 걸음씩 다시 짚으려고 처음으로 되돌린다                        | no |
 * | `done`          | `{ bucketCount: number }`                                              | no |
 *
 * `target` 은 쓰지 않는다. 이 조각에는 좌표를 가리킬 자료구조 식별자가 없고
 * payload 가 정규 경로다 (C1 무대상).
 *
 * 메트릭 없음 — 조각은 셀 것이 없다 (S-piece / C5 무대상).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HashToBucketData = {
  type: string;
  /** 접어 넣을 키들. 길이가 제각각인 것이 이 조각의 전제다. */
  keys: string[];
  /** 자리(버킷) 개수. 나머지 연산의 제수. */
  bucketCount: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

/**
 * Java `String.hashCode` — `h = h * 31 + c` 를 32비트 부호 있는 정수로 누적한다.
 * `Math.imul` + `| 0` 이 곱셈 넘침과 부호 있는 32비트 절단을 재현하므로,
 * "banana" 처럼 음수가 나오는 경우까지 JVM 과 같은 값을 낸다.
 */
function javaStringHashCode(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * 한 걸음이 끝난 뒤 다음 걸음까지의 사이.
 * 자동 재생은 쉬고, 한 걸음씩 모드는 버튼을 기다린다.
 * @returns 계속 진행해도 되면 true, 취소되었으면 false.
 */
type Gate = () => Promise<boolean>;

/** `advance` 가 올 때까지 기다린다. 다른 입력은 흘려보낸다. */
async function waitForAdvance(rc: ReactiveContext<HashToBucketData>): Promise<boolean> {
  for (;;) {
    if (rc.cancelled) return false;
    const input = await rc.waitForInput();
    if (rc.cancelled) return false;
    if (input.type === 'advance') return true;
  }
}

/**
 * 키 하나마다 네 걸음 — 나타난다 · 정수로 접힌다 · 부호 비트를 떨군다 · 자리로 들어간다.
 * 걸음마다 emit type 을 리터럴로 편다 (C2).
 */
async function play(rc: ReactiveContext<HashToBucketData>, gate: Gate): Promise<void> {
  const { keys, bucketCount } = rc.data;

  for (let i = 0; i < keys.length; i++) {
    if (rc.cancelled) return;

    const key = keys[i];
    const hash = javaStringHashCode(key);
    const masked = hash & 0x7fffffff;
    const slot = masked % bucketCount;
    const signBit = hash < 0 ? 1 : 0;

    await rc.emit({ type: 'key-shown', payload: { keyIndex: i, key } });
    if (!(await gate())) return;

    await rc.emit({ type: 'hash-folded', payload: { keyIndex: i, key, hash, signBit } });
    if (!(await gate())) return;

    await rc.emit({ type: 'sign-dropped', payload: { keyIndex: i, hash, masked, signBit } });
    if (!(await gate())) return;

    await rc.emit({
      type: 'bucket-landed',
      payload: { keyIndex: i, key, masked, slot, bucketCount },
    });
    if (!(await gate())) return;
  }

  await rc.emit({ type: 'done', payload: { bucketCount } });
}

/**
 * mount 되면 스스로 한 번 재생하고, 그 뒤에는 `advance` 를 받아 처음부터
 * 한 걸음씩 짚는다. 되돌아갈 때 `rewind` 를 먼저 발신한다 (S-piece).
 */
export const hashToBucketAlgorithm = async (ctx: FacetContext<HashToBucketData>): Promise<void> => {
  const rc = ctx as ReactiveContext<HashToBucketData>;
  const stepMs = rc.data.stepMs;

  const autoGate: Gate = () => rc.sleep(stepMs);
  const manualGate: Gate = () => waitForAdvance(rc);

  await play(rc, autoGate);

  for (;;) {
    if (rc.cancelled) return;
    if (!(await waitForAdvance(rc))) return;
    await rc.emit({ type: 'rewind' });
    await play(rc, manualGate);
  }
};
