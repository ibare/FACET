/**
 * data-hazard projector — 알고리즘 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 * payload 는 typeof 가드로 읽는다 (C9). 캡션의 수는 전부 payload 의 셈한 값이다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory, Translate } from '@ffacet/core/runtime';
import type { DataHazardStage as Stage } from './data-hazard-stage.js';

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

type Rec = Record<string, unknown>;

const asRec = (v: unknown): Rec => (typeof v === 'object' && v !== null ? (v as Rec) : {});
const num = (r: Rec, k: string): number => (typeof r[k] === 'number' ? (r[k] as number) : 0);
const bool = (r: Rec, k: string): boolean => r[k] === true;
const nums = (r: Rec, k: string): number[] => {
  const v = r[k];
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
};
const str = (r: Rec, k: string): string => (typeof r[k] === 'string' ? (r[k] as string) : '');


export const dataHazardProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();
  /** 프로그램 순번 → 화면 이름 (I1 부터). */
  const who = (index: number): string => tr('label.instr', 'I{n}', { n: index + 1 });

  return {
    onEvent(event) {
      const p = asRec(event.payload);
      switch (event.type) {
        case 'phase': {
          const phase = typeof p.phase === 'string' ? p.phase : null;
          code?.highlightPhase?.(phase);
          return;
        }
        case 'plan': {
          const order = nums(p, 'order');
          const rule = str(p, 'rule');
          let caption: string;
          if (rule === 'none') caption = tr('caption.plan.none', 'No waiting: each instruction enters EX one cycle after the one before, ready or not.');
          else if (rule === 'wait') caption = tr('caption.plan.wait', 'Wait: a reader holds in ID until its producer writes the register file.');
          else if (bool(p, 'reordered')) {
            caption = tr('caption.plan.reorder', 'Forward + reorder: the compiler moves {moved} ahead of {before}. Registers shared with what it passes: {shared}.', {
              moved: who(num(p, 'moved')),
              before: who(num(p, 'before')),
              shared: num(p, 'shared'),
            });
          } else caption = tr('caption.plan.forward', 'Forward: a result goes sideways into the next EX without passing the register file.');
          stage?.showPlan({ order, columns: num(p, 'columns'), caption });
          return;
        }
        case 'place': {
          const index = num(p, 'index');
          const ex = num(p, 'ex');
          stage?.place({
            index,
            pos: num(p, 'pos'),
            ifStart: num(p, 'ifStart'),
            idStart: num(p, 'idStart'),
            ex,
            caption: tr('caption.place', '{who} enters. In order alone, its EX could be cycle {ex}.', { who: who(index), ex }),
          });
          return;
        }
        case 'lookup': {
          const index = num(p, 'index');
          const producer = num(p, 'producer');
          const reg = num(p, 'reg');
          stage?.lookup({
            index,
            producer,
            reg,
            caption: tr('caption.lookup', '{who} reads r{reg}. The nearest earlier instruction that writes it is {from}.', {
              who: who(index),
              from: who(producer),
              reg,
            }),
          });
          return;
        }
        case 'operand': {
          const index = num(p, 'index');
          const producer = num(p, 'producer');
          const kindRaw = str(p, 'kind');
          const kind = kindRaw === 'wait' || kindRaw === 'forward' || kindRaw === 'stale' || kindRaw === 'fresh' ? kindRaw : 'fresh';
          const reg = num(p, 'reg');
          const value = num(p, 'value');
          const correct = num(p, 'correct');
          const ex = num(p, 'ex');
          const producerEx = num(p, 'producerEx');
          const producerLoad = bool(p, 'producerLoad');
          const readCycle = num(p, 'readCycle');
          const vars = { who: who(index), from: who(producer), reg, value, correct, ex, wb: producerEx + 2, read: readCycle, ready: producerEx + 1 };
          let caption: string;
          if (kind === 'wait') caption = tr('caption.wait', '{who} needs r{reg} from {from}. It holds in ID until the write in cycle {wb}: EX pushed to cycle {ex}.', vars);
          else if (kind === 'forward') {
            caption = producerLoad
              ? tr('caption.forwardLoad', '{from} is a load: r{reg} = {value} exists only after MEM in cycle {ready}, so {who} runs EX in cycle {ex}.', vars)
              : tr('caption.forward', '{from} hands r{reg} = {value} sideways to {who}: EX in cycle {ex}.', vars);
          } else if (kind === 'stale') caption = tr('caption.stale', '{who} reads r{reg} in cycle {read}, but {from} writes it only in cycle {wb}: it gets the old {value} instead of {correct}.', vars);
          else caption = tr('caption.fresh', '{who} reads r{reg} = {value}; {from} already wrote it in cycle {wb}.', vars);
          stage?.operand({ index, producer, reg, kind, value, producerEx, producerLoad, readCycle, ex, caption });
          return;
        }
        case 'write': {
          const index = num(p, 'index');
          const reg = num(p, 'reg');
          const value = num(p, 'value');
          const correct = num(p, 'correct');
          const wb = num(p, 'wb');
          const vars = { who: who(index), reg, value, correct, wb };
          const caption = value === correct
            ? tr('caption.write', '{who} writes r{reg} = {value} in cycle {wb}.', vars)
            : tr('caption.writeWrong', '{who} writes r{reg} = {value} in cycle {wb}. The right value is {correct}.', vars);
          stage?.write({ index, reg, value, correct, wb, caption });
          return;
        }
        case 'done': {
          const wrongRaw = Array.isArray(p.wrong) ? p.wrong : [];
          const wrong = wrongRaw.map((w) => num(asRec(w), 'reg'));
          const vars = { cycles: num(p, 'cycles'), stalls: num(p, 'stalls'), stale: num(p, 'staleReads'), wrong: wrong.length };
          const caption = wrong.length > 0
            ? tr('caption.done.wrong', '{cycles} cycles, but {stale} old values were read and {wrong} results are wrong.', vars)
            : tr('caption.done.ok', '{cycles} cycles, {stalls} of them stalls. Wrong results: {wrong}.', vars);
          stage?.finish({ wrong, caption });
          code?.highlightPhase?.(null);
          return;
        }
        default:
          return;
      }
    },
    onReset() {
      stage?.reset?.();
      code?.clearHighlight?.();
    },
  };
};
