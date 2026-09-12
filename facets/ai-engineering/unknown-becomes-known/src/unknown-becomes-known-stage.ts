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
 */

import { fonts, getColors, PIECE_CANVAS_W } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const STAGE_H = 292;

/**
 * 선반에 새긴 라벨. 소문자 한 낱말짜리 도식 라벨이라 **표식**이고, 키를 만들지
 * 않는다 (C10 판정 1·2항). 이 stage 가 그리는 유일한 글자이며 나머지 문안은
 * projector 가 완성해 넘긴다.
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

type Scene = {
  vocab: string[];
  /** 낱말 줄에 자리를 잡을 낱말들 — 말뭉치의 낱말 하나와 처음 보는 낱말들. */
  words: string[];
};

/**
 * `initialData` 를 좁힌다. 이 일이 일어나는 자리는 mount 다 — projector 가 없어도
 * 반드시 불리는 유일한 경로이기 때문이다 (S-piece).
 */
function readScene(initialData: Record<string, unknown> | undefined): Scene {
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
    const scene = readScene(params.initialData);

    // ── 글자 너비 역산 ────────────────────────────────────────────────
    const rows = shelfRows(scene.vocab);
    let fit = CHAR_MAX;
    for (const row of rows) {
      const chars = row.reduce((sum, token) => sum + token.length, 0);
      if (chars === 0) continue;
      const avail = W - 2 * SIDE - (row.length - 1) * CHIP_GAP - row.length * 2 * PAD_X;
      fit = Math.min(fit, avail / chars);
    }
    if (scene.words.length > 0) {
      // 조각을 이으면 낱말 + 끝 표식이 된다. 어떻게 갈릴지 몰라도 글자 수는 안다.
      const chars = scene.words.reduce((sum, word) => sum + word.length + END.length, 0);
      // 낱말마다 조각 둘을 기준으로 여백과 이음매를 잡아 둔다.
      const slack = scene.words.length * (2 * 2 * PAD_X + SEAM) + (scene.words.length - 1) * WORD_GAP;
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
      const widths = scene.words.map((word) => (word.length + END.length) * CHAR + 2 * 2 * PAD_X + SEAM);
      const total = widths.reduce((a, b) => a + b, 0) + (scene.words.length - 1) * WORD_GAP;
      let x = (W - total) / 2;
      scene.words.forEach((word, i) => {
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

    // ── 상태 ────────────────────────────────────────────────────────
    /** 낱말 줄에 서 있는 통짜 낱말. */
    const wordTiles = new Map<string, Tile>();
    /** 토막 줄에 갈라져 있는 조각. */
    const pieceTiles = new Map<string, Tile[]>();
    /** 받아 내어 낱말 줄에 남은 조각들. */
    const parked = new Map<string, Tile[]>();
    /** 이미 어휘와 맞물린 낱말. */
    const locked = new Set<string>();

    async function arriveWord(word: string): Promise<Tile> {
      const cell = cells.get(word) ?? { x: SIDE, w: W - 2 * SIDE };
      const w = word.length * WORD_CHAR + 2 * PAD_X;
      const x = cell.x + (cell.w - w) / 2;
      const tile = makeTile(gWork, word, {
        x,
        y: WORD_Y - 20,
        w,
        h: WORD_H,
        charW: WORD_CHAR,
        fontSize: WORD_FS,
        fill: palette.bgSubtle,
        ink: palette.text,
        stroke: palette.border,
      });
      wordTiles.set(word, tile);
      await animate(240, (p) => {
        const e = ease(p);
        tile.g.setAttribute('opacity', String(e));
        setPos(tile, x, lerp(WORD_Y - 20, WORD_Y, e));
      });
      return tile;
    }

    /** 통째로 어휘를 훑는다 — 그리고 아무것도 맞지 않는다. */
    async function probeWhole(word: string): Promise<void> {
      const tile = wordTiles.get(word) ?? (await arriveWord(word));
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
      tile.rect.setAttribute('stroke', palette.danger);
      tile.label.setAttribute('fill', palette.danger);
      await animate(180, (p) => {
        ghost.g.setAttribute('opacity', String(1 - p));
        tile.rect.setAttribute('stroke-width', String(1.4 + Math.sin(Math.PI * p) * 1.6));
      });
      ghost.g.remove();
      tile.rect.setAttribute('stroke-width', '1.4');
    }

    /** 낱말이 갈라진다 — 통짜 하나가 조각 여럿이 되어 벌어지며 내려간다. */
    async function splitWord(word: string, pieces: string[]): Promise<void> {
      if (pieces.length === 0) return;
      const cell = cells.get(word) ?? { x: SIDE, w: W - 2 * SIDE };
      const tile = wordTiles.get(word) ?? (await arriveWord(word));

      const widths = pieces.map((p) => tileW(p));
      const sum = widths.reduce((a, b) => a + b, 0);
      const joinedW = sum + (pieces.length - 1) * SEAM;
      const spreadW = sum + (pieces.length - 1) * SPLIT_GAP;
      const cx = cell.x + cell.w / 2;
      const fromX0 = cx - joinedW / 2;
      const toX0 = Math.min(Math.max(cx - spreadW / 2, SIDE), W - SIDE - spreadW);
      const y0 = WORD_Y + (WORD_H - TILE_H) / 2;

      const tiles: Tile[] = [];
      const froms: number[] = [];
      const tos: number[] = [];
      let fx = fromX0;
      let tx = toX0;
      pieces.forEach((piece, i) => {
        const made = makeTile(gWork, piece, {
          x: fx,
          y: y0,
          w: widths[i],
          h: TILE_H,
          charW: CHAR,
          fontSize: CHIP_FS,
          fill: palette.itemComparing,
          ink: palette.stateInk,
          stroke: palette.itemComparing,
        });
        made.g.setAttribute('opacity', '0');
        tiles.push(made);
        froms.push(fx);
        tos.push(tx);
        fx += widths[i] + SEAM;
        tx += widths[i] + SPLIT_GAP;
      });
      pieceTiles.set(word, tiles);
      locked.delete(word);

      await animate(440, (p) => {
        const e = ease(p);
        tile.g.setAttribute('opacity', String(Math.max(0, 1 - p * 3)));
        tiles.forEach((piece, i) => {
          piece.g.setAttribute('opacity', String(Math.min(1, p * 3)));
          setPos(piece, lerp(froms[i], tos[i], e), lerp(y0, SPLIT_Y, e));
        });
      });
      tile.g.remove();
      wordTiles.delete(word);
    }

    /** 토막이 선반으로 내려가 제 조각과 맞물린다. */
    async function lockPieces(word: string, pieces: string[]): Promise<void> {
      const tiles = pieceTiles.get(word);
      if (!tiles || tiles.length === 0) return;
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
      pieceTiles.delete(word);
      locked.add(word);
    }

    /** 맞물린 조각이 다시 올라와 낱말을 이룬다 — 아는 조각으로 적은 낱말이다. */
    async function receiveWord(word: string, pieces: string[]): Promise<void> {
      if (!locked.has(word)) await lockPieces(word, pieces);
      if (pieces.length === 0) return;
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
      const restY = WORD_Y + (WORD_H - TILE_H) / 2;

      const flying: Tile[] = [];
      const starts: Array<{ x: number; y: number; w: number }> = [];
      const ends: Array<{ x: number; y: number; w: number }> = [];
      let gx = cell.x + (cell.w - groupW) / 2;
      pieces.forEach((piece, i) => {
        const chip = chips.get(piece);
        const start = chip
          ? { x: chip.homeX, y: chip.homeY, w: chip.w }
          : { x: gx, y: SPLIT_Y, w: widths[i] };
        const end = { x: gx, y: restY, w: widths[i] };
        starts.push(start);
        ends.push(end);
        flying.push(
          makeTile(gWords, piece, {
            x: start.x,
            y: start.y,
            w: start.w,
            h: TILE_H,
            charW: CHAR,
            fontSize: CHIP_FS,
            fill: palette.itemPivot,
            ink: palette.stateInk,
            stroke: palette.itemPivot,
          }),
        );
        gx += widths[i] + SEAM;
      });

      await animate(460, (p) => {
        const e = ease(p);
        flying.forEach((tile, i) => {
          setBox(
            tile,
            lerp(starts[i].x, ends[i].x, e),
            lerp(starts[i].y, ends[i].y, e),
            lerp(starts[i].w, ends[i].w, e),
          );
        });
      });

      // 조각은 어휘에 그대로 남는다 — 한 번 쓰였다고 없어지지 않는다.
      for (const piece of pieces) {
        const chip = chips.get(piece);
        if (chip) lightChip(chip, false);
      }
      for (const tile of flying) {
        tile.rect.setAttribute('fill', palette.itemSorted);
        tile.rect.setAttribute('stroke', palette.itemSorted);
        tile.label.setAttribute('fill', palette.textInverse);
      }
      const old = parked.get(word);
      if (old) for (const tile of old) tile.g.remove();
      parked.set(word, flying);
      locked.delete(word);
    }

    /** 받아 낸 낱말들을 한 번 들어 보인다. */
    async function finish(): Promise<void> {
      const tiles = [...parked.values()].flat();
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

    /** 어휘가 선다. */
    async function layVocab(): Promise<void> {
      const list = [...chips.values()];
      if (list.length === 0) return;
      const OVERLAP = 3;
      await animate(520, (p) => {
        shelfMark.setAttribute('opacity', String(clamp01(p * 3)));
        list.forEach((chip, i) => {
          const local = clamp01((p * (list.length + OVERLAP) - i) / OVERLAP);
          const e = ease(local);
          chip.g.setAttribute('opacity', String(e));
          setPos(chip, chip.homeX, chip.homeY + (1 - e) * 12);
        });
      });
    }

    function resetScene(): void {
      while (gWork.firstChild) gWork.removeChild(gWork.firstChild);
      while (gWords.firstChild) gWords.removeChild(gWords.firstChild);
      wordTiles.clear();
      pieceTiles.clear();
      parked.clear();
      locked.clear();
      shelfMark.setAttribute('opacity', '0');
      for (const chip of chips.values()) {
        lightChip(chip, false);
        chip.g.setAttribute('opacity', '0');
        setPos(chip, chip.homeX, chip.homeY + 12);
      }
      setCaption('');
    }

    // 처음 화면 — 선반은 아직 서지 않았다. 첫 걸음이 그것을 세운다.
    resetScene();

    return {
      layVocab,
      probeWhole,
      splitWord,
      lockPieces,
      receiveWord,
      finish,
      setCaption,
      resetScene,

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
