/**
 * flow-graphs projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 * payload 는 typeof 가드로 읽는다. 없는 값은 지어내지 않고 던진다 (C6 · C9).
 * 운동 길이는 재생 속도를 그때그때 읽어 정한다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { BlockSpan, ChainRead, CodeLine, FlowEdge, SetChip, SourceLine, Token, TokenRole } from './algorithm.js';
import type { FlowGraphsStage } from './flow-graphs-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void; clearHighlight?: () => void };

function fail(what: string): never {
  throw new Error(`flowGraphsProjector: ${what}`);
}
function rec(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) fail(`${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function list(x: unknown, what: string): unknown[] {
  if (!Array.isArray(x)) fail(`${what} 가 배열이 아니다`);
  return x;
}
function num(x: unknown, what: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(`${what} 가 수가 아니다`);
  return x;
}
function str(x: unknown, what: string): string {
  if (typeof x !== 'string') fail(`${what} 가 글자가 아니다`);
  return x;
}
function bool(x: unknown, what: string): boolean {
  if (typeof x !== 'boolean') fail(`${what} 가 참거짓이 아니다`);
  return x;
}
const nums = (x: unknown, what: string): number[] => list(x, what).map((v) => num(v, what));

const ROLES: TokenRole[] = ['label', 'def', 'read', 'word', 'plain'];
function token(x: unknown): Token {
  const o = rec(x, 'token');
  const role = str(o.role, 'token.role');
  const found = ROLES.find((r) => r === role);
  if (found === undefined) fail(`모르는 토막 ${role}`);
  const tk: Token = { text: str(o.text, 'token.text'), role: found };
  if (o.slot !== undefined) tk.slot = num(o.slot, 'token.slot');
  return tk;
}
function codeLine(x: unknown): CodeLine {
  const o = rec(x, 'line');
  return { key: str(o.key, 'line.key'), tokens: list(o.tokens, 'line.tokens').map(token) };
}
function sourceLine(x: unknown): SourceLine {
  const o = rec(x, 'source');
  return { indent: num(o.indent, 'source.indent'), text: str(o.text, 'source.text') };
}
function span(x: unknown): BlockSpan {
  const o = rec(x, 'block');
  return { start: num(o.start, 'block.start'), end: num(o.end, 'block.end') };
}
function edge(x: unknown): FlowEdge {
  const o = rec(x, 'edge');
  const kind = str(o.kind, 'edge.kind');
  if (kind !== 'jump' && kind !== 'fall') fail(`모르는 간선 ${kind}`);
  return { from: num(o.from, 'edge.from'), to: num(o.to, 'edge.to'), kind, back: bool(o.back, 'edge.back') };
}
function chip(x: unknown): SetChip {
  const o = rec(x, 'chip');
  const from = rec(o.from, 'chip.from');
  const kind = str(from.kind, 'chip.from.kind');
  let src: SetChip['from'];
  if (kind === 'edge') src = { kind: 'edge', block: num(from.block, 'chip.from.block') };
  else if (kind === 'gen') src = { kind: 'gen' };
  else if (kind === 'head') src = { kind: 'head' };
  else fail(`모르는 칩 출처 ${kind}`);
  return { def: num(o.def, 'chip.def'), name: str(o.name, 'chip.name'), fresh: bool(o.fresh, 'chip.fresh'), from: src };
}
function read(x: unknown): ChainRead {
  const o = rec(x, 'read');
  return {
    instr: num(o.instr, 'read.instr'),
    slot: num(o.slot, 'read.slot'),
    name: str(o.name, 'read.name'),
    defs: nums(o.defs, 'read.defs'),
  };
}

export const flowGraphsProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as FlowGraphsStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const dur = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return Math.round(460 / Math.max(0.25, speed));
  };

  return {
    onReset() {
      stage?.clear();
      code?.clearHighlight?.();
    },
    onDestroy() {
      stage?.clear();
    },
    onEvent(event: FacetRuntimeEvent) {
      const p = event.payload === undefined ? {} : rec(event.payload, `${event.type}.payload`);
      switch (event.type) {
        case 'phase': {
          code?.highlightPhase?.(str(p.phase, 'phase'));
          return;
        }
        case 'round': {
          const lines = list(p.lines, 'round.lines').map(codeLine);
          code?.highlightPhase?.(null);
          stage?.round(
            {
              source: list(p.source, 'round.source').map(sourceLine),
              names: list(p.names, 'round.names').map((v) => str(v, 'round.names')),
              lines,
            },
            t('caption.start', 'Three-address code: {n} instructions, not cut yet', { n: lines.length }),
            dur(),
          );
          return;
        }
        case 'cut': {
          const leaders = nums(p.leaders, 'cut.leaders');
          const blocks = list(p.blocks, 'cut.blocks').map(span);
          stage?.cut(
            { leaders, blocks },
            t('caption.leader', 'Cut before leader lines {lines} — number of blocks: {n}', {
              lines: leaders.map((i) => i + 1).join(' · '),
              n: blocks.length,
            }),
            dur(),
          );
          return;
        }
        case 'edges': {
          stage?.edges(
            { edges: list(p.edges, 'edges.edges').map(edge) },
            t('caption.edge', 'Edges from block ends — jumps: {j} · fall-throughs: {f} · backward: {b}', {
              j: num(p.jumps, 'edges.jumps'),
              f: num(p.falls, 'edges.falls'),
              b: num(p.back, 'edges.back'),
            }),
            dur(),
          );
          return;
        }
        case 'sweep': {
          const sets = list(p.sets, 'sweep.sets').map((x) => {
            const o = rec(x, 'sweep.set');
            return {
              head: list(o.head, 'set.head').map(chip),
              end: list(o.end, 'set.end').map(chip),
              headChanged: bool(o.headChanged, 'set.headChanged'),
              endChanged: bool(o.endChanged, 'set.endChanged'),
            };
          });
          stage?.sweep(
            { sets },
            t('caption.reach', 'Reaching sweep {k} — sets changed: {n}', {
              k: num(p.sweep, 'sweep.sweep'),
              n: num(p.changed, 'sweep.changed'),
            }),
            dur(),
          );
          return;
        }
        case 'chains': {
          const block = num(p.block, 'chains.block');
          const reads = list(p.reads, 'chains.reads').map(read);
          const reads2 = num(p.reads2, 'chains.reads2');
          const vars = { block: `B${block + 1}`, r: reads.length, c: num(p.blockChains, 'chains.blockChains'), m: reads2 };
          stage?.chains(
            { block, reads },
            reads2 > 0
              ? t('caption.twoDefs', 'Block {block} — reads: {r} · chains: {c} · reads with 2+ defs: {m}', vars)
              : t('caption.chain', 'Block {block} — reads: {r} · chains: {c}', vars),
            dur(),
          );
          return;
        }
        default:
          fail(`모르는 이벤트 ${event.type}`);
      }
    },
  };
};
