/**
 * mode-chains-blocks — 같은 평문 덩어리 넷을 CBC 로 잠그면 왜 암호문 넷이 모두 다른가.
 *
 * 메시지 바이트를 2 바이트(16 비트) 덩어리로 자르고, C_0 = IV · C_i = E_K(P_i ⊕ C_{i−1}) 로 잠근다.
 * E_K 는 Stinson 의 장난감 SPN (16 비트 덩어리 · 라운드 넷 · 32 비트 주 열쇠). 속은 열지 않는다.
 * 걸음은 덩어리마다 둘 — 앞 암호문(첫째는 IV)이 건너와 겹치고, 겹친 값이 상자를 지난다.
 *
 * 이벤트 (16 진 값은 모두 대문자 네 자리 문자열)
 *
 *   init    silent. 걸음 0 의 바탕.
 *           payload {
 *             blocks: { plain: string; chars: string[] }[]   덩어리마다 평문 16 진 · 두 바이트의 글자
 *             iv: string          IV (C_0)
 *             key: string         주 열쇠 K (16 진 여덟 자리)
 *             distinctPlain: number   서로 다른 평문 덩어리 수
 *           }
 *
 *   carry   앞 암호문(첫 덩어리는 IV)이 덩어리 index 자리로 건너가 평문에 겹친다.
 *           payload {
 *             index: number        1 부터
 *             from: number         건너온 값의 덩어리 번호. 0 이면 IV
 *             carried: string      건너온 값 C_{index−1}
 *             plain: string        P_index
 *             input: string        P_index ⊕ C_{index−1} — 상자에 들어갈 값
 *             distinctInputs: number   지금까지 상자에 들 값 가운데 서로 다른 수
 *             inputs: number           지금까지 상자에 들 값의 수
 *           }
 *
 *   encrypt 겹친 값이 상자 E 를 지나 암호문이 된다.
 *           payload {
 *             index: number
 *             input: string
 *             cipher: string       C_index = E_K(input)
 *             distinctCiphers: number  지금까지 나온 암호문 가운데 서로 다른 수
 *             ciphers: number          지금까지 나온 암호문의 수
 *           }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ModeChainsBlocksFacetData = {
  type: 'mode-chains-blocks';
  /** 메시지 바이트 — ASCII 글자. 번역하지 않는 자료. 길이는 2 의 배수 */
  message: string;
  /** 주 열쇠 K — 16 진 여덟 자리 */
  key: string;
  /** IV — 16 진 네 자리 */
  iv: string;
  stepMs: number;
};

const HEX4 = /^[0-9A-F]{4}$/;
const HEX8 = /^[0-9A-F]{8}$/;

/** 자료를 좁힌다. 모양이 어긋나면 필드 이름을 담아 던진다. 장면과 무대도 이것을 부른다. */
export function narrowModeChainsBlocks(raw: unknown): ModeChainsBlocksFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('mode-chains-blocks: 자료가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'mode-chains-blocks') throw new Error(`mode-chains-blocks: type 이 어긋났다 (${String(d.type)})`);
  const { message, key, iv, stepMs } = d;
  if (typeof message !== 'string' || message.length === 0 || message.length % 2 !== 0)
    throw new Error('mode-chains-blocks: message 는 길이가 2 의 배수인 문자열이어야 한다');
  for (let i = 0; i < message.length; i += 1) {
    const code = message.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) throw new Error(`mode-chains-blocks: message[${i}] 가 인쇄 가능한 ASCII 가 아니다`);
  }
  if (typeof key !== 'string' || !HEX8.test(key)) throw new Error('mode-chains-blocks: key 는 16 진 대문자 여덟 자리여야 한다');
  if (typeof iv !== 'string' || !HEX4.test(iv)) throw new Error('mode-chains-blocks: iv 는 16 진 대문자 네 자리여야 한다');
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 800)
    throw new Error('mode-chains-blocks: stepMs 는 800 이상의 수여야 한다');
  return { type: 'mode-chains-blocks', message, key, iv, stepMs };
}

// ── 장난감 SPN (Stinson 예제 3.1) ─────────────────────────────────────────

const SBOX = [0xe, 0x4, 0xd, 0x1, 0x2, 0xf, 0xb, 0x8, 0x3, 0xa, 0x6, 0xc, 0x5, 0x9, 0x0, 0x7];
/** 자리 i(1..16, 왼쪽부터) 의 비트가 가는 자리 π(i) */
const PERM = [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16];

function substitute(w: number): number {
  let out = 0;
  for (let cell = 0; cell < 4; cell += 1) {
    const shift = 12 - cell * 4;
    out |= SBOX[(w >> shift) & 0xf]! << shift;
  }
  return out;
}

function permute(w: number): number {
  let out = 0;
  for (let i = 1; i <= 16; i += 1) {
    const bit = (w >> (16 - i)) & 1;
    out |= bit << (16 - PERM[i - 1]!);
  }
  return out;
}

/** K^r = K 의 자리 4r−3 부터 이어진 16 비트 (r = 1..5) */
function roundKey(key: number, r: number): number {
  const start = 4 * r - 3;
  return (key >>> (32 - (start + 15))) & 0xffff;
}

/** E_K — 라운드 넷. 마지막 라운드는 순열이 없고 열쇠가 하나 더 붙는다 */
export function encryptBlock(x: number, key: number): number {
  let w = x;
  for (let r = 1; r <= 3; r += 1) w = permute(substitute(w ^ roundKey(key, r)));
  return substitute(w ^ roundKey(key, 4)) ^ roundKey(key, 5);
}

function hex4(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, '0');
}

export async function modeChainsBlocks(ctx: FacetContext<ModeChainsBlocksFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ModeChainsBlocksFacetData>;
  const data = narrowModeChainsBlocks(ctx.data);
  const key = parseInt(data.key, 16);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const blocks: { plain: number; chars: string[] }[] = [];
  for (let i = 0; i < data.message.length; i += 2) {
    const a = data.message.charCodeAt(i);
    const b = data.message.charCodeAt(i + 1);
    blocks.push({ plain: (a << 8) | b, chars: [data.message[i]!, data.message[i + 1]!] });
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      blocks: blocks.map((b) => ({ plain: hex4(b.plain), chars: b.chars })),
      iv: data.iv,
      key: data.key,
      distinctPlain: new Set(blocks.map((b) => b.plain)).size,
    },
  });

  let prev = parseInt(data.iv, 16);
  const inputs: number[] = [];
  const ciphers: number[] = [];
  for (let i = 0; i < blocks.length; i += 1) {
    if (!(await pause())) return;
    const block = blocks[i]!;
    const input = block.plain ^ prev;
    inputs.push(input);
    await ctx.emit({
      type: 'carry',
      payload: {
        index: i + 1,
        from: i,
        carried: hex4(prev),
        plain: hex4(block.plain),
        input: hex4(input),
        distinctInputs: new Set(inputs).size,
        inputs: inputs.length,
      },
    });

    if (!(await pause())) return;
    const cipher = encryptBlock(input, key);
    ciphers.push(cipher);
    await ctx.emit({
      type: 'encrypt',
      payload: {
        index: i + 1,
        input: hex4(input),
        cipher: hex4(cipher),
        distinctCiphers: new Set(ciphers).size,
        ciphers: ciphers.length,
      },
    });
    prev = cipher;
  }
}
