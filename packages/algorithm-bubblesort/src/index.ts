export { bubbleSortAlgorithm, bubbleSortIRs } from './algorithm.js';
export { bubbleSortBars, type BubbleSortState } from './body.js';
export { renderBars, updateBars, type BarsView } from './render.js';

import { bubbleSortAlgorithm, bubbleSortIRs } from './algorithm.js';
import { bubbleSortBars } from './body.js';

export const bubbleSortBundle = {
  algorithm: bubbleSortAlgorithm,
  body: bubbleSortBars,
  irs: bubbleSortIRs,
};
