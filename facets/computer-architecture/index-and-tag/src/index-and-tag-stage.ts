/**
 * index-and-tag 조각의 그림.
 *
 * 위쪽에 주소가 한 줄의 비트로 서고, 아래에 캐시가 줄 넷으로 눕는다.
 * 주소가 끊기면 세 토막이 서로 벌어지고, 벌어진 토막이 각자 제 자리로 **날아간다** —
 * 인덱스는 상자 바깥 왼쪽에 내려앉아 그 줄을 가리키고, 태그는 그 줄의 태그 칸에
 * 들어가 남고, 오프셋은 바이트 눈금 위에 내려앉아 한 칸을 짚는다.
 *
 * 색은 그 자리를 물들인다 — 줄 테두리는 인덱스 색, 태그 칸은 태그 색, 짚힌
 * 눈금은 오프셋 색이다. 토막과 그 토막이 맡은 자리가 같은 색으로 묶인다.
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하고, 세로는 이 그림이 정해 여기 상수로 둔다
 * (S-piece). 줄 수가 달라져도 상자 높이는 그대로 두고 줄 높이를 줄여 담는다 (S-view).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const PAD = 16;
/** 비트 한 자리의 가로 피치. 칩의 폭은 비트 수 × 이것이다. */
const BIT_W = 28;
const CHIP_H = 30;
/** 끊긴 자리가 벌어지는 거리. */
const SPLIT_GAP = 24;
/** 줄 번호 칸의 폭. */
const NUM_W = 24;

const ADDR_LABEL_Y = 22;
const STRIP_Y = 36;
/** 칩 위 표식의 baseline (칩 윗변 기준). */
const CHIP_LABEL_DY = -6;
/** offset 칩이 내려앉는 자 (캐시 상자 바로 위). */
const DOCK_Y = 88;
/** 머리글과 바이트 눈금 숫자의 baseline. */
const RULER_Y = 132;
const BOX_Y = 138;
const BOX_H = 162;
const ROW_GAP = 6;
const CAPTION_Y = BOX_Y + BOX_H + 22;
const CAPTION_LH = 16;
const CAPTION_LINES = 2;
const CANVAS_H = CAPTION_Y + CAPTION_LH * (CAPTION_LINES - 1) + 24;

const ENTER_MS = 300;
const SPLIT_MS = 340;
const FLIGHT_MS = 580;
const PULSE_MS = 520;

/**
 * 도형에 새겨진 표식. 이 분야에서 원어 그대로 쓰는 한 단어 도식 라벨이라
 * 번역 대상이 아니다 (C10 "표식이냐 문안이냐").
 */
const MARK = { tag: 'tag', index: 'index', offset: 'offset', line: 'line' } as const;

/** 바이트 눈금 숫자를 몇 칸마다 적는가. */
const RULER_EVERY = 4;

type Scene = {
  lineSize: number;
  lineCount: number;
  indexWidth: number;
  tagWidth: number;
};

type ArrivePayload = {
  addr: number;
  label: string;
  tagBits: string;
  indexBits: string;
  offsetBits: string;
};

type DispatchPayload = {
  line: number;
  offset: number;
  evicted: boolean;
};

function widthOf(n: number): number {
  return Math.max(1, Math.round(Math.log2(Math.max(1, n))));
}

function posInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 없어도 반드시 불리는
 * 유일한 경로이므로 좁히는 규칙이 두 벌이 되지 않는다 (S-piece).
 */
function readScene(raw: unknown): Scene {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const cacheSize = posInt(d.cacheSize, 64);
  const lineSize = posInt(d.lineSize, 16);
  const lineCount = Math.max(1, Math.floor(cacheSize / lineSize));
  const offsetWidth = widthOf(lineSize);
  const indexWidth = widthOf(lineCount);
  const addrBits = Math.max(offsetWidth + indexWidth + 1, posInt(d.addrBits, 10));
  return { lineSize, lineCount, indexWidth, tagWidth: addrBits - offsetWidth - indexWidth };
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 한글·한자처럼 넓은 글자를 가려 대강의 가로폭을 잰다. */
const WIDE = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿＀-｠]/;

