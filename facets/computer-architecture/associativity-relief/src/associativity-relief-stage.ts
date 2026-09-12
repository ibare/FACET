/**
 * 연관도 조각의 그림.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 동사가 "나란히 앉는다" 이고, 논증은 "칸 수는 그대로인데 묶는 법만 바꿨다" 다.
 * 그래서 **칸을 담는 레일은 처음부터 끝까지 폭도 자리도 바뀌지 않는다.** 바뀌는
 * 것은 레일 안을 가르는 칸막이뿐이다 — 1-way 는 칸막이 셋(자리 넷), 2-way 는
 * 칸막이 하나(자리 둘)다. 가운데 칸막이는 두 짜임에서 좌표가 같아 제자리에
 * 그대로 서 있고, 바깥 칸막이 둘만 사라진다. 늘린 것이 없다는 말을 글이 아니라
 * 기하가 하게 하려는 것이다.
 *
 * 네 칸은 크기가 변하지 않고, 첫 칸의 왼쪽 끝과 끝 칸의 오른쪽 끝도 고정이다.
 * 짜임이 바뀔 때 칸 사이의 틈만 재분배된다 (둘씩 붙고, 두 자리 사이가 벌어진다).
 * 그래서 그림의 전체 폭이 숨 쉬지 않는다.
 *
 * 주소는 위의 접근 띠에서 **아래로 날아 내려와** 칸에 앉는다. 자리가 차 있으면
 * 앉아 있던 것이 아래로 빠지면서 새것이 내려온다 — 서로 반대 방향의 두 움직임이
 * "쫓아낸다" 를 말한다. 2-way 에서는 빠지는 것 없이 옆 칸에 내려앉는다.
 *
 * 잰 값은 재는 자리에 남긴다 (S-piece). 히트/미스 도장은 그 접근을 가리키는
 * 띠의 칸 아래에 찍히고 지워지지 않으므로, 두 판이 끝나면 `M M M M M M` 과
 * `M M H H H H` 가 같은 세로줄에 맞춰 남는다. 여섯과 둘을 견주는 계기가 따로
 * 없는 이유다.
 *
 * 화면의 글자 중 문안은 캡션 한 줄뿐이고 projector 가 풀어서 넘긴다. 나머지
 * (`set 0` · `1-way` · `M` · `H` · 주소 숫자) 는 도식에 새겨진 표식이라 키를
 * 만들지 않는다 (C10).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 (S-view). */
const CANVAS_H = 292;
const W = PIECE_CANVAS_W;

// ── 칸과 레일
const SIDE_MIN = 48;
const RAIL_PAD = 8;
const CELL_MAX_W = 84;
const CELL_H = 52;
/** 자리마다 하나씩 앉을 때 칸 사이의 틈. 전체 폭은 이 값으로 한 번 정해지고 고정된다. */
const GAP_APART = 58;
/** 한 자리에 둘이 앉을 때 그 둘 사이의 틈. */
const GAP_BESIDE = 20;

// ── 세로 자리
const TAPE_Y = 16;
const TOKEN_H = 30;
const TOKEN_MAX_W = 64;
const TOKEN_GAP = 12;
const ROW_H = 22;
const ROW_GAP = 4;
const ROW0_Y = TAPE_Y + TOKEN_H + 8;
const CELL_Y = 132;
const RAIL_Y = CELL_Y - RAIL_PAD;
const RAIL_H = CELL_H + RAIL_PAD * 2;
const SET_LABEL_Y = RAIL_Y + RAIL_H + 16;
/** 밀려난 것이 내려가 사라지는 자리. */
const EXIT_Y = SET_LABEL_Y + 30;
const CAPTION_Y1 = 266;
const CAPTION_Y2 = 284;

// ── 걸음 안의 시간
const FLY_MS = 300;
const LAND_MS = 100;
const HIT_MS = 180;
const REGROUP_MS = 460;

const RESIDENT_H = 34;

type Scene = {
  totalLines: number;
  ways: number[];
  accesses: number[];
};

