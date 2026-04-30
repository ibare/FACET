/**
 * tables-stage View — 테이블과 키 시각화 단일 통합 캔버스.
 *
 * 한 SVG 안에 캡션 / PK 토글 상태 칩 / 좌·우 카드형 테이블 / 두 컬럼을 잇는
 * 베지어 곡선 + Crow's Foot 카디널리티 기호 / 셀 호버 시 두 셀 옅은 배경
 * 강조 + 점선 연결 / 두 카드 아래 거부 인서트 / 키 범례 / 시각화 안 텍스트
 * / 참고 레퍼런스를 모두 담는다.
 *
 * 메서드 (projector → view):
 *   - reset()
 *   - init({ tables, relations, candidateKeys, pkChoice, rejectsVisible, rejects })
 *   - setBaseCaption(text)
 *   - setCaption(text, opts?)
 *   - applyPkToggle({ tableId, fromColumn, toColumn })  — 자리바꿈 운동 ~300ms
 *   - setRejectsVisible(visible)
 *   - autoHover({ tableId, rowIndex, columnId, value, kind, durationMs })
 *   - signalInvalid(op, raw)
 *   - signalDemoEnd()
 *
 * 셀 호버 인터랙션은 view 내부에서 직접 SVG mouseover/mouseout 으로 처리.
 */

import type { View, ViewInstance, ViewMountParams } from '@facet/core/runtime';
import {
  getColors,
  fonts,
  fontSizes,
  categorical,
} from '@facet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 560;

// 영역 분할.
const CAPTION_BASE_Y = 22;
const CAPTION_EVENT_Y = 44;

const CHIP_Y = 64;

// 두 카드형 테이블.
const CARD_TOP = 92;
const CARD_HEADER_H = 26;
const COLUMN_HEADER_H = 22;
const ROW_H = 22;
const CARD_RADIUS = 6;

const LEFT_CARD_X = 12;
const LEFT_CARD_W = 280;
const RIGHT_CARD_X = 428;
const RIGHT_CARD_W = 280;

// 거부 인서트 영역 (본 행 아래에 들이밂).
const REJECT_GAP = 6;
const REJECT_ROW_H = 22;
const REJECT_MSG_H = 14;

// 범례 영역.
const LEGEND_Y = 480;

// 운동 시간 (ms).
const PK_TOGGLE_MS = 300;
const CAPTION_DURATION_MS = 1800;

function setAttrs(el: Element, attrs: Record<string, string | number>): void {
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
}

function raf(cb: (t: number) => void): number {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(Date.now()), 16) as unknown as number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, Math.max(0, ms)));
}

type ColumnKindTok = 'pk' | 'alt' | 'fk' | 'plain';

type ColumnRec = {
  id: string;
  label: string;
  kind: ColumnKindTok;
  references?: { tableId: string; columnId: string };
  /** 컬럼 헤더 텍스트. */
  headerEl: SVGTextElement;
  /** alt 라벨 (대체키일 때만 보임). */
  altLabelEl: SVGTextElement;
  /** 좌측 슬롯 열쇠 아이콘 (헤더 줄). */
  headerKeyEl: SVGGElement;
  /** 컬럼 좌측 X (카드 안 좌표). */
  x0: number;
  /** 컬럼 너비. */
  width: number;
};

type CellRec = {
  rowIndex: number;
  columnId: string;
  value: string;
  /** 셀 배경 사각 (호버/짝짓기 강조). */
  bgEl: SVGRectElement;
  /** 같은 값 옅은 마커 (글자 뒤). */
  markEl: SVGRectElement;
  /** 텍스트. */
  textEl: SVGTextElement;
  /** 행간 좌측 슬롯의 행 단위 채움/윤곽 열쇠 (PK/alt/FK 컬럼 셀에만 보임). */
  rowKeyEl: SVGGElement;
  /** 셀 중심 X. */
  cx: number;
  /** 셀 중심 Y. */
  cy: number;
  /** 셀 우측 끝 X (곡선 끝점 후보). */
  rightX: number;
  /** 셀 좌측 끝 X (곡선 끝점 후보). */
  leftX: number;
};

type RowRec = {
  rowIndex: number;
  cells: Map<string, CellRec>;
  /** 행 zebra 줄무늬 사각. */
  stripeEl: SVGRectElement;
  /** 행 본문 Y 중심. */
  cy: number;
};

type RejectRowRec = {
  tableId: string;
  failingColumn: string;
  message: string;
  /** 행 클립 그룹 (보임/숨김 토글). */
  groupEl: SVGGElement;
  cells: Map<string, CellRec>;
};

type TableRec = {
  id: string;
  label: string;
  columns: ColumnRec[];
  columnsById: Map<string, ColumnRec>;
  rows: RowRec[];
  /** 테이블 카드 좌상단 X. */
  cardX: number;
  /** 테이블 카드 좌상단 Y. */
  cardY: number;
  /** 카드 너비. */
  cardW: number;
  /** 카드 안 본문 시작 Y (헤더 + 컬럼 헤더 줄 아래). */
  bodyTop: number;
  /** 거부 인서트 (있으면 1행). */
  rejectRow: RejectRowRec | null;
  /** 거부 인서트 안내 텍스트. */
  rejectMessageEl: SVGTextElement | null;
  /** 거부 인서트 좌측 빨간 보더. */
  rejectBorderEl: SVGRectElement | null;
  /** 거부 인서트 X 마크. */
  rejectXEl: SVGGElement | null;
};

type RelationRec = {
  id: string;
  fromTableId: string;
  fromColumnId: string;
  toTableId: string;
  toColumnId: string;
  /** 곡선 path. */
  pathEl: SVGPathElement;
  /** Crow's Foot 시작 (one). */
  startMarkEl: SVGGElement;
  /** Crow's Foot 끝 (many). */
  endMarkEl: SVGGElement;
};

