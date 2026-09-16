/**
 * game.ts
 *
 * The main game loop: a port of `Game()` in UltimaMain.c.
 *
 * Each iteration redraws the map, waits for a key (or times out and passes
 * the turn), dispatches the command, then runs the end-of-turn processing.
 * Because the browser cannot block, the loop is an `async` function that
 * awaits the keyboard; while it waits the renderer keeps animating.
 */

import { World } from './world.ts';
import { Location } from './party.ts';
import { MapValue, Shape } from './tiles.ts';
import { type GameIO, Key, Sound, Music } from './io.ts';
import { endTurn, whirlpoolTick, exitToSurface, type TurnHooks } from './turn.ts';
import * as cmd from './commands.ts';
import * as act from './actions.ts';
import * as interact from './interact.ts';
import { attackMonster, showBall } from './combat.ts';
import { cast, quickHeal, quickSafeChest, quickLight } from './spells.ts';
import { QUICK_CAST_KEY, SAFE_CHEST_KEY, LIGHT_KEY, VIEW_MAP_KEY } from './context.ts';
import { journalCheck } from './journal.ts';
import { runDungeon } from './dungeon.ts';
import { checkAllDead } from './death.ts';
import { MapId } from '../data/resources.ts';

/** How long the game waits for a key before passing the turn automatically (the original: ~5 seconds). */
export const IDLE_PASS_MS = 5000;
/** The original polled the whirlpool roughly every twelfth of a second. */
const WHIRLPOOL_TICK_MS = 83;

const Msg = {
  Descend: 32,
  Klimb: 68,
  QuitAndSave: 76,
  OnlySurface: 77,
  Moves: 78,
} as const;

export interface GameOptions {
  /**
   * Called when the player presses Q on the surface, and by the autosave
   * at every town, castle and dungeon door. Return true if the game was saved. (`QuitSave`)
   */
  save?: (world: World) => boolean;
  /** Restore the last save into the world; true if there was one. Offered after a party wipe. */
  load?: (world: World) => boolean;
}

export class Game {
  private readonly hooks: TurnHooks;

  constructor(
    public readonly world: World,
    public readonly io: GameIO,
    private readonly options: GameOptions = {},
  ) {
    this.hooks = {
      attack: (i) => attackMonster(world, io, i),
      bombTrap: () => act.bombTrap(world, io),
      showBall: (vx, vy) => showBall(world, io, world.constrain(world.x - 5 + vx), world.constrain(world.y - 5 + vy), Shape.FireBall),
      goWhirlpool: () => this.goWhirlpool(),
      dungeonTurn: async () => {},
      save: () => this.autosave(),
    };
  }

  /** Music for the party's current location. */
  private locationMusic(): number {
    switch (this.world.party.location) {
      case Location.Town:
        return Music.Town;
      case Location.Castle:
        return this.world.inExodusCastle() ? Music.ExodusCastle : Music.Castle;
      case Location.Ambrosia:
        return Music.Ambrosia;
      default:
        return Music.Sosaria;
    }
  }

  private setMusic(track: number): void {
    this.world.music = track;
    this.io.music(track);
  }

  /** Run until `world.done` is set (Quit). Mirrors the `while (!gDone)` loop in `Game()`. */
  async run(): Promise<void> {
    const { world, io } = this;
    world.done = false;
    world.timeNegate = 0;
    io.showGameFrame();
    io.updateStats(true);
    io.showWind();
    io.showMoons();
    this.setMusic(this.locationMusic());
    world.loadLastSave = this.options.load ? () => this.options.load!(world) : null;
    this.autosave(); // so "last save" always exists once the journey starts

    while (!world.done) {
      io.redrawMap();
      io.updateStats();
      world.resurrecting = false;
      await checkAllDead(world, io);
      if (world.done) return;
      io.prompt();

      const key = await this.waitForCommand();
      if (world.done) return;
      if (key === Key.Escape) {
        await io.showSettings(); // no turn passes
        continue;
      }
      if (key === 'J' || key === 'j') {
        await io.showJournal(); // no turn passes
        continue;
      }
      if (key === VIEW_MAP_KEY && world.party.location !== Location.Ambrosia) {
        await io.showMap(); // no turn passes
        continue;
      }
      await this.dispatch(key);
      if (world.done) return;
      await endTurn(world, io, this.hooks);
      const wanted = this.locationMusic();
      if (world.music !== wanted && world.party.location !== Location.Combat) this.setMusic(wanted);
    }
  }

