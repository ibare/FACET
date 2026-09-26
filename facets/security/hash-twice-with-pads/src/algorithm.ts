/**
 * hash-twice-with-pads — 장난감 HMAC 을 안팎 두 번의 접기로 편다.
 *
 * HMAC(K, m) = H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ m)). H 는 상태 16 비트 · IV 6a09 ·
 * 덩어리 2 바이트 · 세 라운드 압축의 장난감 해시다 (설명 글이 실물과의 차이를 밝힌다).
 *
 * 걸음 0 은 장면의 `initial()` 이 initialData 에서 세운다 (K · m · ipad · opad).
 * 그 화면에 읽을 것이 있으므로 첫 발신 앞에도 stepMs 를 둔다.
 *
 * 이벤트 (모두 silent 아님, 한 번씩 이 차례로):
 *   'xor-inner'   payload { key: number, pad: number, result: number }
 *                   K ⊕ ipad = 안쪽 열쇠. 수는 16 비트 정수
 *   'fold-inner'  payload { input: number[], result: number }
 *                   안쪽 접기 H(안쪽 열쇠 ‖ m). input 은 H 에 들어간 바이트(패딩 전)
 *   'xor-outer'   payload { key: number, pad: number, result: number }
 *                   K ⊕ opad = 바깥 열쇠
 *   'carry'       payload { value: number, input: number[] }
 *                   안쪽 값이 바깥 열쇠 뒤, 메시지의 자리로 옮겨 간다. input 은 바깥 입력 바이트
 *   'fold-outer'  payload { input: number[], result: number }
 *                   바깥 접기 H(바깥 열쇠 ‖ 안쪽 값) = HMAC
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HashTwiceWithPadsFacetData = {
  type: 'hash-twice-with-pads';
  /** 열쇠 K — 뽑힌 값, 16 비트 (덩어리 폭과 같다) */
  key: number;
  /** ipad — 0x36 을 덩어리 폭만큼 되풀이한 것 */
  ipad: number;
  /** opad — 0x5c 를 덩어리 폭만큼 되풀이한 것 */
  opad: number;
  /** 메시지 — 번역하지 않는 자료 (ASCII) */
  message: string;
  stepMs: number;
};

const IV = 0x6a09;

function isWord(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 0xffff;
}

/** initialData 의 모양을 확인한다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowHashTwiceData(data: unknown): HashTwiceWithPadsFacetData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('hash-twice-with-pads: initialData 가 객체가 아니다');
  }
  const d = data as Record<string, unknown>;
  if (d.type !== 'hash-twice-with-pads') {
    throw new Error(`hash-twice-with-pads: initialData.type 이 어긋났다 (${String(d.type)})`);
  }
  for (const k of ['key', 'ipad', 'opad'] as const) {
    if (!isWord(d[k])) throw new Error(`hash-twice-with-pads: initialData.${k} 는 16 비트 정수여야 한다`);
  }
  if (typeof d.message !== 'string' || d.message.length === 0) {
    throw new Error('hash-twice-with-pads: initialData.message 가 빈 문자열이거나 문자열이 아니다');
  }
  for (let i = 0; i < d.message.length; i += 1) {
    const c = d.message.charCodeAt(i);
    if (c > 0x7f) throw new Error(`hash-twice-with-pads: initialData.message[${i}] 가 ASCII 가 아니다`);
  }
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) {
    throw new Error('hash-twice-with-pads: initialData.stepMs 는 양수여야 한다');
  }
  return {
    type: 'hash-twice-with-pads',
    key: d.key as number,
    ipad: d.ipad as number,
    opad: d.opad as number,
    message: d.message,
    stepMs: d.stepMs,
  };
}

/** 메시지 글자의 ASCII 바이트 — 바탕에서 정해지는 셈이라 장면도 이것을 부른다. */
export function messageBytes(message: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < message.length; i += 1) {
    const c = message.charCodeAt(i);
    if (c > 0x7f) throw new Error(`hash-twice-with-pads: message[${i}] 가 ASCII 가 아니다`);
    out.push(c);
  }
  return out;
}

/** 16 비트 한 낱말을 큰 쪽 먼저 두 바이트로. */
export function wordBytes(w: number): number[] {
  return [(w >>> 8) & 0xff, w & 0xff];
}

function rotl16(x: number, r: number): number {
  return ((x << r) | (x >>> (16 - r))) & 0xffff;
}

/** 압축 f(h, m) — 세 라운드 뒤 앞 상태를 더해 넘긴다. */
function compress(h: number, m: number): number {
  let x = h;
  for (let round = 0; round < 3; round += 1) {
    x = (x ^ m) & 0xffff;
    x = Math.imul(x, 0x9e37) & 0xffff;
    x = rotl16(x, 5);
  }
  return (x + h) & 0xffff;
}

/** 장난감 해시 H — 0x80 · 0 (짝수 바이트가 되도록) · 길이(비트) 16 비트로 채워 덩어리마다 접는다. */
export function toyHash(bytes: readonly number[]): number {
  const padded = [...bytes, 0x80];
  if (padded.length % 2 !== 0) padded.push(0x00);
  const bits = bytes.length * 8;
  if (bits > 0xffff) throw new Error('hash-twice-with-pads: 메시지가 길이 필드 16 비트를 넘는다');
  padded.push((bits >>> 8) & 0xff, bits & 0xff);
  let h = IV;
  for (let i = 0; i < padded.length; i += 2) {
    const a = padded[i];
    const b = padded[i + 1];
    if (a === undefined || b === undefined) throw new Error(`hash-twice-with-pads: 덩어리 ${i / 2} 가 비었다`);
    h = compress(h, (a << 8) | b);
  }
  return h;
}

export async function hashTwiceWithPads(
  ctx0: FacetContext<HashTwiceWithPadsFacetData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<HashTwiceWithPadsFacetData>;
  const data = narrowHashTwiceData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const m = messageBytes(data.message);

  // 걸음 1 — 열쇠가 ipad 와 겹쳐 안쪽 열쇠가 된다
  if (!(await pause())) return;
  const innerKey = (data.key ^ data.ipad) & 0xffff;
  await ctx.emit({ type: 'xor-inner', payload: { key: data.key, pad: data.ipad, result: innerKey } });

  // 걸음 2 — 안쪽 열쇠 뒤에 메시지를 붙여 한 번 접는다
  if (!(await pause())) return;
  const innerInput = [...wordBytes(innerKey), ...m];
  const innerValue = toyHash(innerInput);
  await ctx.emit({ type: 'fold-inner', payload: { input: innerInput, result: innerValue } });

  // 걸음 3 — 열쇠가 opad 와 겹쳐 바깥 열쇠가 된다
  if (!(await pause())) return;
  const outerKey = (data.key ^ data.opad) & 0xffff;
  await ctx.emit({ type: 'xor-outer', payload: { key: data.key, pad: data.opad, result: outerKey } });

  // 걸음 4 — 안쪽 값이 메시지의 자리로 옮겨 간다
  if (!(await pause())) return;
  const outerInput = [...wordBytes(outerKey), ...wordBytes(innerValue)];
  await ctx.emit({ type: 'carry', payload: { value: innerValue, input: outerInput } });

  // 걸음 5 — 바깥 열쇠 뒤의 안쪽 값을 한 번 더 접는다
  if (!(await pause())) return;
  const hmac = toyHash(outerInput);
  await ctx.emit({ type: 'fold-outer', payload: { input: outerInput, result: hmac } });
}