export const tablesStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    container.textContent = '';
    container.style.width = '100%';
    container.style.maxWidth = '720px';
    container.style.margin = '0 auto';

    const palette = getColors(params.theme);
    const cat = categorical(6, 'vivid');
    const PK_TONE = cat[0]!;       // 따뜻한 노랑/오렌지 — 정의하는 자리.
    const FK_TONE = cat[2]!;       // 연두 톤 — 참조하는 자리.
    const ALT_TONE = cat[1]!;      // alt: PK 사이 톤.
    const HIGHLIGHT_TONE = cat[3]!; // 셀 짝짓기 강조 — 옅은 청록.
    const SAME_VALUE_TONE = cat[4]!; // 같은 값 옅은 마커 — 보라.

    const svg = document.createElementNS(SVG_NS, 'svg');
    setAttrs(svg, {
      viewBox: `0 0 ${W} ${H}`,
      xmlns: SVG_NS,
      style: 'display:block;width:100%;height:auto;font-family:' + fonts.body,
      role: 'img',
    });
    container.appendChild(svg);

    // ── 캡션 ──
    const baseCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(baseCaption, {
      x: W / 2,
      y: CAPTION_BASE_Y,
      'text-anchor': 'middle',
      fill: palette.textMuted,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    baseCaption.textContent = '';
    svg.appendChild(baseCaption);

    const eventCaption = document.createElementNS(SVG_NS, 'text');
    setAttrs(eventCaption, {
      x: W / 2,
      y: CAPTION_EVENT_Y,
      'text-anchor': 'middle',
      fill: palette.text,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
      'font-weight': '600',
      opacity: '0',
    });
    eventCaption.textContent = '';
    svg.appendChild(eventCaption);

    // ── PK 토글 상태 칩 ──
    const chipGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(chipGroup);
    const chipBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(chipBg, {
      x: LEFT_CARD_X,
      y: CHIP_Y - 12,
      width: 156,
      height: 18,
      rx: 9,
      ry: 9,
      fill: palette.bgSubtle,
      stroke: palette.border,
      'stroke-width': '1',
    });
    chipGroup.appendChild(chipBg);
    const chipText = document.createElementNS(SVG_NS, 'text');
    setAttrs(chipText, {
      x: LEFT_CARD_X + 78,
      y: CHIP_Y + 1,
      'text-anchor': 'middle',
      fill: palette.text,
      'font-size': '10px',
      'font-family': fonts.body,
    });
    chipText.textContent = '기본키: 학번 ▼';
    chipGroup.appendChild(chipText);

    // ── 정적 그룹들 (z-order: 카드 → 곡선 → 셀 강조 → 텍스트) ──
    const cardLayer = document.createElementNS(SVG_NS, 'g');
    const sameValueLayer = document.createElementNS(SVG_NS, 'g');
    const cellHighlightLayer = document.createElementNS(SVG_NS, 'g');
    const cellTextLayer = document.createElementNS(SVG_NS, 'g');
    const relationLayer = document.createElementNS(SVG_NS, 'g');
    const dottedLayer = document.createElementNS(SVG_NS, 'g');
    const rejectLayer = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(cardLayer);
    svg.appendChild(sameValueLayer);
    svg.appendChild(cellHighlightLayer);
    svg.appendChild(cellTextLayer);
    svg.appendChild(relationLayer);
    svg.appendChild(dottedLayer);
    svg.appendChild(rejectLayer);

    // ── 범례 ──
    const legendGroup = document.createElementNS(SVG_NS, 'g');
    svg.appendChild(legendGroup);
    drawLegend(legendGroup, palette, PK_TONE, FK_TONE, ALT_TONE);

    // ── 모델 ──
    const tables = new Map<string, TableRec>();
    const relations: RelationRec[] = [];
    let pkChoice: Record<string, string> = {};
    let rejectsVisible = true;
    let captionTimer: ReturnType<typeof setTimeout> | null = null;
    let autoHoverTimer: ReturnType<typeof setTimeout> | null = null;

    function clearCaptionTimer(): void {
      if (captionTimer !== null) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
    }

    function setBaseCaption(text: string): void {
      baseCaption.textContent = text;
    }

    function setCaption(text: string, opts?: { duration?: number }): void {
      eventCaption.textContent = text;
      eventCaption.setAttribute('opacity', '1');
      clearCaptionTimer();
      const dur = opts?.duration ?? CAPTION_DURATION_MS;
      captionTimer = setTimeout(() => {
        eventCaption.setAttribute('opacity', '0');
        captionTimer = null;
      }, Math.max(0, dur));
    }

    function clearAutoHoverTimer(): void {
      if (autoHoverTimer !== null) {
        clearTimeout(autoHoverTimer);
        autoHoverTimer = null;
      }
    }

    function reset(): void {
      clearCaptionTimer();
      clearAutoHoverTimer();
      eventCaption.setAttribute('opacity', '0');
      eventCaption.textContent = '';
      cardLayer.textContent = '';
      sameValueLayer.textContent = '';
      cellHighlightLayer.textContent = '';
      cellTextLayer.textContent = '';
      relationLayer.textContent = '';
      dottedLayer.textContent = '';
      rejectLayer.textContent = '';
      tables.clear();
      relations.length = 0;
      pkChoice = {};
      rejectsVisible = true;
      chipText.textContent = '기본키: 학번 ▼';
    }

    function init(payload: {
      tables: Array<{
        id: string;
        label: string;
        columns: Array<{
          id: string;
          label: string;
          kind: ColumnKindTok;
          references?: { tableId: string; columnId: string };
        }>;
        rows: Array<{ id: string; cells: Record<string, string> }>;
      }>;
      relations: Array<{
        id: string;
        from: { tableId: string; columnId: string };
        to: { tableId: string; columnId: string };
      }>;
      candidateKeys: Record<string, string[]>;
      pkChoice: Record<string, string>;
      rejectsVisible: boolean;
      rejects: Array<{
        tableId: string;
        kind: 'duplicate-pk' | 'missing-fk';
        cells: Record<string, string>;
        failingColumn: string;
        message: string;
      }>;
    }): void {
      reset();
      pkChoice = { ...payload.pkChoice };
      rejectsVisible = payload.rejectsVisible;

      // 두 카드를 좌우로 배치.
      const layouts: Array<{ id: string; x: number; w: number }> = [
        { id: payload.tables[0]?.id ?? 'l', x: LEFT_CARD_X, w: LEFT_CARD_W },
        { id: payload.tables[1]?.id ?? 'r', x: RIGHT_CARD_X, w: RIGHT_CARD_W },
      ];

      for (let i = 0; i < payload.tables.length; i += 1) {
        const t = payload.tables[i]!;
        const layout = layouts[i] ?? layouts[0]!;
        const rec = drawTable(
          t,
          layout.x,
          CARD_TOP,
          layout.w,
          {
            cardLayer,
            cellHighlightLayer,
            cellTextLayer,
            sameValueLayer,
            rejectLayer,
          },
          {
            palette,
            pkTone: PK_TONE,
            fkTone: FK_TONE,
            altTone: ALT_TONE,
            sameValueTone: SAME_VALUE_TONE,
            highlightTone: HIGHLIGHT_TONE,
          },
          pkChoice[t.id] ?? null,
          payload.rejects.find((r) => r.tableId === t.id) ?? null,
          handleCellEnter,
          handleCellLeave,
        );
        tables.set(t.id, rec);
      }

      // 관계 곡선 + Crow's Foot.
      for (const rel of payload.relations) {
        const rec = drawRelation(
          rel,
          tables,
          relationLayer,
          palette,
        );
        if (rec) relations.push(rec);
      }

      // 같은 값 마커 (옅은 색 — 호버 무관 항상 보임).
      paintSameValueMarkers();

      // 거부 인서트 가시성.
      applyRejectsVisible(rejectsVisible);

      // PK 토글 상태 칩 텍스트 갱신.
      updateChipText();
    }

    function paintSameValueMarkers(): void {
      // FK ↔ PK 짝지어진 두 셀 + 동일 값 셀 모두에 옅은 SAME_VALUE_TONE 글자
      // 마커를 깔아 시선이 색을 따라 짝을 추적할 수 있다.
      for (const rel of relations) {
        const fromTbl = tables.get(rel.fromTableId);
        const toTbl = tables.get(rel.toTableId);
        if (!fromTbl || !toTbl) continue;
        for (const fromRow of fromTbl.rows) {
          const fromCell = fromRow.cells.get(rel.fromColumnId);
          if (!fromCell) continue;
          let matched = false;
          for (const toRow of toTbl.rows) {
            const toCell = toRow.cells.get(rel.toColumnId);
            if (!toCell) continue;
            if (toCell.value === fromCell.value && fromCell.value !== '') {
              setAttrs(toCell.markEl, {
                fill: SAME_VALUE_TONE,
                opacity: '0.18',
              });
              matched = true;
            }
          }
          if (matched) {
            setAttrs(fromCell.markEl, {
              fill: SAME_VALUE_TONE,
              opacity: '0.18',
            });
          }
        }
      }
    }

    function setRejectsVisible(visible: boolean): void {
      rejectsVisible = visible;
      applyRejectsVisible(visible);
    }

    function applyRejectsVisible(visible: boolean): void {
      for (const tbl of tables.values()) {
        if (!tbl.rejectRow) continue;
        tbl.rejectRow.groupEl.setAttribute(
          'opacity',
          visible ? '1' : '0',
        );
        tbl.rejectRow.groupEl.setAttribute(
          'pointer-events',
          visible ? 'auto' : 'none',
        );
      }
    }

    function findReferencedCell(
      tableId: string,
      columnId: string,
      value: string,
    ): CellRec | null {
      const tbl = tables.get(tableId);
      if (!tbl) return null;
      for (const r of tbl.rows) {
        const c = r.cells.get(columnId);
        if (c && c.value === value) return c;
      }
      return null;
    }

    function findReferencingCells(
      pkTableId: string,
      pkColumnId: string,
      value: string,
    ): CellRec[] {
      const out: CellRec[] = [];
      for (const rel of relations) {
        if (rel.fromTableId !== pkTableId || rel.fromColumnId !== pkColumnId) continue;
        const fkTbl = tables.get(rel.toTableId);
        if (!fkTbl) continue;
        for (const r of fkTbl.rows) {
          const c = r.cells.get(rel.toColumnId);
          if (c && c.value === value) out.push(c);
        }
      }
      return out;
    }

    function clearAllHoverHighlights(): void {
      for (const tbl of tables.values()) {
        for (const r of tbl.rows) {
          for (const c of r.cells.values()) {
            c.bgEl.setAttribute('opacity', '0');
          }
        }
      }
      dottedLayer.textContent = '';
      for (const rel of relations) {
        rel.pathEl.setAttribute('stroke-opacity', '0.55');
      }
    }

    function dimAllRelations(): void {
      for (const rel of relations) {
        rel.pathEl.setAttribute('stroke-opacity', '0.55');
      }
    }

    function emphasizeRelation(
      fromTableId: string,
      fromColumnId: string,
      toTableId: string,
      toColumnId: string,
    ): void {
      for (const rel of relations) {
        if (
          rel.fromTableId === fromTableId &&
          rel.fromColumnId === fromColumnId &&
          rel.toTableId === toTableId &&
          rel.toColumnId === toColumnId
        ) {
          rel.pathEl.setAttribute('stroke-opacity', '1');
        } else {
          rel.pathEl.setAttribute('stroke-opacity', '0.35');
        }
      }
    }

    function paintHoverHighlight(cells: CellRec[]): void {
      for (const c of cells) {
        c.bgEl.setAttribute('fill', HIGHLIGHT_TONE);
        c.bgEl.setAttribute('opacity', '0.32');
      }
    }

    function drawDottedLink(a: CellRec, b: CellRec): void {
      const path = document.createElementNS(SVG_NS, 'path');
      const ax = a.cx;
      const ay = a.cy;
      const bx = b.cx;
      const by = b.cy;
      const cpX = (ax + bx) / 2;
      const cpY = (ay + by) / 2 - 18;
      setAttrs(path, {
        d: `M${ax},${ay} Q${cpX},${cpY} ${bx},${by}`,
        fill: 'none',
        stroke: HIGHLIGHT_TONE,
        'stroke-width': '0.75',
        'stroke-dasharray': '3 3',
        'stroke-opacity': '0.85',
      });
      dottedLayer.appendChild(path);
    }

    function handleCellEnter(cell: CellRec, tableId: string): void {
      // FK 컬럼인지 / PK 컬럼인지 확인 후 짝짓기 강조.
      const tbl = tables.get(tableId);
      if (!tbl) return;
      const col = tbl.columnsById.get(cell.columnId);
      if (!col) return;

      // auto-hover 진행 중이면 무시 (programmatic 강조가 살아 있을 때 사용자 호버는 일단 양보).
      // 다만 사용자 호버는 dom 마우스 이벤트 우선으로 두고, autoHover 가 진행 중에는 cancel 하지 않는다.

      clearAllHoverHighlights();

      if (col.kind === 'fk' && col.references) {
        const pkCell = findReferencedCell(
          col.references.tableId,
          col.references.columnId,
          cell.value,
        );
        if (pkCell) {
          paintHoverHighlight([cell, pkCell]);
          drawDottedLink(cell, pkCell);
          emphasizeRelation(
            col.references.tableId,
            col.references.columnId,
            tableId,
            cell.columnId,
          );
          setCaption(
            `외래키 값 ${cell.value} 은 ${labelOfTable(col.references.tableId)}의 ${labelOfColumn(col.references.tableId, col.references.columnId)} ${cell.value} 을 가리킨다.`,
            { duration: 4000 },
          );
          return;
        }
        // 참조 대상 없는 외래키 — 거부 톤.
        cell.bgEl.setAttribute('fill', palette.danger);
        cell.bgEl.setAttribute('opacity', '0.18');
        setCaption(
          `외래키 값 ${cell.value} 을 가리킬 행이 없다.`,
          { duration: 4000 },
        );
        return;
      }

      if (col.kind === 'pk') {
        const fkCells = findReferencingCells(
          tableId,
          cell.columnId,
          cell.value,
        );
        paintHoverHighlight([cell, ...fkCells]);
        for (const fk of fkCells) drawDottedLink(cell, fk);
        if (fkCells.length > 0) {
          // 첫 번째 관계만 강조.
          const fkTbl = findFkTable(tableId, cell.columnId);
          if (fkTbl) {
            emphasizeRelation(tableId, cell.columnId, fkTbl.tableId, fkTbl.columnId);
          }
          setCaption(
            `이 ${labelOfTable(tableId)}을 가리키는 ${labelOfTable(fkTbl?.tableId ?? '')}이 ${fkCells.length} 건이다.`,
            { duration: 4000 },
          );
        } else {
          paintHoverHighlight([cell]);
          setCaption(
            `이 행을 가리키는 다른 테이블의 외래키가 아직 없다.`,
            { duration: 4000 },
          );
        }
        return;
      }

      if (col.kind === 'alt') {
        paintHoverHighlight([cell]);
        setCaption(
          `${labelOfColumn(tableId, col.id)} 도 후보키였다 — 이번엔 ${labelOfColumn(tableId, pkChoice[tableId] ?? '')} 을 기본키로 둔다.`,
          { duration: 4000 },
        );
        return;
      }

      // plain — 짝짓기 없음, 가벼운 강조만.
      paintHoverHighlight([cell]);
    }

    function handleCellLeave(_cell: CellRec, _tableId: string): void {
      clearAllHoverHighlights();
      dimAllRelations();
    }

    function findFkTable(
      pkTableId: string,
      pkColumnId: string,
    ): { tableId: string; columnId: string } | null {
      for (const rel of relations) {
        if (rel.fromTableId === pkTableId && rel.fromColumnId === pkColumnId) {
          return { tableId: rel.toTableId, columnId: rel.toColumnId };
        }
      }
      return null;
    }

    function labelOfTable(tableId: string): string {
      return tables.get(tableId)?.label ?? tableId;
    }

    function labelOfColumn(tableId: string, columnId: string): string {
      const tbl = tables.get(tableId);
      const col = tbl?.columnsById.get(columnId);
      return col?.label ?? columnId;
    }

    function updateChipText(): void {
      const tbl = tables.get('member');
      if (!tbl) return;
      const pkColId = pkChoice['member'] ?? '';
      const pkCol = tbl.columnsById.get(pkColId);
      chipText.textContent = `기본키: ${pkCol?.label ?? pkColId} ▼`;
    }

    async function applyPkToggle(payload: {
      tableId: string;
      fromColumn: string;
      toColumn: string;
    }): Promise<void> {
      const { tableId, fromColumn, toColumn } = payload;
      const tbl = tables.get(tableId);
      if (!tbl) return;
      const fromCol = tbl.columnsById.get(fromColumn);
      const toCol = tbl.columnsById.get(toColumn);
      if (!fromCol || !toCol) return;

      // 1) 컬럼 kind 자리바꿈 (모델).
      pkChoice[tableId] = toColumn;
      // PK ↔ alt 교환. 다른 키 종류는 영향 없음.
      const fromWasKind = fromCol.kind;
      const toWasKind = toCol.kind;
      fromCol.kind = toWasKind === 'pk' ? 'alt' : toWasKind;
      toCol.kind = fromWasKind === 'alt' ? 'pk' : fromWasKind;
      // 안전장치 — 결과적으로 toCol 이 pk, fromCol 이 alt 가 되도록 보정.
      if (toCol.kind !== 'pk') toCol.kind = 'pk';
      if (fromCol.kind !== 'alt') fromCol.kind = 'alt';

      // 2) 헤더 + 행 단위 열쇠 시각 자리바꿈 (페이드 애니메이션).
      const startT = Date.now();
      const dur = PK_TOGGLE_MS;
      await new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - startT) / dur);
          const e = easeInOut(t);
          // fromCol 헤더는 PK -> alt 로 약해지고, toCol 헤더는 alt -> PK 로 짙어짐.
          setHeaderEmphasis(fromCol, 'alt', e, palette);
          setHeaderEmphasis(toCol, 'pk', e, palette);
          // 행 단위 열쇠 채움 ↔ 윤곽 → alt 도 채움 유지하므로 단순 색 변화만.
          for (const r of tbl.rows) {
            const fromCell = r.cells.get(fromCol.id);
            const toCell = r.cells.get(toCol.id);
            if (fromCell)
              setRowKeyVisual(fromCell.rowKeyEl, 'alt', e, palette, ALT_TONE, FK_TONE, PK_TONE);
            if (toCell)
              setRowKeyVisual(toCell.rowKeyEl, 'pk', e, palette, ALT_TONE, FK_TONE, PK_TONE);
          }
          if (t < 1) raf(tick);
          else res();
        };
        raf(tick);
      });

      // 3) 곡선 출발점을 새 PK 컬럼으로 미끄러지듯 이동.
      // tableId 가 from 테이블인 모든 relation 의 fromColumnId 를 toColumn 으로 교체.
      const startsToMove: RelationRec[] = [];
      for (const rel of relations) {
        if (rel.fromTableId === tableId && rel.fromColumnId === fromColumn) {
          rel.fromColumnId = toColumn;
          startsToMove.push(rel);
        }
      }
      const startT2 = Date.now();
      await new Promise<void>((res) => {
        const tick = (): void => {
          const t = Math.min(1, (Date.now() - startT2) / dur);
          for (const rel of startsToMove) updateRelationPath(rel, tables, palette);
          if (t < 1) raf(tick);
          else res();
        };
        raf(tick);
      });

      // 4) 카드 안 컬럼 끝점 갱신은 updateRelationPath 가 매 프레임 처리.
      // 5) 같은 값 마커 재페인트 (pkChoice 가 바뀌어도 마커는 FK ↔ PK 짝 기준이라 동일).
      // 6) 칩 텍스트 갱신.
      updateChipText();
      setCaption(
        `${labelOfColumn(tableId, toColumn)} 도 후보키였다 — 이번엔 ${labelOfColumn(tableId, fromColumn)} 대신 ${labelOfColumn(tableId, toColumn)} 을 기본키로 둔다.`,
        { duration: 3000 },
      );
    }

    async function autoHover(payload: {
      tableId: string;
      rowIndex: number;
      columnId: string;
      value: string;
      kind: 'fk' | 'pk';
      durationMs: number;
    }): Promise<void> {
      const tbl = tables.get(payload.tableId);
      if (!tbl) return;
      const row = tbl.rows[payload.rowIndex];
      if (!row) return;
      const cell = row.cells.get(payload.columnId);
      if (!cell) return;
      // programmatic 진입.
      handleCellEnter(cell, payload.tableId);
      await sleep(payload.durationMs);
      handleCellLeave(cell, payload.tableId);
    }

    function signalInvalid(op: string, raw: string): void {
      setCaption(`잘못된 입력: ${op} (${raw})`, { duration: 1800 });
    }

    function signalDemoEnd(): void {
      // 명시적 표식 없음 — 캡션은 자연 페이드.
    }

    return {
      destroy() {
        clearCaptionTimer();
        clearAutoHoverTimer();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
      reset,
      init,
      setBaseCaption,
      setCaption,
      applyPkToggle,
      setRejectsVisible,
      autoHover,
      signalInvalid,
      signalDemoEnd,
    };
  },
};

