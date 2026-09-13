/**
 * unknown-becomes-known-stage — 모르는 낱말이 갈라져 어휘의 조각과 맞물리는 장면.
 *
 * ── 왜 이 배치인가
 *
 * 물음의 동사가 "쪼개진다 · 맞물린다" 이므로 세로로 세 층을 둔다.
 *
 *   위     낱말 줄     낱말이 오고, 받아 낸 낱말이 **조각을 드러낸 채** 남는다
 *   가운데 토막 줄     갈라진 토막이 잠깐 선다
 *   아래   어휘 선반   아는 조각들. 토막은 여기까지 내려와 맞물린다
 *
 * 토막과 선반 조각은 **같은 셈으로 크기를 얻는다**(`tileW`). 그래야 맞물릴 때 두
 * 사각형이 어긋남 없이 포개지고, 그 포개짐이 곧 "이 조각은 어휘 안에 있다" 는
 * 말이 된다. 크기가 다르면 아무리 색을 맞춰도 맞물린 것으로 보이지 않는다.
 *
 * ── 글자 너비가 배치를 정한다
 *
 * 한 글자 폭 `CHAR` 하나가 선반 · 토막 · 받아 낸 낱말의 크기를 모두 정한다.
 * 그 값은 캔버스에서 역산하고 상수로는 **상한만** 둔다 (S-piece "그 폭을 채운다").
 * 선반의 긴 줄과 낱말 줄 중 빡빡한 쪽에 맞추므로, 한쪽은 폭을 꽉 채우고 다른
 * 쪽은 가운데로 모인다.
 *
 * 낱말 줄의 칸은 마운트 때 정해야 하는데 그때는 낱말이 어떻게 갈릴지 모른다.
 * 다만 **조각을 이으면 낱말 + 끝 표식**이 되므로 글자 수는 알 수 있다. 칸은 그
 * 글자 수로 잡고, 조각이 셋 이상으로 갈린 낱말이 오면 그 낱말만 여백과 이음매를
 * 좁혀 칸에 담는다 — 글자 너비는 선반과 같아야 하므로 건드리지 않는다.
 *
 * 자르는 규칙 자체는 여기 없다. 그것은 algorithm 의 몫이고 stage 는 갈라진
 * 결과만 받는다.
 *
 * ── 장면을 그린다
 *
 * 걸음마다 부르는 메서드를 두지 않고 `render(next, prev, {animate})` 하나로 산다.
 * 늘 비우고 그 장면이 말하는 것을 전부 다시 세우므로 되돌릴 명령이 필요 없고,
 * 어느 걸음에서 오든 같은 화면이 선다 (S-scene). `prev` 는 **무엇을 흐르게 할지**
 * 고르는 데에만 쓴다 — 방금 하나 달라진 것만 애니메이션으로 건너고 나머지는
 * 곧바로 제자리에 선다. 걸음 함수는 버리지 않고 `withAnim` 을 받게 고쳐 정적으로
 * 세우는 길과 흐르게 하는 길을 겸하게 했다.
 */

