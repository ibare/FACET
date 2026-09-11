/**
 * wrong-in-one-direction-stage — 묻는 것이 복도를 지나다 막히는 판.
 *
 * 동사가 "막힌다" 라 화면의 중심은 **이동**이다. 묻는 낱말이 왼쪽에서 들어와
 * 문 셋을 차례로 지나는데, 문의 여닫힘은 위쪽 비트 배열의 그 자리에서 내려온다.
 * 꺼진 자리를 만나면 셔터가 내려와 앞을 막고, 낱말은 거기 부딪혀 되튄다.
 * 끝까지 가 닿은 것만 오른쪽 출구로 빠져 "있다" 칸에 떨어진다.
 *
 * 판정을 다루는 그림이라 색만 바뀌기 쉬운데, 그러면 순서대로 나타나는 다이어그램이
 * 된다 (S-piece). 그래서 이 판에서 움직이는 것은 넷이다 — 낱말의 이동, 셔터의
 * 오르내림, 짚은 칸의 들림, 그리고 답이 제 칸으로 떨어지는 것.
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

// ── 자리. 가로는 러너가 정하고(PIECE_CANVAS_W) 세로는 이 그림이 정한다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 304;

const SIDE_MIN = 26;
const CELL_MAX_W = 36;
const CELL_H = 30;
const CELL_LIFT = 4;

const ROSTER_BASE = 22;
const INDEX_BASE = 46;
const CELLS_TOP = 52;
const OWNER_CY = 94;

const LANE_TOP = 126;
const LANE_H = 52;
const GATE_W = 16;
const GATE_LABEL_BASE = 120;
/** 문이 복도를 나눠 서는 자리 — 복도 폭의 30% 에서 70% 사이에 고르게. */
const GATE_FROM = 0.3;
const GATE_TO = 0.7;
/** 셔터의 세 높이 — 아직 안 읽음 / 올라감 / 내려와 막음. */
const SHUTTER_UNREAD = 22;
const SHUTTER_OPEN = 6;

const TOKEN_H = 26;
const CAPTION_BASE = 202;

const BIN_GAP = 24;
const BIN_LABEL_BASE = 228;
const BIN_RULE_Y = 234;
const BIN_TOP = 240;
const CHIP_H = 24;
const CHIP_GAP = 6;
const BIN_ROWS = 2;

const SVG_NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

/** 낱말을 담는 알약의 폭. mono 글자 폭에서 역산한다. */
function pillWidth(word: string, charW: number, pad: number): number {
  return Math.round(word.length * charW) + pad;
}

export type ProbeStep = {
  word: string;
  probeIndex: number;
  slots: number[];
  slot: number;
  bit: number;
};
export type VerdictStep = { word: string; present: boolean; truth: boolean; blockedSlot: number };
export type AttributeStep = { slots: number[]; owners: string[] };

type Scene = { slotCount: number; hashCount: number; bits: string; inserted: string[] };

/**
 * `initialData` 를 좁히는 것은 이 자리다 — projector 가 다시 좁혀 밀어 넣지 않는다
 * (S-piece). 걸음마다 오는 payload 는 projector 의 몫이다.
 */
function readScene(initial: Record<string, unknown> | undefined): Scene {
  const d = initial ?? {};
  const bits = typeof d.bits === 'string' ? d.bits : '';
  const declared = typeof d.slotCount === 'number' && d.slotCount > 0 ? d.slotCount : bits.length;
  const hashCount = typeof d.hashCount === 'number' && d.hashCount > 0 ? d.hashCount : 3;
  const inserted = Array.isArray(d.inserted)
    ? d.inserted.filter((v): v is string => typeof v === 'string')
    : [];
  return { slotCount: Math.max(1, declared), hashCount, bits, inserted };
}

