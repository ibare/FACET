/**
 * nat 의 IR — 표 찾기(findRow)와 한 판 셈(natRun).
 *
 * IR 은 배열을 만들 수 없어 표를 **평행 배열 셋**(공인 포트 · 안쪽 기기 번호 · 먼 쪽 번호)으로 받는다. 부르는 쪽이
 * 기기 수만큼 0 으로 만들어 건넨다. 먼 쪽은 번호(0 서버 · 1 낯선 이)로 바꿔 건넨다.
 * 결과는 tally 다섯 칸(나감 · 막힘 · 제 답 되돌림 · 낯선 것 들임 · 들어오다 버림)과 got(기기마다 받은 들어온 패킷)에
 * 적고, 표의 줄 수를 돌려준다. 사양의 `out` 은 C# 예약어라 `tally` 로 이름을 바꿨다.
 *
 * phase — write-row(줄 적기) · block-clash(막힘 세기) · restore-dest(받는 이 되돌리기) · drop-no-row(버림 세기).
 * 제 답과 들어온 낯선 것이 같은 restore-dest 줄을 지난다 — NAT 가 둘을 가리지 못한다는 것이 그 줄이다.
 * 중간값 최대 51000 + 3 — 32 비트 안. 음수 // · % 없음.
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const INTS: IRType = { kind: 'list', of: INT };

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });
const bin = (op: '+' | '-' | '==' | '<' | '>=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const inc = (target: IRExpr, phase?: string): IRStmt =>
  phase === undefined
    ? { kind: 'assign', target, expr: bin('+', target, n(1)) }
    : { kind: 'assign', target, expr: bin('+', target, n(1)), phase };

const findRowCall = (port: IRExpr, remote: IRExpr, rows: IRExpr): IRExpr => ({
  kind: 'call',
  fn: 'findRow',
  args: [v('rowPub'), v('rowRemote'), rows, port, remote, v('key')],
});

export const natImperativeIR: IR = {
  id: 'nat-imperative',
  algorithm: 'nat',
  paradigm: 'imperative',
  functions: [
    {
      name: 'natRun',
      params: [
        { name: 'mode', type: INT },
        { name: 'key', type: INT },
        { name: 'devPort', type: INTS },
        { name: 'devRemote', type: INTS },
        { name: 'rowPub', type: INTS },
        { name: 'rowDev', type: INTS },
        { name: 'rowRemote', type: INTS },
        { name: 'got', type: INTS },
        { name: 'stranger', type: INT },
        { name: 'firstPort', type: INT },
        { name: 'tally', type: INTS },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'mode 0: rewrite the address only, 1: address and port' },
        { kind: 'comment', text: 'key 0: look up by public port, 1: public port and remote' },
        { kind: 'var', name: 'rows', type: INT, init: n(0) },
        { kind: 'var', name: 'nxt', type: INT, init: v('firstPort') },
        {
          kind: 'for-range',
          var: 'd',
          from: n(0),
          to: { kind: 'len', of: v('devPort') },
          inclusive: false,
          body: [
            { kind: 'comment', text: 'outbound: source address becomes the public one' },
            { kind: 'var', name: 'pub', type: INT, init: at('devPort', v('d')) },
            {
              kind: 'if',
              cond: bin('==', v('mode'), n(1)),
              then: [{ kind: 'assign', target: v('pub'), expr: v('nxt') }],
            },
            {
              kind: 'if',
              cond: bin('>=', findRowCall(v('pub'), at('devRemote', v('d')), v('rows')), n(0)),
              then: [
                { kind: 'comment', text: 'same key already in the table: no way back, hold it' },
                inc({ kind: 'index', arr: v('tally'), idx: n(1) }, 'block-clash'),
              ],
              else: [
                { kind: 'assign', target: at('rowPub', v('rows')), expr: v('pub'), phase: 'write-row' },
                { kind: 'assign', target: at('rowDev', v('rows')), expr: v('d') },
                { kind: 'assign', target: at('rowRemote', v('rows')), expr: at('devRemote', v('d')) },
                inc(v('rows')),
                inc({ kind: 'index', arr: v('tally'), idx: n(0) }),
                {
                  kind: 'if',
                  cond: bin('==', v('mode'), n(1)),
                  then: [inc(v('nxt'))],
                },
              ],
            },
          ],
        },
        { kind: 'comment', text: 'inbound: one reply per row, then the stranger on the first row port' },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('rows'),
          inclusive: true,
          body: [
            { kind: 'var', name: 'port', type: INT, init: at('rowPub', n(0)) },
            { kind: 'var', name: 'rem', type: INT, init: v('stranger') },
            {
              kind: 'if',
              cond: bin('<', v('i'), v('rows')),
              then: [
                { kind: 'assign', target: v('port'), expr: at('rowPub', v('i')) },
                { kind: 'assign', target: v('rem'), expr: at('rowRemote', v('i')) },
              ],
            },
            { kind: 'var', name: 'j', type: INT, init: findRowCall(v('port'), v('rem'), v('rows')) },
            {
              kind: 'if',
              cond: bin('>=', v('j'), n(0)),
              then: [
                { kind: 'comment', text: 'restore the destination to the inside owner of that row' },
                inc(at('got', at('rowDev', v('j'))), 'restore-dest'),
                {
                  kind: 'if',
                  cond: bin('<', v('i'), v('rows')),
                  then: [inc({ kind: 'index', arr: v('tally'), idx: n(2) })],
                  else: [inc({ kind: 'index', arr: v('tally'), idx: n(3) })],
                },
              ],
              else: [inc({ kind: 'index', arr: v('tally'), idx: n(4) }, 'drop-no-row')],
            },
          ],
        },
        { kind: 'return', expr: v('rows') },
      ],
    },
    {
      name: 'findRow',
      params: [
        { name: 'rowPub', type: INTS },
        { name: 'rowRemote', type: INTS },
        { name: 'rows', type: INT },
        { name: 'port', type: INT },
        { name: 'remote', type: INT },
        { name: 'key', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'first row whose key matches, or -1' },
        {
          kind: 'for-range',
          var: 'i',
          from: n(0),
          to: v('rows'),
          inclusive: false,
          body: [
            {
              kind: 'if',
              cond: bin('==', at('rowPub', v('i')), v('port')),
              then: [
                {
                  kind: 'if',
                  cond: bin('==', v('key'), n(0)),
                  then: [{ kind: 'return', expr: v('i') }],
                },
                {
                  kind: 'if',
                  cond: bin('==', at('rowRemote', v('i')), v('remote')),
                  then: [{ kind: 'return', expr: v('i') }],
                },
              ],
            },
          ],
        },
        { kind: 'return', expr: { kind: 'unop', op: '-', x: n(1) } },
      ],
    },
  ],
};

export const natIRs: IR[] = [natImperativeIR];
