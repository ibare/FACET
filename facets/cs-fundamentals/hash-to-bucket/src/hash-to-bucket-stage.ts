/**
 * hash-to-bucket-stage — "값을 자리 번호로 바꾼다" 조각의 전용 stage view.
 *
 * 동사는 **접힌다** 이므로 화면의 모든 걸음이 실제 이동으로 일어난다.
 *   · 키의 글자 칸들이 가운데로 모여들며 하나의 정수 칩으로 접힌다.
 *   · 부호 비트 조각이 칩에서 떨어져 나가 아래로 떨어지고, 남은 칩이 다시 가운데로 미끄러진다.
 *   · 칩이 자리 띠를 한 바퀴 감아 돌다 제 자리에서 멈추고, 그 자리로 눌려 들어가 이름표가 된다.
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`showKey()` · `foldToHash()` · `landInBucket()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render` 하나가 장면을 받아 화면 **전체**를 세우고,
 * 방금 달라진 한 자리만 흐르게 한다 (S-scene).
 *
 * 정적 그리기가 정본이므로 운동의 방향이 뒤집힌다 — 요소는 이미 끝 자리에 서 있고,
 * 흐르게 할 때만 출발 그림으로 되돌려 놓고 시작한다. 그 출발 그림은 `prev` 를
 * 들추지 않고 장면이 실어 온 계기값(`fold.hash` · `step.masked`)에서 셈으로
 * 복원한다.
 *
 * **자리에 앉은 이름표는 남는 자취다.** 정적 그리기가 매번 다시 세우므로 어느
 * 걸음으로 되짚어도 그때까지 앉은 것이 그대로 선다.
 *
 * 화면에 그리는 글자는 장면이 주는 표식뿐이다 (글자 · 숫자 · 자리 번호). 문장이
 * 되는 캡션은 장면이 말하려는 것과 인자만 받아 여기서 `params.t` 로 만든다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  BucketTag,
  FoldCaption,
  FoldStage,
  FoldStep,
  HashToBucketScene,
} from './scene.js';

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

/** 글자 칸이 아래에서 올라오는 거리. */
const KEY_RISE = 18;
/** 부호 비트 조각이 떨어지는 거리. */
const TILE_FALL = 150;

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

/** 이름표가 그 자리에 몇 번째로 앉았나에서 높이를 셈한다. 장면은 차례만 말한다. */
function tagCenterY(stacked: number): number {
  return BUCKET_TOP + BUCKET_H - 10 - stacked * (TAG_H + TAG_GAP) - TAG_H / 2;
}

/**
 * 앉은 차례를 자리로 편다.
 *
 * 같은 칸에 몇 개가 먼저 앉았나는 배열을 앞에서부터 세면 나온다 — 옛 stage 가
 * 쥐고 있던 `tagCounts` 는 이 셈을 화면 바깥에 숨겨 둔 것이었다.
 */
function tagPositions(tags: BucketTag[], g: BucketGeometry): { cx: number; cy: number }[] {
  const stacked: number[] = [];
  return tags.map((tag) => {
    const n = stacked[tag.slot] ?? 0;
    stacked[tag.slot] = n + 1;
    return { cx: g.centerOf(tag.slot), cy: tagCenterY(n) };
  });
}

/** 화면 위의 칩. 폭은 그린 쪽이 안다 — 장면이 아니라 여기의 셈이다. */
type Chip = {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  tile: SVGGElement | null;
  width: number;
};