// ──────────────────────────────────────────────────────────────────────────
// 헬퍼 — 카드 / 곡선 / 열쇠 아이콘
// ──────────────────────────────────────────────────────────────────────────

type DrawLayers = {
  cardLayer: SVGGElement;
  cellHighlightLayer: SVGGElement;
  cellTextLayer: SVGGElement;
  sameValueLayer: SVGGElement;
  rejectLayer: SVGGElement;
};

type DrawTones = {
  palette: ReturnType<typeof getColors>;
  pkTone: string;
  fkTone: string;
  altTone: string;
  sameValueTone: string;
  highlightTone: string;
};

function drawTable(
  t: {
    id: string;
    label: string;
    columns: Array<{
      id: string;
      label: string;
      kind: ColumnKindTok;
      references?: { tableId: string; columnId: string };
    }>;
    rows: Array<{ id: string; cells: Record<string, string> }>;
  },
  cardX: number,
  cardY: number,
  cardW: number,
  layers: DrawLayers,
  tones: DrawTones,
  _pkColumnId: string | null,
  reject: {
    tableId: string;
    kind: 'duplicate-pk' | 'missing-fk';
    cells: Record<string, string>;
    failingColumn: string;
    message: string;
  } | null,
  onEnter: (cell: CellRec, tableId: string) => void,
  onLeave: (cell: CellRec, tableId: string) => void,
): TableRec {
  const { palette } = tones;
  const cardH =
    CARD_HEADER_H +
    COLUMN_HEADER_H +
    ROW_H * t.rows.length +
    REJECT_GAP +
    REJECT_ROW_H +
    REJECT_MSG_H +
    8;

  // 카드 본체.
  const card = document.createElementNS(SVG_NS, 'rect');
  setAttrs(card, {
    x: cardX,
    y: cardY,
    width: cardW,
    height: cardH,
    rx: CARD_RADIUS,
    ry: CARD_RADIUS,
    fill: palette.bg,
    stroke: palette.border,
    'stroke-width': '1',
  });
  layers.cardLayer.appendChild(card);

  // 헤더 띠.
  const headerBg = document.createElementNS(SVG_NS, 'path');
  // top corners rounded only.
  const r = CARD_RADIUS;
  const headerD =
    `M${cardX + r},${cardY}` +
    `L${cardX + cardW - r},${cardY}` +
    `Q${cardX + cardW},${cardY} ${cardX + cardW},${cardY + r}` +
    `L${cardX + cardW},${cardY + CARD_HEADER_H}` +
    `L${cardX},${cardY + CARD_HEADER_H}` +
    `L${cardX},${cardY + r}` +
    `Q${cardX},${cardY} ${cardX + r},${cardY}` +
    `Z`;
  setAttrs(headerBg, {
    d: headerD,
    fill: palette.text,
    opacity: '0.92',
  });
  layers.cardLayer.appendChild(headerBg);

  const headerLabel = document.createElementNS(SVG_NS, 'text');
  setAttrs(headerLabel, {
    x: cardX + 12,
    y: cardY + CARD_HEADER_H / 2 + 4,
    fill: palette.textInverse,
    'font-size': fontSizes.sm,
    'font-family': fonts.body,
    'font-weight': '600',
  });
  headerLabel.textContent = t.label;
  layers.cardLayer.appendChild(headerLabel);

  // 컬럼 너비 분배.
  // 좌측 12px = 행 단위 키 슬롯, 나머지를 컬럼 수로 균등.
  const KEY_SLOT = 18;
  const innerLeft = cardX + KEY_SLOT;
  const innerRight = cardX + cardW;
  const columnW = (innerRight - innerLeft) / t.columns.length;

  // 컬럼 헤더 줄.
  const colHeaderBgY = cardY + CARD_HEADER_H;
  const colHeaderBg = document.createElementNS(SVG_NS, 'rect');
  setAttrs(colHeaderBg, {
    x: cardX + 1,
    y: colHeaderBgY,
    width: cardW - 2,
    height: COLUMN_HEADER_H,
    fill: palette.bgSubtle,
  });
  layers.cardLayer.appendChild(colHeaderBg);

  const columnsById = new Map<string, ColumnRec>();
  const columns: ColumnRec[] = [];
  for (let i = 0; i < t.columns.length; i += 1) {
    const c = t.columns[i]!;
    const x0 = innerLeft + columnW * i;
    const cx = x0 + columnW / 2;
    const cy = colHeaderBgY + COLUMN_HEADER_H / 2 + 3.5;

    // 헤더 텍스트 (PK 면 굵게 + 밑줄).
    const headerEl = document.createElementNS(SVG_NS, 'text');
    setAttrs(headerEl, {
      x: cx,
      y: cy,
      'text-anchor': 'middle',
      fill: palette.text,
      'font-size': fontSizes.xs,
      'font-family': fonts.body,
    });
    headerEl.textContent = c.label;
    layers.cardLayer.appendChild(headerEl);

    // alt 라벨 (대체키 표지) — 헤더 텍스트 우측에 작은 글씨.
    const altLabelEl = document.createElementNS(SVG_NS, 'text');
    setAttrs(altLabelEl, {
      x: x0 + columnW - 4,
      y: cy - 6,
      'text-anchor': 'end',
      fill: palette.textMuted,
      'font-size': '8px',
      'font-family': fonts.body,
      opacity: '0',
    });
    altLabelEl.textContent = 'alt';
    layers.cardLayer.appendChild(altLabelEl);

    // 헤더 좌측 슬롯 열쇠는 행 단위 슬롯에서 다루므로 여기서는 빈 g 만 둔다.
    const headerKeyEl = document.createElementNS(SVG_NS, 'g');
    layers.cardLayer.appendChild(headerKeyEl);

    const colRec: ColumnRec = {
      id: c.id,
      label: c.label,
      kind: c.kind,
      references: c.references ? { ...c.references } : undefined,
      headerEl,
      altLabelEl,
      headerKeyEl,
      x0,
      width: columnW,
    };
    columns.push(colRec);
    columnsById.set(c.id, colRec);

    // 헤더 강조 적용.
    setHeaderEmphasis(colRec, c.kind, 1, palette);
  }

  // 본문 행.
  const bodyTop = colHeaderBgY + COLUMN_HEADER_H;
  const rows: RowRec[] = [];
  for (let r2 = 0; r2 < t.rows.length; r2 += 1) {
    const rowData = t.rows[r2]!;
    const rowY = bodyTop + ROW_H * r2;
    const rowCy = rowY + ROW_H / 2 + 4;

    // zebra.
    const stripeEl = document.createElementNS(SVG_NS, 'rect');
    setAttrs(stripeEl, {
      x: cardX + 1,
      y: rowY,
      width: cardW - 2,
      height: ROW_H,
      fill: r2 % 2 === 0 ? palette.bg : palette.bgSubtle,
      opacity: r2 % 2 === 0 ? '1' : '0.5',
    });
    layers.cardLayer.appendChild(stripeEl);

    const cells = new Map<string, CellRec>();
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i]!;
      const value = rowData.cells[col.id] ?? '';
      const cellX = col.x0;
      const cellW = col.width;
      const cellRightX = cellX + cellW;
      const cellLeftX = cellX;
      const cellCx = cellX + cellW / 2;
      const cellCy = rowY + ROW_H / 2;

      // 호버 강조 사각.
      const bgEl = document.createElementNS(SVG_NS, 'rect');
      setAttrs(bgEl, {
        x: cellX + 1,
        y: rowY + 1,
        width: cellW - 2,
        height: ROW_H - 2,
        fill: tones.highlightTone,
        opacity: '0',
        rx: 2,
        ry: 2,
      });
      layers.cellHighlightLayer.appendChild(bgEl);

      // 같은 값 마커 (글자 뒤 옅은 색).
      const markEl = document.createElementNS(SVG_NS, 'rect');
      setAttrs(markEl, {
        x: cellCx - 18,
        y: rowY + 4,
        width: 36,
        height: ROW_H - 8,
        fill: tones.sameValueTone,
        opacity: '0',
        rx: 2,
        ry: 2,
      });
      layers.sameValueLayer.appendChild(markEl);

      // 텍스트.
      const textEl = document.createElementNS(SVG_NS, 'text');
      setAttrs(textEl, {
        x: cellCx,
        y: rowCy,
        'text-anchor': 'middle',
        fill: palette.text,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      textEl.textContent = value;
      layers.cellTextLayer.appendChild(textEl);

      // 행 단위 키 슬롯 (PK/alt: 채움, FK: 윤곽).
      const rowKeyEl = document.createElementNS(SVG_NS, 'g');
      // 슬롯 위치는 카드 좌측 18px slot 안. 키는 첫 키 컬럼 위치에만 단다 — 컬럼 별로 따로
      // 표시하면 노이즈가 커지므로, 행 좌측 KEY_SLOT 안에 그 행의 PK/alt/FK 표지만 통합으로
      // 표시하는 방식이 cdn/pubsub 의 시각 단순성에 부합.
      // 그러나 기획 §5-2 / §5-3 은 컬럼별 좌측 슬롯에 행마다 키 아이콘이 박힘을 명시.
      // 실용 절충 — 행 단위로는 첫 키 컬럼의 표식만, 컬럼 단위(헤더 좌)에는 표시하지 않고
      // 대신 헤더 텍스트의 굵기 + 밑줄 + 색이 키 컬럼 무게를 짊어진다.
      drawKeyIcon(rowKeyEl, cardX + KEY_SLOT / 2, cellCy + 1, col.kind, tones);
      // 다만 같은 카드 행 내 중복 표시를 피하려면 첫 키 컬럼만 보여줌.
      if (i === 0 || (col.kind !== 'pk' && col.kind !== 'alt' && col.kind !== 'fk')) {
        // 첫 컬럼만 또는 plain 이면 안 보임 처리.
        if (i !== 0) rowKeyEl.setAttribute('opacity', '0');
      }
      layers.cardLayer.appendChild(rowKeyEl);

      const cellRec: CellRec = {
        rowIndex: r2,
        columnId: col.id,
        value,
        bgEl,
        markEl,
        textEl,
        rowKeyEl,
        cx: cellCx,
        cy: cellCy,
        rightX: cellRightX,
        leftX: cellLeftX,
      };
      cells.set(col.id, cellRec);

      // 호버 인터랙션.
      bgEl.setAttribute('pointer-events', 'auto');
      bgEl.style.cursor = 'pointer';
      bgEl.addEventListener('mouseenter', () => onEnter(cellRec, t.id));
      bgEl.addEventListener('mouseleave', () => onLeave(cellRec, t.id));
    }
    rows.push({ rowIndex: r2, cells, stripeEl, cy: rowCy });
  }

  // 거부 인서트 (옅은 회색 줄무늬 + 빨간 좌 보더 + 빨간 X + 안내).
  let rejectRow: RejectRowRec | null = null;
  let rejectMessageEl: SVGTextElement | null = null;
  let rejectBorderEl: SVGRectElement | null = null;
  let rejectXEl: SVGGElement | null = null;
  if (reject) {
    const rejGroup = document.createElementNS(SVG_NS, 'g');
    layers.rejectLayer.appendChild(rejGroup);
    const baseY = bodyTop + ROW_H * t.rows.length + REJECT_GAP;

    // 회색 행 배경.
    const rejBg = document.createElementNS(SVG_NS, 'rect');
    setAttrs(rejBg, {
      x: cardX + 4,
      y: baseY,
      width: cardW - 8,
      height: REJECT_ROW_H,
      fill: palette.bgSubtle,
      opacity: '0.7',
      rx: 3,
      ry: 3,
    });
    rejGroup.appendChild(rejBg);

    // 빨간 좌측 보더.
    rejectBorderEl = document.createElementNS(SVG_NS, 'rect');
    setAttrs(rejectBorderEl, {
      x: cardX + 4,
      y: baseY,
      width: 2,
      height: REJECT_ROW_H,
      fill: palette.danger,
    });
    rejGroup.appendChild(rejectBorderEl);

    // 거부 셀 (셀별 텍스트).
    const rejCells = new Map<string, CellRec>();
    for (let i = 0; i < columns.length; i += 1) {
      const col = columns[i]!;
      const cellX = col.x0;
      const cellW = col.width;
      const cellCx = cellX + cellW / 2;
      const cellCy = baseY + REJECT_ROW_H / 2;
      const value = reject.cells[col.id] ?? '';

      // 빨간 X (failing column).
      if (col.id === reject.failingColumn) {
        const failBox = document.createElementNS(SVG_NS, 'rect');
        setAttrs(failBox, {
          x: cellX + 2,
          y: baseY + 2,
          width: cellW - 4,
          height: REJECT_ROW_H - 4,
          fill: 'none',
          stroke: palette.danger,
          'stroke-width': '1.5',
          rx: 2,
          ry: 2,
        });
        rejGroup.appendChild(failBox);
      }

      const txt = document.createElementNS(SVG_NS, 'text');
      setAttrs(txt, {
        x: cellCx,
        y: cellCy + 4,
        'text-anchor': 'middle',
        fill: col.id === reject.failingColumn ? palette.danger : palette.textMuted,
        'font-size': fontSizes.xs,
        'font-family': fonts.mono,
      });
      txt.textContent = value;
      rejGroup.appendChild(txt);

      rejCells.set(col.id, {
        rowIndex: -1,
        columnId: col.id,
        value,
        bgEl: rejBg,
        markEl: rejBg,
        textEl: txt,
        rowKeyEl: rejGroup,
        cx: cellCx,
        cy: cellCy,
        rightX: cellX + cellW,
        leftX: cellX,
      });
    }

    // 빨간 X 마크 (failing 컬럼 우측).
    const failCol = columns.find((c) => c.id === reject.failingColumn);
    if (failCol) {
      rejectXEl = document.createElementNS(SVG_NS, 'g');
      const xCx = failCol.x0 + failCol.width - 8;
      const xCy = baseY + REJECT_ROW_H / 2;
      const xPath = document.createElementNS(SVG_NS, 'path');
      setAttrs(xPath, {
        d: `M${xCx - 3},${xCy - 3} L${xCx + 3},${xCy + 3} M${xCx + 3},${xCy - 3} L${xCx - 3},${xCy + 3}`,
        stroke: palette.danger,
        'stroke-width': '1.5',
        'stroke-linecap': 'round',
      });
      rejectXEl.appendChild(xPath);
      rejGroup.appendChild(rejectXEl);
    }

    // 안내 메시지 (한 줄).
    rejectMessageEl = document.createElementNS(SVG_NS, 'text');
    setAttrs(rejectMessageEl, {
      x: cardX + 8,
      y: baseY + REJECT_ROW_H + REJECT_MSG_H - 2,
      fill: palette.danger,
      'font-size': '10px',
      'font-family': fonts.body,
    });
    rejectMessageEl.textContent = reject.message;
    rejGroup.appendChild(rejectMessageEl);

    rejectRow = {
      tableId: t.id,
      failingColumn: reject.failingColumn,
      message: reject.message,
      groupEl: rejGroup,
      cells: rejCells,
    };
  }

  return {
    id: t.id,
    label: t.label,
    columns,
    columnsById,
    rows,
    cardX,
    cardY,
    cardW,
    bodyTop,
    rejectRow,
    rejectMessageEl,
    rejectBorderEl,
    rejectXEl,
  };
}

