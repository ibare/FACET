/**
 * boyer-moore-stage — 어긋난 글자가 제 자리를 찾아가고, 그 폭만큼 패턴이 뛴다.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 이 완제품이 하려는 말은 "**얼마나 뛸지는 어긋난 그 글자가 정하고, 패턴이
 * 길수록 멀리 뛴다**" 다. 그래서 화면에 기관이 셋 있다.
 *
 *   글 띠      한 줄로 늘어선 글. 움직이지 않는다. 읽은 칸 아래에 점이 찍히므로
 *              **점 없는 칸이 곧 한 번도 안 본 글자**이고, 끝에 가서 그 칸들이
 *              흐려진다.
 *   패턴 슬래브 글 아래를 미끄러진다. 견줌은 **오른쪽 끝에서 왼쪽으로** 불이 켜진다.
 *   잇는 선    어긋나면 글의 그 칸에서 **패턴 안 같은 글자의 마지막 칸**으로 선이
 *              내려간다. 그 선의 가로 폭이 곧 밀 거리다 — 표를 따로 그리지 않는
 *              까닭이 여기 있다. **표는 패턴 안에 이미 들어 있다.** 없는 글자면
 *              슬래브 왼쪽 바깥의 빈 칸(-1 자리)을 가리키고, 그러면 폭이 패턴
 *              전체가 된다.
 *   자취 띠    패턴이 섰던 자리를 글의 좌표 그대로 토막 내어 늘어놓는다. 토막
 *              하나가 점프 하나라, **짧은 패턴은 잘게 · 긴 패턴은 굵게** 갈린다.
 *              손잡이를 밀면 이 띠의 결이 통째로 바뀐다.
 *
 * 세로는 마운트한 뒤 바뀌지 않는다 (S-view). 글 길이가 데이터로 정해지므로 칸
 * 크기만 캔버스에서 역산하고 상수로는 상한만 둔다.
 *
 * 색은 전부 design-tokens 경유다 (S-view). 문안은 `params.t` 로 조회하며 원본은
 * `facet.ts` 의 `messages` 에 있다 (C10).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const VIEW_W = 840;
const VIEW_H = 288;
const PAD = 18;

const CELL_MAX_W = 13;
const CELL_H = 24;

/** 읽은 자리 세 개의 가로 자리. */
const READ_X = [PAD, PAD + 168, PAD + 336];
const READ_VALUE_Y = 30;
const READ_LABEL_Y = 44;

const RULER_Y = 64;
const TEXT_Y = 72;
const DOT_Y = TEXT_Y + CELL_H + 4;
const PAT_Y = 132;
const LINK_MID = (TEXT_Y + CELL_H + PAT_Y) / 2;

const TRAIL_LABEL_Y = 182;
const TRAIL_Y = 190;
const TRAIL_H = 12;

const CAP_BASE = 228;
const CAP_LINE_H = 18;
const CAP_MAX_LINES = 3;
const CAP_MAX_UNITS = 96;

const FRAME_MS = 16;
const ANIM_PROBE = 100;
const ANIM_LINK = 300;
const ANIM_SLIDE = 380;
const ANIM_BOUNCE = 280;
const ANIM_DIM = 340;
const BOUNCE_DEPTH = 6;

/** 눈금을 세우는 간격. 글이 길어 모든 자리에 번호를 달면 읽히지 않는다. */
const RULER_STEP = 10;

/** 빈칸도 한 글자라는 것을 보이는 표식 (C10 — 도형에 각인된 글자). */
const BLANK_MARK = '·';

type Tone = 'idle' | 'read' | 'comparing' | 'matched' | 'broken' | 'unread';

type Cell = { rect: SVGRectElement; glyph: SVGTextElement };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

/** 넓은 글자(한글·가나·한자)는 두 칸으로 센다. 줄바꿈 폭 어림에만 쓴다. */
function unitsOf(s: string): number {
  let n = 0;
  for (const ch of s) n += (ch.codePointAt(0) ?? 0) > 0x2e7f ? 2 : 1;
  return n;
}