export const hashToBucketStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HashToBucketScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

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

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 이 조각의 걸음은 마디가 여럿 이어진 **사슬**이다 (모임 → 떨어짐 → 미끄러짐,
     * 또는 내려감 → 감아 돎 → 눌림). 중간에 되짚기가 끼어들면 남은 마디들이 깨어나
     * 이미 새로 선 화면을 덮는다. 캡션처럼 정적 그리기가 다시 만들지 않고 계속 쓰는
     * 요소가 있으므로 "매번 새로 만든다" 만 믿을 수 없다. 마디마다 자기 번호가 아직
     * 유효한지 보고, 아니면 화면에 손대지 않고 물러난다 (S-scene).
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 취소 가능한 시간 진행.
     *
     * 깨워서 끝낼 때는 아무것도 그리지 않는다 — 끝값을 쓰면 그것이 곧 덮어쓰기다.
     */
    function animate(ms: number, onFrame: (t: number) => void, live: () => boolean): Promise<void> {
      if (!live()) return Promise.resolve();
      if (destroyed || typeof requestAnimationFrame !== 'function') {
        onFrame(1);
        return Promise.resolve();
      }
      onFrame(0);
      return new Promise<void>((resolve) => {
        let id = 0;
        let origin = -1;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          frames.delete(id);
          if (settled) return;
          if (destroyed || !live()) {
            finish();
            return;
          }
          if (origin < 0) origin = now;
          const p = ms <= 0 ? 1 : clamp01((now - origin) / ms);
          onFrame(p);
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

    // ── 장면이 정하는 것들. 매 render 마다 새로 세운다.
    let geo: BucketGeometry | null = null;
    let bucketRects: SVGRectElement[] = [];
    let tagNodes: SVGGElement[] = [];
    let cells: SVGGElement[] = [];
    let cellXs: number[] = [];

    function chipWidth(text: string): number {
      const ch = pxNum(fontSizes.lg) * MONO_CH_RATIO;
      return Math.max(CHIP_MIN_W, Math.round(text.length * ch + 24));
    }

    function setChipWidth(target: Chip, width: number): void {
      target.rect.setAttribute('x', String(-width / 2));
      target.rect.setAttribute('width', String(width));
    }

    /** 부호 비트 조각은 `signBit` 이 주어질 때만 붙는다 — 떨군 뒤에는 없다. */
    function buildChip(text: string, signBit: number | null): Chip {
      const width = chipWidth(text);
      const g = el('g', { transform: `translate(${CX}, ${HASH_CY})` });

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
      g.append(rect, label);

      let tile: SVGGElement | null = null;
      if (signBit !== null) {
        tile = el('g', { transform: `translate(${-(width / 2 + TILE_GAP + TILE_W / 2)}, 0)` });
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
        g.appendChild(tile);
      }

      chipLayer.appendChild(g);
      return { g, rect, label, tile, width };
    }

    function placeChip(target: Chip, x: number, y: number): void {
      target.g.setAttribute('transform', `translate(${x}, ${y})`);
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 되돌릴 명령을 따로 둘
    // 필요가 없고, 어느 걸음에서 어느 걸음으로 가든 같은 길이다.

    /** 늘 비우고 시작한다 (S-scene). */
    function rewind(): void {
      bucketLayer.textContent = '';
      tagLayer.textContent = '';
      keyLayer.textContent = '';
      chipLayer.textContent = '';
      caption.textContent = '';
      geo = null;
      bucketRects = [];
      tagNodes = [];
      cells = [];
      cellXs = [];
    }

    /** 자리 띠. 칸 수는 저작 선언이 정하고 폭은 캔버스에서 역산한다. */
    function drawBuckets(count: number): void {
      if (count <= 0) return;
      const g = bucketGeometry(count);
      geo = g;
      for (let i = 0; i < count; i++) {
        const rect = el('rect', {
          x: g.originX + i * g.pitch,
          y: BUCKET_TOP,
          width: g.width,
          height: BUCKET_H,
          rx: 6,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1.5,
        });
        const label = el('text', {
          x: g.centerOf(i),
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

    /** 자리에 앉은 이름표들 — 되짚어도 남아야 하는 자취이므로 정적으로 세운다. */
    function drawTags(tags: BucketTag[]): void {
      const g = geo;
      if (!g || tags.length === 0) return;
      const spots = tagPositions(tags, g);
      const width = g.width - 12;
      tags.forEach((tag, i) => {
        const spot = spots[i];
        const node = el('g', { transform: `translate(${spot.cx}, ${spot.cy})` });
        const rect = el('rect', {
          x: -width / 2,
          y: -TAG_H / 2,
          width,
          height: TAG_H,
          rx: 8,
          fill: c.itemSorted,
          stroke: c.itemSorted,
          'stroke-width': 1,
        });
        const label = el('text', {
          x: 0,
          y: 0,
          'text-anchor': 'middle',
          'dominant-baseline': 'central',
          fill: c.textInverse,
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
        });
        label.textContent = tag.key;
        node.append(rect, label);
        tagLayer.appendChild(node);
        tagNodes.push(node);
      });
    }

    /**
     * 키의 글자 칸을 늘어놓는다.
     *
     * 칸 줄은 폭을 채우지 않는다 — 줄의 길이 자체가 "키마다 길이가 다르다" 는
     * 전제를 말하므로, 짧은 키는 짧게 보여야 한다.
     */
    function drawCells(key: string): void {
      const chars = [...key];
      const n = chars.length;
      if (n === 0) return;

      const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2 - CELL_GAP * (n - 1)) / n));
      const span = n * cellW + CELL_GAP * (n - 1);
      const x0 = (W - span) / 2;

      chars.forEach((ch, i) => {
        const cx = x0 + i * (cellW + CELL_GAP) + cellW / 2;
        const g = el('g', { transform: `translate(${cx}, ${KEY_CY})` });
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
    }

    /** 접히는 중인 키를 그 걸음의 모습으로 세운다. */
    function drawFold(fold: FoldStage | null): void {
      if (fold === null) return;
      switch (fold.kind) {
        case 'key':
          drawCells(fold.key);
          return;
        case 'hash': {
          const target = buildChip(String(fold.hash), fold.signBit);
          placeChip(target, CX_WITH_TILE, HASH_CY);
          return;
        }
        case 'masked': {
          const target = buildChip(String(fold.masked), null);
          placeChip(target, CX, HASH_CY);
          return;
        }
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: FoldCaption | null): void {
      if (cap === null) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'key':
          caption.textContent = t(
            'caption.key',
            'Keys differ in length — "{key}" has {len} characters.',
            { key: cap.key, len: [...cap.key].length },
          );
          return;
        case 'fold':
          caption.textContent = t('caption.fold', 'The hash function folds it into one integer: {hash}', {
            hash: cap.hash,
          });
          return;
        case 'mask':
          caption.textContent = t('caption.mask', 'Drop the sign bit: {hash} & 0x7FFFFFFF = {masked}', {
            hash: cap.hash,
            masked: cap.masked,
          });
          return;
        case 'bucket':
          caption.textContent = t('caption.bucket', '{masked} mod {count} = slot {slot}', {
            masked: cap.masked,
            count: cap.count,
            slot: cap.slot,
          });
          return;
        case 'done':
          caption.textContent = t(
            'caption.done',
            'Whatever the key, it folds into one of the {count} slots.',
            { count: cap.count },
          );
          return;
      }
    }

    function drawStatic(scene: HashToBucketScene): void {
      rewind();
      drawBuckets(scene.bucketCount);
      drawTags(scene.tags);
      drawFold(scene.fold);
      drawCaption(scene.caption);
    }

    // ── 걸음 함수 ──────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 출발 그림으로
    // 되돌려 놓고 시작한다. 출발 그림은 장면이 실어 온 계기값에서 셈으로 얻는다 —
    // `prev` 는 무엇을 흐르게 할지 고르는 데만 쓴다 (S-scene).

    /** 글자 칸들이 아래에서 차례로 떠오른다. */
    async function flowKey(live: () => boolean): Promise<void> {
      const items = cells.slice();
      const xs = cellXs.slice();
      if (items.length === 0) return;
      await animate(
        MS_KEY_IN,
        (p) => {
          items.forEach((g, i) => {
            const e = easeOut(staggered(p, i, items.length));
            g.setAttribute('transform', `translate(${xs[i]}, ${KEY_CY - KEY_RISE * (1 - e)})`);
            g.setAttribute('opacity', String(e));
          });
        },
        live,
      );
    }

    /** 글자 칸들이 가운데로 모여들며 하나의 정수로 접힌다. */
    async function flowFold(
      fold: Extract<FoldStage, { kind: 'hash' }>,
      live: () => boolean,
    ): Promise<void> {
      // 출발 그림 — 정수 칩은 아직 없고 글자 칸이 늘어서 있다.
      chipLayer.textContent = '';
      keyLayer.textContent = '';
      cells = [];
      cellXs = [];
      drawCells(fold.key);

      const items = cells.slice();
      const xs = cellXs.slice();
      if (items.length > 0) {
        await animate(
          MS_FOLD_IN,
          (p) => {
            items.forEach((g, i) => {
              const e = easeInOut(staggered(p, i, items.length));
              const x = xs[i] + (CX - xs[i]) * e;
              const s = 1 - 0.78 * e;
              g.setAttribute('transform', `translate(${x}, ${KEY_CY}) scale(${s})`);
              g.setAttribute('opacity', String(1 - e * e));
            });
          },
          live,
        );
        if (!live()) return;
      }

      keyLayer.textContent = '';
      cells = [];
      cellXs = [];

      const target = buildChip(String(fold.hash), fold.signBit);
      await animate(
        MS_CHIP_DROP,
        (p) => {
          const e = easeOut(p);
          const y = KEY_CY + (HASH_CY - KEY_CY) * e;
          const s = 0.45 + 0.55 * e;
          const x = CX + (CX_WITH_TILE - CX) * e;
          target.g.setAttribute('transform', `translate(${x}, ${y}) scale(${s})`);
        },
        live,
      );
    }

    /** 부호 비트 조각이 떨어져 나가고, 남은 수가 가운데로 미끄러진다. */
    async function flowMask(
      fold: Extract<FoldStage, { kind: 'masked' }>,
      live: () => boolean,
    ): Promise<void> {
      // 출발 그림 — 부호 비트가 아직 붙은 채 오른쪽으로 밀려 서 있는 칩.
      chipLayer.textContent = '';
      const target = buildChip(String(fold.hash), fold.signBit);
      placeChip(target, CX_WITH_TILE, HASH_CY);

      const tile = target.tile;
      if (tile) {
        const baseX = -(target.width / 2 + TILE_GAP + TILE_W / 2);
        await animate(
          MS_BIT_FALL,
          (p) => {
            const e = easeIn(p);
            tile.setAttribute('transform', `translate(${baseX}, ${e * TILE_FALL}) rotate(${e * 24})`);
            tile.setAttribute('opacity', String(1 - p * p));
          },
          live,
        );
        if (!live()) return;
        tile.remove();
        target.tile = null;
      }

      const from = target.width;
      const to = chipWidth(String(fold.masked));
      target.label.textContent = String(fold.masked);
      await animate(
        MS_RECENTER,
        (p) => {
          const e = easeOut(p);
          setChipWidth(target, from + (to - from) * e);
          const x = CX_WITH_TILE + (CX - CX_WITH_TILE) * e;
          target.g.setAttribute('transform', `translate(${x}, ${HASH_CY})`);
        },
        live,
      );
      target.width = to;
    }

    /**
     * 수가 자리 띠를 감아 돌다 제 자리에서 멈추고, 그 자리로 눌려 들어간다.
     * 감기는 동작이 곧 나머지 연산이다 — 자리 수를 넘으면 처음으로 돌아온다.
     */
    async function flowLand(
      step: Extract<FoldStep, { kind: 'land' }>,
      scene: HashToBucketScene,
      live: () => boolean,
    ): Promise<void> {
      const g = geo;
      if (!g) return;
      const count = scene.bucketCount;
      if (count <= 0) return;

      // 출발 그림 — 방금 앉은 이름표를 거두고, 접히던 수를 칩으로 되세운다.
      tagNodes[tagNodes.length - 1]?.remove();
      chipLayer.textContent = '';
      const target = buildChip(String(step.masked), null);
      placeChip(target, CX, HASH_CY);

      await animate(
        MS_TO_TRACK,
        (p) => {
          const e = easeInOut(p);
          placeChip(target, CX, HASH_CY + (TRACK_CY - HASH_CY) * e);
        },
        live,
      );
      if (!live()) return;

      const startUnit = (CX - g.originX - g.width / 2) / g.pitch;
      const endUnit = count + step.slot;
      await animate(
        MS_WRAP,
        (p) => {
          const u = startUnit + (endUnit - startUnit) * easeOut(p);
          const wrapped = ((u % count) + count) % count;
          placeChip(target, g.originX + wrapped * g.pitch + g.width / 2, TRACK_CY);
        },
        live,
      );
      if (!live()) return;

      // 자리 칸이 잠깐 빛난다 — 걸음 안에서만 살다 가므로 장면에 담지 않는다.
      const slotRect = bucketRects[step.slot];
      slotRect?.setAttribute('stroke', c.accent);
      slotRect?.setAttribute('stroke-width', '2.5');

      const spots = tagPositions(scene.tags, g);
      const spot = spots[spots.length - 1];
      if (!spot) return;
      const tagW = g.width - 12;
      const fromW = target.width;
      target.label.textContent = step.key;
      target.label.setAttribute('font-size', fontSizes.sm);

      await animate(
        MS_PRESS_IN,
        (p) => {
          const e = easeInOut(p);
          const width = fromW + (tagW - fromW) * e;
          const height = CHIP_H + (TAG_H - CHIP_H) * e;
          setChipWidth(target, width);
          target.rect.setAttribute('y', String(-height / 2));
          target.rect.setAttribute('height', String(height));
          placeChip(target, spot.cx, TRACK_CY + (spot.cy - TRACK_CY) * e);
        },
        live,
      );
    }

    /** 다 접히고 나면 자리에 앉은 이름표들이 한 번 들썩인다. */
    async function flowSettle(scene: HashToBucketScene, live: () => boolean): Promise<void> {
      const g = geo;
      if (!g) return;
      const items = tagNodes.slice();
      if (items.length === 0) return;
      const spots = tagPositions(scene.tags, g);
      await animate(
        MS_SETTLE,
        (p) => {
          items.forEach((node, i) => {
            const spot = spots[i];
            if (!spot) return;
            const bob = Math.sin(Math.PI * staggered(p, i, items.length)) * -7;
            node.setAttribute('transform', `translate(${spot.cx}, ${spot.cy + bob})`);
          });
        },
        live,
      );
    }

    // ── 장면 그리기 ────────────────────────────────────────────────────────

    async function render(
      next: HashToBucketScene,
      _prev: HashToBucketScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => alive(mine);

      drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'key':
          if (next.fold?.kind === 'key') await flowKey(live);
          break;
        case 'fold':
          if (next.fold?.kind === 'hash') await flowFold(next.fold, live);
          break;
        case 'mask':
          if (next.fold?.kind === 'masked') await flowMask(next.fold, live);
          break;
        case 'land':
          await flowLand(step, next, live);
          break;
        case 'settle':
          await flowSettle(next, live);
          break;
      }

      if (!live()) return;
      // 흐르며 남은 전환·임시 노드·보간의 끝자리가 통째로 사라진다. 정적 경로가
      // 두 번 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
