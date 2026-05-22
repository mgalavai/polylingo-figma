# Polylingo Figma

A Figma plugin for binding localized string keys to text layers and applying uploaded JSON translations to the selected frame.

## Features

- Import a JSON language map
- Create and download a starter JSON template from inside the plugin
- Switch languages and apply translations to bound text layers
- Bind and unbind string keys to Figma text nodes
- Track bound and unbound text layers per frame
- Search and filter by key, text, missing translations, binding state, and quality checks
- Edit translations locally during a plugin session

## JSON Format

Upload either a direct language map:

```json
{
  "en": { "login_button": "Log in" },
  "sv": { "login_button": "Logga in" }
}
```

Or an object with explicit metadata:

```json
{
  "baseLang": "en",
  "translations": {
    "en": { "login_button": "Log in" },
    "sv": { "login_button": "Logga in" }
  }
}
```

The template wizard creates the metadata form and imports it automatically after download.

## Development

Install dependencies:

```bash
pnpm install
```

Build the Figma plugin UI:

```bash
pnpm build:plugin-ui
```

Run the plugin in Figma:

1. Open Figma desktop.
2. Go to Plugins > Development > Import plugin from manifest.
3. Select `manifest.json`.
4. Run the plugin and import or create a JSON translation file.

## Project Structure

- `code.js`: Figma controller, selection handling, binding, and text application
- `figma-translation-plugin.tsx`: React UI for importing strings, creating templates, browsing translations, and binding keys
- `plugin-ui.tsx`: React mount entry point
- `build-plugin-ui.mjs`: Bundles the UI into `dist/ui.html`
- `manifest.json`: Figma plugin manifest

## Notes

This version does not connect to Bitbucket or any external translation API. All string data is loaded from user-provided JSON files or the built-in template wizard.
