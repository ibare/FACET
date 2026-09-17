/**
 * 인덱스와 태그 무대 — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 뼈대
 *
 * 위쪽에 주소가 한 줄의 비트로 서고, 아래에 캐시가 줄 넷으로 눕는다. 주소가
 * 끊기면 세 토막이 벌어지고, 벌어진 토막이 각자 제 자리로 **날아간다** —
 * 인덱스는 상자 바깥 왼쪽에 내려앉아 그 줄을 가리키고, 태그는 그 줄의 태그 칸에
 * 들어가 남고, 오프셋은 바이트 눈금 위에 내려앉아 한 칸을 짚는다.
 *
 * **셋 다 화면에 남는다.** 이 조각의 주장이 "하나가 셋으로 갈려 각자 다른 일을
 * 한다" 이므로 어느 토막도 다음 국면에서 먼저 지워지지 않는다. 통째의 주소는
 * 띠 위의 표식(`label.address`)으로 계속 서서 견줄 짝이 된다.
 *
 * ── 칠의 축을 가른다 (S-scene · 프로토콜 4 절)
 *
 *   채움     = **값의 형편** — 그 자리에 무엇이 들어 있나. 태그 칸이 찼나
 *              비었나 (점선 빈 테두리), 이 바이트 눈금이 짚혔나.
 *   색 테두리 = **이번 걸음이 짚은 것** — 인덱스가 고른 줄의 테와 화살표,
 *              오프셋이 가리키는 점선.
 *   흐린 글자 = **지나간 자취** — 그 줄을 거쳐 간 앞 태그들.
 *
 * 세 어휘가 서로를 덮지 않으므로, 한 줄이 "지금 누구의 것인가" 와 "누가 거쳐
 * 갔나" 와 "이번에 고른 줄인가" 를 한 화면에서 함께 말한다. 한 축에 값을 셋
 * 이상 싣는 자리가 없다.
 *
 * 토막마다 색이 하나씩 붙고(태그 · 인덱스 · 오프셋), 그 토막이 맡은 자리가 같은
 * 색으로 물든다 — 토막과 일이 색으로 묶인다.
 *
 * ── 움직임
 *
 * 정적 그리기가 정본이라 토막들은 이미 끝 자리에 서 있다. 걸음은 **아직 못 온
 * 만큼을 뒤로 물려** 두었다가 놓아 준다. 셋이 함께 흩어지는 걸음은 한 뜻으로
 * 묶여 있으므로 **시계를 나누지 않고** 한 보간에 셋과 밀려나는 앞 태그까지 함께
 * 싣는다 (S-scene).
 *
 * 출발 그림은 `prev` 가 아니라 장면의 `phase` 와 `fields` 에서 셈한다 — 국면마다
 * 토막이 서는 자리가 순수 함수로 정해지므로 `render` 가 `prev` 를 아예 들추지
 * 않는다 (S-scene MUST).
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하고, 세로는 이 그림이 정해 여기 상수로 둔다
 * (S-piece). 줄 수가 달라져도 상자 높이는 그대로 두고 줄 높이를 줄여 담는다 (S-view).
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { IndexAndTagScene } from './scene.js';
import type { IndexAndTagFields } from './algorithm.js';

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
/**
 * 캐시 상자의 높이.
 *
 * 줄 하나가 태그 칸(30) 위에 여백을 두고 **그 아래에 지나간 태그의 자취**를
 * 담을 만큼 높다. 자취를 둘 자리를 만드는 것이 이 그림에서 늘어난 몫이다.
 */
const BOX_H = 194;
const ROW_GAP = 6;
/** 태그 칸이 줄 위쪽에서 떨어지는 거리. 남는 아래가 자취의 자리다. */
const CHIP_TOP = 3;
/** 자취 글자의 baseline (줄 윗변 기준). */
const TRACE_DY = CHIP_TOP + CHIP_H + 9;
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

/**
 * 캔버스에서 역산한 자리. 장면은 좌표를 모르므로 (S-piece) 여기서 매번 셈한다.
 *
 * 이름을 `Layout` 으로 둔다 — `Scene` 은 이제 장면의 이름이다.
 */
