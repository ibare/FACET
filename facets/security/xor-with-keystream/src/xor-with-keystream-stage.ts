import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { XorWithKeystreamScene } from './scene.js';

/**
 * 흐름과 제자리.
 *
 * 줄마다 바이트 하나. 왼쪽 끝에 키스트림 바이트가 물길(점선) 머리에 대기하고, 오른쪽에
 * 메시지 바이트가 제자리에 있다. 한 걸음에 키스트림 바이트의 **사본**이 물길을 따라 흘러와
 * 메시지 바이트 바로 위에 닿고, 그 아래에서 키스트림의 1 인 자리의 칸만 뒤집힌다.
 * 원본은 물길 머리에 남아, 풀 때 같은 사본이 처음부터 다시 흘러온다.
 */
const H = 350;
const W = PIECE_CANVAS_W;
const SVG_NS = 'http://www.w3.org/2000/svg';

const SLIDE_MS = 420;
const FLIP_MS = 320;

const MARGIN = 12;
const KEY_HEX_W = 28;
const VALUE_W = 72;
const COUNT_W = 60;
const CELL_MAX = 24;
const ROWS_TOP = 46;
const FOOT_H = 72;

type Box = {
  cell: number;
  cellH: number;
  pitch: number;
  srcX: number;
  msgX: number;
  valueX: number;
  lockX: number;
  unlockX: number;
};

type FlipCell = {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  cy: number;
  oldBit: number;
  newBit: number;
};

type Handles = {
  copy: SVGGElement | null;
  flips: FlipCell[];
  rowRects: SVGRectElement[];
  /** 운동이 끝나야 드러나는 것 — 새 값 · 이번 걸음의 수 */
  late: SVGElement[];
};

function layout(n: number): Box {
  const avail = W - 2 * MARGIN - KEY_HEX_W - VALUE_W - 2 * COUNT_W;
  const cell = Math.min(CELL_MAX, Math.floor(avail / 19));
  const gap = avail - 16 * cell;
  const srcX = MARGIN + KEY_HEX_W;
  const msgX = srcX + 8 * cell + gap;
  const rowsArea = H - ROWS_TOP - FOOT_H;
  const pitch = Math.min(2 * cell + 24, Math.floor(rowsArea / n));
  const cellH = Math.min(cell, Math.floor((pitch - 10) / 2));
  return {
    cell,
    cellH,
    pitch,
    srcX,
    msgX,
    valueX: msgX + 8 * cell + 12,
    lockX: W - MARGIN - COUNT_W * 1.5,
    unlockX: W - MARGIN - COUNT_W / 2,
  };
}

/** 큰 자리부터 i 번째 비트 (i = 0..7). */
function bitOf(byte: number, i: number): number {
  return (byte >> (7 - i)) & 1;
}

function bin8(byte: number): string {
  return byte.toString(2).padStart(8, '0');
}

function hex2(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

function r2(v: number): number {
  const x = Math.round(v * 100) / 100;
  return x === 0 ? 0 : x;
}

function at<T>(list: readonly T[], i: number, what: string): T {
  const v = list[i];
  if (v === undefined) throw new Error(`xor-with-keystream-stage: ${what}[${i}] 가 없다`);
  return v;
}

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.appendChild(node);
  return node;
}

function label(
  parent: Element,
  x: number,
  y: number,
  content: string,
  style: { fill: string; size: string; family: string; anchor?: string; weight?: string },
): SVGTextElement {
  const node = el(parent, 'text', {
    x: r2(x),
    y: r2(y),
    fill: style.fill,
    'font-size': style.size,
    'font-family': style.family,
    'text-anchor': style.anchor ?? 'middle',
    'dominant-baseline': 'central',
  });
  if (style.weight) node.setAttribute('font-weight', style.weight);
  node.textContent = content;
  return node;
}

