/**
 * round-key-mix-stage — 주 열쇠 위를 창이 미끄러지고, 잘린 조각이 상태로 내려와 겹친다.
 *
 * 위에서 아래로
 *   주 열쇠 32 칸 (니블마다 16 진 한 자리) · 그 위를 16 칸 창이 4 칸씩 미끄러진다
 *   잘린 열쇠의 계단 — 라운드 열쇠 16 진 네 자리를 주 열쇠의 제 니블 아래에 둔다
 *   내려온 라운드 열쇠 · 상태 16 칸 (열쇠의 1 인 자리가 뒤집힌다)
 *   겹침 식 · 속을 열지 않는 층 상자 (상태가 그 밑으로 들어갔다 새 값으로 나온다)
 *
 * 한 걸음의 운동: 층 지나감 → 창 미끄러짐 → 잘린 열쇠가 내려옴 → 1 인 자리 뒤집힘.
 */
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
import { BLOCK_BITS, hexToBits, MASTER_BITS, SLIDE_BITS } from './algorithm.js';
import type { RoundKeyMixScene } from './scene.js';

const H = 340;
const SVG_NS = 'http://www.w3.org/2000/svg';

const LABEL_W = 88;
const RIGHT_PAD = 16;
const MAX_CELL = 17;
const GAP_RATIO = 0.45;

const HEX_Y = 18;
const MASTER_Y = 26;
const CELL_H = 18;
const LEDGER_Y0 = 60;
const LEDGER_H = 13;
const LEDGER_PITCH = 16;
const KEY_Y = 168;
const STATE_Y = 194;
const EQ_Y = 234;
const BOX_Y = 248;
const BOX_H = 32;
const CAPTION_Y = 308;
const SUMMARY_Y = 328;

const PASS_MS = 520;
const SLIDE_MS = 300;
const DROP_MS = 420;
const FLIP_MS = 260;

type Frame = { pass: number; slide: number; drop: number; flip: number };
const DONE: Frame = { pass: 1, slide: 1, drop: 1, flip: 1 };

