/**
 * reactive-updates 의 stage — 값 카드 여덟 · 뷰 카드 넷 · 모아 두는 상자 · 커서.
 *
 * 운동:
 *  - 첫 돌기: 값→뷰 SVG 선이 하나씩 그어진다 (x2/y2 를 시작점에서 도착점까지
 *    CSS transition 으로 늘린다).
 *  - 줄·곧바로: 값 카드가 반짝이고, 그 줄 위를 작은 점이 값→뷰로 이동한 뒤
 *    뷰의 출력이 바뀐다.
 *  - 줄·모아서: 값이 상자 쪽으로 미끄러져 들어가는 칩이 되고, 처리기 끝에
 *    상자가 비워지며(칩 제거) 뷰들이 한꺼번에 반짝인다.
 *  - 훑기: 커서가 값 카드를 위에서 아래로 순서대로 훑고 지나간다.
 *
 * 애니메이션은 전부 선언적 CSS transition 이다 — projector 가 부르는 메서드는
 * 값을 동기로 반영하고 즉시 돌아온다(대기하는 Promise 를 만들지 않는다).
 * 재생 속도는 projector 가 호출마다 `durationMs` 로 넘긴다.
 */

import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  radii,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { ReactiveUpdatesData } from './algorithm.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 620;
const CANVAS_H = 490;

const VALUE_X = 40;
const VALUE_W = 170;
const VALUE_H = 34;
const VALUE_GAP = 10;
const ROWS_START_Y = 54;

const VIEW_X = 420;
const VIEW_W = 170;
const VIEW_H = 68;
const VIEW_GAP = 20;

const BOX_X = 40;
const BOX_Y = 406;
const BOX_W = 380;
const BOX_H = 56;
const CHIP_W = 56;
const CHIP_H = 30;

const CURSOR_X = VALUE_X - 20;

type ValueRow = { rect: SVGRectElement; label: SVGTextElement; text: SVGTextElement; y: number };
type ViewRow = { rect: SVGRectElement; label: SVGTextElement; text: SVGTextElement; y: number };

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag);
}

export type ReactiveUpdatesStageInstance = ViewInstance & {
  subscribe(value: string, view: string, durationMs: number): void;
  renderView(view: string, text: string, mode: 'init' | 'sync' | 'flush' | 'scan', via: string | undefined, durationMs: number): void;
  stash(name: string, value: string, durationMs: number): void;
  flush(count: number, durationMs: number): void;
  scanTick(index: number, name: string, changed: boolean, durationMs: number): void;
  setCaption(text: string): void;
};