function textWidth(s: string, fs: number): number {
  let w = 0;
  for (const ch of s) w += WIDE.test(ch) ? fs : fs * 0.52;
  return w;
}

function wrapText(s: string, maxW: number, fs: number, maxLines: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const token of s.split(' ')) {
    const candidate = line === '' ? token : `${line} ${token}`;
    if (textWidth(candidate, fs) <= maxW) {
      line = candidate;
      continue;
    }
    if (line !== '') out.push(line);
    line = token;
    // 띄어쓰기가 드문 글은 토막 하나가 한 줄보다 길다 — 글자로 끊는다.
    while (textWidth(line, fs) > maxW && out.length < maxLines) {
      let cut = line.length;
      while (cut > 1 && textWidth(line.slice(0, cut), fs) > maxW) cut -= 1;
      out.push(line.slice(0, cut));
      line = line.slice(cut);
    }
  }
  if (line !== '') out.push(line);
  if (out.length > maxLines) {
    const tail = out.slice(maxLines - 1).join(' ');
    out.length = maxLines - 1;
    out.push(tail);
  }
  return out;
}

export const indexAndTagStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const scene = readScene(params.initialData);
    const hues = categorical(3, 'vivid');
    const tagColor = hues[0] ?? colors.accent;
    const indexColor = hues[1] ?? colors.accent;
    const offsetColor = hues[2] ?? colors.accent;

    // ── 가로 자리 — 캔버스에서 역산한다. 남는 폭을 여백으로 버리지 않는다 (S-piece).
    const gutterW = scene.indexWidth * BIT_W;
    const boxX = PAD + gutterW + 14;
    const boxW = W - PAD - boxX;
    const tagInnerW = scene.tagWidth * BIT_W;
    const tagW = tagInnerW + 8;
    const fieldX = boxX + NUM_W + 4;
    const ticksLeft = boxX + NUM_W + tagW + 8;
    const ticksAvail = boxX + boxW - 8 - ticksLeft;
    const cellW = Math.max(6, Math.floor(ticksAvail / scene.lineSize));
    const ticksX = ticksLeft + Math.round((ticksAvail - cellW * scene.lineSize) / 2);
    const rowH = Math.floor((BOX_H - (scene.lineCount - 1) * ROW_GAP) / scene.lineCount);
    const chipDockDy = Math.round((rowH - CHIP_H) / 2);
    const rowY = (i: number): number => BOX_Y + i * (rowH + ROW_GAP);
    const tickX = (i: number): number => ticksX + i * cellW;

    // ── 애니메이션 살림 — 걸어 둔 것은 모아 두고 destroy 에서 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    function tween(ms: number, onFrame: (raw: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          onFrame(1);
          resolve();
          return;
        }
        const t0 = Date.now();
        let raf = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          frames.delete(raf);
          if (destroyed) {
            onFrame(1);
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - t0) / ms);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          raf = requestAnimationFrame(tick);
          frames.add(raf);
        };
        raf = requestAnimationFrame(tick);
        frames.add(raf);
      });
    }

    // ── 층 ─────────────────────────────────────────────────────────────
    const boxLayer = el('g', {});
    const markLayer = el('g', {});
    const stripLayer = el('g', {});
    const captionLayer = el('g', {});
    svg.appendChild(boxLayer);
    svg.appendChild(markLayer);
    svg.appendChild(stripLayer);
    svg.appendChild(captionLayer);

    // ── 캐시 상자 ───────────────────────────────────────────────────────
    boxLayer.appendChild(
      el('rect', {
        x: boxX,
        y: BOX_Y,
        width: boxW,
        height: BOX_H,
        rx: 8,
        fill: colors.bg,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    function header(x: number, label: string): void {
      const t = el('text', {
        x,
        y: RULER_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      t.textContent = label;
      boxLayer.appendChild(t);
    }
    header(boxX + NUM_W / 2, MARK.line);
    header(fieldX + tagInnerW / 2, MARK.tag);
    for (let b = 0; b < scene.lineSize; b += RULER_EVERY) {
      const t = el('text', {
        x: tickX(b) + cellW / 2,
        y: RULER_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      t.textContent = String(b);
      boxLayer.appendChild(t);
    }

    type Row = { field: SVGRectElement; stored: SVGGElement; ticks: SVGRectElement[] };
    const rows: Row[] = [];

    for (let i = 0; i < scene.lineCount; i += 1) {
      const y = rowY(i);
      const num = el('text', {
        x: boxX + NUM_W / 2,
        y: y + rowH / 2 + 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      num.textContent = String(i);
      boxLayer.appendChild(num);

      const field = el('rect', {
        x: fieldX,
        y: y + chipDockDy,
        width: tagInnerW,
        height: CHIP_H,
        rx: 6,
        fill: 'none',
        stroke: colors.border,
        'stroke-width': 1,
        'stroke-dasharray': '3 3',
      });
      boxLayer.appendChild(field);

      const stored = el('g', { transform: `translate(${fieldX},${y + chipDockDy})`, opacity: 0 });
      boxLayer.appendChild(stored);

      const ticks: SVGRectElement[] = [];
      for (let b = 0; b < scene.lineSize; b += 1) {
        const tick = el('rect', {
          x: tickX(b) + 1,
          y: y + rowH / 2 - 6,
          width: Math.max(2, cellW - 2),
          height: 12,
          rx: 2,
          fill: colors.border,
        });
        boxLayer.appendChild(tick);
        ticks.push(tick);
      }

      rows.push({ field, stored, ticks });
    }

    // ── 표시물 (고른 줄 · 화살표 · 짚은 눈금으로 내리는 점선) ─────────────
    const rowFrame = el('rect', {
      x: boxX + 2,
      y: BOX_Y,
      width: boxW - 4,
      height: rowH,
      rx: 6,
      fill: 'none',
      stroke: indexColor,
      'stroke-width': 2,
      opacity: 0,
    });
    const pointer = el('path', { d: '', fill: indexColor, opacity: 0 });
    const dropLine = el('line', {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 0,
      stroke: offsetColor,
      'stroke-width': 1.5,
      'stroke-dasharray': '3 4',
      opacity: 0,
    });
    markLayer.appendChild(rowFrame);
    markLayer.appendChild(pointer);
    markLayer.appendChild(dropLine);

    // ── 주소 띠 ─────────────────────────────────────────────────────────
    const wholeRect = el('rect', {
      x: 0,
      y: STRIP_Y,
      width: 0,
      height: CHIP_H,
      rx: 6,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
      opacity: 0,
    });
    stripLayer.appendChild(wholeRect);

    const addrLabel = el('text', {
      x: W / 2,
      y: ADDR_LABEL_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.textMuted,
      opacity: 0,
    });
    stripLayer.appendChild(addrLabel);

    type Chip = {
      g: SVGGElement;
      rect: SVGRectElement;
      label: SVGTextElement;
      glyphs: SVGTextElement[];
      bits: string;
      w: number;
      x: number;
      y: number;
      setBits(s: string): void;
      place(x: number, y: number): void;
      paint(filled: boolean, color: string): void;
      show(v: number): void;
    };

    function makeChip(mark: string): Chip {
      const g = el('g', { transform: 'translate(0,0)', opacity: 0 });
      const rect = el('rect', {
        x: 0,
        y: 0,
        width: 0,
        height: CHIP_H,
        rx: 6,
        fill: 'none',
        stroke: 'none',
      });
      const label = el('text', {
        x: 0,
        y: CHIP_LABEL_DY,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
        opacity: 0,
      });
      label.textContent = mark;
      g.appendChild(rect);
      g.appendChild(label);
      stripLayer.appendChild(g);

      const chip: Chip = {
        g,
        rect,
        label,
        glyphs: [],
        bits: '',
        w: 0,
        x: 0,
        y: 0,
        setBits(s) {
          chip.bits = s;
          chip.w = s.length * BIT_W;
          rect.setAttribute('width', String(chip.w));
          label.setAttribute('x', String(chip.w / 2));
          while (chip.glyphs.length < s.length) {
            const t = el('text', {
              x: 0,
              y: CHIP_H / 2 + 5,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
              fill: colors.text,
            });
            g.appendChild(t);
            chip.glyphs.push(t);
          }
          chip.glyphs.forEach((t, i) => {
            t.textContent = i < s.length ? (s[i] ?? '') : '';
            t.setAttribute('x', String(i * BIT_W + BIT_W / 2));
          });
        },
        place(x, y) {
          chip.x = x;
          chip.y = y;
          g.setAttribute('transform', `translate(${x},${y})`);
        },
        paint(filled, color) {
          rect.setAttribute('fill', filled ? color : 'none');
          const ink = filled ? colors.stateInk : colors.text;
          for (const t of chip.glyphs) t.setAttribute('fill', ink);
          label.setAttribute('opacity', filled ? '1' : '0');
        },
        show(v) {
          g.setAttribute('opacity', String(v));
        },
      };
      return chip;
    }

    const tagChip = makeChip(MARK.tag);
    const indexChip = makeChip(MARK.index);
    const offsetChip = makeChip(MARK.offset);

    // ── 캡션 ────────────────────────────────────────────────────────────
    const captionFs = Number.parseFloat(fontSizes.sm);
    const captionEls: SVGTextElement[] = [];
    for (let i = 0; i < CAPTION_LINES; i += 1) {
      const t = el('text', {
        x: W / 2,
        y: CAPTION_Y + i * CAPTION_LH,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      captionLayer.appendChild(t);
      captionEls.push(t);
    }

    // ── 상태 ────────────────────────────────────────────────────────────
    /** 지금 태그 칩이 앉아 있는 줄. 다음 주소가 오면 그 줄의 것으로 굳는다. */
    let dockedLine: number | null = null;
    let markedTick: SVGRectElement | null = null;

    function paintStored(line: number, bits: string): void {
      const row = rows[line];
      if (!row) return;
      row.stored.textContent = '';
      for (let i = 0; i < bits.length; i += 1) {
        const t = el('text', {
          x: i * BIT_W + BIT_W / 2,
          y: CHIP_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.stateInk,
        });
        t.textContent = bits[i] ?? '';
        row.stored.appendChild(t);
      }
      row.stored.setAttribute('opacity', '1');
      row.stored.setAttribute('transform', `translate(${fieldX},${rowY(line) + chipDockDy})`);
      row.field.setAttribute('fill', tagColor);
      row.field.setAttribute('stroke', 'none');
      row.field.setAttribute('stroke-dasharray', '');
    }

    function clearStored(line: number): void {
      const row = rows[line];
      if (!row) return;
      row.stored.textContent = '';
      row.stored.setAttribute('opacity', '0');
      row.stored.setAttribute('transform', `translate(${fieldX},${rowY(line) + chipDockDy})`);
      row.field.setAttribute('fill', 'none');
      row.field.setAttribute('stroke', colors.border);
      row.field.setAttribute('stroke-dasharray', '3 3');
    }

    /** 앉아 있던 태그 칩을 그 줄의 것으로 굳힌다. */
    function absorbDocked(): void {
      if (dockedLine === null) return;
      paintStored(dockedLine, tagChip.bits);
      tagChip.show(0);
      dockedLine = null;
    }

    function clearMarks(): void {
      rowFrame.setAttribute('opacity', '0');
      pointer.setAttribute('opacity', '0');
      dropLine.setAttribute('opacity', '0');
      if (markedTick) {
        markedTick.setAttribute('fill', colors.border);
        markedTick = null;
      }
    }

    function layoutWhole(): void {
      const total = tagChip.w + indexChip.w + offsetChip.w;
      const x0 = Math.round((W - total) / 2);
      tagChip.place(x0, STRIP_Y);
      indexChip.place(x0 + tagChip.w, STRIP_Y);
      offsetChip.place(x0 + tagChip.w + indexChip.w, STRIP_Y);
      wholeRect.setAttribute('x', String(x0));
      wholeRect.setAttribute('width', String(total));
    }

    // ── 바깥이 부르는 것 ────────────────────────────────────────────────

    async function showAddress(a: ArrivePayload): Promise<void> {
      absorbDocked();
      clearMarks();

      tagChip.setBits(a.tagBits);
      indexChip.setBits(a.indexBits);
      offsetChip.setBits(a.offsetBits);
      // 통째로 뜰 때는 셋이 한 몸이다 — 색은 끊긴 뒤에 갈린다.
      tagChip.paint(false, tagColor);
      indexChip.paint(false, indexColor);
      offsetChip.paint(false, offsetColor);
      layoutWhole();
      addrLabel.textContent = a.label;

      const chips = [tagChip, indexChip, offsetChip];
      const homeY = STRIP_Y;
      // 제 자리에 앉아 있던 칩이 띠로 되돌아오는 길이라, 먼저 지워 두지 않으면
      // 첫 프레임 앞에 한 번 번쩍인다.
      for (const c of chips) c.show(0);
      wholeRect.setAttribute('opacity', '0');
      await tween(ENTER_MS, (raw) => {
        const e = ease(raw);
        const dy = lerp(-16, 0, e);
        for (const c of chips) c.place(c.x, homeY + dy);
        wholeRect.setAttribute('y', String(homeY + dy));
        wholeRect.setAttribute('opacity', String(e));
        addrLabel.setAttribute('opacity', String(e));
        for (const c of chips) c.show(e);
      });
      for (const c of chips) c.place(c.x, homeY);
      wholeRect.setAttribute('y', String(homeY));
    }

    /** 끊긴 자리가 벌어진다 — 이 걸음이 보이는 것은 갈라짐 그 자체다. */
    async function splitAddress(): Promise<void> {
      wholeRect.setAttribute('opacity', '0');
      tagChip.paint(true, tagColor);
      indexChip.paint(true, indexColor);
      offsetChip.paint(true, offsetColor);

      const tagFrom = tagChip.x;
      const offFrom = offsetChip.x;
      await tween(SPLIT_MS, (raw) => {
        const e = ease(raw);
        tagChip.place(tagFrom - SPLIT_GAP * e, STRIP_Y);
        offsetChip.place(offFrom + SPLIT_GAP * e, STRIP_Y);
      });
    }

    /** 셋이 제 자리로 날아간다. 조금씩 어긋나게 떠나 저마다의 길이 보이게 한다. */
    async function dispatch(a: DispatchPayload): Promise<void> {
      const line = clamp(Math.floor(a.line), 0, scene.lineCount - 1);
      const byte = clamp(Math.floor(a.offset), 0, scene.lineSize - 1);
      const row = rows[line];
      if (!row) return;
      const dockY = rowY(line) + chipDockDy;
      const offDockX = clamp(
        tickX(byte) + cellW / 2 - offsetChip.w / 2,
        PAD,
        W - PAD - offsetChip.w,
      );

      const legs = [
        { chip: indexChip, to: { x: PAD, y: dockY }, from: { x: indexChip.x, y: indexChip.y }, t0: 0 },
        { chip: tagChip, to: { x: fieldX, y: dockY }, from: { x: tagChip.x, y: tagChip.y }, t0: 0.16 },
        { chip: offsetChip, to: { x: offDockX, y: DOCK_Y }, from: { x: offsetChip.x, y: offsetChip.y }, t0: 0.32 },
      ];

      const evicting = a.evicted;
      const evictFrom = rowY(line) + chipDockDy;

      await tween(FLIGHT_MS, (raw) => {
        for (const leg of legs) {
          const q = clamp((raw - leg.t0) / (1 - leg.t0), 0, 1);
          const e = ease(q);
          const x = lerp(leg.from.x, leg.to.x, e);
          // 살짝 떠올랐다 내려앉는다 — 곧장 미끄러지면 옮겨졌다기보다 늘어난 것으로 보인다.
          const y = lerp(leg.from.y, leg.to.y, e) - Math.sin(Math.PI * e) * 12;
          leg.chip.place(x, y);
        }
        if (evicting) {
          const e = ease(clamp(raw / 0.6, 0, 1));
          row.stored.setAttribute('transform', `translate(${fieldX},${evictFrom + 26 * e})`);
          row.stored.setAttribute('opacity', String(1 - e));
        }
      });

      for (const leg of legs) leg.chip.place(leg.to.x, leg.to.y);
      if (evicting) clearStored(line);

      rowFrame.setAttribute('y', String(rowY(line)));
      rowFrame.setAttribute('opacity', '1');
      const py = rowY(line) + rowH / 2;
      pointer.setAttribute('d', `M ${boxX - 11} ${py - 6} L ${boxX - 2} ${py} L ${boxX - 11} ${py + 6} Z`);
      pointer.setAttribute('opacity', '1');

      const tick = row.ticks[byte];
      if (tick) {
        tick.setAttribute('fill', offsetColor);
        markedTick = tick;
      }
      const dropX = offDockX + offsetChip.w / 2;
      dropLine.setAttribute('x1', String(dropX));
      dropLine.setAttribute('y1', String(DOCK_Y + CHIP_H));
      dropLine.setAttribute('x2', String(tickX(byte) + cellW / 2));
      dropLine.setAttribute('y2', String(rowY(line) + rowH / 2 - 7));
      dropLine.setAttribute('opacity', '0.9');

      dockedLine = line;
    }

    /** 남아 있는 증언들을 한 번 울린다. */
    async function finish(): Promise<void> {
      absorbDocked();
      const rings: SVGRectElement[] = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row || row.stored.getAttribute('opacity') !== '1') continue;
        const ring = el('rect', {
          x: fieldX,
          y: rowY(i) + chipDockDy,
          width: tagInnerW,
          height: CHIP_H,
          rx: 6,
          fill: 'none',
          stroke: tagColor,
          'stroke-width': 2,
        });
        markLayer.appendChild(ring);
        rings.push(ring);
      }
      await tween(PULSE_MS, (raw) => {
        const e = ease(raw);
        const grow = 7 * e;
        for (const ring of rings) {
          ring.setAttribute('x', String(fieldX - grow));
          ring.setAttribute('width', String(tagInnerW + grow * 2));
          ring.setAttribute('height', String(CHIP_H + grow * 2));
          ring.setAttribute('opacity', String(1 - e));
        }
      });
      for (const ring of rings) ring.remove();
    }

    function rewind(): void {
      dockedLine = null;
      clearMarks();
      for (let i = 0; i < rows.length; i += 1) clearStored(i);
      for (const c of [tagChip, indexChip, offsetChip]) c.show(0);
      wholeRect.setAttribute('opacity', '0');
      addrLabel.setAttribute('opacity', '0');
      addrLabel.textContent = '';
      setCaption('');
    }

    function setCaption(text: string): void {
      const lines = text === '' ? [] : wrapText(text, W - PAD * 4, captionFs, CAPTION_LINES);
      captionEls.forEach((t, i) => {
        t.textContent = lines[i] ?? '';
      });
    }

    return {
      showAddress,
      splitAddress,
      dispatch,
      finish,
      rewind,
      setCaption,
      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨우지 않으면 projector 의 await 가 영영 안 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
