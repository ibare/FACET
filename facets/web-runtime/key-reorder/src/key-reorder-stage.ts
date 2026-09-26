/**
 * key-reorder 의 stage — "찾아서 옮긴다" 를 그린다.
 *
 * 세 줄이 위에서 아래로 선다.
 *   1. 새 목록 차례 (q r s p) — 이 차례를 따라 하나씩 처리한다. 지금 보는 자리에 커서.
 *   2. 이름표 표 (키 → 옛 자리) — 걸음 1 에 만들어진다.
 *   3. 실제 목록 — 처음엔 옛 차례(p q r s)그대로. 노드 넷은 한 번도 지워지지 않는다.
 *
 * 걸음마다 점선이 (지금 자리 → 이름표 표 항목 → 실제 노드) 를 잇는다 — "찾는" 동작.
 * 찾은 노드가 이미 알맞은 자리(옛 자리 ≥ lastPlaced)면 그대로 두고, 아니면 실제 줄의
 * 끝으로 **미끄러져** 간다. 그 미끄러짐이 이 조각에서 유일하게 눈에 보이는 이동이다.
 */
import type {
  CanvasView,
  Palette,
  Translate,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';
import { PIECE_CANVAS_W, categorical, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { KeyReorderScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 280;
const MARGIN = 20;
const SLOT_GAP = 16;

const CAPTION_Y = 26;
const NEW_LIST_LABEL_Y = 50;
const PILL_Y0 = 58;
const PILL_H = 28;
const TABLE_LABEL_Y = 104;
const TABLE_Y0 = 112;
const TABLE_H = 24;
const ACTUAL_LABEL_Y = 156;
const ACTUAL_Y0 = 164;
const ACTUAL_H = 60;
const STATS_Y = 254;

const MOVE_DURATION_MS = 650;

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
}

function setText(node: SVGTextElement, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

interface Slots {
  n: number;
  bw: number;
  leftStart: number;
}

function computeSlots(n: number): Slots {
  const available = W - 2 * MARGIN;
  const bw = n > 0 ? Math.min(120, (available - (n - 1) * SLOT_GAP) / n) : 0;
  const total = n * bw + Math.max(0, n - 1) * SLOT_GAP;
  const leftStart = MARGIN + (available - total) / 2;
  return { n, bw, leftStart };
}

function slotX(index: number, slots: Slots): number {
  return slots.leftStart + index * (slots.bw + SLOT_GAP);
}

function indexOf(order: string[], key: string): number {
  return order.indexOf(key);
}

export const keyReorderStageView: CanvasView = {
  canvas: { height: H },
  mount(container, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.textContent = '';

    const t: Translate = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    const caption = el('text');
    caption.setAttribute('x', String(MARGIN));
    caption.setAttribute('y', String(CAPTION_Y));
    caption.setAttribute('font-family', fonts.body);
    caption.setAttribute('font-size', fontSizes.md);
    caption.setAttribute('fill', colors.text);
    svg.appendChild(caption);

    function sectionLabel(y: number): SVGTextElement {
      const label = el('text');
      label.setAttribute('x', String(MARGIN));
      label.setAttribute('y', String(y));
      label.setAttribute('font-family', fonts.body);
      label.setAttribute('font-size', fontSizes.xs);
      label.setAttribute('fill', colors.textMuted);
      svg.appendChild(label);
      return label;
    }

    const newListLabel = sectionLabel(NEW_LIST_LABEL_Y);
    const tableLabel = sectionLabel(TABLE_LABEL_Y);
    const actualLabel = sectionLabel(ACTUAL_LABEL_Y);

    const statsText = el('text');
    statsText.setAttribute('x', String(MARGIN));
    statsText.setAttribute('y', String(STATS_Y));
    statsText.setAttribute('font-family', fonts.body);
    statsText.setAttribute('font-size', fontSizes.sm);
    statsText.setAttribute('fill', colors.textMuted);
    svg.appendChild(statsText);

    const searchLine = el('polyline');
    searchLine.setAttribute('fill', 'none');
    searchLine.setAttribute('stroke', colors.primary);
    searchLine.setAttribute('stroke-width', '1.5');
    searchLine.setAttribute('stroke-dasharray', '4 3');
    searchLine.setAttribute('opacity', '0');
    svg.appendChild(searchLine);

    // 첫 render 에서 scene.oldKeys/newKeys 를 보고 한 번만 짓는다.
    let built = false;
    let pillSlots: Slots;
    let tableSlots: Slots;
    let actualSlots: Slots;
    const pillGroups: SVGGElement[] = [];
    const pillRects: SVGRectElement[] = [];
    const pillTexts: SVGTextElement[] = [];
    const pillDone: SVGCircleElement[] = [];
    const tableGroups: SVGGElement[] = [];
    const tableTexts: SVGTextElement[] = [];
    const tableRects: SVGRectElement[] = [];
    const boxes = new Map<string, SVGGElement>();
    const boxRects = new Map<string, SVGRectElement>();
    let newKeysRef: string[] = [];
    let oldKeysRef: string[] = [];

    function build(scene: KeyReorderScene): void {
      if (built) return;
      built = true;
      newKeysRef = scene.newKeys;
      oldKeysRef = scene.oldKeys;
      const n = scene.oldKeys.length;
      pillSlots = computeSlots(n);
      tableSlots = computeSlots(n);
      actualSlots = computeSlots(n);
      const identity = categorical(Math.max(n, 1), 'vivid');

      for (let i = 0; i < scene.newKeys.length; i += 1) {
        const g = el('g');
        g.setAttribute('transform', `translate(${slotX(i, pillSlots)}, ${PILL_Y0})`);
        const rect = el('rect');
        rect.setAttribute('width', String(pillSlots.bw));
        rect.setAttribute('height', String(PILL_H));
        rect.setAttribute('rx', '6');
        rect.setAttribute('fill', colors.bgSubtle);
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '1.5');
        g.appendChild(rect);
        const txt = el('text');
        txt.setAttribute('x', String(pillSlots.bw / 2));
        txt.setAttribute('y', String(PILL_H / 2 + 5));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-family', fonts.mono);
        txt.setAttribute('font-size', fontSizes.md);
        txt.setAttribute('fill', colors.text);
        setText(txt, scene.newKeys[i] ?? '');
        g.appendChild(txt);
        const done = el('circle');
        done.setAttribute('cx', String(pillSlots.bw - 8));
        done.setAttribute('cy', '8');
        done.setAttribute('r', '3.5');
        done.setAttribute('fill', colors.itemSorted);
        done.setAttribute('opacity', '0');
        g.appendChild(done);
        svg.appendChild(g);
        pillGroups.push(g);
        pillRects.push(rect);
        pillTexts.push(txt);
        pillDone.push(done);
      }

      for (let i = 0; i < scene.oldKeys.length; i += 1) {
        const g = el('g');
        g.setAttribute('transform', `translate(${slotX(i, tableSlots)}, ${TABLE_Y0})`);
        const rect = el('rect');
        rect.setAttribute('width', String(tableSlots.bw));
        rect.setAttribute('height', String(TABLE_H));
        rect.setAttribute('rx', '4');
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '1');
        g.appendChild(rect);
        const txt = el('text');
        txt.setAttribute('x', String(tableSlots.bw / 2));
        txt.setAttribute('y', String(TABLE_H / 2 + 4));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-family', fonts.mono);
        txt.setAttribute('font-size', fontSizes.sm);
        txt.setAttribute('fill', colors.textMuted);
        g.appendChild(txt);
        svg.appendChild(g);
        tableGroups.push(g);
        tableTexts.push(txt);
        tableRects.push(rect);
      }

      for (let i = 0; i < scene.oldKeys.length; i += 1) {
        const key = scene.oldKeys[i];
        if (key === undefined) continue;
        const g = el('g');
        g.setAttribute('transform', `translate(${slotX(i, actualSlots)}, ${ACTUAL_Y0})`);
        const rect = el('rect');
        rect.setAttribute('width', String(actualSlots.bw));
        rect.setAttribute('height', String(ACTUAL_H));
        rect.setAttribute('rx', '8');
        rect.setAttribute('fill', identity[i] ?? colors.itemDefault);
        rect.setAttribute('stroke', colors.border);
        rect.setAttribute('stroke-width', '2');
        g.appendChild(rect);
        const txt = el('text');
        txt.setAttribute('x', String(actualSlots.bw / 2));
        txt.setAttribute('y', String(ACTUAL_H / 2 + 7));
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('font-family', fonts.mono);
        txt.setAttribute('font-size', fontSizes.xl);
        txt.setAttribute('font-weight', '700');
        txt.setAttribute('fill', colors.stateInk);
        setText(txt, key);
        g.appendChild(txt);
        svg.appendChild(g);
        boxes.set(key, g);
        boxRects.set(key, rect);
      }
    }

    function drawStatic(scene: KeyReorderScene): void {
      setText(newListLabel, t('label.newList', 'Target order (walked left to right)'));
      setText(tableLabel, t('label.table', 'Label table (key → old spot)'));
      setText(actualLabel, t('label.actual', 'Actual list (same four nodes throughout)'));

      if (scene.step.kind === 'init') {
        setText(
          caption,
          t(
            'caption.init',
            'Actual list: {old}. It should end up as: {new}.',
            { old: scene.oldKeys.join(' '), new: scene.newKeys.join(' ') },
          ),
        );
      } else if (scene.step.kind === 'buildTable') {
        setText(
          caption,
          t('caption.buildTable', 'Build a label table: each key remembers where it used to be.'),
        );
      } else {
        const { key, action } = scene.step;
        setText(
          caption,
          action === 'stay'
            ? t(
                'caption.stay',
                'Key: {key}. Behind everything placed so far — leave it where it is.',
                { key },
              )
            : t(
                'caption.move',
                'Key: {key}. Ahead of an already-placed spot — slide it to the end.',
                { key },
              ),
        );
      }

      const processedPositions = new Set(scene.processed.map((p) => p.position));
      const activePosition = scene.step.kind === 'process' ? scene.step.position : -1;
      for (let i = 0; i < pillGroups.length; i += 1) {
        const rect = pillRects[i];
        const done = pillDone[i];
        if (!rect || !done) continue;
        rect.setAttribute('stroke', i === activePosition ? colors.primary : colors.border);
        rect.setAttribute('stroke-width', i === activePosition ? '2.5' : '1.5');
        done.setAttribute('opacity', processedPositions.has(i) ? '1' : '0');
      }

      const activeOldIndex = scene.step.kind === 'process' ? scene.step.oldIndex : -1;
      for (let i = 0; i < tableGroups.length; i += 1) {
        const txt = tableTexts[i];
        const rect = tableRects[i];
        if (!txt || !rect) continue;
        if (scene.table) {
          const entry = scene.table[i];
          setText(txt, entry ? t('table.entry', '{key} → {idx}', { key: entry.key, idx: entry.oldIndex }) : '');
        } else {
          setText(txt, t('table.pending', '—'));
        }
        const isActive = scene.step.kind === 'process' && i === activeOldIndex;
        rect.setAttribute(
          'stroke',
          isActive ? (scene.step.kind === 'process' && scene.step.action === 'move' ? colors.itemSwapping : colors.itemComparing) : colors.border,
        );
        rect.setAttribute('stroke-width', isActive ? '2' : '1');
      }

      const processedKeys = new Set(scene.processed.map((p) => p.key));
      const currentKey = scene.step.kind === 'process' ? scene.step.key : null;
      const currentAction = scene.step.kind === 'process' ? scene.step.action : null;
      for (const [key, g] of boxes) {
        const idx = indexOf(scene.actualOrder, key);
        if (idx >= 0) g.setAttribute('transform', `translate(${slotX(idx, actualSlots)}, ${ACTUAL_Y0})`);
        const rect = boxRects.get(key);
        if (!rect) continue;
        if (key === currentKey) {
          rect.setAttribute('stroke', currentAction === 'move' ? colors.itemSwapping : colors.itemComparing);
          rect.setAttribute('stroke-width', '3');
        } else if (processedKeys.has(key)) {
          rect.setAttribute('stroke', colors.itemSorted);
          rect.setAttribute('stroke-width', '2');
        } else {
          rect.setAttribute('stroke', colors.border);
          rect.setAttribute('stroke-width', '2');
        }
      }

      if (scene.step.kind === 'process') {
        const { position, key, oldIndex } = scene.step;
        const p1x = slotX(position, pillSlots) + pillSlots.bw / 2;
        const p1y = PILL_Y0 + PILL_H;
        const p2x = slotX(oldIndex, tableSlots) + tableSlots.bw / 2;
        const p2y = TABLE_Y0 + TABLE_H / 2;
        const boxIndex = indexOf(scene.actualOrder, key);
        const p3x = slotX(Math.max(boxIndex, 0), actualSlots) + actualSlots.bw / 2;
        const p3y = ACTUAL_Y0;
        searchLine.setAttribute('points', `${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}`);
        searchLine.setAttribute('opacity', '1');
      } else {
        searchLine.removeAttribute('points');
        searchLine.setAttribute('opacity', '0');
      }

      setText(
        statsText,
        t(
          'stat.summary',
          'Moved {move} · Stayed {stay} · Created {create} · Removed {remove} · Patched {patch}',
          scene.totals,
        ),
      );
    }

    async function tweenMoves(
      moves: { key: string; fromX: number; toX: number }[],
      mine: number,
    ): Promise<void> {
      if (moves.length === 0) return;
      await new Promise<void>((resolve) => {
        let frameId = 0;
        const start = performance.now();
        const waiter = (): void => {
          cancelAnimationFrame(frameId);
          resolve();
        };
        waiters.add(waiter);
        const step = (now: number): void => {
          if (destroyed || mine !== gen) {
            waiters.delete(waiter);
            resolve();
            return;
          }
          const progress = Math.min(1, (now - start) / MOVE_DURATION_MS);
          const eased = ease(progress);
          for (const m of moves) {
            const g = boxes.get(m.key);
            if (!g) continue;
            const x = m.fromX + (m.toX - m.fromX) * eased;
            g.setAttribute('transform', `translate(${x}, ${ACTUAL_Y0})`);
          }
          if (progress >= 1) {
            waiters.delete(waiter);
            resolve();
            return;
          }
          frameId = requestAnimationFrame(step);
        };
        frameId = requestAnimationFrame(step);
      });
    }

    async function render(
      next: KeyReorderScene,
      prev: KeyReorderScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      build(next);
      drawStatic(next);
      if (!opts.animate || !prev) return;

      const moves: { key: string; fromX: number; toX: number }[] = [];
      for (const key of oldKeysRef) {
        const fromIdx = indexOf(prev.actualOrder, key);
        const toIdx = indexOf(next.actualOrder, key);
        if (fromIdx !== toIdx && fromIdx >= 0 && toIdx >= 0) {
          moves.push({ key, fromX: slotX(fromIdx, actualSlots), toX: slotX(toIdx, actualSlots) });
        }
      }
      if (moves.length === 0) return;
      await tweenMoves(moves, mine);
      if (destroyed || mine !== gen) return;
      drawStatic(next);
    }

    function destroy(): void {
      destroyed = true;
      gen += 1;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const wake of [...waiters]) wake();
      waiters.clear();
      svg.textContent = '';
    }

    void newKeysRef;
    void container;
    return { render, destroy };
  },
};