import { fonts, getColors, makeTranslator, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import type { UnknownBecomesKnownScene, UnknownCaption } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const STAGE_H = 292;

/**
 * 선반에 새긴 라벨. 소문자 한 낱말짜리 도식 라벨이라 **표식**이고, 키를 만들지
 * 않는다 (C10 판정 1·2항). 이 stage 가 상수로 쥔 유일한 글자이고, 나머지 문안은
 * 장면이 말하려는 것을 `captionFor` 가 `params.t` 로 옮겨 만든다.
 */
const SHELF_MARK = 'vocabulary';

const W = PIECE_CANVAS_W;
const SIDE = 22;

const WORD_Y = 18;
const WORD_H = 34;
const SPLIT_Y = 84;
const MARK_Y = 138;
const ROW_Y = [150, 188];
const TILE_H = 30;

const CAPTION_TOP = 238;
const CAPTION_LINE = 17;
const CAPTION_FS = 13;
const CAPTION_MAX_LINES = 3;

const PAD_X = 8;
const CHIP_GAP = 9;
const WORD_GAP = 14;
/** 받아 낸 낱말에서 조각과 조각 사이 — 붙어 있되 이음매가 보이게. */
const SEAM = 2;
/** 갈라진 토막 사이 — 벌어진 것이 보이게. */
const SPLIT_GAP = 26;

/** 글자 너비의 상한. 실제 값은 캔버스에서 역산한다. */
const CHAR_MAX = 9.5;
/** 고정폭 글꼴의 글자 보내기 ≈ 글자 크기의 0.6배. */
const MONO_RATIO = 0.6;
/** 선반의 줄 수. */
const SHELF_ROWS = 2;
/** 낱말 끝 표식. 여기서는 폭을 미리 잡는 데에만 쓴다. */
const END = '</w>';

const FRAME_MS = 16;

/** 선반이 두 줄일 때 한 줄에 서는 조각 수를 고르게 나눈다. */
function shelfRows(tokens: string[]): string[][] {
  const per = Math.ceil(tokens.length / SHELF_ROWS);
  const rows: string[][] = [];
  for (let i = 0; i < tokens.length; i += per) rows.push(tokens.slice(i, i + per));
  return rows;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - ((2 - 2 * t) * (2 - 2 * t)) / 2);
const lerp = (a: number, b: number, e: number): number => a + (b - a) * e;

/**
 * 캔버스에 자리를 잡는 데 쓰는 밑감. 걸음이 무엇을 보였는지를 담는 **장면**과는
 * 다른 것이라 이름을 가른다 — 이쪽은 mount 때 한 번 정해지고 변하지 않는다.
 */
type Layout = {
  vocab: string[];
  /** 낱말 줄에 자리를 잡을 낱말들 — 말뭉치의 낱말 하나와 처음 보는 낱말들. */
  words: string[];
};

/**
 * `initialData` 를 좁힌다. 이 일이 일어나는 자리는 mount 다 — 장면은 캔버스를
 * 모르므로 자리를 셈할 밑감은 여기서 얻는다 (S-piece).
 */
function readLayout(initialData: Record<string, unknown> | undefined): Layout {
  const raw = (initialData ?? {}) as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  const corpusWord = typeof raw.corpusWord === 'string' ? raw.corpusWord : '';
  const unknownWords = strings(raw.unknownWords);
  return {
    vocab: strings(raw.vocab),
    words: corpusWord === '' ? unknownWords : [corpusWord, ...unknownWords],
  };
}

type Tile = {
  g: SVGGElement;
  rect: SVGRectElement;
  label: SVGTextElement;
  x: number;
  y: number;
  w: number;
};

type Chip = Tile & { token: string; homeX: number; homeY: number; lit: boolean };

type Cell = { x: number; w: number };

export const unknownBecomesKnownStageView: CanvasView = {
  canvas: { height: STAGE_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽만 비운다 — 컨테이너를 비우면 캔버스가 떨어져
    // 나가고 화면이 통째로 사라진다 (S-view).
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 — 저작자
    // 오버라이드는 `params.t` 로만 온다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const layout = readLayout(params.initialData);

    // ── 글자 너비 역산 ────────────────────────────────────────────────
    const rows = shelfRows(layout.vocab);
    let fit = CHAR_MAX;
    for (const row of rows) {
      const chars = row.reduce((sum, token) => sum + token.length, 0);
      if (chars === 0) continue;
      const avail = W - 2 * SIDE - (row.length - 1) * CHIP_GAP - row.length * 2 * PAD_X;
      fit = Math.min(fit, avail / chars);
    }
    if (layout.words.length > 0) {
      // 조각을 이으면 낱말 + 끝 표식이 된다. 어떻게 갈릴지 몰라도 글자 수는 안다.
      const chars = layout.words.reduce((sum, word) => sum + word.length + END.length, 0);
      // 낱말마다 조각 둘을 기준으로 여백과 이음매를 잡아 둔다.
      const slack = layout.words.length * (2 * 2 * PAD_X + SEAM) + (layout.words.length - 1) * WORD_GAP;
      fit = Math.min(fit, (W - 2 * SIDE - slack) / chars);
    }
    const CHAR = Math.max(4, fit);
    const CHIP_FS = CHAR / MONO_RATIO;
    const WORD_CHAR = CHAR * 1.15;
    const WORD_FS = WORD_CHAR / MONO_RATIO;

    const tileW = (token: string, pad = PAD_X): number => token.length * CHAR + 2 * pad;

    // ── 그리기 도구 ──────────────────────────────────────────────────
    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      return node;
    }

    type TileStyle = {
      x: number;
      y: number;
      w: number;
      h: number;
      charW: number;
      fontSize: number;
      fill: string;
      ink: string;
      stroke: string;
      dashed?: boolean;
    };

    function makeTile(parent: SVGGElement, text: string, style: TileStyle): Tile {
      const g = el('g', { transform: `translate(${style.x},${style.y})` });
      const rect = el('rect', {
        x: 0,
        y: 0,
        width: style.w,
        height: style.h,
        rx: 5,
        fill: style.fill,
        stroke: style.stroke,
        'stroke-width': 1.4,
      });
      if (style.dashed) rect.setAttribute('stroke-dasharray', '5 4');
      const label = el('text', {
        x: style.w / 2,
        y: style.h / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-family': fonts.mono,
        'font-size': style.fontSize,
        fill: style.ink,
        // 글꼴 실측에 기대지 않고 글자 폭을 못박는다 — 타일과 글자가 어긋나면
        // 맞물림이 크기로 읽히지 않는다.
        textLength: Math.max(1, text.length * style.charW),
        lengthAdjust: 'spacingAndGlyphs',
      });
      label.textContent = text;
      g.appendChild(rect);
      g.appendChild(label);
      parent.appendChild(g);
      return { g, rect, label, x: style.x, y: style.y, w: style.w };
    }

    function setPos(tile: Tile, x: number, y: number): void {
      tile.x = x;
      tile.y = y;
      tile.g.setAttribute('transform', `translate(${x},${y})`);
    }

    function setBox(tile: Tile, x: number, y: number, w: number): void {
      setPos(tile, x, y);
      tile.w = w;
      tile.rect.setAttribute('width', String(w));
      tile.label.setAttribute('x', String(w / 2));
    }

    // ── 층 ──────────────────────────────────────────────────────────
    const gShelf = el('g', {});
    const gWork = el('g', {});
    const gWords = el('g', {});
    const gCaption = el('g', {});
    svg.appendChild(gShelf);
    svg.appendChild(gWords);
    svg.appendChild(gWork);
    svg.appendChild(gCaption);

    // 선반 머리의 소문자 한 단어는 도식의 표식이라 상수로 둔다 (C10).
    const shelfMark = el('text', {
      x: SIDE,
      y: MARK_Y,
      'font-family': fonts.body,
      'font-size': 11,
      fill: palette.textMuted,
      opacity: 0,
    });
    shelfMark.textContent = SHELF_MARK;
    gShelf.appendChild(shelfMark);

    // ── 선반 ────────────────────────────────────────────────────────
    const chips = new Map<string, Chip>();
    const rowBox: Cell[] = [];
    rows.forEach((row, r) => {
      const widths = row.map((token) => tileW(token));
      const rowW = widths.reduce((a, b) => a + b, 0) + (row.length - 1) * CHIP_GAP;
      let x = (W - rowW) / 2;
      rowBox.push({ x, w: rowW });
      row.forEach((token, i) => {
        const y = ROW_Y[r];
        const tile = makeTile(gShelf, token, {
          x,
          y: y + 12,
          w: widths[i],
          h: TILE_H,
          charW: CHAR,
          fontSize: CHIP_FS,
          fill: palette.itemDefault,
          ink: palette.text,
          stroke: palette.border,
        });
        tile.g.setAttribute('opacity', '0');
        chips.set(token, { ...tile, token, homeX: x, homeY: y, lit: false });
        x += widths[i] + CHIP_GAP;
      });
    });

    function lightChip(chip: Chip, lit: boolean): void {
      // 맞물린 조각은 accent 로, 잉크는 고정 타일 위의 stateInk 로 (design-tokens).
      chip.rect.setAttribute('fill', lit ? palette.itemPivot : palette.itemDefault);
      chip.rect.setAttribute('stroke', lit ? palette.itemPivot : palette.border);
      chip.label.setAttribute('fill', lit ? palette.stateInk : palette.text);
      chip.lit = lit;
    }

    // ── 낱말 줄의 칸 ────────────────────────────────────────────────
    const cells = new Map<string, Cell>();
    {
      const widths = layout.words.map((word) => (word.length + END.length) * CHAR + 2 * 2 * PAD_X + SEAM);
      const total = widths.reduce((a, b) => a + b, 0) + (layout.words.length - 1) * WORD_GAP;
      let x = (W - total) / 2;
      layout.words.forEach((word, i) => {
        cells.set(word, { x, w: widths[i] });
        x += widths[i] + WORD_GAP;
      });
    }

    // ── 캡션 ────────────────────────────────────────────────────────
    /**
     * 글자 폭이 글자 크기에 가까운 (넓은) 글자인지. 한글 낱자 · 동아시아 글자 ·
     * 온폭 기호의 범위이며, 범위 경계는 글자를 직접 적지 않고 부호로만 적는다.
     */
    const WIDE_GLYPH = /[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/;

    function textWidth(s: string, fs: number): number {
      let w = 0;
      for (const ch of s) w += WIDE_GLYPH.test(ch) ? fs : fs * 0.52;
      return w;
    }

    function wrap(text: string, maxW: number): string[] {
      const lines: string[] = [];
      let line = '';
      const flush = (): void => {
        if (line !== '') lines.push(line);
        line = '';
      };
      for (const word of text.split(' ')) {
        const next = line === '' ? word : `${line} ${word}`;
        if (textWidth(next, CAPTION_FS) <= maxW) {
          line = next;
          continue;
        }
        flush();
        if (textWidth(word, CAPTION_FS) <= maxW) {
          line = word;
          continue;
        }
        // 띄어쓰기로 끊기지 않는 글은 글자 단위로 끊는다.
        let part = '';
        for (const ch of word) {
          if (textWidth(part + ch, CAPTION_FS) > maxW) {
            lines.push(part);
            part = ch;
          } else {
            part += ch;
          }
        }
        line = part;
      }
      flush();
      return lines.slice(0, CAPTION_MAX_LINES);
    }

    function setCaption(text: string): void {
      while (gCaption.firstChild) gCaption.removeChild(gCaption.firstChild);
      if (text === '') return;
      wrap(text, W - 2 * SIDE).forEach((line, i) => {
        const node = el('text', {
          x: W / 2,
          y: CAPTION_TOP + i * CAPTION_LINE,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': CAPTION_FS,
          fill: palette.text,
        });
        node.textContent = line;
        gCaption.appendChild(node);
      });
    }

    // ── 시간 ────────────────────────────────────────────────────────
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function animate(ms: number, step: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          step(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 화면에 서 있는 것 ────────────────────────────────────────────
    //
    // 걸음마다 쌓이는 상태가 아니다. `render` 가 매번 비우고 다시 채우는, 지금
    // 그려져 있는 것들의 목록일 뿐이다 — 무엇을 보였는지는 장면이 안다.

    /** 받아 내어 낱말 줄에 남은 조각들. 마무리에서 한 번 들어 보인다. */
    let parked: Tile[] = [];

    /** 늘 비우고 시작한다. 그래야 되돌릴 명령을 따로 둘 필요가 없다 (S-scene). */
    function rewind(): void {
      while (gWork.firstChild) gWork.removeChild(gWork.firstChild);
      while (gWords.firstChild) gWords.removeChild(gWords.firstChild);
      parked = [];
      shelfMark.setAttribute('opacity', '0');
      for (const chip of chips.values()) {
        lightChip(chip, false);
        chip.g.setAttribute('opacity', '0');
        setPos(chip, chip.homeX, chip.homeY + 12);
      }
      setCaption('');
    }

    // ── 선반 ────────────────────────────────────────────────────────

    /** 어휘가 선다. `withAnim` 이 거짓이면 이미 서 있는 꼴로 곧바로 놓는다. */
    function layVocab(withAnim: boolean): Promise<void> {
      const list = [...chips.values()];
      if (list.length === 0) return Promise.resolve();
      const OVERLAP = 3;
      const draw = (p: number): void => {
        shelfMark.setAttribute('opacity', String(clamp01(p * 3)));
        list.forEach((chip, i) => {
          const local = clamp01((p * (list.length + OVERLAP) - i) / OVERLAP);
          const e = ease(local);
          chip.g.setAttribute('opacity', String(e));
          setPos(chip, chip.homeX, chip.homeY + (1 - e) * 12);
        });
      };
      if (!withAnim) {
        draw(1);
        return Promise.resolve();
      }
      return animate(520, draw);
    }

    /** 어휘 조각 여럿을 한꺼번에 켜거나 끈다. */
    function litChips(pieces: string[], lit: boolean): void {
      for (const piece of pieces) {
        const chip = chips.get(piece);
        if (chip) lightChip(chip, lit);
      }
    }

    // ── 낱말 줄 ─────────────────────────────────────────────────────

    /** 통짜 낱말이 낱말 줄에 선다. `withAnim` 이면 살짝 내려오며 나타난다. */
    function arriveWord(word: string, withAnim: boolean): { tile: Tile; done: Promise<void> } {
      const cell = cells.get(word) ?? { x: SIDE, w: W - 2 * SIDE };
      const w = word.length * WORD_CHAR + 2 * PAD_X;
      const x = cell.x + (cell.w - w) / 2;
      const tile = makeTile(gWork, word, {
        x,
        y: withAnim ? WORD_Y - 20 : WORD_Y,
        w,
        h: WORD_H,
        charW: WORD_CHAR,
        fontSize: WORD_FS,
        fill: palette.bgSubtle,
        ink: palette.text,
        stroke: palette.border,
      });
      if (!withAnim) return { tile, done: Promise.resolve() };
      const done = animate(240, (p) => {
        const e = ease(p);
        tile.g.setAttribute('opacity', String(e));
        setPos(tile, x, lerp(WORD_Y - 20, WORD_Y, e));
      });
      return { tile, done };
    }

    /**
     * 통째로는 어휘 밖이라는 표시. **머무는 강조**라 정적 그리기에도 넣는다 —
     * 빠뜨리면 되짚었을 때 붉은 기가 사라진다 (S-scene).
     */
    function markMissed(tile: Tile): void {
      tile.rect.setAttribute('stroke', palette.danger);
      tile.label.setAttribute('fill', palette.danger);
    }

    /** 통째로 어휘를 훑는다 — 그리고 아무것도 맞지 않는다. */
    async function probeWhole(tile: Tile, word: string): Promise<void> {
      const ghost = makeTile(gWork, word, {
        x: tile.x,
        y: tile.y,
        w: tile.w,
        h: WORD_H,
        charW: WORD_CHAR,
        fontSize: WORD_FS,
        fill: 'none',
        ink: palette.textMuted,
        stroke: palette.ghostOutline,
        dashed: true,
      });
      const path = [
        { x: rowBox[0].x, y: ROW_Y[0] },
        { x: rowBox[0].x + rowBox[0].w - ghost.w, y: ROW_Y[0] },
        { x: rowBox[1].x + rowBox[1].w - ghost.w, y: ROW_Y[1] },
        { x: rowBox[1].x, y: ROW_Y[1] },
      ];
      const spans = [170, 200, 140, 200];
      let from = { x: ghost.x, y: ghost.y };
      for (let i = 0; i < path.length; i += 1) {
        const to = path[i];
        const start = from;
        await animate(spans[i], (p) => {
          const e = ease(p);
          setPos(ghost, lerp(start.x, to.x, e), lerp(start.y, to.y, e));
        });
        from = to;
      }
      // 맞는 것이 없었다. 낱말이 통째로는 어휘 밖이라는 표시를 남긴다.
      markMissed(tile);
      await animate(180, (p) => {
        ghost.g.setAttribute('opacity', String(1 - p));
        tile.rect.setAttribute('stroke-width', String(1.4 + Math.sin(Math.PI * p) * 1.6));
      });
      ghost.g.remove();
      tile.rect.setAttribute('stroke-width', '1.4');
    }

    // ── 토막 줄 ─────────────────────────────────────────────────────

    /** 갈라진 토막의 자리 — 통짜에 붙어 있을 때(`froms`)와 벌어졌을 때(`tos`). */
    function splitLayout(
      word: string,
      pieces: string[],
    ): { widths: number[]; froms: number[]; tos: number[]; y0: number } {
      const cell = cells.get(word) ?? { x: SIDE, w: W - 2 * SIDE };
      const widths = pieces.map((piece) => tileW(piece));
      const sum = widths.reduce((a, b) => a + b, 0);
      const joinedW = sum + (pieces.length - 1) * SEAM;
      const spreadW = sum + (pieces.length - 1) * SPLIT_GAP;
      const cx = cell.x + cell.w / 2;
      const froms: number[] = [];
      const tos: number[] = [];
      let fx = cx - joinedW / 2;
      let tx = Math.min(Math.max(cx - spreadW / 2, SIDE), W - SIDE - spreadW);
      widths.forEach((w) => {
        froms.push(fx);
        tos.push(tx);
        fx += w + SEAM;
        tx += w + SPLIT_GAP;
      });
      return { widths, froms, tos, y0: WORD_Y + (WORD_H - TILE_H) / 2 };
    }

    function makePieceTiles(pieces: string[], widths: number[], xs: number[], y: number): Tile[] {
      return pieces.map((piece, i) =>
        makeTile(gWork, piece, {
          x: xs[i],
          y,
          w: widths[i],
          h: TILE_H,
          charW: CHAR,
          fontSize: CHIP_FS,
          fill: palette.itemComparing,
          ink: palette.stateInk,
          stroke: palette.itemComparing,
        }),
      );
    }

    /** 갈라진 채로 토막 줄에 곧바로 세운다. */
    function placeSplit(word: string, pieces: string[]): Tile[] {
      const { widths, tos } = splitLayout(word, pieces);
      return makePieceTiles(pieces, widths, tos, SPLIT_Y);
    }

    /** 낱말이 갈라진다 — 통짜 하나가 조각 여럿이 되어 벌어지며 내려간다. */
    async function splitWord(word: string, pieces: string[], whole: Tile): Promise<void> {
      if (pieces.length === 0) return;
      const { widths, froms, tos, y0 } = splitLayout(word, pieces);
      const tiles = makePieceTiles(pieces, widths, froms, y0);
      for (const tile of tiles) tile.g.setAttribute('opacity', '0');

      await animate(440, (p) => {
        const e = ease(p);
        whole.g.setAttribute('opacity', String(Math.max(0, 1 - p * 3)));
        tiles.forEach((piece, i) => {
          piece.g.setAttribute('opacity', String(Math.min(1, p * 3)));
          setPos(piece, lerp(froms[i], tos[i], e), lerp(y0, SPLIT_Y, e));
        });
      });
      whole.g.remove();
    }

    /** 토막이 선반으로 내려가 제 조각과 맞물린다. 끝에서 그 조각이 켜진다. */
    async function lockPieces(pieces: string[], tiles: Tile[]): Promise<void> {
      if (tiles.length === 0) return;
      const froms = tiles.map((tile) => ({ x: tile.x, y: tile.y }));
      const targets = pieces.map((piece) => chips.get(piece));
      const SPAN = 360;
      const STEP = 120;
      const total = SPAN + STEP * (tiles.length - 1);

      await animate(total, (p) => {
        const now = p * total;
        tiles.forEach((tile, i) => {
          const local = clamp01((now - STEP * i) / SPAN);
          const e = ease(local);
          const chip = targets[i];
          const toX = chip ? chip.homeX : froms[i].x;
          const toY = chip ? chip.homeY : froms[i].y;
          setPos(tile, lerp(froms[i].x, toX, e), lerp(froms[i].y, toY, e));
          if (local >= 1) {
            if (chip && !chip.lit) lightChip(chip, true);
            tile.g.setAttribute('opacity', '0');
          }
        });
      });

      for (const tile of tiles) tile.g.remove();
    }

    // ── 받아 낸 낱말 ────────────────────────────────────────────────

    /** 받아 낸 낱말이 낱말 줄에 앉을 자리. */
    function parkLayout(
      word: string,
      pieces: string[],
    ): { widths: number[]; xs: number[]; restY: number } {
      const cell = cells.get(word) ?? { x: SIDE, w: W - 2 * SIDE };
      const chars = pieces.reduce((sum, piece) => sum + piece.length, 0);
      const seams = (pieces.length - 1) * SEAM;
      let pad = PAD_X;
      let groupW = chars * CHAR + pieces.length * 2 * pad + seams;
      if (groupW > cell.w) {
        // 조각이 셋 이상으로 갈린 낱말. 여백과 이음매만 좁혀 칸에 담는다 —
        // 글자 너비를 줄이면 선반과 크기가 어긋나 맞물림이 안 보인다.
        pad = Math.max(2, (cell.w - chars * CHAR - seams) / (2 * pieces.length));
        groupW = chars * CHAR + pieces.length * 2 * pad + seams;
      }
      const widths = pieces.map((piece) => tileW(piece, pad));
      const xs: number[] = [];
      let gx = cell.x + (cell.w - groupW) / 2;
      for (const w of widths) {
        xs.push(gx);
        gx += w + SEAM;
      }
      return { widths, xs, restY: WORD_Y + (WORD_H - TILE_H) / 2 };
    }

    /** 받아 낸 낱말을 앉은 자리에 곧바로 세운다. */
    function parkWord(word: string, pieces: string[]): void {
      if (pieces.length === 0) return;
      const { widths, xs, restY } = parkLayout(word, pieces);
      pieces.forEach((piece, i) => {
        parked.push(
          makeTile(gWords, piece, {
            x: xs[i],
            y: restY,
            w: widths[i],
            h: TILE_H,
            charW: CHAR,
            fontSize: CHIP_FS,
            fill: palette.itemSorted,
            ink: palette.textInverse,
            stroke: palette.itemSorted,
          }),
        );
      });
    }

    /**
     * 맞물린 조각이 다시 올라와 낱말을 이룬다 — 아는 조각으로 적은 낱말이다.
     *
     * `viaLock` 이면 아직 갈라진 채라 먼저 선반으로 내려보내 맞물린다. 말뭉치에
     * 있던 낱말은 맞물리는 순간을 따로 떼어 보이지 않으므로 이 길로 온다.
     */
    async function receiveWord(word: string, pieces: string[], viaLock: boolean): Promise<void> {
      if (pieces.length === 0) return;
      if (viaLock) await lockPieces(pieces, placeSplit(word, pieces));
      // 맞물려 있던 자리에서 출발한다. 앞 장면에서 켜져 있던 조각을 그대로 세운다.
      else litChips(pieces, true);

      const { widths, xs, restY } = parkLayout(word, pieces);
      const starts = pieces.map((piece, i) => {
        const chip = chips.get(piece);
        return chip
          ? { x: chip.homeX, y: chip.homeY, w: chip.w }
          : { x: xs[i], y: SPLIT_Y, w: widths[i] };
      });
      const flying = pieces.map((piece, i) =>
        makeTile(gWords, piece, {
          x: starts[i].x,
          y: starts[i].y,
          w: starts[i].w,
          h: TILE_H,
          charW: CHAR,
          fontSize: CHIP_FS,
          fill: palette.itemPivot,
          ink: palette.stateInk,
          stroke: palette.itemPivot,
        }),
      );

      await animate(460, (p) => {
        const e = ease(p);
        flying.forEach((tile, i) => {
          setBox(
            tile,
            lerp(starts[i].x, xs[i], e),
            lerp(starts[i].y, restY, e),
            lerp(starts[i].w, widths[i], e),
          );
        });
      });

      // 조각은 어휘에 그대로 남는다 — 한 번 쓰였다고 없어지지 않는다.
      litChips(pieces, false);
      for (const tile of flying) {
        tile.rect.setAttribute('fill', palette.itemSorted);
        tile.rect.setAttribute('stroke', palette.itemSorted);
        tile.label.setAttribute('fill', palette.textInverse);
      }
      parked.push(...flying);
    }

    /** 받아 낸 낱말들을 한 번 들어 보인다. */
    async function finish(): Promise<void> {
      const tiles = [...parked];
      if (tiles.length === 0) return;
      const homes = tiles.map((tile) => ({ x: tile.x, y: tile.y }));
      const SPAN = 360;
      const STEP = 80;
      const total = SPAN + STEP * (tiles.length - 1);
      await animate(total, (p) => {
        const now = p * total;
        tiles.forEach((tile, i) => {
          const local = clamp01((now - STEP * i) / SPAN);
          setPos(tile, homes[i].x, homes[i].y - Math.sin(Math.PI * local) * 5);
        });
      });
      tiles.forEach((tile, i) => setPos(tile, homes[i].x, homes[i].y));
    }

    // ── 문안 ────────────────────────────────────────────────────────

    /** 조각 글자는 데이터라 문안이 아니다. 이어 붙이는 모양만 여기서 정한다. */
    const spell = (pieces: string[]): string => pieces.join(' · ');

    /** 장면이 말하려는 것을 이 locale 의 글로 옮긴다. */
    function captionFor(caption: UnknownCaption | null): string {
      if (caption === null) return '';
      switch (caption.kind) {
        case 'vocab':
          return t('caption.vocab', 'These pieces are all it knows. Pieces: {n}.', {
            n: caption.count,
          });
        case 'missed':
          return t(
            'caption.missed',
            '"{word}" never appeared in the corpus. Swept whole across the vocabulary, it matches nothing.',
            { word: caption.word },
          );
        case 'seenSplit':
          return t(
            'caption.seenSplit',
            '"{word}" was in the corpus. Reading it just means cutting it into pieces: {pieces}.',
            { word: caption.word, pieces: spell(caption.pieces) },
          );
        case 'split':
          return t('caption.split', 'So "{word}" is cut apart: {pieces}.', {
            word: caption.word,
            pieces: spell(caption.pieces),
          });
        case 'lock':
          return t(
            'caption.lock',
            'Each half meets a piece that is already in the vocabulary: {pieces}.',
            { pieces: spell(caption.pieces) },
          );
        case 'seenTaken':
          return t(
            'caption.seenTaken',
            'Both pieces are in the vocabulary, so "{word}" comes back whole. Nothing unusual yet.',
            { word: caption.word },
          );
        case 'received':
          return t('caption.received', '"{word}" is taken in, spelled out of known pieces: {pieces}.', {
            word: caption.word,
            pieces: spell(caption.pieces),
          });
        case 'done':
          // 센 것은 **모르는 낱말만**이다 (algorithm 의 `received`). 화면에는 말뭉치
          // 낱말까지 나란히 서 있으므로, "낱말" 이라고만 하면 독자가 세는 수와
          // 캡션의 수가 어긋난다.
          return t('caption.done', 'An unknown word is never turned away. Unknown words taken in: {n}.', {
            n: caption.count,
          });
      }
    }

    // ── 장면 그리기 ─────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 그런 뒤 `prev` 와 견주어
    // **방금 달라진 하나만** 흐르게 한다 — 되짚기(`animate` 거짓)는 정적으로 선
    // 화면에서 곧바로 끝나므로 타이머가 남지 않는다 (S-scene).
    async function render(
      next: UnknownBecomesKnownScene,
      prev: UnknownBecomesKnownScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      rewind();

      /** 흐르게 할 것 하나. 걸음 하나는 화면의 한 곳만 바꾸므로 둘이 겹치지 않는다. */
      let flowing: Promise<void> | null = null;

      // ── 선반 ──
      if (next.shelfLaid) {
        const laying = opts.animate && prev?.shelfLaid !== true;
        const done = layVocab(laying);
        if (laying) flowing = done;
      }

      // ── 받아 낸 낱말 ──
      const lastIndex = next.received.length - 1;
      const justReceived =
        opts.animate && prev !== null && next.received.length === prev.received.length + 1;
      next.received.forEach((entry, i) => {
        // 방금 받아 낸 것은 곧바로 앉히지 않는다. 선반에서 날아와 앉는다.
        if (justReceived && i === lastIndex) return;
        parkWord(entry.word, entry.pieces);
      });

      // ── 지금 다루는 낱말 ──
      //
      // 앞 장면이 **같은 낱말**을 다루고 있었을 때만 그 단계를 견준다. 걸음을
      // 건너뛰어 `prev` 가 이어지지 않으면 여기서 저절로 걸러져 정적으로 선다.
      const before = prev?.active ?? null;
      const active = next.active;
      const prevPhase =
        active !== null && before !== null && before.word === active.word ? before.phase : null;

      if (active !== null) {
        if (active.phase === 'missed') {
          const { tile, done } = arriveWord(active.word, opts.animate && prevPhase === null);
          if (opts.animate && prevPhase !== 'missed') {
            flowing = done.then(() => probeWhole(tile, active.word));
          } else {
            markMissed(tile);
          }
        } else if (active.phase === 'split') {
          if (opts.animate && prevPhase !== 'split') {
            // 통짜에서 갈라진다. 앞이 `missed` 였다면 이미 붉게 물든 채로 시작한다.
            const { tile, done } = arriveWord(active.word, prevPhase === null);
            if (prevPhase === 'missed') markMissed(tile);
            flowing = done.then(() => splitWord(active.word, active.pieces, tile));
          } else {
            placeSplit(active.word, active.pieces);
          }
        } else {
          // 맞물린 선반 조각은 머무는 강조다 — 정적 그리기에도 넣어야 되짚었을 때 남는다.
          litChips(active.pieces, true);
          if (opts.animate && prevPhase === 'split') {
            // 내려가 맞물리는 것을 보일 참이다. 켜는 일은 그 끝에 맡긴다.
            litChips(active.pieces, false);
            flowing = lockPieces(active.pieces, placeSplit(active.word, active.pieces));
          }
        }
      }

      if (justReceived) {
        const entry = next.received[lastIndex];
        // 갈라진 채였다면 먼저 선반으로 내려가 맞물린 뒤 올라온다.
        const viaLock = before !== null && before.word === entry.word && before.phase !== 'locked';
        flowing = receiveWord(entry.word, entry.pieces, viaLock);
      }

      setCaption(captionFor(next.caption));

      if (!opts.animate) return;
      if (flowing !== null) await flowing;
      if (next.finished && prev?.finished !== true) await finish();
    }

    // 처음 화면 — 선반은 아직 서지 않았다. 첫 걸음이 그것을 세운다.
    rewind();

    return {
      render,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
  },
};
