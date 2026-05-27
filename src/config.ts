import os from "os";
import path from "path";

export interface Config {
  vaultPath: string;
  notesDir: string;
  watchInterval: number;
  captureInterval: number;
  windowTitle: string;
}

export const defaultConfig: Config = {
  vaultPath: path.join(os.homedir(), "Documents", "Obsidian"),
  notesDir: "notes",
  watchInterval: 2000,
  captureInterval: 500,
  windowTitle: "实时字幕",
};
