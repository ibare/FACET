/**
 * 쓰기 정책 IR — 아래층으로 내려간 쓰기를 센다.
 *
 * ── 캐시 상태를 매개변수로 받는 까닭
 *
 * 이 셈은 칸마다의 상태(어느 줄을 담고 있는가 · 고쳐졌는가 · 언제 쓰였는가)를
 * 들고 있어야 한다. 그런데 **IR 함수는 배열을 만들 수 없다** — `IRExpr` 는
 * `lit|var|index|len|binop|unop|call` 뿐이고 `IRStmt` 에도 배열을 짓는 문이 없다
 * (`kind: 'list'` 는 타입에만 있다). 그래서 상태 넷을 전부 **매개변수로 받는**
 * 꼴로 짰다. 부르는 쪽이 칸 수만큼의 배열을 비워 건네고, 함수가 그것을 제자리에서
 * 고쳐 가며 센다.
 *
 * 셈할 범위를 좁히는 길도 있었다 — 이를테면 축출만 세고 끝에 남은 것은 밖에서
 * 더하는 것이다. 그 길을 버린 까닭은 이 facet 의 주장이 바로 거기 있기 때문이다.
 * **끝에 남은 고쳐진 줄을 세지 않으면 write-back 이 1 로 나와 거짓이 된다.**
 * 그 덧셈이 IR 밖에 있으면 코드 패널을 읽는 사람은 그 사실을 못 본다.
 *
 * ── 32비트 천장
 *
 * 여기 오가는 수는 전부 작다. 쓰기 차례는 열이고 칸은 넷이라 `sent` 와 `clock` 은
 * 열을 넘지 않으며, 줄 번호도 한 자리다. 어느 언어의 `int` 로도 넘치지 않는다.
 * 다만 그 사실이 **구조로 잠겨 있어야** 하므로 `test/write-policy.test.ts` 가
 * 매개변수 배열의 길이와 답을 함께 잠근다 — 칸 수나 차례가 늘어 셈이 커지면
 * 그 검사가 먼저 깨진다.
 *
 * ── 어휘의 벽을 피해 간 자리
 *
 * - `ir-interpreter` 의 `&&` 는 짧은 회로가 아니다. "이 칸이 쓰였고 그 줄이
 *   같은가" 를 한 줄로 이으면 안 쓰인 칸에서도 오른쪽이 셈해진다. 그래서
 *   `findSlot` 과 `countDirty` 에서 `if` 를 중첩했다.
 * - 더티 표시는 비트가 아니라 0/1 정수다 (IR 에 비트 연산이 없다).
 * - 나눗셈도 `pow` 도 쓰지 않는다. 예약 수학 이름은 하나도 부르지 않는다.
 * - 변수·함수 이름은 여섯 언어 어디서도 예약어가 아니다 (C# 의 `base`·`out`·
 *   `object`, 파이썬의 `pass`·`from`, 자바의 `final` 따위를 피했다 — S-transpiler).
 *
 * phase 어휘는 `algorithm.ts` 의 phase payload 와 집합이 정확히 같다 (C3):
 *   'lookup' | 'hit' | 'evict' | 'fill' | 'store' | 'flush' | 'done'
 */

import type { IR, IRBinOp, IRExpr, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const INT_LIST: IRType = { kind: 'list', of: { kind: 'int' } };

const vr = (name: string): IRExpr => ({ kind: 'var', name });
const num = (value: number): IRExpr => ({ kind: 'lit', value });
const cell = (arr: string, i: IRExpr): IRExpr => ({ kind: 'index', arr: vr(arr), idx: i });
const size = (name: string): IRExpr => ({ kind: 'len', of: vr(name) });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const call = (fn: string, args: IRExpr[]): IRExpr => ({ kind: 'call', fn, args });

const decl = (name: string, init: IRExpr, phase: string): IRStmt => ({
  kind: 'var',
  name,
  type: INT,
  init,
  phase,
});
const put = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target,
  expr,
  phase,
});

