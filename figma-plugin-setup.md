# Figma Plugin Setup Guide

## Local Development

Install dependencies:

```bash
pnpm install
```

Build the plugin UI:

```bash
pnpm build:plugin-ui
```

The build writes an ignored `dist/ui.html` file that is referenced by `manifest.json`.

## Manifest

The plugin does not require network access. Keep the manifest local-only:

```json
{
  "name": "polylingo",
  "api": "1.0.0",
  "main": "code.js",
  "ui": "dist/ui.html",
  "capabilities": [],
  "enableProposedApi": false,
  "documentAccess": "dynamic-page",
  "editorType": ["figma"]
}
```

## Testing in Figma

1. Open Figma desktop.
2. Go to Plugins > Development > Import plugin from manifest.
3. Select `manifest.json` from this repo.
4. Run the plugin.
5. Select a frame, import or create JSON strings, bind keys to text layers, and switch languages.

## JSON Format

The UI accepts JSON language maps, either `{ "en": { ... }, "sv": { ... } }` or `{ "baseLang": "en", "translations": { ... } }`.

## Troubleshooting

- If the UI does not load, rebuild with `pnpm build:plugin-ui` and re-import the manifest.
- If import fails, verify that the selected file is valid JSON and contains at least one language map.
- If text does not update, make sure the selected Figma node is a text layer and its font can be loaded by the plugin.
