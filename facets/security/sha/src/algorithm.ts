/**
 * sha — 해시와 메시지 인증. 열쇠를 앞에 붙인 H(K‖m) 은 받은 표에서 이어 접는 것을 막지 못하고,
 * HMAC 은 이어 접은 값을 바깥 접기에 한 번 더 넣어 그 이음을 끊는다.
 *
 * 모형 — 장난감 해시 H (조각 compress-block-by-block · internal-state-carries · key-plus-message ·
 * hash-twice-with-pads 와 같은 규약):
 *   상태 16 비트 · IV 6a09 · 덩어리 2 바이트 (앞 바이트 × 256 + 뒤 바이트)
 *   압축 f(h, m): x = h 에서 세 라운드 [x ⊕= m → x = x × 9e37 mod 2¹⁶ → 왼쪽으로 5 자리 돌리기] 뒤 (x + h) mod 2¹⁶
 *   패딩: 80 → 00 을 z 개 (접는 바이트 수가 짝수가 되는 가장 작은 z) → 길이(비트)를 16 비트로, 큰 쪽 먼저
 *   HMAC(K, m) = H((K ⊕ 5c5c) ‖ H((K ⊕ 3636) ‖ m))
 *
 * 한 판 = 방식(scheme) × 공격(attack). 걸음 일곱 (걸음 0 포함):
 *   0 init (silent)      줄 머리 — 열쇠 칸 유무 · 바깥 줄 유무 · 칸의 자리
 *   1 alice-tag          Alice 가 표 T 를 셈한다
 *   2 deliver            (글, T) 가 Mallory 손에 들어간다 — 이 걸음 앞에는 phase 가 없다 (alice-tag 이 켜진 채)
 *   3 forge-message      Mallory 가 보낼 글을 만든다 (이어 붙이기: 글 ‖ 원래 패딩 ‖ ME · 고치기: PAY 90)
 *   4 forge-tag          Mallory 가 붙일 표를 접는다 (이어 붙이기: T 에서 · 고치기: IV 에서)
 *   5 bob-tag            Bob 이 받은 글로 표를 다시 셈한다 · Mallory 의 칸이 Bob 의 줄에 내려앉는지
 *   6 verdict            Bob 의 판정
 *
 * 이벤트 (payload 스키마 · silent 여부):
 *   init          silent  { scheme, attack, key, message, rows: RowShape[] }
 *                         RowShape = { row: RowId, startCol, head: number | null, slots: { id, col, head: number | null }[] }
 *                         head 는 걸음 0 에 보이는 줄 머리 값(열쇠 덩어리 · K ⊕ ipad · K ⊕ opad). 나머지 칸은 빈 자리
 *   alice-tag             { ms, rows: FoldRowView[], tag }
 *                         FoldRowView = { row: RowId, start, startCol, cells: { id, col, block, state }[] }
 *   deliver               { ms, message, tag }
 *   forge-message         { ms, attack, sent: { byte, kind: 'text' | 'pad' }[] }
 *   forge-tag             { ms, attack, row: FoldRowView, claim, folds }
 *   bob-tag               { ms, rows: FoldRowView[], bob, folds, match: ('land' | 'half' | 'miss')[], lands }
 *                         match[i] — Mallory 의 i 번째 칸이 같은 열의 Bob 첫 줄 칸과 덩어리 · 상태가 다 같으면 land,
 *                         덩어리만 같으면 half, 덩어리부터 다르면 miss. lands = 모두 land
 *   verdict               { ms, bob, claim, accepted }
 *   phase         silent  { phase }
 *
 * phase 어휘 (irs.ts 와 정확히 같다):
 *   alice-tag · forge-rewrite · forge-hash · forge-glue · forge-extend · tag-plain · tag-prefix · tag-hmac · bob-verdict
 *
 * 계기 (판 머리에서 0 으로 되돌린다):
 *   mallory-folds  Mallory 가 한 압축 수 (걸음 4)
 *   bob-folds      Bob 이 한 압축 수, HMAC 은 안팎 합 (걸음 5)
 *   accepted       받아들임 1 / 버림 0 (걸음 6)
 *
 * 동률 — 판정은 16 비트 정수의 같음이다. 이 데이터에서 Bob 의 셈 = 붙인 표 가 되는 판은 셋
 * (H(m)×고치기 · H(m)×이어 붙이기 · H(K‖m)×이어 붙이기) 이다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const IV = 0x6a09;
const IPAD = 0x3636;
const OPAD = 0x5c5c;
const MUL = 0x9e37;

/** 걸음마다의 운동 길이(ms). 재생 길이는 stepMs + 운동이다. 걸음 5 만 길다 (Bob 의 줄 최대 13 접기). */
const MOTION_MS = 500;
const LONG_MOTION_MS = 800;