function setHeaderEmphasis(
  col: ColumnRec,
  kind: ColumnKindTok,
  e: number,
  palette: ReturnType<typeof getColors>,
): void {
  // PK / alt: 굵게 + 밑줄. FK: 굵게 + 밑줄. plain: 보통 + 밑줄 없음.
  const isKey = kind === 'pk' || kind === 'alt' || kind === 'fk';
  col.headerEl.setAttribute(
    'font-weight',
    isKey ? (kind === 'pk' ? '700' : '600') : '400',
  );
  col.headerEl.setAttribute(
    'text-decoration',
    isKey ? 'underline' : 'none',
  );
  col.headerEl.setAttribute(
    'fill',
    kind === 'pk' ? palette.text : kind === 'alt' || kind === 'fk' ? palette.text : palette.textMuted,
  );
  col.altLabelEl.setAttribute('opacity', kind === 'alt' ? String(e) : kind === 'pk' ? String(1 - e) : '0');
  col.kind = kind;
}

function setRowKeyVisual(
  rowKeyEl: SVGGElement,
  kind: ColumnKindTok,
  _e: number,
  palette: ReturnType<typeof getColors>,
  altTone: string,
  fkTone: string,
  pkTone: string,
): void {
  // 기존 path 제거 후 새로 그림.
  rowKeyEl.textContent = '';
  // 위치 정보를 잃지 않기 위해 g 의 transform 을 살린다 (drawKeyIcon 이 절대 좌표로 그렸으므로
  // 여기서 동일 위치를 다시 그리려면 위치를 보존해야 한다 — 보존을 위해 data-cx/cy 속성에
  // 미리 저장해둔 값을 활용).
  const cx = Number(rowKeyEl.getAttribute('data-cx') ?? '0');
  const cy = Number(rowKeyEl.getAttribute('data-cy') ?? '0');
  drawKeyIcon(rowKeyEl, cx, cy, kind, {
    palette,
    pkTone,
    fkTone,
    altTone,
    sameValueTone: '',
    highlightTone: '',
  });
}