function wrapText(content: string, budget: number): string[] {
  const lines: string[] = [];
  let line = '';
  const push = (): void => {
    if (line) lines.push(line);
    line = '';
  };
  for (const word of content.split(' ')) {
    // 띄어쓰기가 없는 언어는 한 낱말이 통째로 길다 — 칸 수로 끊는다.
    if (unitsOf(word) > budget) {
      push();
      let piece = '';
      for (const ch of word) {
        if (unitsOf(piece + ch) > budget) {
          lines.push(piece);
          piece = ch;
        } else piece += ch;
      }
      line = piece;
      continue;
    }
    const next = line ? `${line} ${word}` : word;
    if (line && unitsOf(next) > budget) {
      push();
      line = word;
    } else line = next;
  }
  push();
  return lines;
}

/**
 * `initialData` 를 좁히는 자리는 여기다 — projector 가 다시 좁혀 밀어 넣지
 * 않는다 (C9).
 */
function readScene(initial: Record<string, unknown> | undefined): {
  text: string;
  pattern: string;
} {
  const raw = initial ?? {};
  const text = typeof raw.text === 'string' ? raw.text : '';
  const patterns = Array.isArray(raw.patterns)
    ? (raw.patterns as unknown[]).filter((p): p is string => typeof p === 'string')
    : [];
  const want = typeof raw.patternLength === 'number' ? raw.patternLength : 0;
  const pattern = patterns.find((p) => p.length === want) ?? patterns[0] ?? '';
  return { text, pattern };
}

