/**
 * block-cipher 무대 — 평문 · IV 줄, 닫힌 상자(R 겹), 모드의 이음, C · C′ 줄, 겹침 격자, 덩어리별 막대.
 *
 * 무대는 셈하지 않는다 — C · C′ · 겹침 비트 · 덩어리별 수 · 짝 · 카운터 값은 projector 가 payload 에서 옮겨 준다.
 * 운동:
 *   - init: 바꾼 비트 표지가 앞 판의 자리에서 새 자리로 옮겨 가고, 상자의 층이 R 겹으로 늘거나 준다.
 *           앞 판의 결론(C 글자 · 켜진 격자 · 짝 · 막대 채움 · 값 글자)은 걷고, 켜졌던 자리와 막대 높이는 점선으로만 남긴다
 *   - lock: 암호문 덩어리 넷이 상자(카운터 모드면 상자 뒤 ⊕)에서 나와 제 줄로 내려온다
 *   - compare: C 와 C′ 의 비트 줄이 격자로 내려와 포개지고, 다른 비트만 켜진다 · 막대가 점선 틀에서 새 높이로 자라거나 준다
 * 첫 그림(init)은 멱등이다 — 들어오면 판의 층을 비우고 다시 짓는다. reset 은 기억(앞 판의 자리)까지 비운다.
 */

import { fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

export type BlockCipherInit = {
  blocks: number;
  mode: 'ecb' | 'cbc' | 'ctr';
  rounds: number;
  maxRounds: number;
  change: 'plain' | 'iv';
  flipAt: number;
  plain: string[];
  plainText: string[];
  plainBits: number[][];
  iv: string;
  ivBits: number[];
  key: string;
  counters: string[];
};

export type BlockCipherLock = {
  which: 'original' | 'changed';
  cipher: string[];
  bits: number[][];
  pairs: number[][];
};

export type BlockCipherCompare = {
  bits: number[][];
  perBlock: number[];
  perBlockNibbles: number[];
};

export type BlockCipherStage = ViewInstance & {
  init(p: BlockCipherInit, ms: number): Promise<void>;
  lock(p: BlockCipherLock, ms: number): Promise<void>;
  compare(p: BlockCipherCompare, ms: number): Promise<void>;
  setCaption(text: string): void;
  reset(): void;
};

const NS = 'http://www.w3.org/2000/svg';
const W = 760;
const H = 520;
const GUT = 96;
const CELL = 8;
const NIB_GAP = 3;
const STRIP_W = 16 * CELL + 3 * NIB_GAP;
const BIT_H = 12;
/** 무대가 자리를 잡아 둔 덩어리 수 · 상자 겹 수의 끝 (마운트 뒤 세로를 바꾸지 않는다). */
const MAX_BLOCKS = 4;
const MAX_LAYERS = 4;

const Y_IV = 20;
const Y_P = 66;
const Y_MIX = 110;
const BOX_TOP = 128;
const LAYER_H = 12;
const LAYER_STEP = 16;
const BOX_H = 8 + MAX_LAYERS * LAYER_STEP;
const BOX_BOTTOM = BOX_TOP + BOX_H;
const BOX_W = 88;
const Y_POST = BOX_BOTTOM + 16;
const Y_C = 258;
const Y_C2 = 322;
const GRID_TOP = 356;
const GRID_H = 16;
const BAR_BASE = 474;
const BAR_MAX = 88;
const BAR_W = 24;
const Y_CAPTION = 506;

/** 글자 기준선 y 에서 비트 줄의 위 끝. */
const stripTop = (y: number) => y + 5;

function ease(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
}

function bitsOk(bits: unknown): bits is number[] {
  return Array.isArray(bits) && bits.length === 16 && bits.every((b) => b === 0 || b === 1);
}

export const blockCipherStageView: CanvasView = {
  canvas: { width: W, height: H },
  mount(_container, params) {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const isInstant = params.isInstant ?? (() => false);
    const monoPx = parseFloat(fontSizes.md);

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(NS, tag);
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
      parent.appendChild(node);
      return node;
    };
    const text = (parent: Element, x: number, y: number, s: string, attrs: Record<string, string | number> = {}) => {
      const node = el('text', { x, y, 'font-family': fonts.body, 'font-size': fontSizes.sm, fill: c.text, ...attrs }, parent);
      node.textContent = s;
      return node;
    };
    const clear = (g: Element) => {
      while (g.firstChild) g.removeChild(g.firstChild);
    };

    el('rect', { x: 0, y: 0, width: W, height: H, fill: c.bg }, svg);
    const gLabels = el('g', {}, svg);
    const gRun = el('g', {}, svg);
    const gGrid = el('g', {}, svg);
    const gCipher = el('g', {}, svg);
    const gBars = el('g', {}, svg);
    const gMarker = el('g', {}, svg);
    const caption = text(svg, 8, Y_CAPTION, '', { 'font-size': fontSizes.md });

    // ── 운동 ────────────────────────────────────────────────────────────
    let destroyed = false;
    let gen = 0;
    type Pending = { id: number; finish(draw: boolean): void };
    const pending = new Set<Pending>();
    const tween = (ms: number, draw: (k: number) => void): Promise<void> =>
      new Promise((resolve) => {
        if (destroyed || ms <= 0 || isInstant()) {
          draw(1);
          resolve();
          return;
        }
        const start = performance.now();
        const item: Pending = {
          id: 0,
          finish(doDraw: boolean) {
            cancelAnimationFrame(item.id);
            pending.delete(item);
            if (doDraw) draw(1);
            resolve();
          },
        };
        const tick = (now: number) => {
          if (destroyed || isInstant()) {
            item.finish(true);
            return;
          }
          const k = Math.min(1, (now - start) / ms);
          draw(ease(k));
          if (k >= 1) item.finish(false);
          else item.id = requestAnimationFrame(tick);
        };
        pending.add(item);
        item.id = requestAnimationFrame(tick);
      });
    const flush = (doDraw: boolean) => {
      for (const p of [...pending]) p.finish(doDraw);
    };
    params.onScrubStart?.(() => flush(true));

    // ── 판의 기억 (앞 판의 자리) ─────────────────────────────────────────
    let blocks = 0;
    let mode: BlockCipherInit['mode'] | null = null;
    let markerAt: { x: number; y: number } | null = null;
    let layersShown = 0;
    let prevLit: number[][] | null = null;
    let prevBars: number[] | null = null;
    let cipherRows: { original: SVGGElement | null; changed: SVGGElement | null } = { original: null, changed: null };
    let gridCells: SVGRectElement[][] = [];
    let layerRects: SVGRectElement[][] = [];

    const colW = () => (W - GUT - 8) / blocks;
    const cx = (i: number) => GUT + i * colW() + colW() / 2;
    const stripX = (i: number) => cx(i) - STRIP_W / 2;
    const cellX = (i: number, j: number) => stripX(i) + j * CELL + Math.floor(j / 4) * NIB_GAP;

    /** 16 진 글자와 비트 줄 한 덩어리. */
    const unit = (parent: Element, i: number, y: number, hex: string, bits: number[], extra?: string) => {
      if (!bitsOk(bits)) throw new Error('block-cipher-stage: 비트 줄은 0/1 열여섯이어야 한다');
      const g = el('g', {}, parent);
      text(g, stripX(i), y, hex, { 'font-family': fonts.mono, 'font-size': fontSizes.md });
      if (extra !== undefined) text(g, stripX(i) + monoPx * 3.2, y, extra, { fill: c.textMuted, 'font-family': fonts.mono });
      bits.forEach((b, j) => {
        el(
          'rect',
          {
            x: cellX(i, j),
            y: stripTop(y),
            width: CELL - 1,
            height: BIT_H,
            fill: b === 1 ? c.text : c.bg,
            stroke: b === 1 ? c.text : c.border,
          },
          g,
        );
      });
      return g;
    };
    const line = (parent: Element, pts: [number, number][], dashed = false) =>
      el(
        'polyline',
        {
          points: pts.map(([x, y]) => `${x},${y}`).join(' '),
          fill: 'none',
          stroke: c.textMuted,
          'stroke-width': 1.2,
          ...(dashed ? { 'stroke-dasharray': '3 3' } : {}),
        },
        parent,
      );
    const xorNode = (parent: Element, x: number, y: number) => {
      el('circle', { cx: x, cy: y, r: 7, fill: c.bg, stroke: c.text, 'stroke-width': 1.2 }, parent);
      text(parent, x, y + 4, '⊕', { 'text-anchor': 'middle', 'font-size': fontSizes.md });
    };

    const drawLabels = (rounds: number) => {
      clear(gLabels);
      text(gLabels, 8, Y_IV + 12, t('label.iv', 'IV'), { fill: c.textMuted });
      text(gLabels, 8, Y_P + 12, t('label.plain', 'Plaintext'), { fill: c.textMuted });
      text(gLabels, 8, BOX_TOP + BOX_H / 2 + 4, t('label.rounds', 'Rounds: {n}', { n: rounds }), { fill: c.textMuted });
      text(gLabels, 8, Y_C + 12, t('label.cipher', 'C'), { fill: c.textMuted });
      text(gLabels, 8, Y_C2 + 12, t('label.cipher2', 'C′'), { fill: c.textMuted });
      text(gLabels, 8, GRID_TOP + 12, t('label.overlay', 'C ⊕ C′'), { fill: c.textMuted });
      text(gLabels, 8, BAR_BASE - BAR_MAX / 2, t('label.bars', 'Different bits'), { fill: c.textMuted });
      if (mode === 'ctr') text(gLabels, 8, Y_MIX + 4, t('label.counter', 'IV + i'), { fill: c.textMuted });
    };

    const layerY = (r: number) => BOX_TOP + 4 + r * LAYER_STEP;
    const setLayers = (shown: number) => {
      for (const col of layerRects) {
        col.forEach((rect, r) => {
          const k = Math.max(0, Math.min(1, shown - r));
          rect.setAttribute('height', String(LAYER_H * k));
          rect.setAttribute('y', String(layerY(r) + (LAYER_H * (1 - k)) / 2));
        });
      }
    };

    const markerTarget = (p: BlockCipherInit) => {
      const j = p.flipAt - 1;
      return p.change === 'plain' ? { x: cellX(0, j), y: stripTop(Y_P) } : { x: cellX(0, j), y: stripTop(Y_IV) };
    };
    const placeMarker = (x: number, y: number) => gMarker.setAttribute('transform', `translate(${x},${y})`);

    const barHeight = (n: number) => (BAR_MAX * n) / 16;
    const barX = (i: number) => cx(i) - 56;

    const drawGhosts = () => {
      if (prevLit === null || prevLit.length !== blocks) return;
      prevLit.forEach((row, i) =>
        row.forEach((b, j) => {
          if (b === 1) {
            el(
              'rect',
              {
                x: cellX(i, j) + 1,
                y: GRID_TOP + 1,
                width: CELL - 3,
                height: GRID_H - 2,
                fill: 'none',
                stroke: c.textMuted,
                'stroke-dasharray': '2 2',
                'data-ghost': 1,
              },
              gGrid,
            );
          }
        }),
      );
    };
    const drawFrames = () => {
      if (prevBars === null || prevBars.length !== blocks) return;
      prevBars.forEach((n, i) => {
        el(
          'rect',
          {
            x: barX(i),
            y: BAR_BASE - barHeight(n),
            width: BAR_W,
            height: barHeight(n),
            fill: 'none',
            stroke: c.textMuted,
            'stroke-dasharray': '3 3',
            'data-frame': 1,
          },
          gBars,
        );
      });
    };

    const init = async (p: BlockCipherInit, ms: number): Promise<void> => {
      if (p.blocks < 1 || p.blocks > MAX_BLOCKS) throw new Error(`block-cipher-stage: 덩어리 수 ${p.blocks} 는 1..4 밖이다`);
      if (p.maxRounds > MAX_LAYERS || p.rounds < 1 || p.rounds > p.maxRounds) throw new Error('block-cipher-stage: 라운드 수가 자리 밖이다');
      if (p.plain.length !== p.blocks || p.plainBits.length !== p.blocks || p.plainText.length !== p.blocks) {
        throw new Error('block-cipher-stage: 평문 덩어리 수가 어긋났다');
      }
      if (p.mode === 'ctr' && p.counters.length !== p.blocks) throw new Error('block-cipher-stage: 카운터 수가 어긋났다');
      gen += 1;
      flush(false);
      if (blocks !== p.blocks) {
        prevLit = null;
        prevBars = null;
        markerAt = null;
      }
      blocks = p.blocks;
      mode = p.mode;
      for (const g of [gRun, gGrid, gCipher, gBars, gMarker]) clear(g);
      cipherRows = { original: null, changed: null };
      caption.textContent = '';
      drawLabels(p.rounds);

      // 주 열쇠 · IV · 평문
      text(gRun, W - 8, Y_IV + 12, t('label.key', 'Main key {key}', { key: p.key }), {
        'text-anchor': 'end',
        'font-family': fonts.mono,
        fill: c.textMuted,
      });
      unit(gRun, 0, Y_IV, p.iv, p.ivBits);
      for (let i = 0; i < blocks; i += 1) unit(gRun, i, Y_P, p.plain[i] as string, p.plainBits[i] as number[], p.plainText[i]);

      // 모드의 이음 — 정적인 선
      const plainBottom = stripTop(Y_P) + BIT_H;
      const ivLeft: [number, number] = [stripX(0), stripTop(Y_IV) + BIT_H / 2];
      const toGutter = (x: number, y: number): [number, number][] => [ivLeft, [GUT - 6, ivLeft[1]], [GUT - 6, y], [x, y]];
      for (let i = 0; i < blocks; i += 1) {
        const x = cx(i);
        if (p.mode === 'ecb') {
          line(gRun, [[x, plainBottom], [x, BOX_TOP]]);
          line(gRun, [[x, BOX_BOTTOM], [x, Y_C - 12]]);
        } else if (p.mode === 'cbc') {
          line(gRun, [[x, plainBottom], [x, Y_MIX - 7]]);
          line(gRun, [[x, Y_MIX + 7], [x, BOX_TOP]]);
          line(gRun, [[x, BOX_BOTTOM], [x, Y_C - 12]]);
          if (i === 0) line(gRun, toGutter(x - 7, Y_MIX));
          else {
            const gapX = GUT + i * colW() + 4;
            const from: [number, number] = [stripX(i - 1) + STRIP_W, stripTop(Y_C) + BIT_H / 2];
            line(gRun, [from, [gapX, from[1]], [gapX, Y_MIX], [x - 7, Y_MIX]]);
          }
          xorNode(gRun, x, Y_MIX);
        } else {
          const counter = p.counters[i] as string;
          el('rect', { x: x - 24, y: Y_MIX - 10, width: 48, height: 18, fill: c.bgSubtle, stroke: c.border }, gRun);
          text(gRun, x, Y_MIX + 4, counter, { 'text-anchor': 'middle', 'font-family': fonts.mono });
          line(gRun, [[x, Y_MIX + 8], [x, BOX_TOP]]);
          line(gRun, [[x, BOX_BOTTOM], [x, Y_POST - 7]]);
          line(gRun, [[x - 58, plainBottom], [x - 58, Y_POST], [x - 7, Y_POST]]);
          line(gRun, [[x, Y_POST + 7], [x, Y_C - 12]]);
          if (i === 0) line(gRun, toGutter(x - 24, Y_MIX), true);
          xorNode(gRun, x, Y_POST);
        }
      }

      // 닫힌 상자 — R 겹
      layerRects = [];
      for (let i = 0; i < blocks; i += 1) {
        const x = cx(i) - BOX_W / 2;
        el('rect', { x, y: BOX_TOP, width: BOX_W, height: BOX_H, rx: 4, fill: c.bgSubtle, stroke: c.textMuted }, gRun);
        const col: SVGRectElement[] = [];
        for (let r = 0; r < MAX_LAYERS; r += 1) {
          col.push(el('rect', { x: x + 8, y: layerY(r), width: BOX_W - 16, height: 0, fill: c.itemSorted }, gRun));
        }
        layerRects.push(col);
      }

      // 겹침 격자 — 빈 자리와 앞 판의 켜졌던 자리
      gridCells = [];
      for (let i = 0; i < blocks; i += 1) {
        const row: SVGRectElement[] = [];
        for (let j = 0; j < 16; j += 1) {
          row.push(el('rect', { x: cellX(i, j), y: GRID_TOP, width: CELL - 1, height: GRID_H, fill: c.bgSubtle, stroke: c.border }, gGrid));
        }
        gridCells.push(row);
      }
      drawGhosts();

      // 막대 — 바닥과 앞 판 높이의 점선 틀
      for (let i = 0; i < blocks; i += 1) line(gBars, [[barX(i) - 4, BAR_BASE], [barX(i) + BAR_W + 4, BAR_BASE]]);
      drawFrames();

      // 바꾼 비트 표지
      el('rect', { x: -1.5, y: -1.5, width: CELL + 2, height: BIT_H + 3, fill: 'none', stroke: c.accent, 'stroke-width': 2 }, gMarker);
      el('path', { d: `M ${CELL / 2 - 0.5} ${BIT_H + 3} l -5 8 l 10 0 z`, fill: c.accent, stroke: c.text, 'stroke-width': 0.8 }, gMarker);

      const target = markerTarget(p);
      const from = markerAt ?? target;
      const layersFrom = layersShown;
      markerAt = target;
      layersShown = p.rounds;
      const myGen = gen;
      await tween(ms, (k) => {
        if (myGen !== gen) return;
        placeMarker(from.x + (target.x - from.x) * k, from.y + (target.y - from.y) * k);
        setLayers(layersFrom + (p.rounds - layersFrom) * k);
      });
    };

    const lock = async (p: BlockCipherLock, ms: number): Promise<void> => {
      if (blocks === 0) throw new Error('block-cipher-stage: init 전에 lock 이 왔다');
      if (p.cipher.length !== blocks || p.bits.length !== blocks) throw new Error('block-cipher-stage: 암호문 덩어리 수가 어긋났다');
      const y = p.which === 'original' ? Y_C : Y_C2;
      const old = cipherRows[p.which];
      if (old) old.remove();
      const g = el('g', {}, gCipher);
      cipherRows[p.which] = g;
      for (let i = 0; i < blocks; i += 1) unit(g, i, y, p.cipher[i] as string, p.bits[i] as number[]);
      if (p.which === 'original') {
        p.pairs.forEach(([a, b], k) => {
          if (a === undefined || b === undefined || a < 1 || b > blocks || a >= b) throw new Error('block-cipher-stage: 짝 번호가 어긋났다');
          const x1 = cx(a - 1);
          const x2 = cx(b - 1);
          const y0 = stripTop(Y_C) + BIT_H + 2;
          const depth = 12 + k * 10;
          el(
            'path',
            {
              d: `M ${x1} ${y0} C ${x1} ${y0 + depth}, ${x2} ${y0 + depth}, ${x2} ${y0}`,
              fill: 'none',
              stroke: c.itemComparing,
              'stroke-width': 1.6,
            },
            g,
          );
        });
      }
      const origin = mode === 'ctr' ? Y_POST : BOX_BOTTOM - 12;
      const dy = origin - y;
      const myGen = gen;
      await tween(ms, (k) => {
        if (myGen !== gen) return;
        g.setAttribute('transform', `translate(0,${dy * (1 - k)})`);
      });
    };

    const compare = async (p: BlockCipherCompare, ms: number): Promise<void> => {
      if (blocks === 0) throw new Error('block-cipher-stage: init 전에 compare 가 왔다');
      if (p.bits.length !== blocks || p.perBlock.length !== blocks || p.perBlockNibbles.length !== blocks) {
        throw new Error('block-cipher-stage: 겹침 덩어리 수가 어긋났다');
      }
      for (const row of p.bits) if (!bitsOk(row)) throw new Error('block-cipher-stage: 겹침 줄은 0/1 열여섯이어야 한다');
      const { original, changed } = cipherRows;
      if (!original || !changed) throw new Error('block-cipher-stage: 두 잠금 전에 겹침이 왔다');
      // 두 비트 줄이 격자로 내려와 포개진다
      const ghostC = original.cloneNode(true) as SVGGElement;
      const ghostC2 = changed.cloneNode(true) as SVGGElement;
      for (const gh of [ghostC, ghostC2]) {
        for (const node of [...gh.querySelectorAll('text, path')]) node.remove();
        gCipher.appendChild(gh);
      }
      const dyC = GRID_TOP - stripTop(Y_C);
      const dyC2 = GRID_TOP - stripTop(Y_C2);
      // 막대 — 앞 판의 높이에서 새 높이로
      const fromBars = prevBars !== null && prevBars.length === blocks ? prevBars : p.perBlock.map(() => 0);
      const fills = p.perBlock.map((_, i) =>
        el('rect', { x: barX(i), y: BAR_BASE, width: BAR_W, height: 0, fill: c.itemComparing }, gBars),
      );
      const myGen = gen;
      await tween(ms, (k) => {
        if (myGen !== gen) return;
        ghostC.setAttribute('transform', `translate(0,${dyC * k})`);
        ghostC2.setAttribute('transform', `translate(0,${dyC2 * k})`);
        fills.forEach((f, i) => {
          const h = barHeight((fromBars[i] as number) + ((p.perBlock[i] as number) - (fromBars[i] as number)) * k);
          f.setAttribute('y', String(BAR_BASE - h));
          f.setAttribute('height', String(h));
        });
      });
      if (myGen !== gen) return;
      ghostC.remove();
      ghostC2.remove();
      for (const node of [...gGrid.querySelectorAll('[data-ghost]'), ...gBars.querySelectorAll('[data-frame]')]) node.remove();
      p.bits.forEach((row, i) =>
        row.forEach((b, j) => {
          const cell = gridCells[i]?.[j];
          if (!cell) throw new Error('block-cipher-stage: 격자 자리가 없다');
          cell.setAttribute('fill', b === 1 ? c.itemComparing : c.bgSubtle);
          cell.setAttribute('stroke', b === 1 ? c.text : c.border);
          if (b === 1) cell.setAttribute('data-lit', '1');
          else cell.removeAttribute('data-lit');
        }),
      );
      p.perBlock.forEach((n, i) => {
        text(gBars, barX(i) + BAR_W + 8, BAR_BASE - 20, t('label.barBits', '{n} bits', { n }));
        text(gBars, barX(i) + BAR_W + 8, BAR_BASE - 4, t('label.barNibbles', '{n} nibbles', { n: p.perBlockNibbles[i] as number }), {
          fill: c.textMuted,
        });
      });
      prevLit = p.bits.map((row) => [...row]);
      prevBars = [...p.perBlock];
    };

    const reset = () => {
      gen += 1;
      flush(false);
      for (const g of [gRun, gGrid, gCipher, gBars, gMarker]) clear(g);
      caption.textContent = '';
      cipherRows = { original: null, changed: null };
      gridCells = [];
      layerRects = [];
      markerAt = null;
      layersShown = 0;
      prevLit = null;
      prevBars = null;
    };

    const instance: BlockCipherStage = {
      init,
      lock,
      compare,
      reset,
      setCaption(s: string) {
        caption.textContent = s;
      },
      destroy() {
        destroyed = true;
        flush(false);
        svg.replaceChildren();
      },
    };
    return instance;
  },
};
