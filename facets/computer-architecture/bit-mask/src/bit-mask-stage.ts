/**
 * bit-mask-stage — 구멍 뚫린 덮개가 값 위로 내려앉는 그림.
 *
 * 동사는 "가려진다" 다. 그래서 결과를 비트 옆줄에 따로 적지 않는다 — 덮개가 자리
 * 위에 내려앉고, **구멍으로 보이는 것이 곧 결과**다. 가림막에는 0 을 새겨 두었으므로
 * 덮개가 내려앉는 순간 그 0 이 그 자리의 값이 된다.
 *
 * 덮개는 조각조각 난 뚜껑이 아니라 한 장이다 (구멍은 evenodd 로 파낸다). 여덟
 * 자리가 서로 모르는 채 **한꺼번에** 결정되는 것이 이 조각의 요점이라, 자리마다
 * 따로 움직이는 것이 하나도 없어야 한다.
 *
 * ── 한 화면에 세 줄이 선다
 *
 * 덮개가 내려앉으면 가려진 자리의 원래 비트가 보이지 않는다. 그것이 이 그림의
 * 뜻이지만, 그것만 두면 **무엇이 걸러졌는지**를 견줄 자리가 없어진다. 그래서 수로
 * 된 세 줄을 따로 세운다.
 *
 *   원래 값 — 끝까지 바뀌지 않는다 (덮개는 원본을 지우지 않는다)
 *   읽은 값 — 지금 읽히는 값. 덮개가 내려앉아 있으면 걸러진 값이다
 *   자국   — 지나온 덮개마다 `마스크 → 읽힌 값`. 걷어 내도 지워지지 않는다
 *
 * 마지막 줄이 옛 stage 에 없던 것이다. 옛 `liftMask` 는 덮개를 걷으며 물든 칸을
 * 함께 거뒀고, 그래서 "같은 값에 다른 덮개를 씌우면 다른 것이 남는다" 가 한 화면에
 * 선 적이 없었다 (`scene.ts` 의 머리글).
 *
 * ── 칸이 말하는 것 셋을 한 축에 얹지 않는다
 *
 *   글리프 0/1 — 값 자체. 바탕이라 끝까지 안 바뀐다
 *   채움      — **값의 형편.** 지금 이 자리가 통과하고 있나 (덮개가 내려앉은 동안)
 *   테두리    — **표식.** 이 덮개가 이 자리를 열어 두었나 (뜬 순간부터 걷을 때까지)
 *
 * 셋을 한 칠에 얹으면 "열어 두었다" 가 "통과했다" 에 덮여, 덮개가 떠 있는 동안
 * 화면이 아무 말도 하지 않게 된다.
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
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  currentCover,
  liftingCover,
  marksOf,
  openedAt,
  passingAt,
  readingOf,
  bitsOf,
  type BitMaskCaption,
  type BitMaskCover,
  type BitMaskScene,
} from './scene.js';

const W = PIECE_CANVAS_W;

// ── 세로 자리 ────────────────────────────────────────────────────────────────
const CANVAS_H = 306;
const CAPTION_Y = 22;
const ROW_Y = 142;
const CELL_H = 60;
/** 원래 값 — 바뀌지 않는 줄. */
const VALUE_Y = 232;
/** 읽은 값 — 덮개에 따라 갈리는 줄. 잰 값은 재는 자리 아래에 남긴다 (S-piece). */
const READ_Y = 258;
/** 자국 — 지나온 덮개들. */
const TRAIL_Y = 288;
/** 자국 한 칸의 가로 몫 상한. */
const TRAIL_SLOT_MAX = 190;

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
/** 내려앉은 자리. */
const SEATED_DY = 0;
/** 캔버스 밖. 덮개는 여기서 들어오고 여기로 나간다. */
const OFFSCREEN_DY = -214;

const ENTER_MS = 380;
const DROP_MS = 420;
const LIFT_MS = 360;

/** 열린 자리의 테두리 굵기. 기본 테두리와 굵기로도 갈린다. */
const OPEN_STROKE_W = 2.5;

const NS = 'http://www.w3.org/2000/svg';

/** 도형에 새겨진 글자 — 문안이 아니라 표식이다 (C10). */
const GLYPH_ZERO = '0';
const GLYPH_ONE = '1';
const HEX_PREFIX = '0x';
const GLYPH_ARROW = '→';

type Geom = {
  bitCount: number;
  rowW: number;
  originX: number;
  boxW: number;
  boxX: (i: number) => number;
};

