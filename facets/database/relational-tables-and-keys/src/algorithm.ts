/**
 * 테이블과 키 (Tables and Keys) 정적 facet — 입력 반응형.
 *
 * mount 직후 약 1초 뒤 자동 호버 시연 (FK 셀 1001 → PK 셀 1001 강조 한 번 →
 * 잠시 후 해제) 후 무한 waitForInput 루프로 사용자 입력 (toggle-pk /
 * toggle-rejects / auto-demo / reset) 을 시각 사건으로 매핑한다.
 *
 * 진행 모델은 정적이지만, "후보키 ↔ 기본키 자리바꿈" 과 "거부 인서트 보기"
 * 두 토글 + 자동 호버 시연이 있어 ReactiveMechanism 으로 묶는다. 셀 단위
 * 호버 인터랙션 자체는 view 내부에서 직접 처리한다 (algorithm 미경유).
 *
 * 식별자 (C1):
 *   - `table:<id>`        테이블 (예: table:member, table:order)
 *   - `column:<t>.<c>`    컬럼 (예: column:member.id)
 *   - `row:<t>.<r>`       행 (예: row:order.0)
 *   - `cell:<t>.<r>.<c>`  셀 (예: cell:order.0.memberId)
 *   - `relation:<id>`     테이블 사이 관계 (예: relation:order_member)
 *
 * 이벤트 (C2 — 모두 facet 로컬, StandardEventType 미포함):
 *   - init                 payload: { tables: TableInit[]; relations: RelationInit[];
 *                                     candidateKeys: CandidateKeysInit;
 *                                     pkChoice: { [tableId]: string };
 *                                     rejectsVisible: boolean;
 *                                     rejects: RejectInit[] }
 *   - pk-toggle            target: table:<id>
 *                          payload: { tableId; fromColumn; toColumn }
 *   - rejects-visible      payload: { visible: boolean }
 *   - auto-hover           target: cell:<t>.<r>.<c>
 *                          payload: { tableId; rowIndex; columnId; value;
 *                                     kind: 'fk' | 'pk'; durationMs: number }
 *                          — view 가 강조를 일정 ms 동안 유지 후 자동 해제.
 *   - demo-end             payload: {}
 *   - invalid-input        payload: { op: string; raw: string }
 *
 *   메타 (silent):
 *   - phase                payload: { phase: 'auto-demo' | 'idle' }
 *
 * 진행 동력은 ReactiveMechanism. registerAlgorithm 시 mechanismKind: 'reactive'.
 */

import type { FacetContext, ReactiveContext } from '@facet/core/runtime';

export type ColumnKind = 'pk' | 'alt' | 'fk' | 'plain';

export type ColumnInit = {
  /** 컬럼 식별자 (테이블 안에서 유일). */
  id: string;
  /** 화면 라벨. */
  label: string;
  /** 어떤 키 자격인지 (기본키/대체키/외래키/일반). pk-toggle 시 view 가 갱신. */
  kind: ColumnKind;
  /** 외래키일 때 참조 대상. */
  references?: { tableId: string; columnId: string };
};

export type RowInit = {
  /** 행 식별자 (예: 'm0'). */
  id: string;
  /** 컬럼 id → 셀 값 (텍스트). */
  cells: Record<string, string>;
};

export type TableInit = {
  /** 테이블 식별자 (예: 'member'). */
  id: string;
  /** 테이블 이름 라벨 (예: '회원 (Member)'). */
  label: string;
  /** 컬럼 정의 (선언 순서가 화면 순서). */
  columns: ColumnInit[];
  /** 본문 행 (4~5 행). */
  rows: RowInit[];
};

export type RelationInit = {
  /** 관계 식별자. */
  id: string;
  /** PK 쪽 (왼쪽 끝 짧은 두 줄). */
  from: { tableId: string; columnId: string };
  /** FK 쪽 (오른쪽 끝 까마귀 발 세 줄). */
  to: { tableId: string; columnId: string };
};

export type CandidateKeysInit = {
  /** 테이블 id → 후보키 컬럼 id 목록. PK 토글 후보. */
  [tableId: string]: string[];
};

export type RejectInit = {
  /** 어느 테이블 아래에 들이미는가. */
  tableId: string;
  /** 거부의 종류. */
  kind: 'duplicate-pk' | 'missing-fk';
  /** 후보 행의 셀 값. */
  cells: Record<string, string>;
  /** 빨간 X 가 박힐 컬럼. */
  failingColumn: string;
  /** 짧은 거부 안내. */
  message: string;
};

export type AutoHoverStep = {
  tableId: string;
  rowIndex: number;
  columnId: string;
  /** 셀의 값. */
  value: string;
  /** 'fk' = FK 셀에서 출발, 'pk' = PK 셀에서 출발. */
  kind: 'fk' | 'pk';
  /** view 가 강조를 유지할 시간. */
  durationMs: number;
};

export type TablesAndKeysFacetData = {
  type: 'relational-tables-and-keys';
  tables: TableInit[];
  relations: RelationInit[];
  candidateKeys: CandidateKeysInit;
  /** 초기 기본키 선택 (table id → column id). */
  pkChoice: Record<string, string>;
  /** 거부 인서트 — 항상 두 줄 (회원·주문 각 1). */
  rejects: RejectInit[];
  /** 거부 인서트 초기 가시 상태. */
  rejectsVisibleByDefault: boolean;
  /** mount 후 자동 호버 시연 시퀀스. */
  autoDemoSequence: AutoHoverStep[];
  /** 자동 시연 한 사건 사이 머무는 간격 ms. */
  autoDemoIntervalMs: number;
};

