/**
 * height-stays-low-stage — 자식 수가 다른 두 나무가 같은 잎 수를 각자 덮어
 * 내려가는 모습을 그린다 (S-piece).
 *
 * 두 세로 사다리(칸)를 나란히 두고, 칸마다 층을 한 행씩 쌓는다. 행 수 자체가
 * 그 나무가 목표에 닿기까지 밟는 층수 — 즉 나무 높이 — 라서, 자식이 적은 칸은
 * 행이 많아 사다리가 길고 자식이 많은 칸은 행이 적어 짧다. 걸음마다 그 칸의
 * 커서가 한 행 아래로 실제로 이동하고(translateY), 그 행의 막대가 이 층이
 * 덮는 잎 수만큼 자란다(width). 두 운동 다 opacity 가 아니라 위치·크기다.
 *
 * 사다리 행 수(=levels)는 target·branchA·branchB 로부터 결정되는 순수 계산
 * 값이라, algorithm.ts 의 levelsToReach 와 같은 식을 여기서도 계산한다 —
 * 레이아웃(칸 높이)을 잡기 위한 기하 목적일 뿐 알고리즘 로직의 재구현이
 * 아니다. 두 파일이 같은 공개 초기값(target/branchA/branchB)에서 같은 결과를
 * 내는 것은 우연이 아니라 그 값들이 실제로 층수를 결정하는 값이기 때문이다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, categorical, fonts, fontSizes, radii, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

type TreeId = 'branchA' | 'branchB';

type InitialShape = {
  target: number;
  branchA: number;
  branchB: number;
};

function readInitialData(raw: Record<string, unknown> | undefined): InitialShape {
  const target = typeof raw?.target === 'number' ? raw.target : 0;
  const branchA = typeof raw?.branchA === 'number' ? raw.branchA : 2;
  const branchB = typeof raw?.branchB === 'number' ? raw.branchB : 2;
  return { target, branchA, branchB };
}

/** algorithm.ts 의 동일 계산 — 순수 기하 목적의 의도적 중복 (파일 상단 주석 참조). */
function levelsToReach(children: number, target: number): number {
  let level = 1;
  let covered = 1;
  while (covered < target) {
    level += 1;
    covered *= children;
  }
  return level;
}

/** 자릿점 서식. locale 은 마운트 때 받은 것을 쓴다 — 'en-US' 로 굳히지 않는다. */
function formatCount(n: number, locale?: string): string {
  return n.toLocaleString(locale);
}

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

const ROW_H = 18;
const HEADER_H = 30;
const TOP_PAD = 14;
const CAPTION_H = 46;
const BOTTOM_PAD = 14;
const SIDE_PAD = 20;
const COL_GAP = 24;
const GUTTER_W = 18;
const LEVEL_W = 22;
const COUNT_W = 78;
const GAP = 6;
const BAR_H = 10;