type Layout = {
  gutterW: number;
  boxX: number;
  boxW: number;
  tagInnerW: number;
  fieldX: number;
  ticksX: number;
  cellW: number;
  rowH: number;
  rowY(i: number): number;
  tickX(i: number): number;
};

type Slot = { x: number; y: number };

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

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 값을 width 자리 이진수 문자열로. 앞을 0 으로 채운다. */
function toBits(value: number, width: number): string {
  let out = '';
  for (let i = width - 1; i >= 0; i -= 1) out += (value >> i) & 1;
  return out;
}

/**
 * 한글처럼 넓은 글자를 가려 대강의 가로폭을 잰다.
 *
 * 범위는 코드 포인트로 적는다 — 글자를 그대로 적으면 이 파일이 다른 문자 체계의
 * 글자를 품게 된다.
 */
const WIDE = /[\u1100-\u11FF\u2E80-\u9FFF\uA960-\uA97F\uAC00-\uD7FF\uF900-\uFAFF\uFF00-\uFF60]/;

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

/** 캔버스와 바탕에서 자리를 역산한다. 남는 폭을 여백으로 버리지 않는다 (S-piece). */
function layoutOf(f: IndexAndTagFields): Layout {
  const gutterW = f.indexWidth * BIT_W;
  const boxX = PAD + gutterW + 14;
  const boxW = W - PAD - boxX;
  const tagInnerW = f.tagWidth * BIT_W;
  const tagW = tagInnerW + 8;
  const fieldX = boxX + NUM_W + 4;
  const ticksLeft = boxX + NUM_W + tagW + 8;
  const ticksAvail = boxX + boxW - 8 - ticksLeft;
  const cellW = Math.max(6, Math.floor(ticksAvail / f.lineSize));
  const ticksX = ticksLeft + Math.round((ticksAvail - cellW * f.lineSize) / 2);
  const rowH = Math.floor((BOX_H - (f.lineCount - 1) * ROW_GAP) / f.lineCount);
  return {
    gutterW,
    boxX,
    boxW,
    tagInnerW,
    fieldX,
    ticksX,
    cellW,
    rowH,
    rowY: (i) => BOX_Y + i * (rowH + ROW_GAP),
    tickX: (i) => ticksX + i * cellW,
  };
}

/** 토막 셋의 폭 (픽셀). */
function widths(f: IndexAndTagFields): { tag: number; index: number; offset: number } {
  return { tag: f.tagWidth * BIT_W, index: f.indexWidth * BIT_W, offset: f.offsetWidth * BIT_W };
}

/** 한 몸으로 붙어 선 자리 — 아직 끊기지 않았다. */
function joinedSlots(f: IndexAndTagFields): {
  tag: Slot;
  index: Slot;
  offset: Slot;
  x0: number;
  total: number;
} {
  const w = widths(f);
  const total = w.tag + w.index + w.offset;
  const x0 = Math.round((W - total) / 2);
  return {
    tag: { x: x0, y: STRIP_Y },
    index: { x: x0 + w.tag, y: STRIP_Y },
    offset: { x: x0 + w.tag + w.index, y: STRIP_Y },
    x0,
    total,
  };
}

/** 끊긴 자리가 벌어진 자리. */
function splitSlots(f: IndexAndTagFields): { tag: Slot; index: Slot; offset: Slot } {
  const j = joinedSlots(f);
  return {
    tag: { x: j.tag.x - SPLIT_GAP, y: STRIP_Y },
    index: j.index,
    offset: { x: j.offset.x + SPLIT_GAP, y: STRIP_Y },
  };
}

/** 셋이 제 일을 하러 간 자리. */
function placedSlots(
  f: IndexAndTagFields,
  g: Layout,
  line: number,
  byte: number,
): { tag: Slot; index: Slot; offset: Slot } {
  const w = widths(f);
  const dockY = g.rowY(line) + CHIP_TOP;
  return {
    index: { x: PAD, y: dockY },
    tag: { x: g.fieldX, y: dockY },
    offset: {
      x: clamp(g.tickX(byte) + g.cellW / 2 - w.offset / 2, PAD, W - PAD - w.offset),
      y: DOCK_Y,
    },
  };
}

