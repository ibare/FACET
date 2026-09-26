/**
 * key-plus-message — 열쇠를 아는 사람만 만들 수 있는 표.
 *
 * Alice 와 Bob 은 열쇠 K 를 나눠 가졌다. 메시지와 표는 처음부터 끝까지 한 길로 간다.
 * 표 = MAC(K, m) (장난감 HMAC). 길 가운데 Mallory 는 K 가 없어, 고친 글에 붙일 수 있는
 * 것이 열쇠 없는 해시 H(m′) 뿐이다. Bob 은 받은 글로 MAC(K, 받은 글) 을 셈해 붙은 표와 견준다.
 *
 * 장난감 해시 H — 상태 16 비트 · IV 6a09 · 덩어리 2 바이트 ·
 *   패딩 = 0x80 · (짝수 바이트가 되도록 0x00 0 또는 1 개) · 길이(비트) 16 비트 큰 쪽 먼저.
 *   f(h, m): x = h 에서 세 라운드 [x ⊕= m · x = x × 9e37 mod 2¹⁶ · x = rotl16(x, 5)], h′ = (x + h) mod 2¹⁶.
 * 장난감 HMAC — H((K ⊕ 5c5c) ‖ H((K ⊕ 3636) ‖ m)), 안쪽 값은 두 바이트(큰 쪽 먼저)로 이어진다.
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (세 사람 · 열쇠 · Alice 손의 글).
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에 stepMs 를 둔다.
 *
 * 이벤트 (모두 silent 아님 — 한 걸음씩)
 *   tag     { msg: string; tag: number }
 *             Alice 가 MAC(K, msg) = tag 를 셈해 글에 붙인다.
 *   verify  { msg: string; tag: number; mine: number; accepted: boolean }
 *             글이 Bob 에게 건너가고, Bob 이 MAC(K, msg) = mine 을 셈해 붙은 표 tag 와 견준다.
 *             accepted = (mine === tag).
 *   alter   { from: string; to: string; tag: number }
 *             한 번 더 보낸 (from, tag) 을 Mallory 가 길 가운데서 잡아 글을 to 로 바꾼다. 표는 그대로.
 *   forge   { msg: string; tag: number; was: number }
 *             Mallory 가 열쇠 없이 H(msg) = tag 를 셈해 붙어 있던 표 was 를 갈아 낀다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type KeyPlusMessageFacetData = {
  type: 'key-plus-message';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 열쇠 K — 뽑힌 값, 16 비트 (두 바이트 = 덩어리 폭) */
  key: number;
  /** Alice 가 보내는 글 (ASCII · 번역하지 않는 자료) */
  message: string;
  /** Mallory 가 바꿔 넣는 글 (ASCII · 번역하지 않는 자료) */
  altered: string;
};

/** 장난감 해시의 IV — SHA-256 첫 IV 단어 6a09e667 의 앞 16 비트 */
export const TOY_IV = 0x6a09;
const IPAD = 0x3636;
const OPAD = 0x5c5c;

function isAsciiText(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && /^[\x20-\x7e]+$/.test(v);
}

/** initialData 좁히개. 어긋나면 필드 이름을 담아 던진다. 장면의 initial 도 이것을 부른다. */
export function narrowKeyPlusMessageData(raw: unknown): KeyPlusMessageFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('key-plus-message: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'key-plus-message') {
    throw new Error(`key-plus-message: initialData.type 이 'key-plus-message' 가 아니다 (${String(d.type)})`);
  }
  const { stepMs, key, message, altered } = d;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error('key-plus-message: initialData.stepMs 가 0 이상의 수가 아니다');
  }
  if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key > 0xffff) {
    throw new Error('key-plus-message: initialData.key 가 16 비트 정수가 아니다');
  }
  if (!isAsciiText(message)) {
    throw new Error('key-plus-message: initialData.message 가 비지 않은 ASCII 글이 아니다');
  }
  if (!isAsciiText(altered)) {
    throw new Error('key-plus-message: initialData.altered 가 비지 않은 ASCII 글이 아니다');
  }
  if (altered === message) {
    throw new Error('key-plus-message: initialData.altered 가 message 와 같다 — 고친 글이 아니다');
  }
  return { type: 'key-plus-message', stepMs, key, message, altered };
}