/** 키스트림 바이트 한 줄 — 1 인 자리를 짙게 칠한다. */
function drawKeyCells(parent: Element, x: number, y: number, box: Box, byte: number, c: Palette): void {
  for (let b = 0; b < 8; b += 1) {
    const one = bitOf(byte, b) === 1;
    el(parent, 'rect', {
      x: r2(x + b * box.cell + 1),
      y: r2(y),
      width: box.cell - 2,
      height: box.cellH,
      rx: 3,
      fill: one ? c.primary : c.bgSubtle,
      stroke: one ? c.primary : c.border,
    });
    label(parent, x + b * box.cell + box.cell / 2, y + box.cellH / 2, String(bitOf(byte, b)), {
      fill: one ? c.textInverse : c.textMuted,
      size: fontSizes.sm,
      family: fonts.mono,
    });
  }
}

export const xorWithKeystreamStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function wakeAll(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      for (const w of [...waiters]) w();
      waiters.clear();
    }

    function drawStatic(scene: XorWithKeystreamScene): Handles {
      svg.textContent = '';
      const n = scene.plain.length;
      const box = layout(n);
      const step = scene.step;
      const handles: Handles = { copy: null, flips: [], rowRects: [], late: [] };

      // 머리말
      const headY = ROWS_TOP - 16;
      label(svg, box.srcX + 4 * box.cell, headY, t('label.keystream', 'Keystream'), {
        fill: c.textMuted,
        size: fontSizes.xs,
        family: fonts.body,
      });
      label(svg, box.msgX + 4 * box.cell, headY, t('label.message', 'Message'), {
        fill: c.textMuted,
        size: fontSizes.xs,
        family: fonts.body,
      });
      label(svg, (box.lockX + box.unlockX) / 2, headY - 16, t('label.flipped', 'Flipped bits'), {
        fill: c.textMuted,
        size: fontSizes.xs,
        family: fonts.body,
      });
      label(svg, box.lockX, headY, t('label.lock', 'lock'), {
        fill: c.textMuted,
        size: fontSizes.xs,
        family: fonts.body,
      });
      label(svg, box.unlockX, headY, t('label.unlock', 'unlock'), {
        fill: c.textMuted,
        size: fontSizes.xs,
        family: fonts.body,
      });

      for (let i = 0; i < n; i += 1) {
        const laneY = ROWS_TOP + i * box.pitch;
        const msgY = laneY + box.cellH + 4;
        const keyByte = at(scene.key, i, 'key');
        const cur = at(scene.current, i, 'current');
        const locked = at(scene.locked, i, 'locked');
        const isStep = step !== null && step.index === i;

        // 물길 — 키스트림 원본에서 메시지 위 자리까지
        el(svg, 'line', {
          x1: r2(box.srcX + 8 * box.cell + 4),
          y1: r2(laneY + box.cellH / 2),
          x2: r2(box.msgX + 8 * box.cell),
          y2: r2(laneY + box.cellH / 2),
          stroke: c.border,
          'stroke-width': 1,
          'stroke-dasharray': '3 4',
        });

        // 키스트림 원본 — 늘 제자리에 남는다
        label(svg, box.srcX - 6, laneY + box.cellH / 2, hex2(keyByte), {
          fill: c.textMuted,
          size: fontSizes.sm,
          family: fonts.mono,
          anchor: 'end',
        });
        drawKeyCells(svg, box.srcX, laneY, box, keyByte, c);

        // 흘러와 닿은 사본 — 이번 걸음의 바이트 위에만
        if (isStep) {
          const copy = el(svg, 'g', {});
          drawKeyCells(copy, box.msgX, laneY, box, keyByte, c);
          handles.copy = copy;
        }

        // 메시지 바이트 — 제자리에서 뒤집힌다
        for (let b = 0; b < 8; b += 1) {
          const bit = bitOf(cur, b);
          const flipped = isStep && step !== null && bitOf(step.before, b) !== bit;
          const g = el(svg, 'g', {});
          const rect = el(g, 'rect', {
            x: r2(box.msgX + b * box.cell + 1),
            y: r2(msgY),
            width: box.cell - 2,
            height: box.cellH,
            rx: 3,
            fill: flipped ? c.accent : c.itemDefault,
            stroke: c.text,
            'stroke-width': 1,
          });
          if (locked) rect.setAttribute('stroke-dasharray', '3 2');
          const text = label(g, box.msgX + b * box.cell + box.cell / 2, msgY + box.cellH / 2, String(bit), {
            fill: flipped ? c.stateInk : c.text,
            size: fontSizes.sm,
            family: fonts.mono,
            weight: flipped ? 'bold' : undefined,
          });
          if (isStep) handles.rowRects.push(rect);
          if (flipped && step !== null) {
            handles.flips.push({
              g,
              rect,
              label: text,
              cy: msgY + box.cellH / 2,
              oldBit: bitOf(step.before, b),
              newBit: bit,
            });
          }
        }

        // 바이트의 값 — 암호문은 16 진으로만, 평문은 글자를 곁들인다
        const value = el(svg, 'g', {});
        const vy = msgY + box.cellH / 2;
        if (locked) {
          label(value, box.valueX, vy, hex2(cur), {
            fill: c.text,
            size: fontSizes.md,
            family: fonts.mono,
            anchor: 'start',
            weight: 'bold',
          });
        } else {
          label(value, box.valueX, vy, String.fromCharCode(cur), {
            fill: c.text,
            size: fontSizes.lg,
            family: fonts.mono,
            anchor: 'start',
            weight: 'bold',
          });
          label(value, box.valueX + 22, vy, hex2(cur), {
            fill: c.textMuted,
            size: fontSizes.sm,
            family: fonts.mono,
            anchor: 'start',
          });
        }
        if (isStep) handles.late.push(value);

        // 뒤집힌 비트 수 — 잠글 때와 풀 때
        const lockN = at(scene.lockFlips, i, 'lockFlips');
        const unlockN = at(scene.unlockFlips, i, 'unlockFlips');
        if (lockN !== null) {
          const now = isStep && step !== null && step.kind === 'lock';
          const node = label(svg, box.lockX, vy, String(lockN), {
            fill: now ? c.text : c.textMuted,
            size: fontSizes.md,
            family: fonts.mono,
            weight: now ? 'bold' : undefined,
          });
          if (now) handles.late.push(node);
        }
        if (unlockN !== null) {
          const now = isStep && step !== null && step.kind === 'unlock';
          const node = label(svg, box.unlockX, vy, String(unlockN), {
            fill: now ? c.text : c.textMuted,
            size: fontSizes.md,
            family: fonts.mono,
            weight: now ? 'bold' : undefined,
          });
          if (now) handles.late.push(node);
        }
      }

      // 바퀴 합
      const sumY = ROWS_TOP + n * box.pitch + 4;
      el(svg, 'line', {
        x1: r2(box.lockX - COUNT_W / 2 + 6),
        y1: r2(sumY - 6),
        x2: r2(box.unlockX + COUNT_W / 2 - 6),
        y2: r2(sumY - 6),
        stroke: c.border,
        'stroke-width': 1,
      });
      if (scene.lockTotal !== null) {
        const node = label(
          svg,
          box.lockX,
          sumY + 6,
          t('label.sum', '{n} / {bits}', { n: scene.lockTotal.flipped, bits: scene.lockTotal.bits }),
          { fill: c.text, size: fontSizes.xs, family: fonts.mono },
        );
        if (step !== null && step.kind === 'lock') handles.late.push(node);
      }
      if (scene.unlockTotal !== null) {
        const node = label(
          svg,
          box.unlockX,
          sumY + 6,
          t('label.sum', '{n} / {bits}', { n: scene.unlockTotal.flipped, bits: scene.unlockTotal.bits }),
          { fill: c.text, size: fontSizes.xs, family: fonts.mono },
        );
        if (step !== null && step.kind === 'unlock') handles.late.push(node);
      }

      // 캡션 — 지금 일어나는 일
      const capY = H - 36;
      let caption: string;
      if (step === null) {
        caption = t('caption.start', 'Plaintext and keystream, paired byte by byte.');
      } else if (step.kind === 'lock') {
        caption = t('caption.lock', 'Lock {n}: {before} ⊕ {key} = {after} ({hex}) · flipped bits: {flips}', {
          n: step.index + 1,
          before: bin8(step.before),
          key: bin8(step.key),
          after: bin8(step.after),
          hex: hex2(step.after),
          flips: step.flipped,
        });
      } else {
        caption = t('caption.unlock', 'Unlock {n}: {before} ⊕ {key} = {after} · flipped bits: {flips}', {
          n: step.index + 1,
          before: bin8(step.before),
          key: bin8(step.key),
          after: bin8(step.after),
          flips: step.flipped,
        });
      }
      label(svg, W / 2, capY, caption, { fill: c.text, size: fontSizes.md, family: fonts.body });
      if (step !== null) {
        label(
          svg,
          W / 2,
          capY + 22,
          t('caption.same', 'Bytes equal to the plaintext: {same} / {total}', { same: step.same, total: n }),
          { fill: c.textMuted, size: fontSizes.sm, family: fonts.body },
        );
      }
      return handles;
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const start = Date.now();
        let done = false;
        const finish = (ok: boolean): void => {
          if (done) return;
          done = true;
          waiters.delete(wake);
          resolve(ok);
        };
        const wake = (): void => finish(false);
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            finish(false);
            return;
          }
          const p = Math.min(1, (Date.now() - start) / ms);
          frame(p);
          if (p >= 1) finish(true);
          else schedule();
        };
        const schedule = (): void => {
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        schedule();
      });
    }

    function ease(p: number): number {
      return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    }

    async function render(
      next: XorWithKeystreamScene,
      _prev: XorWithKeystreamScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      wakeAll();
      const mine = (gen += 1);
      if (destroyed) return;
      const h = drawStatic(next);
      const step = next.step;
      if (!opts.animate || step === null) return;
      if (h.copy === null) throw new Error('xor-with-keystream-stage: 흘러올 키스트림 사본이 없다');
      if (h.flips.length !== step.flipped) {
        throw new Error(
          `xor-with-keystream-stage: 뒤집을 칸 ${h.flips.length} 가 장면의 뒤집힌 비트 ${step.flipped} 와 다르다`,
        );
      }

      // 아직 못 온 만큼 — 사본은 물길 머리에, 칸은 겹치기 전 값으로
      const box = layout(next.plain.length);
      const dx = box.srcX - box.msgX;
      const copy = h.copy;
      copy.setAttribute('transform', `translate(${r2(dx)} 0)`);
      for (const f of h.flips) {
        f.label.textContent = String(f.oldBit);
        f.rect.setAttribute('fill', c.itemDefault);
        f.label.setAttribute('fill', c.text);
        f.label.removeAttribute('font-weight');
      }
      for (const rect of h.rowRects) {
        if (step.kind === 'lock') rect.removeAttribute('stroke-dasharray');
        else rect.setAttribute('stroke-dasharray', '3 2');
      }
      for (const node of h.late) node.setAttribute('opacity', '0');

      // 흘러온다
      const slid = await tween(SLIDE_MS, mine, (p) => {
        copy.setAttribute('transform', `translate(${r2(dx * (1 - ease(p)))} 0)`);
      });
      if (!slid || mine !== gen || destroyed) return;

      // 1 인 자리 아래의 칸이 뒤집힌다
      const turned = await tween(FLIP_MS, mine, (p) => {
        const newSide = p >= 0.5;
        const s = Math.max(0.02, Math.abs(1 - 2 * p));
        for (const f of h.flips) {
          f.g.setAttribute('transform', `translate(0 ${r2(f.cy)}) scale(1 ${r2(s)}) translate(0 ${r2(-f.cy)})`);
          f.label.textContent = String(newSide ? f.newBit : f.oldBit);
          f.rect.setAttribute('fill', newSide ? c.accent : c.itemDefault);
          f.label.setAttribute('fill', newSide ? c.stateInk : c.text);
        }
      });
      if (!turned || mine !== gen || destroyed) return;

      drawStatic(next);
    }

    return {
      render,
      destroy(): void {
        destroyed = true;
        gen += 1;
        wakeAll();
        svg.textContent = '';
      },
    };
  },
};
