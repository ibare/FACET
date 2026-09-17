/**
 * 자리 옮기기 stage — 미끄러지는 그림.
 *
 * 동사가 "미끄러진다" 이므로 화면에서 실제로 미끄러져야 한다. 칸(자리)은 붙박이로
 * 서 있고 비트만 통째로 옆으로 옮겨간다. 칸 위에는 그 자리의 무게(128 … 1)가
 * 적혀 있어서, 비트가 한 칸 왼쪽으로 옮겨 앉으면 그 비트가 올라선 무게가 두 배가
 * 되는 것이 눈에 보인다 — 곱셈을 말로 주장하지 않고 자리로 보인다.
 *
 * ── 어휘를 셋으로 가른다
 *
 * 한 화면에 세 가지가 함께 서야 해서 축을 갈랐다 (한 축에 뜻을 여럿 실으면 어느
 * 쪽도 복원되지 않는다).
 *
 *   · **채움** = 지금 그 자리에 비트가 있다 — 꽉 찬 타일.
 *   · **테두리(점선·흐림)** = **직전 걸음에 비트가 있던 자리** — 칸의 테두리.
 *     자리를 옮겼다는 것이 멎은 화면에도 남는다. 타일을 칸보다 조금 작게 그려
 *     타일이 앉은 칸의 테두리도 가려지지 않는다.
 *   · **테두리(점선·danger) + 그릇 밖 + 아래로 처짐** = **끝을 넘어가 버려진 비트**.
 *     살아 있는 비트와 같은 모양으로 그리면 "다 있다" 로 읽혀 정반대가 된다.
 *
 * 밀려 나가는 비트는 미끄러지는 동안 채움이 빠지고 테두리가 들어차, 그릇을 벗어나는
 * 순간 제 실체를 잃는다. 운동이 멎는 자리가 곧 정적 그리기가 세우는 유령의 자리다.
 *
 * ── 어떻게 그리나
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 전체를
 * 세우고, 방금 달라진 걸음 하나만 흐르게 한다 (S-scene). 그래서 되돌릴 명령이
 * 필요 없고, 어느 걸음에서 어느 걸음으로 뛰어도 같은 길이다.
 *
 * 운동의 출발 그림은 `prev` 가 아니라 장면의 `was` 가 말한다 — 앞 장면을 들추면
 * "`prev` 는 고르는 데만" 을 어기고, 화면의 거울(옛 `Token.slot`)을 되읽으면 되짚어
 * 세운 직후에 칸이 엉뚱한 자리에서 출발한다.
 *
 * 칸 줄은 mount 에서 한 번 세운다 — 칸 수는 처음부터 끝까지 그대로이고 `initialData`
 * 를 좁히는 자리가 mount 이기 때문이다 (S-piece). 그 위에 얹히는 타일·자취·식·캡션은
 * 걸음마다 장면에서 다시 만든다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
} from '@ffacet/core/runtime';

import {
  exactOf,
  valueOfBits,
  type BitShiftDir,
  type BitShiftScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 가로는 러너가 정한다. 세로는 그림이 정하는 값이라 그림 곁에 둔다 (S-piece). */
const W = PIECE_CANVAS_W;
const H = 168;

const PLACE_Y = 25; // 자리 무게 글자 baseline
const RAIL_Y = 36; // 칸 윗변
const RAIL_H = 54;
const EXPR_Y = 114; // 식 baseline
const CAP_Y = 140; // 캡션 첫 줄 baseline
const CAP_LINE = 17;
const CAP_SIDE = 24;

/** 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece). */
const CELL_MAX_W = 60;

/** 타일이 칸보다 이만큼 작다 — 앉은 칸의 테두리(자취)가 가려지지 않게. */
const TILE_INSET = 6;
const TILE_PAD = 4;

const PLACE_MS = 300; // 칸에 내려앉는 시간
const SLIDE_MS = 420; // 한 칸 미는 시간
const CLEAR_MS = 170; // 앞 밀기의 비트를 걷는 시간
const DROP_RISE = 28; // 내려앉기 전 떠 있는 높이
const FALL_DIP = 12; // 그릇 밖으로 나간 비트가 떨어지며 내려가는 거리