export const reactiveUpdatesStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ReactiveUpdatesStageInstance {
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;

    const linesLayer = el('g');
    const valuesLayer = el('g');
    const viewsLayer = el('g');
    const boxLayer = el('g');
    const cursorLayer = el('g');
    const pulseLayer = el('g');
    svg.append(linesLayer, boxLayer, valuesLayer, viewsLayer, cursorLayer, pulseLayer);

    const caption = el('text');
    caption.setAttribute('x', '20');
    caption.setAttribute('y', '22');
    caption.setAttribute('font-size', fontSizes.sm);
    caption.setAttribute('font-family', fonts.body);
    caption.setAttribute('fill', colors.textMuted);
    svg.appendChild(caption);

    const valuesLabel = el('text');
    valuesLabel.setAttribute('x', String(VALUE_X));
    valuesLabel.setAttribute('y', '44');
    valuesLabel.setAttribute('font-size', fontSizes.xs);
    valuesLabel.setAttribute('font-family', fonts.body);
    valuesLabel.setAttribute('fill', colors.textMuted);
    valuesLabel.textContent = t('label.values', 'Values');
    svg.appendChild(valuesLabel);

    const viewsLabel = el('text');
    viewsLabel.setAttribute('x', String(VIEW_X));
    viewsLabel.setAttribute('y', '44');
    viewsLabel.setAttribute('font-size', fontSizes.xs);
    viewsLabel.setAttribute('font-family', fonts.body);
    viewsLabel.setAttribute('fill', colors.textMuted);
    viewsLabel.textContent = t('label.views', 'Views');
    svg.appendChild(viewsLabel);

    const boxRect = el('rect');
    boxRect.setAttribute('x', String(BOX_X));
    boxRect.setAttribute('y', String(BOX_Y));
    boxRect.setAttribute('width', String(BOX_W));
    boxRect.setAttribute('height', String(BOX_H));
    boxRect.setAttribute('rx', radii.md);
    boxRect.setAttribute('fill', colors.bgSubtle);
    boxRect.setAttribute('stroke', colors.border);
    boxLayer.appendChild(boxRect);

    const boxLabel = el('text');
    boxLabel.setAttribute('x', String(BOX_X));
    boxLabel.setAttribute('y', String(BOX_Y - 8));
    boxLabel.setAttribute('font-size', fontSizes.xs);
    boxLabel.setAttribute('font-family', fonts.body);
    boxLabel.setAttribute('fill', colors.textMuted);
    boxLabel.textContent = t('label.batchBox', 'Batched');
    boxLayer.appendChild(boxLabel);

    const cursor = el('rect');
    cursor.setAttribute('x', String(CURSOR_X));
    cursor.setAttribute('width', '10');
    cursor.setAttribute('height', String(VALUE_H));
    cursor.setAttribute('rx', radii.sm);
    cursor.setAttribute('fill', colors.accent);
    cursor.setAttribute('y', String(ROWS_START_Y));
    cursor.style.opacity = '0';
    cursorLayer.appendChild(cursor);

    const valueRows = new Map<string, ValueRow>();
    const viewRows = new Map<string, ViewRow>();
    const lineEls = new Map<string, SVGLineElement>();
    const chipEls = new Map<string, SVGGElement>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, Math.max(0, ms));
      timers.add(id);
    }

    function setTransition(node: SVGElement, props: string, ms: number): void {
      node.style.transition = `${props} ${Math.max(0, ms)}ms linear`;
    }

    const data = params.initialData as Partial<ReactiveUpdatesData> | undefined;
    if (data && Array.isArray(data.values) && Array.isArray(data.views)) {
      data.values.forEach((entry, i) => {
        const y = ROWS_START_Y + i * (VALUE_H + VALUE_GAP);
        const g = el('g');
        const rect = el('rect');
        rect.setAttribute('x', String(VALUE_X));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(VALUE_W));
        rect.setAttribute('height', String(VALUE_H));
        rect.setAttribute('rx', radii.sm);
        rect.setAttribute('fill', colors.itemDefault);
        rect.setAttribute('stroke', colors.border);
        setTransition(rect, 'fill, stroke', 400);
        const label = el('text');
        label.setAttribute('x', String(VALUE_X + 8));
        label.setAttribute('y', String(y + 14));
        label.setAttribute('font-size', fontSizes.xs);
        label.setAttribute('font-family', fonts.body);
        label.setAttribute('fill', colors.textMuted);
        label.textContent = entry.name;
        const text = el('text');
        text.setAttribute('x', String(VALUE_X + 8));
        text.setAttribute('y', String(y + 28));
        text.setAttribute('font-size', fontSizes.md);
        text.setAttribute('font-family', fonts.mono);
        text.setAttribute('fill', colors.text);
        text.textContent = String(entry.value);
        g.append(rect, label, text);
        valuesLayer.appendChild(g);
        valueRows.set(entry.name, { rect, label, text, y: y + VALUE_H / 2 });
      });

      data.views.forEach((entry, j) => {
        const y = ROWS_START_Y + j * (VIEW_H + VIEW_GAP);
        const g = el('g');
        const rect = el('rect');
        rect.setAttribute('x', String(VIEW_X));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(VIEW_W));
        rect.setAttribute('height', String(VIEW_H));
        rect.setAttribute('rx', radii.sm);
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.primary);
        setTransition(rect, 'fill', 400);
        const label = el('text');
        label.setAttribute('x', String(VIEW_X + 10));
        label.setAttribute('y', String(y + 18));
        label.setAttribute('font-size', fontSizes.xs);
        label.setAttribute('font-family', fonts.body);
        label.setAttribute('fill', colors.textMuted);
        label.textContent = entry.name;
        const text = el('text');
        text.setAttribute('x', String(VIEW_X + 10));
        text.setAttribute('y', String(y + 42));
        text.setAttribute('font-size', fontSizes.lg);
        text.setAttribute('font-family', fonts.mono);
        text.setAttribute('fill', colors.text);
        text.textContent = '';
        g.append(rect, label, text);
        viewsLayer.appendChild(g);
        viewRows.set(entry.name, { rect, label, text, y: y + VIEW_H / 2 });
      });
    }

    function lineKey(value: string, view: string): string {
      return `${value}\u0000${view}`;
    }

    function flashRect(rect: SVGRectElement, color: string, base: string, durationMs: number): void {
      rect.setAttribute('fill', color);
      later(() => rect.setAttribute('fill', base), durationMs);
    }

    return {
      destroy(): void {
        for (const id of timers) clearTimeout(id);
        timers.clear();
      },

      subscribe(value: string, view: string, durationMs: number): void {
        const vRow = valueRows.get(value);
        const wRow = viewRows.get(view);
        if (!vRow || !wRow) return;
        const x1 = VALUE_X + VALUE_W;
        const y1 = vRow.y;
        const x2 = VIEW_X;
        const y2 = wRow.y;
        const line = el('line');
        line.setAttribute('x1', String(x1));
        line.setAttribute('y1', String(y1));
        line.setAttribute('x2', String(x1));
        line.setAttribute('y2', String(y1));
        line.setAttribute('stroke', colors.border);
        line.setAttribute('stroke-width', '1.5');
        linesLayer.appendChild(line);
        lineEls.set(lineKey(value, view), line);
        // 다음 프레임에 목표 지점으로 옮겨 transition 이 실제로 걸리게 한다.
        later(() => {
          setTransition(line, 'x2, y2', durationMs);
          line.setAttribute('x2', String(x2));
          line.setAttribute('y2', String(y2));
        }, 16);
      },

      renderView(view: string, text: string, mode: 'init' | 'sync' | 'flush' | 'scan', via: string | undefined, durationMs: number): void {
        const wRow = viewRows.get(view);
        if (!wRow) return;
        if (mode === 'sync' && via !== undefined) {
          const vRow = valueRows.get(via);
          const line = lineEls.get(lineKey(via, view));
          if (vRow && line) {
            flashRect(vRow.rect, colors.itemActive, colors.itemDefault, durationMs);
            const pulse = el('circle');
            pulse.setAttribute('r', '5');
            pulse.setAttribute('fill', colors.accent);
            pulse.setAttribute('cx', String(VALUE_X + VALUE_W));
            pulse.setAttribute('cy', String(vRow.y));
            pulseLayer.appendChild(pulse);
            later(() => {
              setTransition(pulse, 'cx, cy', durationMs);
              pulse.setAttribute('cx', String(VIEW_X));
              pulse.setAttribute('cy', String(wRow.y));
            }, 16);
            later(() => pulse.remove(), durationMs + 40);
          }
        }
        wRow.text.textContent = text;
        flashRect(wRow.rect, colors.itemActive, colors.bg, durationMs);
      },

      stash(name: string, value: string, durationMs: number): void {
        const vRow = valueRows.get(name);
        if (!vRow) return;
        flashRect(vRow.rect, colors.itemActive, colors.itemDefault, durationMs);
        const chip = el('g');
        const rect = el('rect');
        const idxInBox = chipEls.size;
        const cx = BOX_X + 10 + idxInBox * (CHIP_W + 8);
        rect.setAttribute('x', String(VALUE_X + VALUE_W / 2));
        rect.setAttribute('y', String(vRow.y - CHIP_H / 2));
        rect.setAttribute('width', String(CHIP_W));
        rect.setAttribute('height', String(CHIP_H));
        rect.setAttribute('rx', radii.sm);
        rect.setAttribute('fill', colors.itemActive);
        setTransition(rect, 'x, y', durationMs);
        const text = el('text');
        text.setAttribute('x', String(VALUE_X + VALUE_W / 2 + 6));
        text.setAttribute('y', String(vRow.y - CHIP_H / 2 + 20));
        text.setAttribute('font-size', fontSizes.xs);
        text.setAttribute('font-family', fonts.mono);
        text.setAttribute('fill', colors.stateInk);
        text.textContent = value;
        chip.append(rect, text);
        boxLayer.appendChild(chip);
        chipEls.set(name, chip);
        later(() => {
          rect.setAttribute('x', String(cx));
          rect.setAttribute('y', String(BOX_Y + (BOX_H - CHIP_H) / 2));
        }, 16);
      },

      flush(_count: number, durationMs: number): void {
        for (const chip of chipEls.values()) {
          const rect = chip.querySelector('rect');
          if (rect) {
            setTransition(rect as unknown as SVGElement, 'opacity', durationMs);
            (rect as SVGRectElement).style.opacity = '0';
          }
        }
        const toRemove = [...chipEls.values()];
        chipEls.clear();
        later(() => {
          for (const chip of toRemove) chip.remove();
        }, durationMs + 20);
      },

      scanTick(index: number, name: string, changed: boolean, durationMs: number): void {
        setTransition(cursor, 'y', durationMs);
        cursor.style.opacity = '1';
        const row = valueRows.get(name);
        cursor.setAttribute('y', String(ROWS_START_Y + index * (VALUE_H + VALUE_GAP)));
        if (changed && row) flashRect(row.rect, colors.itemComparing, colors.itemDefault, durationMs);
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },
    };
  },
};