export const boyerMooreStageView: CanvasView = {
  canvas: { width: VIEW_W, height: VIEW_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    const colors: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었다 (S-view).
    const root = el('g');
    canvas.appendChild(root);

    const paint: Record<Tone, { fill: string; stroke: string; ink: string; dash: string }> = {
      idle: { fill: colors.itemDefault, stroke: colors.border, ink: colors.text, dash: 'none' },
      read: { fill: colors.bgSubtle, stroke: colors.border, ink: colors.text, dash: 'none' },
      comparing: {
        fill: colors.itemComparing,
        stroke: colors.itemComparing,
        ink: colors.stateInk,
        dash: 'none',
      },
      matched: {
        fill: colors.itemPivot,
        stroke: colors.itemPivot,
        ink: colors.stateInk,
        dash: 'none',
      },
      broken: {
        fill: colors.itemSwapping,
        stroke: colors.itemSwapping,
        ink: colors.stateInk,
        dash: 'none',
      },
      unread: {
        fill: colors.bg,
        stroke: colors.ghostOutline,
        ink: colors.textMuted,
        dash: '2 3',
      },
    };

    // ── 층
    const readLayer = el('g');
    const rulerLayer = el('g');
    const textLayer = el('g');
    const dotLayer = el('g');
    const linkLayer = el('g', { opacity: 0 });
    const slab = el('g', { transform: 'translate(0, 0)' });
    const trailLayer = el('g');
    const capLayer = el('g');
    root.append(readLayer, rulerLayer, textLayer, dotLayer, linkLayer, slab, trailLayer, capLayer);

    // ── 읽은 자리 셋 — 평균 점프 · 패턴 길이 · 안 본 글자
    //
    // 조회를 이 헬퍼 안으로 넣지 않는다. `tr(key, 'en 원본')` 의 두 인자가 변수가
    // 되면 추출기도 전수 대조 검사도 그 문안을 못 본다 (C10). 헬퍼는 이미 해석된
    // 글자만 받고, 키와 en 원본은 호출부에 리터럴로 남는다.
    function makeReadout(i: number, label: string): SVGTextElement {
      const value = el('text', {
        x: READ_X[i],
        y: READ_VALUE_Y,
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        fill: colors.text,
      });
      value.textContent = '0';
      const caption = el('text', {
        x: READ_X[i],
        y: READ_LABEL_Y,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      caption.textContent = label;
      readLayer.append(value, caption);
      return value;
    }
    const avgValue = makeReadout(0, tr('label.avgJump', 'average jump'));
    const lenValue = makeReadout(1, tr('label.length', 'pattern length'));
    const unreadValue = makeReadout(2, tr('label.unread', 'never read'));

    const trailLabel = el('text', {
      x: PAD,
      y: TRAIL_LABEL_Y,
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
    });
    trailLabel.textContent = tr('label.trail', 'where the pattern stood');
    trailLayer.appendChild(trailLabel);

    // ── 잇는 선 — 어긋난 글자에서 패턴 안 그 글자의 마지막 칸으로.
    const linkPath = el('path', {
      d: '',
      fill: 'none',
      stroke: colors.itemActive,
      'stroke-width': 2,
      'stroke-linecap': 'round',
    });
    const linkHead = el('circle', { cx: 0, cy: 0, r: 3.5, fill: colors.itemActive });
    const linkLabel = el('text', {
      x: 0,
      y: LINK_MID - 5,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.itemActive,
    });
    const absentBox = el('rect', {
      x: 0,
      y: PAT_Y,
      width: 0,
      height: CELL_H,
      rx: 3,
      fill: 'none',
      stroke: colors.ghostOutline,
      'stroke-width': 1,
      'stroke-dasharray': '2 3',
      visibility: 'hidden',
    });
    const absentLabel = el('text', {
      x: 0,
      y: LINK_MID + 13,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.xs,
      fill: colors.textMuted,
      visibility: 'hidden',
    });
    linkLayer.append(linkPath, linkHead, linkLabel, absentBox, absentLabel);

    // ── 걸어 둔 것과 기다리는 것
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed || ms <= 0) {
          apply(1);
          return resolve();
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (destroyed) return;
          const raw = Math.min(1, (Date.now() - start) / ms);
          apply(ease(raw));
          if (raw >= 1) {
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

    // ── 갈아 끼워지는 것들
    let text = '';
    let pattern = '';
    let cellW = CELL_MAX_W;
    let originX = PAD;
    let textCells: Cell[] = [];
    let patCells: Cell[] = [];
    let dots: SVGRectElement[] = [];
    let seen: boolean[] = [];
    let slabAt = 0;
    let trailBars: SVGRectElement[] = [];

    const cellX = (i: number): number => originX + i * cellW;
    const cellMid = (i: number): number => cellX(i) + (cellW - 1.5) / 2;
    const glyphOf = (ch: string): string => (ch === ' ' ? BLANK_MARK : ch);

    function setTone(cell: Cell | undefined, tone: Tone): void {
      if (!cell) return;
      const c = paint[tone];
      cell.rect.setAttribute('fill', c.fill);
      cell.rect.setAttribute('stroke', c.stroke);
      cell.rect.setAttribute('stroke-dasharray', c.dash);
      cell.glyph.setAttribute('fill', c.ink);
    }

    function makeCell(parent: SVGGElement, x: number, y: number, ch: string): Cell {
      const rect = el('rect', {
        x,
        y,
        width: Math.max(2, cellW - 1.5),
        height: CELL_H,
        rx: 3,
        fill: paint.idle.fill,
        stroke: paint.idle.stroke,
        'stroke-width': 1,
      });
      const glyph = el('text', {
        x: x + (cellW - 1.5) / 2,
        y: y + CELL_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: paint.idle.ink,
      });
      glyph.textContent = glyphOf(ch);
      parent.append(rect, glyph);
      return { rect, glyph };
    }

    /** 글과 패턴을 처음부터 다시 세운다. */
    function initRun(nextText: string, nextPattern: string): void {
      text = nextText;
      pattern = nextPattern;
      const n = Math.max(1, text.length);

      rulerLayer.textContent = '';
      textLayer.textContent = '';
      dotLayer.textContent = '';
      slab.textContent = '';
      for (const bar of trailBars) bar.remove();
      trailBars = [];

      cellW = Math.min(CELL_MAX_W, Math.floor((VIEW_W - PAD * 2) / n));
      originX = Math.round((VIEW_W - n * cellW) / 2);

      // 눈금 — 열 칸마다 자리 번호.
      for (let i = 0; i < text.length; i += RULER_STEP) {
        const mark = el('text', {
          x: cellMid(i),
          y: RULER_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        mark.textContent = String(i);
        rulerLayer.appendChild(mark);
      }

      textCells = [];
      dots = [];
      seen = [];
      for (let i = 0; i < text.length; i += 1) {
        textCells.push(makeCell(textLayer, cellX(i), TEXT_Y, text[i]));
        const dot = el('rect', {
          x: cellMid(i) - 1.5,
          y: DOT_Y,
          width: 3,
          height: 3,
          rx: 1.5,
          fill: colors.auxCursor,
          opacity: 0,
        });
        dotLayer.appendChild(dot);
        dots.push(dot);
        seen.push(false);
      }

      patCells = [];
      for (let k = 0; k < pattern.length; k += 1) {
        patCells.push(makeCell(slab, cellX(k), PAT_Y, pattern[k]));
      }
      slabAt = 0;
      slab.setAttribute('transform', 'translate(0, 0)');

      absentBox.setAttribute('width', String(Math.max(2, cellW - 1.5)));
      linkLayer.setAttribute('opacity', '0');
      lenValue.textContent = String(pattern.length);
      avgValue.textContent = '0';
      unreadValue.textContent = String(text.length);
    }

    /** `unread` 가 음수면 "그 값은 아직 모른다" 는 뜻이라 그 칸만 그대로 둔다. */
    function setReadout(jumpCount: number, jumpSum: number, unread: number): void {
      avgValue.textContent = jumpCount === 0 ? '0' : (jumpSum / jumpCount).toFixed(2);
      if (unread >= 0) unreadValue.textContent = String(unread);
    }

    /** 한 자리를 떠나며 — 칠한 것만 되돌리고, 읽은 점은 남긴다. */
    function clearTones(): void {
      for (const cell of textCells) setTone(cell, 'idle');
      for (const cell of patCells) setTone(cell, 'idle');
      linkLayer.setAttribute('opacity', '0');
      absentBox.setAttribute('visibility', 'hidden');
      absentLabel.setAttribute('visibility', 'hidden');
    }

    /** 읽은 칸은 점이 남아 "이 글자는 봤다" 를 말한다. */
    function markRead(i: number): void {
      if (i < 0 || i >= dots.length || seen[i]) return;
      seen[i] = true;
      dots[i].setAttribute('opacity', '1');
    }

    function land(at: number): void {
      clearTones();
      slabAt = at;
      slab.setAttribute('transform', `translate(${cellX(at) - cellX(0)}, 0)`);
    }

    async function probe(at: number, j: number, textIndex: number, matched: boolean): Promise<void> {
      markRead(textIndex);
      const patCell = patCells[j];
      const textCell = textCells[textIndex];
      setTone(patCell, 'comparing');
      setTone(textCell, 'comparing');
      await tween(ANIM_PROBE, () => undefined);
      if (destroyed) return;
      setTone(patCell, matched ? 'matched' : 'broken');
      setTone(textCell, matched ? 'matched' : 'broken');
      // 자리 번호는 쓰지 않지만 슬래브가 그 자리에 있다는 전제는 지켜 둔다.
      if (slabAt !== at) land(at);
    }

    /** 어긋난 글자에서 패턴 안 그 글자의 마지막 칸으로 선을 내린다. */
    async function mismatch(
      at: number,
      textIndex: number,
      lastIndex: number,
      shift: number,
    ): Promise<void> {
      const target = at + lastIndex; // lastIndex 가 -1 이면 슬래브 왼쪽 바깥 칸
      const x1 = cellMid(textIndex);
      const x2 = cellMid(target);
      const y1 = TEXT_Y + CELL_H;

      linkLabel.textContent = String(shift);
      linkLabel.setAttribute('x', String((x1 + x2) / 2));
      linkHead.setAttribute('cx', String(x2));
      linkHead.setAttribute('cy', String(PAT_Y));
      if (lastIndex < 0) {
        absentBox.setAttribute('x', String(cellX(target)));
        absentBox.setAttribute('visibility', 'visible');
        absentLabel.setAttribute('x', String((x1 + x2) / 2));
        absentLabel.textContent = tr('label.absent', 'not in the pattern');
        absentLabel.setAttribute('visibility', 'visible');
      }
      linkLayer.setAttribute('opacity', '1');
      await tween(ANIM_LINK, (p) => {
        const x = x1 + (x2 - x1) * p;
        linkPath.setAttribute('d', `M ${x1} ${y1} L ${x1} ${LINK_MID} L ${x} ${LINK_MID}`);
        linkHead.setAttribute('cx', String(x));
        linkHead.setAttribute('cy', String(LINK_MID));
      });
      if (destroyed) return;
      linkPath.setAttribute(
        'd',
        `M ${x1} ${y1} L ${x1} ${LINK_MID} L ${x2} ${LINK_MID} L ${x2} ${PAT_Y}`,
      );
      linkHead.setAttribute('cy', String(PAT_Y));
    }

    /** 민 만큼 슬래브가 옮겨 가고, 그 폭이 자취 띠에 토막으로 남는다. */
    async function slide(from: number, to: number): Promise<void> {
      const bar = el('rect', {
        x: cellX(from) + 1,
        y: TRAIL_Y,
        width: Math.max(1, cellX(to) - cellX(from) - 2),
        height: TRAIL_H,
        rx: 2,
        fill: colors.itemActive,
        stroke: colors.itemActive,
        'stroke-width': 1,
      });
      // 앞선 토막은 기록으로 물러나고 방금 것만 불이 켜져 있다.
      for (const old of trailBars) {
        old.setAttribute('fill', colors.itemDefault);
        old.setAttribute('stroke', colors.textMuted);
      }
      trailLayer.appendChild(bar);
      trailBars.push(bar);

      const fromX = cellX(from) - cellX(0);
      const toX = cellX(to) - cellX(0);
      await tween(ANIM_SLIDE, (p) => {
        slab.setAttribute('transform', `translate(${fromX + (toX - fromX) * p}, 0)`);
      });
      if (destroyed) return;
      slabAt = to;
      linkLayer.setAttribute('opacity', '0');
      absentBox.setAttribute('visibility', 'hidden');
      absentLabel.setAttribute('visibility', 'hidden');
    }

    async function found(at: number): Promise<void> {
      linkLayer.setAttribute('opacity', '0');
      for (let k = 0; k < patCells.length; k += 1) {
        setTone(patCells[k], 'matched');
        setTone(textCells[at + k], 'matched');
      }
      const dx = cellX(at) - cellX(0);
      await tween(ANIM_BOUNCE, (p) => {
        slab.setAttribute('transform', `translate(${dx}, ${Math.sin(p * Math.PI) * -BOUNCE_DEPTH})`);
      });
      if (destroyed) return;
      slab.setAttribute('transform', `translate(${dx}, 0)`);
    }

    /** 한 번도 읽지 않은 글자가 줄에서 흐려진다 — 이 그림의 마지막 운동이다. */
    async function dimUnread(): Promise<void> {
      const idle: number[] = [];
      for (let i = 0; i < textCells.length; i += 1) {
        if (seen[i]) continue;
        setTone(textCells[i], 'unread');
        idle.push(i);
      }
      await tween(ANIM_DIM, (p) => {
        for (const i of idle) textCells[i].rect.setAttribute('opacity', String(1 - 0.55 * p));
        for (const i of idle) textCells[i].glyph.setAttribute('opacity', String(1 - 0.55 * p));
      });
    }

    // ── 캡션
    const caption: SVGTextElement[] = [];
    for (let i = 0; i < CAP_MAX_LINES; i += 1) {
      const line = el('text', {
        x: VIEW_W / 2,
        y: CAP_BASE + i * CAP_LINE_H,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      capLayer.appendChild(line);
      caption.push(line);
    }

    function setCaption(value: string): void {
      const lines = wrapText(value, CAP_MAX_UNITS).slice(0, CAP_MAX_LINES);
      for (let i = 0; i < CAP_MAX_LINES; i += 1) caption[i].textContent = lines[i] ?? '';
    }

    function reset(): void {
      const scene = readScene(params.initialData);
      initRun(scene.text, scene.pattern);
      setCaption('');
    }

    // 마운트 즉시 한 판을 그려 둔다. 러너가 곧 run-init 으로 다시 부르지만,
    // 그 전에도 빈 캔버스가 보이는 일이 없어야 한다.
    reset();

    return {
      initRun,
      setReadout,
      land,
      probe,
      mismatch,
      slide,
      found,
      dimUnread,
      setCaption,
      reset,

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거둔 뒤 기다리던 것을 깨운다 — 안 깨우면 emit 이 영영
        // 돌아오지 않아 알고리즘과 SVG 가 통째로 붙들린다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        if (root.parentNode) root.parentNode.removeChild(root);
      },
    };
  },
};
