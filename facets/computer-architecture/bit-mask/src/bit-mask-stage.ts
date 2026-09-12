/**
 * bit-mask-stage — 구멍 뚫린 덮개가 값 위로 내려앉는 그림.
 *
 * 동사는 "가려진다" 다. 그래서 결과를 옆줄에 따로 적지 않는다 — 덮개가 자리 위에
 * 내려앉고, **구멍으로 보이는 것이 곧 결과**다. 가림막에는 0 을 새겨 두었으므로
 * 덮개가 내려앉는 순간 그 0 이 그 자리의 값이 된다.
 *
 * 덮개는 조각조각 난 뚜껑이 아니라 한 장이다 (구멍은 evenodd 로 파낸다). 여덟
 * 자리가 서로 모르는 채 **한꺼번에** 결정되는 것이 이 조각의 요점이라, 자리마다
 * 따로 움직이는 것이 하나도 없어야 한다.
 *
 * 세로는 그림이 정하고 가로는 러너가 PIECE_CANVAS_W 로 정한다 (S-piece).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const W = PIECE_CANVAS_W;

// ── 세로 자리 ────────────────────────────────────────────────────────────────
const CANVAS_H = 254;
const CAPTION_Y = 22;
const ROW_Y = 142;
const CELL_H = 60;
const READOUT_Y = 232;

// ── 가로 자리. 칸 폭은 캔버스에서 역산하고 상수는 상한만 준다 (S-piece). ─────
const CELL_MAX_W = 74;
const SIDE_MIN = 24;
const CELL_GAP = 5;

// ── 덮개 ────────────────────────────────────────────────────────────────────
/** 덮개가 칸보다 조금 크다. 가장자리까지 덮어야 덮개로 읽힌다. */
const PLATE_OVERHANG = 4;
const PLATE_LIP = 10;
const PLATE_Y = ROW_Y - PLATE_OVERHANG;
const PLATE_H = CELL_H + PLATE_OVERHANG * 2;
/** 구멍은 칸보다 조금 작다. 사이에 남는 살이 있어야 한 장으로 보인다. */
const HOLE_INSET = 4;
/** 손잡이 — 덮개가 한 물건임을 보이고 어느 마스크인지 새긴다. */
const TAB_W = 78;
const TAB_H = 22;

/** 떠 있는 자리. 여기서 칸 위로 내려앉는다. */
const HOVER_DY = -76;
/** 캔버스 밖. 덮개는 여기서 들어오고 여기로 나간다. */
const OFFSCREEN_DY = -214;

const ENTER_MS = 380;
const DROP_MS = 420;
const LIFT_MS = 360;

const NS = 'http://www.w3.org/2000/svg';

/** 도형에 새겨진 글자 — 문안이 아니라 표식이다 (C10). */
const GLYPH_ZERO = '0';
const GLYPH_ONE = '1';
const HEX_PREFIX = '0x';

type MaskScene = { maskBits: number[]; mask: number };
type ReadScene = { value: number };

type Scene = { value: number; bitCount: number };

/**
 * initialData 를 좁힌다. 이 자리가 그것을 받는 유일한 경로다 (S-piece) —
 * projector 는 같은 것을 다시 좁혀 밀어 넣지 않는다.
 */
function readScene(raw: Record<string, unknown> | undefined): Scene {
  const source = raw ?? {};
  const value = source.value;
  const bitCount = source.bitCount;
  return {
    value: typeof value === 'number' && Number.isFinite(value) ? value : 0,
    bitCount:
      typeof bitCount === 'number' && Number.isFinite(bitCount)
        ? Math.max(1, Math.floor(bitCount))
        : 8,
  };
}

function toBits(value: number, bitCount: number): number[] {
  const out: number[] = [];
  for (let i = bitCount - 1; i >= 0; i -= 1) out.push((value >> i) & 1);
  return out;
}