function drawKeyIcon(
  g: SVGGElement,
  cx: number,
  cy: number,
  kind: ColumnKindTok,
  tones: DrawTones,
): void {
  // 위치 보존 — setRowKeyVisual 가 다시 그릴 때 사용.
  g.setAttribute('data-cx', String(cx));
  g.setAttribute('data-cy', String(cy));
  if (kind === 'plain') {
    g.textContent = '';
    return;
  }
  // 작은 열쇠 아이콘 — 타원 머리 + 짧은 손잡이 + 한 톱니.
  const headR = 2.4;
  const stemX2 = cx + 5;
  const stemY = cy;
  const fillTone = kind === 'pk' ? tones.pkTone : kind === 'alt' ? tones.altTone : tones.fkTone;
  const isHollow = kind === 'fk';

  const head = document.createElementNS(SVG_NS, 'circle');
  setAttrs(head, {
    cx: cx,
    cy: cy,
    r: headR,
    fill: isHollow ? 'none' : fillTone,
    stroke: fillTone,
    'stroke-width': '1.2',
  });
  g.appendChild(head);

  const stem = document.createElementNS(SVG_NS, 'line');
  setAttrs(stem, {
    x1: cx + headR,
    y1: stemY,
    x2: stemX2,
    y2: stemY,
    stroke: fillTone,
    'stroke-width': '1.4',
    'stroke-linecap': 'round',
  });
  g.appendChild(stem);

  const tooth = document.createElementNS(SVG_NS, 'line');
  setAttrs(tooth, {
    x1: stemX2 - 1.5,
    y1: stemY,
    x2: stemX2 - 1.5,
    y2: stemY + 2,
    stroke: fillTone,
    'stroke-width': '1.4',
    'stroke-linecap': 'round',
  });
  g.appendChild(tooth);
}

