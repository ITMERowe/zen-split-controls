# Split Controls

Arc-style split view for [Zen Browser](https://zen-browser.app).

- **Split view menu** in the toolbar: Add Right / Left / Top / Bottom Split. Each item starts Zen's own
  "pick a tab" prompt (`createEmptySplit`), the same one used when you drop a tab on a pane edge.
  The menu is greyed out on an empty tab.
- **A control bar on every split pane**: back, forward, reload, an address field (type a URL or a search),
  copy link, Zen's site-controls panel, your pinned extensions (uBlock etc.), and a button that removes
  the pane from the split. Extension and site-controls popups open under the pane's own button.
- **A loading line** along the bottom of each pane's address field.
- While a split is active, Zen's own overlay (drag handle, unsplit button), top address bar, top
  back/forward/reload, pinned extensions and loading pill are hidden, because every pane has its own.
- Picking a page that is already open uses that tab. A pinned tab cannot be split by Zen, so it is split
  as a regular copy.

## Requirements

- [Sine](https://github.com/CosmoCreeper/Sine) (this mod ships JavaScript).
- Tested on Zen 1.24.3b only. It uses private Zen/Firefox internals, so a newer Zen may break parts of it;
  if the split menu's internals are missing, the button greys out instead of failing.

## Known limits

- Zen's drag handle for rearranging panes is not replaced; drag a tab onto a pane edge instead.
- An extension's toolbar icon shows the state of the selected tab, so a copy on another pane can show a
  stale icon until you select that pane.