export const SCHEME_PLAIN = 0;
export const SCHEME_PREFIX = 1;
export const SCHEME_HMAC = 2;
export const ATTACK_REWRITE = 0;
export const ATTACK_EXTEND = 1;

export type ShaData = {
  type: 'sha';
  stepMs: number;
  key: number;
  message: string;
  altered: string;
  extension: string;
  schemes: string[];
  attacks: string[];
  scheme: number;
  attack: number;
  roles: string[];
};

export type RowId = 'alice' | 'aliceOuter' | 'mallory' | 'bob' | 'bobOuter';

export type FoldCell = { id: string; col: number; block: number; state: number };
export type FoldRowView = { row: RowId; start: number; startCol: number; cells: FoldCell[] };
export type SentByte = { byte: number; kind: 'text' | 'pad' };
export type Match = 'land' | 'half' | 'miss';

export type ShaRound = {
  scheme: number;
  attack: number;
  tag: number;
  aliceRows: FoldRowView[];
  sent: SentByte[];
  mallory: FoldRowView;
  claim: number;
  bobRows: FoldRowView[];
  bob: number;
  match: Match[];
  lands: boolean;
  accepted: boolean;
  malloryFolds: number;
  bobFolds: number;
};

// ─────────────────────────────────────────────── 장난감 H

export function compress(h: number, m: number): number {
  let x = h;
  for (let r = 0; r < 3; r++) {
    x = (x ^ m) & 0xffff;
    x = Math.imul(x, MUL) & 0xffff;
    x = ((x << 5) | (x >>> 11)) & 0xffff;
  }
  return (x + h) & 0xffff;
}

/** 패딩 바이트 — streamLen(실제로 접는 바이트 수)의 짝홀이 z 를, countedLen 이 길이 칸을 정한다. */
export function padBytes(streamLen: number, countedLen: number): number[] {
  const bits = countedLen * 8;
  if (!Number.isInteger(bits) || bits < 0 || bits > 0xffff) {
    throw new Error(`sha: 길이 칸 16 비트에 담을 수 없는 길이 ${countedLen}`);
  }
  const z = (streamLen + 3) % 2;
  const out = [0x80];
  for (let i = 0; i < z; i++) out.push(0);
  out.push((bits >> 8) & 0xff, bits & 0xff);
  return out;
}

export function asciiBytes(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0);
    if (c === undefined || c > 0x7f) throw new Error(`sha: ASCII 가 아닌 글자 ${ch}`);
    out.push(c);
  }
  return out;
}

const word = (v: number): number[] => [(v >> 8) & 0xff, v & 0xff];

export type Fold = { start: number; end: number; steps: { block: number; state: number }[] };

/** h 에서 출발해 (head 바이트 ‖ msg ‖ 패딩) 을 두 바이트씩 접는다. 길이 칸은 countedLen × 8. */
export function foldStream(h: number, head: number[], msg: number[], countedLen: number): Fold {
  const stream = [...head, ...msg];
  const bytes = [...stream, ...padBytes(stream.length, countedLen)];
  if (bytes.length % 2 !== 0) throw new Error('sha: 덩어리로 나뉘지 않는 줄');
  const steps: { block: number; state: number }[] = [];
  let s = h;
  for (let i = 0; i < bytes.length; i += 2) {
    const block = (bytes[i]! << 8) | bytes[i + 1]!;
    s = compress(s, block);
    steps.push({ block, state: s });
  }
  return { start: h, end: s, steps };
}

