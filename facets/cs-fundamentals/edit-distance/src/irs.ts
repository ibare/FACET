/**
 * editDistance 의 IR — 채우기와 되짚기 두 함수.
 *
 * 이 알고리즘은 2차원 표 그 자체라 배열 · 반복 · 조건만으로 온전히 펴진다.
 * **이름 붙인 호출 뒤로 감춘 것이 하나도 없다** — `min` 은 예약된 수학 이름이고
 * (`IR_MATH_BUILTINS`), 나머지는 전부 IR 어휘다.
 *
 * ── 되짚기도 편다
 *
 * 표를 채우는 것만 보이고 되짚기를 감추면 "숫자 하나가 아니라 방법이 나온다" 는
 * 주장의 뒷절이 코드 패널에서 사라진다. 그래서 `backtrack` 도 IR 로 편다.
 *
 * 돌려주는 것은 **고친 가짓수**이고, 고침 목록 자체는 인자로 받은 `ops` 에 적는다.
 * `IRExpr` 에 배열 리터럴이 없어(`lit` 은 수·글·참거짓뿐) IR 안에서 배열을 만들
 * 길이 없기 때문이다. 표도 같은 까닭으로 인자로 받는다.
 *
 * ── 낱말을 글자열로 받는 까닭
 *
 * `a` · `b` 는 `string` 이고 글자는 `a[i - 1]` 로 짚는다. 여섯 transpiler 가 이
 * 자리를 자기 표기로 옮긴다 — java 는 `a.charAt(i - 1)`, cpp·csharp·python·js·ts 는
 * 대괄호 그대로다. **글자를 변수에 담지 않는 것**이 조건이다. java 에서 그 변수는
 * `String` 으로 선언되는데 `charAt` 은 `char` 를 주므로 컴파일되지 않는다. 두 글자를
 * 견주는 자리에서만 짚으면 java 도 `char == char` 가 되어 뜻이 여섯 언어에서 같다.
 *
 * ── 짧은 회로에 기대지 않는다
 *
 * `i > 0 && table[i - 1][j] == …` 처럼 앞 조건이 뒤의 첨자를 지키는 모양을 쓰지
 * 않는다. `ir-interpreter` 의 `&&` 는 양쪽을 **먼저 다 셈하므로** `table[-1]` 을
 * 짚어 터진다. 조건을 겹쳐 쓰지 않고 `if` 를 포개고, 이미 고른 걸음인지는
 * `moved` 로 들고 다닌다.
 *
 * phase 어휘는 `algorithm.ts` 와 집합이 완전히 일치해야 한다 (C3) —
 * `init-edges` · `compare` · `fill-cell` · `step-back` · `answer`.
 */

import type { IR, IRBinOp, IRExpr, IRFunc, IRStmt, IRType } from '@ffacet/core/runtime';

const INT: IRType = { kind: 'int' };
const STR: IRType = { kind: 'string' };
const INT_LIST: IRType = { kind: 'list', of: INT };
const TABLE: IRType = { kind: 'list', of: INT_LIST };
const STR_LIST: IRType = { kind: 'list', of: STR };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const lit = (value: number | string): IRExpr => ({ kind: 'lit', value });
const at = (arr: IRExpr, idx: IRExpr): IRExpr => ({ kind: 'index', arr, idx });
const len = (of: IRExpr): IRExpr => ({ kind: 'len', of });
const bin = (op: IRBinOp, l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const minOf = (l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'call', fn: 'min', args: [l, r] });

/** `x - 1` — 표의 자리와 낱말의 자리가 하나씩 어긋나 있어 자주 쓰인다. */
const dec = (e: IRExpr): IRExpr => bin('-', e, lit(1));

/** `table[i][j]` */
const cell = (i: IRExpr, j: IRExpr): IRExpr => at(at(v('table'), i), j);

/** 지금 칸에서 만나는 두 글자. */
const letterA: IRExpr = at(v('a'), dec(v('i')));
const letterB: IRExpr = at(v('b'), dec(v('j')));

const assign = (target: IRExpr, expr: IRExpr, phase: string): IRStmt => ({
  kind: 'assign',
  target,
  expr,
  phase,
});

/** `ops[k] = "<이름>"` — 고친 가짓수를 세는 자리에 이름 그대로 적는다. */
const record = (name: string): IRStmt => assign(at(v('ops'), v('k')), lit(name), 'step-back');

