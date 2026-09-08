/**
 * hash-to-bucket-stage — "값을 자리 번호로 바꾼다" 조각의 전용 stage view.
 *
 * 동사는 **접힌다** 이므로 화면의 모든 걸음이 실제 이동으로 일어난다.
 *   · 키의 글자 칸들이 가운데로 모여들며 하나의 정수 칩으로 접힌다.
 *   · 부호 비트 조각이 칩에서 떨어져 나가 아래로 떨어지고, 남은 칩이 다시 가운데로 미끄러진다.
 *   · 칩이 자리 띠를 한 바퀴 감아 돌다 제 자리에서 멈추고, 그 자리로 눌려 들어가 이름표가 된다.
 *
 * 화면에 그리는 글자는 데이터가 주는 표식뿐이다 (글자 · 숫자 · 자리 번호).
 * 문장은 projector 가 번역해 `setCaption` 으로 넘긴다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 좌표. 폭은 러너가 정하고 (PIECE_CANVAS_W) 세로는 내용이 정한다 (S-view).
const W = PIECE_CANVAS_W;

const SIDE_MIN = 26;
const BUCKET_MAX_W = 64;
const BUCKET_GAP = 8;

const CELL_MAX_W = 40;
const CELL_GAP = 4;
const CELL_H = 34;

const KEY_CY = 37;
const HASH_CY = 101;
const TRACK_CY = 163;

const BUCKET_TOP = 190;
const BUCKET_H = 56;
const SLOT_LABEL_Y = 262;
const CAPTION_Y = 286;
const STAGE_H = 300;

const CHIP_H = 34;
const CHIP_MIN_W = 84;
const TILE_W = 26;
const TILE_GAP = 8;
const TAG_H = 18;
const TAG_GAP = 4;

/** 모노 글꼴 한 글자의 대략 폭 비율. 칩 폭을 글자 수에서 역산할 때 쓴다. */
const MONO_CH_RATIO = 0.62;

const CX = W / 2;
/** 부호 비트 조각이 왼쪽에 붙어 있는 동안의 칩 중심 — 조립 전체가 가운데 오도록 민다. */
const CX_WITH_TILE = CX + (TILE_W + TILE_GAP) / 2;