export const indexAndTagStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<IndexAndTagScene> {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const hues = categorical(3, 'vivid');
    const tagColor = hues[0] ?? colors.accent;
    const indexColor = hues[1] ?? colors.accent;
    const offsetColor = hues[2] ?? colors.accent;

    // ── 층. 넷 다 걸음마다 통째로 다시 세운다. 고정 자리에 남는 요소를 하나도
    //    두지 않으므로 "재건 밖 요소" 가 없다 (S-scene).
    const gBox = el('g', {});
    const gMark = el('g', {});
    const gStrip = el('g', {});
    const gCaption = el('g', {});
    svg.appendChild(gBox);
    svg.appendChild(gMark);
    svg.appendChild(gStrip);
    svg.appendChild(gCaption);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 걸음 하나가 rAF 를 여러 번 지난다. 가운데에 unmount 가 끼어들면 남은
     * 프레임이 이미 새로 선 화면을 덮을 수 있으므로, 프레임마다 자기 번호가 아직
     * 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는 장면 조각에서
     * 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을
          // 덮는 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((Date.now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 조각 만들기 ───────────────────────────────────────────────────────

    /** 비트 글자 한 줄. 칩 안에도, 줄에 굳은 태그에도 같은 것을 쓴다. */
    function glyphs(parent: SVGGElement, bits: string, ink: string): void {
      for (let i = 0; i < bits.length; i += 1) {
        const node = el('text', {
          x: i * BIT_W + BIT_W / 2,
          y: CHIP_H / 2 + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: ink,
        });
        node.textContent = bits[i] ?? '';
        parent.appendChild(node);
      }
    }

    /**
     * 주소 띠의 토막 하나.
     *
     * 한 몸일 때는 채우지 않는다 — 색이 갈리는 것은 끊긴 뒤다. 채움은 값의
     * 형편이고, 표식(`tag` · `index` · `offset`)은 그 칠에 딸린다.
     */
    function chip(
      bits: string,
      mark: string,
      slot: Slot,
      filled: boolean,
      color: string,
    ): SVGGElement {
      const g = el('g', { transform: `translate(${slot.x},${slot.y})` });
      const w = bits.length * BIT_W;
      g.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: w,
          height: CHIP_H,
          rx: 6,
          fill: filled ? color : 'none',
          stroke: 'none',
        }),
      );
      if (filled) {
        const label = el('text', {
          x: w / 2,
          y: CHIP_LABEL_DY,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        label.textContent = mark;
        g.appendChild(label);
      }
      glyphs(g, bits, filled ? colors.stateInk : colors.text);
      gStrip.appendChild(g);
      return g;
    }

    /** 줄에 굳은 태그 — 칸이 물들고 그 안에 비트가 남는다. */
    function storedGroup(g: Layout, line: number, bits: string): SVGGElement {
      const node = el('g', { transform: `translate(${g.fieldX},${g.rowY(line) + CHIP_TOP})` });
      glyphs(node, bits, colors.stateInk);
      gBox.appendChild(node);
      return node;
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    type Drawn = {
      g: Layout;
      /** 줄에 굳은 태그. 없는 줄은 `null`. */
      stored: (SVGGElement | null)[];
      /** 줄의 자취 글자. 자취가 없으면 `null`. */
      trace: (SVGGElement | null)[];
      /** 띠 위에 선 토막. 이미 제 일을 하러 간 토막은 `null`. */
      tagChip: SVGGElement | null;
      indexChip: SVGGElement | null;
      offsetChip: SVGGElement | null;
      whole: SVGRectElement | null;
      addrLabel: SVGTextElement | null;
      /** 인덱스가 고른 줄의 테 · 화살표, 오프셋이 가리키는 점선과 짚힌 눈금. */
      marks: SVGElement[];
    };

    function captionOf(scene: IndexAndTagScene): string {
      const c = scene.current;
      if (c === null || scene.phase === null) return '';
      switch (scene.phase) {
        case 'arrived':
          return t('caption.arrives', 'One address arrives: {addr}.', { addr: c.addr });
        case 'split':
          return t('caption.splits', 'It breaks into three — tag, index, offset.');
        case 'placed':
          return c.evicted === null
            ? t(
                'caption.dispatch',
                'The index picks line {line}, the tag stays in it, the offset points at byte {offset}.',
                { line: c.line, offset: c.offset },
              )
            : t(
                'caption.evicted',
                'That line was holding tag {old}; tag {tag} takes its place — same line, different place.',
                { old: c.evicted, tag: c.tag },
              );
        case 'done':
          return t(
            'caption.done',
            'Different places can share one line. The tag is what tells them apart.',
          );
        default:
          return '';
      }
    }

    function drawCaption(text: string): void {
      if (text === '') return;
      const fs = Number.parseFloat(fontSizes.sm);
      const lines = wrapText(text, W - PAD * 4, fs, CAPTION_LINES);
      lines.forEach((line, i) => {
        const node = el('text', {
          x: W / 2,
          y: CAPTION_Y + i * CAPTION_LH,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.text,
        });
        node.textContent = line;
        gCaption.appendChild(node);
      });
    }

    function drawScene(scene: IndexAndTagScene): Drawn {
      gBox.textContent = '';
      gMark.textContent = '';
      gStrip.textContent = '';
      gCaption.textContent = '';

      const f = scene.fields;
      const g = layoutOf(f);
      const c = scene.current;
      const phase = scene.phase;

      // ── 캐시 상자와 머리글
      gBox.appendChild(
        el('rect', {
          x: g.boxX,
          y: BOX_Y,
          width: g.boxW,
          height: BOX_H,
          rx: 8,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );

      const header = (x: number, label: string): void => {
        const node = el('text', {
          x,
          y: RULER_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        node.textContent = label;
        gBox.appendChild(node);
      };
      header(g.boxX + NUM_W / 2, MARK.line);
      header(g.fieldX + g.tagInnerW / 2, MARK.tag);
      for (let b = 0; b < f.lineSize; b += RULER_EVERY) {
        const node = el('text', {
          x: g.tickX(b) + g.cellW / 2,
          y: RULER_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        node.textContent = String(b);
        gBox.appendChild(node);
      }

      // ── 줄
      const stored: (SVGGElement | null)[] = [];
      const trace: (SVGGElement | null)[] = [];
      const hotByte = c !== null && (phase === 'placed' || phase === 'done') ? c.offset : -1;
      const hotLine = c !== null && (phase === 'placed' || phase === 'done') ? c.line : -1;

      for (let i = 0; i < f.lineCount; i += 1) {
        const y = g.rowY(i);
        const midY = y + CHIP_TOP + CHIP_H / 2;

        const num = el('text', {
          x: g.boxX + NUM_W / 2,
          y: midY + 5,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        num.textContent = String(i);
        gBox.appendChild(num);

        // 태그 칸 — **채움이 값의 형편을 말한다.** 차 있으면 물들고, 비어 있으면
        // 점선 빈 테두리로 남는다.
        const held = scene.held[i] ?? null;
        gBox.appendChild(
          el('rect', {
            x: g.fieldX,
            y: y + CHIP_TOP,
            width: g.tagInnerW,
            height: CHIP_H,
            rx: 6,
            ...(held === null
              ? { fill: 'none', stroke: colors.border, 'stroke-width': 1, 'stroke-dasharray': '3 3' }
              : { fill: tagColor, stroke: 'none' }),
          }),
        );
        stored.push(held === null ? null : storedGroup(g, i, toBits(held, f.tagWidth)));

        // 지나간 태그 — **흐린 글자**로 남는 자취다. 이 줄을 여럿이 거쳐 갔다는
        // 것이 이 조각의 결론이라 완주 화면에 남아야 한다 (프로토콜 4 절).
        const gone = scene.passed[i] ?? [];
        if (gone.length === 0) {
          trace.push(null);
        } else {
          const node = el('g', {});
          const step = f.tagWidth * 7 + 8;
          gone.forEach((tagValue, k) => {
            const text = el('text', {
              x: g.fieldX + k * step,
              y: y + TRACE_DY,
              'font-family': fonts.mono,
              'font-size': fontSizes.xs,
              fill: colors.textMuted,
              opacity: 0.7,
            });
            text.textContent = toBits(tagValue, f.tagWidth);
            node.appendChild(text);
          });
          gBox.appendChild(node);
          trace.push(node);
        }

        // 바이트 눈금. 짚힌 칸만 오프셋 색으로 찬다.
        for (let b = 0; b < f.lineSize; b += 1) {
          gBox.appendChild(
            el('rect', {
              x: g.tickX(b) + 1,
              y: midY - 6,
              width: Math.max(2, g.cellW - 2),
              height: 12,
              rx: 2,
              fill: i === hotLine && b === hotByte ? offsetColor : colors.border,
            }),
          );
        }
      }

      // ── 표시물. **색 테두리가 "이번 걸음이 짚은 것"** 을 말한다.
      const marks: SVGElement[] = [];
      if (c !== null && (phase === 'placed' || phase === 'done')) {
        const y = g.rowY(c.line);
        const midY = y + CHIP_TOP + CHIP_H / 2;
        const frame = el('rect', {
          x: g.boxX + 2,
          y,
          width: g.boxW - 4,
          height: g.rowH,
          rx: 6,
          fill: 'none',
          stroke: indexColor,
          'stroke-width': 2,
        });
        const pointer = el('path', {
          d: `M ${g.boxX - 11} ${midY - 6} L ${g.boxX - 2} ${midY} L ${g.boxX - 11} ${midY + 6} Z`,
          fill: indexColor,
        });
        const dock = placedSlots(f, g, c.line, c.offset);
        const wOff = widths(f).offset;
        const drop = el('line', {
          x1: dock.offset.x + wOff / 2,
          y1: DOCK_Y + CHIP_H,
          x2: g.tickX(c.offset) + g.cellW / 2,
          y2: midY - 7,
          stroke: offsetColor,
          'stroke-width': 1.5,
          'stroke-dasharray': '3 4',
          opacity: 0.9,
        });
        gMark.appendChild(frame);
        gMark.appendChild(pointer);
        gMark.appendChild(drop);
        marks.push(frame, pointer, drop);
      }

      // ── 주소 띠
      let whole: SVGRectElement | null = null;
      let addrLabel: SVGTextElement | null = null;
      let tagChip: SVGGElement | null = null;
      let indexChip: SVGGElement | null = null;
      let offsetChip: SVGGElement | null = null;

      if (c !== null && phase !== null) {
        const joined = joinedSlots(f);
        if (phase === 'arrived') {
          whole = el('rect', {
            x: joined.x0,
            y: STRIP_Y,
            width: joined.total,
            height: CHIP_H,
            rx: 6,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          });
          gStrip.appendChild(whole);
        }

        addrLabel = el('text', {
          x: W / 2,
          y: ADDR_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: colors.textMuted,
        });
        addrLabel.textContent = t('label.address', 'address {addr}', { addr: c.addr });
        gStrip.appendChild(addrLabel);

        const slots =
          phase === 'arrived'
            ? joined
            : phase === 'split'
              ? splitSlots(f)
              : placedSlots(f, g, c.line, c.offset);
        const filled = phase !== 'arrived';

        // 태그는 제 자리에 가면 줄에 굳어 `stored` 가 된다 — 띠에 두 벌로 서지
        // 않는다. 날아가는 그림은 운동이 그때만 짓는다.
        if (phase === 'arrived' || phase === 'split') {
          tagChip = chip(toBits(c.tag, f.tagWidth), MARK.tag, slots.tag, filled, tagColor);
        }
        indexChip = chip(toBits(c.line, f.indexWidth), MARK.index, slots.index, filled, indexColor);
        offsetChip = chip(
          toBits(c.offset, f.offsetWidth),
          MARK.offset,
          slots.offset,
          filled,
          offsetColor,
        );
      }

      drawCaption(captionOf(scene));

      return { g, stored, trace, tagChip, indexChip, offsetChip, whole, addrLabel, marks };
    }

    // ── 국면마다의 운동 ───────────────────────────────────────────────────

    /** 주소가 위에서 내려앉아 한 몸으로 선다. */
    function flowArrived(d: Drawn, f: IndexAndTagFields, mine: number): Promise<void> {
      const joined = joinedSlots(f);
      const chips: { node: SVGGElement; x: number }[] = [];
      if (d.tagChip !== null) chips.push({ node: d.tagChip, x: joined.tag.x });
      if (d.indexChip !== null) chips.push({ node: d.indexChip, x: joined.index.x });
      if (d.offsetChip !== null) chips.push({ node: d.offsetChip, x: joined.offset.x });
      if (chips.length === 0) return Promise.resolve();
      const whole = d.whole;
      const label = d.addrLabel;
      return tween(ENTER_MS, mine, (p) => {
        const e = ease(p);
        const dy = lerp(-16, 0, e);
        const shade = String(e);
        for (const c of chips) {
          c.node.setAttribute('transform', `translate(${c.x},${STRIP_Y + dy})`);
          c.node.setAttribute('opacity', shade);
        }
        if (whole !== null) {
          whole.setAttribute('y', String(STRIP_Y + dy));
          whole.setAttribute('opacity', shade);
        }
        if (label !== null) {
          label.setAttribute('y', String(ADDR_LABEL_Y + dy));
          label.setAttribute('opacity', shade);
        }
      });
    }

    /**
     * 끊긴 자리가 벌어진다 — 이 걸음이 보이는 것은 갈라짐 그 자체다.
     *
     * 정적 그리기가 이미 벌어진 자리에 세워 두었으므로, 운동은 **아직 못 벌어진
     * 만큼을 도로 붙여** 두었다가 놓아 준다. 한 몸을 감싸던 테두리는 벌어지며
     * 사라지는 것이라 운동 중에만 짓는다.
     */
    function flowSplit(d: Drawn, f: IndexAndTagFields, mine: number): Promise<void> {
      if (d.tagChip === null || d.offsetChip === null) return Promise.resolve();
      const tagNode = d.tagChip;
      const offNode = d.offsetChip;
      const joined = joinedSlots(f);
      const apart = splitSlots(f);
      const ghost = el('rect', {
        x: joined.x0,
        y: STRIP_Y,
        width: joined.total,
        height: CHIP_H,
        rx: 6,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      });
      gStrip.insertBefore(ghost, gStrip.firstChild);

      return tween(SPLIT_MS, mine, (p) => {
        const e = ease(p);
        // 목표 자리에 아직 안 벌어진 몫을 더한다 — 끝에서 그 몫이 0 이라 보간의
        // 끝자리가 남지 않는다 (프로토콜 4 절).
        const gap = SPLIT_GAP * (1 - e);
        tagNode.setAttribute('transform', `translate(${apart.tag.x + gap},${STRIP_Y})`);
        offNode.setAttribute('transform', `translate(${apart.offset.x - gap},${STRIP_Y})`);
        ghost.setAttribute('opacity', String(1 - e));
      });
    }

    /**
     * 셋이 제 자리로 날아간다. 조금씩 어긋나게 떠나 저마다의 길이 보이게 한다.
     *
     * 셋이 흩어지는 것과 앞 태그가 밀려나는 것이 **한 뜻**이므로 시계를 나누지
     * 않고 한 보간에 함께 싣는다 (S-scene). 태그 칩과 밀려나는 앞 태그는 정지
     * 화면에 없는 요소라 여기서만 짓는다.
     */
    function flowPlaced(
      d: Drawn,
      scene: IndexAndTagScene,
      mine: number,
    ): Promise<void> {
      const c = scene.current;
      if (c === null || d.indexChip === null || d.offsetChip === null) return Promise.resolve();
      const f = scene.fields;
      const g = d.g;
      const from = splitSlots(f);
      const to = placedSlots(f, g, c.line, c.offset);

      // 태그는 날아가 줄에 굳는다. 굳은 모습은 정적 그리기가 이미 세워 두었으니
      // 날아오는 동안만 가려 둔다.
      const landing = d.stored[c.line] ?? null;
      if (landing !== null) landing.setAttribute('opacity', '0');
      const flyingTag = chip(toBits(c.tag, f.tagWidth), MARK.tag, from.tag, true, tagColor);

      // 밀려나는 앞 태그 — 떨어져 나가는 그림은 운동 중에만 있다.
      const evicted = c.evicted;
      const leaving =
        evicted === null ? null : storedGroup(g, c.line, toBits(evicted, f.tagWidth));
      const traceNode = evicted === null ? null : (d.trace[c.line] ?? null);
      if (traceNode !== null) traceNode.setAttribute('opacity', '0');

      for (const node of d.marks) node.setAttribute('opacity', '0');

      const legs: { node: SVGGElement; from: Slot; to: Slot; t0: number }[] = [
        { node: d.indexChip, from: from.index, to: to.index, t0: 0 },
        { node: flyingTag, from: from.tag, to: to.tag, t0: 0.16 },
        { node: d.offsetChip, from: from.offset, to: to.offset, t0: 0.32 },
      ];

      return tween(FLIGHT_MS, mine, (p) => {
        for (const leg of legs) {
          const q = clamp01((p - leg.t0) / (1 - leg.t0));
          const e = ease(q);
          const x = lerp(leg.from.x, leg.to.x, e);
          // 살짝 떠올랐다 내려앉는다 — 곧장 미끄러지면 옮겨졌다기보다 늘어난
          // 것으로 보인다.
          const y = lerp(leg.from.y, leg.to.y, e) - Math.sin(Math.PI * e) * 12;
          leg.node.setAttribute('transform', `translate(${x},${y})`);
        }
        if (leaving !== null) {
          const e = ease(clamp01(p / 0.6));
          leaving.setAttribute(
            'transform',
            `translate(${g.fieldX},${g.rowY(c.line) + CHIP_TOP + 26 * e})`,
          );
          leaving.setAttribute('opacity', String(1 - e));
          if (traceNode !== null) traceNode.setAttribute('opacity', String(e));
        }
        // 짚은 표식은 토막이 닿고 나서 든다.
        const showMarks = String(clamp01((p - 0.62) / 0.28));
        for (const node of d.marks) node.setAttribute('opacity', showMarks);
        if (landing !== null) landing.setAttribute('opacity', String(clamp01((p - 0.7) / 0.2)));
      });
    }

    /** 줄에 남은 증언들을 한 번 울린다. 어느 줄인지는 장면이 안다. */
    function flowDone(d: Drawn, scene: IndexAndTagScene, mine: number): Promise<void> {
      const g = d.g;
      const rings: { node: SVGRectElement; y: number }[] = [];
      for (let i = 0; i < scene.fields.lineCount; i += 1) {
        if ((scene.held[i] ?? null) === null) continue;
        const y = g.rowY(i) + CHIP_TOP;
        const node = el('rect', {
          x: g.fieldX,
          y,
          width: g.tagInnerW,
          height: CHIP_H,
          rx: 6,
          fill: 'none',
          stroke: tagColor,
          'stroke-width': 2,
        });
        gMark.appendChild(node);
        rings.push({ node, y });
      }
      if (rings.length === 0) return Promise.resolve();
      return tween(PULSE_MS, mine, (p) => {
        const e = ease(p);
        const grow = 7 * e;
        for (const ring of rings) {
          ring.node.setAttribute('x', String(g.fieldX - grow));
          ring.node.setAttribute('y', String(ring.y - grow));
          ring.node.setAttribute('width', String(g.tagInnerW + grow * 2));
          ring.node.setAttribute('height', String(CHIP_H + grow * 2));
          ring.node.setAttribute('opacity', String(1 - e));
        }
      });
    }

    function flowFor(d: Drawn, scene: IndexAndTagScene, mine: number): Promise<void> {
      switch (scene.phase) {
        case 'arrived':
          return flowArrived(d, scene.fields, mine);
        case 'split':
          return flowSplit(d, scene.fields, mine);
        case 'placed':
          return flowPlaced(d, scene, mine);
        case 'done':
          return flowDone(d, scene, mine);
        default:
          return Promise.resolve();
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: IndexAndTagScene,
      _prev: IndexAndTagScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      await flowFor(drawn, next, mine);
      if (!alive(mine)) return;

      // 보간이 남긴 좌표 끝자리와 운동 중에만 있던 조각이 노드째 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