/** 자리 수만큼 자리를 채운 16진 표기. 171 → `AB`, 11 → `0B`. */
function toHex(value: number, bitCount: number): string {
  const digits = Math.max(1, Math.ceil(bitCount / 4));
  return value.toString(16).toUpperCase().padStart(digits, '0');
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function rectPath(x: number, y: number, w: number, h: number): string {
  return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
}

function easeOut(p: number): number {
  return 1 - (1 - p) * (1 - p) * (1 - p);
}

export const bitMaskStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const svg = params.canvas;
    // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
    svg.textContent = '';

    const scene = readScene(params.initialData);
    const { value: baseValue, bitCount } = scene;
    const baseBits = toBits(baseValue, bitCount);

    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / bitCount));
    const rowW = cellW * bitCount;
    const originX = Math.round((W - rowW) / 2);
    const boxW = cellW - CELL_GAP;
    const boxX = (i: number): number => originX + i * cellW + Math.round(CELL_GAP / 2);

    // ── 캡션 ────────────────────────────────────────────────────────────────
    // 처음에는 비어 있다. 개념을 설명하는 상시 캡션을 두지 않는다 (S-piece).
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.textMuted,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    svg.appendChild(caption);

    // ── 여덟 자리 ───────────────────────────────────────────────────────────
    const boxes: SVGRectElement[] = [];
    const glyphs: SVGTextElement[] = [];
    for (let i = 0; i < bitCount; i += 1) {
      const box = el('rect', {
        x: boxX(i),
        y: ROW_Y,
        width: boxW,
        height: CELL_H,
        rx: 4,
        fill: c.itemDefault,
        stroke: c.border,
        'stroke-width': 1,
      });
      const glyph = el('text', {
        x: boxX(i) + boxW / 2,
        y: ROW_Y + CELL_H / 2,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        fill: c.text,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      glyph.textContent = baseBits[i] === 1 ? GLYPH_ONE : GLYPH_ZERO;
      svg.appendChild(box);
      svg.appendChild(glyph);
      boxes.push(box);
      glyphs.push(glyph);
    }

    // ── 읽은 값 ─────────────────────────────────────────────────────────────
    // 잰 값은 재는 자리에 남긴다 — 줄 바로 아래다 (S-piece).
    const readout = el('text', {
      x: W / 2,
      y: READOUT_Y,
      'font-family': fonts.mono,
      'font-size': fontSizes.lg,
      fill: c.text,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    svg.appendChild(readout);

    function setReadout(value: number): void {
      readout.textContent = t('label.read', 'reads {dec} (0x{hex})', {
        dec: value,
        hex: toHex(value, bitCount),
      });
    }
    setReadout(baseValue);

    // ── 걸어 둔 것 ──────────────────────────────────────────────────────────
    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    function tween(durationMs: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);

        let start = -1;
        let id = 0;
        const tick = (now: number): void => {
          frames.delete(id);
          // 취소된 프레임은 아예 불리지 않으므로, 여기서 끊고 destroy 가 깨운다.
          if (destroyed) return;
          if (start < 0) start = now;
          const p = durationMs <= 0 ? 1 : Math.min(1, (now - start) / durationMs);
          apply(easeOut(p));
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 덮개 ────────────────────────────────────────────────────────────────
    let maskBits: number[] = [];
    let plate: SVGGElement | null = null;

    function setPlateDy(dy: number): void {
      plate?.setAttribute('transform', `translate(0, ${dy})`);
    }

    function removePlate(): void {
      plate?.remove();
      plate = null;
    }

    function buildPlate(mask: MaskScene): SVGGElement {
      const group = el('g', { transform: `translate(0, ${OFFSCREEN_DY})` });

      // 바깥 테두리 한 장에 구멍을 파낸다. 구멍난 자리마다 뚜껑을 따로 그리면
      // 덮개가 여러 물건이 되어 "한꺼번에" 가 사라진다.
      let d = rectPath(originX - PLATE_LIP, PLATE_Y, rowW + PLATE_LIP * 2, PLATE_H);
      for (let i = 0; i < bitCount; i += 1) {
        if (mask.maskBits[i] !== 1) continue;
        d += rectPath(
          boxX(i) + HOLE_INSET,
          ROW_Y + HOLE_INSET,
          boxW - HOLE_INSET * 2,
          CELL_H - HOLE_INSET * 2,
        );
      }
      group.appendChild(el('path', { d, 'fill-rule': 'evenodd', fill: c.primary }));

      // 가림막에 0 을 새긴다. 내려앉으면 이 0 이 그 자리의 값이 된다.
      for (let i = 0; i < bitCount; i += 1) {
        if (mask.maskBits[i] === 1) continue;
        const stamp = el('text', {
          x: boxX(i) + boxW / 2,
          y: ROW_Y + CELL_H / 2,
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: c.textInverse,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        stamp.textContent = GLYPH_ZERO;
        group.appendChild(stamp);
      }

      group.appendChild(
        el('rect', {
          x: W / 2 - TAB_W / 2,
          y: PLATE_Y - TAB_H,
          width: TAB_W,
          height: TAB_H,
          rx: 3,
          fill: c.primary,
        }),
      );
      const tabText = el('text', {
        x: W / 2,
        y: PLATE_Y - TAB_H / 2,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.textInverse,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      tabText.textContent = `${HEX_PREFIX}${toHex(mask.mask, bitCount)}`;
      group.appendChild(tabText);

      return group;
    }

    /** 구멍 아래 자리 — 남긴 자리에 표를 둔다. */
    function markKept(): void {
      for (let i = 0; i < bitCount; i += 1) {
        if (maskBits[i] !== 1) continue;
        boxes[i].setAttribute('fill', c.itemPivot);
        glyphs[i].setAttribute('fill', c.stateInk);
      }
    }

    function clearKept(): void {
      for (let i = 0; i < bitCount; i += 1) {
        boxes[i].setAttribute('fill', c.itemDefault);
        glyphs[i].setAttribute('fill', c.text);
      }
    }

    return {
      setCaption(text: string): void {
        caption.textContent = text;
      },

      async showMask(mask: MaskScene): Promise<void> {
        maskBits = mask.maskBits;
        removePlate();
        plate = buildPlate(mask);
        svg.appendChild(plate);
        await tween(ENTER_MS, (p) => setPlateDy(OFFSCREEN_DY + (HOVER_DY - OFFSCREEN_DY) * p));
      },

      async applyMask(result: ReadScene): Promise<void> {
        await tween(DROP_MS, (p) => setPlateDy(HOVER_DY + (0 - HOVER_DY) * p));
        // 내려앉은 뒤에야 읽는다. 여덟 자리가 같은 순간에 정해진다.
        markKept();
        setReadout(result.value);
      },

      async liftMask(result: ReadScene): Promise<void> {
        // 덮개가 움직이는 순간부터 읽히는 값이 달라진다 — 원래 값 그대로다.
        clearKept();
        setReadout(result.value);
        await tween(LIFT_MS, (p) => setPlateDy(0 + (OFFSCREEN_DY - 0) * p));
        removePlate();
      },

      resetScene(): void {
        removePlate();
        maskBits = [];
        clearKept();
        setReadout(baseValue);
        caption.textContent = '';
      },

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 promise 를 푼다. 안 그러면 unmount 된 뒤에도 알고리즘이
        // `await ctx.emit` 에서 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
