/**
 * direct-mapped-cache-stage — 배열의 줄이 제 자리로 날아가 앉고, 밀려난 줄이
 * 제자리로 되돌아 나는 것을 좌표로 보이는 화면.
 *
 * 세 층이다.
 *
 *   배열   위쪽 한 줄. 손잡이가 돌면 타일들이 **새 자리로 미끄러진다.**
 *   깔때기 배열 타일에서 제 자리로 내려가는 선. 배열이 캐시보다 커지면 두 줄이
 *          한 자리로 모여 선이 겹친다 — 절벽이 생기는 곳이 눈에 보인다.
 *   캐시   아래쪽 여덟 자리. 고정이다.
 *
 * 그 아래에 손잡이 값마다 잰 미스율을 쌓는 **절벽 사다리**를 둔다. 손잡이를
 * 돌려 가며 보면 기둥이 하나씩 서면서 절벽이 그려지고, 지금 보고 있는 값을
 * 가리키는 표가 기둥 사이를 **미끄러져** 옮겨 간다.
 *
 * 움직임은 전부 실제 좌표 이동이다 — `opacity` 전환이나 즉시 재그리기가 아니다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 배열이 16 줄까지 늘어도 타일 폭과
 * 간격이 고정이라 한 줄에 담긴다.
 */

