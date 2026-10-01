# TabChute

**English** | [日本語](README.ja.md)

Save a collection of websites and open them together in a fresh browser tab group. Built for desktop Chrome with Manifest V3, TypeScript and Bun.

## Demo

https://github.com/user-attachments/assets/98b72bd2-4b7d-4679-a5ca-f60f5ae1ef3b

## Local installation

```sh
bun install --frozen-lockfile
bun run check
```

1. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose this project's `dist/` folder.
4. Pin TabChute to the toolbar, open its popup and select **New group**.

Create a group, pick a color and add full `https://` or `http://` URLs. Drag the grip or use the arrow buttons to reorder sites, then save. **Open** always creates a new group in the window where you clicked it. Editing or deleting a template never modifies already-open tabs.

The editor opens in its own tab. Changes are saved only when you select **Save group**. If another editor changed the same template, reload the editor to get the saved version before trying again. Closing an unsaved editor prompts before discarding changes.

Light and dark colors follow your OS setting. A site's favicon comes from the browser's favicon service; a generic icon is shown when no custom image is available. Site labels are optional and used only inside the editor, not as browser tab titles.

## Development

```sh
bun run dev        # rebuild when src/ or static/ changes
bun run typecheck  # TypeScript check
bun test           # model and service tests
bun run build      # self-contained extension in dist/
```

After a rebuild, reload TabChute on the extensions page and reopen its popup/editor. `dist/` contains only extension runtime files; Bun and Node are not needed to run the extension. `bun.lock` pins development dependencies. Icons are checked in; regenerate with `python3 scripts/icons.py` only when changing their design.

### Browser integration checks

```sh
bunx playwright install chromium
bun run test:browser
```

This runs the actual extension in an isolated, temporary Chrome for Testing profile and, when installed, a Brave profile. It tests editing, validation, ordering, stale-edit rejection, opening/grouping, repeated opens, completion after the initiating page closes, template deletion without closing browser tabs, and persistence after a browser restart. Light/dark screenshots are written to `test-results/`.

Set `BRAVE_PATH` to your Brave executable if it is not in the default location. The runner never touches your regular browser profiles.

For toolbar-specific manual verification, click **Open**, close the popup immediately and reopen it. Confirm that its result is shown, the group has the configured name/color, it is expanded, and the first site is active. Test dragging, keyboard color selection, visible focus, and the OS theme switch. Network errors and HTTP status codes are handled by the browser; TabChute reports failures to create tabs, not website availability.

## Architecture

- `src/model.ts`: shared types, URL and storage validation.
- `src/service.ts`: serial template writes, revision conflict checks and background tab-opening jobs; browser API adapter for test isolation.
- `src/background.ts`: extension-only message dispatcher, registered synchronously at worker startup.
- `src/popup.ts` / `src/editor.ts`: DOM-based UI; no framework or remote runtime dependencies.
- `static/`: manifest, accessible HTML, shared theme styles and icons.
- `scripts/build.ts`: browser-target ESM bundles plus static assets.

Templates live under `tabchuteData` in `chrome.storage.local`, with `schemaVersion: 1`. Unknown versions or invalid data fail safely without overwriting existing templates. New data starts empty; the original planning JSON was a design sketch and has no legacy implementation to migrate.

Only the latest opening job is stored in `chrome.storage.session`. It remains visible across popup closes and worker restarts within a browser session. If a worker stops unexpectedly, the next request marks the unfinished job as interrupted; there is no automatic retry. Created tabs are retained on failure. Browser restart clears job results and retains templates. Tab/session restoration follows browser settings.

## Future store distribution

The same `dist/` folder can be packaged for the Chrome Web Store and installed in either browser. Before a release, update `package.json` and `static/manifest.json` versions together, run the checks, and create a ZIP with `manifest.json` at its root. The manifest includes 16/32/48/128px icons and a restrictive extension-page CSP.

A store submission still needs final listing copy, screenshots, privacy declarations and a published privacy-policy URL as required by the store. See [PRIVACY.md](PRIVACY.md) for the current data and permission behavior. No store submission or publishing is performed by this project.

Initial scope: normal desktop windows, local per-browser/per-profile storage. Incognito, cloud sync, import/export, reuse of existing browser groups and window selection are not included.
