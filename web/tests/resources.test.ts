import { describe, it, expect } from 'vitest';
import { loadTestResources } from './helpers.ts';
import { MapId } from '../src/data/resources.ts';
import { MapValue } from '../src/game/tiles.ts';

describe('extracted resources', () => {
  const res = loadTestResources();

  it('contains every map with the expected size', () => {
    expect(res.maps.size).toBe(21);
    const sosaria = res.maps.get(MapId.Sosaria)!;
    expect(sosaria[0]).toBe(64);
    expect(sosaria.length).toBe(1 + 64 * 64 + 4); // size byte, tiles, whirlpool x/y/dx/dy
    expect(res.mapNames.get(MapId.Sosaria)).toBe('Sosaria');
    for (let id = MapId.FirstDungeon; id <= MapId.LastDungeon; id++) expect(res.maps.get(id)!.length).toBe(2048);
  });

  it('has Lord British’s castle where the location table says', () => {
    const { locationX, locationY } = res.misc;
    const sosaria = res.maps.get(MapId.Sosaria)!;
    const at = (x: number, y: number) => sosaria[1 + y * 64 + x];
    expect(at(locationX[0], locationY[0])).toBe(MapValue.Castle);
    expect(at(locationX[1], locationY[1])).toBe(MapValue.Castle); // Exodus
    expect(at(locationX[2], locationY[2])).toBe(MapValue.Town); // Lord British's town
  });

  it('has the eight moongate squares on grass', () => {
    const sosaria = res.maps.get(MapId.Sosaria)!;
    for (let i = 0; i < 8; i++) {
      const v = sosaria[1 + res.misc.moonY[i] * 64 + res.misc.moonX[i]];
      expect([MapValue.Grass, MapValue.MoonGate]).toContain(v);
    }
  });

  it('exposes the string tables', () => {
    expect(res.strings.Messages[23]).toBe('North\n'); // message 24, 1-based
    expect(res.strings.Tiles[0]).toBe('Water');
    expect(res.strings.Classes).toHaveLength(11);
    expect(String.fromCharCode(...res.misc.careerTable)).toBe('FCWTPBLIDAR');
  });

  it('ships a default party of four', () => {
    expect(res.defaultParty[0]).toBe(0x7e); // ranger shape
    expect(res.defaultParty[1]).toBe(4);
    expect(Array.from(res.defaultParty.subarray(6, 10))).toEqual([1, 2, 3, 4]);
    expect(res.defaultRoster.length).toBe(1280);
  });
});