  /**
   * Wait for a key while the whirlpool keeps moving. After the idle time
   * (IDLE_PASS_MS under the Fast timer) with no input the turn passes by
   * itself, as on the Apple II; with the timer off it never does.
   */
  private async waitForCommand(): Promise<string> {
    const limit = this.world.timeLimit(IDLE_PASS_MS);
    const deadline = limit === undefined ? Infinity : performance.now() + limit;
    for (;;) {
      await whirlpoolTick(this.world, this.io, this.hooks);
      const remaining = deadline - performance.now();
      if (remaining <= 0) return Key.Space;
      const key = await this.io.waitCommand('field', Math.min(WHIRLPOOL_TICK_MS, remaining));
      if (key !== null) return key;
    }
  }

  /**
   * Silent save at the doors of towns, castles and dungeons (and when the
   * journey starts). The surface is what gets saved, at the door's square,
   * so a reload after a wipe puts the party back outside.
   */
  private autosave(): boolean {
    if (this.world.resurrecting) return false;
    return this.options.save?.(this.world) ?? false;
  }

  /** Save at a door and say so under the "Enter town!" line. */
  private announceSave(): void {
    if (this.autosave()) this.io.print('(saved)\n');
  }

  /** Mirrors the key switch in `Game()` and `LetterCommand()`. */
  async dispatch(key: string): Promise<void> {
    const { world, io } = this;
    if (!world.diagonalMoves && cmd.DIAGONAL_KEYS.includes(key)) return; // no diagonals on the Apple II
    const moveName = cmd.moveForKey(key, world.diagonalMoves);
    if (moveName) {
      const bump = await cmd.move(world, io, moveName);
      if (!bump) return;
      // Walking into things does what a player would have typed next.
      switch (bump.kind) {
        case 'person': {
          // Talk with the first living member; Lord British sees whoever is due a level.
          let speaker = [0, 1, 2, 3].find((m) => world.memberAlive(m)) ?? 0;
          if (world.monsters.type(bump.index) === MapValue.LordBritish) {
            speaker = await interact.whoSeesLordBritish(world, io);
            if (speaker < 0) return;
          }
          return interact.talkTo(world, io, bump.index, speaker);
        }
        case 'monster':
          io.print('Attack\n');
          return interact.attackToward(world, io, bump.dx, bump.dy);
        case 'counter':
          return interact.transactToward(world, io, bump.dx, bump.dy);
        case 'door':
          io.print('Unlock\n');
          return interact.unlockToward(world, io, bump.dx, bump.dy);
      }
    }
    switch (key.toUpperCase()) {
      case ' ':
        return cmd.pass(io);
      case 'A':
        return interact.attack(world, io);
      case 'B':
        return cmd.board(world, io);
      case 'C':
        await cast(world, io);
        return;
      case QUICK_CAST_KEY:
        if (!(await quickHeal(world, io))) cmd.what2(io);
        return;
      case SAFE_CHEST_KEY:
        if (!(await quickSafeChest(world, io))) cmd.what2(io);
        return;
      case LIGHT_KEY:
        if (!(await quickLight(world, io))) cmd.what2(io);
        return;
      case 'D':
        io.printMessage(Msg.Descend);
        return cmd.what2(io);
      case 'E':
        return this.enter();
      case 'F':
        return interact.fire(world, io);
      case 'G':
        return act.getChest(world, io, 0, 'command');
      case 'I':
        return act.igniteTorch(world, io);
      case 'K':
        io.printMessage(Msg.Klimb);
        return cmd.what2(io);
      case 'L':
        return cmd.look(world, io);
      case 'M':
        return act.modifyOrder(world, io);
      case 'N':
        return act.negateTime(world, io);
      case 'O':
        return interact.otherCommand(world, io);
      case 'P':
        return act.peerGem(world, io);
      case 'Q':
        return this.quit();
      case 'R':
        return act.readyWeapon(world, io);
      case 'S':
        return interact.steal(world, io);
      case 'T':
        return interact.transact(world, io);
      case 'U':
        return interact.unlock(world, io);
      case 'V':
        return act.volume(world, io);
      case 'W':
        return act.wearArmour(world, io);
      case 'X':
        return cmd.exit(world, io);
      case 'Y':
        return interact.yell(world, io);
      case 'Z':
        return act.stats(world, io);
      default:
        // Unknown keys are ignored but still cost a turn, as in the original.
        return;
    }
  }

