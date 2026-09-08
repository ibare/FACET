/**
 * out-of-bounds stage — 주소가 나란히 놓인 메모리 띠 한 줄과, 그 위를 미끄러지는
 * 커서 하나.
 *
 * 이 조각의 동사는 "넘어간다" 이므로 화면의 주된 운동은 **가로 이동**이다.
 * 칸들은 주소 순서대로 틈 없이 붙어 있고 — 배열의 끝과 이웃 변수 사이에 아무
 * 것도 없다는 것이 요점이다 — 커서는 주소 셈이 낸 자리로 실제로 이동한다.
 * 배열의 끝을 지나 이웃 칸에 올라서는 것, 그리고 경계 검사가 세운 벽에 부딪혀
 * 그 앞에서 멎는 것이 이 그림이 보여 주는 두 사건이다.
 *
 * 빌트인 view 어휘 (bars / array-cells / linked-list …) 로는 "주소가 연속이라
 * 배열 밖으로 한 칸 더 갈 수 있다" 를 말할 수 없어 stage 를 둔다 — 빌트인
 * 배열 view 는 인덱스를 그리지 주소를 그리지 않고, 배열 밖 자리를 갖지 않는다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type Palette,
  type View,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

// ── 기하. 세로는 내용이 정하고, 가로는 PIECE_CANVAS_W 를 따른다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 312;

// 칸 폭은 캔버스에서 역산한다. 고정해 두면 남는 폭이 좌우 여백으로 버려져
// 그림이 캔버스 가운데 쪼그라든다 — 70 으로 못박았을 때 620 중 420(68%)만 썼다.
const CELL_MAX_W = 96;
const SIDE_MIN = 26;
const CELL_H = 52;
const CELL_TOP = 112;
const CELL_BOTTOM = CELL_TOP + CELL_H;

const EXPR_Y = 34;
const GUARD_LABEL_Y = 44;
const PILL_TOP = 54;
const PILL_H = 24;
const STEM_BOTTOM = 96;
const TIP_Y = 104;
const ADDR_Y = 106;
const VALUE_Y = 145;
const INDEX_Y = 182;
const BRACKET_Y = 194;
const RANGE_Y = 210;
const CAPTION_Y = 240;
const CAPTION_LINE_H = 18;
const NOTE_Y1 = 284;
const NOTE_Y2 = 299;

const GUARD_W = 10;
const GUARD_TOP = 50;
const GUARD_BOTTOM = 170;
const GUARD_RISE = 130;

const MOVE_MS = 380;
const HOME_MS = 300;
const GUARD_MS = 420;
const BUMP_MS = 340;
const RECOIL_MS = 150;

const MONO_CHAR_W = 7.2;
const BODY_CHAR_W = 7.1;
const CAPTION_MAX_W = 540;
const PILL_MIN_W = 56;

const NS = 'http://www.w3.org/2000/svg';

type CellState = 'rest' | 'active' | 'breached' | 'scarred';

export type OutOfBoundsStageInit = {
  arrayName: string;
  values: number[];
  baseAddress: number;
  stride: number;
  neighborName: string;
  neighborValue: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function toHex(address: number): string {
  return `0x${address.toString(16).toUpperCase()}`;
}

/**
 * 글자 폭 근사. SVG 는 줄바꿈이 없어 직접 재야 하는데, 한글·한자 계열은 라틴
 * 글자보다 두 배 가까이 넓으므로 코드 포인트 범위로 갈라 센다.
 */
function measure(text: string, charWidth: number): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += code >= 0x1100 && code <= 0xffdc ? charWidth * 1.9 : charWidth;
  }
  return width;
}

/** 문장을 최대 두 줄로 나눈다. 낱말 단위로 끊고, 넘치면 나머지를 둘째 줄에 몰아 준다. */
function wrapTwoLines(text: string, maxWidth: number, charWidth: number): string[] {
  if (measure(text, charWidth) <= maxWidth) return [text];
  const words = text.split(' ');
  let head = '';
  let cut = words.length;
  for (let i = 0; i < words.length; i += 1) {
    const next = head === '' ? words[i] : `${head} ${words[i]}`;
    if (measure(next, charWidth) > maxWidth) {
      cut = i;
      break;
    }
    head = next;
  }
  if (head === '' || cut >= words.length) return [text];
  return [head, words.slice(cut).join(' ')];
}

