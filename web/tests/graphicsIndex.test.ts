import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { graphicsIndex } from '../tools/graphics-index.ts';

describe('public/graphics/index.json', () => {
  it('lists exactly the files in the folder (run npm run graphics-index after adding one)', () => {
    const listed = JSON.parse(readFileSync(new URL('../public/graphics/index.json', import.meta.url), 'utf8')) as string[];
    expect(listed).toEqual(graphicsIndex());
    expect(listed).toContain('Standard-Tiles.png');
    expect(listed).not.toContain('index.json');
  });
});
