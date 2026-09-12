/**
 * set-associative-cache-stage — 여덟 칸은 그대로 두고 칸막이만 옮긴다.
 *
 * ── 무엇이 움직이는가
 *
 * 1. **칸막이.** 연관도가 바뀌면 묶음 띠가 제자리에서 늘고 줄며 갈라지거나
 *    합쳐진다. 칸 여덟의 자리와 크기는 한 픽셀도 변하지 않는다 — 연관도를
 *    올린 쪽이 더 커 보이면 "캐시를 키웠다" 로 읽혀 주장이 무너지기 때문이다.
 * 2. **주소가 날아가 앉는다.** 접근열의 칩이 제 묶음의 칸까지 날아간다.
 * 3. **밀려남.** 자리가 차 있으면 앉아 있던 태그가 아래로 빠지며 사라진다.
 * 4. **훑기.** 묶음 안을 한 칸씩 차례로 비추고, 띠 아래 괄호가 그만큼 자란다 —
 *    연관도가 올라가면 이 훑기가 길어지는 것이 곧 치르는 값이다.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다 (S-view)
 *
 * 연관도는 가로 분할만 바꾸므로 viewBox 를 다시 잴 일이 없다. 칸 수가 데이터로
 * 달라져도 가로 피치만 달라진다.
 *
 * ── 문자
 *
 * 이 파일이 그리는 글자는 `set 0` · `tag` · `line` · `HIT` · `MISS` 같은 도식
 * 라벨과 수뿐이다. 도형에 새겨진 표식이라 상수로 두고 키를 만들지 않는다
 * (C10 판정 1·2). 문장이 되는 캡션은 projector 가 `runtime.t` 로 해석해 넘긴다.
 *
 * ── 뒷일
 *
 * 애니메이션은 16ms 타이머를 스스로 잇는 꼴이다. `destroyed` 플래그와 타이머
 * 집합으로 반드시 멈추고, 멈출 때 매달린 promise 를 모두 풀어 준다 — 풀지
 * 않으면 projector 의 `await` 가 영영 돌아오지 않는다.
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 720;
const CANVAS_H = 232;

/** 칸 줄의 좌표. 칸 수가 달라져도 이 폭 안에서 피치만 달라진다. */
const ROW_X = 62;
const ROW_W = 596;
const CELL_GAP = 14;
const CELL_Y = 120;
const CELL_H = 54;

const BAND_Y = 94;
const BAND_H = 90;
const BAND_PAD = 4;
const BAND_LABEL_Y = 110;

const CHIP_Y = 40;
const CHIP_H = 26;
const CHIP_W = 62;
const CHIP_GAP = 12;

const CAPTION_Y = 22;
const DECODE_Y = 84;
const PIP_X = 600;
const PIP_Y = 74;
const PIP_SIZE = 10;
const PIP_GAP = 5;
const BRACKET_Y = 190;
const STAMP_Y = 196;
const STAMP_W = 64;
const STAMP_H = 24;

const FRAME_MS = 16;
const LAYOUT_MS = 380;
const FOCUS_MS = 150;
const SWEEP_MS = 80;
const FLY_MS = 300;
const EVICT_MS = 240;
const PULSE_MS = 240;

/** 도형에 새겨진 표식. 번역하면 그림과 어긋난다 (C10). */
const MARK_SET = 'set';
const MARK_TAG = 'tag';
const MARK_LINE = 'line';
const MARK_HIT = 'HIT';
const MARK_MISS = 'MISS';
const MARK_DOT = '·';

/** 아직 아무도 앉지 않은 칸. */
const EMPTY = -1;

type Attrs = Record<string, string | number>;

function make<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, name);
  for (const [k, value] of Object.entries(attrs)) node.setAttribute(k, String(value));
  return node;
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) * (-2 * t + 2) / 2;
}

type Cell = {
  box: SVGRectElement;
  tagMark: SVGTextElement;
  tagValue: SVGTextElement;
  lru: SVGPolygonElement;
};

type Band = {
  box: SVGRectElement;
  label: SVGTextElement;
};

type StageData = {
  slots?: unknown;
  ways?: unknown;
  addresses?: unknown;
  rounds?: unknown;
};

function intOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function numbersOr(value: unknown, fallback: number[]): number[] {
  return Array.isArray(value) && value.every((x) => typeof x === 'number')
    ? (value as number[])
    : fallback;
}

export const setAssociativeCacheStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const colors = getColors(params.theme);
    const canvas = params.canvas;
    const seed = (params.initialData ?? {}) as StageData;

    const slots = Math.max(1, intOr(seed.slots, 8));
    let addresses = numbersOr(seed.addresses, []);
    const rounds = Math.max(1, intOr(seed.rounds, 1));
    let ways = Math.max(1, intOr(seed.ways, 1));
    let sets = Math.max(1, Math.floor(slots / ways));

    const pitch = ROW_W / slots;
    const cellW = pitch - CELL_GAP;
    const cellX = (k: number): number => ROW_X + k * pitch;
    const bandX = (s: number, w: number): number => cellX(s * w) - BAND_PAD;
    const bandW = (w: number): number => w * pitch - CELL_GAP + BAND_PAD * 2;

    const tags = new Array<number>(slots).fill(EMPTY);
    const stamps = new Array<number>(slots).fill(0);
    let clock = 0;
    let round = 0;

    // ── 시간 축 ────────────────────────────────────────────────────────────
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const settlers = new Set<() => void>();
    let destroyed = false;

    function wait(ms: number): Promise<void> {
      if (destroyed || ms <= 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const settle = (): void => {
          settlers.delete(settle);
          resolve();
        };
        settlers.add(settle);
        const id = setTimeout(() => {
          timers.delete(id);
          settle();
        }, ms);
        timers.add(id);
      });
    }

    function tween(ms: number, step: (t: number) => void): Promise<void> {
      step(0);
      if (destroyed || ms <= 0) {
        step(1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const start = Date.now();
        const settle = (): void => {
          settlers.delete(settle);
          step(1);
          resolve();
        };
        settlers.add(settle);
        const tick = (): void => {
          if (destroyed) {
            settle();
            return;
          }
          const t = Math.min(1, (Date.now() - start) / ms);
          step(ease(t));
          if (t >= 1) {
            settle();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        const first = setTimeout(() => {
          timers.delete(first);
          tick();
        }, FRAME_MS);
        timers.add(first);
      });
    }

    // ── 뼈대 ──────────────────────────────────────────────────────────────
    const root = make('g', {});
    canvas.appendChild(root);

    const caption = make('text', {
      x: CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: colors.text,
    });
    root.appendChild(caption);

    const chipLayer = make('g', {});
    root.appendChild(chipLayer);
    let chips: { box: SVGRectElement; label: SVGTextElement }[] = [];

    const decode = make('text', {
      x: CANVAS_W / 2,
      y: DECODE_Y,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
    });
    root.appendChild(decode);

    const pips: SVGRectElement[] = [];
    for (let r = 0; r < rounds; r += 1) {
      const pip = make('rect', {
        x: PIP_X + r * (PIP_SIZE + PIP_GAP),
        y: PIP_Y,
        width: PIP_SIZE,
        height: PIP_SIZE,
        rx: 2,
        fill: colors.bg,
        stroke: colors.border,
      });
      root.appendChild(pip);
      pips.push(pip);
    }

    const bandTones = categorical(slots, 'pastel');
    const bands: Band[] = [];
    for (let s = 0; s < slots; s += 1) {
      const box = make('rect', {
        x: bandX(s, 1),
        y: BAND_Y,
        width: bandW(1),
        height: BAND_H,
        rx: 8,
        fill: bandTones[s % bandTones.length],
        stroke: colors.border,
      });
      const label = make('text', {
        x: bandX(s, 1) + 9,
        y: BAND_LABEL_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      label.textContent = `${MARK_SET} ${s}`;
      root.appendChild(box);
      root.appendChild(label);
      bands.push({ box, label });
    }

    const cells: Cell[] = [];
    for (let k = 0; k < slots; k += 1) {
      const box = make('rect', {
        x: cellX(k),
        y: CELL_Y,
        width: cellW,
        height: CELL_H,
        rx: 6,
        fill: colors.itemDefault,
        stroke: colors.border,
      });
      const tagMark = make('text', {
        x: cellX(k) + cellW / 2,
        y: CELL_Y + 19,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        opacity: 0,
      });
      tagMark.textContent = MARK_TAG;
      const tagValue = make('text', {
        x: cellX(k) + cellW / 2,
        y: CELL_Y + 41,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.lg,
        'font-weight': '600',
        fill: colors.text,
      });
      const lru = make('polygon', {
        points: [
          `${cellX(k) + cellW / 2 - 5},${CELL_Y + CELL_H - 3}`,
          `${cellX(k) + cellW / 2 + 5},${CELL_Y + CELL_H - 3}`,
          `${cellX(k) + cellW / 2},${CELL_Y + CELL_H - 10}`,
        ].join(' '),
        fill: colors.textMuted,
        opacity: 0,
      });
      root.appendChild(box);
      root.appendChild(tagMark);
      root.appendChild(tagValue);
      root.appendChild(lru);
      cells.push({ box, tagMark, tagValue, lru });
    }

    const bracket = make('path', {
      d: '',
      fill: 'none',
      stroke: colors.itemComparing,
      'stroke-width': 2,
      opacity: 0,
    });
    root.appendChild(bracket);

    const stampBox = make('rect', {
      x: 0,
      y: STAMP_Y,
      width: STAMP_W,
      height: STAMP_H,
      rx: 5,
      fill: colors.accent,
      opacity: 0,
    });
    const stampText = make('text', {
      x: 0,
      y: STAMP_Y + 16,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      'font-weight': '600',
      fill: colors.stateInk,
      opacity: 0,
    });
    root.appendChild(stampBox);
    root.appendChild(stampText);

    const flyLayer = make('g', {});
    root.appendChild(flyLayer);

    // ── 그리기 ────────────────────────────────────────────────────────────
    function chipX(i: number, count: number): number {
      const total = count * (CHIP_W + CHIP_GAP) - CHIP_GAP;
      return (CANVAS_W - total) / 2 + i * (CHIP_W + CHIP_GAP);
    }

    function buildChips(): void {
      while (chipLayer.firstChild) chipLayer.removeChild(chipLayer.firstChild);
      chips = [];
      for (let i = 0; i < addresses.length; i += 1) {
        const x = chipX(i, addresses.length);
        const box = make('rect', {
          x,
          y: CHIP_Y,
          width: CHIP_W,
          height: CHIP_H,
          rx: 5,
          fill: colors.bgSubtle,
          stroke: colors.border,
        });
        const label = make('text', {
          x: x + CHIP_W / 2,
          y: CHIP_Y + 18,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        label.textContent = String(addresses[i]);
        chipLayer.appendChild(box);
        chipLayer.appendChild(label);
        chips.push({ box, label });
      }
    }

    function paintCell(k: number, fill: string): void {
      cells[k].box.setAttribute('fill', fill);
      const occupied = tags[k] !== EMPTY;
      cells[k].tagMark.setAttribute('opacity', occupied ? '1' : '0');
      cells[k].tagValue.textContent = occupied ? String(tags[k]) : '';
      const ink = fill === colors.itemDefault || fill === colors.bgSubtle
        ? colors.text
        : colors.stateInk;
      cells[k].tagValue.setAttribute('fill', ink);
      cells[k].tagMark.setAttribute('fill', ink === colors.stateInk ? ink : colors.textMuted);
    }

    function settleCell(k: number): void {
      paintCell(k, tags[k] === EMPTY ? colors.itemDefault : colors.bgSubtle);
    }

    /** 묶음마다 가장 오래된 칸에 표를 남긴다 — 다음에 밀려날 자리다. */
    function refreshLru(): void {
      for (const cell of cells) cell.lru.setAttribute('opacity', '0');
      if (ways < 2) return;
      for (let s = 0; s < sets; s += 1) {
        const first = s * ways;
        let occupied = 0;
        let oldest = first;
        for (let w = 0; w < ways; w += 1) {
          if (tags[first + w] !== EMPTY) occupied += 1;
          if (stamps[first + w] < stamps[oldest]) oldest = first + w;
        }
        if (occupied === ways) cells[oldest].lru.setAttribute('opacity', '0.8');
      }
    }

    function clearMarks(): void {
      bracket.setAttribute('opacity', '0');
      stampBox.setAttribute('opacity', '0');
      stampText.setAttribute('opacity', '0');
    }

    function applyBands(w: number, count: number, t: number, fromW: number, fromCount: number): void {
      for (let s = 0; s < bands.length; s += 1) {
        const liveNow = s < count;
        const liveBefore = s < fromCount;
        const toX = liveNow ? bandX(s, w) : bandX(Math.min(s, count - 1), w);
        const toW = liveNow ? bandW(w) : bandW(w);
        const fromX = liveBefore ? bandX(s, fromW) : bandX(Math.min(s, fromCount - 1), fromW);
        const fromWidth = bandW(fromW);
        const x = fromX + (toX - fromX) * t;
        const width = fromWidth + (toW - fromWidth) * t;
        const opacity = (liveBefore ? 1 : 0) + ((liveNow ? 1 : 0) - (liveBefore ? 1 : 0)) * t;
        bands[s].box.setAttribute('x', String(x));
        bands[s].box.setAttribute('width', String(width));
        bands[s].box.setAttribute('opacity', String(opacity));
        bands[s].label.setAttribute('x', String(x + 9));
        bands[s].label.setAttribute('opacity', String(opacity));
      }
    }

    buildChips();
    applyBands(ways, sets, 1, ways, sets);
    for (let k = 0; k < slots; k += 1) settleCell(k);

    // ── 바깥이 부르는 것 ───────────────────────────────────────────────────
    const instance: ViewInstance = {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const settle of [...settlers]) settle();
        settlers.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },

      setSequence(next: number[]): void {
        addresses = next;
        buildChips();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      async setLayout(nextWays: number, nextSets: number): Promise<void> {
        const fromWays = ways;
        const fromSets = sets;
        ways = Math.max(1, nextWays);
        sets = Math.max(1, nextSets);
        tags.fill(EMPTY);
        stamps.fill(0);
        clock = 0;
        round = 0;
        for (let k = 0; k < slots; k += 1) settleCell(k);
        for (const pip of pips) pip.setAttribute('fill', colors.bg);
        decode.textContent = '';
        clearMarks();
        refreshLru();
        await tween(LAYOUT_MS, (t) => applyBands(ways, sets, t, fromWays, fromSets));
      },

      async focusAccess(
        index: number,
        atRound: number,
        line: number,
        setIndex: number,
        tag: number,
      ): Promise<void> {
        round = atRound;
        for (let r = 0; r < pips.length; r += 1) {
          pips[r].setAttribute('fill', r < round ? colors.itemSorted : colors.bg);
        }
        clearMarks();
        for (let i = 0; i < chips.length; i += 1) {
          const active = i === index;
          chips[i].box.setAttribute('fill', active ? colors.itemActive : colors.bgSubtle);
          chips[i].label.setAttribute('fill', active ? colors.stateInk : colors.text);
        }
        decode.textContent =
          `${MARK_LINE} ${line} ${MARK_DOT} ${MARK_SET} ${setIndex} ${MARK_DOT} ${MARK_TAG} ${tag}`;
        const chip = chips[index];
        if (!chip) return;
        await tween(FOCUS_MS, (t) => {
          const lift = Math.sin(Math.PI * t) * 4;
          chip.box.setAttribute('y', String(CHIP_Y - lift));
          chip.label.setAttribute('y', String(CHIP_Y + 18 - lift));
        });
      },

      async probeSet(setIndex: number): Promise<void> {
        const first = setIndex * ways;
        const left = bandX(setIndex, ways);
        const width = bandW(ways);
        bracket.setAttribute('opacity', '1');
        for (let w = 0; w < ways; w += 1) {
          if (destroyed) break;
          paintCell(first + w, colors.itemComparing);
          const grown = width * ((w + 1) / ways);
          bracket.setAttribute(
            'd',
            `M ${left} ${BRACKET_Y - 5} L ${left} ${BRACKET_Y} L ${left + grown} ${BRACKET_Y} L ${left + grown} ${BRACKET_Y - 5}`,
          );
          await wait(SWEEP_MS);
        }
        for (let w = 0; w < ways; w += 1) settleCell(first + w);
      },

      async showHit(slot: number): Promise<void> {
        clock += 1;
        stamps[slot] = clock;
        stamp(MARK_HIT, colors.accent, slot);
        await tween(PULSE_MS, (t) => {
          const grow = Math.sin(Math.PI * t) * 4;
          cells[slot].box.setAttribute('x', String(cellX(slot) - grow / 2));
          cells[slot].box.setAttribute('width', String(cellW + grow));
          paintCell(slot, colors.itemPivot);
        });
        settleCell(slot);
        refreshLru();
      },

      async showMiss(
        slot: number,
        tag: number,
        evictedTag: number | null,
        fromIndex: number,
      ): Promise<void> {
        clock += 1;
        stamp(MARK_MISS, colors.danger, slot);
        if (evictedTag !== null) {
          paintCell(slot, colors.itemSwapping);
          await tween(EVICT_MS, (t) => {
            cells[slot].tagValue.setAttribute('y', String(CELL_Y + 41 + t * 34));
            cells[slot].tagValue.setAttribute('opacity', String(1 - t));
            cells[slot].tagMark.setAttribute('opacity', String(1 - t));
          });
          tags[slot] = EMPTY;
          cells[slot].tagValue.setAttribute('y', String(CELL_Y + 41));
          cells[slot].tagValue.setAttribute('opacity', '1');
          paintCell(slot, colors.itemDefault);
        }
        await fly(fromIndex, slot);
        tags[slot] = tag;
        stamps[slot] = clock;
        paintCell(slot, colors.itemActive);
        await wait(FRAME_MS * 4);
        settleCell(slot);
        refreshLru();
      },

      finish(): void {
        for (const pip of pips) pip.setAttribute('fill', colors.itemSorted);
        for (const chip of chips) {
          chip.box.setAttribute('fill', colors.bgSubtle);
          chip.label.setAttribute('fill', colors.text);
        }
        decode.textContent = '';
        clearMarks();
      },

      clear(): void {
        tags.fill(EMPTY);
        stamps.fill(0);
        clock = 0;
        round = 0;
        for (let k = 0; k < slots; k += 1) settleCell(k);
        for (const pip of pips) pip.setAttribute('fill', colors.bg);
        for (const chip of chips) {
          chip.box.setAttribute('fill', colors.bgSubtle);
          chip.label.setAttribute('fill', colors.text);
        }
        decode.textContent = '';
        caption.textContent = '';
        clearMarks();
        refreshLru();
      },
    };

    /** 결과 도장을 그 묶음 아래에 찍는다. */
    function stamp(mark: string, fill: string, slot: number): void {
      const setIndex = Math.floor(slot / ways);
      const center = bandX(setIndex, ways) + bandW(ways) / 2;
      stampBox.setAttribute('x', String(center - STAMP_W / 2));
      stampBox.setAttribute('fill', fill);
      stampBox.setAttribute('opacity', '1');
      stampText.setAttribute('x', String(center));
      stampText.setAttribute('opacity', '1');
      stampText.textContent = mark;
    }

    /** 접근열의 칩이 제 칸까지 날아간다. */
    function fly(fromIndex: number, slot: number): Promise<void> {
      const chip = chips[fromIndex];
      if (!chip) return Promise.resolve();
      const x0 = chipX(fromIndex, addresses.length);
      const x1 = cellX(slot) + cellW / 2 - CHIP_W / 2;
      const y0 = CHIP_Y;
      const y1 = CELL_Y + CELL_H / 2 - CHIP_H / 2;
      const box = make('rect', {
        x: x0,
        y: y0,
        width: CHIP_W,
        height: CHIP_H,
        rx: 5,
        fill: colors.itemActive,
        stroke: colors.border,
      });
      const label = make('text', {
        x: x0 + CHIP_W / 2,
        y: y0 + 18,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.stateInk,
      });
      label.textContent = chip.label.textContent ?? '';
      flyLayer.appendChild(box);
      flyLayer.appendChild(label);
      return tween(FLY_MS, (t) => {
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        box.setAttribute('x', String(x));
        box.setAttribute('y', String(y));
        box.setAttribute('opacity', String(1 - t * 0.35));
        label.setAttribute('x', String(x + CHIP_W / 2));
        label.setAttribute('y', String(y + 18));
        label.setAttribute('opacity', String(1 - t * 0.35));
        if (t >= 1) {
          if (box.parentNode) box.parentNode.removeChild(box);
          if (label.parentNode) label.parentNode.removeChild(label);
        }
      });
    }

    return instance;
  },
};
