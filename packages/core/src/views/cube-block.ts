/**
 * cube-block — 납작한 3D 큐브(front + left-depth + top-depth) 렌더링 헬퍼.
 *
 * conveyor-queue, 그리고 이후 추가될 큐/스택/배열 계열 View 가 같은 큐브 미학을
 * 공유하도록 분리된 non-View 프리미티브. iso-bar 와 동일 계보(팩토리 + 핸들)
 * 이되 두 지점에서 의도적으로 이탈:
 *   1. 팩토리가 DOM 삽입 부작용을 갖지 않는다 — 소비측이 appendChild 든
 *      insertBefore 든 자유롭게 선택 (conveyor-queue 의 z-order 삽입을 위해 필요).
 *   2. Colors 는 front / left / top 의 3면 독립 — iso-bar 의 2-tone 보다 표현력 큼.
 *
 * 좌표계: 정면 좌상 꼭짓점 (x, y) 기준. 깊이 벡터 (dx, dy) 는 (+x 는 우, +y 는
 * 아래). conveyor-queue 의 기존 값 (-15.46, -10) 이 기본값 — 좌상향 대각선.
 *
 * 스탬프는 `content.stamp === undefined` 일 때 자동 숨김 (iso-bar 의 capH=0 패턴).
 */

import { fonts } from './design-tokens.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 3면 독립 채움 + stroke / 텍스트 색.
 *
 * iso-bar 와 동일 원칙: 모든 색은 소비측 주입. 헬퍼 내부에 hex 리터럴 기본값을
 * 두지 않아 S-view 의 "하드코딩 색 금지" 규율을 유지한다. label/stamp 텍스트가
 * 없다면 `content.label` / `content.stamp` 자체를 생략하면 된다.
 */
export type CubeBlockColors = {
  front: string;
  left: string;
  top: string;
  label: string;
  stamp: string;
  stroke?: string;
};

/** 정면 좌상 꼭짓점 기반 기하. */
export type CubeBlockFrame = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 3D 깊이 벡터. 생략 시 (-15.46, -10) — 좌상향. */
  depth?: { dx: number; dy: number };
};

/** 텍스트 내용. stamp 를 주지 않으면 스탬프 영역 미렌더. */
export type CubeBlockContent = {
  label: string;
  stamp?: number;
};

export type CubeBlockOptions = {
  /** CSS class prefix. 기본 'facet-cube-block'. */
  classPrefix?: string;
  /** 라벨 font-size (SVG 단위). 기본 11. */
  labelFontSize?: number;
  /** 스탬프 font-size (SVG 단위). 기본 6. */
  stampFontSize?: number;
  /** font-family. 기본 system-ui 계열. */
  fontFamily?: string;
};

export type CubeBlockHandle = {
  /** DOM 에 삽입 되지 않은 상태로 반환된 큐브 그룹. 소비측이 원하는 위치에 붙인다. */
  group: SVGGElement;
  /** 기하·내용·색을 즉시 반영. 멱등. */
  update(frame: CubeBlockFrame, content: CubeBlockContent, colors: CubeBlockColors): void;
};

const DEFAULT_DEPTH = { dx: -15.46, dy: -10 } as const;

/**
 * 큐브 블록 핸들 생성. parent 에 자동 부착하지 않는다.
 *
 * 소비측 패턴:
 *   const cube = createCubeBlock({ classPrefix: 'facet-cq-block' });
 *   cube.update({ x, y, w, h }, { label, stamp }, { front, left, top });
 *   track.insertBefore(cube.group, track.firstChild);  // 또는 appendChild
 */
export function createCubeBlock(opts?: CubeBlockOptions): CubeBlockHandle {
  const prefix = opts?.classPrefix ?? 'facet-cube-block';
  const labelFontSize = opts?.labelFontSize ?? 11;
  const stampFontSize = opts?.stampFontSize ?? 6;
  const fontFamily = opts?.fontFamily ?? fonts.body;

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', prefix);

  const leftFace = document.createElementNS(SVG_NS, 'path');
  leftFace.setAttribute('class', `${prefix}__left`);
  const topFace = document.createElementNS(SVG_NS, 'path');
  topFace.setAttribute('class', `${prefix}__top`);
  const frontFace = document.createElementNS(SVG_NS, 'rect');
  frontFace.setAttribute('class', `${prefix}__front`);

  const stampText = document.createElementNS(SVG_NS, 'text');
  stampText.setAttribute('class', `${prefix}__stamp`);
  stampText.setAttribute('font-family', fontFamily);
  stampText.setAttribute('font-size', String(stampFontSize));
  stampText.setAttribute('font-weight', '600');
  stampText.setAttribute('text-anchor', 'middle');

  const labelText = document.createElementNS(SVG_NS, 'text');
  labelText.setAttribute('class', `${prefix}__label`);
  labelText.setAttribute('font-family', fontFamily);
  labelText.setAttribute('font-size', String(labelFontSize));
  labelText.setAttribute('font-weight', '700');
  labelText.setAttribute('text-anchor', 'middle');

  // 그리는 순서: 깊이면 → 정면 → 텍스트. 3D 카발리에 투영 z-order.
  group.appendChild(leftFace);
  group.appendChild(topFace);
  group.appendChild(frontFace);
  group.appendChild(stampText);
  group.appendChild(labelText);

  function update(
    frame: CubeBlockFrame,
    content: CubeBlockContent,
    colors: CubeBlockColors,
  ): void {
    const { x, y, w, h } = frame;
    const { dx, dy } = frame.depth ?? DEFAULT_DEPTH;

    leftFace.setAttribute(
      'd',
      `M${x} ${y}L${x + dx} ${y + dy}V${y + h + dy}L${x} ${y + h}Z`,
    );
    leftFace.setAttribute('fill', colors.left);

    topFace.setAttribute(
      'd',
      `M${x} ${y}L${x + dx} ${y + dy}H${x + w + dx}L${x + w} ${y}Z`,
    );
    topFace.setAttribute('fill', colors.top);

    frontFace.setAttribute('x', String(x));
    frontFace.setAttribute('y', String(y));
    frontFace.setAttribute('width', String(w));
    frontFace.setAttribute('height', String(h));
    frontFace.setAttribute('fill', colors.front);

    if (colors.stroke !== undefined) {
      leftFace.setAttribute('stroke', colors.stroke);
      topFace.setAttribute('stroke', colors.stroke);
      frontFace.setAttribute('stroke', colors.stroke);
    } else {
      leftFace.removeAttribute('stroke');
      topFace.removeAttribute('stroke');
      frontFace.removeAttribute('stroke');
    }

    if (content.stamp !== undefined) {
      stampText.setAttribute('x', String(x + w / 2));
      stampText.setAttribute('y', String(y + h * 0.32));
      stampText.setAttribute('fill', colors.stamp);
      stampText.textContent = `#${content.stamp}`;
      stampText.style.display = '';
    } else {
      stampText.style.display = 'none';
    }

    labelText.setAttribute('x', String(x + w / 2));
    labelText.setAttribute('y', String(y + h * 0.78));
    labelText.setAttribute('fill', colors.label);
    labelText.textContent = content.label;
  }

  return { group, update };
}
