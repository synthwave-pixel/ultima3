import { describe, it, expect } from 'vitest';
import { loadTestResources } from './helpers.ts';
import { Roster, PlayerRecord } from '../src/game/player.ts';
import { Party } from '../src/game/party.ts';

describe('player records', () => {
  const res = loadTestResources();
  const roster = new Roster(res.defaultRoster.slice());

  it('reads the shipped characters', () => {
    const t = roster.get(0);
    expect(t.exists).toBe(true);
    expect(t.name).toBe('Tatiana');
    expect(t.sex).toBe('F');
    expect(t.race).toBe('E');
    expect(t.classLetter).toBe('T');
    expect(t.status).toBe('G');
    expect(t.hitPoints).toBe(100);
    expect(t.maxHitPoints).toBe(100);
    expect(t.food).toBe(150);
    expect(t.gold).toBe(150);
    expect(t.level).toBe(1);
    expect(roster.get(1).name).toBe('Roderic');
  });

  it('handles hit points across the byte boundary', () => {
    const p = new PlayerRecord(new Uint8Array(64));
    p.bytes[28] = 1; // max 256 + 44 = 300
    p.bytes[29] = 44;
    p.hitPoints = 255;
    p.addHitPoints(10);
    expect(p.hitPoints).toBe(265);
    p.addHitPoints(1000);
    expect(p.hitPoints).toBe(300);
    expect(p.subtractHitPoints(299)).toBe(false);
    expect(p.hitPoints).toBe(1);
    p.status = 'G';
    expect(p.subtractHitPoints(1)).toBe(true);
    expect(p.status).toBe('D');
    expect(p.alive).toBe(false);
  });
});

describe('party record', () => {
  it('reads the default party', () => {
    const res = loadTestResources();
    const party = new Party(res.defaultParty.slice());
    expect(party.shape).toBe(0x7e);
    expect(party.size).toBe(4);
    expect(party.location).toBe(0);
    expect(party.surfaceX).toBe(42);
    expect(party.surfaceY).toBe(20);
    expect(party.memberSlot(0)).toBe(0);
    expect(party.memberSlot(3)).toBe(3);
    expect(party.formed).toBe(true);
    expect(party.exodusDestroyed).toBe(false);
  });

  it('carries the move counter across base-100 digits', () => {
    const party = new Party(new Uint8Array(64));
    party.size = 4;
    for (let i = 0; i < 30; i++) party.incrementMoves();
    expect(party.moves).toBe(120);
    expect(party.bytes[10]).toBe(20);
    expect(party.bytes[11]).toBe(1);
  });
});

describe('the party bag', () => {
  it("pools each member's gear on forming, keeping what is in hand, and deals it out on dispersing", async () => {
    const { newWorld } = await import('./helpers.ts');
    const world = newWorld();
    // A new game already pooled the default party: four daggers in hand, none spare.
    expect(world.party.weapons(1)).toBe(0);
    expect(world.member(0).bytes[48]).toBe(1);
    expect(world.member(0).bytes[49]).toBe(0);
    // Give members some gear the old way and pool it again.
    world.member(0).bytes[48 + 6] = 2; // two swords, none in hand
    world.member(1).bytes[48 + 6] = 1;
    world.member(1).bytes[48] = 6; // ... one of which is in hand
    world.member(2).bytes[40 + 3] = 1; // chain, not worn
    world.poolGear();
    expect(world.party.weapons(6)).toBe(2);
    expect(world.party.armour(3)).toBe(1);
    expect(world.member(1).bytes[48]).toBe(6);
    expect(world.member(1).bytes[48 + 6]).toBe(0);
    // Dispersing: the sword in hand stays with its owner, the rest go to members who can use them.
    world.splitGear();
    expect(world.member(1).bytes[48 + 6]).toBeGreaterThanOrEqual(1); // the one in hand, at least
    const swords = [0, 1, 2, 3].map((m) => world.member(m).bytes[48 + 6]);
    expect(swords.reduce((a, b) => a + b, 0)).toBe(3);
    expect(world.party.weapons(6)).toBe(0);
    for (let m = 0; m < 4; m++) if (world.member(m).bytes[40 + 3] === 1) expect(world.canUse(world.member(m), false, 3)).toBe(true);
  });
});
