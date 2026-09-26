/**
 * linker projector — 알고리즘 이벤트를 무대 메서드와 캡션으로 옮긴다.
 *
 * 셈은 하지 않는다: 기다림 · 메움 · 자리 · 고친 수는 payload 로 받는다. 이름 목록을 잇는 것과
 * 칸 글자 찍기(algorithm 의 fieldText)만 한다.
 */
import { makeTranslator, type ProjectorFactory, type ViewInstance } from '@ffacet/core/runtime';
import { fieldText } from './algorithm.js';
import type { LinkerStageApi } from './linker-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void };

/** 운동 길이 상한 (ms) — 재생 속도를 따라 줄어든다 */
const MOTION_MS = 380;
const NONE = '—';

type Rec = Record<string, unknown>;

function rec(x: unknown): Rec {
  if (typeof x !== 'object' || x === null) throw new Error('payload 가 객체가 아니다');
  return x as Rec;
}
function str(p: Rec, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`payload.${k} 가 글자가 아니다`);
  return v;
}
function num(p: Rec, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`payload.${k} 가 수가 아니다`);
  return v;
}
function bool(p: Rec, k: string): boolean {
  const v = p[k];
  if (typeof v !== 'boolean') throw new Error(`payload.${k} 가 참거짓이 아니다`);
  return v;
}
function strs(p: Rec, k: string): string[] {
  const v = p[k];
  if (!Array.isArray(v) || !v.every((s) => typeof s === 'string')) throw new Error(`payload.${k} 가 글자 목록이 아니다`);
  return v as string[];
}
function pairs(p: Rec, k: string, other: string): { sym: string; who: string }[] {
  const v = p[k];
  if (!Array.isArray(v)) throw new Error(`payload.${k} 가 목록이 아니다`);
  return v.map((x) => {
    const r = rec(x);
    return { sym: str(r, 'sym'), who: str(r, other) };
  });
}
const list = (xs: string[]): string => (xs.length === 0 ? NONE : xs.join(', '));

