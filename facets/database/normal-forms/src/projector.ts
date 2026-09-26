/**
 * normal-forms projector — 알고리즘 이벤트를 stage 호출과 캡션으로 옮긴다.
 *
 *   layout → stage.layout (표 자리 · 칸 옮김 · 접힘) + 표마다 줄 수 캡션
 *   fix    → stage.markFix (고칠 줄 표시가 옮겨 간다) + 사실 캡션
 *   found  → stage.markFound (찾은 줄 테두리) + 찾은 줄 캡션, 목록 칸이면 통째 견주기 한 줄
 *   homes  → stage.seat (종속 딱지가 제 표 밑으로) + 집 캡션
 *   phase  → 코드 패널 highlightPhase
 *
 * 운동 길이는 재생 속도를 따라간다 — 걸음마다 runtime.getSpeed() 를 읽는다.
 * payload 는 typeof 가드로 읽고, 모자라면 던진다.
 */
import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';
import type { NfFd, NfHome, NfLayout, NfTable, NormalFormsStageSurface } from './normal-forms-stage.js';

type CodePanel = { highlightPhase?: (phase: string | null) => void };

const MOTION_MS = 700;

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`normal-forms projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`normal-forms projector: ${what} 가 글자가 아니다`);
  return v;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`normal-forms projector: ${what} 가 수가 아니다`);
  return v;
}
function list<T>(v: unknown, what: string, each: (x: unknown, w: string) => T): T[] {
  if (!Array.isArray(v)) throw new Error(`normal-forms projector: ${what} 가 배열이 아니다`);
  return v.map((x, i) => each(x, `${what}[${i}]`));
}
const strs = (v: unknown, what: string): string[] => list(v, what, str);
const nums = (v: unknown, what: string): number[] => list(v, what, num);
function bools(v: unknown, what: string): boolean[] {
  return list(v, what, (x, w) => {
    if (typeof x !== 'boolean') throw new Error(`normal-forms projector: ${w} 가 참거짓이 아니다`);
    return x;
  });
}

function readTable(v: unknown, what: string): NfTable {
  const o = obj(v, what);
  return {
    name: str(o.name, `${what}.name`),
    cols: strs(o.cols, `${what}.cols`),
    nested: strs(o.nested, `${what}.nested`),
    slots: nums(o.slots, `${what}.slots`),
    lead: bools(o.lead, `${what}.lead`),
    cells: list(o.cells, `${what}.cells`, strs),
    rowCount: num(o.rowCount, `${what}.rowCount`),
  };
}
function readFd(v: unknown, what: string): NfFd {
  const o = obj(v, what);
  return { id: str(o.id, `${what}.id`), lhs: strs(o.lhs, `${what}.lhs`), rhs: strs(o.rhs, `${what}.rhs`) };
}
function readHome(v: unknown, what: string): NfHome {
  const o = obj(v, what);
  const home = o.home === null ? null : str(o.home, `${what}.home`);
  return { ...readFd(v, what), home };
}
const fdText = (fd: NfFd): string => `${fd.id} (${fd.lhs.join(', ')} → ${fd.rhs.join(', ')})`;

export const normalFormsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as NormalFormsStageSurface | undefined;
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t = runtime?.t ?? makeTranslator();
  const motion = (): number => MOTION_MS / Math.max(0.01, runtime ? runtime.getSpeed() : 1);

  return {
    onReset() {
      stage?.reset();
      code?.highlightPhase?.(null);
    },
    onEvent(e: FacetRuntimeEvent) {
      if (!stage) throw new Error('normal-forms projector: stage 가 없다');
      const p = obj(e.payload ?? {}, `${e.type}.payload`);
      switch (e.type) {
        case 'phase': {
          const ph = p.phase === null ? null : str(p.phase, 'phase.phase');
          code?.highlightPhase?.(ph);
          return;
        }
        case 'layout': {
          const f = obj(p.fact, 'layout.fact');
          const l: NfLayout = {
            stageName: str(p.stageName, 'layout.stageName'),
            fact: { fix: str(f.fix, 'fact.fix'), key: str(f.key, 'fact.key'), value: str(f.value, 'fact.value') },
            tables: list(p.tables, 'layout.tables', readTable),
            fds: list(p.fds, 'layout.fds', readFd),
          };
          stage.layout(l, motion());
          const rows = l.tables.map((tb) => `${tb.name} ${tb.rowCount}`).join(' · ');
          const packed = l.tables.find((tb) => tb.nested.length > 0);
          stage.setCaption(
            t('caption.layout', 'Rows per table: {list}', { list: rows }),
            packed
              ? t('caption.layoutGroups', 'One row = one group ({table}) · list columns: {nested}', {
                  table: packed.name,
                  nested: packed.nested.join(', '),
                })
              : '',
          );
          return;
        }
        case 'fix': {
          const table = str(p.table, 'fix.table');
          const slots = nums(p.slots, 'fix.slots');
          stage.markFix(table, slots, motion());
          stage.setCaption(
            t('caption.fix', "Fact {fix} ← {key} = '{value}' · held in {table} · rows to fix: {n}", {
              fix: str(p.fix, 'fix.fix'),
              key: str(p.key, 'fix.key'),
              value: str(p.value, 'fix.value'),
              table,
              n: num(p.count, 'fix.count'),
            }),
            '',
          );
          return;
        }
        case 'found': {
          const table = str(p.table, 'found.table');
          const slots = nums(p.slots, 'found.slots');
          stage.markFound(table, slots, motion());
          const cell = p.cell === null ? null : str(p.cell, 'found.cell');
          stage.setCaption(
            t('caption.found', 'Rows the condition finds: {found} · rows to fix: {fix}', {
              found: num(p.count, 'found.count'),
              fix: num(p.fixCount, 'found.fixCount'),
            }),
            cell === null
              ? ''
              : t('caption.foundCell', "A list cell is compared whole: '{cell}' ≠ '{value}'", {
                  cell,
                  value: str(p.value, 'found.value'),
                }),
          );
          return;
        }
        case 'homes': {
          const homes = list(p.fds, 'homes.fds', readHome);
          stage.seat(homes, motion());
          const lost = homes.filter((h) => h.home === null);
          stage.setCaption(
            t('caption.homes', 'Dependencies with a home table: {kept} · lost: {lost}', {
              kept: num(p.kept, 'homes.kept'),
              lost: num(p.lost, 'homes.lost'),
            }),
            lost.length > 0 ? t('caption.lostList', 'No single table holds all columns of {list}', { list: lost.map(fdText).join(' · ') }) : '',
          );
          return;
        }
        default:
          return;
      }
    },
  };
};