function drawRelation(
  rel: { id: string; from: { tableId: string; columnId: string }; to: { tableId: string; columnId: string } },
  tables: Map<string, TableRec>,
  layer: SVGGElement,
  palette: ReturnType<typeof getColors>,
): RelationRec | null {
  const fromTbl = tables.get(rel.from.tableId);
  const toTbl = tables.get(rel.to.tableId);
  if (!fromTbl || !toTbl) return null;

  const path = document.createElementNS(SVG_NS, 'path');
  setAttrs(path, {
    d: '',
    fill: 'none',
    stroke: palette.text,
    'stroke-width': '1.5',
    'stroke-opacity': '0.55',
  });
  layer.appendChild(path);

  const startMark = document.createElementNS(SVG_NS, 'g');
  layer.appendChild(startMark);
  const endMark = document.createElementNS(SVG_NS, 'g');
  layer.appendChild(endMark);

  const rec: RelationRec = {
    id: rel.id,
    fromTableId: rel.from.tableId,
    fromColumnId: rel.from.columnId,
    toTableId: rel.to.tableId,
    toColumnId: rel.to.columnId,
    pathEl: path,
    startMarkEl: startMark,
    endMarkEl: endMark,
  };

  updateRelationPath(rec, tables, palette);
  return rec;
}