export type Tag = { tag: number; folds: { kind: 'one' | 'inner' | 'outer'; fold: Fold; headBlocks: number }[] };

/** 표 = tag(방식, 글). 모르는 방식이면 던진다 (IR 은 −1). */
export function tagOf(scheme: number, key: number, msg: number[]): Tag {
  if (scheme === SCHEME_PLAIN) {
    const fold = foldStream(IV, [], msg, msg.length);
    return { tag: fold.end, folds: [{ kind: 'one', fold, headBlocks: 0 }] };
  }
  if (scheme === SCHEME_PREFIX) {
    const fold = foldStream(IV, word(key), msg, msg.length + 2);
    return { tag: fold.end, folds: [{ kind: 'one', fold, headBlocks: 1 }] };
  }
  if (scheme === SCHEME_HMAC) {
    const inner = foldStream(IV, word(key ^ IPAD), msg, msg.length + 2);
    const outer = foldStream(IV, word(key ^ OPAD), word(inner.end), 4);
    return {
      tag: outer.end,
      folds: [
        { kind: 'inner', fold: inner, headBlocks: 1 },
        { kind: 'outer', fold: outer, headBlocks: 1 },
      ],
    };
  }
  throw new Error(`sha: 모르는 방식 ${scheme}`);
}

/** 줄 머리 값 — 열쇠 칸이 있으면 그 덩어리 (H(K‖m) 은 K, HMAC 안쪽은 K ⊕ ipad, 바깥은 K ⊕ opad). */
export function headBlock(scheme: number, key: number, outer: boolean): number | null {
  if (scheme === SCHEME_PLAIN) return null;
  if (scheme === SCHEME_PREFIX) return key;
  if (scheme === SCHEME_HMAC) return outer ? (key ^ OPAD) & 0xffff : (key ^ IPAD) & 0xffff;
  throw new Error(`sha: 모르는 방식 ${scheme}`);
}

/** 칸 식별자 — 열쇠 칸은 key, 나머지는 열쇠 뒤로 센 차례. 열쇠 칸이 끼어들면 뒤 칸이 같은 이름으로 한 열 밀린다. */
function cellId(index: number, headBlocks: number, prefix: string): string {
  return index < headBlocks ? `${prefix}key` : `${prefix}${index - headBlocks}`;
}

function rowView(row: RowId, fold: Fold, headBlocks: number, startCol: number, prefix: string): FoldRowView {
  return {
    row,
    start: fold.start,
    startCol,
    cells: fold.steps.map((s, i) => ({
      id: cellId(i, headBlocks, prefix),
      col: startCol + 1 + i,
      block: s.block,
      state: s.state,
    })),
  };
}

function tagRows(t: Tag, first: RowId, outer: RowId): FoldRowView[] {
  return t.folds.map((f) =>
    f.kind === 'outer' ? rowView(outer, f.fold, f.headBlocks, 0, 'o') : rowView(first, f.fold, f.headBlocks, 0, ''),
  );
}

