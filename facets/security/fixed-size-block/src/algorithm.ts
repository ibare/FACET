/**
 * fixed-size-block — 16 비트씩만 받는 암호가 40 비트 메시지를 잠그는 길.
 *
 * 메시지 바이트를 앞에서부터 2 바이트(16 비트) 덩어리로 자르고, 모자란 끝
 * 덩어리를 PKCS#7 꼴로 채운 뒤, 덩어리마다 같은 장난감 SPN 상자 E_K 를 따로 부른다.
 * 덩어리끼리 주고받는 값은 없다.
 *
 * 이벤트 (발신 순서대로):
 *   init  silent  payload { blockBits: number; blockCount: number; messageBits: number }
 *                 — 덩어리 크기 · 덩어리 수 · 메시지 비트 수. 걸음 0 의 바탕
 *   cut           payload { blocks: number[][]; lastBits: number }
 *                 — 잘린 덩어리마다 바이트 값(0..255). 끝 덩어리는 모자랄 수 있다
 *   pad           payload { block: number; bytes: number[]; paddedBits: number }
 *                 — 끝 덩어리(0 부터 센 번호)에 붙는 채움 바이트 · 채운 뒤 메시지 전체 비트 수
 *   seal          payload { block: number; input: number; output: number; bits: number; cipherBits: number }
 *                 — 덩어리 하나를 잠근다. input · output 은 16 비트 값, bits 는 나온 덩어리의 비트 수,
 *                   cipherBits 는 지금까지 나온 암호문 비트 수
 *
 * 걸음: 0 메시지 · 1 cut · 2 pad · 3.. seal (덩어리 하나에 한 걸음).
 * 마지막 seal 걸음이 끝 화면이다 — 모든 덩어리가 잠긴 걸음에 길이 합계를 함께 말한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** facet.ts 의 initialData 모양. */
