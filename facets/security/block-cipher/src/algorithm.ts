/**
 * 블록 암호와 운용 모드 — 같은 메시지를 같은 열쇠로 두 번 잠그되 한 비트만 바꾸고, 두 암호문을 겹친다.
 *
 * 모형: 장난감 치환-순열 망(16 비트 덩어리 · 4 비트 S-상자 넷 · 비트 순열 · 창 미끄러짐 열쇠 일정)을 R 라운드로 줄인 판 E_R.
 *   - 비트 자리는 왼쪽(가장 큰 자리)부터 1..16, 칸(니블)은 왼쪽부터 1..4
 *   - 라운드 열쇠 K^r = 32 비트 주 열쇠의 자리 4r−3 부터 이어진 16 비트 (r = 1..5, R 과 무관)
 *   - 앞 R−1 라운드: w ← P(S(w ⊕ K^r)) · 라운드 R: w ← S(w ⊕ K^R) ⊕ K^{R+1}
 *   - 모드 ecb: C_i = E(P_i) · cbc: C_i = E(P_i ⊕ C_{i−1}), C_0 = IV · ctr: C_i = P_i ⊕ E((IV + i) mod 65536), i 는 0 부터
 *   - 바꾼 판: change 'plain' 이면 첫 평문 덩어리의 자리 flipAt 을, 'iv' 면 IV 의 자리 flipAt 을 뒤집는다
 *   - 다른 비트 = C ⊕ C′ 의 1 · 다른 칸 = C ⊕ C′ 의 0 아닌 니블 · 다른 덩어리 = C ⊕ C′ 가 0 아닌 덩어리 ·
 *     반복 = 원판 C 의 덩어리 가운데 앞 덩어리와 같은 것의 수. 짝은 뒤 덩어리를 그와 같은 가장 앞 덩어리에 잇는다
 *   동률 규칙은 없다 — 모든 셈이 정수 비트 연산이고 순위를 매기지 않는다.
 *
 * 한 판 = 걸음 넷 (걸음 0 포함). 손잡이 값 하나로 한 판을 끝까지 재생한 뒤 입력을 기다린다.
 *
 * 이벤트:
 *   phase    (silent) { phase: string }
 *   init     (silent — 걸음 0 을 갈아 끼운다)
 *            { blocks: number, mode: 'ecb' | 'cbc' | 'ctr', rounds: number, maxRounds: number,
 *              change: 'plain' | 'iv', flipAt: number,
 *              plain: string[] (16 진 넷 자리), plainText: string[] (덩어리마다 두 글자), plainBits: number[][] (0/1 × 16),
 *              iv: string, ivBits: number[], key: string (16 진 여덟 자리),
 *              changedFrom: string, changedTo: string (바뀐 덩어리 또는 IV 의 16 진),
 *              changedTextFrom: string, changedTextTo: string (평문이면 두 글자, IV 면 빈 글),
 *              counters: string[] (ctr 이면 덩어리마다 IV + i 의 16 진, 아니면 빈 배열) }
 *   lock     (걸음) { which: 'original' | 'changed', cipher: string[], bits: number[][], pairs: number[][] (1 부터 · 원판만), repeat: number }
 *   compare  (걸음) { bits: number[][] (C ⊕ C′), perBlock: number[], perBlockNibbles: number[],
 *                    diffBits: number, diffNibbles: number, diffBlocks: number, blocks: number }
 *
 * 걸음 차례: 0 [flip-plain | flip-iv] init → 1 [lock-*] lock original → 2 [lock-*] lock changed → 3 [compare] compare
 *
 * phase 어휘 (irs.ts 와 같다): flip-plain · flip-iv · lock-ecb · lock-cbc · lock-ctr · compare
 *
 * 계기 (누적 채널 — 지금 값을 들고 차이만 보낸다. 판 머리에서 넷 모두 0 으로):
 *   diff-bits · diff-nibbles · diff-blocks (걸음 3) · repeat-blocks (걸음 1)
 *
 * 입력: mode · rounds · change — payload.value 가 사다리에 든 number 일 때만 받는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BlockCipherData = {
  type: 'block-cipher';
  stepMs: number;
  message: string;
  key: string;
  iv: string;
  flipAt: number;
  sbox: number[];
  perm: number[];
  modeLadder: number[];
  modes: string[];
  roundsLadder: number[];
  changeLadder: number[];
  changes: string[];
  mode: number;
  rounds: number;
  change: number;
};

const MODE_IDS = ['ecb', 'cbc', 'ctr'] as const;
const CHANGE_IDS = ['plain', 'iv'] as const;
/** 주 열쇠 32 비트에서 K^{R+1} 까지 자를 수 있는 가장 큰 R. */
const ROUND_LIMIT = 4;
/** 무대가 자리를 잡아 둔 덩어리 수의 끝. */
const BLOCK_LIMIT = 4;

function isIntArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

function isHex(v: unknown, digits: number): v is string {
  return typeof v === 'string' && v.length === digits && /^[0-9A-F]+$/.test(v);
}

function sameList(a: readonly (number | string)[], b: readonly (number | string)[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** ctx.data 의 좁히개 — 모양이 어긋나면 한국어 메시지로 던진다. */
export function readBlockCipherData(raw: unknown): BlockCipherData {
  if (typeof raw !== 'object' || raw === null) throw new Error('block-cipher: 데이터가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'block-cipher') throw new Error('block-cipher: type 이 block-cipher 가 아니다');
  if (typeof d.stepMs !== 'number' || d.stepMs < 800) throw new Error('block-cipher: stepMs 는 800 이상의 수여야 한다');
  const message = d.message;
  if (typeof message !== 'string' || message.length === 0 || message.length % 2 !== 0) {
    throw new Error('block-cipher: 메시지 길이는 0 보다 큰 짝수여야 한다');
  }
  if (message.length / 2 > BLOCK_LIMIT) throw new Error('block-cipher: 메시지는 덩어리 넷(여덟 글자)을 넘지 않는다');
  for (let i = 0; i < message.length; i += 1) {
    const code = message.charCodeAt(i);
    if (code < 32 || code > 126) throw new Error('block-cipher: 메시지는 인쇄되는 ASCII 글자여야 한다');
  }
  if (!isHex(d.key, 8)) throw new Error('block-cipher: 주 열쇠는 16 진 대문자 여덟 자리여야 한다');
  if (!isHex(d.iv, 4)) throw new Error('block-cipher: IV 는 16 진 대문자 네 자리여야 한다');
  if (typeof d.flipAt !== 'number' || !Number.isInteger(d.flipAt) || d.flipAt < 1 || d.flipAt > 16) {
    throw new Error('block-cipher: flipAt 은 1..16 의 정수여야 한다');
  }
  if (!isIntArray(d.sbox) || d.sbox.length !== 16 || !sameList([...d.sbox].sort((a, b) => a - b), range(0, 16))) {
    throw new Error('block-cipher: sbox 는 0..15 의 순열이어야 한다');
  }
  if (!isIntArray(d.perm) || d.perm.length !== 16 || !sameList([...d.perm].sort((a, b) => a - b), range(1, 17))) {
    throw new Error('block-cipher: perm 은 1..16 의 순열이어야 한다');
  }
  if (!Array.isArray(d.modes) || !sameList(d.modes as string[], MODE_IDS)) {
    throw new Error('block-cipher: modes 는 ecb · cbc · ctr 차례여야 한다');
  }
  if (!isIntArray(d.modeLadder) || !sameList(d.modeLadder, range(0, MODE_IDS.length))) {
    throw new Error('block-cipher: modeLadder 는 0 · 1 · 2 여야 한다');
  }
  if (!Array.isArray(d.changes) || !sameList(d.changes as string[], CHANGE_IDS)) {
    throw new Error('block-cipher: changes 는 plain · iv 차례여야 한다');
  }
  if (!isIntArray(d.changeLadder) || !sameList(d.changeLadder, range(0, CHANGE_IDS.length))) {
    throw new Error('block-cipher: changeLadder 는 0 · 1 이어야 한다');
  }
  if (!isIntArray(d.roundsLadder) || d.roundsLadder.length === 0 || d.roundsLadder.some((r) => r < 1 || r > ROUND_LIMIT)) {
    throw new Error('block-cipher: roundsLadder 는 1..4 의 정수여야 한다');
  }
  if (typeof d.mode !== 'number' || !d.modeLadder.includes(d.mode)) throw new Error('block-cipher: mode 가 사다리에 없다');
  if (typeof d.rounds !== 'number' || !d.roundsLadder.includes(d.rounds)) throw new Error('block-cipher: rounds 가 사다리에 없다');
  if (typeof d.change !== 'number' || !d.changeLadder.includes(d.change)) throw new Error('block-cipher: change 가 사다리에 없다');
  return d as BlockCipherData;
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i < to; i += 1) out.push(i);
  return out;
}

// ── 셈 ─────────────────────────────────────────────────────────────────────

/** 16 비트 값 → 0/1 배열 (큰 자리부터). */
export function toBits(value: number, width: number): number[] {
  const out: number[] = [];
  for (let i = width - 1; i >= 0; i -= 1) out.push(Math.floor(value / 2 ** i) % 2);
  return out;
}

export function toHex(value: number, digits: number): string {
  return value.toString(16).toUpperCase().padStart(digits, '0');
}

/** 라운드 열쇠 K^r — 주 열쇠의 자리 4r−3 부터 16 비트. */
export function roundKey(key: number, r: number): number {
  if (r < 1 || r > ROUND_LIMIT + 1) throw new Error(`block-cipher: 라운드 열쇠 번호 ${r} 는 1..5 밖이다`);
  return (key >>> (20 - 4 * r)) & 0xffff;
}

function substitute(u: number, sbox: readonly number[]): number {
  let out = 0;
  for (let n = 0; n < 4; n += 1) {
    const shift = 12 - 4 * n;
    const s = sbox[(u >> shift) & 0xf];
    if (s === undefined) throw new Error('block-cipher: S-상자 칸이 비었다');
    out |= s << shift;
  }
  return out;
}

function permute(s: number, perm: readonly number[]): number {
  let out = 0;
  for (let i = 1; i <= 16; i += 1) {
    const to = perm[i - 1];
    if (to === undefined) throw new Error('block-cipher: 순열 자리가 비었다');
    out |= ((s >> (16 - i)) & 1) << (16 - to);
  }
  return out;
}

/** E_R — R 라운드 판. */
export function encryptBlock(block: number, key: number, rounds: number, sbox: readonly number[], perm: readonly number[]): number {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > ROUND_LIMIT) throw new Error(`block-cipher: 라운드 수 ${rounds} 는 1..4 밖이다`);
  let w = block;
  for (let r = 1; r <= rounds; r += 1) {
    const s = substitute(w ^ roundKey(key, r), sbox);
    w = r < rounds ? permute(s, perm) : s ^ roundKey(key, rounds + 1);
  }
  return w;
}

/** 모드로 덩어리들을 잠근다. mode 는 'ecb' · 'cbc' · 'ctr' 뿐 — 나머지는 던진다. */
export function encryptMode(
  blocks: readonly number[],
  iv: number,
  key: number,
  mode: string,
  rounds: number,
  sbox: readonly number[],
  perm: readonly number[],
): number[] {
  const out: number[] = [];
  if (mode === 'ecb') {
    for (const p of blocks) out.push(encryptBlock(p, key, rounds, sbox, perm));
  } else if (mode === 'cbc') {
    let prev = iv;
    for (const p of blocks) {
      prev = encryptBlock(p ^ prev, key, rounds, sbox, perm);
      out.push(prev);
    }
  } else if (mode === 'ctr') {
    blocks.forEach((p, i) => out.push(p ^ encryptBlock((iv + i) % 65536, key, rounds, sbox, perm)));
  } else {
    throw new Error(`block-cipher: 모르는 모드 ${mode}`);
  }
  return out;
}

export function messageBlocks(message: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < message.length; i += 2) out.push(message.charCodeAt(i) * 256 + message.charCodeAt(i + 1));
  return out;
}