/** 자리를 **먼저 한 번에 셈하고** 그 다음에 그린다 (프로토콜 4 절). */
function geomOf(bitCount: number): Geom {
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / bitCount));
  const rowW = cellW * bitCount;
  const originX = Math.round((W - rowW) / 2);
  return {
    bitCount,
    rowW,
    originX,
    boxW: cellW - CELL_GAP,
    boxX: (i: number): number => originX + i * cellW + Math.round(CELL_GAP / 2),
  };
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
    const c: Palette = getColors(params.theme);
    const svg = params.canvas;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 덮개를 흘리는 프레임이 여러 번 돈다. 가운데에 되짚기가 끼어들면 남은 프레임이
     * **이미 새로 선 화면**을 덮을 수 있으므로, 프레임마다 자기 번호가 아직 유효한지
     * 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서 그것을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    function tween(durationMs: number, mine: number, apply: (e: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
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
          if (!alive(mine)) {
            finish();
            return;
          }
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

    // ── 덮개 짓기 ───────────────────────────────────────────────────────────

    function setPlateDy(node: SVGGElement, dy: number): void {
      node.setAttribute('transform', `translate(0, ${dy})`);
    }

    function buildPlate(cover: BitMaskCover, g: Geom, dy: number): SVGGElement {
      const group = el('g', {});
      setPlateDy(group, dy);
      const holes = bitsOf(cover.mask, g.bitCount);

      // 바깥 테두리 한 장에 구멍을 파낸다. 구멍난 자리마다 뚜껑을 따로 그리면
      // 덮개가 여러 물건이 되어 "한꺼번에" 가 사라진다.
      let d = rectPath(g.originX - PLATE_LIP, PLATE_Y, g.rowW + PLATE_LIP * 2, PLATE_H);
      for (let i = 0; i < g.bitCount; i += 1) {
        if (holes[i] !== 1) continue;
        d += rectPath(
          g.boxX(i) + HOLE_INSET,
          ROW_Y + HOLE_INSET,
          g.boxW - HOLE_INSET * 2,
          CELL_H - HOLE_INSET * 2,
        );
      }
      group.appendChild(el('path', { d, 'fill-rule': 'evenodd', fill: c.primary }));

      // 가림막에 0 을 새긴다. 내려앉으면 이 0 이 그 자리의 값이 된다.
      for (let i = 0; i < g.bitCount; i += 1) {
        if (holes[i] === 1) continue;
        const stamp = el('text', {
          x: g.boxX(i) + g.boxW / 2,
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
      tabText.textContent = `${HEX_PREFIX}${toHex(cover.mask, g.bitCount)}`;
      group.appendChild(tabText);

      return group;
    }

    // ── 문안 ────────────────────────────────────────────────────────────────

    function captionText(caption: BitMaskCaption | null): string {
      if (caption === null) return '';
      switch (caption.kind) {
        case 'mask':
          return t('caption.mask', 'The cover is punched: 1 is a hole, 0 is a lid.');
        case 'applied':
          return t(
            'caption.applied',
            'Only the bits under the holes come through — all eight positions decide at once.',
          );
        case 'lifted':
          return t('caption.lifted', 'Take the cover off and the original value is untouched.');
        case 'done':
          return t('caption.done', 'A mask keeps just the positions you need.');
      }
    }

    function numberText(key: string, en: string, value: number, bitCount: number): string {
      return t(key, en, { dec: value, hex: toHex(value, bitCount) });
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────
    //
    // 늘 비우고 시작하므로 되돌릴 명령이 없다 (S-scene). 지금 화면에 있는 덮개의
    // 손잡이만 밖으로 내어 흐르는 그림이 잡게 한다.

    let plate: SVGGElement | null = null;

    function draw(scene: BitMaskScene): void {
      // 캔버스 **안쪽**만 비운다. 컨테이너를 비우면 캔버스가 떨어져 나간다 (S-view).
      svg.textContent = '';
      plate = null;

      const g = geomOf(scene.bitCount);
      const bits = bitsOf(scene.base, scene.bitCount);
      const opened = openedAt(scene);
      const passing = passingAt(scene);

      const caption = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: c.textMuted,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      caption.textContent = captionText(scene.caption);
      svg.appendChild(caption);

      for (let i = 0; i < scene.bitCount; i += 1) {
        const box = el('rect', {
          x: g.boxX(i),
          y: ROW_Y,
          width: g.boxW,
          height: CELL_H,
          rx: 4,
          // 채움 = 값의 형편. 테두리 = 이 덮개가 연 자리라는 표식.
          fill: passing[i] ? c.itemPivot : c.itemDefault,
          stroke: opened[i] ? c.primary : c.border,
          'stroke-width': opened[i] ? OPEN_STROKE_W : 1,
        });
        const glyph = el('text', {
          x: g.boxX(i) + g.boxW / 2,
          y: ROW_Y + CELL_H / 2,
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          // 값 자체는 바뀌지 않는다. 물든 칸에서만 바탕에 맞춰 먹을 갈아 끼운다.
          fill: passing[i] ? c.stateInk : c.text,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        glyph.textContent = bits[i] === 1 ? GLYPH_ONE : GLYPH_ZERO;
        svg.appendChild(box);
        svg.appendChild(glyph);
      }

      const cover = currentCover(scene);
      if (cover !== null) {
        plate = buildPlate(cover, g, cover.result === null ? HOVER_DY : SEATED_DY);
        svg.appendChild(plate);
      }

      const valueLine = el('text', {
        x: W / 2,
        y: VALUE_Y,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: c.textMuted,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      valueLine.textContent = numberText(
        'label.value',
        'value {dec} (0x{hex})',
        scene.base,
        scene.bitCount,
      );
      svg.appendChild(valueLine);

      const readLine = el('text', {
        x: W / 2,
        y: READ_Y,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        fill: c.text,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      readLine.textContent = numberText(
        'label.read',
        'reads {dec} (0x{hex})',
        readingOf(scene),
        scene.bitCount,
      );
      svg.appendChild(readLine);

      drawTrail(scene, cover);
    }

    /**
     * 지나온 덮개들의 자국.
     *
     * 지금 것과 지나간 것을 **어휘로 가른다** — 지금 것만 진하다. 둘이 같은 모양이면
     * 읽은 값 줄이 어느 자국을 가리키는지 알 수 없다 (프로토콜 4 절).
     */
    function drawTrail(scene: BitMaskScene, cover: BitMaskCover | null): void {
      const marks = marksOf(scene);
      if (marks.length === 0) return;
      const slot = Math.min(
        TRAIL_SLOT_MAX,
        Math.floor((W - SIDE_MIN * 2) / marks.length),
      );
      for (const [i, mark] of marks.entries()) {
        const now = mark === cover;
        const chip = el('text', {
          x: Math.round(W / 2 + (i - (marks.length - 1) / 2) * slot),
          y: TRAIL_Y,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: now ? c.text : c.textMuted,
          'font-weight': now ? 600 : 400,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
        });
        chip.textContent =
          `${HEX_PREFIX}${toHex(mark.mask, scene.bitCount)}` +
          ` ${GLYPH_ARROW} ${mark.result ?? scene.base}`;
        svg.appendChild(chip);
      }
    }

    // ── 흐르는 그림 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 덮개는 이미 끝 자리에 서 있다. 운동은 **아직 못 온
    // 만큼을 뒤로 물리는** 꼴이고, 그 물림을 프레임 밖에서 먼저 박아 두어야 첫
    // 프레임에 끝 자리가 번쩍이지 않는다.

    function slide(
      node: SVGGElement,
      from: number,
      to: number,
      ms: number,
      mine: number,
    ): Promise<void> {
      setPlateDy(node, from);
      return tween(ms, mine, (e) => {
        if (!alive(mine)) return;
        setPlateDy(node, from + (to - from) * e);
      });
    }

    async function flow(scene: BitMaskScene, mine: number): Promise<void> {
      const kind = scene.step?.kind;
      if (kind === 'show' && plate !== null) {
        await slide(plate, OFFSCREEN_DY, HOVER_DY, ENTER_MS, mine);
        return;
      }
      if (kind === 'drop' && plate !== null) {
        await slide(plate, HOVER_DY, SEATED_DY, DROP_MS, mine);
        return;
      }
      if (kind === 'lift') {
        // 걷는 덮개는 정적 화면에 없다. 출발 그림을 `prev` 에서 꺼내면 위반이므로
        // 장면이 쥔 자국에서 다시 지어 흘린다 (S-scene).
        const gone = liftingCover(scene);
        if (gone === null) return;
        const ghost = buildPlate(gone, geomOf(scene.bitCount), SEATED_DY);
        svg.appendChild(ghost);
        await slide(ghost, SEATED_DY, OFFSCREEN_DY, LIFT_MS, mine);
        ghost.remove();
      }
    }

    async function render(
      next: BitMaskScene,
      _prev: BitMaskScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      draw(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 임시 덮개가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      draw(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
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