import {
  getColors,
  fonts,
  fontSizes,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 기하. 그림이 정하는 수라 토큰의 대상이 아니다 (S-view).
const W = 620;
const H = 262;

const CAP_Y = 13;
const ARR_LABEL_Y = 31;
const ARR_Y = 36;
const TILE_H = 24;
const TILE_W = 30;
const TILE_PITCH = 34;

const CACHE_LABEL_Y = 118;
const CACHE_Y = 124;
const SLOT_H = 34;
const SLOT_W = 56;
const SLOT_PITCH = 64;
const SLOT_NUM_Y = 170;

const LAD_LABEL_Y = 188;
const LAD_TOP = 194;
const LAD_BASE = 238;
const LAD_H = LAD_BASE - LAD_TOP;
const LAD_BAR_W = 26;
const LAD_PITCH = 70;
const LAD_SIZE_Y = 251;

const MARGIN_X = 16;
const TILE_R = 3;
const SLOT_R = 4;

/**
 * 도형에 새겨진 표식. 번역하지 않는다 (C10 판정 1·3) — 줄 번호 앞의 `L`,
 * 태그 앞의 `t`, 백분율 기호, 빈 자리의 점.
 */
const LINE_MARK = 'L';
const TAG_MARK = 't';
const PCT_MARK = '%';
const EMPTY_MARK = '·';

type TileState = 'default' | 'comparing' | 'resident' | 'evicted';

type Chip = {
  g: SVGGElement;
  rect: SVGRectElement;
  head: SVGTextElement;
  sub: SVGTextElement;
};

function el<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function attrs(node: SVGElement, table: Record<string, string | number>): void {
  for (const [k, v] of Object.entries(table)) node.setAttribute(k, String(v));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function nums(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

function numOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const directMappedCacheStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors: Palette = getColors(params.theme);
    const t: Translate = params.t ?? makeTranslator(params.locale);
    const canvas = params.canvas;

    const init = (params.initialData ?? {}) as Record<string, unknown>;
    const slotCount = Math.max(1, Math.round(numOr(init.slotCount, 8)));
    const ladderSizes = nums(init.sizes);
    let lineCount = Math.max(1, Math.round(numOr(init.lineCount, slotCount)));
    let sweeps = Math.max(1, Math.round(numOr(init.sweeps, 3)));

    // ── 애니메이션 살림. destroy 가 프레임·타이머를 거두고 매달린 것을 푼다.
    let destroyed = false;
    const frames = new Set<number>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiting = new Set<() => void>();

    const now = (): number =>
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    function nextFrame(cb: () => void): void {
      if (destroyed) return;
      if (typeof requestAnimationFrame === 'function') {
        const id = requestAnimationFrame(() => {
          frames.delete(id);
          cb();
        });
        frames.add(id);
        return;
      }
      const id = setTimeout(() => {
        timers.delete(id);
        cb();
      }, 16);
      timers.add(id);
    }

    /** 좌표를 실제로 옮긴다. 되돌려주는 promise 는 destroy 때도 반드시 풀린다. */
    function animate(ms: number, step: (p: number) => void): Promise<void> {
      if (destroyed || ms <= 0) {
        if (!destroyed) step(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = now();
        const finish = (): void => {
          waiting.delete(finish);
          resolve();
        };
        waiting.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const raw = Math.min(1, (now() - start) / ms);
          step(easeInOut(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          nextFrame(tick);
        };
        nextFrame(tick);
      });
    }

    // ── 자리 셈
    const cacheX0 = (W - (slotCount * SLOT_PITCH - (SLOT_PITCH - SLOT_W))) / 2;
    const slotCx = (s: number): number => cacheX0 + s * SLOT_PITCH + SLOT_W / 2;

    const arrayX0 = (n: number): number => (W - (n * TILE_PITCH - (TILE_PITCH - TILE_W))) / 2;

    const ladTotal = ladderSizes.length * LAD_PITCH - (LAD_PITCH - LAD_BAR_W);
    const ladX0 = (W - ladTotal) / 2;
    const ladCx = (i: number): number => ladX0 + i * LAD_PITCH + LAD_BAR_W / 2;

    // ── 껍데기
    const root = el('g');
    canvas.appendChild(root);

    function text(
      value: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end' = 'start',
    ): SVGTextElement {
      const node = el('text');
      attrs(node, { x, y, 'font-family': fonts.body, 'font-size': size, fill, 'text-anchor': anchor });
      node.textContent = value;
      return node;
    }

    const caption = text('', MARGIN_X, CAP_Y, fontSizes.xs, colors.text);
    root.appendChild(caption);

    root.appendChild(text(t('label.array', 'Array'), MARGIN_X, ARR_LABEL_Y, fontSizes.xs, colors.textMuted));
    const sweepLabel = text('', W - MARGIN_X, ARR_LABEL_Y, fontSizes.xs, colors.textMuted, 'end');
    root.appendChild(sweepLabel);
    root.appendChild(text(t('label.cache', 'Cache'), MARGIN_X, CACHE_LABEL_Y, fontSizes.xs, colors.textMuted));
    root.appendChild(
      text(t('label.missRate', 'Miss rate'), MARGIN_X, LAD_LABEL_Y, fontSizes.xs, colors.textMuted),
    );

    // 깔때기 — 배열 타일에서 제 자리로 내려가는 선. 타일이 움직이면 같이 움직인다.
    const wires = el('g');
    root.appendChild(wires);
    const wireEls: SVGLineElement[] = [];

    // 캐시 자리 — 고정이다.
    const slotBoxes: SVGRectElement[] = [];
    for (let s = 0; s < slotCount; s += 1) {
      const box = el('rect');
      attrs(box, {
        x: cacheX0 + s * SLOT_PITCH,
        y: CACHE_Y,
        width: SLOT_W,
        height: SLOT_H,
        rx: SLOT_R,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
      root.appendChild(box);
      slotBoxes.push(box);

      const dot = text(EMPTY_MARK, slotCx(s), CACHE_Y + SLOT_H / 2 + 4, fontSizes.sm, colors.textMuted, 'middle');
      root.appendChild(dot);

      root.appendChild(
        text(String(s), slotCx(s), SLOT_NUM_Y, fontSizes.xs, colors.textMuted, 'middle'),
      );
    }

    // 절벽 사다리
    const ladBase = el('line');
    attrs(ladBase, {
      x1: MARGIN_X,
      y1: LAD_BASE + 0.5,
      x2: W - MARGIN_X,
      y2: LAD_BASE + 0.5,
      stroke: colors.border,
      'stroke-width': 1,
    });
    root.appendChild(ladBase);

    const ladBars: SVGRectElement[] = [];
    const ladReads: SVGTextElement[] = [];
    const ladNames: SVGTextElement[] = [];
    for (let i = 0; i < ladderSizes.length; i += 1) {
      const bar = el('rect');
      attrs(bar, {
        x: ladX0 + i * LAD_PITCH,
        y: LAD_BASE,
        width: LAD_BAR_W,
        height: 0,
        rx: 2,
        fill: colors.itemSorted,
      });
      root.appendChild(bar);
      ladBars.push(bar);

      const read = text('', ladCx(i), LAD_TOP - 2, fontSizes.xs, colors.textMuted, 'middle');
      root.appendChild(read);
      ladReads.push(read);

      const name = text(
        String(ladderSizes[i]),
        ladCx(i),
        LAD_SIZE_Y,
        fontSizes.xs,
        colors.textMuted,
        'middle',
      );
      root.appendChild(name);
      ladNames.push(name);
    }

    const marker = el('path');
    attrs(marker, { fill: colors.itemPivot, d: 'M -5 6 L 5 6 L 0 -1 Z' });
    marker.setAttribute('transform', `translate(${ladCx(0)} ${LAD_BASE + 2})`);
    if (ladderSizes.length > 0) root.appendChild(marker);

    // ── 배열 타일
    const tileLayer = el('g');
    root.appendChild(tileLayer);
    const tiles = new Map<number, Chip>();
    /** 타일의 현재 x (왼쪽 끝). 이동 중에도 깔때기가 따라오도록 들고 있는다. */
    const tileX = new Map<number, number>();

    function paintChip(chip: Chip, state: TileState): void {
      const fill =
        state === 'comparing'
          ? colors.itemComparing
          : state === 'resident'
            ? colors.itemSorted
            : state === 'evicted'
              ? colors.itemSwapping
              : colors.itemDefault;
      const ink =
        state === 'comparing' || state === 'evicted'
          ? colors.stateInk
          : state === 'resident'
            ? colors.textInverse
            : colors.text;
      attrs(chip.rect, { fill, stroke: state === 'default' ? colors.border : fill });
      attrs(chip.head, { fill: ink });
      attrs(chip.sub, { fill: ink });
    }

    function makeChip(
      width: number,
      height: number,
      radius: number,
      head: string,
      sub: string,
      state: TileState,
    ): Chip {
      const g = el('g');
      const rect = el('rect');
      attrs(rect, { x: 0, y: 0, width, height, rx: radius, 'stroke-width': 1 });
      const headEl = text(head, width / 2, sub === '' ? height / 2 + 4 : height / 2, fontSizes.xs, colors.text, 'middle');
      const subEl = text(sub, width / 2, height / 2 + 11, fontSizes.xs, colors.textMuted, 'middle');
      g.append(rect, headEl, subEl);
      const chip: Chip = { g, rect, head: headEl, sub: subEl };
      paintChip(chip, state);
      return chip;
    }

    function placeTile(i: number, x: number): void {
      const chip = tiles.get(i);
      if (!chip) return;
      tileX.set(i, x);
      chip.g.setAttribute('transform', `translate(${x} ${ARR_Y})`);
    }

    function ensureWires(n: number): void {
      while (wireEls.length < n) {
        const line = el('line');
        attrs(line, { 'stroke-width': 1, stroke: colors.border });
        wires.appendChild(line);
        wireEls.push(line);
      }
      for (let i = 0; i < wireEls.length; i += 1) {
        wireEls[i].setAttribute('visibility', i < n ? 'visible' : 'hidden');
      }
    }

    /** 같은 자리를 노리는 줄이 둘 이상이면 그 선을 다투는 색으로 칠한다. */
    function paintWires(n: number): void {
      for (let i = 0; i < n; i += 1) {
        const contested = i + slotCount < n || i - slotCount >= 0;
        wireEls[i].setAttribute('stroke', contested ? colors.itemSwapping : colors.border);
        wireEls[i].setAttribute('stroke-opacity', contested ? '0.85' : '0.55');
      }
    }

    function syncWires(n: number): void {
      for (let i = 0; i < n; i += 1) {
        const x = tileX.get(i);
        if (x === undefined) continue;
        attrs(wireEls[i], {
          x1: x + TILE_W / 2,
          y1: ARR_Y + TILE_H,
          x2: slotCx(i % slotCount),
          y2: CACHE_Y,
        });
      }
    }

    // ── 캐시에 앉아 있는 것
    const seatLayer = el('g');
    root.appendChild(seatLayer);
    const seatChip: Array<Chip | null> = new Array<Chip | null>(slotCount).fill(null);
    const seatLine: number[] = new Array<number>(slotCount).fill(-1);

    let traveler: Chip | null = null;
    let travelLine = -1;

    const measured = new Map<number, number>();
    let markerAt = 0;

    function seatXY(slot: number): { x: number; y: number } {
      return { x: cacheX0 + slot * SLOT_PITCH + (SLOT_W - TILE_W) / 2 - 6, y: CACHE_Y + 4 };
    }

    function dropSeat(slot: number): void {
      const chip = seatChip[slot];
      if (chip) chip.g.remove();
      seatChip[slot] = null;
      seatLine[slot] = -1;
    }

    function buildTiles(n: number): void {
      const before = new Map(tileX);
      const oldCount = Math.max(tiles.size, 0);
      const oldN = oldCount === 0 ? n : oldCount;
      const span = Math.max(oldN, n);

      for (let i = 0; i < span; i += 1) {
        if (tiles.has(i)) continue;
        const chip = makeChip(TILE_W, TILE_H, TILE_R, `${LINE_MARK}${i}`, '', 'default');
        tileLayer.appendChild(chip.g);
        tiles.set(i, chip);
        placeTile(i, before.get(i) ?? arrayX0(oldN) + i * TILE_PITCH);
      }
      for (const [i, chip] of tiles) {
        if (i >= span) {
          chip.g.remove();
          tiles.delete(i);
          tileX.delete(i);
        }
      }
      ensureWires(n);
      paintWires(n);
    }

    function resetTiles(): void {
      for (const chip of tiles.values()) paintChip(chip, 'default');
    }

    function setCaptionText(value: string): void {
      caption.textContent = value;
    }

    function setSweepText(sweep: number, total: number): void {
      sweepLabel.textContent = t('label.sweep', 'Sweep {n} of {total}', { n: sweep, total });
    }

    function paintLadder(current: number): void {
      for (let i = 0; i < ladderSizes.length; i += 1) {
        const isNow = ladderSizes[i] === current;
        ladBars[i].setAttribute('fill', isNow ? colors.itemPivot : colors.itemSorted);
        ladNames[i].setAttribute('fill', isNow ? colors.text : colors.textMuted);
      }
    }

    // 처음 그림 — setup 이 오지 않아도 화면은 비어 있지 않다.
    buildTiles(lineCount);
    for (let i = 0; i < lineCount; i += 1) placeTile(i, arrayX0(lineCount) + i * TILE_PITCH);
    syncWires(lineCount);
    paintLadder(lineCount);
    setSweepText(1, sweeps);

    // ── Projector 가 부르는 계약
    return {
      destroy(): void {
        destroyed = true;
        for (const id of frames) {
          if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
        }
        frames.clear();
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const release of [...waiting]) release();
        waiting.clear();
        if (root.parentNode) root.remove();
      },

      setCaption(value: string): void {
        setCaptionText(value);
      },

      setSweep(sweep: number, total: number): void {
        setSweepText(sweep, total);
      },

      clearAll(): void {
        for (let s = 0; s < slotCount; s += 1) dropSeat(s);
        if (traveler) {
          traveler.g.remove();
          traveler = null;
          travelLine = -1;
        }
        resetTiles();
        measured.clear();
        for (let i = 0; i < ladderSizes.length; i += 1) {
          attrs(ladBars[i], { y: LAD_BASE, height: 0 });
          ladReads[i].textContent = '';
        }
        setCaptionText('');
      },

      /**
       * 손잡이가 돌았다. 배열 타일이 **새 자리로 미끄러지고**, 깔때기가 따라
       * 움직이며, 사다리의 표가 기둥 사이를 옮겨 간다.
       */
      async setup(p: {
        lineCount: number;
        sweeps: number;
        ms: number;
      }): Promise<void> {
        const from = lineCount;
        const to = Math.max(1, Math.round(p.lineCount));
        sweeps = Math.max(1, Math.round(p.sweeps));

        for (let s = 0; s < slotCount; s += 1) dropSeat(s);
        if (traveler) {
          traveler.g.remove();
          traveler = null;
          travelLine = -1;
        }

        buildTiles(Math.max(from, to));
        const startX = new Map<number, number>();
        for (const i of tiles.keys()) startX.set(i, tileX.get(i) ?? arrayX0(from) + i * TILE_PITCH);

        const markerFrom = markerAt;
        const markerTo = ladderSizes.indexOf(to) >= 0 ? ladCx(ladderSizes.indexOf(to)) : markerAt;

        resetTiles();
        setSweepText(1, sweeps);

        await animate(p.ms, (q) => {
          for (const i of tiles.keys()) {
            const a = startX.get(i) ?? 0;
            const b = arrayX0(to) + i * TILE_PITCH;
            placeTile(i, a + (b - a) * q);
          }
          syncWires(Math.max(from, to));
          if (ladderSizes.length > 0) {
            const mx = markerFrom + (markerTo - markerFrom) * q;
            marker.setAttribute('transform', `translate(${mx} ${LAD_BASE + 2})`);
          }
        });

        markerAt = markerTo;
        lineCount = to;
        buildTiles(to);
        for (let i = 0; i < to; i += 1) placeTile(i, arrayX0(to) + i * TILE_PITCH);
        syncWires(to);
        paintLadder(to);
      },

      /** 이 줄이 제 자리를 향해 **날아간다.** */
      async travel(p: { lineNo: number; slot: number; tag: number; ms: number }): Promise<void> {
        if (traveler) {
          traveler.g.remove();
          traveler = null;
        }
        const home = tiles.get(p.lineNo);
        if (home) paintChip(home, 'comparing');

        const chip = makeChip(
          TILE_W + 12,
          SLOT_H - 8,
          TILE_R,
          `${LINE_MARK}${p.lineNo}`,
          `${TAG_MARK}${p.tag}`,
          'comparing',
        );
        seatLayer.appendChild(chip.g);
        traveler = chip;
        travelLine = p.lineNo;

        const ax = (tileX.get(p.lineNo) ?? arrayX0(lineCount) + p.lineNo * TILE_PITCH) - 6;
        const ay = ARR_Y;
        const seat = seatXY(p.slot);

        chip.g.setAttribute('transform', `translate(${ax} ${ay})`);
        await animate(p.ms, (q) => {
          const x = ax + (seat.x - ax) * q;
          // 가볍게 호를 그린다 — 곧게 내려오면 겹친 선과 구별되지 않는다.
          const y = ay + (seat.y - ay) * q - Math.sin(Math.PI * q) * 10;
          chip.g.setAttribute('transform', `translate(${x} ${y})`);
        });
      },

      /**
       * 자리에 닿았다. 히트면 앉아 있던 것과 겹쳐 한 번 부풀고, 미스면 앉아
       * 있던 줄이 **제 배열 자리로 되날아가** 사라진 뒤에 새 줄이 앉는다.
       */
      async settle(p: {
        lineNo: number;
        slot: number;
        outcome: string;
        evictedLine: number;
        ms: number;
      }): Promise<void> {
        const seat = seatXY(p.slot);
        const flying = traveler;

        if (p.outcome === 'hit') {
          const sitting = seatChip[p.slot];
          if (flying) {
            flying.g.remove();
            traveler = null;
            travelLine = -1;
          }
          if (sitting) {
            paintChip(sitting, 'comparing');
            await animate(p.ms, (q) => {
              const s = 1 + Math.sin(Math.PI * q) * 0.16;
              const cx = seat.x + (TILE_W + 12) / 2;
              const cy = seat.y + (SLOT_H - 8) / 2;
              sitting.g.setAttribute(
                'transform',
                `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy}) translate(${seat.x} ${seat.y})`,
              );
            });
            sitting.g.setAttribute('transform', `translate(${seat.x} ${seat.y})`);
            paintChip(sitting, 'resident');
          }
          const home = tiles.get(p.lineNo);
          if (home) paintChip(home, 'resident');
          return;
        }

        // 미스 — 앉아 있던 줄을 먼저 내보낸다.
        const evicted = seatChip[p.slot];
        const evictedLine = seatLine[p.slot];
        if (evicted && evictedLine >= 0) {
          paintChip(evicted, 'evicted');
          const backX = (tileX.get(evictedLine) ?? arrayX0(lineCount) + evictedLine * TILE_PITCH) - 6;
          await animate(p.ms, (q) => {
            const x = seat.x + (backX - seat.x) * q;
            const y = seat.y + (ARR_Y - seat.y) * q - Math.sin(Math.PI * q) * 14;
            evicted.g.setAttribute('transform', `translate(${x} ${y})`);
          });
          const oldHome = tiles.get(evictedLine);
          if (oldHome) paintChip(oldHome, 'default');
        }
        dropSeat(p.slot);

        if (flying && travelLine === p.lineNo) {
          traveler = null;
          travelLine = -1;
          seatChip[p.slot] = flying;
          seatLine[p.slot] = p.lineNo;
          // 자리에 내려앉는 짧은 내림.
          await animate(Math.max(60, p.ms / 2), (q) => {
            const y = seat.y - 6 * (1 - q);
            flying.g.setAttribute('transform', `translate(${seat.x} ${y})`);
          });
          flying.g.setAttribute('transform', `translate(${seat.x} ${seat.y})`);
          paintChip(flying, 'resident');
        }
        const home = tiles.get(p.lineNo);
        if (home) paintChip(home, 'resident');
      },

      /** 한 판이 끝났다. 이 손잡이 값의 기둥이 재어진 높이까지 **자란다.** */
      async finish(p: { lineCount: number; rate: number; ms: number }): Promise<void> {
        const i = ladderSizes.indexOf(p.lineCount);
        if (i < 0) return;
        const before = measured.get(p.lineCount) ?? 0;
        measured.set(p.lineCount, p.rate);
        ladReads[i].textContent = `${p.rate}${PCT_MARK}`;
        await animate(p.ms, (q) => {
          const pct = before + (p.rate - before) * q;
          const h = (LAD_H * pct) / 100;
          attrs(ladBars[i], { y: LAD_BASE - h, height: Math.max(0, h) });
        });
      },
    };
  },
};