function r2(v: number): number {
  const out = Math.round(v * 100) / 100;
  return Object.is(out, -0) ? 0 : out;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

export const roundKeyMixStageView: CanvasView = {
  canvas: { height: H },
  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors: Palette = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const smPx = parseFloat(fontSizes.sm);
    const xsPx = parseFloat(fontSizes.xs);

    // 칸 크기는 캔버스 폭에서 역산한다 — 32 칸 + 니블 사이 틈 일곱
    const nibbles = MASTER_BITS / 4;
    const avail = PIECE_CANVAS_W - LABEL_W - RIGHT_PAD;
    const cw = Math.min(MAX_CELL, avail / (MASTER_BITS + (nibbles - 1) * GAP_RATIO));
    const gap = cw * GAP_RATIO;
    const masterW = MASTER_BITS * cw + (nibbles - 1) * gap;
    const masterX0 = LABEL_W + (avail - masterW) / 2;
    const blockW = BLOCK_BITS * cw + (BLOCK_BITS / 4 - 1) * gap;
    const blockX0 = masterX0 + (masterW - blockW) / 2;

    const masterCellX = (i: number): number => masterX0 + i * cw + Math.floor(i / 4) * gap;
    const blockCellX = (i: number): number => blockX0 + i * cw + Math.floor(i / 4) * gap;
    const passDepth = BOX_Y + BOX_H / 2 - (STATE_Y + CELL_H / 2);

    let destroyed = false;
    let gen = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: Element,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, typeof v === 'number' ? String(r2(v)) : v);
      parent.appendChild(node);
      return node;
    }

    function text(parent: Element, x: number, y: number, body: string, attrs: Record<string, string | number>): SVGTextElement {
      const node = el('text', { x, y, ...attrs }, parent);
      node.textContent = body;
      return node;
    }

    /** 라운드 열쇠 이름 — K 에 윗첨자 번호 */
    function keyName(parent: Element, x: number, y: number, round: number, fill: string): void {
      const node = el(
        'text',
        { x, y, 'text-anchor': 'end', 'font-family': fonts.mono, 'font-size': fontSizes.sm, fill },
        parent,
      );
      node.textContent = 'K';
      const sup = el('tspan', { dy: -5, 'font-size': fontSizes.xs }, node);
      sup.textContent = String(round);
    }

    type CellLook = { fill: string; stroke: string; ink: string };

    function cell(parent: Element, x: number, y: number, bit: number, look: CellLook, scaleY = 1): void {
      const g = el('g', {}, parent);
      if (scaleY !== 1) {
        const cy = y + CELL_H / 2;
        g.setAttribute('transform', `translate(0 ${r2(cy)}) scale(1 ${r2(scaleY)}) translate(0 ${r2(-cy)})`);
      }
      el('rect', { x: x + 0.5, y, width: cw - 1, height: CELL_H, rx: 2, fill: look.fill, stroke: look.stroke, 'stroke-width': 1 }, g);
      text(g, x + cw / 2, y + CELL_H / 2 + smPx * 0.36, String(bit), {
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: look.ink,
      });
    }

    const plainLook: CellLook = { fill: colors.bg, stroke: colors.border, ink: colors.text };
    const keyOneLook: CellLook = { fill: colors.accent, stroke: colors.accent, ink: colors.stateInk };
    const keyZeroLook: CellLook = { fill: colors.bg, stroke: colors.border, ink: colors.textMuted };
    const flippedLook: CellLook = { fill: colors.itemComparing, stroke: colors.itemComparing, ink: colors.stateInk };

    function passLabel(pass: 'sp' | 's'): string {
      if (pass === 'sp') return t('label.box.sp', 'Substitute · Permute');
      return t('label.box.s', 'Substitute');
    }

    function draw(scene: RoundKeyMixScene, f: Frame): void {
      svg.textContent = '';
      const step = scene.step;
      const masterBits = hexToBits(scene.masterKey);
      if (masterBits.length !== MASTER_BITS) {
        throw new Error(`round-key-mix-stage: 주 열쇠가 ${MASTER_BITS} 비트가 아니다 (${masterBits.length})`);
      }

      // ── 주 열쇠
      const top = el('g', {}, svg);
      text(top, LABEL_W - 10, MASTER_Y + CELL_H / 2 + smPx * 0.36, t('label.master', 'Master key'), {
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      for (let n = 0; n < nibbles; n += 1) {
        const x = masterCellX(n * 4) + (4 * cw) / 2;
        text(top, x, HEX_Y, scene.masterKey[n]!, {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
      }
      masterBits.forEach((bit, i) => cell(top, masterCellX(i), MASTER_Y, bit, plainLook));

      // ── 창 (잘라 낼 16 칸)
      if (step) {
        const from = step.round > 1 ? step.start - SLIDE_BITS : step.start;
        const xFrom = masterCellX(from - 1);
        const xTo = masterCellX(step.start - 1);
        const x = xFrom + (xTo - xFrom) * ease(f.slide);
        el(
          'rect',
          {
            x: x - 3,
            y: MASTER_Y - 3,
            width: blockW + 6,
            height: CELL_H + 6,
            rx: 4,
            fill: 'none',
            stroke: colors.accent,
            'stroke-width': 2.5,
          },
          top,
        );
      }

      // ── 잘린 열쇠의 계단
      const ledger = el('g', {}, svg);
      for (const key of scene.keys) {
        const current = step !== null && key.round === step.round;
        if (current && f.slide < 1) continue;
        const y = LEDGER_Y0 + (key.round - 1) * LEDGER_PITCH;
        const x0 = masterCellX(key.start - 1);
        el(
          'rect',
          {
            x: x0,
            y,
            width: blockW,
            height: LEDGER_H,
            rx: 3,
            fill: colors.bgSubtle,
            stroke: current ? colors.accent : colors.border,
            'stroke-width': current ? 1.5 : 1,
          },
          ledger,
        );
        keyName(ledger, LABEL_W - 10, y + LEDGER_H - 2, key.round, current ? colors.text : colors.textMuted);
        const firstNibble = (key.start - 1) / 4;
        for (let k = 0; k < BLOCK_BITS / 4; k += 1) {
          const x = masterCellX((firstNibble + k) * 4) + (4 * cw) / 2;
          text(ledger, x, y + LEDGER_H - 2.5, key.hex[k]!, {
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.xs,
            fill: current ? colors.text : colors.textMuted,
          });
        }
      }

      // ── 상태 줄 (층 상자보다 먼저 — 상자 밑으로 들어가 가려진다)
      const stateLayer = el('g', {}, svg);
      const keyBits = step ? hexToBits(step.key) : null;
      let shownHex = scene.state;
      let offset = 0;
      let phase: 'passing' | 'entered' | 'mixed' = 'mixed';
      if (step && step.pass !== 'none' && f.pass < 1) {
        phase = 'passing';
        if (f.pass < 0.5) {
          shownHex = step.before;
          offset = ease(f.pass / 0.5) * passDepth;
        } else {
          shownHex = step.enter;
          offset = (1 - ease((f.pass - 0.5) / 0.5)) * passDepth;
        }
      } else if (step && f.flip < 1) {
        phase = 'entered';
        shownHex = step.enter;
      }
      const shownBits = hexToBits(shownHex);
      const rowY = STATE_Y + offset;
      for (let i = 0; i < BLOCK_BITS; i += 1) {
        const x = blockCellX(i);
        const hit = keyBits !== null && keyBits[i] === 1;
        if (phase === 'entered' && hit && step) {
          const turned = f.flip >= 0.5;
          const bit = turned ? hexToBits(step.result)[i]! : shownBits[i]!;
          cell(stateLayer, x, rowY, bit, turned ? flippedLook : plainLook, Math.max(0.04, Math.abs(1 - 2 * f.flip)));
        } else if (phase === 'mixed' && hit) {
          cell(stateLayer, x, rowY, shownBits[i]!, flippedLook);
        } else {
          cell(stateLayer, x, rowY, shownBits[i]!, plainLook);
        }
      }
      if (phase !== 'passing') {
        let rowLabel = t('label.state', 'State');
        if (!step) rowLabel = t('label.plain', 'Plaintext');
        else if (step.last && phase === 'mixed') rowLabel = t('label.cipher', 'Ciphertext');
        text(stateLayer, LABEL_W - 10, STATE_Y + CELL_H / 2 + smPx * 0.36, rowLabel, {
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        const midFlip = phase === 'entered' && f.flip >= 0.5 && step ? step.result : shownHex;
        const final = step !== null && step.last && phase === 'mixed';
        text(stateLayer, blockX0 + blockW + 12, STATE_Y + CELL_H / 2 + smPx * 0.36, midFlip, {
          'font-family': fonts.mono,
          'font-size': final ? fontSizes.md : fontSizes.sm,
          'font-weight': final ? 700 : 400,
          fill: colors.text,
        });
      }

      // ── 층 상자 (속을 열지 않는다)
      const box = el('g', {}, svg);
      el(
        'rect',
        {
          x: blockX0 - 14,
          y: BOX_Y,
          width: blockW + 28,
          height: BOX_H,
          rx: 6,
          fill: colors.bgSubtle,
          stroke: colors.border,
          'stroke-width': 1.5,
        },
        box,
      );
      const passed = step !== null && step.pass !== 'none';
      const boxKind: 'sp' | 's' = step !== null && step.pass === 's' ? 's' : 'sp';
      text(box, blockX0 + blockW / 2, BOX_Y + BOX_H / 2 + smPx * 0.36, passLabel(boxKind), {
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: passed && f.pass < 1 ? colors.text : colors.textMuted,
      });
      if (step && passed && f.pass >= 1) {
        text(box, blockX0 + blockW + 26, BOX_Y + BOX_H / 2 + xsPx * 0.36, t('label.pass', '{from} → {to}', { from: step.before, to: step.enter }), {
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
      }

      // ── 내려온 라운드 열쇠 (가장 위 층 — 내려오는 길에 무엇에도 가리지 않는다)
      if (step && keyBits && f.slide >= 1) {
        const dx = masterCellX(step.start - 1) - blockX0;
        const dy = MASTER_Y - KEY_Y;
        const left = 1 - ease(f.drop);
        const keyLayer = el('g', {}, svg);
        if (left > 0) keyLayer.setAttribute('transform', `translate(${r2(dx * left)} ${r2(dy * left)})`);
        keyBits.forEach((bit, i) => cell(keyLayer, blockCellX(i), KEY_Y, bit, bit === 1 ? keyOneLook : keyZeroLook));
        if (f.drop >= 1) {
          keyName(keyLayer, LABEL_W - 10, KEY_Y + CELL_H / 2 + smPx * 0.36, step.round, colors.text);
          text(keyLayer, blockX0 + blockW + 12, KEY_Y + CELL_H / 2 + smPx * 0.36, step.key, {
            'font-family': fonts.mono,
            'font-size': fontSizes.sm,
            fill: colors.textMuted,
          });
        }
      }

      // ── 겹침 식
      if (step && f.flip >= 1) {
        text(svg, blockX0 + blockW / 2, EQ_Y, t('label.eq', '{w} ⊕ {k} = {u}', { w: step.enter, k: step.key, u: step.result }), {
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
      }

      // ── 캡션
      const cap = { 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': fontSizes.md, fill: colors.text };
      const cx = PIECE_CANVAS_W / 2;
      if (!step) {
        text(svg, cx, CAPTION_Y, t('caption.start', 'Master key and plaintext. No round key mixed in yet.'), cap);
      } else if (!step.last) {
        text(
          svg,
          cx,
          CAPTION_Y,
          t('caption.round', 'Round {r}: cut from master-key positions {a}..{b} and laid over the state. Flipped bits: {n}', {
            r: step.round,
            a: step.start,
            b: step.start + BLOCK_BITS - 1,
            n: step.flipped,
          }),
          cap,
        );
      } else {
        text(
          svg,
          cx,
          CAPTION_Y,
          t('caption.last', 'Last key: positions {a}..{b}, laid over the substituted state. Flipped bits: {n}', {
            a: step.start,
            b: step.start + BLOCK_BITS - 1,
            n: step.flipped,
          }),
          cap,
        );
        text(
          svg,
          cx,
          SUMMARY_Y,
          t('caption.summary', 'Keys mixed: {k} · distinct keys: {d} · flipped bits in total: {s}', {
            k: scene.keys.length,
            d: step.distinct,
            s: step.flippedSum,
          }),
          { ...cap, 'font-size': fontSizes.sm, fill: colors.textMuted },
        );
      }
    }

    function tween(ms: number, mine: number, frame: (p: number) => void): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const t0 = Date.now();
        const wake = (): void => {
          waiters.delete(wake);
          resolve(false);
        };
        waiters.add(wake);
        const tick = (): void => {
          if (destroyed || mine !== gen) {
            wake();
            return;
          }
          const p = Math.min(1, (Date.now() - t0) / ms);
          frame(p);
          if (p >= 1) {
            waiters.delete(wake);
            resolve(true);
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, 16);
          timers.add(id);
        };
        tick();
      });
    }

    return {
      async render(next: RoundKeyMixScene, prev: RoundKeyMixScene | null, opts: { animate: boolean }): Promise<void> {
        const mine = (gen += 1);
        if (destroyed) return;
        const step = next.step;
        const fresh = opts.animate && step !== null && prev !== null && prev.keys.length === next.keys.length - 1;
        if (!fresh || !step) {
          draw(next, DONE);
          return;
        }
        const f: Frame = { pass: step.pass === 'none' ? 1 : 0, slide: step.round === 1 ? 1 : 0, drop: 0, flip: 0 };
        if (f.pass < 1) {
          if (!(await tween(PASS_MS, mine, (p) => draw(next, { ...f, pass: p })))) return;
          f.pass = 1;
        }
        if (f.slide < 1) {
          if (!(await tween(SLIDE_MS, mine, (p) => draw(next, { ...f, slide: p })))) return;
          f.slide = 1;
        }
        if (!(await tween(DROP_MS, mine, (p) => draw(next, { ...f, drop: p })))) return;
        f.drop = 1;
        if (!(await tween(FLIP_MS, mine, (p) => draw(next, { ...f, flip: p })))) return;
        if (mine === gen && !destroyed) draw(next, DONE);
      },
      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