function popcount(v: number): number {
  let n = 0;
  for (let x = v; x > 0; x >>= 1) n += x & 1;
  return n;
}

export type BlockCipherRun = {
  mode: string;
  change: string;
  rounds: number;
  plain: number[];
  plain2: number[];
  iv: number;
  iv2: number;
  cipher: number[];
  cipher2: number[];
  xor: number[];
  perBlock: number[];
  perBlockNibbles: number[];
  diffBits: number;
  diffNibbles: number;
  diffBlocks: number;
  repeat: number;
  pairs: number[][];
  counters: number[];
};

/** 손잡이 값 하나(모드 · 라운드 · 바꾼 것)의 판 전체를 셈한다. modeIndex · changeIndex 는 사다리 값(= 식별자 목록의 순번). */
export function computeRun(data: BlockCipherData, modeIndex: number, rounds: number, changeIndex: number): BlockCipherRun {
  const mode = data.modes[modeIndex];
  const change = data.changes[changeIndex];
  if (mode === undefined) throw new Error(`block-cipher: 모드 순번 ${modeIndex} 가 사다리 밖이다`);
  if (change === undefined) throw new Error(`block-cipher: 바꾼 것 순번 ${changeIndex} 가 사다리 밖이다`);
  const key = parseInt(data.key, 16);
  const iv = parseInt(data.iv, 16);
  const plain = messageBlocks(data.message);
  const mask = 1 << (16 - data.flipAt);
  const plain2 = [...plain];
  let iv2 = iv;
  if (change === 'plain') plain2[0] = (plain[0] as number) ^ mask;
  else if (change === 'iv') iv2 = iv ^ mask;
  else throw new Error(`block-cipher: 모르는 바꾼 것 ${change}`);
  const cipher = encryptMode(plain, iv, key, mode, rounds, data.sbox, data.perm);
  const cipher2 = encryptMode(plain2, iv2, key, mode, rounds, data.sbox, data.perm);
  const xor = cipher.map((c, i) => c ^ (cipher2[i] as number));
  const perBlock = xor.map(popcount);
  const perBlockNibbles = xor.map((x) => [12, 8, 4, 0].filter((s) => ((x >> s) & 0xf) !== 0).length);
  const pairs: number[][] = [];
  cipher.forEach((c, j) => {
    const first = cipher.indexOf(c);
    if (first < j) pairs.push([first + 1, j + 1]);
  });
  return {
    mode,
    change,
    rounds,
    plain,
    plain2,
    iv,
    iv2,
    cipher,
    cipher2,
    xor,
    perBlock,
    perBlockNibbles,
    diffBits: perBlock.reduce((a, b) => a + b, 0),
    diffNibbles: perBlockNibbles.reduce((a, b) => a + b, 0),
    diffBlocks: xor.filter((x) => x !== 0).length,
    repeat: pairs.length,
    pairs,
    counters: mode === 'ctr' ? plain.map((_, i) => (iv + i) % 65536) : [],
  };
}