function updateRelationPath(
  rel: RelationRec,
  tables: Map<string, TableRec>,
  palette: ReturnType<typeof getColors>,
): void {
  const fromTbl = tables.get(rel.fromTableId);
  const toTbl = tables.get(rel.toTableId);
  if (!fromTbl || !toTbl) return;

  const fromCol = fromTbl.columnsById.get(rel.fromColumnId);
  const toCol = toTbl.columnsById.get(rel.toColumnId);
  if (!fromCol || !toCol) return;

  // PK 컬럼 우측 끝 (좌 카드라면 컬럼 우측, 우 카드라면 컬럼 좌측).
  const fromIsLeftCard = fromTbl.cardX < toTbl.cardX;
  const startX = fromIsLeftCard ? fromCol.x0 + fromCol.width : fromCol.x0;
  const startY = fromTbl.bodyTop + ROW_H * 0 - 2; // 헤더 줄 약간 위
  // FK 컬럼 좌측 끝 (반대편 카드).
  const endX = fromIsLeftCard ? toCol.x0 : toCol.x0 + toCol.width;
  const endY = toTbl.bodyTop + ROW_H * 0 - 2;

  const cp1X = startX + (endX - startX) * 0.5;
  const cp1Y = startY - 28;
  const cp2X = startX + (endX - startX) * 0.5;
  const cp2Y = endY - 28;

  rel.pathEl.setAttribute(
    'd',
    `M${startX},${startY} C${cp1X},${cp1Y} ${cp2X},${cp2Y} ${endX},${endY}`,
  );

  // Crow's Foot 카디널리티 — 시작은 "정확히 하나" (짧은 두 줄), 끝은 "여럿" (까마귀 발).
  drawCardinalityOne(rel.startMarkEl, startX, startY, fromIsLeftCard ? 1 : -1, palette);
  drawCardinalityMany(rel.endMarkEl, endX, endY, fromIsLeftCard ? -1 : 1, palette);
}

