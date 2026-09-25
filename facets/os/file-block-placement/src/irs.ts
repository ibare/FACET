/**
 * 파일 블록 배치 IR — k 번째 블록 번호를 inode 와 FAT 두 구조로 찾는다.
 *
 * 함수 둘 (첫 함수가 진입점 — 판에서 먼저 걷는 쪽):
 *   inodeBlock(direct, oneLevel, twoLevel, ptr, per, k) — 직접 · 단일 간접 · 이중 간접
 *   fatBlock(fat, first, k)                              — 표 칸 k−1 개를 따라간다
 *
 * IR 은 배열을 만들 수 없으므로 번호 블록 내용은 부르는 쪽이 평면 배열 `ptr` 로 편다
 * (`ptr[b * per + j]` = 번호 블록 b 의 j 칸, 쓰지 않는 칸 −2). `fat` 은 블록 수 길이, END = −1.
 * `//` 와 `%` 는 음수가 아닌 j 에만 걸린다. 중간값 최대는 ptr 색인 63.
 *
 * phase 어휘 (algorithm.ts 와 정확히 같다):
 *   inode-direct · inode-one-level · inode-two-level · inode-mid · inode-data · fat-hop · fat-data
 */
import type { IR, IRExpr } from '@ffacet/core';

const INT = { kind: 'int' } as const;
const INT_LIST = { kind: 'list', of: INT } as const;

const v = (name: string): IRExpr => ({ kind: 'var', name });
const n = (value: number): IRExpr => ({ kind: 'lit', value });
const bin = (op: '+' | '-' | '*' | '//' | '%' | '<' | '<=', l: IRExpr, r: IRExpr): IRExpr => ({ kind: 'binop', op, l, r });
const at = (arr: string, idx: IRExpr): IRExpr => ({ kind: 'index', arr: v(arr), idx });

export const fileBlockPlacementImperativeIR: IR = {
  id: 'file-block-placement-imperative',
  algorithm: 'fileBlockPlacement',
  paradigm: 'imperative',
  functions: [
    {
      name: 'inodeBlock',
      params: [
        { name: 'direct', type: INT_LIST },
        { name: 'oneLevel', type: INT },
        { name: 'twoLevel', type: INT },
        { name: 'ptr', type: INT_LIST },
        { name: 'per', type: INT },
        { name: 'k', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'direct slots: the inode itself names the block' },
        {
          kind: 'if',
          cond: bin('<=', v('k'), { kind: 'len', of: v('direct') }),
          then: [{ kind: 'return', expr: at('direct', bin('-', v('k'), n(1))), phase: 'inode-direct' }],
        },
        { kind: 'var', name: 'j', type: INT, init: bin('-', bin('-', v('k'), { kind: 'len', of: v('direct') }), n(1)) },
        { kind: 'var', name: 'b', type: INT, init: n(-1) },
        {
          kind: 'if',
          cond: bin('<', v('j'), v('per')),
          then: [
            { kind: 'comment', text: 'single indirect: read one pointer block' },
            {
              kind: 'assign',
              target: v('b'),
              expr: at('ptr', bin('+', bin('*', v('oneLevel'), v('per')), v('j'))),
              phase: 'inode-one-level',
            },
          ],
          else: [
            { kind: 'comment', text: 'double indirect: two pointer blocks, then the data block' },
            { kind: 'assign', target: v('j'), expr: bin('-', v('j'), v('per')) },
            {
              kind: 'var',
              name: 'mid',
              type: INT,
              init: at('ptr', bin('+', bin('*', v('twoLevel'), v('per')), bin('//', v('j'), v('per')))),
              phase: 'inode-two-level',
            },
            {
              kind: 'assign',
              target: v('b'),
              expr: at('ptr', bin('+', bin('*', v('mid'), v('per')), bin('%', v('j'), v('per')))),
              phase: 'inode-mid',
            },
          ],
        },
        { kind: 'return', expr: v('b'), phase: 'inode-data' },
      ],
    },
    {
      name: 'fatBlock',
      params: [
        { name: 'fat', type: INT_LIST },
        { name: 'first', type: INT },
        { name: 'k', type: INT },
      ],
      returnType: INT,
      body: [
        { kind: 'comment', text: 'the directory entry gives the first block; each table entry names the next' },
        { kind: 'var', name: 'b', type: INT, init: v('first') },
        {
          kind: 'for-range',
          var: 'i',
          from: n(1),
          to: v('k'),
          inclusive: false,
          body: [{ kind: 'assign', target: v('b'), expr: at('fat', v('b')), phase: 'fat-hop' }],
        },
        { kind: 'return', expr: v('b'), phase: 'fat-data' },
      ],
    },
  ],
};

export const fileBlockPlacementIRs: IR[] = [fileBlockPlacementImperativeIR];
