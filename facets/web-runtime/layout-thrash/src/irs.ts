/**
 * layout-thrash 의 IR — 더러움 플래그와 레이아웃/강제/잰 상자 카운터의 누적만 다룬다.
 *
 * `widths`(상자 너비 목록)와 `counts`(길이 3 — [layouts, forced, measured])는 부르는
 * 쪽이 미리 만들어 매개변수로 건넨다. IR 은 그 배열을 색인으로 읽고 쓸 뿐, 스스로
 * 배열을 만들지 않는다.
 *
 * phase 어휘는 algorithm.ts 와 정확히 같은 여섯이다. 한 상자를 끝까지 처리하는
 * 것이 한 걸음이라, 그 안의 읽기·강제 판정·쓰기는 한 phase(rw-step · wr-step)로
 * 묶어 코드 패널이 한 덩어리로 강조하게 한다 — 따로 두면 걸음 경계(sleep) 없이
 * 연달아 보내는 phase 라 마지막 것만 남고 나머지는 끝내 안 켜진다:
 *   rw-step · rw-frame · wr-step · batch-read · batch-write · batch-frame
 */
import type { IR, IRExpr, IRStmt } from '@ffacet/core';

const litN = (value: number): IRExpr => ({ kind: 'lit', value });
const litB = (value: boolean): IRExpr => ({ kind: 'lit', value });
const v = (name: string): IRExpr => ({ kind: 'var', name });
const idx = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx: i });
const add = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '+', l, r });
const eq = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op: '==', l, r });

/** `counts[slot] = counts[slot] + delta` — 카운터 하나를 늘린다. */
function bumpCounter(slot: number, delta: IRExpr, phase: string): IRStmt {
  return { kind: 'assign', target: idx('counts', litN(slot)), expr: add(idx('counts', litN(slot)), delta), phase };
}

function setDirty(value: boolean, phase: string): IRStmt {
  return { kind: 'assign', target: v('dirty'), expr: litB(value), phase };
}

/** 강제/프레임 레이아웃 한 번의 셈 — layouts++ (그리고 forced 도 겸하면 forced++), measured += n. */
function layoutPass(phase: string, alsoForced: boolean): IRStmt[] {
  const out: IRStmt[] = [bumpCounter(0, litN(1), phase)];
  if (alsoForced) out.push(bumpCounter(1, litN(1), phase));
  out.push(bumpCounter(2, v('n'), phase));
  out.push(setDirty(false, phase));
  return out;
}

// ── 번갈아: 상자마다 읽고(가끔 강제 레이아웃) 쓴다. 루프가 끝나도 더러우면
//    브라우저가 다음 프레임에서 한 번 더 잰다.
const rwBody: IRStmt[] = [
  { kind: 'comment', text: 'read box i (offsetWidth) — forces a layout if still dirty from the previous box' },
  { kind: 'var', name: 'w', type: { kind: 'int' }, init: idx('widths', v('i')), phase: 'rw-step' },
  { kind: 'if', cond: v('dirty'), then: layoutPass('rw-step', true) },
  { kind: 'comment', text: 'write box i (style.width) — the row now flows the boxes after it to the right' },
  { kind: 'assign', target: idx('widths', v('i')), expr: add(v('w'), litN(10)), phase: 'rw-step' },
  setDirty(true, 'rw-step'),
];
const rwLoop: IRStmt = { kind: 'for-range', var: 'i', from: litN(0), to: v('n'), inclusive: false, body: rwBody, phase: 'rw-step' };
const rwFrame: IRStmt = {
  kind: 'if',
  cond: v('dirty'),
  then: [
    { kind: 'comment', text: 'script ended dirty — the browser runs one more (non-forced) frame layout' },
    ...layoutPass('rw-frame', false),
  ],
};

// ── 쓰고읽기: 상자마다 먼저 쓰고 바로 읽는다(void box.offsetWidth) — 매번 더러운
//    채로 읽으므로 상자 수만큼 강제 레이아웃이 돈다. 루프가 끝나면 이미 깨끗하다.
const wrBody: IRStmt[] = [
  { kind: 'comment', text: 'write box i (style.width) first' },
  { kind: 'assign', target: idx('widths', v('i')), expr: add(idx('widths', v('i')), litN(10)), phase: 'wr-step' },
  setDirty(true, 'wr-step'),
  { kind: 'comment', text: 'void box.offsetWidth — always dirty here, so this always forces a layout' },
  ...layoutPass('wr-step', true),
];
const wrLoop: IRStmt = { kind: 'for-range', var: 'i', from: litN(0), to: v('n'), inclusive: false, body: wrBody, phase: 'wr-step' };

// ── 읽기 모아서: 먼저 상자 전부를 읽고(늘 깨끗해서 레이아웃 없음) 그다음 전부
//    쓴다 — 스크립트가 끝난 뒤 단 한 번만 잰다.
const batchReadLoop: IRStmt = {
  kind: 'for-range',
  var: 'i',
  from: litN(0),
  to: v('n'),
  inclusive: false,
  phase: 'batch-read',
  body: [
    { kind: 'comment', text: 'read all boxes first — layout is still clean, nothing is forced' },
    { kind: 'var', name: 'w2', type: { kind: 'int' }, init: idx('widths', v('i')), phase: 'batch-read' },
  ],
};
const batchWriteLoop: IRStmt = {
  kind: 'for-range',
  var: 'i',
  from: litN(0),
  to: v('n'),
  inclusive: false,
  phase: 'batch-write',
  body: [{ kind: 'assign', target: idx('widths', v('i')), expr: add(idx('widths', v('i')), litN(10)), phase: 'batch-write' }],
};
const batchFrame: IRStmt = {
  kind: 'if',
  cond: v('dirty'),
  then: [
    { kind: 'comment', text: 'script ended dirty — exactly one frame layout measures every box' },
    ...layoutPass('batch-frame', false),
  ],
};

const RUN_BODY: IRStmt[] = [
  { kind: 'var', name: 'dirty', type: { kind: 'bool' }, init: litB(false) },
  {
    kind: 'if',
    cond: eq(v('order'), litN(0)),
    then: [rwLoop, rwFrame],
    else: [
      {
        kind: 'if',
        cond: eq(v('order'), litN(1)),
        then: [wrLoop],
        else: [batchReadLoop, batchWriteLoop, setDirty(true, 'batch-write'), batchFrame],
      },
    ],
  },
];

export const layoutThrashImperativeIR: IR = {
  id: 'layout-thrash-imperative',
  algorithm: 'layoutThrash',
  paradigm: 'imperative',
  functions: [
    {
      name: 'run',
      params: [
        { name: 'widths', type: { kind: 'list', of: { kind: 'int' } } },
        { name: 'n', type: { kind: 'int' } },
        { name: 'order', type: { kind: 'int' } },
        { name: 'counts', type: { kind: 'list', of: { kind: 'int' } } },
      ],
      returnType: { kind: 'void' },
      body: RUN_BODY,
    },
  ],
};

export const layoutThrashIRs: IR[] = [layoutThrashImperativeIR];
