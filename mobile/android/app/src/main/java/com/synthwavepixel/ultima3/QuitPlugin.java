package com.synthwavepixel.ultima3;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Quit on the game's title menu. A page cannot close the app that holds it, so the game calls this: Capacitor
 * shows it to the page as window.Capacitor.Plugins.Quit, and the game offers Quit only when it finds it there.
 * Quitting ends the activity and takes it out of Recents, as a handheld player leaving a game expects.
 */
@CapacitorPlugin(name = "Quit")
public class QuitPlugin extends Plugin {
  @PluginMethod
  public void quit(PluginCall call) {
    call.resolve();
    getActivity().runOnUiThread(() -> getActivity().finishAndRemoveTask());
  }
}
