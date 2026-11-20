// Split Controls: an Arc-style "Add Split" toolbar menu, plus a control bar on every split pane.
// It relies on a few private Zen/Firefox internals (named where used). Tested on Zen 1.24.3b.
(() => {
  const ID = "zen-split-menu-button";
  const parent = document.getElementById("nav-bar-customization-target");
  if (!parent || document.getElementById(ID)) return;

  // Tab-matching helpers (no browser objects in here).
  // Same page? Ignore a trailing slash, keep the #fragment (single-page apps use it for different views).
  const normUrl = s => {
    try {
      const u = new URL(s);
      if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/$/, "");
      return u.href;
    } catch {
      return s;
    }
  };
  const sameUrl = (a, b) => normUrl(a) === normUrl(b);
  // The already-open tab a picked result refers to. Prefer a regular tab over a pinned one: Zen cannot
  // split a pinned tab, so a pinned match would have to be copied.
  const pickMatch = (tabs, url, origin, workspace) => {
    const matches = tabs.filter(
      t =>
        t !== origin &&
        !t.hasAttribute("zen-empty-tab") &&
        (t.getAttribute("zen-workspace-id") === workspace || t.hasAttribute("zen-essential")) &&
        t.linkedBrowser?.currentURI &&
        sameUrl(t.linkedBrowser.currentURI.spec, url)
    );
    return matches.find(t => !t.pinned) || matches[0] || null;
  };

  // 16x16 menu icon: a thin rounded frame with a panel on the chosen side (one group opacity, so the
  // overlap is not shaded twice).
  const icon = ([x, y, w, h], fill = "context-fill") =>
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="${fill}">` +
        `<g opacity="0.5"><path fill-rule="evenodd" d="M4.5 2h7A2.5 2.5 0 0 1 14 4.5v7a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 2 11.5v-7A2.5 2.5 0 0 1 4.5 2zm0 1.2a1.3 1.3 0 0 0-1.3 1.3v7a1.3 1.3 0 0 0 1.3 1.3h7a1.3 1.3 0 0 0 1.3-1.3v-7a1.3 1.3 0 0 0-1.3-1.3z"/>` +
        `<clipPath id="c"><rect x="2.7" y="2.7" width="10.6" height="10.6" rx="1.8"/></clipPath>` +
        `<rect clip-path="url(#c)" x="${x}" y="${y}" width="${w}" height="${h}"/></g></svg>`
    );
  // Zen's own icon files (the ones its toolbar uses); they take their colour from the CSS fill.
  const zenIcon = name => `url("chrome://browser/skin/zen-icons/${name}.svg")`;
  const items = [
    ["right", "Add Right Split", [8, 2, 6, 12]],
    ["left", "Add Left Split", [2, 2, 6, 12]],
    ["top", "Add Top Split", [2, 2, 12, 6]],
    ["bottom", "Add Bottom Split", [2, 8, 12, 6]],
  ];

  const canSplit = typeof gZenViewSplitter?.createEmptySplit === "function";
  const fail = err => console.error("[zen-split-controls]", err);

  // --- State shared between the menu, the address-bar patch and the close handler ---------------
  let pending = false; // a split pick is in progress
  let before = new Set(); // tabs that existed when the pick started
  let originTab = null; // the tab the split started from
  let pickedExisting = null; // already-open tab matching the picked result (set by the pick patch)
  let splitSource = null; // pinned starting tab, when we split from a copy of it...
  let splitCopy = null; // ...and that copy

  // Zen's tab picker refuses pinned/essential tabs (essentials have no workspace id), while its own
  // drag-and-drop path copies them first. Do the same: split with a regular copy. Resolves with the
  // copy (or null) once it is really selected: the tab switch lands asynchronously, and a switch while
  // the picker is open makes Zen close the picker and cancel the split.
  const copyIfPinned = tab => {
    if (!tab.pinned) return Promise.resolve(null);
    const copy = gBrowser.duplicateTab(tab, true);
    return new Promise(resolve => {
      const onSelect = e => e.target === copy && done();
      const done = () => {
        gBrowser.tabContainer.removeEventListener("TabSelect", onSelect);
        setTimeout(() => resolve(copy), 100);
      };
      gBrowser.tabContainer.addEventListener("TabSelect", onSelect);
      gBrowser.selectedTab = copy;
      setTimeout(done, 1500); // fallback if TabSelect never arrives
    });
  };

  // Runs before Zen's own listener (registered later), so it can fix up the selection first.
  window.addEventListener("ZenURLBarClosed", e => {
    try {
      if (pending && e.detail.onElementPicked) {
        if (pickedExisting?.linkedBrowser) {
          // The pick opened a second copy of a page that is already open: swap it for the existing tab.
          const copy = gBrowser.selectedTab;
          gBrowser.selectedTab = pickedExisting;
          if (copy !== pickedExisting && !copy.hasAttribute("zen-empty-tab") && !copy.pinned && !before.has(copy)) {
            gBrowser.removeTab(copy);
          }
        }
        copyIfPinned(gBrowser.selectedTab); // a pinned tab picked as the second pane
      } else if (pending && splitCopy) {
        // Picker cancelled: drop the copy made of the pinned starting tab and go back to the original.
        const [source, copy] = [splitSource, splitCopy];
        setTimeout(() => {
          if (!copy.closing && !copy.hasAttribute("split-view")) {
            gBrowser.selectedTab = source;
            gBrowser.removeTab(copy);
          }
        }, 300); // after Zen's own clean-up of the cancelled split
      }
    } catch (err) {
      fail(err);
    }
    pending = false;
    pickedExisting = null;
    splitSource = splitCopy = null;
  });

  // While the picker is open the current tab is Zen's empty placeholder, so Firefox opens any picked page
  // in a NEW tab, even one that is already open. Remember which open tab matches the picked result; the
  // handler above swaps the copy for it. Patched on its own, so if a future Firefox/Zen drops
  // pickResult only this fix is lost, not the whole mod.
  const patchPick = () => {
    if (typeof gURLBar?.pickResult !== "function") return;
    const orig = gURLBar.pickResult.bind(gURLBar);
    gURLBar.pickResult = args => {
      const url = args?.result?.payload?.url;
      const wanted = pending && url && gURLBar.hasAttribute("zen-newtab") && !args.element?.dataset.command;
      pickedExisting = wanted
        ? pickMatch([...gBrowser.tabs], url, originTab, originTab?.getAttribute("zen-workspace-id"))
        : null;
      return orig(args);
    };
  };

  const addSplit = side => {
    // Zen's own command also waits a tick; calling while the menu closes steals focus from the
    // address bar, and Zen only reports the pick if the bar is still focused.
    setTimeout(async () => {
      try {
        const source = gBrowser.selectedTab;
        const copy = await copyIfPinned(source);
        splitSource = copy ? source : null;
        splitCopy = copy;
        pending = true;
        before = new Set(gBrowser.tabs);
        originTab = gBrowser.selectedTab;
        gZenViewSplitter.createEmptySplit(side);
      } catch (err) {
        fail(err);
      }
    }, 100);
  };

  // --- Toolbar menu -------------------------------------------------------------------------------
  const button = document.createXULElement("toolbarbutton");
  button.id = ID;
  button.setAttribute("type", "menu");
  button.setAttribute("class", "toolbarbutton-1");
  button.setAttribute("label", "Split view");
  button.setAttribute("tooltiptext", canSplit ? "Split view" : "Split view (not supported by this Zen version)");

  const popup = document.createXULElement("menupopup");
  const title = document.createXULElement("menuitem");
  title.setAttribute("label", "Split View Controls");
  title.setAttribute("disabled", "true");
  popup.appendChild(title);
  for (const [side, label, panel] of items) {
    const item = document.createXULElement("menuitem");
    item.setAttribute("class", "menuitem-iconic");
    item.setAttribute("label", label);
    item.panel = panel;
    item.setAttribute("image", icon(panel));
    item.addEventListener("command", () => addSplit(side));
    popup.appendChild(item);
  }
  // A popup menu does not pass the theme's text colour on to context-fill, so the icons come out black
  // on a dark theme. Each time the menu opens, repaint them in the menu's real text colour.
  popup.addEventListener("popupshowing", () => {
    for (const item of popup.querySelectorAll("menuitem.menuitem-iconic")) {
      item.setAttribute("image", icon(item.panel, getComputedStyle(item).color));
    }
  });
  button.appendChild(popup);
  parent.appendChild(button);

  try {
    patchPick();
  } catch (err) {
    fail(err);
  }

  // --- Control bar on every split pane --------------------------------------------------------------
  // Takes one pane out of its split and keeps the other pane(s) on screen. Zen's own handler selects the
  // removed tab; shiftKey makes it leave the selection alone, then we select a remaining tab. The removed
  // tab stays open as a normal tab.
  const removePane = container => {
    if (typeof gZenViewSplitter?.removeTabFromSplit !== "function") return;
    const tab = gBrowser.getTabForBrowser(container.querySelector("browser"));
    const group = gZenViewSplitter._data.find(g => g.tabs.includes(tab));
    const other = group?.tabs.find(t => t !== tab);
    gZenViewSplitter.removeTabFromSplit({ shiftKey: true }, container);
    if (other) gBrowser.selectedTab = other;
  };

  // Pane buttons are plain divs (no built-in toolbar-button styling), so give them button behaviour:
  // role, keyboard focus, Enter/Space, and a name for screen readers.
  const paneButton = (label, fn) => {
    const b = document.createElement("div");
    b.className = "zsc-btn";
    b.setAttribute("role", "button");
    b.setAttribute("tabindex", "0");
    b.setAttribute("aria-label", label);
    b.title = label;
    const run = e => !b.hasAttribute("disabled") && fn(e);
    b.addEventListener("click", run);
    b.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        run(e);
      }
    });
    return b;
  };
  const iconButton = (name, label, fn) => {
    const b = paneButton(label, fn);
    b.style.backgroundImage = zenIcon(name);
    return b;
  };
  const setDisabled = (b, on) => {
    b.toggleAttribute("disabled", on);
    b.setAttribute("aria-disabled", on);
  };

  // Select this pane's tab first so the toolbar action that follows applies to it.
  const selectPane = async container => {
    const tab = gBrowser.getTabForBrowser(container.querySelector("browser"));
    if (gBrowser.selectedTab !== tab) {
      gBrowser.selectedTab = tab;
      await new Promise(r => setTimeout(r, 150));
    }
  };

  // A popup opens under the toolbar button it belongs to, which is hidden up in the toolbar. So park that
  // button (position: relative, no layout change) right under the pane's own button while the popup is
  // open, then put it back.
  const popupFrom = async (container, own, orig, activate) => {
    await selectPane(container);
    const o = orig.getBoundingClientRect();
    const p = own.getBoundingClientRect();
    orig._zscSaved ??= [orig.style.position, orig.style.left, orig.style.top]; // keep the true original
    const restore = () => {
      if (!orig._zscSaved) return;
      [orig.style.position, orig.style.left, orig.style.top] = orig._zscSaved;
      orig._zscSaved = null;
      window.removeEventListener("popuphidden", onHidden, true);
    };
    const onHidden = e => e.target.localName === "panel" && restore();
    orig.style.position = "relative";
    orig.style.left = `${p.left + p.width / 2 - (o.left + o.width / 2)}px`;
    orig.style.top = `${p.top + p.height / 2 - (o.top + o.height / 2)}px`;
    window.addEventListener("popuphidden", onHidden, true);
    setTimeout(restore, 60000); // safety net if the popup never reports closing
    activate();
  };

  // Per-pane copies of the toolbar's pinned extension buttons (uBlock etc.). Clicking one selects this
  // pane's tab first, so the extension acts on it, then clicks the original (hidden) button for its popup.
  const EXT = "#nav-bar-customization-target > .unified-extensions-item";
  const ACTION = ".unified-extensions-item-action-button";
  const syncExts = (bar, container) => {
    const found = [...document.querySelectorAll(EXT)];
    for (const el of [...bar.exts.children]) {
      if (!found.some(i => i.id === el.dataset.id)) el.remove();
    }
    for (const item of found) {
      const action = item.querySelector(ACTION);
      const iconEl = item.querySelector(".toolbarbutton-icon");
      if (!action || !iconEl) continue;
      let b = [...bar.exts.children].find(el => el.dataset.id === item.id);
      if (!b) {
        b = paneButton("", () => {
          const live = document.getElementById(b.dataset.id);
          if (live) popupFrom(container, b, live, () => live.querySelector(ACTION)?.click());
        });
        b.classList.add("zsc-ext");
        b.dataset.id = item.id;
        bar.exts.append(b);
      }
      const label = action.getAttribute("tooltiptext") || action.label || "";
      b.title = label;
      b.setAttribute("aria-label", label);
      const img = getComputedStyle(iconEl).listStyleImage;
      b.style.backgroundImage = img !== "none" ? img : iconEl.src ? `url("${iconEl.src}")` : "";
    }
  };

  const makeBar = container => {
    const browserOf = () => container.querySelector("browser");
    const bar = document.createElement("div");
    bar.className = "zsc-bar";
    bar.back = iconButton("back", "Back", () => browserOf().goBack());
    bar.forward = iconButton("forward", "Forward", () => browserOf().goForward());
    bar.reload = iconButton("reload", "Reload", () => browserOf().reload());

    // Address field for this pane: shows the host, the full URL while focused; Enter loads it.
    const field = (bar.label = document.createElement("input"));
    field.className = "zsc-label";
    field.spellcheck = false;
    field.setAttribute("aria-label", "Address");
    field.addEventListener("focus", () => {
      field.value = browserOf().currentURI.spec;
      field.select();
    });
    field.addEventListener("blur", () => {
      field.value = browserOf().currentURI?.host || "";
    });
    field.addEventListener("keydown", e => {
      if (e.key === "Escape") field.blur();
      const text = field.value.trim();
      // Typed text is loaded with full privileges, so refuse javascript: (the usual paste trick).
      if (e.key !== "Enter" || !text || /^javascript:/i.test(text)) return;
      browserOf().fixupAndLoadURIString(text, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      gBrowser.selectedTab = gBrowser.getTabForBrowser(browserOf());
      field.blur();
    });

    const copy = iconButton("link", "Copy link", () => {
      Cc["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Ci.nsIClipboardHelper)
        .copyString(browserOf().currentURI.spec);
      copy.style.backgroundImage = zenIcon("check"); // brief confirmation
      setTimeout(() => (copy.style.backgroundImage = zenIcon("link")), 800);
    });
    // Zen's site-controls panel (share, screenshot, extensions, tracking protection...) for this pane.
    const site = iconButton("sliders", "Site controls", () => {
      const orig = document.getElementById("zen-site-data-icon-button");
      if (orig) popupFrom(container, site, orig, () => orig.click());
    });

    const pill = (bar.pill = document.createElement("div"));
    pill.className = "zsc-pill";
    pill.append(field, site); // the site-controls button sits inside the pill, at its right end
    const center = document.createElement("div"); // copy-link outside the pill, centred together with it
    center.className = "zsc-center";
    center.append(copy, pill);
    bar.exts = document.createElement("div");
    bar.exts.className = "zsc-exts";
    bar.append(bar.back, bar.forward, bar.reload, center, bar.exts, iconButton("close", "Remove from split view", () => removePane(container)));
    return bar;
  };

  const syncBars = () => {
    for (const bar of document.querySelectorAll(".zsc-bar")) {
      if (!bar.parentElement.hasAttribute("is-zen-split")) bar.remove();
    }
    for (const container of document.querySelectorAll(".browserSidebarContainer[is-zen-split]")) {
      const browser = container.querySelector("browser");
      if (!browser) continue;
      let bar = container.querySelector(":scope > .zsc-bar");
      if (!bar) container.prepend((bar = makeBar(container)));
      setDisabled(bar.back, !browser.canGoBack);
      setDisabled(bar.forward, !browser.canGoForward);
      syncExts(bar, container);
      // Loading indicator in this pane's own pill: Firefox marks a loading tab with the "busy" attribute.
      bar.pill.toggleAttribute("loading", !!gBrowser.getTabForBrowser(browser)?.hasAttribute("busy"));
      const text = browser.currentURI?.host || gBrowser.getTabForBrowser(browser)?.label || "";
      if (bar.label.value !== text && bar.label !== document.activeElement) bar.label.value = text;
    }
  };

  // --- Keep everything in step with the browser ----------------------------------------------------
  // The menu is disabled on an empty tab (new tab page or blank): there is nothing to split.
  const EMPTY = /^about:(blank|newtab|home)/;
  const update = () => {
    // Lets the CSS hide Zen's own top controls while a split is active.
    document.documentElement.toggleAttribute("zsc-split", gBrowser.selectedTab.hasAttribute("split-view"));
    button.disabled =
      !canSplit || gBrowser.selectedTab.hasAttribute("zen-empty-tab") || EMPTY.test(gBrowser.currentURI.spec);
    syncBars();
  };
  gBrowser.tabContainer.addEventListener("TabSelect", update);
  gBrowser.addTabsProgressListener({
    // Background tabs navigate constantly; only a split's panes or the selected tab matter.
    onLocationChange: browser => {
      if (browser === gBrowser.selectedBrowser || document.documentElement.hasAttribute("zsc-split")) update();
    },
  });
  // Zen sets/removes the "split-view" attribute on tabs when they join or leave a split.
  new MutationObserver(update).observe(gBrowser.tabContainer, {
    subtree: true,
    attributes: true,
    attributeFilter: ["split-view", "selected", "busy"],
  });
  // Panes get is-zen-split when Zen builds a split; the bars follow it. Attributes only: watching
  // childList here would see syncBars' own edits and loop forever.
  new MutationObserver(update).observe(document.getElementById("tabbrowser-tabpanels"), {
    subtree: true,
    attributes: true,
    attributeFilter: ["is-zen-split"],
  });
  update();
})();