export const linkerProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as (LinkerStageApi & ViewInstance) | undefined;
  const code = views.codePanel as unknown as (CodePanel & ViewInstance) | undefined;
  const t = runtime?.t ?? makeTranslator();
  const names = new Map<string, string>();

  const motion = (): number => {
    if (!runtime) return MOTION_MS;
    return Math.min(MOTION_MS, MOTION_MS / Math.max(0.25, runtime.getSpeed()));
  };
  const nameOf = (id: string): string => {
    const nm = names.get(id);
    if (nm === undefined) throw new Error(`이름 없는 파일: ${id}`);
    return nm;
  };

  return {
    onInit() {
      stage?.clear();
      code?.highlightPhase?.(null);
    },
    onReset() {
      names.clear();
      stage?.clear();
      code?.highlightPhase?.(null);
    },
    onEvent(event) {
      switch (event.type) {
        case 'phase': {
          const p = rec(event.payload);
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'round': {
          const p = rec(event.payload);
          const order = strs(p, 'order');
          const shown = strs(p, 'names');
          names.clear();
          order.forEach((id, i) => {
            const nm = shown[i];
            if (nm === undefined) throw new Error('이름과 차례의 길이가 다르다');
            names.set(id, nm);
          });
          code?.highlightPhase?.(null);
          stage?.round(order, shown, strs(p, 'libs'), motion());
          stage?.caption(
            t('caption.start', 'Start: no file read yet'),
            t('caption.order', 'Link order: {order}', { order: shown.join(' · ') }),
          );
          return;
        }
        case 'resolve': {
          const p = rec(event.payload);
          const file = str(p, 'file');
          const pulled = bool(p, 'pulled');
          const filled = pairs(p, 'filled', 'waiter');
          const direct = pairs(p, 'direct', 'definer');
          const waiting = strs(p, 'waiting');
          stage?.resolve(
            {
              file,
              pulled,
              filled: filled.map((f) => ({ sym: f.sym, waiter: f.who })),
              direct: direct.map((d) => ({ sym: d.sym, definer: d.who })),
              added: strs(p, 'added'),
              waiting,
            },
            motion(),
          );
          const title = pulled
            ? t('caption.pulled', 'Read {file} (pulled in)', { file: nameOf(file) })
            : t('caption.read', 'Read {file}', { file: nameOf(file) });
          stage?.caption(
            title,
            t('caption.resolveDetail', 'Defines {defs} · Filled {filled} · At once {direct} · Waiting {waiting}', {
              defs: list(strs(p, 'defs')),
              filled: list(filled.map((f) => f.sym)),
              direct: list(direct.map((d) => d.sym)),
              waiting: list(waiting),
            }),
          );
          return;
        }
        case 'skip': {
          const p = rec(event.payload);
          const file = str(p, 'file');
          stage?.skip(file, motion());
          stage?.caption(
            t('caption.skip', 'Skipped {file}: it defines no waiting name', { file: nameOf(file) }),
            t('caption.waiting', 'Waiting {waiting}', { waiting: list(strs(p, 'waiting')) }),
          );
          return;
        }
        case 'missing': {
          const p = rec(event.payload);
          const missing = strs(p, 'names');
          stage?.missing(missing, motion());
          stage?.caption(
            t('caption.missing', 'Undefined {names}: the link stops', { names: list(missing) }),
            t('caption.missingDetail', 'Nothing is placed or patched'),
          );
          return;
        }
        case 'place': {
          const p = rec(event.payload);
          const file = str(p, 'file');
          const dataSize = num(p, 'dataSize');
          stage?.place(file, num(p, 'textAt'), num(p, 'textSize'), num(p, 'dataAt'), dataSize, motion());
          const detail =
            dataSize > 0
              ? t('caption.placeBoth', 'text @{t0}–@{t1} · data @{d0}–@{d1}', {
                  t0: num(p, 'textAt'),
                  t1: num(p, 'textEnd'),
                  d0: num(p, 'dataAt'),
                  d1: num(p, 'dataEnd'),
                })
              : t('caption.placeText', 'text @{t0}–@{t1}', { t0: num(p, 'textAt'), t1: num(p, 'textEnd') });
          stage?.caption(t('caption.place', 'Place {file}', { file: nameOf(file) }), detail);
          return;
        }
        case 'patch': {
          const p = rec(event.payload);
          const file = str(p, 'file');
          const kindRaw = str(p, 'kind');
          if (kindRaw !== 'abs' && kindRaw !== 'rel') throw new Error(`모르는 칸 종류: ${kindRaw}`);
          const sec = str(p, 'targetSec');
          if (sec !== 'text' && sec !== 'data') throw new Error(`모르는 절: ${sec}`);
          const val = num(p, 'val');
          stage?.patch(
            { file, index: num(p, 'index'), after: str(p, 'after'), site: num(p, 'site'), target: num(p, 'target'), targetSec: sec, kind: kindRaw, val },
            motion(),
          );
          const site = `${nameOf(file)}+${num(p, 'off')}`;
          const detail =
            kindRaw === 'abs'
              ? t('caption.patchAbs', 'ABS {sym}: S = @{s} · {before} → {after}', {
                  sym: str(p, 'sym'),
                  s: num(p, 'target'),
                  before: str(p, 'before'),
                  after: str(p, 'after'),
                })
              : t('caption.patchRel', 'REL {sym}: S − P = @{s} − @{p} = {val} · {before} → {after}', {
                  sym: str(p, 'sym'),
                  s: num(p, 'target'),
                  p: num(p, 'site'),
                  val: fieldText('rel', val),
                  before: str(p, 'before'),
                  after: str(p, 'after'),
                });
          stage?.caption(t('caption.patch', 'Patch {site}', { site }), detail);
          return;
        }
        default:
          throw new Error(`모르는 이벤트: ${event.type}`);
      }
    },
  };
};
