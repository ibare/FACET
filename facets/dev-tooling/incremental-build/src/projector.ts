/**
 * incremental-build projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 * 캡션 문안만 여기서 짓는다 (값은 payload 에서, 문안은 messages 에서).
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type {
  IncrementalBuildStage,
  StageInit,
  StageNodeInit,
  StageReach,
  StageSave,
  StageTargetInit,
  StageVerdict,
} from './incremental-build-stage.js';

type CodePanel = { highlightPhase(phase: string | null): void };

const MOTION_MS = 420;

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`incremental-build: ${what} 가 객체가 아니다`);
  return v as Obj;
}
function str(o: Obj, key: string): string {
  const v = o[key];
  if (typeof v !== 'string') throw new Error(`incremental-build: payload.${key} 가 문자열이 아니다`);
  return v;
}
function num(o: Obj, key: string): number {
  const v = o[key];
  if (typeof v !== 'number') throw new Error(`incremental-build: payload.${key} 가 수가 아니다`);
  return v;
}
function bool(o: Obj, key: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') throw new Error(`incremental-build: payload.${key} 가 참거짓이 아니다`);
  return v;
}
function arr(o: Obj, key: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) throw new Error(`incremental-build: payload.${key} 가 목록이 아니다`);
  return v;
}
function strs(o: Obj, key: string): string[] {
  return arr(o, key).map((x) => {
    if (typeof x !== 'string') throw new Error(`incremental-build: payload.${key} 에 문자열이 아닌 것이 있다`);
    return x;
  });
}
function nums(o: Obj, key: string): number[] {
  return arr(o, key).map((x) => {
    if (typeof x !== 'number') throw new Error(`incremental-build: payload.${key} 에 수가 아닌 것이 있다`);
    return x;
  });
}
function oneOf<T extends string>(o: Obj, key: string, allowed: readonly T[]): T {
  const v = str(o, key);
  const hit = allowed.find((a) => a === v);
  if (hit === undefined) throw new Error(`incremental-build: payload.${key} '${v}' 를 모른다`);
  return hit;
}

export const incrementalBuildProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as IncrementalBuildStage | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const ms = () => Math.round(MOTION_MS / (runtime ? runtime.getSpeed() : 1));

  const changeLabel = (id: string) =>
    id === 'resave'
      ? t('label.change.resave', 'saved as is')
      : id === 'comment'
        ? t('label.change.comment', 'comment only')
        : t('label.change.code', 'code');

  return {
    onEvent(event: FacetRuntimeEvent) {
      if (!stage) throw new Error('incremental-build: stage view 가 없다');
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase payload');
          code?.highlightPhase(str(p, 'phase'));
          return;
        }
        case 'init': {
          const p = obj(event.payload, 'init payload');
          const init: StageInit = {
            policy: oneOf(p, 'policy', ['time', 'input-hash', 'output-hash'] as const),
            edited: str(p, 'edited'),
            lines: strs(p, 'lines'),
            commentLines: nums(p, 'commentLines'),
            sources: arr(p, 'sources').map((x): StageNodeInit => {
              const s = obj(x, 'source');
              return { name: str(s, 'name'), time: str(s, 'time'), fp: str(s, 'fp') };
            }),
            targets: arr(p, 'targets').map((x): StageTargetInit => {
              const s = obj(x, 'target');
              return {
                name: str(s, 'name'), inputs: strs(s, 'inputs'), depth: num(s, 'depth'),
                time: str(s, 'time'), out: str(s, 'out'),
              };
            }),
          };
          const change = oneOf(p, 'change', ['resave', 'comment', 'code'] as const);
          code?.highlightPhase(null);
          stage.init(init, ms());
          stage.caption(
            t('caption.start', 'Before saving · edit: {change}', { change: changeLabel(change) }),
          );
          return;
        }
        case 'save': {
          const p = obj(event.payload, 'save payload');
          const save: StageSave = {
            name: str(p, 'name'),
            timeBefore: str(p, 'timeBefore'),
            timeAfter: str(p, 'timeAfter'),
            fpBefore: str(p, 'fpBefore'),
            fpAfter: str(p, 'fpAfter'),
            same: bool(p, 'same'),
            lines: strs(p, 'lines'),
            changedLines: nums(p, 'changedLines'),
            commentLines: nums(p, 'commentLines'),
          };
          code?.highlightPhase(null);
          stage.save(save, ms());
          stage.caption(
            save.same
              ? t('caption.saveSame', 'Saved: {name} — time {before} → {after} · fingerprint {fp} unchanged', {
                  name: save.name, before: save.timeBefore, after: save.timeAfter, fp: save.fpAfter,
                })
              : t('caption.save', 'Saved: {name} — time {before} → {after} · fingerprint {fpBefore} → {fpAfter}', {
                  name: save.name, before: save.timeBefore, after: save.timeAfter,
                  fpBefore: save.fpBefore, fpAfter: save.fpAfter,
                }),
          );
          return;
        }
        case 'verdict': {
          const p = obj(event.payload, 'verdict payload');
          const verdict = oneOf(p, 'verdict', ['keep', 'rebuild', 'hold'] as const);
          const name = str(p, 'name');
          const causeRaw = p.cause;
          let input: string | null = null;
          let reason = '';
          if (verdict === 'keep') {
            if (causeRaw !== null) throw new Error('incremental-build: 그대로인데 까닭이 있다');
          } else {
            const c = obj(causeRaw, 'cause');
            input = str(c, 'input');
            const kind = oneOf(c, 'kind', ['time', 'hash', 'rebuilt', 'result'] as const);
            reason =
              kind === 'time'
                ? t('reason.time', '{input} {inputTime} > {name} {targetTime}', {
                    input, inputTime: str(c, 'inputTime'), name, targetTime: str(c, 'targetTime'),
                  })
                : kind === 'hash'
                  ? t('reason.hash', '{input} fingerprint {before} → {after}', {
                      input, before: str(c, 'before'), after: str(c, 'after'),
                    })
                  : kind === 'rebuilt'
                    ? t('reason.rebuilt', '{input} was rebuilt', { input })
                    : t('reason.result', '{input} result fingerprint changed', { input });
          }
          const outSameRaw = p.outSame;
          if (outSameRaw !== null && typeof outSameRaw !== 'boolean') throw new Error('incremental-build: payload.outSame');
          const v: StageVerdict = {
            name, verdict, input,
            timeBefore: str(p, 'timeBefore'), timeAfter: str(p, 'timeAfter'),
            outBefore: str(p, 'outBefore'), outAfter: str(p, 'outAfter'),
            outSame: outSameRaw,
          };
          stage.verdict(v, ms());
          stage.caption(
            verdict === 'keep'
              ? t('caption.keep', 'Keep: {name} — no input counts as changed', { name })
              : verdict === 'hold'
                ? t('caption.hold', 'Same result: {name} — {reason} · rebuilt, but not passed up', { name, reason })
                : t('caption.rebuild', 'Rebuild: {name} — {reason}', { name, reason }),
          );
          return;
        }
        case 'reach': {
          const p = obj(event.payload, 'reach payload');
          const r: StageReach = { at: str(p, 'at'), state: oneOf(p, 'state', ['rising', 'blocked', 'top'] as const) };
          stage.reach(r, ms());
          return;
        }
        default:
          throw new Error(`incremental-build: 모르는 이벤트 '${event.type}'`);
      }
    },
  };
};