/** 한 판을 끝까지 셈한다. Mallory 는 열쇠를 모른다 — 쓰는 것은 공개된 규약(열쇠 2 바이트 · 패딩)과 받은 글 · 표뿐. */
export function playRound(data: ShaData, scheme: number, attack: number): ShaRound {
  if (!Number.isInteger(scheme) || scheme < 0 || scheme >= data.schemes.length) {
    throw new Error(`sha: 모르는 방식 ${scheme}`);
  }
  if (!Number.isInteger(attack) || attack < 0 || attack >= data.attacks.length) {
    throw new Error(`sha: 모르는 공격 ${attack}`);
  }
  const msg = asciiBytes(data.message);
  const alice = tagOf(scheme, data.key, msg);
  const T = alice.tag;

  let sent: SentByte[];
  let fold: Fold;
  let startCol: number;
  if (attack === ATTACK_REWRITE) {
    const alt = asciiBytes(data.altered);
    sent = alt.map((byte) => ({ byte, kind: 'text' as const }));
    fold = foldStream(IV, [], alt, alt.length);
    startCol = 0;
  } else if (attack === ATTACK_EXTEND) {
    const ext = asciiBytes(data.extension);
    const known = msg.length + (scheme === SCHEME_PLAIN ? 0 : 2);
    const glue = padBytes(known, known);
    sent = [
      ...msg.map((byte) => ({ byte, kind: 'text' as const })),
      ...glue.map((byte) => ({ byte, kind: 'pad' as const })),
      ...ext.map((byte) => ({ byte, kind: 'text' as const })),
    ];
    fold = foldStream(T, [], ext, known + glue.length + ext.length);
    startCol = (known + glue.length) / 2;
  } else {
    throw new Error(`sha: 모르는 공격 ${attack}`);
  }
  const mallory = rowView('mallory', fold, 0, startCol, 'm');

  const bobTag = tagOf(scheme, data.key, sent.map((s) => s.byte));
  const bobRows = tagRows(bobTag, 'bob', 'bobOuter');
  const bobFirst = bobRows[0];
  if (!bobFirst) throw new Error('sha: Bob 의 줄이 없다');
  const match: Match[] = mallory.cells.map((c) => {
    const b = bobFirst.cells.find((x) => x.col === c.col);
    if (!b || b.block !== c.block) return 'miss';
    return b.state === c.state ? 'land' : 'half';
  });

  return {
    scheme,
    attack,
    tag: T,
    aliceRows: tagRows(alice, 'alice', 'aliceOuter'),
    sent,
    mallory,
    claim: fold.end,
    bobRows,
    bob: bobTag.tag,
    match,
    lands: match.every((m) => m === 'land'),
    accepted: bobTag.tag === fold.end,
    malloryFolds: fold.steps.length,
    bobFolds: bobTag.folds.reduce((n, f) => n + f.fold.steps.length, 0),
  };
}

// ─────────────────────────────────────────────── 자료 좁히개

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export function readShaData(raw: unknown): ShaData {
  if (typeof raw !== 'object' || raw === null) throw new Error('sha: initialData 가 없다');
  const r = raw as Record<string, unknown>;
  const { type, stepMs, key, message, altered, extension, schemes, attacks, scheme, attack, roles } = r;
  if (type !== 'sha') throw new Error(`sha: initialData.type 이 sha 가 아니다 (${String(type)})`);
  if (typeof stepMs !== 'number' || stepMs < 800) throw new Error('sha: stepMs 는 800 이상의 수');
  if (typeof key !== 'number' || !Number.isInteger(key) || key < 0 || key > 0xffff) {
    throw new Error('sha: key 는 16 비트 정수');
  }
  if (typeof message !== 'string' || typeof altered !== 'string' || typeof extension !== 'string') {
    throw new Error('sha: message · altered · extension 은 글');
  }
  if (!isStringArray(schemes) || !isStringArray(attacks) || !isStringArray(roles)) {
    throw new Error('sha: schemes · attacks · roles 는 글 목록');
  }
  if (typeof scheme !== 'number' || typeof attack !== 'number') throw new Error('sha: scheme · attack 은 수');
  return { type, stepMs, key, message, altered, extension, schemes, attacks, scheme, attack, roles };
}

/** 걸음 0 의 줄 모양 — 빈 자리와 줄 머리. 값(상태 · 표)은 싣지 않는다. */
function rowShapes(round: ShaRound, key: number) {
  const shape = (v: FoldRowView, outer: boolean, head: boolean) => ({
    row: v.row,
    startCol: v.startCol,
    head: v.row === 'mallory' ? null : IV,
    slots: v.cells.map((c) => ({
      id: c.id,
      col: c.col,
      head: head && c.id.endsWith('key') ? headBlock(round.scheme, key, outer) : null,
    })),
  });
  return [
    ...round.aliceRows.map((v) => shape(v, v.row === 'aliceOuter', true)),
    shape(round.mallory, false, false),
    ...round.bobRows.map((v) => shape(v, v.row === 'bobOuter', true)),
  ];
}

