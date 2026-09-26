/**
 * ssa-form projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 *
 * - 컴파일 걸음(`ssa-rename` · `ssa-phi`)의 코드 줄은 뒤따르는 phase 가 켠다.
 * - 걸음 0(`ssa-program` · `ssa-keep`)과 돌림 두 걸음(`ssa-path` · `ssa-pick`)은 코드 패널 밖의 일이다 —
 *   코드 패널 강조를 끈다. 돌림은 컴파일러가 아니라 만든 코드가 하는 일이다.
 * - 캡션은 payload 의 값으로만 짓는다. 셈하지 않는다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { SsaPart, SsaRow } from './algorithm.js';
import type { SsaStage, SsaStageBlock, SsaStagePick } from './ssa-form-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void; clearHighlight(): void };

type Obj = Record<string, unknown>;

function isObj(x: unknown): x is Obj {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function obj(x: unknown, what: string): Obj {
  if (!isObj(x)) throw new Error(`ssa-form projector: ${what} 가 객체가 아니다`);
  return x;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number') throw new Error(`ssa-form projector: ${key} 가 수가 아니다`);
  return v;
}
function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`ssa-form projector: ${key} 가 글자가 아니다`);
  return v;
}
function bool(o: Obj, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`ssa-form projector: ${key} 가 참거짓이 아니다`);
  return v;
}
function list(o: Obj, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`ssa-form projector: ${key} 가 목록이 아니다`);
  return v;
}
function parts(x: unknown): SsaPart[] {
  if (!Array.isArray(x)) throw new Error('ssa-form projector: parts 가 목록이 아니다');
  return x.map((p) => {
    const o = obj(p, 'part');
    const part: SsaPart = { text: str(o, 'text') };
    if (o.ver !== undefined) part.ver = bool(o, 'ver');
    if (o.arg !== undefined) part.arg = num(o, 'arg');
    return part;
  });
}
function rows(o: Obj, key: string): SsaRow[] {
  return list(o, key).map((r) => {
    const ro = obj(r, 'row');
    const label = ro.label;
    if (label !== null && typeof label !== 'string') throw new Error('ssa-form projector: label 이 글자도 null 도 아니다');
    return { key: str(ro, 'key'), label, parts: parts(ro.parts) };
  });
}
function edges(o: Obj, key: string): { from: number; to: number }[] {
  return list(o, key).map((e) => {
    const eo = obj(e, 'edge');
    return { from: num(eo, 'from'), to: num(eo, 'to') };
  });
}
function nums(o: Obj, key: string): number[] {
  return list(o, key).map((v) => {
    if (typeof v !== 'number') throw new Error(`ssa-form projector: ${key} 에 수가 아닌 것이 있다`);
    return v;
  });
}
function strs(o: Obj, key: string): string[] {
  return list(o, key).map((v) => {
    if (typeof v !== 'string') throw new Error(`ssa-form projector: ${key} 에 글자가 아닌 것이 있다`);
    return v;
  });
}

export const ssaFormProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SsaStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const speed = (): void => stage?.setSpeed(runtime?.getSpeed() ?? 1);
  const codeOff = (): void => code?.clearHighlight();

  return {
    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase payload');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'ssa-program': {
          const p = obj(event.payload, 'ssa-program');
          const blocks: SsaStageBlock[] = list(p, 'blocks').map((b) => {
            const bo = obj(b, 'block');
            return { name: str(bo, 'name'), rows: rows(bo, 'rows') };
          });
          codeOff();
          speed();
          stage?.showProgram(blocks, edges(p, 'edges'), num(p, 'join'), `${str(p, 'param')} = ${num(p, 'a')}`);
          stage?.setCaption(
            t('caption.start', 'Three-address code with no versions yet. The blocks are already cut: {blocks}', {
              blocks: blocks.map((b) => b.name).join(' '),
            }),
            'compile',
          );
          return;
        }
        case 'ssa-rename': {
          const p = obj(event.payload, 'ssa-rename');
          speed();
          stage?.renameBlock(num(p, 'block'), rows(p, 'rows'));
          const block = str(p, 'name');
          stage?.setCaption(
            bool(p, 'body')
              ? t('caption.renameBody', '{block} body: reads take the versions settled at the head', { block })
              : t('caption.rename', '{block}: reads take the current version, each write gets a new one', { block }),
            'compile',
          );
          return;
        }
        case 'ssa-phi': {
          const p = obj(event.payload, 'ssa-phi');
          const from = list(p, 'from').map((f) => {
            const fo = obj(f, 'from');
            return { block: num(fo, 'block'), blockName: str(fo, 'blockName'), text: str(fo, 'text') };
          });
          if (from.length !== 2) throw new Error('ssa-form projector: 앞선 블록이 둘이 아니다');
          const same = bool(p, 'same');
          const result = str(p, 'result');
          speed();
          stage?.judgePhi(num(p, 'block'), from, same, result, rows(p, 'rows'));
          const vars = {
            name: str(p, 'name'),
            predA: from[0].blockName,
            verA: from[0].text,
            predB: from[1].blockName,
            verB: from[1].text,
          };
          stage?.setCaption(
            same
              ? t(
                  'caption.phiSame',
                  '{name}: {predA} ends with {verA}, {predB} ends with {verB}. They match, so no φ; it passes through as {pass}',
                  { ...vars, pass: result },
                )
              : t(
                  'caption.phiNew',
                  '{name}: {predA} ends with {verA}, {predB} ends with {verB}. They differ, so a φ stands: {phi}',
                  { ...vars, phi: result },
                ),
            'compile',
          );
          return;
        }
        case 'ssa-keep': {
          const p = obj(event.payload, 'ssa-keep');
          const param = str(p, 'param');
          const a = num(p, 'a');
          codeOff();
          speed();
          stage?.keepCompiled(`${param} = ${a}`);
          stage?.setCaption(
            t('caption.keep', 'Branches unchanged, so nothing is recompiled. The SSA stays; run again with {param} = {a}', {
              param,
              a,
            }),
            'run',
          );
          return;
        }
        case 'ssa-path': {
          const p = obj(event.payload, 'ssa-path');
          codeOff();
          speed();
          stage?.runPath(nums(p, 'path'), edges(p, 'edges'));
          const vars = {
            param: str(p, 'param'),
            a: num(p, 'a'),
            cond: str(p, 'cond'),
            target: str(p, 'target'),
            path: strs(p, 'pathNames').join(' → '),
          };
          stage?.setCaption(
            bool(p, 'truth')
              ? t('caption.pathFall', 'With {param} = {a}, {cond} is true, so no jump; it falls through. Path: {path}', vars)
              : t('caption.pathJump', 'With {param} = {a}, {cond} is false, so it jumps to {target}. Path: {path}', vars),
            'run',
          );
          return;
        }
        case 'ssa-pick': {
          const p = obj(event.payload, 'ssa-pick');
          const picks = list(p, 'picks').map((k) => {
            const ko = obj(k, 'pick');
            return { rowKey: str(ko, 'rowKey'), arg: num(ko, 'arg'), text: str(ko, 'text') };
          });
          const value = num(p, 'value');
          codeOff();
          speed();
          const stagePicks: SsaStagePick[] = picks.map((k) => ({ rowKey: k.rowKey, arg: k.arg }));
          stage?.pick(num(p, 'block'), num(p, 'from'), stagePicks, value);
          stage?.setCaption(
            t('caption.pick', 'Came in from {from}, so the φ picks {picks}. Returned value: {value}', {
              from: str(p, 'fromName'),
              picks: picks.map((k) => k.text).join(' · '),
              value,
            }),
            'run',
          );
          return;
        }
        default:
          throw new Error(`ssa-form projector: 모르는 이벤트 ${event.type}`);
      }
    },
    onReset(): void {
      stage?.reset();
      code?.clearHighlight();
    },
  };
};