export const outOfBoundsStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const tr = params.t ?? makeTranslator(params.locale);
    const colors: Palette = getColors(params.theme ?? 'light');

    // width 는 CSS 가 아니라 **속성**으로 준다. facet-block 은 flex column 이라
    // 부모 폭이 내용으로 정해지는데, 그때 CSS width:100% 는 순환이 되어
    // 브라우저가 SVG 의 기본 intrinsic 폭(300px)으로 떨어뜨린다 — viewBox 620 이
    // 300 에 눌려 그림이 절반으로 쪼그라든다.
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img' });
    svg.style.height = 'auto';
    svg.style.maxWidth = `${W}px`;
    svg.style.margin = '0 auto';
    svg.style.display = 'block';
    svg.style.overflow = 'visible';
    container.appendChild(svg);

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const wait = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });

    // ── 가변 상태.
    let init: OutOfBoundsStageInit | null = null;
    let originX = 0;
    let cellW = CELL_MAX_W;
    let edgeX = 0;
    let cellCount = 0;
    let arrayLen = 0;
    let cellStates: CellState[] = [];

    let cellRects: SVGRectElement[] = [];
    let cellValues: SVGTextElement[] = [];
    let cellLabels: SVGTextElement[] = [];

    let probeGroup: SVGGElement | null = null;
    let probePill: SVGRectElement | null = null;
    let probeText: SVGTextElement | null = null;
    let probeStem: SVGLineElement | null = null;
    let probeTip: SVGPolygonElement | null = null;

    let guardGroup: SVGGElement | null = null;
    let exprHead: SVGTSpanElement | null = null;
    let exprTail: SVGTSpanElement | null = null;
    let captionText: SVGTextElement | null = null;

    const cellCenter = (index: number): number => originX + index * cellW + cellW / 2;

    const pillWidth = (label: string): number =>
      Math.max(PILL_MIN_W, Math.round(label.length * MONO_CHAR_W + 18));

    function paintCell(index: number): void {
      const rect = cellRects[index];
      const value = cellValues[index];
      const label = cellLabels[index];
      if (!rect || !value || !label) return;
      const state = cellStates[index] ?? 'rest';
      const insideArray = index < arrayLen;

      if (state === 'active') {
        rect.setAttribute('fill', colors.itemActive);
        rect.setAttribute('stroke', colors.itemActive);
        rect.setAttribute('stroke-width', '2');
        value.setAttribute('fill', colors.textInverse);
        label.setAttribute('fill', colors.text);
        return;
      }
      if (state === 'breached') {
        rect.setAttribute('fill', colors.danger);
        rect.setAttribute('stroke', colors.danger);
        rect.setAttribute('stroke-width', '2');
        value.setAttribute('fill', colors.textInverse);
        label.setAttribute('fill', colors.danger);
        return;
      }
      if (state === 'scarred') {
        rect.setAttribute('fill', colors.bg);
        rect.setAttribute('stroke', colors.danger);
        rect.setAttribute('stroke-width', '2');
        value.setAttribute('fill', colors.danger);
        label.setAttribute('fill', colors.danger);
        return;
      }
      rect.setAttribute('fill', insideArray ? colors.bgSubtle : colors.bg);
      rect.setAttribute('stroke', colors.border);
      rect.setAttribute('stroke-width', '1');
      value.setAttribute('fill', colors.text);
      label.setAttribute('fill', colors.textMuted);
    }

    function setCellState(index: number, state: CellState): void {
      if (index < 0 || index >= cellCount) return;
      cellStates[index] = state;
      paintCell(index);
    }

    /** 읽고 있던 칸을 놓아 준다. 경계를 넘어 읽힌 칸은 흉터를 남긴다. */
    function releaseCells(): void {
      for (let i = 0; i < cellCount; i += 1) {
        const state = cellStates[i] ?? 'rest';
        if (state === 'active') setCellState(i, 'rest');
        else if (state === 'breached') setCellState(i, 'scarred');
      }
    }

    function setProbeLabel(label: string, danger: boolean): void {
      if (!probePill || !probeText || !probeStem || !probeTip) return;
      const w = pillWidth(label);
      probePill.setAttribute('x', String(-w / 2));
      probePill.setAttribute('width', String(w));
      probePill.setAttribute('fill', danger ? colors.danger : colors.accent);
      probeText.textContent = label;
      probeText.setAttribute('fill', danger ? colors.textInverse : colors.text);
      probeStem.setAttribute('stroke', danger ? colors.danger : colors.accent);
      probeTip.setAttribute('fill', danger ? colors.danger : colors.accent);
    }

    function probeLabelWidth(): number {
      const raw = probePill?.getAttribute('width');
      const parsed = raw === null || raw === undefined ? NaN : Number(raw);
      return Number.isNaN(parsed) ? PILL_MIN_W : parsed;
    }

    function placeProbe(x: number, ms: number): void {
      if (!probeGroup) return;
      probeGroup.style.transition = ms <= 0 ? 'none' : `transform ${ms}ms cubic-bezier(0.32, 0.72, 0.24, 1)`;
      probeGroup.style.transform = `translate(${x}px, 0px)`;
    }

    function setExpr(indexLabel: string, addressHex: string | null, outside: boolean): void {
      if (!exprHead || !exprTail || !init) return;
      exprHead.textContent = `${toHex(init.baseAddress)} + ${indexLabel} × ${init.stride}`;
      exprTail.textContent = addressHex === null ? '' : ` = ${addressHex}`;
      exprTail.setAttribute('fill', outside ? colors.danger : colors.text);
    }

    function clear(): void {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      cellRects = [];
      cellValues = [];
      cellLabels = [];
      probeGroup = null;
      probePill = null;
      probeText = null;
      probeStem = null;
      probeTip = null;
      guardGroup = null;
      exprHead = null;
      exprTail = null;
      captionText = null;
    }

    function build(d: OutOfBoundsStageInit): void {
      clear();
      init = d;
      arrayLen = d.values.length;
      cellCount = arrayLen + 1;
      cellStates = new Array<CellState>(cellCount).fill('rest');
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / cellCount));
      originX = Math.round((W - cellCount * cellW) / 2);
      edgeX = originX + arrayLen * cellW;

      // 주소 셈 한 줄. 인덱스가 정해지기 전에는 i 로 서 있다.
      const expr = el('text', {
        x: W / 2,
        y: EXPR_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.textMuted,
      });
      exprHead = el('tspan', { fill: colors.textMuted });
      exprTail = el('tspan', { fill: colors.text, 'font-weight': '600' });
      expr.appendChild(exprHead);
      expr.appendChild(exprTail);
      svg.appendChild(expr);
      setExpr('i', null, false);

      // 메모리 띠. 칸 사이에 틈이 없다 — 배열의 끝과 이웃은 맞붙어 있다.
      for (let i = 0; i < cellCount; i += 1) {
        const x = originX + i * cellW;
        const inside = i < arrayLen;

        const addr = el('text', {
          x: x + cellW / 2,
          y: ADDR_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        addr.textContent = toHex(d.baseAddress + i * d.stride);
        svg.appendChild(addr);

        const rect = el('rect', {
          x,
          y: CELL_TOP,
          width: cellW,
          height: CELL_H,
          fill: inside ? colors.bgSubtle : colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        });
        svg.appendChild(rect);
        cellRects.push(rect);

        const value = el('text', {
          x: x + cellW / 2,
          y: VALUE_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          fill: colors.text,
        });
        value.textContent = String(inside ? (d.values[i] ?? 0) : d.neighborValue);
        svg.appendChild(value);
        cellValues.push(value);

        const label = el('text', {
          x: x + cellW / 2,
          y: INDEX_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        label.textContent = inside ? `${d.arrayName}[${i}]` : d.neighborName;
        svg.appendChild(label);
        cellLabels.push(label);
      }

      // 배열이 차지한 구간을 아래에서 받치는 괄호와 그 범위.
      const bracket = el('path', {
        d: `M ${originX} ${BRACKET_Y - 7} L ${originX} ${BRACKET_Y} L ${edgeX} ${BRACKET_Y} L ${edgeX} ${BRACKET_Y - 7}`,
        fill: 'none',
        stroke: colors.textMuted,
        'stroke-width': 1,
      });
      svg.appendChild(bracket);

      const range = el('text', {
        x: (originX + edgeX) / 2,
        y: RANGE_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      range.textContent = tr('label.arrayRange', '{from} – {to} · {bytes} bytes', {
        from: toHex(d.baseAddress),
        to: toHex(d.baseAddress + arrayLen * d.stride - 1),
        bytes: arrayLen * d.stride,
      });
      svg.appendChild(range);

      // 배열의 끝. 셈이 넘어가는 것은 바로 이 선이다.
      const edge = el('line', {
        x1: edgeX,
        y1: CELL_TOP - 14,
        x2: edgeX,
        y2: CELL_BOTTOM + 8,
        stroke: colors.text,
        'stroke-width': 3,
      });
      svg.appendChild(edge);

      // 경계 검사 — 처음에는 없다. 넘어간 뒤에 내려선다.
      guardGroup = el('g');
      guardGroup.style.display = 'none';
      const guardBar = el('rect', {
        x: edgeX - GUARD_W / 2,
        y: GUARD_TOP,
        width: GUARD_W,
        height: GUARD_BOTTOM - GUARD_TOP,
        rx: 3,
        fill: colors.success,
      });
      guardGroup.appendChild(guardBar);
      const guardLabel = el('text', {
        x: edgeX,
        y: GUARD_LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.success,
      });
      guardLabel.textContent = `0 ≤ i < ${arrayLen}`;
      guardGroup.appendChild(guardLabel);
      svg.appendChild(guardGroup);

      // 커서. 주소 셈이 낸 자리를 가리키며 띠 위를 이동한다.
      probeGroup = el('g');
      probeStem = el('line', {
        x1: 0,
        y1: PILL_TOP + PILL_H,
        x2: 0,
        y2: STEM_BOTTOM,
        stroke: colors.accent,
        'stroke-width': 2,
      });
      probePill = el('rect', {
        x: -PILL_MIN_W / 2,
        y: PILL_TOP,
        width: PILL_MIN_W,
        height: PILL_H,
        rx: 5,
        fill: colors.accent,
      });
      probeText = el('text', {
        x: 0,
        y: PILL_TOP + 16.5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      probeTip = el('polygon', {
        points: `-6,${STEM_BOTTOM} 6,${STEM_BOTTOM} 0,${TIP_Y}`,
        fill: colors.accent,
      });
      probeGroup.appendChild(probeStem);
      probeGroup.appendChild(probeTip);
      probeGroup.appendChild(probePill);
      probeGroup.appendChild(probeText);
      svg.appendChild(probeGroup);

      setProbeLabel(`${d.arrayName}[i]`, false);
      placeProbe(cellCenter(0), 0);

      captionText = el('text', {
        x: W / 2,
        y: CAPTION_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      svg.appendChild(captionText);

      // 전제를 밝히는 각주. 이 배치는 그림의 가정이며, 그 사실 자체가 개념의
      // 절반이다 — 무엇이 뒤에 놓이는지 알 수 없으니 결과도 정해지지 않는다.
      const note1 = el('text', {
        x: W / 2,
        y: NOTE_Y1,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      note1.textContent = tr(
        'label.note1',
        'The addresses and this layout are an assumption of the drawing.',
      );
      svg.appendChild(note1);

      const note2 = el('text', {
        x: W / 2,
        y: NOTE_Y2,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      note2.textContent = tr(
        'label.note2',
        'What sits right after an array is up to the compiler, so the result of the read is not defined.',
      );
      svg.appendChild(note2);
    }

    if (params.initialData) {
      const d = params.initialData as unknown as Partial<OutOfBoundsStageInit>;
      if (Array.isArray(d.values) && typeof d.baseAddress === 'number' && typeof d.stride === 'number') {
        build({
          arrayName: typeof d.arrayName === 'string' ? d.arrayName : 'arr',
          values: d.values,
          baseAddress: d.baseAddress,
          stride: d.stride,
          neighborName: typeof d.neighborName === 'string' ? d.neighborName : 'next',
          neighborValue: typeof d.neighborValue === 'number' ? d.neighborValue : 0,
        });
      }
    }

    return {
      init(d: OutOfBoundsStageInit): void {
        build(d);
      },

      /** 주소 셈이 결과를 냈다. 수식 줄이 채워진다. */
      showAddress(p: { index: number; addressHex: string }): void {
        if (!init) return;
        setExpr(String(p.index), p.addressHex, p.index >= arrayLen);
      },

      /** 커서가 그 주소의 칸으로 미끄러진다. 배열의 끝을 넘으면 색이 갈린다. */
      async moveProbe(p: { index: number; crossed: boolean }): Promise<void> {
        if (!init) return;
        releaseCells();
        setProbeLabel(`${init.arrayName}[${p.index}]`, p.crossed);
        placeProbe(cellCenter(p.index), MOVE_MS);
        await wait(MOVE_MS);
      },

      /** 커서가 선 자리의 값을 읽는다. */
      readSlot(p: { index: number; value: number; outOfBounds: boolean }): void {
        if (!init) return;
        setProbeLabel(`${init.arrayName}[${p.index}] → ${p.value}`, p.outOfBounds);
        setCellState(p.index, p.outOfBounds ? 'breached' : 'active');
      },

      /** 커서를 기준 주소로 물린 뒤, 경계 검사가 배열의 끝에 내려선다. */
      async dropGuard(p: { homeIndex: number }): Promise<void> {
        if (!init || !guardGroup) return;
        releaseCells();
        setProbeLabel(`${init.arrayName}[i]`, false);
        placeProbe(cellCenter(p.homeIndex), HOME_MS);
        await wait(HOME_MS);

        guardGroup.style.display = '';
        guardGroup.style.transition = 'none';
        guardGroup.style.transform = `translate(0px, ${-GUARD_RISE}px)`;
        await wait(20);
        guardGroup.style.transition = `transform ${GUARD_MS}ms cubic-bezier(0.22, 1.1, 0.36, 1)`;
        guardGroup.style.transform = 'translate(0px, 0px)';
        await wait(GUARD_MS);
      },

      /** 커서가 다시 나아가지만 경계 검사에 부딪혀 그 앞에서 멎는다. */
      async blockProbe(p: { index: number }): Promise<void> {
        if (!init) return;
        setProbeLabel(`${init.arrayName}[${p.index}]`, false);
        const stopX = edgeX - GUARD_W / 2 - probeLabelWidth() / 2 - 4;
        placeProbe(stopX, BUMP_MS);
        await wait(BUMP_MS);
        placeProbe(stopX - 12, RECOIL_MS);
        await wait(RECOIL_MS);
      },

      /** 한 걸음의 말. 문안은 projector 가 messages 에서 가져와 넘긴다. */
      setCaption(text: string): void {
        if (!captionText) return;
        while (captionText.firstChild) captionText.removeChild(captionText.firstChild);
        const lines = wrapTwoLines(text, CAPTION_MAX_W, BODY_CHAR_W);
        lines.forEach((line, i) => {
          const span = el('tspan', { x: W / 2, dy: i === 0 ? 0 : CAPTION_LINE_H });
          span.textContent = line;
          captionText?.appendChild(span);
        });
      },

      /** 할 말을 마쳤다. 완료 상태 자체가 정보이므로 화면은 그대로 둔다. */
      markDone(): void {
        svg.setAttribute('data-done', 'true');
      },

      /** 처음 상태로. 커서는 기준 주소에, 경계 검사는 다시 없는 것으로. */
      resetStage(): void {
        if (init) build(init);
        svg.removeAttribute('data-done');
      },

      destroy(): void {
        for (const id of timers) clearTimeout(id);
        timers.clear();
        clear();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },
    };
  },
};