/** 버려진 비트의 흐림. 살아 있는 것과 한눈에 갈려야 한다. */
const GHOST_OPACITY = 0.9;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 버림 없는 셈을 글자로. 200 ÷ 16 이면 '12.5' 가 된다. */
function fmt(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** 칸 줄을 세우는 데 필요한 것. 값이 아니라 그릇의 모양이다. */
function readBitCount(initialData: unknown): number {
  const d = (
    typeof initialData === 'object' && initialData !== null ? initialData : {}
  ) as Record<string, unknown>;
  const raw = d.bits;
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : 8;
  return Math.min(16, Math.max(2, n));
}

export const bitShiftStageView: CanvasView = {
  canvas: { height: H },

  mount(_container, params): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const bitCount = readBitCount(params.initialData);

    // 남는 폭을 좌우 여백으로 버리지 않되, **그릇 밖으로 나간 비트가 설 자리를
    // 양쪽에 한 칸씩** 남긴다. `W / (bitCount + 2)` 가 그것을 보장한다.
    const cellW = Math.min(CELL_MAX_W, Math.floor(W / (bitCount + 2)));
    const railW = cellW * bitCount;
    const originX = Math.round((W - railW) / 2);
    const slotX = (slot: number): number => originX + slot * cellW;
    /** 그릇을 벗어난 비트가 서는 자리 — 레일 바로 바깥 한 칸. */
    const outsideX = (dir: BitShiftDir): number => slotX(dir === 'left' ? -1 : bitCount);

    const root = el('g');
    const railLayer = el('g');
    const tokenLayer = el('g');
    root.appendChild(railLayer);
    root.appendChild(tokenLayer);
    svg.appendChild(root);

    // ── 붙박이 칸. 비트가 떠난 자리에서는 바탕의 0 이 드러난다.
    const cells: SVGRectElement[] = [];
    const placeLabels: SVGTextElement[] = [];
    for (let j = 0; j < bitCount; j += 1) {
      const cell = el('rect', {
        x: slotX(j) + 2,
        y: RAIL_Y,
        width: cellW - 4,
        height: RAIL_H,
        rx: 7,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      cells.push(cell);
      railLayer.appendChild(cell);

      const zero = el('text', {
        x: slotX(j) + cellW / 2,
        y: RAIL_Y + RAIL_H / 2 + 7,
        'text-anchor': 'middle',
        fill: c.textMuted,
        opacity: 0.5,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
      });
      zero.textContent = '0';
      railLayer.appendChild(zero);

      // 자리의 무게. 수 표기라 문안이 아니다 (C10 표식).
      const place = el('text', {
        x: slotX(j) + cellW / 2,
        y: PLACE_Y,
        'text-anchor': 'middle',
        fill: c.textMuted,
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
      });
      place.textContent = String(2 ** (bitCount - 1 - j));
      placeLabels.push(place);
      railLayer.appendChild(place);
    }

    // ── 식 두 줄. 왼쪽은 실제로 일어난 밀기, 오른쪽은 버림 없는 셈.
    const mainText = el('text', {
      x: originX,
      y: EXPR_Y,
      'text-anchor': 'start',
      fill: c.text,
      'font-family': fonts.mono,
      'font-size': fontSizes.lg,
    });
    const mirrorText = el('text', {
      x: originX + railW,
      y: EXPR_Y,
      'text-anchor': 'end',
      fill: c.textMuted,
      'font-family': fonts.mono,
      'font-size': fontSizes.md,
    });
    root.appendChild(mainText);
    root.appendChild(mirrorText);

    const capSize = Number.parseFloat(fontSizes.md);
    const capLines = [0, 1].map((i) => {
      const line = el('text', {
        x: W / 2,
        y: CAP_Y + i * CAP_LINE,
        'text-anchor': 'middle',
        fill: c.text,
        'font-family': fonts.body,
        'font-size': fontSizes.md,
      });
      root.appendChild(line);
      return line;
    });

    // ── 걸어 둔 것과 기다리는 것 ────────────────────────────────────────────
    //
    // 기다림은 전부 프레임 위에 있다 — 걸어 둔 타이머가 없다.

    let destroyed = false;
    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 걸음 함수가 `await` 를 지나므로 빗장이 필요하다. `isInstant` / `onScrubStart`
     * 는 빗장이 되지 못한다 — **러너는 장면 조각에서 그 둘을 부르지 않는다**
     * (S-scene). 실효 있는 것은 `opts.animate` 검사와 이 세대 빗장뿐이다.
     */
    let gen = 0;
    const waiters = new Set<() => void>();
    const raf = new Set<number>();
    const canAnimate = typeof requestAnimationFrame === 'function';

    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 프레임 보간으로 흘린다. `draw` 가 받는 것은 **고르게 흐르는** 0→1 이고,
     * 완급은 부르는 쪽이 건다 — 한 시계 안에서 마디를 나눠 쓰기 때문이다.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT) — 되짚기는 `animate:false`
     * 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 한다.
     *
     * destroy 가 프레임만 거두면 취소된 tick 이 아예 불리지 않아 promise 를 풀
     * 길이 사라진다. 기다리던 것을 따로 깨운다 (S-piece).
     */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine) || !canAnimate || ms <= 0) {
          if (alive(mine)) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = Math.min(1, (Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            raf.delete(id);
            tick();
          });
          raf.add(id);
        };
        tick();
      });
    }

    // ── 타일 만들기 ─────────────────────────────────────────────────────────

    function tileBox(attrs: Record<string, string | number>): SVGRectElement {
      return el('rect', {
        x: TILE_INSET,
        y: TILE_PAD,
        width: cellW - TILE_INSET * 2,
        height: RAIL_H - TILE_PAD * 2,
        rx: 6,
        ...attrs,
      });
    }

    function tileGlyph(fill: string): SVGTextElement {
      const glyph = el('text', {
        x: cellW / 2,
        y: RAIL_H / 2 + 7,
        'text-anchor': 'middle',
        fill,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
      });
      glyph.textContent = '1';
      return glyph;
    }

    /** 살아 있는 비트 — **채움**. */
    function solidTile(): SVGGElement {
      const g = el('g');
      g.appendChild(tileBox({ fill: c.primary }));
      g.appendChild(tileGlyph(c.textInverse));
      return g;
    }

    /** 그릇 밖으로 나가 버려진 비트 — **테두리만**. 실체가 없다. */
    function ghostTile(): SVGGElement {
      const g = el('g');
      g.appendChild(
        tileBox({
          fill: 'none',
          stroke: c.danger,
          'stroke-width': 2,
          'stroke-dasharray': '5 4',
        }),
      );
      g.appendChild(tileGlyph(c.danger));
      return g;
    }

    function setAt(g: SVGGElement, x: number, dy: number, opacity: number): void {
      g.setAttribute('transform', `translate(${x}, ${RAIL_Y + dy})`);
      g.setAttribute('opacity', String(opacity));
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      tokenLayer.textContent = '';
    }

    /** 직전 걸음에 비트가 서 있던 칸의 **테두리**. 자리를 옮겼다는 자취다. */
    function paintRail(was: string | null): void {
      for (let j = 0; j < cells.length; j += 1) {
        const cell = cells[j];
        if (!cell) continue;
        const held = was !== null && was[j] === '1';
        cell.setAttribute('stroke', held ? c.ghostOutline : c.border);
        cell.setAttribute('stroke-width', held ? '2' : '1');
        if (held) cell.setAttribute('stroke-dasharray', '5 4');
        else cell.removeAttribute('stroke-dasharray');
      }
    }

    /** 비트가 올라선 자리의 무게만 진하게. 값은 그 무게들의 합이다. */
    function litPlaces(bits: string | null): void {
      for (let j = 0; j < placeLabels.length; j += 1) {
        const label = placeLabels[j];
        if (!label) continue;
        const on = bits !== null && bits[j] === '1';
        label.setAttribute('fill', on ? c.text : c.textMuted);
        label.setAttribute('font-weight', on ? '700' : '400');
      }
    }

    function setStrip(s: BitShiftScene): void {
      mainText.textContent = '';
      while (mirrorText.firstChild) mirrorText.removeChild(mirrorText.firstChild);
      if (s.bits === null) return;

      const value = valueOfBits(s.bits);
      mainText.textContent = `${s.start} ${s.dir === 'left' ? '<<' : '>>'} ${s.shiftCount} = ${value}`;

      // 버림 없는 셈. 오른쪽 밀기에서 1 이 떨어져 나간 걸음에서만 소수점이 남고,
      // 그 조각이 곧 그릇 밖으로 나간 비트다.
      const exact = fmt(exactOf(s.dir, s.start, s.shiftCount));
      const dot = exact.indexOf('.');
      const head = el('tspan');
      head.textContent = `${s.start} ${s.dir === 'left' ? '×' : '÷'} ${2 ** s.shiftCount} = ${
        dot < 0 ? exact : exact.slice(0, dot)
      }`;
      mirrorText.appendChild(head);
      if (dot >= 0) {
        const tail = el('tspan', { fill: c.danger });
        tail.textContent = exact.slice(dot);
        mirrorText.appendChild(tail);
      }
    }

    function charWidth(ch: string, size: number): number {
      const code = ch.codePointAt(0) ?? 0;
      const wide =
        (code >= 0x1100 && code <= 0x11ff) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xff00 && code <= 0xff60);
      return wide ? size : size * 0.54;
    }

    /**
     * 캡션은 두 줄까지 담는다. 세로는 마운트 뒤 바뀌지 않아야 하므로 (S-view)
     * 줄 자리를 늘 잡아 두고 글만 나눠 넣는다.
     */
    function setCaption(text: string): void {
      const budget = W - CAP_SIDE * 2;
      const lines = ['', ''];
      let at = 0;
      for (const word of text.split(' ')) {
        const joined = lines[at] === '' ? word : `${lines[at]} ${word}`;
        let width = 0;
        for (const ch of joined) width += charWidth(ch, capSize);
        if (at === 0 && width > budget && lines[0] !== '') {
          at = 1;
          lines[1] = word;
          continue;
        }
        lines[at] = joined;
      }
      for (let k = 0; k < capLines.length; k += 1) {
        const line = capLines[k];
        if (line) line.textContent = lines[k] ?? '';
      }
    }

    /**
     * 장면은 **무엇을 말할지**만 담는다. 문자도, 그 안의 수도 여기서 만든다 —
     * 캡션의 수와 화면의 비트가 같은 자료에서 나와야 갈리지 않는다 (C10 · 함정 10).
     */
    function drawCaption(s: BitShiftScene): void {
      if (s.caption === null || s.bits === null) {
        setCaption('');
        return;
      }
      const value = valueOfBits(s.bits);
      switch (s.caption.kind) {
        case 'start':
          setCaption(
            t('caption.start', '{bits} bits hold {value}.', { bits: s.bits.length, value }),
          );
          return;
        case 'turn':
          setCaption(
            t('caption.turn', 'The other way now. {bits} bits hold {value}.', {
              bits: s.bits.length,
              value,
            }),
          );
          return;
        case 'left':
          setCaption(
            t('caption.left', 'One slot left — every place doubles. Now {value}.', { value }),
          );
          return;
        case 'right':
          setCaption(
            t('caption.right', 'One slot right — every place halves. Now {value}.', { value }),
          );
          return;
        case 'dropped':
          setCaption(
            t(
              'caption.dropped',
              'The last bit ran off the end. Exact division gives {exact}, what is left is {value}.',
              { exact: exactOf(s.dir, s.start, s.shiftCount), value },
            ),
          );
          return;
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(s: BitShiftScene): void {
      paintRail(s.was);
      litPlaces(s.bits);
      setStrip(s);
      drawCaption(s);
      if (s.bits === null) return;

      for (let j = 0; j < bitCount; j += 1) {
        if (s.bits[j] !== '1') continue;
        const g = solidTile();
        setAt(g, slotX(j), 0, 1);
        tokenLayer.appendChild(g);
      }

      // 끝을 넘어가 버려진 비트. 여기가 이 조각의 결론이라 **멎은 화면에도 남는다**.
      if (s.dropped !== null) {
        const g = ghostTile();
        setAt(g, outsideX(s.dir), FALL_DIP, GHOST_OPACITY);
        tokenLayer.appendChild(g);
      }
    }

    // ── 걸음 함수 ───────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 타일은 이미 끝 자리에 서 있다. 흐르게 하려면 출발
    // 그림으로 되돌려 놓고 시작하는데, 그 사이에 타이머도 프레임도 없어 끝 자리가
    // 번쩍이지 않는다. 출발 그림은 장면의 `was` · `step.gone` 이 말한다.

    /** 시작값을 칸에 놓는다 — 앞 밀기의 비트를 걷고 위에서 내려앉는다. */
    function runPlace(s: BitShiftScene, gone: string | null, mine: number): Promise<void> {
      if (s.bits === null) return Promise.resolve();
      rewind();

      const going: SVGGElement[] = [];
      if (gone !== null) {
        for (let j = 0; j < bitCount; j += 1) {
          if (gone[j] !== '1') continue;
          const g = solidTile();
          setAt(g, slotX(j), 0, 1);
          tokenLayer.appendChild(g);
          going.push(g);
        }
      }

      const landing: { g: SVGGElement; x: number }[] = [];
      for (let j = 0; j < bitCount; j += 1) {
        if (s.bits[j] !== '1') continue;
        const g = solidTile();
        setAt(g, slotX(j), -DROP_RISE, 0);
        tokenLayer.appendChild(g);
        landing.push({ g, x: slotX(j) });
      }

      // 걷기와 내려앉기는 한 뜻으로 묶인 걸음이라 **시계를 하나로** 둔다. 늦음은
      // 프레임 안에서 셈한다 — 둘로 나누면 lockstep 이 우연히 맞는 꼴이 된다.
      const clearMs = going.length > 0 ? CLEAR_MS : 0;
      const total = clearMs + PLACE_MS;
      const share = clearMs / total;
      return animate(total, mine, (p) => {
        if (going.length > 0) {
          const q = ease(Math.min(1, p / share));
          for (const g of going) g.setAttribute('opacity', String(1 - q));
        }
        const e = ease(Math.max(0, (p - share) / (1 - share)));
        for (const m of landing) setAt(m.g, m.x, -DROP_RISE * (1 - e), e);
      });
    }

    /**
     * 무리가 통째로 한 칸 미끄러진다. 그릇을 벗어나는 것은 나가면서 실체를 잃는다.
     *
     * 옮길 것을 **한 목록에 모아 한 시계로** 흘린다. 무리가 함께 미끄러지는 것이
     * 이 조각의 주장 자체라, 칸마다 시계를 따로 돌리면 나란함이 우연이 된다.
     */
    function runShift(s: BitShiftScene, mine: number): Promise<void> {
      const was = s.was;
      if (was === null || s.bits === null) return Promise.resolve();
      rewind();

      const delta = s.dir === 'left' ? -1 : 1;
      const moves: {
        g: SVGGElement;
        solid: SVGGElement | null;
        ghost: SVGGElement | null;
        from: number;
        to: number;
      }[] = [];

      for (let j = 0; j < bitCount; j += 1) {
        if (was[j] !== '1') continue;
        const next = j + delta;
        if (next < 0 || next >= bitCount) {
          // 나가는 비트 — 채움이 빠지고 테두리가 들어찬다. 두 겹을 한 자리에
          // 겹쳐 두고 흐림만 맞바꾼다.
          const g = el('g');
          const solid = solidTile();
          const ghost = ghostTile();
          g.appendChild(solid);
          g.appendChild(ghost);
          tokenLayer.appendChild(g);
          moves.push({ g, solid, ghost, from: slotX(j), to: outsideX(s.dir) });
        } else {
          const g = solidTile();
          tokenLayer.appendChild(g);
          moves.push({ g, solid: null, ghost: null, from: slotX(j), to: slotX(next) });
        }
      }

      for (const m of moves) {
        setAt(m.g, m.from, 0, 1);
        m.solid?.setAttribute('opacity', '1');
        m.ghost?.setAttribute('opacity', '0');
      }

      return animate(SLIDE_MS, mine, (p) => {
        const e = ease(p);
        for (const m of moves) {
          const x = m.from + (m.to - m.from) * e;
          if (m.solid && m.ghost) {
            setAt(m.g, x, FALL_DIP * e, 1);
            m.solid.setAttribute('opacity', String(1 - e));
            m.ghost.setAttribute('opacity', String(GHOST_OPACITY * e));
          } else {
            setAt(m.g, x, 0, 1);
          }
        }
      });
    }

    /**
     * 장면을 그린다.
     *
     * 앞 장면을 들추지 않는다 — 무엇을 흐르게 할지는 `step` 이 말하고 출발 그림은
     * `was` 가 말하므로, `prev` 와 견줄 일이 없다 (S-scene).
     */
    async function render(
      next: BitShiftScene,
      _prev: BitShiftScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (!step) return;
      if (step.kind === 'place') await runPlace(next, step.gone, mine);
      else await runShift(next, mine);
      if (!alive(mine)) return;

      // 운동이 남긴 속성·보간 끝자리를 통째로 지운다. 속성을 하나씩 거두면 반드시
      // 하나를 빠뜨린다. 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      rewind();
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of raf) cancelAnimationFrame(id);
        raf.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