  /** E: enter a place. Dungeons and shrines have their own loops. */
  private async enter(): Promise<void> {
    const { world, io } = this;
    const entered = cmd.enter(world, io);
    switch (entered) {
      case 'shrine':
        await interact.enterShrine(world, io);
        return;
      case 'dungeon':
        this.announceSave();
        await runDungeon(world, io);
        if (world.resurrecting || world.done) return;
        exitToSurface(world, io, this.hooks);
        io.showGameFrame();
        io.updateStats(true);
        io.showMoons();
        return;
      case 'castle':
        // Once Exodus is destroyed his castle stands empty and harmless.
        if (world.current.id === MapId.ExodusCastle && world.party.exodusDestroyed) interact.safeExodus(world);
        this.setMusic(this.locationMusic());
        this.announceSave();
        return;
      case 'town':
        this.setMusic(this.locationMusic());
        this.announceSave();
        return;
      default:
        return;
    }
  }

  /** Q: save (only on the surface) and return to the main menu. (`QuitSave`) */
  private quit(): void {
    const { world, io } = this;
    io.printMessage(Msg.QuitAndSave);
    if (!world.onSurface) {
      io.printMessage(Msg.OnlySurface);
      io.sound(Sound.Error1);
      return;
    }
    world.party.surfaceX = world.x;
    world.party.surfaceY = world.y;
    const saved = this.options.save?.(world) ?? false;
    io.print(`${world.party.moves}`);
    io.printMessage(Msg.Moves);
    if (!saved) io.print('(not saved)\n');
    world.done = true;
  }

  /**
   * The whirlpool caught the party. On Sosaria it carries them to Ambrosia;
   * on Ambrosia it brings them home. Mirrors `GoWhirlPool()`.
   */
  private async goWhirlpool(): Promise<void> {
    const { world, io } = this;
    world.party.shape = cmd.PartyShape.Whirlpool;
    io.redrawMap();
    io.printMessage(256);
    this.setMusic(Music.None);
    io.sound(Sound.Sink);
    await io.pause(3000);

    if (world.onSurface) {
      world.party.surfaceX = world.x;
      world.party.surfaceY = world.y;
      world.putXYVal(MapValue.Water, world.x, world.y);
      world.whirlpool.x = 2;
      world.whirlpool.y = 0x3e;
      world.party.shape = cmd.PartyShape.Frigate;
      io.clearTiles();
      io.printMessage(257);
      world.enterMap(421);
      await io.pause(3000);
      world.party.shape = cmd.PartyShape.OnFoot;
      world.x = 32;
      world.y = 54;
      world.party.location = Location.Ambrosia;
      io.printMessage(258);
      this.setMusic(Music.Ambrosia);
      world.journal.ambrosia = true;
      journalCheck(world, io);
    } else if (world.party.location === Location.Ambrosia) {
      world.returnToSurface();
      io.printMessage(114);
      io.clearTiles();
      io.printMessage(115);
      world.x = world.party.surfaceX;
      world.y = world.party.surfaceY;
      world.party.location = Location.Sosaria;
      world.party.shape = cmd.PartyShape.Frigate;
      this.setMusic(Music.Sosaria);
    } else {
      // In a town or castle: dropped on a random water square.
      let value = 0xff;
      while (value !== MapValue.Water) {
        world.x = world.rng.range(0, world.mapSize - 1);
        world.y = world.rng.range(0, world.mapSize - 1);
        value = world.getXYVal(world.x, world.y);
      }
      this.setMusic(this.locationMusic());
    }
    io.redrawMap();
    io.prompt();
  }
}
