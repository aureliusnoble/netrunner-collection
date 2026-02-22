# Netrunner Deck Set Analyzer

A React/TypeScript web app that connects to the NetrunnerDB API to help Netrunner players find compatible sets of decks from their card collection.

## Features

- **Collection Manager**: Select NSG products you own with quantities, plus manually add individual cards
- **Deck Set Search**: Find valid combinations of N decks where card usage across all decks fits within your collection
- **Missing Card Tolerance**: Allow a configurable number of missing cards and see exactly which cards are needed
- **Faction Filtering**: Specify which faction each deck slot should be (e.g., "one Corp deck from each faction")

## Setup

```bash
npm install
npm run dev
```

## Deployment

The app deploys to GitHub Pages via the included GitHub Actions workflow. Enable GitHub Pages in repo settings with source set to "GitHub Actions".

## Tech Stack

- Vite + React + TypeScript
- Tailwind CSS v4
- NetrunnerDB v3 API
