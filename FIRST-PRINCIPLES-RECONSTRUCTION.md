# First-Principles Reconstruction: live-captions-to-obsidian

> Applied Elon Musk's first-principles thinking: break to fundamental truths, rebuild from zero.

## Core Problem

Capture Windows 11 Live Captions text and save as timestamped notes in Obsidian.

## First Principles Breakdown

1. Captions are already text on screen — extraction, not generation
2. Obsidian notes are just Markdown files in a folder
3. User cares about: captured text, timestamp, file location
4. Localhost needs no security
5. Background process, no UI needed for core function

## Essential Features

| P0 | Capture Live Captions text (Accessibility API or OCR) |
| P0 | Save as timestamped Markdown to Obsidian vault |
| P0 | Session isolation (new file per session/day) |
| P1 | Hotkey start/stop |
| P1 | Status indicator |
| P2 | WebVTT/SRT export |

## Reconstruction Blueprint

Day 1: Single script ~200 lines. 4 files total. Delete Hono, delete monorepo, delete adapters, delete ASR pipeline.

## Musk's Razor

Delete 87% of code (~4,000 lines → ~500). Ship same user value.