// ── 걸음별 애니메이션 길이 (ms). stepMs 의 쉼과 겹치지 않게 짧게 잡는다.
const MS_KEY_IN = 260;
const MS_FOLD_IN = 320;
const MS_CHIP_DROP = 280;
const MS_BIT_FALL = 260;
const MS_RECENTER = 240;
const MS_TO_TRACK = 160;
const MS_WRAP = 560;
const MS_PRESS_IN = 280;
const MS_SETTLE = 520;

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function pxNum(token: string): number {
  return Number.parseFloat(token);
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** i 번째 요소가 조금씩 늦게 출발하도록 전체 진행도를 개별 진행도로 나눈다. */
function staggered(t: number, i: number, count: number): number {
  const lead = count > 1 ? Math.min(0.45, 0.09 * (count - 1)) : 0;
  const start = count > 1 ? (lead * i) / (count - 1) : 0;
  return clamp01((t - start) / (1 - lead));
}

type BucketGeometry = {
  width: number;
  pitch: number;
  originX: number;
  centerOf(index: number): number;
};

/**
 * 자리 띠는 캔버스 폭을 채운다 — 요소 크기를 못박고 남는 폭을 여백으로 버리지
 * 않는다 (S-piece). 상수는 상한이고 실제 폭은 캔버스에서 역산한다.
 */
function bucketGeometry(count: number): BucketGeometry {
  const width = Math.min(
    BUCKET_MAX_W,
    Math.floor((W - SIDE_MIN * 2 - BUCKET_GAP * (count - 1)) / count),
  );
  const pitch = width + BUCKET_GAP;
  const span = count * width + BUCKET_GAP * (count - 1);
  const originX = Math.round((W - span) / 2);
  return {
    width,
    pitch,
    originX,
    centerOf: (index: number) => originX + index * pitch + width / 2,
  };
}

type Chip = {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  tile: SVGGElement | null;
  width: number;
};

type Tag = { g: SVGGElement; cx: number; cy: number };

export const hashToBucketStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);

    svg.setAttribute('viewBox', `0 0 ${W} ${STAGE_H}`);

    const bucketLayer = el('g');
    const tagLayer = el('g');
    const keyLayer = el('g');
    const chipLayer = el('g');
    const caption = el('text', {
      x: CX,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      fill: c.textMuted,
      'font-family': fonts.body,
      'font-size': fontSizes.md,
    });
    const root = el('g');
    root.append(bucketLayer, tagLayer, keyLayer, chipLayer, caption);
    svg.appendChild(root);

    // ── 진행 중인 이동. 되돌리기/파기 때 전부 끝 상태로 접고 멈춘다.
    const pending = new Set<() => void>();

    function animate(durationMs: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        let raf = 0;
        let finished = false;
        const finish = (snap: boolean): void => {
          if (finished) return;
          finished = true;
          cancelAnimationFrame(raf);
          pending.delete(cancel);
          if (snap) onFrame(1);
          resolve();
        };
        const cancel = (): void => finish(true);
        pending.add(cancel);

        const started = performance.now();
        const tick = (): void => {
          if (finished) return;
          const t = clamp01((performance.now() - started) / durationMs);
          onFrame(t);
          if (t >= 1) {
            finish(false);
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      });
    }

    function cancelPending(): void {
      for (const cancel of [...pending]) cancel();
      pending.clear();
    }

    // ── 장면 상태
    let geo: BucketGeometry | null = null;
    let bucketRects: SVGRectElement[] = [];
    let tagCounts: number[] = [];
    let cells: SVGGElement[] = [];
    let cellXs: number[] = [];
    let chip: Chip | null = null;
    const tags: Tag[] = [];

    function ensureBuckets(count: number): void {
      if (geo && bucketRects.length === count) return;
      bucketLayer.textContent = '';
      bucketRects = [];
      tagCounts = new Array<number>(count).fill(0);
      geo = bucketGeometry(count);

      for (let i = 0; i < count; i++) {
        const rect = el('rect', {
          x: geo.originX + i * geo.pitch,
          y: BUCKET_TOP,
          width: geo.width,
          height: BUCKET_H,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1.5,
        });
        const label = el('text', {
          x: geo.centerOf(i),
          y: SLOT_LABEL_Y,
          'text-anchor': 'middle',
          fill: c.textMuted,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        label.textContent = String(i);
        bucketLayer.append(rect, label);
        bucketRects.push(rect);
      }
    }

    function chipWidth(text: string): number {
      const ch = pxNum(fontSizes.lg) * MONO_CH_RATIO;
      return Math.max(CHIP_MIN_W, Math.round(text.length * ch + 24));
    }

    function setChipWidth(target: Chip, width: number): void {
      target.rect.setAttribute('x', String(-width / 2));
      target.rect.setAttribute('width', String(width));
    }

    function buildChip(text: string, signBit: number): Chip {
      const width = chipWidth(text);
      const g = el('g', { transform: `translate(${CX}, ${KEY_CY}) scale(0.45)` });

      const rect = el('rect', {
        x: -width / 2,
        y: -CHIP_H / 2,
        width,
        height: CHIP_H,
        rx: 8,
        fill: c.bg,
        stroke: c.accent,
        'stroke-width': 2.5,
      });
      const label = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: c.text,
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
      });
      label.textContent = text;

      // 부호 비트 조각 — 칩의 왼쪽에 물려 있다가 다음 걸음에 떨어져 나간다.
      const tile = el('g', { transform: `translate(${-(width / 2 + TILE_GAP + TILE_W / 2)}, 0)` });
      const tileRect = el('rect', {
        x: -TILE_W / 2,
        y: -CHIP_H / 2,
        width: TILE_W,
        height: CHIP_H,
        rx: 5,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1.5,
        'stroke-dasharray': '4 3',
      });
      const tileLabel = el('text', {
        x: 0,
        y: 0,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
      });
      tileLabel.textContent = String(signBit);
      tile.append(tileRect, tileLabel);

      g.append(rect, label, tile);
      chipLayer.appendChild(g);
      return { g, rect, label, tile, width };
    }

    function tagCenterY(slot: number): number {
      const stacked = tagCounts[slot] ?? 0;
      return BUCKET_TOP + BUCKET_H - 10 - stacked * (TAG_H + TAG_GAP) - TAG_H / 2;
    }

    function clearRun(): void {
      cancelPending();
      keyLayer.textContent = '';
      chipLayer.textContent = '';
      tagLayer.textContent = '';
      caption.textContent = '';
      cells = [];
      cellXs = [];
      chip = null;
      tags.length = 0;
      tagCounts = tagCounts.map(() => 0);
      for (const rect of bucketRects) {
        rect.setAttribute('stroke', c.border);
        rect.setAttribute('stroke-width', '1.5');
      }
    }

    // 정적 장면은 마운트 때 세운다. 자리 개수는 저작 선언이 준다.
    const initial = params.initialData;
    const declaredCount = initial?.bucketCount;
    if (typeof declaredCount === 'number' && Number.isInteger(declaredCount) && declaredCount > 0) {
      ensureBuckets(declaredCount);
    }

    return {
      destroy(): void {
        cancelPending();
        root.remove();
      },

      clear(): void {
        clearRun();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      /**
       * 키가 글자 칸으로 나타난다. 칸 줄은 폭을 채우지 않는다 — 줄의 길이 자체가
       * "키마다 길이가 다르다" 는 전제를 말하므로, 짧은 키는 짧게 보여야 한다.
       */
      async showKey(key: string): Promise<void> {
        cancelPending();
        keyLayer.textContent = '';
        cells = [];
        cellXs = [];

        const chars = [...key];
        const n = chars.length;
        if (n === 0) return;

        const cellW = Math.min(
          CELL_MAX_W,
          Math.floor((W - SIDE_MIN * 2 - CELL_GAP * (n - 1)) / n),
        );
        const span = n * cellW + CELL_GAP * (n - 1);
        const x0 = (W - span) / 2;

        chars.forEach((ch, i) => {
          const cx = x0 + i * (cellW + CELL_GAP) + cellW / 2;
          const g = el('g', { transform: `translate(${cx}, ${KEY_CY - 18})`, opacity: 0 });
          const rect = el('rect', {
            x: -cellW / 2,
            y: -CELL_H / 2,
            width: cellW,
            height: CELL_H,
            rx: 5,
            fill: c.bg,
            stroke: c.border,
            'stroke-width': 1.5,
          });
          const label = el('text', {
            x: 0,
            y: 0,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            fill: c.text,
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
          });
          label.textContent = ch;
          g.append(rect, label);
          keyLayer.appendChild(g);
          cells.push(g);
          cellXs.push(cx);
        });

        await animate(MS_KEY_IN, (t) => {
          cells.forEach((g, i) => {
            const lt = staggered(t, i, cells.length);
            const e = easeOut(lt);
            g.setAttribute('transform', `translate(${cellXs[i]}, ${KEY_CY - 18 * (1 - e)})`);
            g.setAttribute('opacity', String(e));
          });
        });
      },

      /** 글자 칸들이 가운데로 모여들며 하나의 정수로 접힌다. */
      async foldToHash(hash: number, signBit: number): Promise<void> {
        cancelPending();

        if (cells.length > 0) {
          await animate(MS_FOLD_IN, (t) => {
            cells.forEach((g, i) => {
              const e = easeInOut(staggered(t, i, cells.length));
              const x = cellXs[i] + (CX - cellXs[i]) * e;
              const s = 1 - 0.78 * e;
              g.setAttribute('transform', `translate(${x}, ${KEY_CY}) scale(${s})`);
              g.setAttribute('opacity', String(1 - e * e));
            });
          });
        }
        keyLayer.textContent = '';
        cells = [];
        cellXs = [];

        chip = buildChip(String(hash), signBit);
        const target = chip;
        await animate(MS_CHIP_DROP, (t) => {
          const e = easeOut(t);
          const y = KEY_CY + (HASH_CY - KEY_CY) * e;
          const s = 0.45 + 0.55 * e;
          const x = CX + (CX_WITH_TILE - CX) * e;
          target.g.setAttribute('transform', `translate(${x}, ${y}) scale(${s})`);
        });
      },

      /** 부호 비트 조각이 떨어져 나가고, 남은 수가 가운데로 미끄러진다. */
      async dropSignBit(masked: number): Promise<void> {
        cancelPending();
        const target = chip;
        if (!target) return;

        const tile = target.tile;
        if (tile) {
          const baseX = -(target.width / 2 + TILE_GAP + TILE_W / 2);
          await animate(MS_BIT_FALL, (t) => {
            const e = easeIn(t);
            tile.setAttribute('transform', `translate(${baseX}, ${e * 150}) rotate(${e * 24})`);
            tile.setAttribute('opacity', String(1 - t * t));
          });
          tile.remove();
          target.tile = null;
        }

        const from = target.width;
        const to = chipWidth(String(masked));
        target.label.textContent = String(masked);
        await animate(MS_RECENTER, (t) => {
          const e = easeOut(t);
          setChipWidth(target, from + (to - from) * e);
          const x = CX_WITH_TILE + (CX - CX_WITH_TILE) * e;
          target.g.setAttribute('transform', `translate(${x}, ${HASH_CY})`);
        });
        target.width = to;
      },

      /**
       * 수가 자리 띠를 감아 돌다 제 자리에서 멈추고, 그 자리로 눌려 들어간다.
       * 감기는 동작이 곧 나머지 연산이다 — 자리 수를 넘으면 처음으로 돌아온다.
       */
      async landInBucket(key: string, slot: number, bucketCount: number): Promise<void> {
        cancelPending();
        ensureBuckets(bucketCount);
        const target = chip;
        const g = geo;
        if (!target || !g) return;

        await animate(MS_TO_TRACK, (t) => {
          const e = easeInOut(t);
          target.g.setAttribute('transform', `translate(${CX}, ${HASH_CY + (TRACK_CY - HASH_CY) * e})`);
        });

        const startUnit = (CX - g.originX - g.width / 2) / g.pitch;
        const endUnit = bucketCount + slot;
        await animate(MS_WRAP, (t) => {
          const u = startUnit + (endUnit - startUnit) * easeOut(t);
          const wrapped = ((u % bucketCount) + bucketCount) % bucketCount;
          const x = g.originX + wrapped * g.pitch + g.width / 2;
          target.g.setAttribute('transform', `translate(${x}, ${TRACK_CY})`);
        });

        const rect = bucketRects[slot];
        rect?.setAttribute('stroke', c.accent);
        rect?.setAttribute('stroke-width', '2.5');

        const landX = g.centerOf(slot);
        const landY = tagCenterY(slot);
        const tagW = g.width - 12;
        const fromW = target.width;
        target.label.textContent = key;
        target.label.setAttribute('font-size', fontSizes.sm);

        await animate(MS_PRESS_IN, (t) => {
          const e = easeInOut(t);
          const width = fromW + (tagW - fromW) * e;
          const height = CHIP_H + (TAG_H - CHIP_H) * e;
          setChipWidth(target, width);
          target.rect.setAttribute('y', String(-height / 2));
          target.rect.setAttribute('height', String(height));
          target.g.setAttribute(
            'transform',
            `translate(${landX}, ${TRACK_CY + (landY - TRACK_CY) * e})`,
          );
        });

        // 자리에 앉은 값은 이름표로 굳는다.
        target.rect.setAttribute('fill', c.itemSorted);
        target.rect.setAttribute('stroke', c.itemSorted);
        target.rect.setAttribute('stroke-width', '1');
        target.label.setAttribute('fill', c.textInverse);
        rect?.setAttribute('stroke', c.border);
        rect?.setAttribute('stroke-width', '1.5');

        tagLayer.appendChild(target.g);
        tags.push({ g: target.g, cx: landX, cy: landY });
        tagCounts[slot] = (tagCounts[slot] ?? 0) + 1;
        chip = null;
      },

      /** 다 접히고 나면 자리에 앉은 이름표들이 한 번 들썩인다. */
      async settle(): Promise<void> {
        cancelPending();
        if (tags.length === 0) return;
        await animate(MS_SETTLE, (t) => {
          tags.forEach((tag, i) => {
            const lt = staggered(t, i, tags.length);
            const bob = Math.sin(Math.PI * lt) * -7;
            tag.g.setAttribute('transform', `translate(${tag.cx}, ${tag.cy + bob})`);
          });
        });
      },
    };
  },
};