export const wrongInOneDirectionStageView: CanvasView = {
  canvas: { height: H, fit: 'fill' },

  mount(_container, params): ViewInstance {
    const t = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const scene = readScene(params.initialData);

    // ── 좌표는 캔버스에서 역산한다. 요소 크기는 상한만 두고 남는 폭을 버리지 않는다.
    const n = scene.slotCount;
    const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
    const gridW = cellW * n;
    const x0 = Math.round((W - gridW) / 2);
    const x1 = x0 + gridW;
    const k = Math.max(1, scene.hashCount);

    const cellCx = (slot: number): number => x0 + slot * cellW + cellW / 2;
    const gateCx = (i: number): number =>
      Math.round(
        k === 1
          ? x0 + gridW * 0.5
          : x0 + gridW * (GATE_FROM + ((GATE_TO - GATE_FROM) * i) / (k - 1)),
      );
    const exitX = Math.round(x0 + gridW * 0.93);
    const homeX = Math.round(x0 + gridW * 0.085);
    const laneCy = LANE_TOP + LANE_H / 2;
    const binW = Math.floor((gridW - BIN_GAP) / 2);
    const binLeft = (bin: number): number => x0 + bin * (binW + BIN_GAP);

    // ── 걸어 둔 프레임과 기다리는 것. destroy 가 둘 다 거둔다 (S-piece).
    let destroyed = false;
    const waiters = new Set<() => void>();
    const frames = new Set<number>();

    function tween(ms: number, apply: (eased: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const started = Date.now();
        let id = 0;
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          frames.delete(id);
          if (destroyed) return finish();
          const p = Math.min(1, (Date.now() - started) / ms);
          apply(1 - Math.pow(1 - p, 3));
          if (p >= 1) return finish();
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 층. 뒤에 붙인 것이 위로 온다.
    const root = el('g', {});
    const rosterLayer = el('g', {});
    const gridLayer = el('g', {});
    const dropperLayer = el('g', {});
    const ownerLayer = el('g', {});
    const laneLayer = el('g', {});
    const tokenLayer = el('g', {});
    const binLayer = el('g', {});
    for (const layer of [
      rosterLayer,
      gridLayer,
      dropperLayer,
      ownerLayer,
      laneLayer,
      tokenLayer,
      binLayer,
    ]) {
      root.appendChild(layer);
    }
    params.canvas.appendChild(root);

    // ── 넣은 것. 오른쪽 끝에 붙여 쌓고 라벨은 그 왼쪽으로 뻗는다 —
    //    언어마다 라벨 길이가 달라도 알약과 부딪히지 않게.
    const rosterCx = new Map<string, number>();
    let cursor = x1;
    for (let i = scene.inserted.length - 1; i >= 0; i -= 1) {
      const word = scene.inserted[i];
      const w = pillWidth(word, 7.2, 18);
      const left = cursor - w;
      rosterLayer.appendChild(
        el('rect', {
          x: left,
          y: ROSTER_BASE - 13,
          width: w,
          height: 18,
          rx: 9,
          fill: c.bgSubtle,
          stroke: c.border,
        }),
      );
      const label = el('text', {
        x: left + w / 2,
        y: ROSTER_BASE,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      label.textContent = word;
      rosterLayer.appendChild(label);
      rosterCx.set(word, left + w / 2);
      cursor = left - 6;
    }
    const rosterLabel = el('text', {
      x: cursor - 4,
      y: ROSTER_BASE,
      'text-anchor': 'end',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    rosterLabel.textContent = t('label.inserted', 'Put in');
    rosterLayer.appendChild(rosterLabel);

    // ── 비트 배열. 칸은 들리므로 무리로 감싸고, 번호는 따라 들리지 않게 바깥에 둔다.
    const cellGroups: SVGGElement[] = [];
    const cellRects: SVGRectElement[] = [];
    for (let slot = 0; slot < n; slot += 1) {
      const on = scene.bits[slot] === '1';
      const index = el('text', {
        x: cellCx(slot),
        y: INDEX_BASE,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      index.textContent = String(slot);
      gridLayer.appendChild(index);

      const group = el('g', {});
      const rect = el('rect', {
        x: x0 + slot * cellW + 1,
        y: CELLS_TOP,
        width: cellW - 2,
        height: CELL_H,
        rx: 4,
        fill: on ? c.text : c.bg,
        stroke: on ? c.text : c.border,
        'stroke-width': 1.2,
      });
      const digit = el('text', {
        x: cellCx(slot),
        y: CELLS_TOP + CELL_H / 2 + 4,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: on ? c.textInverse : c.textMuted,
      });
      digit.textContent = on ? '1' : '0';
      group.appendChild(rect);
      group.appendChild(digit);
      gridLayer.appendChild(group);
      cellGroups.push(group);
      cellRects.push(rect);
    }

    // ── 복도.
    laneLayer.appendChild(
      el('line', {
        x1: x0,
        y1: LANE_TOP + LANE_H,
        x2: x1,
        y2: LANE_TOP + LANE_H,
        stroke: c.border,
        'stroke-width': 1.4,
      }),
    );
    laneLayer.appendChild(
      el('line', {
        x1: x0,
        y1: LANE_TOP,
        x2: x1,
        y2: LANE_TOP,
        stroke: c.border,
        'stroke-width': 1,
        'stroke-dasharray': '2 4',
      }),
    );
    laneLayer.appendChild(
      el('path', {
        d: `M ${exitX - 9} ${LANE_TOP + 5} L ${exitX} ${LANE_TOP + 5} L ${exitX} ${LANE_TOP + LANE_H - 5} L ${exitX - 9} ${LANE_TOP + LANE_H - 5}`,
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1.6,
      }),
    );

    // ── 문 셋 + 각 문이 어느 칸을 읽는지 잇는 줄.
    type Gate = {
      shutter: SVGRectElement;
      label: SVGTextElement;
      dropper: SVGPathElement;
      height: number;
    };
    const gates: Gate[] = [];
    for (let i = 0; i < k; i += 1) {
      const gx = gateCx(i);
      const dropper = el('path', {
        d: '',
        fill: 'none',
        stroke: c.border,
        'stroke-width': 1.2,
        'stroke-dasharray': '3 3',
      });
      dropperLayer.appendChild(dropper);

      laneLayer.appendChild(
        el('rect', {
          x: gx - GATE_W / 2,
          y: LANE_TOP,
          width: GATE_W,
          height: LANE_H,
          fill: 'none',
          stroke: c.border,
          'stroke-width': 1.2,
        }),
      );
      const shutter = el('rect', {
        x: gx - GATE_W / 2 + 1.5,
        y: LANE_TOP + 1.5,
        width: GATE_W - 3,
        height: SHUTTER_UNREAD,
        rx: 2,
        fill: c.bgSubtle,
        stroke: c.border,
        'stroke-width': 1,
      });
      laneLayer.appendChild(shutter);

      const label = el('text', {
        x: gx,
        y: GATE_LABEL_BASE,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      laneLayer.appendChild(label);

      gates.push({ shutter, label, dropper, height: SHUTTER_UNREAD });
    }

    // ── 답이 쌓이는 두 칸.
    const binTags: SVGTextElement[] = [];
    const binHeads = [t('label.answerYes', '"Present"'), t('label.answerNo', '"Absent"')];
    const binNotes = [t('label.canBeWrong', 'can be wrong'), t('label.neverWrong', 'never wrong')];
    for (let bin = 0; bin < 2; bin += 1) {
      const bx = binLeft(bin);
      const head = el('text', {
        x: bx + 2,
        y: BIN_LABEL_BASE,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      head.textContent = binHeads[bin];
      binLayer.appendChild(head);
      binLayer.appendChild(
        el('line', { x1: bx, y1: BIN_RULE_Y, x2: bx + binW, y2: BIN_RULE_Y, stroke: c.border }),
      );
      const tag = el('text', {
        x: bx + binW - 2,
        y: BIN_LABEL_BASE,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: bin === 0 ? c.danger : c.success,
        opacity: 0,
      });
      tag.textContent = binNotes[bin];
      binLayer.appendChild(tag);
      binTags.push(tag);
    }

    const caption = el('text', {
      x: W / 2,
      y: CAPTION_BASE,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);

    // ── 움직이는 것들의 지금 상태.
    let token: { group: SVGGElement; rect: SVGRectElement; width: number; x: number; y: number } | null =
      null;
    const landed: SVGElement[] = [];
    const ownerTags: SVGElement[] = [];
    const binFilled = [0, 0];
    let litCells: number[] = [];

    function tokenHalf(): number {
      return token ? token.width / 2 : 0;
    }

    function placeToken(x: number, y: number): void {
      if (!token) return;
      token.x = x;
      token.y = y;
      token.group.setAttribute('transform', `translate(${x} ${y})`);
    }

    function moveToken(toX: number, toY: number, ms: number): Promise<void> {
      if (!token) return Promise.resolve();
      const fromX = token.x;
      const fromY = token.y;
      return tween(ms, (e) => placeToken(lerp(fromX, toX, e), lerp(fromY, toY, e)));
    }

    function makeToken(word: string): void {
      const width = Math.max(56, pillWidth(word, 8.4, 26));
      const group = el('g', {});
      const rect = el('rect', {
        x: -width / 2,
        y: -TOKEN_H / 2,
        width,
        height: TOKEN_H,
        rx: 6,
        fill: c.bg,
        stroke: c.text,
        'stroke-width': 1.6,
      });
      const label = el('text', {
        x: 0,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: c.text,
      });
      label.textContent = word;
      group.appendChild(rect);
      group.appendChild(label);
      tokenLayer.appendChild(group);
      token = { group, rect, width, x: x0 - width, y: laneCy };
      placeToken(x0 - width, laneCy);
    }

    function clearOwners(): void {
      for (const tag of ownerTags) tag.remove();
      ownerTags.length = 0;
    }

    function coolCells(): void {
      for (const slot of litCells) {
        cellGroups[slot].removeAttribute('transform');
        cellRects[slot].setAttribute('stroke', scene.bits[slot] === '1' ? c.text : c.border);
        cellRects[slot].setAttribute('stroke-width', '1.2');
      }
      litCells = [];
    }

    function resetGates(): void {
      for (const gate of gates) {
        gate.height = SHUTTER_UNREAD;
        gate.shutter.setAttribute('height', String(SHUTTER_UNREAD));
        gate.shutter.setAttribute('fill', c.bgSubtle);
        gate.shutter.setAttribute('stroke', c.border);
        gate.label.textContent = '';
        gate.dropper.setAttribute('d', '');
      }
    }

    function dropperPath(cx: number, gx: number): string {
      const top = CELLS_TOP + CELL_H;
      const end = GATE_LABEL_BASE - 14;
      return `M ${cx} ${top} C ${cx} ${top + 16} ${gx} ${end - 12} ${gx} ${end}`;
    }

    /** 새 낱말이 복도로 들어온다. 볼 자리 셋이 문마다 배정된다. */
    async function enterQuery(word: string, slots: number[]): Promise<void> {
      clearOwners();
      coolCells();
      resetGates();
      for (let i = 0; i < k && i < slots.length; i += 1) {
        const slot = slots[i];
        gates[i].label.textContent = String(slot);
        gates[i].dropper.setAttribute('d', dropperPath(cellCx(slot), gateCx(i)));
      }
      if (token) token.group.remove();
      token = null;
      makeToken(word);
      await moveToken(homeX, laneCy, 200);
    }

    /** 칸을 읽는다 — 그 칸이 들리고, 잇는 줄이 진해지고, 셔터가 오르거나 내린다. */
    function readSlot(i: number, slot: number, open: boolean): Promise<void> {
      const gate = gates[i];
      gate.dropper.setAttribute('stroke', c.itemActive);
      gate.dropper.setAttribute('stroke-width', '1.8');
      gate.dropper.removeAttribute('stroke-dasharray');
      gate.label.setAttribute('fill', c.itemActive);
      cellRects[slot].setAttribute('stroke', c.itemActive);
      cellRects[slot].setAttribute('stroke-width', '2.4');
      litCells.push(slot);

      gate.shutter.setAttribute('fill', open ? c.textMuted : c.text);
      gate.shutter.setAttribute('stroke', open ? c.textMuted : c.text);
      const from = gate.height;
      const to = open ? SHUTTER_OPEN : LANE_H - 3;
      gate.height = to;
      const cell = cellGroups[slot];
      return tween(open ? 140 : 175, (e) => {
        gate.shutter.setAttribute('height', String(lerp(from, to, e)));
        cell.setAttribute('transform', `translate(0 ${-CELL_LIFT * e})`);
      });
    }

    async function showProbe(p: ProbeStep): Promise<void> {
      if (p.probeIndex === 0) await enterQuery(p.word, p.slots);
      const i = Math.min(p.probeIndex, k - 1);
      const gx = gateCx(i);
      await readSlot(i, p.slot, p.bit === 1);
      if (p.bit === 1) {
        // 지난다 — 문 너머로 빠져나간다.
        await moveToken(gx + GATE_W / 2 + tokenHalf() + 10, laneCy, 260);
        return;
      }
      // 막힌다 — 닫힌 문에 부딪혀 되튄다.
      const stop = gx - GATE_W / 2 - tokenHalf() - 8;
      await moveToken(stop + 10, laneCy, 230);
      await moveToken(stop, laneCy, 110);
    }

    /** 답이 제 칸으로 떨어진다. 걸어온 낱말이 그대로 기록이 된다. */
    async function showVerdict(v: VerdictStep): Promise<void> {
      if (!token) return;
      const bin = v.present ? 0 : 1;
      const right = v.present === v.truth;
      if (v.present) await moveToken(exitX - tokenHalf() - 12, laneCy, 240);

      const row = Math.min(binFilled[bin], BIN_ROWS - 1);
      binFilled[bin] += 1;
      await moveToken(
        binLeft(bin) + binW / 2 - 12,
        BIN_TOP + CHIP_H / 2 + row * (CHIP_H + CHIP_GAP),
        340,
      );

      const chip = token;
      chip.rect.setAttribute('stroke', right ? c.border : c.danger);
      chip.rect.setAttribute('fill', c.bgSubtle);
      const mark = el('text', {
        x: chip.width / 2 + 14,
        y: 5,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.md,
        fill: right ? c.success : c.danger,
        opacity: 0,
      });
      mark.textContent = right ? '✓' : '✗';
      chip.group.appendChild(mark);
      binLayer.appendChild(chip.group);
      landed.push(chip.group);
      token = null;
      await tween(160, (e) => {
        mark.setAttribute('opacity', String(e));
        mark.setAttribute('y', String(lerp(11, 5, e)));
      });
    }

    /** 그 자리를 켠 것이 누구였는지 — 넣은 것 쪽에서 낱말이 날아와 칸 아래에 붙는다. */
    async function showOwners(a: AttributeStep): Promise<void> {
      for (let i = 0; i < a.slots.length; i += 1) {
        const owner = a.owners[i];
        const from = owner === undefined ? undefined : rosterCx.get(owner);
        if (owner === undefined || owner === '' || from === undefined) continue;
        const w = pillWidth(owner, 6.6, 14);
        const group = el('g', {});
        group.appendChild(
          el('rect', {
            x: -w / 2,
            y: -8,
            width: w,
            height: 16,
            rx: 8,
            fill: c.bgSubtle,
            stroke: c.itemActive,
          }),
        );
        const label = el('text', {
          x: 0,
          y: 4,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: c.text,
        });
        label.textContent = owner;
        group.appendChild(label);
        ownerLayer.appendChild(group);
        ownerTags.push(group);

        const toX = cellCx(a.slots[i]);
        await tween(170, (e) => {
          group.setAttribute(
            'transform',
            `translate(${lerp(from, toX, e)} ${lerp(ROSTER_BASE - 4, OWNER_CY, e)})`,
          );
        });
      }
    }

    /** 두 칸이 서로 무엇인지 말한다 — 오른쪽에서 미끄러져 들어온다. */
    function showConclusion(): Promise<void> {
      const ends = binTags.map((tag) => Number(tag.getAttribute('x') ?? 0));
      return tween(260, (e) => {
        for (let i = 0; i < binTags.length; i += 1) {
          binTags[i].setAttribute('opacity', String(e));
          binTags[i].setAttribute('x', String(lerp(ends[i] + 14, ends[i], e)));
        }
      });
    }

    function resetScene(): void {
      for (const node of landed) node.remove();
      landed.length = 0;
      binFilled[0] = 0;
      binFilled[1] = 0;
      clearOwners();
      coolCells();
      resetGates();
      for (const gate of gates) {
        gate.dropper.setAttribute('stroke', c.border);
        gate.dropper.setAttribute('stroke-width', '1.2');
        gate.dropper.setAttribute('stroke-dasharray', '3 3');
        gate.label.setAttribute('fill', c.textMuted);
      }
      if (token) token.group.remove();
      token = null;
      for (const tag of binTags) tag.setAttribute('opacity', '0');
      caption.textContent = '';
    }

    return {
      setCaption(text: string): void {
        caption.textContent = text;
      },
      showProbe,
      showVerdict,
      showOwners,
      showConclusion,
      resetScene,

      destroy(): void {
        destroyed = true;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