// ── 재생 ───────────────────────────────────────────────────────────────────

type MetricName = 'diff-bits' | 'diff-nibbles' | 'diff-blocks' | 'repeat-blocks';

export async function blockCipherAlgorithm(ctx: FacetContext<BlockCipherData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BlockCipherData>;
  const data = readBlockCipherData(ctx.data);
  let modeIndex = data.mode;
  let rounds = data.rounds;
  let changeIndex = data.change;
  const maxRounds = Math.max(...data.roundsLadder);

  const shown: Record<MetricName, number> = { 'diff-bits': 0, 'diff-nibbles': 0, 'diff-blocks': 0, 'repeat-blocks': 0 };
  const setMetric = (name: MetricName, value: number): void => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const lockPhase = async (mode: string): Promise<void> => {
    switch (mode) {
      case 'ecb':
        await phase('lock-ecb');
        return;
      case 'cbc':
        await phase('lock-cbc');
        return;
      case 'ctr':
        await phase('lock-ctr');
        return;
      default:
        throw new Error(`block-cipher: 모르는 모드 ${mode}`);
    }
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const run = computeRun(data, modeIndex, rounds, changeIndex);
      const changedIsPlain = run.change === 'plain';
      const firstPlain = run.plain[0] as number;
      const firstPlain2 = run.plain2[0] as number;

      // 걸음 0 — 처음
      if (changedIsPlain) await phase('flip-plain');
      else await phase('flip-iv');
      setMetric('diff-bits', 0);
      setMetric('diff-nibbles', 0);
      setMetric('diff-blocks', 0);
      setMetric('repeat-blocks', 0);
      await ctx.emit({
        type: 'init',
        silent: true,
        payload: {
          blocks: run.plain.length,
          mode: run.mode,
          rounds,
          maxRounds,
          change: run.change,
          flipAt: data.flipAt,
          plain: run.plain.map((p) => toHex(p, 4)),
          plainText: run.plain.map((_, i) => data.message.slice(2 * i, 2 * i + 2)),
          plainBits: run.plain.map((p) => toBits(p, 16)),
          iv: toHex(run.iv, 4),
          ivBits: toBits(run.iv, 16),
          key: data.key,
          changedFrom: changedIsPlain ? toHex(firstPlain, 4) : toHex(run.iv, 4),
          changedTo: changedIsPlain ? toHex(firstPlain2, 4) : toHex(run.iv2, 4),
          changedTextFrom: changedIsPlain ? data.message.slice(0, 2) : '',
          changedTextTo: changedIsPlain ? String.fromCharCode(firstPlain2 >> 8, firstPlain2 & 0xff) : '',
          counters: run.counters.map((c) => toHex(c, 4)),
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 1 — 원판 잠금
      await lockPhase(run.mode);
      await ctx.emit({
        type: 'lock',
        payload: {
          which: 'original',
          cipher: run.cipher.map((c) => toHex(c, 4)),
          bits: run.cipher.map((c) => toBits(c, 16)),
          pairs: run.pairs,
          repeat: run.repeat,
        },
      });
      setMetric('repeat-blocks', run.repeat);
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 2 — 바꾼 판 잠금
      await lockPhase(run.mode);
      await ctx.emit({
        type: 'lock',
        payload: {
          which: 'changed',
          cipher: run.cipher2.map((c) => toHex(c, 4)),
          bits: run.cipher2.map((c) => toBits(c, 16)),
          pairs: [],
          repeat: run.repeat,
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      // 걸음 3 — 겹침
      await phase('compare');
      await ctx.emit({
        type: 'compare',
        payload: {
          bits: run.xor.map((x) => toBits(x, 16)),
          perBlock: run.perBlock,
          perBlockNibbles: run.perBlockNibbles,
          diffBits: run.diffBits,
          diffNibbles: run.diffNibbles,
          diffBlocks: run.diffBlocks,
          blocks: run.plain.length,
        },
      });
      setMetric('diff-bits', run.diffBits);
      setMetric('diff-nibbles', run.diffNibbles);
      setMetric('diff-blocks', run.diffBlocks);

      // 입력 — 우리 손잡이의 사다리 값만 받는다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        if (typeof payload !== 'object' || payload === null) continue;
        const value = (payload as { value?: unknown }).value;
        if (typeof value !== 'number') continue;
        if (input.type === 'mode' && data.modeLadder.includes(value)) {
          modeIndex = value;
          break;
        }
        if (input.type === 'rounds' && data.roundsLadder.includes(value)) {
          rounds = value;
          break;
        }
        if (input.type === 'change' && data.changeLadder.includes(value)) {
          changeIndex = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
