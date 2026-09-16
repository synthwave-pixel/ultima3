import { describe, it, expect } from 'vitest';
import { newWorld } from './helpers.ts';
import { buildViewport, VIEW_SIZE, VIEW_CENTRE } from '../src/game/viewport.ts';
import { MapValue, Shape } from '../src/game/tiles.ts';

const centre = VIEW_CENTRE * VIEW_SIZE + VIEW_CENTRE;

describe('viewport', () => {
  it('centres on the party and overlays the party marker', () => {
    const world = newWorld();
    const view = buildViewport(world);
    expect(view.cells).toHaveLength(121);
    expect(view.originX).toBe(world.x - 5);
    expect(view.originY).toBe(world.y - 5);
    expect(view.cells[centre].overlay).toBe(Shape.Ranger);
    expect(view.cells[centre].base).toBe(world.getXYVal(world.x, world.y) >> 1);
  });

  it('wraps around the edge of Sosaria', () => {
    const world = newWorld();
    world.x = 0;
    world.y = 0;
    const view = buildViewport(world);
    // Top-left cell of the view is map (59, 59).
    const expected = world.getXYVal(59, 59) >> 1;
    const cell = view.cells[0];
    // It may be hidden by line of sight; in that case it is Void.
    expect([expected, Shape.Void]).toContain(cell.base);
  });

  it('hides squares behind mountains', () => {
    const world = newWorld();
    // Build a flat grass world with a mountain due north of the party.
    world.current.tiles.fill(MapValue.Grass);
    world.monsters.bytes.fill(0);
    world.x = 32;
    world.y = 32;
    world.putXYVal(MapValue.Mountains, 32, 31);
    const view = buildViewport(world);
    const at = (vx: number, vy: number) => view.cells[vy * VIEW_SIZE + vx].base;
    expect(at(5, 4)).toBe(Shape.Mountains); // the mountain itself is visible
    expect(at(5, 3)).toBe(Shape.Void); // directly behind it is not
    expect(at(5, 0)).toBe(Shape.Void); // nor anything further along that line
    // Sight lines step diagonally toward the party, so (4,3) also looks through (5,4)...
    expect(at(4, 3)).toBe(Shape.Void);
    // ...while (3,3) looks through (4,4), which is clear.
    expect(at(3, 3)).toBe(Shape.Grass);
    expect(at(6, 4)).toBe(Shape.Grass);
  });

  it('draws creatures over the terrain they stand on', () => {
    const world = newWorld();
    world.current.tiles.fill(MapValue.Grass);
    world.monsters.bytes.fill(0);
    world.x = 32;
    world.y = 32;
    const m = world.monsters;
    m.setType(3, MapValue.Orc);
    m.setTileUnder(3, MapValue.Brush);
    m.setPosition(3, 34, 32);
    m.setVariant(3, 0);
    world.putXYVal(MapValue.Orc, 34, 32);
    const view = buildViewport(world);
    const cell = view.cells[5 * VIEW_SIZE + 7];
    expect(cell.base).toBe(Shape.Brush);
    expect(cell.overlay).toBe(MapValue.Orc >> 1);
  });

  it('puts water under a sea creature value that has no table entry', () => {
    const world = newWorld();
    world.current.tiles.fill(MapValue.Grass);
    world.monsters.bytes.fill(0);
    world.x = 32;
    world.y = 32;
    world.putXYVal(MapValue.Pirate, 34, 32);
    const cell = buildViewport(world).cells[5 * VIEW_SIZE + 7];
    expect(cell.base).toBe(Shape.Water);
    expect(cell.overlay).toBe(Shape.Pirate);
  });

  it('uses the variant tile rows for Goblins and Trolls', () => {
    const world = newWorld();
    world.current.tiles.fill(MapValue.Grass);
    world.monsters.bytes.fill(0);
    world.x = 32;
    world.y = 32;
    world.putXYVal(MapValue.Orc + 1, 33, 32); // Goblin
    const view = buildViewport(world);
    // Orc is tile 24; its first variant is tile ((24-23)*2 + 79 + 1) = 82.
    expect(view.cells[5 * VIEW_SIZE + 6].base).toBe(82 * 2);
  });

  it('turns a lone letter I into a door', () => {
    const world = newWorld();
    world.current.tiles.fill(MapValue.Floor);
    world.monsters.bytes.fill(0);
    world.x = 32;
    world.y = 32;
    world.putXYVal(MapValue.LetterI, 33, 32);
    world.putXYVal(MapValue.LetterI, 30, 32);
    world.putXYVal(MapValue.LetterA, 29, 32); // "AI" is a sign, not a door
    const view = buildViewport(world);
    expect(view.cells[5 * VIEW_SIZE + 6].overlay).toBe(Shape.Door);
    expect(view.cells[5 * VIEW_SIZE + 3].base).toBe(MapValue.LetterI >> 1);
    expect(view.cells[5 * VIEW_SIZE + 3].overlay).toBeUndefined();
  });
});

describe('the follower line', () => {
  it('marks the squares the leader came through on the overworld too, nearest first', async () => {
    const { newWorld } = await import('./helpers.ts');
    const { move } = await import('../src/game/commands.ts');
    const { FakeIO } = await import('./helpers.ts');
    const world = newWorld();
    world.current.tiles.fill(MapValue.Grass);
    world.monsters.bytes.fill(0);
    world.x = 32;
    world.y = 32;
    const io = new FakeIO(world.resources);
    await move(world, io, 'north');
    await move(world, io, 'north');
    await move(world, io, 'east');
    const view = buildViewport(world);
    const at = (dx: number, dy: number) => view.cells[(VIEW_SIZE / 2 + dy - 0.5) * VIEW_SIZE + (VIEW_SIZE / 2 + dx - 0.5)];
    expect(at(0, 0).party).toBe(true);
    expect(at(-1, 0).follower).toBe(1); // where the leader just was
    expect(at(-1, 1).follower).toBe(2);
    expect(at(-1, 2).follower).toBe(3);
  });
});
