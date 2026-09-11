/**
 * primality-stage — 나눠 보는 후보 줄과, 그 줄이 전체에서 차지하는 몫.
 *
 * ── 위: 후보 줄
 *
 * 2 부터 ⌊√n⌋ 까지의 후보를 한 줄에 깔고 왼쪽부터 짚어 간다. 짚은 칸은 그 자리에서
 * 빗금으로 지워진다 — 나누어떨어지지 않았다는 뜻이다. 줄의 오른쪽 끝에는 √ 의
 * 벽이 서고, 마지막 후보를 지난 뒤 그 벽이 솟는다.
 *
 * 칸 수는 손잡이를 따라 여덟에서 서른여덟까지 달라지므로 칸 폭은 캔버스에서
 * 역산하고 상수로는 **상한**만 둔다.
 *
 * ── 아래: 아낌 자(meter)
 *
 * **이 facet 의 주장이 서는 자리다.** 가로 한 줄이 2..n-1 전부(n-2 개)이고,
 * 왼쪽 끝의 도막이 **실제로 본 것**이다. 후보를 하나 짚을 때마다 도막이 그만큼
 * 자라는데, 서른여덟 번을 짚어도 1597 짜리 줄에서는 도막이 열몇 픽셀에 그친다.
 * 배율이 수로 적히기 전에 **길이로 먼저 보인다.**
 *
 * 견주는 쪽을 걸음으로 펴지 않는 까닭이 여기 있다 — 1595 걸음은 낱낱이 보일 수
 * 없고, 보일 수 있다 해도 그것을 다 보는 일이 곧 이 facet 이 하지 말라는 일이다.
 *
 * ── 세로는 마운트한 뒤 바뀌지 않는다
 *
 * 칸 수가 달라져도 캔버스는 고정이다. 폭만 역산하고 높이는 상수다 (S-view).
 *
 * ── 뒷일
 *
 * 애니메이션은 `setTimeout` 프레임 루프이고, 걸어 둔 타이머와 기다리는 promise 를
 * 집합에 담아 `destroy` 가 한자리에서 거둔다. 그것이 안 풀리면 `await ctx.emit`
 * 이 영영 돌아오지 않아 unmount 된 뒤에도 통째로 붙들린다.
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 캔버스
const W = 720;
const H = 300;

// ── 후보 줄
const ROW_TOP = 78;
const CARD_H = 34;
const CARD_MAX_W = 34;
const ROW_SIDE_MIN = 44;
const ROW_LABEL_Y = 60;
const CURSOR_GAP = 5;
const CURSOR_H = 8;
const CURSOR_HALF = 5;
const WALL_PAD = 16;
const WALL_LABEL_Y = 56;

// ── 아낌 자
const METER_X0 = 46;
const METER_X1 = 674;
const METER_TOP = 186;
const METER_H = 20;
const METER_LABEL_Y = 176;
const METER_VALUE_Y = 222;
const RATIO_Y = 176;

// ── 캡션
const CAPTION_TOP = 252;
const CAPTION_LINE = 16;
const CAPTION_SIZE = 12;
/**
 * 캡션 줄 수.
 *
 * 둘로 두었더니 열 언어 중 아홉에서 `caption.wall` 의 **마지막 한 글자**가
 * 잘렸다. 한 글자라 눈에 띄지 않지만 문안이 조금만 길어지면 같은 자리에서
 * 뭉텅이로 사라진다. 셋째 줄의 기준선은 252 + 32 = 284 라 캔버스 300 안에 든다.
 */
const MAX_CAPTION_LINES = 3;

// ── 시간
const FRAME_MS = 16;
const CURSOR_MS = 170;
const STRIKE_MS = 140;
const WALL_MS = 300;
const RATIO_MS = 340;

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const easeInOut = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);

