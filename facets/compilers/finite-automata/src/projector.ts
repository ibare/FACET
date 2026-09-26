/**
 * finite-automata projector — 알고리즘 이벤트를 무대 메서드로 옮긴다.
 *
 * start → stage.start (판 머리에서 코드 패널 강조를 끈다) · layer → stage.layer · move → stage.move ·
 * verdict → stage.verdict · phase → codePanel.highlightPhase. 캡션 문안은 여기서 고른다 (C10).
 * 운동 길이는 재생 속도를 그때그때 읽어 정한다 (400ms ÷ 속도).
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import { nodeText } from './algorithm.js';
import type { FiniteAutomataStage, StageArc, StageMove, StageNode } from './finite-automata-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

const MOTION_MS = 400;

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`${what} 가 객체가 아니다`);
  return v as Obj;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${key} 가 수가 아니다`);
  return v;
}
function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`${key} 가 글이 아니다`);
  return v;
}
function bool(o: Obj, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`${key} 가 참거짓이 아니다`);
  return v;
}
function list(o: Obj, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`${key} 가 배열이 아니다`);
  return v;
}
function nums(o: Obj, key: string): number[] {
  return list(o, key).map((x) => {
    if (typeof x !== 'number') throw new Error(`${key} 에 수가 아닌 것이 있다`);
    return x;
  });
}
function strs(o: Obj, key: string): string[] {
  return list(o, key).map((x) => {
    if (typeof x !== 'string') throw new Error(`${key} 에 글이 아닌 것이 있다`);
    return x;
  });
}

function toNode(v: unknown): StageNode {
  const o = obj(v, 'fresh[]');
  const parent = o.parent;
  const letter = o.letter;
  if (parent !== null && typeof parent !== 'number') throw new Error('parent 가 수나 null 이 아니다');
  if (letter !== null && typeof letter !== 'string') throw new Error('letter 가 글이나 null 이 아니다');
  return {
    id: num(o, 'id'),
    set: nums(o, 'set'),
    accepting: bool(o, 'accepting'),
    parent,
    letter,
    layer: num(o, 'layer'),
    slot: num(o, 'slot'),
    slots: num(o, 'slots'),
  };
}
function toMove(v: unknown): StageMove {
  const o = obj(v, 'moves[]');
  return { from: num(o, 'from'), letter: str(o, 'letter'), to: num(o, 'to'), fresh: bool(o, 'fresh') };
}
function toArc(v: unknown): StageArc {
  const o = obj(v, 'arcs[]');
  return { from: num(o, 'from'), to: num(o, 'to'), label: str(o, 'label') };
}

export const finiteAutomataProjector: ProjectorFactory = (views, runtime) => {
  const t = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as FiniteAutomataStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const dur = (): number => MOTION_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);
  /** 덩이 번호 → 모임 — layer 가 알려 준 것만 */
  const sets = new Map<number, number[]>();
  const named = (id: number): string => {
    const s = sets.get(id);
    if (!s) throw new Error(`D${id} 의 모임을 모른다`);
    return nodeText(id, s);
  };

  const reset = (): void => {
    sets.clear();
    stage?.reset();
    code?.highlightPhase?.(null);
  };

  return {
    onInit() {
      reset();
    },
    onReset() {
      reset();
    },
    async onEvent(event: FacetRuntimeEvent) {
      const p = obj(event.payload ?? {}, `${event.type} payload`);
      switch (event.type) {
        case 'phase': {
          const phase = p.phase;
          if (typeof phase !== 'string') throw new Error('phase 가 글이 아니다');
          code?.highlightPhase?.(phase);
          return;
        }
        case 'start': {
          code?.highlightPhase?.(null);
          const nfa = obj(p.nfa, 'nfa');
          const rebuild = bool(p, 'rebuild');
          const pieces = strs(p, 'pieces');
          const n = num(nfa, 'states');
          const caption = rebuild
            ? t('caption.startNew', 'Pattern {pattern} · NFA states: {n} · DFA: not built yet', { pattern: pieces.join(''), n })
            : t('caption.startKept', 'Same k, same DFA · DFA states: {n} · new input {word}', {
                n: num(p, 'dfaStates'),
                word: str(p, 'word'),
              });
          await stage?.start({
            rebuild,
            dfaSlots: num(p, 'dfaSlots'),
            pieces,
            alphabet: strs(p, 'alphabet'),
            nfaStates: n,
            accept: num(nfa, 'accept'),
            arcs: list(nfa, 'arcs').map(toArc),
            word: str(p, 'word'),
            caption,
            dur: dur(),
          });
          return;
        }
        case 'layer': {
          const fresh = list(p, 'fresh').map(toNode);
          for (const f of fresh) sets.set(f.id, f.set);
          const moves = list(p, 'moves').map(toMove);
          const i = num(p, 'index') + 1;
          const last = bool(p, 'last');
          const total = num(p, 'total');
          const taken = nums(p, 'taken')
            .map((id) => `D${id}`)
            .join(', ');
          let caption: string;
          if (i === 1) {
            const first = fresh[0];
            if (!first) throw new Error('첫 층에 D0 가 없다');
            caption = t('caption.first', 'Layer {i}: start set {node}', { i, node: named(first.id) });
          } else if (last) {
            caption = t('caption.closed', 'Layer {i}: from {taken} · no new set, transitions closed · DFA states: {total}', { i, taken, total });
          } else {
            caption = t('caption.layer', 'Layer {i}: from {taken} · new sets: {n} · DFA states: {total}', { i, taken, n: fresh.length, total });
          }
          await stage?.layer({ fresh, moves, last, caption, dur: dur() });
          return;
        }
        case 'move': {
          const from = num(p, 'from');
          const to = num(p, 'to');
          sets.set(from, nums(p, 'fromSet'));
          sets.set(to, nums(p, 'toSet'));
          const letter = str(p, 'letter');
          const caption = t('caption.move', 'Letter #{step} {letter}: {from} → {to}', {
            step: num(p, 'step'),
            letter,
            from: named(from),
            to: named(to),
          });
          await stage?.move({ at: num(p, 'at'), letter, from, to, caption, dur: dur() });
          return;
        }
        case 'verdict': {
          const stop = num(p, 'stop');
          sets.set(stop, nums(p, 'set'));
          const accepted = bool(p, 'accepted');
          const vars = { node: named(stop), accept: num(p, 'accept') };
          const caption = accepted
            ? t('caption.accept', 'Stopped at {node} · holds NFA accept state {accept} → accepted', vars)
            : t('caption.reject', 'Stopped at {node} · lacks NFA accept state {accept} → not accepted', vars);
          await stage?.verdict({ stop, accepted, caption, dur: dur() });
          return;
        }
        default:
          throw new Error(`모르는 이벤트: ${event.type}`);
      }
    },
  };
};