export type TablesAndKeysInputEvent =
  | { type: 'input'; payload?: { name: string; value: string } }
  | { type: 'toggle-pk'; payload?: { table?: string; column?: string } }
  | { type: 'toggle-rejects'; payload?: { visible?: boolean } }
  | { type: 'auto-demo'; payload?: unknown };

function nextPkChoice(
  current: string,
  candidates: string[],
): string | null {
  if (candidates.length < 2) return null;
  const idx = candidates.indexOf(current);
  if (idx < 0) return candidates[0] ?? null;
  return candidates[(idx + 1) % candidates.length] ?? null;
}

export async function relationalTablesAndKeys(
  ctxBase: FacetContext<TablesAndKeysFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<TablesAndKeysFacetData>;
  const {
    tables,
    relations,
    candidateKeys,
    pkChoice: initialPkChoice,
    rejects,
    rejectsVisibleByDefault,
    autoDemoSequence,
    autoDemoIntervalMs,
  } = ctx.data;

  // ── 모델 상태 ──
  const pkChoice: Record<string, string> = { ...initialPkChoice };
  let rejectsVisible = rejectsVisibleByDefault;

  async function emitAutoHoverSequence(): Promise<void> {
    await ctx.emit({ type: 'phase', payload: { phase: 'auto-demo' }, silent: true });
    for (const step of autoDemoSequence) {
      if (ctx.cancelled) return;
      const ok = await ctx.sleep(autoDemoIntervalMs);
      if (!ok || ctx.cancelled) return;
      await ctx.emit({
        type: 'auto-hover',
        target: `cell:${step.tableId}.${step.rowIndex}.${step.columnId}`,
        payload: {
          tableId: step.tableId,
          rowIndex: step.rowIndex,
          columnId: step.columnId,
          value: step.value,
          kind: step.kind,
          durationMs: step.durationMs,
        },
      });
      // 강조 유지 시간 만큼 대기 후 다음 step 으로.
      const ok2 = await ctx.sleep(step.durationMs);
      if (!ok2 || ctx.cancelled) return;
    }
  }

  async function emitTogglePk(tableId: string): Promise<void> {
    const cands = candidateKeys[tableId];
    if (!Array.isArray(cands) || cands.length < 2) {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'toggle-pk', raw: `no candidate keys for ${tableId}` },
      });
      return;
    }
    const cur = pkChoice[tableId];
    if (typeof cur !== 'string') {
      await ctx.emit({
        type: 'invalid-input',
        payload: { op: 'toggle-pk', raw: `unknown table ${tableId}` },
      });
      return;
    }
    const next = nextPkChoice(cur, cands);
    if (next === null || next === cur) return;
    pkChoice[tableId] = next;
    await ctx.emit({
      type: 'pk-toggle',
      target: `table:${tableId}`,
      payload: { tableId, fromColumn: cur, toColumn: next },
    });
  }

  async function emitToggleRejects(forced?: boolean): Promise<void> {
    const next = typeof forced === 'boolean' ? forced : !rejectsVisible;
    rejectsVisible = next;
    await ctx.emit({
      type: 'rejects-visible',
      payload: { visible: next },
    });
  }

  // 0. 초기 통보.
  await ctx.emit({
    type: 'init',
    payload: {
      tables: tables.map((t) => ({
        id: t.id,
        label: t.label,
        columns: t.columns.map((c) => ({
          id: c.id,
          label: c.label,
          kind: c.kind,
          references: c.references ? { ...c.references } : undefined,
        })),
        rows: t.rows.map((r) => ({ id: r.id, cells: { ...r.cells } })),
      })),
      relations: relations.map((rel) => ({
        id: rel.id,
        from: { ...rel.from },
        to: { ...rel.to },
      })),
      candidateKeys: Object.fromEntries(
        Object.entries(candidateKeys).map(([k, v]) => [k, [...v]]),
      ),
      pkChoice: { ...pkChoice },
      rejectsVisible,
      rejects: rejects.map((r) => ({
        tableId: r.tableId,
        kind: r.kind,
        cells: { ...r.cells },
        failingColumn: r.failingColumn,
        message: r.message,
      })),
    },
  });

  // 1. 자동 호버 시연 1회.
  await emitAutoHoverSequence();
  if (ctx.cancelled) return;
  await ctx.emit({ type: 'demo-end' });
  await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });

  // 2. 입력 반응 루프.
  for (;;) {
    if (ctx.cancelled) return;
    let ev: TablesAndKeysInputEvent;
    try {
      ev = await ctx.waitForInput<TablesAndKeysInputEvent>();
    } catch {
      return;
    }

    if (ev.type === 'input') {
      // value-input 동기 — 현재 컨트롤바에 value-input 을 두지 않으나
      // 표준 어휘 호환을 위해 무시 처리만 한다.
      continue;
    }

    if (ev.type === 'toggle-pk') {
      const tid = typeof ev.payload?.table === 'string' ? ev.payload.table : 'member';
      await emitTogglePk(tid);
      continue;
    }

    if (ev.type === 'toggle-rejects') {
      const v = ev.payload?.visible;
      await emitToggleRejects(typeof v === 'boolean' ? v : undefined);
      continue;
    }

    if (ev.type === 'auto-demo') {
      await emitAutoHoverSequence();
      if (ctx.cancelled) return;
      await ctx.emit({ type: 'demo-end' });
      await ctx.emit({ type: 'phase', payload: { phase: 'idle' }, silent: true });
      continue;
    }
  }
}
