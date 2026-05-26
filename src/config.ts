export interface Config {
  vaultPath: string;
  notesDir: string;
  watchInterval: number;
  captureInterval: number;
  windowTitle: string;
}

export const defaultConfig: Config = {
  vaultPath: "C:\\Users\\lenovo\\Documents\\Obsidian\\explorer",
  notesDir: "notes",
  watchInterval: 2000,
  captureInterval: 500,
  windowTitle: "实时字幕",
};