function drawCardinalityOne(
  g: SVGGElement,
  x: number,
  y: number,
  dir: number,
  palette: ReturnType<typeof getColors>,
): void {
  g.textContent = '';
  // 짧은 평행 두 줄 — 곡선 끝점에서 안쪽으로 dx 만큼.
  const baseX = x + dir * 6;
  const stroke = palette.textMuted;
  const v1 = document.createElementNS(SVG_NS, 'line');
  setAttrs(v1, {
    x1: baseX,
    y1: y - 4,
    x2: baseX,
    y2: y + 4,
    stroke,
    'stroke-width': '1.5',
  });
  g.appendChild(v1);
  const v2 = document.createElementNS(SVG_NS, 'line');
  setAttrs(v2, {
    x1: baseX + dir * 4,
    y1: y - 4,
    x2: baseX + dir * 4,
    y2: y + 4,
    stroke,
    'stroke-width': '1.5',
  });
  g.appendChild(v2);
}

function drawCardinalityMany(
  g: SVGGElement,
  x: number,
  y: number,
  dir: number,
  palette: ReturnType<typeof getColors>,
): void {
  g.textContent = '';
  // 까마귀 발 세 줄 — 한 점에서 세 방향으로 갈라짐.
  const stroke = palette.textMuted;
  const apexX = x + dir * 2;
  const apexY = y;
  for (const dy of [-5, 0, 5]) {
    const ln = document.createElementNS(SVG_NS, 'line');
    setAttrs(ln, {
      x1: apexX,
      y1: apexY,
      x2: apexX + dir * 8,
      y2: apexY + dy,
      stroke,
      'stroke-width': '1.5',
      'stroke-linecap': 'round',
    });
    g.appendChild(ln);
  }
}

function drawLegend(
  g: SVGGElement,
  palette: ReturnType<typeof getColors>,
  pkTone: string,
  fkTone: string,
  altTone: string,
): void {
  const items: Array<{ kind: ColumnKindTok | 'one' | 'many'; label: string }> = [
    { kind: 'pk', label: '🔑 PK 기본키' },
    { kind: 'alt', label: '🔑 alt 대체키' },
    { kind: 'fk', label: '⚷ FK 외래키' },
    { kind: 'one', label: '─┤ 정확히 하나' },
    { kind: 'many', label: '─< 여럿' },
  ];
  const startX = 28;
  const y = LEGEND_Y;
  let x = startX;
  for (const it of items) {
    const groupItem = document.createElementNS(SVG_NS, 'g');
    g.appendChild(groupItem);
    if (it.kind === 'pk' || it.kind === 'alt' || it.kind === 'fk') {
      const keyG = document.createElementNS(SVG_NS, 'g');
      groupItem.appendChild(keyG);
      drawKeyIcon(keyG, x, y, it.kind, {
        palette,
        pkTone,
        fkTone,
        altTone,
        sameValueTone: '',
        highlightTone: '',
      });
      const lab = document.createElementNS(SVG_NS, 'text');
      setAttrs(lab, {
        x: x + 12,
        y: y + 4,
        fill: palette.textMuted,
        'font-size': '10px',
        'font-family': fonts.body,
      });
      lab.textContent =
        it.kind === 'pk' ? 'PK 기본키' : it.kind === 'alt' ? 'alt 대체키' : 'FK 외래키';
      groupItem.appendChild(lab);
      x += 92;
    } else if (it.kind === 'one') {
      const oneG = document.createElementNS(SVG_NS, 'g');
      drawCardinalityOne(oneG, x + 10, y, -1, palette);
      groupItem.appendChild(oneG);
      const lab = document.createElementNS(SVG_NS, 'text');
      setAttrs(lab, {
        x: x + 18,
        y: y + 4,
        fill: palette.textMuted,
        'font-size': '10px',
        'font-family': fonts.body,
      });
      lab.textContent = '정확히 하나';
      groupItem.appendChild(lab);
      x += 100;
    } else {
      const manyG = document.createElementNS(SVG_NS, 'g');
      drawCardinalityMany(manyG, x + 8, y, 1, palette);
      groupItem.appendChild(manyG);
      const lab = document.createElementNS(SVG_NS, 'text');
      setAttrs(lab, {
        x: x + 22,
        y: y + 4,
        fill: palette.textMuted,
        'font-size': '10px',
        'font-family': fonts.body,
      });
      lab.textContent = '여럿';
      groupItem.appendChild(lab);
      x += 70;
    }
  }

  // 레퍼런스 라벨 (옅은 한 줄).
  const refs = document.createElementNS(SVG_NS, 'text');
  setAttrs(refs, {
    x: W - 12,
    y: LEGEND_Y + 36,
    'text-anchor': 'end',
    fill: palette.textMuted,
    'font-size': '9px',
    'font-family': fonts.body,
  });
  refs.textContent =
    "참고: Wikipedia · Crow's Foot · dbdiagram.io · 위키백과(외래 키)";
  g.appendChild(refs);
}