/** 한글·가나·한자는 글자 폭이 글자 크기와 거의 같고, 라틴은 그 절반쯤이다. */
function charWidth(ch: string, size: number): number {
  const code = ch.codePointAt(0) ?? 0;
  const wide =
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xff60);
  return size * (wide ? 1 : 0.52);
}

/**
 * 캡션을 두 줄까지 감는다.
 *
 * 열 언어 중 라틴 계열은 한 줄을 넘기는 것이 있어 고정 한 줄로 두면 잘린다.
 * 실측이 없는 환경(happy-dom)에서도 같은 결과가 나오도록 글자 폭을 어림한다 —
 * 재는 것이 아니라 감는 자리를 정할 뿐이다.
 */
function wrapCaption(text: string, maxWidth: number, size: number): string[] {
  if (text === '') return [];
  const lines: string[] = [];
  let line = '';
  let width = 0;
  let breakAt = -1;
  for (const ch of text) {
    const w = charWidth(ch, size);
    if (width + w > maxWidth && line !== '') {
      if (lines.length === 2) break;
      if (breakAt > 0) {
        lines.push(line.slice(0, breakAt));
        line = line.slice(breakAt + 1);
        width = [...line].reduce((a, c) => a + charWidth(c, size), 0);
      } else {
        lines.push(line);
        line = '';
        width = 0;
      }
      breakAt = -1;
    }
    if (ch === ' ') breakAt = line.length;
    line += ch;
    width += w;
  }
  if (line !== '') lines.push(line);
  return lines.slice(0, MAX_CAPTION_LINES);
}

/** 캡션 상자의 실제 가로. `setCaption` 이 쓰는 것과 같은 값이다. */
const CAPTION_MAX_W = W - 60;

/**
 * 이 문안이 캡션 상자에서 잘리는가.
 *
 * 넘치면 `wrapCaption` 이 **말없이 자른다** — 끝의 한 글자만 사라지면 눈으로는
 * 거의 못 잡는다(실제로 감사에서 열 언어 중 아홉이 마침표 하나씩을 잃고 있었다).
 * 사람이 한 번 찾은 것은 검사가 계속 찾게 한다.
 *
 * 공백을 뺀 글자 수가 그대로면 아무것도 안 잘린 것이다 — 줄을 나누며 없어지는
 * 것은 띄어쓰기뿐이기 때문이다.
 */
export function captionOverflows(text: string): boolean {
  const strip = (s: string): string => s.replace(/\s/g, '');
  return strip(wrapCaption(text, CAPTION_MAX_W, CAPTION_SIZE).join('')).length !== strip(text).length;
}

/**
 * **손잡이 눈금을 여기 두지 않는다.**
 *
 * 원칙 1 로 stage 는 algorithm 을 참조할 수 없으니, 손잡이 값을 stage 가 따로
 * 들면 선언 · algorithm · stage 셋이 갈릴 수 있고 그때 축이 조용히 거짓말을 한다.
 * 묶는 검사를 두는 것보다 **사본을 아예 만들지 않는 쪽**이 낫다.
 *
 * 그래서 이 그림은 손잡이 값을 하나도 모른다. 그릴 것(판정할 수 · ⌊√n⌋ ·
 * 전수 검사 횟수)은 전부 `built` payload 로 들어오고, 그 전에는 아무것도 그리지
 * 않는다. 손잡이 눈금이 걸리는 가로축이 이 화면에 없다는 것이 그것을 가능하게
 * 한다 — 자(meter)의 가로는 손잡이 값이 아니라 **그 회차의 후보 수**다.
 */
