/**
 * Kafka 패턴 IR — 오프셋 · 로그 앞 · 끝만 셈한다. 기록 값은 셈에 들지 않아 받지 않는다.
 *
 * kafkaRun(ticks, retention, every, result) -> batch 잃음
 *   retention < 0 · every < 1 이면 −1 (TS 는 던진다)
 *   result = [batch 잃음, live 잃음, 끝 − 되감기 자리, 끝 − batch]
 *
 * phase — algorithm.ts 와 같은 집합: append · trim · skip · read · rewind
 */
import type { IR, IRExpr, IRStmt, IRType } from '@ffacet/core';

const INT: IRType = { kind: 'int' };
const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '<' | '>' | '%' | '==', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const decl = (name: string, init: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'var', name, type: INT, init } : { kind: 'var', name, type: INT, init, phase };
const set = (name: string, expr: IRExpr, phase?: string): IRStmt =>
  phase === undefined ? { kind: 'assign', target: v(name), expr } : { kind: 'assign', target: v(name), expr, phase };
const put = (i: number, expr: IRExpr): IRStmt => ({
  kind: 'assign',
  target: { kind: 'index', arr: v('result'), idx: n(i) },
  expr,
});

export const kafkaPatternImperativeIR: IR = {
  id: 'kafka-pattern-imperative',
  algorithm: 'kafkaPattern',
  paradigm: 'imperative',
  functions: [
    {
      name: 'kafkaRun',
      params: [
        { name: 'ticks', type: INT },
        { name: 'retention', type: INT },
        { name: 'every', type: INT },
        { name: 'result', type: { kind: 'list', of: INT } },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'retention 0 keeps every record; a bad knob value returns -1' },
        { kind: 'if', cond: bin('<', v('retention'), n(0)), then: [{ kind: 'return', expr: n(-1) }] },
        { kind: 'if', cond: bin('<', v('every'), n(1)), then: [{ kind: 'return', expr: n(-1) }] },
        { kind: 'comment', text: 'offsets are the next position to read; the log holds [logStart, logEnd)' },
        decl('logStart', n(0)),
        decl('logEnd', n(0)),
        decl('live', n(0)),
        decl('batch', n(0)),
        decl('liveLost', n(0)),
        decl('batchLost', n(0)),
        {
          kind: 'for-range',
          var: 'tick',
          from: n(1),
          to: v('ticks'),
          inclusive: true,
          body: [
            { kind: 'comment', text: 'one record is appended at the end' },
            set('logEnd', bin('+', v('logEnd'), n(1)), 'append'),
            { kind: 'comment', text: 'retention keeps only the newest records' },
            {
              kind: 'if',
              cond: bin('>', v('retention'), n(0)),
              then: [
                {
                  kind: 'if',
                  cond: bin('>', bin('-', v('logEnd'), v('retention')), v('logStart')),
                  then: [set('logStart', bin('-', v('logEnd'), v('retention')), 'trim')],
                },
              ],
            },
            { kind: 'comment', text: 'the live group reads up to the end' },
            {
              kind: 'if',
              cond: bin('<', v('live'), v('logStart')),
              then: [set('liveLost', bin('+', v('liveLost'), bin('-', v('logStart'), v('live'))))],
            },
            set('live', v('logEnd')),
            { kind: 'comment', text: 'a batch offset before the log start jumps to it' },
            {
              kind: 'if',
              cond: bin('<', v('batch'), v('logStart')),
              then: [
                set('batchLost', bin('+', v('batchLost'), bin('-', v('logStart'), v('batch'))), 'skip'),
                set('batch', v('logStart'), 'skip'),
              ],
            },
            { kind: 'comment', text: 'the batch group reads one record every few ticks' },
            {
              kind: 'if',
              cond: bin('==', bin('%', v('tick'), v('every')), n(0)),
              then: [
                {
                  kind: 'if',
                  cond: bin('<', v('batch'), v('logEnd')),
                  then: [set('batch', bin('+', v('batch'), n(1)), 'read')],
                },
              ],
            },
          ],
        },
        { kind: 'comment', text: 'live asks to rewind to offset 0 but only kept records remain' },
        decl('replayFrom', { kind: 'call', fn: 'max', args: [n(0), v('logStart')] }, 'rewind'),
        put(0, v('batchLost')),
        put(1, v('liveLost')),
        put(2, bin('-', v('logEnd'), v('replayFrom'))),
        put(3, bin('-', v('logEnd'), v('batch'))),
        { kind: 'return', expr: v('batchLost') },
      ],
    },
  ],
};

export const kafkaPatternIRs: IR[] = [kafkaPatternImperativeIR];