const fillFunction: IRFunc = {
  name: 'fill',
  params: [
    { name: 'table', type: TABLE },
    { name: 'a', type: STR },
    { name: 'b', type: STR },
    { name: 'sub', type: INT },
  ],
  returnType: { kind: 'void' },
  body: [
    { kind: 'comment', text: 'from an empty prefix every letter costs one delete or one insert' },
    {
      kind: 'for-range',
      var: 'i',
      from: lit(0),
      to: len(v('a')),
      inclusive: true,
      body: [assign(cell(v('i'), lit(0)), v('i'), 'init-edges')],
    },
    {
      kind: 'for-range',
      var: 'j',
      from: lit(0),
      to: len(v('b')),
      inclusive: true,
      body: [assign(cell(lit(0), v('j')), v('j'), 'init-edges')],
    },
    {
      kind: 'for-range',
      var: 'i',
      from: lit(1),
      to: len(v('a')),
      inclusive: true,
      body: [
        {
          kind: 'for-range',
          var: 'j',
          from: lit(1),
          to: len(v('b')),
          inclusive: true,
          body: [
            { kind: 'comment', text: 'the same letter is free to keep' },
            { kind: 'var', name: 'cost', type: INT, init: v('sub'), phase: 'compare' },
            {
              kind: 'if',
              cond: bin('==', letterA, letterB),
              then: [assign(v('cost'), lit(0), 'compare')],
              phase: 'compare',
            },
            {
              kind: 'var',
              name: 'best',
              type: INT,
              init: minOf(
                bin('+', cell(dec(v('i')), v('j')), lit(1)),
                bin('+', cell(v('i'), dec(v('j'))), lit(1)),
              ),
              phase: 'compare',
            },
            assign(
              v('best'),
              minOf(v('best'), bin('+', cell(dec(v('i')), dec(v('j'))), v('cost'))),
              'compare',
            ),
            assign(cell(v('i'), v('j')), v('best'), 'fill-cell'),
          ],
        },
      ],
    },
  ],
};

const backtrackFunction: IRFunc = {
  name: 'backtrack',
  params: [
    { name: 'table', type: TABLE },
    { name: 'a', type: STR },
    { name: 'b', type: STR },
    { name: 'sub', type: INT },
    { name: 'ops', type: STR_LIST },
  ],
  returnType: INT,
  body: [
    { kind: 'comment', text: 'start at the last cell and walk back to the corner' },
    { kind: 'var', name: 'i', type: INT, init: len(v('a')), phase: 'step-back' },
    { kind: 'var', name: 'j', type: INT, init: len(v('b')), phase: 'step-back' },
    { kind: 'var', name: 'k', type: INT, init: lit(0), phase: 'step-back' },
    {
      kind: 'while',
      cond: bin('||', bin('>', v('i'), lit(0)), bin('>', v('j'), lit(0))),
      body: [
        { kind: 'var', name: 'moved', type: INT, init: lit(0), phase: 'step-back' },
        {
          kind: 'if',
          cond: bin('&&', bin('>', v('i'), lit(0)), bin('>', v('j'), lit(0))),
          then: [
            { kind: 'var', name: 'cost', type: INT, init: v('sub'), phase: 'step-back' },
            {
              kind: 'if',
              cond: bin('==', letterA, letterB),
              then: [assign(v('cost'), lit(0), 'step-back')],
              phase: 'step-back',
            },
            {
              kind: 'if',
              cond: bin(
                '==',
                cell(v('i'), v('j')),
                bin('+', cell(dec(v('i')), dec(v('j'))), v('cost')),
              ),
              then: [
                {
                  kind: 'if',
                  cond: bin('==', v('cost'), lit(0)),
                  then: [record('keep')],
                  else: [record('replace')],
                  phase: 'step-back',
                },
                assign(v('i'), dec(v('i')), 'step-back'),
                assign(v('j'), dec(v('j')), 'step-back'),
                assign(v('moved'), lit(1), 'step-back'),
              ],
              phase: 'step-back',
            },
          ],
          phase: 'step-back',
        },
        {
          kind: 'if',
          cond: bin('==', v('moved'), lit(0)),
          then: [
            {
              kind: 'if',
              cond: bin('>', v('i'), lit(0)),
              then: [
                {
                  kind: 'if',
                  cond: bin(
                    '==',
                    cell(v('i'), v('j')),
                    bin('+', cell(dec(v('i')), v('j')), lit(1)),
                  ),
                  then: [
                    record('delete'),
                    assign(v('i'), dec(v('i')), 'step-back'),
                    assign(v('moved'), lit(1), 'step-back'),
                  ],
                  phase: 'step-back',
                },
              ],
              phase: 'step-back',
            },
            {
              kind: 'if',
              cond: bin('==', v('moved'), lit(0)),
              then: [record('insert'), assign(v('j'), dec(v('j')), 'step-back')],
              phase: 'step-back',
            },
          ],
          phase: 'step-back',
        },
        assign(v('k'), bin('+', v('k'), lit(1)), 'step-back'),
      ],
    },
    { kind: 'comment', text: 'the walk ran backwards, so turn the list around' },
    {
      kind: 'for-range',
      var: 't',
      from: lit(0),
      to: bin('//', v('k'), lit(2)),
      inclusive: false,
      body: [
        {
          kind: 'swap',
          a: at(v('ops'), v('t')),
          b: at(v('ops'), bin('-', dec(v('k')), v('t'))),
          phase: 'answer',
        },
      ],
    },
    { kind: 'return', expr: v('k'), phase: 'answer' },
  ],
};

export const editDistanceImperativeIR: IR = {
  id: 'edit-distance-imperative',
  algorithm: 'editDistance',
  paradigm: 'imperative',
  functions: [fillFunction, backtrackFunction],
};

export const editDistanceIRs: IR[] = [editDistanceImperativeIR];