export type FixedSizeBlockFacetData = {
  type: 'fixed-size-block';
  /** 메시지 — ASCII 글자가 곧 바이트 값이다. 번역하지 않는다 */
  message: string;
  /** 주 열쇠 32 비트, 16 진 여덟 자리 */
  key: string;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 좁힌 자료. */
export type FixedSizeBlockInput = {
  bytes: number[];
  key: number;
  keyHex: string;
  stepMs: number;
};

/** 덩어리 크기 — 장난감 SPN 은 16 비트를 받는다. */
export const BLOCK_BYTES = 2;

/** 자료를 좁힌다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowFixedSizeBlock(raw: unknown): FixedSizeBlockInput {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('fixed-size-block: initialData 가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'fixed-size-block') {
    throw new Error(`fixed-size-block: initialData.type 이 'fixed-size-block' 이 아니다 (${String(d.type)})`);
  }
  const message = d.message;
  if (typeof message !== 'string' || message.length === 0) {
    throw new Error('fixed-size-block: initialData.message 는 빈 문자열이 아닌 문자열이어야 한다');
  }
  const bytes: number[] = [];
  for (let i = 0; i < message.length; i += 1) {
    const code = message.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      throw new Error(`fixed-size-block: initialData.message[${i}] 가 인쇄 가능한 ASCII 가 아니다 (${code})`);
    }
    bytes.push(code);
  }
  const keyHex = d.key;
  if (typeof keyHex !== 'string' || !/^[0-9A-F]{8}$/.test(keyHex)) {
    throw new Error('fixed-size-block: initialData.key 는 대문자 16 진 여덟 자리여야 한다');
  }
  const stepMs = d.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 800) {
    throw new Error('fixed-size-block: initialData.stepMs 는 800 이상의 수여야 한다');
  }
  return { bytes, key: parseInt(keyHex, 16) >>> 0, keyHex, stepMs };
}

// ── 장난감 SPN (16 비트 덩어리 · 라운드 넷) ──────────────────────────

const SBOX = [0xe, 0x4, 0xd, 0x1, 0x2, 0xf, 0xb, 0x8, 0x3, 0xa, 0x6, 0xc, 0x5, 0x9, 0x0, 0x7];

/** 네 칸에 같은 S-상자를 건다. */
function substitute(u: number): number {
  let v = 0;
  for (let cell = 0; cell < 4; cell += 1) {
    const shift = 12 - cell * 4;
    v |= SBOX[(u >> shift) & 0xf]! << shift;
  }
  return v;
}

/** 자리 i(왼쪽부터 1..16)의 비트가 π(i) 로 간다 — 4×4 전치. */
function permute(v: number): number {
  let w = 0;
  for (let i = 0; i < 16; i += 1) {
    const bit = (v >> (15 - i)) & 1;
    const cell = Math.floor(i / 4);
    const k = i % 4;
    const to = k * 4 + cell;
    w |= bit << (15 - to);
  }
  return w;
}

/** K^r = 주 열쇠의 자리 4r−3 부터 이어진 16 비트 (r = 1..5). */
function roundKey(key: number, r: number): number {
  const start = 4 * r - 3;
  return (key >>> (32 - (start + 15))) & 0xffff;
}

/** E_K — 라운드 1..3 은 열쇠 섞기 · 바꾸기 · 섞기, 라운드 4 는 섞기 대신 열쇠가 하나 더. */
export function encryptBlock(plain: number, key: number): number {
  if (!Number.isInteger(plain) || plain < 0 || plain > 0xffff) {
    throw new Error(`fixed-size-block: 덩어리 값이 16 비트가 아니다 (${plain})`);
  }
  let w = plain;
  for (let r = 1; r <= 3; r += 1) {
    w = permute(substitute(w ^ roundKey(key, r)));
  }
  const v = substitute(w ^ roundKey(key, 4));
  return (v ^ roundKey(key, 5)) & 0xffff;
}

/** 16 비트 값을 16 진 네 자리(대문자)로. */
export function hex16(v: number): string {
  return v.toString(16).toUpperCase().padStart(4, '0');
}

/** 바이트를 16 진 두 자리(대문자)로. */
export function hex8(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0');
}

export async function fixedSizeBlock(ctx: FacetContext<FixedSizeBlockFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<FixedSizeBlockFacetData>;
  const { bytes, key, stepMs } = narrowFixedSizeBlock(ctx.data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 앞에서부터 자른다
  const blocks: number[][] = [];
  for (let at = 0; at < bytes.length; at += BLOCK_BYTES) {
    if (ctx.cancelled) return;
    blocks.push(bytes.slice(at, at + BLOCK_BYTES));
  }
  // PKCS#7: 모자란 바이트 수 n 을 값 n 인 바이트 n 개로. 딱 맞으면 한 덩어리를 더 붙인다
  const short = BLOCK_BYTES - (bytes.length % BLOCK_BYTES);
  const padBlock = bytes.length % BLOCK_BYTES === 0 ? blocks.length : blocks.length - 1;
  const padBytes = new Array<number>(short).fill(short);
  const blockCount = padBlock === blocks.length ? blocks.length + 1 : blocks.length;
  const last = blocks[blocks.length - 1]!;

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { blockBits: BLOCK_BYTES * 8, blockCount, messageBits: bytes.length * 8 },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'cut',
    payload: { blocks: blocks.map((b) => [...b]), lastBits: last.length * 8 },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'pad',
    payload: { block: padBlock, bytes: [...padBytes], paddedBits: (bytes.length + short) * 8 },
  });

  const padded = blocks.map((b) => [...b]);
  if (padBlock === padded.length) padded.push([]);
  padded[padBlock]!.push(...padBytes);

  let cipherBits = 0;
  for (let i = 0; i < padded.length; i += 1) {
    if (!(await pause())) return;
    const block = padded[i]!;
    if (block.length !== BLOCK_BYTES) {
      throw new Error(`fixed-size-block: 채운 덩어리 ${i} 의 길이가 ${block.length} 바이트다`);
    }
    const input = (block[0]! << 8) | block[1]!;
    const output = encryptBlock(input, key);
    cipherBits += BLOCK_BYTES * 8;
    await ctx.emit({
      type: 'seal',
      payload: { block: i, input, output, bits: BLOCK_BYTES * 8, cipherBits },
    });
  }
}
