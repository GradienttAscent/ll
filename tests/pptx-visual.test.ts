import { describe, it } from 'node:test';
import assert from 'node:assert';
import { renderSlideSvg } from '../pptRender';

describe('PPTX visual slide representation', () => {
  it('renders deterministic slide 6 visual output with its slide provenance', () => {
    const svg = renderSlideSvg('lecture.pptx', 6, 'Paging\nPage replacement algorithms');
    assert.match(svg, /<svg/);
    assert.match(svg, /lecture\.pptx · Slide 6/);
    assert.match(svg, /Paging/);
    assert.match(svg, /Page replacement algorithms/);
  });
});