/**
 * `initialData` 를 좁히는 자리는 여기다 (S-piece). projector 가 `onInit` 에서
 * 같은 것을 다시 좁혀 밀어 넣지 않는다 — mount 가 이미 받았다.
 */
function readScene(raw: unknown): Scene {
  const d = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  const nums = (v: unknown, fallback: number[]): number[] =>
    Array.isArray(v) && v.every((n) => typeof n === 'number') ? (v as number[]) : fallback;
  return {
    totalLines: Math.max(1, num(d.totalLines, 4)),
    ways: nums(d.ways, [1]),
    accesses: nums(d.accesses, []),
  };
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

type Chip = { g: SVGGElement; box: SVGRectElement; label: SVGTextElement };

function chip(w: number, h: number, fontSize: string): Chip {
  const g = el('g');
  const box = el('rect', { x: 0, y: 0, width: w, height: h, rx: 7 });
  const label = el('text', {
    x: w / 2,
    y: h / 2,
    'text-anchor': 'middle',
    'dominant-baseline': 'central',
    'font-family': fonts.mono,
    'font-size': fontSize,
  });
  g.appendChild(box);
  g.appendChild(label);
  return { g, box, label };
}

function place(g: SVGGElement, x: number, y: number, ms = 0): void {
  g.style.transition = ms > 0 ? `transform ${ms}ms cubic-bezier(.4,.1,.3,1), opacity ${ms}ms ease` : 'none';
  g.style.transform = `translate(${x}px, ${y}px)`;
}

/**
 * 캡션을 두 줄까지 접는다.
 *
 * 열 언어를 담으므로 한 줄로 못 박을 수 없다 — 같은 말이 언어마다 길이가 달라
 * 어느 하나에 맞추면 다른 언어에서 넘쳐 잘린다. 세로는 두 줄치를 늘 비워 두므로
 * 접혀도 높이는 바뀌지 않는다 (S-view).
 */
function wrapCaption(text: string, maxWidth: number, fontPx: number): string[] {
  const wide = /[ᄀ-ᇿ⺀-꓏가-퟿豈-﫿︰-﹏＀-￯]/;
  const width = (s: string): number => {
    let units = 0;
    for (const ch of s) units += wide.test(ch) ? 1 : 0.55;
    return units * fontPx;
  };
  if (text === '' || width(text) <= maxWidth) return [text];
  const words = text.split(' ');
  // 띄어쓰기로 끊기지 않는 글은 글자 단위로 끊는다.
  const units = words.length > 1 ? words : [...text];
  const joiner = words.length > 1 ? ' ' : '';
  let first = '';
  let second = '';
  let overflowed = false;
  for (const unit of units) {
    if (!overflowed) {
      const next = first === '' ? unit : first + joiner + unit;
      if (width(next) <= maxWidth) {
        first = next;
        continue;
      }
      overflowed = true;
    }
    second = second === '' ? unit : second + joiner + unit;
  }
  return second === '' ? [first] : [first, second];
}

export const associativityReliefStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 둔 이 캔버스가 통째로 떨어져 나간다 (S-view).
    svg.textContent = '';

    const colors: Palette = getColors(params.theme);
    const scene = readScene(params.initialData);
    const count = scene.totalLines;
    const waysList = scene.ways.length > 0 ? scene.ways : [1];

    // ── 기하. 상수는 상한만 정하고 실제 크기는 캔버스에서 역산한다 (S-piece).
    const usable = W - SIDE_MIN * 2 - RAIL_PAD * 2;
    const cellW = Math.min(CELL_MAX_W, Math.floor((usable - GAP_APART * (count - 1)) / count));
    const span = count * cellW + GAP_APART * (count - 1);
    const originX = Math.round((W - span) / 2);
    const residentW = Math.max(24, cellW - 12);

    /** 자리 사이의 틈. 한 자리 안이 붙는 만큼 자리 사이가 벌어져 전체 폭은 그대로다. */
    const seatGap = (ways: number): number => {
      const sets = Math.max(1, Math.floor(count / ways));
      const between = sets - 1;
      if (between <= 0) return 0;
      return (GAP_APART * (count - 1) - GAP_BESIDE * (count - sets)) / between;
    };

    const cellX = (i: number, ways: number): number => {
      const gap = seatGap(ways);
      let x = originX;
      for (let k = 0; k < i; k += 1) x += cellW + ((k + 1) % ways === 0 ? gap : GAP_BESIDE);
      return x;
    };

    const tokenCount = scene.accesses.length;
    const tokenW =
      tokenCount > 0
        ? Math.min(
            TOKEN_MAX_W,
            Math.floor((W - SIDE_MIN * 2 - TOKEN_GAP * (tokenCount - 1)) / tokenCount),
          )
        : TOKEN_MAX_W;
    const tapeSpan = tokenCount * tokenW + TOKEN_GAP * Math.max(0, tokenCount - 1);
    const tapeX = Math.round((W - tapeSpan) / 2);
    const tokenX = (i: number): number => tapeX + i * (tokenW + TOKEN_GAP);

    // ── 레일. 캐시 그 자체이고, 마운트부터 끝까지 폭도 자리도 바뀌지 않는다.
    svg.appendChild(
      el('rect', {
        x: originX - RAIL_PAD,
        y: RAIL_Y,
        width: span + RAIL_PAD * 2,
        height: RAIL_H,
        rx: 12,
        fill: colors.bgSubtle,
        stroke: colors.border,
        'stroke-width': 1,
      }),
    );

    // ── 칸막이. 자리를 가르는 유일한 것 — 짜임이 바뀌면 이것만 달라진다.
    const dividers: SVGGElement[] = [];
    for (let k = 0; k < count - 1; k += 1) {
      const g = el('g');
      g.appendChild(
        el('line', {
          x1: 0,
          y1: RAIL_Y + 6,
          x2: 0,
          y2: RAIL_Y + RAIL_H - 6,
          stroke: colors.border,
          'stroke-width': 2,
        }),
      );
      svg.appendChild(g);
      dividers.push(g);
    }

    // ── 칸. 크기가 변하지 않는다. 짜임이 바뀌면 자리만 옮긴다.
    const cells: SVGGElement[] = [];
    for (let i = 0; i < count; i += 1) {
      const g = el('g');
      g.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: cellW,
          height: CELL_H,
          rx: 8,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '4 4',
        }),
      );
      svg.appendChild(g);
      cells.push(g);
    }

    // ── 자리 이름.
    const setLabels: SVGTextElement[] = [];
    for (let s = 0; s < count; s += 1) {
      const t = el('text', {
        x: 0,
        y: SET_LABEL_Y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      // 도식에 새겨진 표식이라 키를 만들지 않는다 (C10).
      t.textContent = `set ${s}`;
      svg.appendChild(t);
      setLabels.push(t);
    }

    // ── 앉아 있는 것. 칸과 따로 두어 캔버스 좌표로 움직인다.
    const residents: Chip[] = [];
    for (let i = 0; i < count; i += 1) {
      const c = chip(residentW, RESIDENT_H, fontSizes.sm);
      c.g.style.opacity = '0';
      svg.appendChild(c.g);
      residents.push(c);
    }

    // ── 접근 띠.
    const tokens: Chip[] = [];
    for (let i = 0; i < tokenCount; i += 1) {
      const c = chip(tokenW, TOKEN_H, fontSizes.sm);
      c.label.textContent = String(scene.accesses[i]);
      place(c.g, tokenX(i), TAPE_Y);
      svg.appendChild(c.g);
      tokens.push(c);
    }

    // ── 판마다 한 줄씩, 그 접근이 무엇이었는지 도장을 찍어 남긴다.
    const stamps: Chip[][] = [];
    for (let r = 0; r < waysList.length; r += 1) {
      const y = ROW0_Y + r * (ROW_H + ROW_GAP);
      const rowLabel = el('text', {
        x: tapeX - 12,
        y: y + ROW_H / 2,
        'text-anchor': 'end',
        'dominant-baseline': 'central',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      rowLabel.textContent = `${waysList[r]}-way`;
      svg.appendChild(rowLabel);

      const row: Chip[] = [];
      for (let i = 0; i < tokenCount; i += 1) {
        const c = chip(tokenW, ROW_H, fontSizes.xs);
        c.g.style.opacity = '0';
        place(c.g, tokenX(i), y);
        svg.appendChild(c.g);
        row.push(c);
      }
      stamps.push(row);
    }

    const captionLines = [CAPTION_Y1, CAPTION_Y2].map((y) => {
      const t = el('text', {
        x: W / 2,
        y,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      svg.appendChild(t);
      return t;
    });

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    let curWays = waysList[0] ?? 1;
    let flyer: Chip | null = null;

    const cellCenterX = (i: number): number => cellX(i, curWays) + cellW / 2;

    function paintToken(i: number, active: boolean): void {
      const c = tokens[i];
      if (!c) return;
      c.box.setAttribute('fill', active ? colors.itemActive : colors.itemDefault);
      c.box.setAttribute('stroke', active ? colors.itemActive : colors.border);
      c.label.setAttribute('fill', active ? colors.stateInk : colors.text);
    }

    function paintResident(i: number, tone: 'rest' | 'hit' | 'leave'): void {
      const c = residents[i];
      if (!c) return;
      const fill =
        tone === 'hit' ? colors.accent : tone === 'leave' ? colors.itemSwapping : colors.itemDefault;
      c.box.setAttribute('fill', fill);
      c.box.setAttribute('stroke', tone === 'rest' ? colors.border : fill);
      c.label.setAttribute('fill', tone === 'rest' ? colors.text : colors.stateInk);
    }

    function layout(ways: number, ms: number): void {
      curWays = ways;
      const sets = Math.max(1, Math.floor(count / ways));
      for (let i = 0; i < count; i += 1) place(cells[i]!, cellX(i, ways), CELL_Y, ms);
      for (let k = 0; k < dividers.length; k += 1) {
        const shown = (k + 1) % ways === 0 && k < count - 1;
        const g = dividers[k]!;
        const x = (cellX(k, ways) + cellW + cellX(k + 1, ways)) / 2;
        place(g, x, 0, ms);
        g.style.opacity = shown ? '1' : '0';
      }
      for (let s = 0; s < setLabels.length; s += 1) {
        const t = setLabels[s]!;
        if (s >= sets) {
          t.style.opacity = '0';
          continue;
        }
        const first = cellX(s * ways, ways);
        const last = cellX(s * ways + ways - 1, ways) + cellW;
        t.style.transition = ms > 0 ? `opacity ${ms}ms ease` : 'none';
        t.style.opacity = '1';
        t.setAttribute('x', String((first + last) / 2));
      }
    }

    function clearResidents(ms: number): void {
      for (let i = 0; i < residents.length; i += 1) {
        const c = residents[i]!;
        c.g.style.transition = ms > 0 ? `opacity ${ms}ms ease` : 'none';
        c.g.style.opacity = '0';
      }
    }

    function showResident(i: number, addr: number): void {
      const c = residents[i];
      if (!c) return;
      c.label.textContent = String(addr);
      paintResident(i, 'rest');
      place(c.g, cellCenterX(i) - residentW / 2, CELL_Y + (CELL_H - RESIDENT_H) / 2, 0);
      c.g.style.opacity = '1';
    }

    function markStamp(ways: number, step: number, hit: boolean): void {
      const row = stamps[waysList.indexOf(ways)];
      const c = row?.[step];
      if (!c) return;
      // 도형에 새겨진 글자 — 표식이라 키를 만들지 않는다 (C10).
      c.label.textContent = hit ? 'H' : 'M';
      c.box.setAttribute('fill', hit ? colors.accent : colors.danger);
      c.box.setAttribute('stroke', hit ? colors.accent : colors.danger);
      c.label.setAttribute('fill', colors.stateInk);
      c.g.style.transition = 'opacity 160ms ease';
      c.g.style.opacity = '1';
    }

    function clearStamps(): void {
      for (const row of stamps) {
        for (const c of row) {
          c.g.style.transition = 'none';
          c.g.style.opacity = '0';
        }
      }
    }

    /** 접근 하나가 위에서 내려온다. 내려앉을 칸 앞에서 멈춘다. */
    async function fly(step: number, cellIndex: number, addr: number): Promise<void> {
      paintToken(step, true);
      const c = chip(residentW, RESIDENT_H, fontSizes.sm);
      c.label.textContent = String(addr);
      c.box.setAttribute('fill', colors.itemActive);
      c.box.setAttribute('stroke', colors.itemActive);
      c.label.setAttribute('fill', colors.stateInk);
      place(c.g, tokenX(step) + tokenW / 2 - residentW / 2, TAPE_Y + (TOKEN_H - RESIDENT_H) / 2, 0);
      svg.appendChild(c.g);
      flyer = c;
      // 시작 자리를 브라우저가 한 번 반영해야 옮기는 것이 보인다.
      await wait(20);
      place(c.g, cellCenterX(cellIndex) - residentW / 2, CELL_Y + (CELL_H - RESIDENT_H) / 2, FLY_MS);
    }

    function dropFlyer(): void {
      if (flyer) {
        flyer.g.remove();
        flyer = null;
      }
    }

    function resetView(): void {
      dropFlyer();
      for (let i = 0; i < tokens.length; i += 1) paintToken(i, false);
      clearResidents(0);
      clearStamps();
      layout(waysList[0] ?? 1, 0);
      setCaption('');
    }

    function setCaption(text: string): void {
      const lines = wrapCaption(text, W - 48, 14);
      captionLines[0]!.textContent = lines[0] ?? '';
      captionLines[1]!.textContent = lines[1] ?? '';
    }

    layout(curWays, 0);
    for (let i = 0; i < tokens.length; i += 1) paintToken(i, false);

    return {
      /** 칸은 그대로 두고 묶음만 다시 긋는다. 새 판이므로 앉아 있던 것은 비운다. */
      async regroup(p: { ways: number }): Promise<void> {
        dropFlyer();
        for (let i = 0; i < tokens.length; i += 1) paintToken(i, false);
        clearResidents(REGROUP_MS / 2);
        layout(p.ways, REGROUP_MS);
        await wait(REGROUP_MS);
      },

      /** 빈 칸에 내려앉는다. 아무도 밀려나지 않는다. */
      async fill(p: { ways: number; step: number; addr: number; cellIndex: number }): Promise<void> {
        await fly(p.step, p.cellIndex, p.addr);
        await wait(FLY_MS);
        dropFlyer();
        showResident(p.cellIndex, p.addr);
        markStamp(p.ways, p.step, false);
        await wait(LAND_MS);
        paintToken(p.step, false);
      },

      /** 자리가 차 있다. 앉아 있던 것이 아래로 빠지는 동안 새것이 내려온다. */
      async evict(p: { ways: number; step: number; addr: number; cellIndex: number }): Promise<void> {
        await fly(p.step, p.cellIndex, p.addr);
        const leaving = residents[p.cellIndex];
        if (leaving) {
          paintResident(p.cellIndex, 'leave');
          place(leaving.g, cellCenterX(p.cellIndex) - residentW / 2, EXIT_Y, FLY_MS);
          leaving.g.style.opacity = '0';
        }
        await wait(FLY_MS);
        dropFlyer();
        showResident(p.cellIndex, p.addr);
        markStamp(p.ways, p.step, false);
        await wait(LAND_MS);
        paintToken(p.step, false);
      },

      /** 찾는 것이 이미 앉아 있다. */
      async hit(p: { ways: number; step: number; addr: number; cellIndex: number }): Promise<void> {
        await fly(p.step, p.cellIndex, p.addr);
        await wait(FLY_MS);
        dropFlyer();
        paintResident(p.cellIndex, 'hit');
        markStamp(p.ways, p.step, true);
        await wait(HIT_MS);
        paintResident(p.cellIndex, 'rest');
        paintToken(p.step, false);
      },

      /** 다 굴렸다. 짚고 있던 것을 놓는다 — 남는 것은 두 줄의 도장이다. */
      finish(): void {
        dropFlyer();
        for (let i = 0; i < tokens.length; i += 1) paintToken(i, false);
      },

      setCaption(text: string): void {
        setCaption(text);
      },

      reset(): void {
        resetView();
      },

      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