export const heightStaysLowStageView: CanvasView = {
  canvas: { height: 480 },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    container.textContent = '';
    const colors = getColors(params.theme);
    const svg = params.canvas;

    const W = PIECE_CANVAS_W;
    const { target, branchA, branchB } = readInitialData(params.initialData);
    const levelsA = levelsToReach(branchA, target);
    const levelsB = levelsToReach(branchB, target);
    const maxLevels = Math.max(levelsA, levelsB);

    const H = TOP_PAD + HEADER_H + maxLevels * ROW_H + CAPTION_H + BOTTOM_PAD;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const colW = (W - SIDE_PAD * 2 - COL_GAP) / 2;
    const colXA = SIDE_PAD;
    const colXB = SIDE_PAD + colW + COL_GAP;
    const barMaxW = colW - GUTTER_W - LEVEL_W - GAP - COUNT_W - GAP;
    const rowTop = TOP_PAD + HEADER_H;

    const rowY = (level: number) => rowTop + (level - 1) * ROW_H;
    const rowCenterY = (level: number) => rowY(level) + ROW_H / 2;

    const identity = categorical(2, 'vivid');
    const colorA = identity[0]!;
    const colorB = identity[1]!;

    const root = document.createElement('div');
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.boxSizing = 'border-box';
    root.style.fontFamily = fonts.body;
    svg.style.display = 'block';
    root.appendChild(svg);
    container.appendChild(root);

    type Column = {
      treeId: TreeId;
      colX: number;
      levels: number;
      color: string;
      rows: {
        outline: SVGRectElement;
        fillBar: SVGRectElement;
        levelText: SVGTextElement;
        countText: SVGTextElement;
      }[];
      marker: SVGCircleElement;
    };

    function buildColumn(treeId: TreeId, colX: number, levels: number, color: string, branch: number): Column {
      const g = el('g');
      g.setAttribute('class', `hsl-col hsl-col--${treeId}`);
      svg.appendChild(g);

      // 헤더: 정체성 점 + "×n" 표식.
      const dot = el('circle');
      dot.setAttribute('cx', String(colX + GUTTER_W + 5));
      dot.setAttribute('cy', String(TOP_PAD + 9));
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', color);
      g.appendChild(dot);

      const headerText = el('text');
      headerText.setAttribute('x', String(colX + GUTTER_W + 16));
      headerText.setAttribute('y', String(TOP_PAD + 13));
      headerText.setAttribute('font-family', fonts.mono);
      headerText.setAttribute('font-size', fontSizes.sm);
      headerText.setAttribute('fill', colors.text);
      headerText.textContent = `×${branch}`;
      g.appendChild(headerText);

      const contentX = colX + GUTTER_W;
      const rows: Column['rows'] = [];
      for (let level = 1; level <= levels; level++) {
        const cy = rowCenterY(level);

        const outline = el('rect');
        outline.setAttribute('x', String(contentX + LEVEL_W + GAP));
        outline.setAttribute('y', String(cy - BAR_H / 2));
        outline.setAttribute('width', String(barMaxW));
        outline.setAttribute('height', String(BAR_H));
        outline.setAttribute('rx', radii.sm.replace('px', ''));
        outline.setAttribute('fill', colors.bgSubtle);
        outline.setAttribute('stroke', colors.border);
        outline.setAttribute('stroke-width', '1');
        g.appendChild(outline);

        const fillBar = el('rect');
        fillBar.setAttribute('x', String(contentX + LEVEL_W + GAP));
        fillBar.setAttribute('y', String(cy - BAR_H / 2));
        fillBar.setAttribute('width', '0');
        fillBar.setAttribute('height', String(BAR_H));
        fillBar.setAttribute('rx', radii.sm.replace('px', ''));
        fillBar.setAttribute('fill', color);
        fillBar.style.transition = 'width 360ms ease, fill 200ms ease';
        g.appendChild(fillBar);

        const levelText = el('text');
        levelText.setAttribute('x', String(contentX));
        levelText.setAttribute('y', String(cy + 3));
        levelText.setAttribute('font-family', fonts.mono);
        levelText.setAttribute('font-size', fontSizes.xs);
        levelText.setAttribute('fill', colors.textMuted);
        levelText.textContent = String(level);
        g.appendChild(levelText);

        const countText = el('text');
        countText.setAttribute('x', String(colX + colW));
        countText.setAttribute('y', String(cy + 3));
        countText.setAttribute('text-anchor', 'end');
        countText.setAttribute('font-family', fonts.mono);
        countText.setAttribute('font-size', fontSizes.xs);
        countText.setAttribute('fill', colors.textMuted);
        countText.textContent = '—';
        g.appendChild(countText);

        rows.push({ outline, fillBar, levelText, countText });
      }

      const marker = el('circle');
      marker.setAttribute('cx', String(colX + GUTTER_W / 2));
      marker.setAttribute('r', '4');
      marker.setAttribute('fill', color);
      marker.style.transition = 'transform 380ms ease, opacity 200ms ease';
      marker.style.transform = `translateY(${rowY(1) - 6}px)`;
      marker.style.opacity = '0.35';
      g.appendChild(marker);

      return { treeId, colX, levels, color, rows, marker };
    }

    const columns: Record<TreeId, Column> = {
      branchA: buildColumn('branchA', colXA, levelsA, colorA, branchA),
      branchB: buildColumn('branchB', colXB, levelsB, colorB, branchB),
    };

    const captionText = el('text');
    captionText.setAttribute('x', String(W / 2));
    captionText.setAttribute('text-anchor', 'middle');
    captionText.setAttribute('font-family', fonts.body);
    captionText.setAttribute('font-size', fontSizes.sm);
    captionText.setAttribute('fill', colors.text);
    svg.appendChild(captionText);

    function setCaption(text: string): void {
      captionText.textContent = '';
      const maxChars = 60;
      const words = text.split(' ');
      const lines: string[] = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length > maxChars && cur) {
          lines.push(cur);
          cur = w;
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);
      const baseY = TOP_PAD + HEADER_H + maxLevels * ROW_H + 20;
      lines.forEach((line, i) => {
        const tspan = el('tspan');
        tspan.setAttribute('x', String(W / 2));
        tspan.setAttribute('y', String(baseY + i * 16));
        tspan.textContent = line;
        captionText.appendChild(tspan);
      });
    }

    function resetColumn(col: Column): void {
      for (const row of col.rows) {
        row.fillBar.setAttribute('width', '0');
        row.fillBar.setAttribute('fill', col.color);
        row.outline.setAttribute('stroke', colors.border);
        row.countText.textContent = '—';
        row.countText.setAttribute('fill', colors.textMuted);
      }
      col.marker.style.transform = `translateY(${rowY(1) - 6}px)`;
      col.marker.style.opacity = '0.35';
    }

    function resetView(payload: { caption: string }): void {
      resetColumn(columns.branchA);
      resetColumn(columns.branchB);
      setCaption(payload.caption);
    }

    function descend(payload: { treeId: TreeId; level: number; covered: number; arrived: boolean }): void {
      const col = columns[payload.treeId];
      const row = col.rows[payload.level - 1];
      if (!row) return;
      const frac = target > 1 ? Math.min(1, Math.log10(Math.max(1, payload.covered)) / Math.log10(target)) : 1;
      row.fillBar.setAttribute('width', String(Math.max(0, frac * barMaxW)));
      row.countText.textContent = formatCount(payload.covered, params.locale);
      if (payload.arrived) {
        row.fillBar.setAttribute('fill', colors.accent);
        row.outline.setAttribute('stroke', colors.accent);
      }
      // 셈은 막대 바깥, 캔버스 배경 위에 있다. 닿은 층이라고 textInverse 로
      // 바꾸면 배경과 같은 색이 되어 하필 결론이 되는 숫자만 사라진다.
      // (success 는 text 와 값이 완전히 같아 강조가 되지 않는다 — 강조는
      //  막대 쪽 accent 가 맡는다.)
      row.countText.setAttribute('fill', colors.text);
      col.marker.style.transform = `translateY(${rowCenterY(payload.level) - 4}px)`;
      col.marker.style.opacity = '1';
    }

    function showResult(payload: { caption: string }): void {
      setCaption(payload.caption);
    }

    return {
      resetView(payload: unknown) {
        resetView(payload as { caption: string });
      },
      descend(payload: unknown) {
        descend(payload as { treeId: TreeId; level: number; covered: number; arrived: boolean });
      },
      showResult(payload: unknown) {
        showResult(payload as { caption: string });
      },
      destroy() {
        // 타이머·리스너는 없다. 다만 붙인 DOM 은 스스로 거둔다 — 러너의 destroy
        // 경로는 컨테이너를 비우지 않으므로, 두면 다시 마운트할 때 남는다.
        root.remove();
      },
    };
  },
};
