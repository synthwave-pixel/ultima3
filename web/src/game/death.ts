/**
 * death.ts
 *
 * What happens when the whole party is dead. A port of `CheckAllDead()`
 * from UltimaMain.c. The Apple II resurrected the party at Lord British's
 * castle with starting equipment; the Mac offered a dialog to stay dead.
 * This port offers a choice: go back to the last save (the game saves on
 * every town, castle and dungeon door), or take Lord British's mercy and
 * start over with nothing but daggers and cloth.
 */

import { World } from './world.ts';
import { Location } from './party.ts';
import { type GameIO, Sound, Music } from './io.ts';

const Msg = {
  AllOut: 109,
  Resurrecting: 249,
};

/**
 * If nobody in the party is alive, announce it, wait for a key, and rebuild
 * the party on Sosaria. Sets `world.resurrecting` so that combat and the
 * dungeon loops unwind back to the main loop.
 */
export async function checkAllDead(world: World, io: GameIO): Promise<void> {
  if ([0, 1, 2, 3].some((m) => world.memberAlive(m))) return;

  io.printMessage(Msg.AllOut);
  world.music = Music.None;
  io.music(Music.None);
  io.flushKeys();
  await io.waitKey();

  if (world.loadLastSave) {
    const choice = await io.chooseFromList(
      [
        { key: 'T', label: 'Try again from last save' },
        { key: 'F', label: 'Flee to Lord British, lose gear' },
      ],
      { row: 9, title: 'All players out!' },
    );
    if (choice !== 'F' && world.loadLastSave()) {
      // Back on the surface where the save was made, everything since undone.
      world.combat = null;
      world.timeNegate = 0;
      world.music = Music.Sosaria;
      io.music(Music.Sosaria);
      io.print('\n\n\n\n\n\n\n\n');
      io.showWind();
      io.updateStats(true);
      world.resurrecting = true;
      return;
    }
  }

  io.printMessage(Msg.Resurrecting);
  io.sound(Sound.BigDeath);
  await io.pause(1500);

  // The party starts over with 150 gold and at least 100 food per member (pooled).
  world.party.gold = 150 * world.party.size;
  world.party.food = Math.max(world.party.food, 100 * world.party.size);
  for (let m = 0; m < 4; m++) {
    if (world.party.memberSlot(m) < 0) continue;
    const p = world.member(m);
    p.bytes.fill(0, 35, 64); // gold (unused now), gems, keys, powders, armour, weapons
    p.torches = 0;
    p.bytes[40] = 1; // cloth armour worn
    p.bytes[48] = 1; // dagger in hand
    p.status = 'G';
    p.hitPoints = 100;
  }
  world.party.clearGear(); // the bag is lost too
  world.party.clearSupplies();
  world.combat = null;
  world.party.location = Location.Sosaria;
  world.party.shape = 0x7e;
  world.x = world.returnX = world.party.surfaceX = 42;
  world.y = world.returnY = world.party.surfaceY = 20;
  world.resetSosaria();
  world.timeNegate = 0;
  world.music = Music.Sosaria;
  io.music(Music.Sosaria);
  io.updateStats(true);
  io.print('\n\n\n\n\n\n\n\n');
  io.sound(Sound.BigDeath);
  world.resurrecting = true;
}
