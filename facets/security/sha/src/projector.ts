/**
 * sha projector — algorithm 이벤트를 sha-stage 호출로 옮긴다.
 *
 * 무대의 셈은 없다. 캡션에 들어가는 값(표 · 접기 줄 · 접기 수)은 payload 의 것을 16진으로 적을 뿐이다.
 * 운동 길이는 payload 의 ms 를 그때그때의 재생 속도로 나눈다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, Translate } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type {
  Holder,
  ShaStage,
  StageCell,
  StageFoldRow,
  StageMatch,
  StageRowId,
  StageRowShape,
  StageSentByte,
  StageSlot,
} from './sha-stage.js';

type CodePanel = { highlightPhase?(phase: string | null): void; clearHighlight?(): void };

const ROW_IDS: readonly StageRowId[] = ['alice', 'aliceOuter', 'mallory', 'bob', 'bobOuter'];
const hex4 = (v: number): string => v.toString(16).padStart(4, '0');
const hex2 = (v: number): string => v.toString(16).padStart(2, '0');

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`sha projector: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(o: Record<string, unknown>, k: string): number {
  const v = o[k];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`sha projector: ${k} 가 수가 아니다`);
  return v;
}
function str(o: Record<string, unknown>, k: string): string {
  const v = o[k];
  if (typeof v !== 'string') throw new Error(`sha projector: ${k} 가 글이 아니다`);
  return v;
}
function bool(o: Record<string, unknown>, k: string): boolean {
  const v = o[k];
  if (typeof v !== 'boolean') throw new Error(`sha projector: ${k} 가 참거짓이 아니다`);
  return v;
}
function list(o: Record<string, unknown>, k: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v)) throw new Error(`sha projector: ${k} 가 목록이 아니다`);
  return v;
}
function rowId(v: unknown): StageRowId {
  const found = ROW_IDS.find((r) => r === v);
  if (!found) throw new Error(`sha projector: 모르는 줄 ${String(v)}`);
  return found;
}
function headOf(o: Record<string, unknown>): number | null {
  const v = o.head;
  if (v === null) return null;
  if (typeof v !== 'number') throw new Error('sha projector: head 가 수도 null 도 아니다');
  return v;
}
function readShape(v: unknown): StageRowShape {
  const o = obj(v, 'row shape');
  const slots: StageSlot[] = list(o, 'slots').map((s) => {
    const so = obj(s, 'slot');
    return { id: str(so, 'id'), col: num(so, 'col'), head: headOf(so) };
  });
  return { row: rowId(o.row), startCol: num(o, 'startCol'), head: headOf(o), slots };
}
function readFoldRow(v: unknown): StageFoldRow {
  const o = obj(v, 'fold row');
  const cells: StageCell[] = list(o, 'cells').map((c) => {
    const co = obj(c, 'cell');
    return { id: str(co, 'id'), col: num(co, 'col'), block: num(co, 'block'), state: num(co, 'state') };
  });
  return { row: rowId(o.row), start: num(o, 'start'), startCol: num(o, 'startCol'), cells };
}
function readSent(v: unknown): StageSentByte {
  const o = obj(v, 'sent byte');
  const kind = o.kind;
  if (kind !== 'text' && kind !== 'pad') throw new Error(`sha projector: 모르는 바이트 종류 ${String(kind)}`);
  return { byte: num(o, 'byte'), kind };
}
function readMatch(v: unknown): StageMatch {
  if (v === 'land' || v === 'half' || v === 'miss') return v;
  throw new Error(`sha projector: 모르는 겹침 ${String(v)}`);
}
function lastCell(row: StageFoldRow): StageCell {
  const c = row.cells[row.cells.length - 1];
  if (!c) throw new Error(`sha projector: ${row.row} 줄이 비었다`);
  return c;
}
function chain(row: StageFoldRow): string {
  return [row.start, ...row.cells.map((c) => c.state)].map(hex4).join(' → ');
}

export const shaProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ShaStage | undefined;
  if (!stage) throw new Error('sha projector: stage 가 없다');
  const code = views.codePanel as unknown as CodePanel | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();
  const dur = (ms: number): number => ms / Math.max(0.01, runtime?.getSpeed() ?? 1);

  // 판 안에서만 쥐는 그림자 — 앞 걸음이 보낸 것
  let message: string | null = null;
  let aliceRows: StageFoldRow[] = [];

  const need = <T>(v: T | null, what: string): T => {
    if (v === null) throw new Error(`sha projector: ${what} 가 아직 없다`);
    return v;
  };

  return {
    onReset() {
      stage.reset();
      message = null;
      aliceRows = [];
      code?.clearHighlight?.();
    },
    onEvent(event: FacetRuntimeEvent) {
      const p = obj(event.payload, event.type);
      switch (event.type) {
        case 'phase': {
          code?.highlightPhase?.(str(p, 'phase'));
          return;
        }
        case 'init': {
          code?.highlightPhase?.(null);
          message = str(p, 'message');
          aliceRows = [];
          const key = num(p, 'key');
          stage.layout(list(p, 'rows').map(readShape), key, dur(500));
          stage.caption(t('caption.init', 'Alice and Bob share key {key}; Mallory has none. Message: {msg}', { key: hex4(key), msg: message }));
          return;
        }
        case 'alice-tag': {
          const ms = dur(num(p, 'ms'));
          aliceRows = list(p, 'rows').map(readFoldRow);
          const share = ms / aliceRows.length;
          aliceRows.forEach((r, i) => stage.fillRow(r, share, i * share));
          const endRow = aliceRows[aliceRows.length - 1];
          if (!endRow) throw new Error('sha projector: Alice 의 줄이 없다');
          stage.markEnd(endRow.row, lastCell(endRow).col);
          const tag = num(p, 'tag');
          stage.moveLetter('alice', 0);
          stage.letterText(need(message, 'message'));
          stage.letterTag(tag);
          stage.caption(t('caption.aliceTag', 'Alice folds to the end. The last state is the tag T = {tag}', { tag: hex4(tag) }));
          return;
        }
        case 'deliver': {
          const ms = dur(num(p, 'ms'));
          stage.moveLetter('mallory', ms);
          stage.caption(
            t('caption.deliver', 'The message and its tag cross over and Mallory takes them: {msg} · {tag}', {
              msg: str(p, 'message'),
              tag: hex4(num(p, 'tag')),
            }),
          );
          return;
        }
        case 'forge-message': {
          const ms = dur(num(p, 'ms'));
          const sent = list(p, 'sent').map(readSent);
          stage.letterBytes(sent, ms);
          const attack = num(p, 'attack');
          const text = (bytes: StageSentByte[]) => bytes.map((b) => String.fromCharCode(b.byte)).join('');
          if (attack === 0) {
            stage.caption(t('caption.forgeRewrite', 'Mallory rewrites the message: {alt}', { alt: text(sent) }));
          } else if (attack === 1) {
            const firstPad = sent.findIndex((b) => b.kind === 'pad');
            const lastPad = sent.map((b) => b.kind).lastIndexOf('pad');
            if (firstPad < 0) throw new Error('sha projector: 이어 붙이기인데 패딩이 없다');
            const pad = sent.slice(firstPad, lastPad + 1).map((b) => hex2(b.byte)).join(' ');
            const ext = text(sent.slice(lastPad + 1));
            stage.caption(
              t('caption.forgeGlue', 'Mallory appends the original padding {pad}, then {ext}: {n} bytes', {
                pad,
                ext,
                n: sent.length,
              }),
            );
          } else {
            throw new Error(`sha projector: 모르는 공격 ${attack}`);
          }
          return;
        }
        case 'forge-tag': {
          const ms = dur(num(p, 'ms'));
          const attack = num(p, 'attack');
          const row = readFoldRow(p.row);
          const claim = num(p, 'claim');
          const aliceFirst = aliceRows[0];
          const aliceEnd = aliceRows[aliceRows.length - 1];
          if (!aliceFirst || !aliceEnd) throw new Error('sha projector: Alice 의 줄이 아직 없다');
          // 이어 붙이기는 받은 표 T(Alice 줄의 끝)에서, 고치기는 줄의 처음(IV)에서 출발한다
          if (attack === 1) stage.flyState(aliceEnd.row, lastCell(aliceEnd).col, row.startCol, row.start, ms * 0.4);
          else if (attack === 0) stage.flyState(aliceFirst.row, aliceFirst.startCol, row.startCol, row.start, ms * 0.4);
          else throw new Error(`sha projector: 모르는 공격 ${attack}`);
          stage.fillRow(row, ms * 0.6, ms * 0.4);
          stage.markEnd('mallory', lastCell(row).col);
          stage.letterTag(claim);
          stage.caption(
            attack === 1
              ? t('caption.forgeExtend', 'Mallory puts T in the state box and keeps folding: {chain} · attached tag {claim}', {
                  chain: chain(row),
                  claim: hex4(claim),
                })
              : t('caption.forgeHash', 'Mallory folds from IV without the key: {chain} · attached tag {claim}', {
                  chain: chain(row),
                  claim: hex4(claim),
                }),
          );
          return;
        }
        case 'bob-tag': {
          const ms = dur(num(p, 'ms'));
          const rows = list(p, 'rows').map(readFoldRow);
          const match = list(p, 'match').map(readMatch);
          const lands = bool(p, 'lands');
          const bob = num(p, 'bob');
          const folds = num(p, 'folds');
          const holder: Holder = 'bob';
          stage.moveLetter(holder, ms * 0.3);
          const share = (ms * 0.6) / rows.length;
          rows.forEach((r, i) => stage.fillRow(r, share, i * share));
          const endRow = rows[rows.length - 1];
          if (!endRow) throw new Error('sha projector: Bob 의 줄이 없다');
          stage.markEnd(endRow.row, lastCell(endRow).col);
          stage.dropMallory(match, ms * 0.35, ms * 0.6);
          const vars = { folds, bob: hex4(bob), k: match.length };
          if (lands) {
            stage.caption(t('caption.bobLand', 'Bob refolds: {folds} folds, value {bob}. Mallory’s {k} cells land on his row', vars));
          } else if (match.some((m) => m === 'half')) {
            stage.caption(
              t('caption.bobHalf', 'Bob refolds: {folds} folds, value {bob}. Same blocks, other states: Mallory’s cells break off', vars),
            );
          } else {
            stage.caption(t('caption.bobMiss', 'Bob refolds: {folds} folds, value {bob}. Mallory’s cells do not match his row', vars));
          }
          return;
        }
        case 'verdict': {
          const ms = dur(num(p, 'ms'));
          const accepted = bool(p, 'accepted');
          const bob = num(p, 'bob');
          const claim = num(p, 'claim');
          stage.stamp(accepted, bob, claim, ms);
          const vars = { bob: hex4(bob), claim: hex4(claim) };
          stage.caption(
            accepted
              ? t('caption.accept', 'Bob accepts: {bob} = {claim}', vars)
              : t('caption.reject', 'Bob rejects: {bob} ≠ {claim}', vars),
          );
          return;
        }
        default:
          throw new Error(`sha projector: 모르는 이벤트 ${event.type}`);
      }
    },
  };
};