/** 글자를 ASCII 바이트로 */
export function asciiBytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    if (c < 0x20 || c > 0x7e) throw new Error(`key-plus-message: ASCII 가 아닌 글자 (자리 ${i})`);
    out.push(c);
  }
  return out;
}

function rotl16(x: number, n: number): number {
  return ((x << n) | (x >>> (16 - n))) & 0xffff;
}

/** 압축 f(h, m) — 세 라운드 뒤 앞 상태를 더해 넘긴다 */
export function compress(h: number, m: number): number {
  let x = h;
  for (let r = 0; r < 3; r += 1) {
    x = (x ^ m) & 0xffff;
    x = Math.imul(x, 0x9e37) & 0xffff;
    x = rotl16(x, 5);
  }
  return (x + h) & 0xffff;
}

/** 장난감 해시 H — 바이트 열을 패딩하고 두 바이트 덩어리로 접은 끝 상태 */
export function toyHash(bytes: readonly number[]): number {
  const bits = bytes.length * 8;
  if (bits > 0xffff) throw new Error(`key-plus-message: 메시지가 길이 필드(16 비트)를 넘는다 (${bits} 비트)`);
  const padded = [...bytes, 0x80];
  if (padded.length % 2 === 1) padded.push(0x00);
  padded.push((bits >>> 8) & 0xff, bits & 0xff);
  let h = TOY_IV;
  for (let i = 0; i < padded.length; i += 2) {
    const hi = padded[i];
    const lo = padded[i + 1];
    if (hi === undefined || lo === undefined) {
      throw new Error(`key-plus-message: 덩어리 ${i / 2} 가 두 바이트가 아니다`);
    }
    h = compress(h, (hi << 8) | lo);
  }
  return h;
}

function wordBytes(w: number): number[] {
  return [(w >>> 8) & 0xff, w & 0xff];
}

/** 장난감 HMAC — H((K ⊕ opad) ‖ H((K ⊕ ipad) ‖ m)) */
export function toyMac(key: number, bytes: readonly number[]): number {
  const inner = toyHash([...wordBytes(key ^ IPAD), ...bytes]);
  return toyHash([...wordBytes(key ^ OPAD), ...wordBytes(inner)]);
}

export async function keyPlusMessage(ctx: FacetContext<KeyPlusMessageFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<KeyPlusMessageFacetData>;
  const data = narrowKeyPlusMessageData(rctx.data);
  const { stepMs, key, message, altered } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음 0 (세 사람과 열쇠) 을 읽을 틈
  if (!(await pause())) return;

  // 1 — Alice 가 열쇠와 글로 표를 셈한다
  const tag = toyMac(key, asciiBytes(message));
  await rctx.emit({ type: 'tag', payload: { msg: message, tag } });
  if (!(await pause())) return;

  // 2 — 한 길로 건너가 Bob 이 같은 셈을 한다
  const bobFirst = toyMac(key, asciiBytes(message));
  await rctx.emit({
    type: 'verify',
    payload: { msg: message, tag, mine: bobFirst, accepted: bobFirst === tag },
  });
  if (!(await pause())) return;

  // 3 — 한 번 더 보낸 것을 Mallory 가 길 가운데서 고친다 (표는 그대로)
  await rctx.emit({ type: 'alter', payload: { from: message, to: altered, tag } });
  if (!(await pause())) return;

  // 4 — Mallory 는 열쇠가 없어 열쇠 없는 해시를 표로 갈아 낀다
  const forged = toyHash(asciiBytes(altered));
  await rctx.emit({ type: 'forge', payload: { msg: altered, tag: forged, was: tag } });
  if (!(await pause())) return;

  // 5 — Bob 이 받은 글로 셈한다
  const bobSecond = toyMac(key, asciiBytes(altered));
  await rctx.emit({
    type: 'verify',
    payload: { msg: altered, tag: forged, mine: bobSecond, accepted: bobSecond === forged },
  });
}