// ─────────────────────────────────────────────── 알고리즘

export async function shaAlgorithm(ctx: FacetContext<ShaData>): Promise<void> {
  const rctx = ctx as ReactiveContext<ShaData>;
  const data = readShaData(rctx.data);
  let scheme = data.scheme;
  let attack = data.attack;

  // 계기는 누적 채널이라 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number) => {
    const prev = shown.get(name);
    rctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };
  const phase = (name: string) => rctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = (motion: number) => rctx.sleep(data.stepMs + motion);

  try {
    for (;;) {
      if (rctx.cancelled) return;
      const round = playRound(data, scheme, attack);

      // 걸음 0 — 판 머리. 앞 판의 계기를 0 으로 되돌린다
      setMetric('mallory-folds', 0);
      setMetric('bob-folds', 0);
      setMetric('accepted', 0);
      await rctx.emit({
        type: 'init',
        payload: { scheme, attack, key: data.key, message: data.message, rows: rowShapes(round, data.key) },
        silent: true,
      });
      if (!(await pause(0))) return;

      // 걸음 1
      await phase('alice-tag');
      await rctx.emit({ type: 'alice-tag', payload: { ms: MOTION_MS, rows: round.aliceRows, tag: round.tag } });
      if (!(await pause(MOTION_MS))) return;

      // 걸음 2 — phase 없음 (alice-tag 이 켜진 채)
      await rctx.emit({ type: 'deliver', payload: { ms: MOTION_MS, message: data.message, tag: round.tag } });
      if (!(await pause(MOTION_MS))) return;

      // 걸음 3
      if (attack === ATTACK_REWRITE) await phase('forge-rewrite');
      else await phase('forge-glue');
      await rctx.emit({ type: 'forge-message', payload: { ms: MOTION_MS, attack, sent: round.sent } });
      if (!(await pause(MOTION_MS))) return;

      // 걸음 4
      if (attack === ATTACK_REWRITE) await phase('forge-hash');
      else await phase('forge-extend');
      setMetric('mallory-folds', round.malloryFolds);
      await rctx.emit({
        type: 'forge-tag',
        payload: { ms: MOTION_MS, attack, row: round.mallory, claim: round.claim, folds: round.malloryFolds },
      });
      if (!(await pause(MOTION_MS))) return;

      // 걸음 5
      if (scheme === SCHEME_PLAIN) await phase('tag-plain');
      else if (scheme === SCHEME_PREFIX) await phase('tag-prefix');
      else await phase('tag-hmac');
      setMetric('bob-folds', round.bobFolds);
      await rctx.emit({
        type: 'bob-tag',
        payload: {
          ms: LONG_MOTION_MS,
          rows: round.bobRows,
          bob: round.bob,
          folds: round.bobFolds,
          match: round.match,
          lands: round.lands,
        },
      });
      if (!(await pause(LONG_MOTION_MS))) return;

      // 걸음 6
      await phase('bob-verdict');
      setMetric('accepted', round.accepted ? 1 : 0);
      await rctx.emit({
        type: 'verdict',
        payload: { ms: MOTION_MS, bob: round.bob, claim: round.claim, accepted: round.accepted },
      });
      if (!(await pause(MOTION_MS))) return;

      // 손잡이를 기다린다
      for (;;) {
        if (rctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (rctx.cancelled) return;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number' || !Number.isInteger(value)) continue;
        if (input.type === 'scheme') {
          if (value < 0 || value >= data.schemes.length) continue;
          scheme = value;
          break;
        }
        if (input.type === 'attack') {
          if (value < 0 || value >= data.attacks.length) continue;
          attack = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!rctx.cancelled) throw err;
  }
}
