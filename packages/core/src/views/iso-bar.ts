/**
 * iso-bar — front-edge isometric 큐브 막대 렌더링 헬퍼.
 *
 * bar-chart, goal-preview, snapshot-strip 등 막대를 그리는 모든 뷰가 이 헬퍼로
 * 큐브 모양을 통일한다. 큐브는 본체 3면(right/left/top 마름모) + 선택적 cap 3면으로 구성.
 *
 * 좌표계: front-edge isometric. base 마름모 중심을 (cx, baseY) 로 둔다.
 *   base 마름모 정점: front=(cx, baseY+depth), right=(cx+barW/2, baseY),
 *                     back=(cx, baseY-depth), left=(cx-barW/2, baseY)
 *   본체 top 마름모는 같은 모양으로 (cx, baseY-height) 위치.
 *   cap 은 본체 top 위로 capH 만큼 더 솟은 작은 큐브.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

export type IsoBarColors = {
  /** 본체 left + top 마름모 */
  bodyMain: string;
  /** 본체 right (음영 면) */
  bodySide: string;
  /** cap top 마름모 */
  capMain: string;
  /** cap left + right */
  capSide: string;
  /** 모든 면 stroke */
  stroke: string;
};

export type IsoBarFrame = {
  /** base 마름모 중심 x */
  cx: number;
  /** base 마름모 중심 y */
  baseY: number;
  /** 본체 높이 (base→top) */
  height: number;
  /** 본체 가로 폭 */
  barW: number;
  /** 마름모 세로반경 (= 깊이/2). 보통 barW/4. */
  depth: number;
  /** cap 두께. 0 이면 cap 미표시. */
  capH: number;
};

export type IsoBarOptions = {
  /** stroke 두께. 기본 1.25. snapshot 처럼 작은 막대는 0.75 권장. */
  strokeWidth?: number;
  /** polygon 의 class prefix. 기본 'facet-iso-bar'. */
  classPrefix?: string;
};

export type IsoBarHandle = {
  /** 6개 polygon 을 담은 그룹 노드 (parent 에 이미 append 됨) */
  group: SVGGElement;
  /** 좌표/색을 갱신 */
  update(frame: IsoBarFrame, colors: IsoBarColors): void;
};

/**
 * parent 안에 큐브 막대 그룹을 만들어 append 하고 update 함수를 반환한다.
 * 막대 개수가 변할 때만 호출하고, 매 render 마다는 update 만 호출하면 된다.
 */
export function createIsoBar(parent: SVGElement, opts?: IsoBarOptions): IsoBarHandle {
  const strokeWidth = String(opts?.strokeWidth ?? 1.25);
  const prefix = opts?.classPrefix ?? 'facet-iso-bar';

  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', prefix);

  function makePoly(suffix: string): SVGPolygonElement {
    const p = document.createElementNS(SVG_NS, 'polygon');
    p.setAttribute('class', `${prefix}__${suffix}`);
    p.setAttribute('stroke-width', strokeWidth);
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('stroke-linecap', 'round');
    return p;
  }

  // 그리는 순서: 본체 right(뒤쪽 음영) → left(전면) → top(마름모) → cap right → left → top
  const bodyRight = makePoly('body-right');
  const bodyLeft = makePoly('body-left');
  const bodyTop = makePoly('body-top');
  const capRight = makePoly('cap-right');
  const capLeft = makePoly('cap-left');
  const capTop = makePoly('cap-top');
  group.appendChild(bodyRight);
  group.appendChild(bodyLeft);
  group.appendChild(bodyTop);
  group.appendChild(capRight);
  group.appendChild(capLeft);
  group.appendChild(capTop);
  parent.appendChild(group);

  function update(frame: IsoBarFrame, colors: IsoBarColors): void {
    const { cx, baseY, height: h, barW, depth, capH } = frame;
    const halfW = barW / 2;
    const bY = baseY;
    const tY = bY - h;
    const cY = tY - capH;

    bodyRight.setAttribute(
      'points',
      `${cx},${bY + depth} ${cx + halfW},${bY} ${cx + halfW},${tY} ${cx},${tY + depth}`,
    );
    bodyLeft.setAttribute(
      'points',
      `${cx},${bY + depth} ${cx - halfW},${bY} ${cx - halfW},${tY} ${cx},${tY + depth}`,
    );
    bodyTop.setAttribute(
      'points',
      `${cx},${tY + depth} ${cx + halfW},${tY} ${cx},${tY - depth} ${cx - halfW},${tY}`,
    );

    bodyRight.setAttribute('fill', colors.bodySide);
    bodyLeft.setAttribute('fill', colors.bodyMain);
    bodyTop.setAttribute('fill', colors.bodyMain);
    bodyRight.setAttribute('stroke', colors.stroke);
    bodyLeft.setAttribute('stroke', colors.stroke);
    bodyTop.setAttribute('stroke', colors.stroke);

    if (capH > 0) {
      capRight.setAttribute(
        'points',
        `${cx},${tY + depth} ${cx + halfW},${tY} ${cx + halfW},${cY} ${cx},${cY + depth}`,
      );
      capLeft.setAttribute(
        'points',
        `${cx},${tY + depth} ${cx - halfW},${tY} ${cx - halfW},${cY} ${cx},${cY + depth}`,
      );
      capTop.setAttribute(
        'points',
        `${cx},${cY + depth} ${cx + halfW},${cY} ${cx},${cY - depth} ${cx - halfW},${cY}`,
      );
      capRight.setAttribute('fill', colors.capSide);
      capLeft.setAttribute('fill', colors.capSide);
      capTop.setAttribute('fill', colors.capMain);
      capRight.setAttribute('stroke', colors.stroke);
      capLeft.setAttribute('stroke', colors.stroke);
      capTop.setAttribute('stroke', colors.stroke);
      capRight.style.display = '';
      capLeft.style.display = '';
      capTop.style.display = '';
    } else {
      capRight.style.display = 'none';
      capLeft.style.display = 'none';
      capTop.style.display = 'none';
    }
  }

  return { group, update };
}
