# Changelog

## 0.1.0 - 2026-11-20
- Toolbar "Split view" menu: Add Right / Left / Top / Bottom Split via Zen's `createEmptySplit`; greyed on empty tabs.
- Control bar on every split pane: back, forward, reload, address field, copy link, site controls, pinned extensions, remove from split.
- Hides Zen's own split overlay, top address bar, back/forward/reload, pinned extensions and loading pill while a split is active.
- Per-pane loading line; page content sits below the bar.
- Picking a page that is already open reuses that tab; pinned tabs are split as a regular copy (and the copy is dropped if the pick is cancelled).
- Pane buttons are keyboard-operable and have accessible names; `javascript:` is refused in the pane address field.
- Menu icons are painted in the menu's real text colour, so they show on dark themes.
- The pane bar and its loading line follow each space's light/dark scheme, so they stay readable in light-themed spaces.