export const primalityStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const colors = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);

    // 컨테이너가 아니라 **캔버스 안쪽**을 비운다. 러너는 캔버스를 컨테이너에
    // 먼저 붙이고 mount 를 부르므로, 컨테이너를 비우면 그림판이 통째로 떨어져
    // 나가고 예외 없이 화면만 빈다 (S-view).
    svg.textContent = '';

    // ── 층 순서: 자 → 줄 → 벽 → 커서 → 캡션
    const gMeter = el('g', {});
    const gRow = el('g', {});
    const gWall = el('g', {});
    const gCursor = el('g', {});
    const gCaption = el('g', {});
    for (const g of [gMeter, gRow, gWall, gCursor, gCaption]) svg.appendChild(g);

    function text(
      x: number,
      y: number,
      s: string,
      fill: string,
      size: string,
      anchor: string,
      family: string = fonts.body,
    ): SVGTextElement {
      const t = el('text', {
        x,
        y,
        fill,
        'font-size': size,
        'font-family': family,
        'text-anchor': anchor,
      });
      t.textContent = s;
      return t;
    }

    // ── 아낌 자의 고정 부분
    const meterTrack = el('rect', {
      x: METER_X0,
      y: METER_TOP,
      width: METER_X1 - METER_X0,
      height: METER_H,
      rx: 3,
      // 자는 알고리즘 상태가 아니다 — 바탕은 structural, 채움은 emphasis 다
      // (S-view 색 결정 트리). accent 는 √ 의 벽과 같은 색이라 "제곱근까지" 라는
      // 뜻이 두 자리에서 같은 어휘로 읽힌다.
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    const meterFill = el('rect', {
      x: METER_X0,
      y: METER_TOP,
      width: 0,
      height: METER_H,
      rx: 2,
      fill: colors.accent,
    });
    gMeter.appendChild(meterTrack);
    gMeter.appendChild(meterFill);

    const meterLeftLabel = text(
      METER_X0,
      METER_LABEL_Y,
      '',
      colors.textMuted,
      fontSizes.xs,
      'start',
    );
    const meterRightLabel = text(
      METER_X1,
      METER_LABEL_Y,
      '',
      colors.textMuted,
      fontSizes.xs,
      'end',
    );
    const meterLeftValue = text(METER_X0, METER_VALUE_Y, '', colors.text, fontSizes.sm, 'start');
    const meterRightValue = text(METER_X1, METER_VALUE_Y, '', colors.textMuted, fontSizes.sm, 'end');
    const ratioLabel = text(W / 2, RATIO_Y, '', colors.text, fontSizes.md, 'middle');
    ratioLabel.setAttribute('opacity', '0');
    for (const t of [meterLeftLabel, meterRightLabel, meterLeftValue, meterRightValue, ratioLabel]) {
      gMeter.appendChild(t);
    }

    const rowLabel = text(METER_X0, ROW_LABEL_Y, '', colors.textMuted, fontSizes.xs, 'start');
    gRow.appendChild(rowLabel);

    const captionLines: SVGTextElement[] = [0, 1, 2].map((i) => {
      const t = text(
        W / 2,
        CAPTION_TOP + i * CAPTION_LINE,
        '',
        colors.text,
        fontSizes.sm,
        'middle',
      );
      gCaption.appendChild(t);
      return t;
    });

    // ── 걸어 둔 것과 기다리는 것. destroy 가 한자리에서 거둔다.
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function animate(ms: number, onFrame: (t: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return;
          const t = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          onFrame(t);
          if (t >= 1) {
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

    // ── 판의 상태
    type Card = { tile: SVGRectElement; label: SVGTextElement; strike: SVGLineElement };
    let cards: Card[] = [];
    let cardW = CARD_MAX_W;
    let originX = METER_X0;
    // 판정할 수는 `built` 가 가져온다. 그전에는 벽의 라벨을 그릴 일도 없다.
    let curN = 0;
    let fullSpan = 1;
    let cursor: SVGPolygonElement | null = null;
    let cursorShown = false;
    let cursorX = 0;

    const cardX = (i: number): number => originX + i * cardW;

    function clearGroup(g: SVGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    function resetBoard(): void {
      clearGroup(gRow);
      clearGroup(gWall);
      clearGroup(gCursor);
      cards = [];
      cursor = null;
      cursorShown = false;
      cursorX = 0;
      gRow.appendChild(rowLabel);
      rowLabel.textContent = '';
      meterFill.setAttribute('width', '0');
      meterLeftLabel.textContent = '';
      meterRightLabel.textContent = '';
      meterLeftValue.textContent = '';
      meterRightValue.textContent = '';
      ratioLabel.textContent = '';
      ratioLabel.setAttribute('opacity', '0');
      setCaption('');
    }

    /** 후보 줄과 자의 틀을 세운다. 칸 폭은 캔버스에서 역산한다. */
    function build(n: number, limit: number, fullChecks: number): void {
      resetBoard();
      curN = n;
      fullSpan = Math.max(1, fullChecks);

      const count = Math.max(0, limit - 1); // 후보는 2..limit
      const span = W - ROW_SIDE_MIN * 2;
      cardW = count > 0 ? Math.min(CARD_MAX_W, Math.floor(span / count)) : CARD_MAX_W;
      originX = Math.round((W - cardW * count) / 2);
      const tileW = Math.max(1, cardW - 2);
      const labelSize = Math.max(8, Math.min(12, Math.round(cardW * 0.58)));

      rowLabel.textContent = tr('label.candidates', 'Candidate divisors');
      rowLabel.setAttribute('x', String(originX));

      for (let i = 0; i < count; i += 1) {
        const x = cardX(i);
        const tile = el('rect', {
          x: x + 1,
          y: ROW_TOP,
          width: tileW,
          height: CARD_H,
          rx: 2,
          fill: colors.itemDefault,
          stroke: colors.border,
          'stroke-width': 1,
        });
        const label = el('text', {
          x: x + cardW / 2,
          y: ROW_TOP + CARD_H / 2 + labelSize * 0.36,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': labelSize,
          fill: colors.textMuted,
        });
        label.textContent = String(i + 2);
        const strike = el('line', {
          x1: x + 2,
          y1: ROW_TOP + CARD_H / 2,
          x2: x + 2,
          y2: ROW_TOP + CARD_H / 2,
          stroke: colors.ghostOutline,
          'stroke-width': 1.5,
          'stroke-linecap': 'round',
        });
        gRow.appendChild(tile);
        gRow.appendChild(label);
        gRow.appendChild(strike);
        cards.push({ tile, label, strike });
      }

      // 짚는 자리를 가리키는 삼각 커서.
      const cy = ROW_TOP + CARD_H + CURSOR_GAP;
      const cx = count > 0 ? cardX(0) + cardW / 2 : W / 2;
      cursor = el('polygon', {
        points: [
          `${cx - CURSOR_HALF},${cy + CURSOR_H}`,
          `${cx},${cy}`,
          `${cx + CURSOR_HALF},${cy + CURSOR_H}`,
        ].join(' '),
        fill: colors.itemComparing,
        opacity: 0,
        transform: 'translate(0 12)',
      });
      gCursor.appendChild(cursor);

      // 자의 두 끝 — 왼쪽은 실제로 본 것, 오른쪽은 낱낱이 봤다면.
      meterLeftLabel.textContent = tr('label.sqrtSide', 'Up to the square root');
      meterRightLabel.textContent = tr('label.fullSide', 'Every candidate below n');
      meterLeftValue.textContent = '0';
      meterRightValue.textContent = String(fullChecks);
    }

    /** 후보 하나를 짚고, 지우고, 자를 그만큼 민다. 이 셋이 한 걸음이다. */
    async function check(d: number, checks: number): Promise<void> {
      const i = d - 2;
      const card = cards[i];
      if (!card || !cursor) return;

      const toX = cardX(i) + cardW / 2 - (cardX(0) + cardW / 2);
      const fromX = cursorShown ? cursorX : toX;
      const fromY = cursorShown ? 0 : 12;
      cursor.setAttribute('opacity', '1');
      const cur = cursor;
      await animate(CURSOR_MS, (t) => {
        const e = easeInOut(t);
        const x = fromX + (toX - fromX) * e;
        const y = fromY * (1 - e);
        cur.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      });
      cursorX = toX;
      cursorShown = true;

      // 짚은 칸을 잠깐 물들였다가 빗금으로 지운다.
      card.tile.setAttribute('fill', colors.itemComparing);
      card.label.setAttribute('fill', colors.stateInk);

      const x0 = cardX(i) + 2;
      const x1 = cardX(i) + cardW - 2;
      const fillFrom = ((checks - 1) / fullSpan) * (METER_X1 - METER_X0);
      const fillTo = (checks / fullSpan) * (METER_X1 - METER_X0);

      await animate(STRIKE_MS, (t) => {
        const e = easeOut(t);
        card.strike.setAttribute('x2', (x0 + (x1 - x0) * e).toFixed(2));
        meterFill.setAttribute('width', (fillFrom + (fillTo - fillFrom) * e).toFixed(2));
      });

      card.tile.setAttribute('fill', 'none');
      card.tile.setAttribute('stroke', colors.ghostOutline);
      card.tile.setAttribute('stroke-dasharray', '2 2');
      card.label.setAttribute('fill', colors.textMuted);
      card.label.setAttribute('opacity', '0.5');
      meterLeftValue.textContent = String(checks);
    }

    /** √ 의 벽이 솟는다. 줄의 오른쪽 끝이 곧 그 자리다. */
    async function wall(): Promise<void> {
      const count = cards.length;
      const x = count > 0 ? cardX(count) : W / 2;
      const midY = ROW_TOP + CARD_H / 2;
      const line = el('line', {
        x1: x,
        y1: midY,
        x2: x,
        y2: midY,
        stroke: colors.accent,
        'stroke-width': 2.5,
        'stroke-linecap': 'round',
      });
      gWall.appendChild(line);

      // `√1597` 은 수식 표기라 표식이다 — 번역하지 않는다 (C10).
      const mark = text(
        Math.min(W - 12, x + 6),
        WALL_LABEL_Y,
        `√${curN}`,
        colors.text,
        fontSizes.sm,
        x > W - 60 ? 'end' : 'start',
        fonts.mono,
      );
      mark.setAttribute('opacity', '0');
      gWall.appendChild(mark);

      if (cursor) cursor.setAttribute('opacity', '0.35');
      await animate(WALL_MS, (t) => {
        const e = easeInOut(t);
        line.setAttribute('y1', (midY - (CARD_H / 2 + WALL_PAD) * e).toFixed(2));
        line.setAttribute('y2', (midY + (CARD_H / 2 + WALL_PAD) * e).toFixed(2));
        mark.setAttribute('opacity', e.toFixed(3));
      });
    }

    /** 아낌을 수로 못박는다. 길이로 이미 보인 것에 이름을 붙이는 걸음이다. */
    async function verdict(checks: number, fullChecks: number, ratio: string): Promise<void> {
      meterLeftValue.textContent = String(checks);
      meterRightValue.textContent = String(fullChecks);
      ratioLabel.textContent = tr('label.ratio', '{ratio}x fewer checks', { ratio });
      await animate(RATIO_MS, (t) => {
        ratioLabel.setAttribute('opacity', easeOut(t).toFixed(3));
      });
    }

    function setCaption(value: string): void {
      const lines = wrapCaption(value, W - 60, CAPTION_SIZE);
      captionLines.forEach((node, i) => {
        node.textContent = lines[i] ?? '';
      });
    }

    return {
      build,
      check,
      wall,
      verdict,
      setCaption,

      clear(): void {
        resetBoard();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id); // 걸어 둔 것을 먼저 거두고
        timers.clear();
        for (const wake of [...waiters]) wake(); // 기다리던 것을 깨운다
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