export const writePolicyImperativeIR: IR = {
  id: 'write-policy-imperative',
  algorithm: 'writePolicy',
  paradigm: 'imperative',
  functions: [
    // ── 진입점. 쓰기 차례를 돌며 아래층으로 내려간 쓰기를 센다.
    {
      name: 'countMemoryWrites',
      params: [
        { name: 'writes', type: INT_LIST },
        { name: 'policy', type: INT },
        { name: 'slotLine', type: INT_LIST },
        { name: 'slotUsed', type: INT_LIST },
        { name: 'slotDirty', type: INT_LIST },
        { name: 'slotTime', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'policy 0 = write-through, 1 = write-back' },
        decl('sent', num(0), 'lookup'),
        decl('clock', num(0), 'lookup'),
        {
          kind: 'for-range',
          var: 'i',
          from: num(0),
          to: size('writes'),
          inclusive: false,
          phase: 'lookup',
          body: [
            decl('line', cell('writes', vr('i')), 'lookup'),
            put(vr('clock'), bin('+', vr('clock'), num(1)), 'lookup'),
            decl('s', call('findSlot', [vr('slotLine'), vr('slotUsed'), vr('line')]), 'lookup'),
            {
              kind: 'if',
              cond: bin('<', vr('s'), num(0)),
              phase: 'evict',
              then: [
                put(vr('s'), call('pickVictim', [vr('slotUsed'), vr('slotTime')]), 'evict'),
                {
                  kind: 'if',
                  cond: bin('==', cell('slotUsed', vr('s')), num(1)),
                  phase: 'evict',
                  then: [
                    {
                      kind: 'if',
                      cond: bin('==', cell('slotDirty', vr('s')), num(1)),
                      phase: 'evict',
                      then: [
                        {
                          kind: 'comment',
                          text: '쫓겨나는 줄이 고쳐진 줄이면 이때 내려간다',
                        },
                        put(vr('sent'), bin('+', vr('sent'), num(1)), 'evict'),
                      ],
                    },
                  ],
                },
                put(cell('slotLine', vr('s')), vr('line'), 'fill'),
                put(cell('slotUsed', vr('s')), num(1), 'fill'),
                put(cell('slotDirty', vr('s')), num(0), 'fill'),
              ],
            },
            put(cell('slotTime', vr('s')), vr('clock'), 'store'),
            {
              kind: 'if',
              cond: bin('==', vr('policy'), num(0)),
              phase: 'store',
              then: [
                { kind: 'comment', text: 'write-through — 고칠 때마다 내려간다' },
                put(vr('sent'), bin('+', vr('sent'), num(1)), 'store'),
              ],
              else: [
                { kind: 'comment', text: 'write-back — 표시만 남기고 미룬다' },
                put(cell('slotDirty', vr('s')), num(1), 'store'),
              ],
            },
          ],
        },
        {
          kind: 'comment',
          text: '끝에 남은 고쳐진 줄도 언젠가는 내려가야 한다. 세지 않으면 거짓이 된다',
        },
        put(
          vr('sent'),
          bin('+', vr('sent'), call('countDirty', [vr('slotUsed'), vr('slotDirty')])),
          'flush',
        ),
        { kind: 'return', expr: vr('sent'), phase: 'done' },
      ],
    },

    // ── 어떤 칸이 지금 그 줄을 담고 있는가. 없으면 -1.
    {
      name: 'findSlot',
      params: [
        { name: 'slotLine', type: INT_LIST },
        { name: 'slotUsed', type: INT_LIST },
        { name: 'line', type: INT },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 's',
          from: num(0),
          to: size('slotLine'),
          inclusive: false,
          phase: 'lookup',
          body: [
            {
              kind: 'comment',
              text: '두 조건을 && 로 잇지 않는다 — 오른쪽이 늘 셈해지기 때문이다',
            },
            {
              kind: 'if',
              cond: bin('==', cell('slotUsed', vr('s')), num(1)),
              phase: 'lookup',
              then: [
                {
                  kind: 'if',
                  cond: bin('==', cell('slotLine', vr('s')), vr('line')),
                  phase: 'lookup',
                  then: [{ kind: 'return', expr: vr('s'), phase: 'hit' }],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: num(-1), phase: 'lookup' },
      ],
    },

    // ── 자리가 없을 때 버릴 칸을 고른다. 빈 칸이 먼저, 없으면 가장 오래 안 쓰인 칸.
    {
      name: 'pickVictim',
      params: [
        { name: 'slotUsed', type: INT_LIST },
        { name: 'slotTime', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        {
          kind: 'for-range',
          var: 's',
          from: num(0),
          to: size('slotUsed'),
          inclusive: false,
          phase: 'evict',
          body: [
            {
              kind: 'if',
              cond: bin('==', cell('slotUsed', vr('s')), num(0)),
              phase: 'evict',
              then: [{ kind: 'return', expr: vr('s'), phase: 'evict' }],
            },
          ],
        },
        { kind: 'comment', text: 'LRU — 가장 오래 안 쓰인 칸' },
        decl('best', num(0), 'evict'),
        decl('bestTime', cell('slotTime', num(0)), 'evict'),
        {
          kind: 'for-range',
          var: 's',
          from: num(1),
          to: size('slotTime'),
          inclusive: false,
          phase: 'evict',
          body: [
            {
              kind: 'if',
              cond: bin('<', cell('slotTime', vr('s')), vr('bestTime')),
              phase: 'evict',
              then: [
                put(vr('bestTime'), cell('slotTime', vr('s')), 'evict'),
                put(vr('best'), vr('s'), 'evict'),
              ],
            },
          ],
        },
        { kind: 'return', expr: vr('best'), phase: 'evict' },
      ],
    },

    // ── 끝에 남은 고쳐진 줄의 수.
    {
      name: 'countDirty',
      params: [
        { name: 'slotUsed', type: INT_LIST },
        { name: 'slotDirty', type: INT_LIST },
      ],
      returnType: INT,
      body: [
        decl('n', num(0), 'flush'),
        {
          kind: 'for-range',
          var: 's',
          from: num(0),
          to: size('slotUsed'),
          inclusive: false,
          phase: 'flush',
          body: [
            {
              kind: 'if',
              cond: bin('==', cell('slotUsed', vr('s')), num(1)),
              phase: 'flush',
              then: [
                {
                  kind: 'if',
                  cond: bin('==', cell('slotDirty', vr('s')), num(1)),
                  phase: 'flush',
                  then: [put(vr('n'), bin('+', vr('n'), num(1)), 'flush')],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: vr('n'), phase: 'flush' },
      ],
    },
  ],
};

export const writePolicyIRs: IR[] = [writePolicyImperativeIR];
