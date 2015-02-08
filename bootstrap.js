const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const EXT_ID = "tabgroupsmenu@char.cc";
const global = this;
let PROTOCOL = "tabgroupsmenu";
const PREFIX = "grouptabs-";

const GROUPS_MENU_ID = PREFIX + "menu";
const GROUPS_POPUP_ID = PREFIX + "menu-popup";
const GROUPS_MENU_LABEL = "Groups";
const TABS_POPUP_ID = PREFIX + "cgp";
const GROUP_MENUITEM_CONTEXT_ID = PREFIX + "context-group";
const TAB_MENUITEM_CONTEXT_ID = PREFIX + "context-tab";
const GROUPS_BTN_ID = PREFIX + "btn";
const GROUPS_BTNPOPUP_ID = PREFIX + "btn-popup";
const BUTTON_MENU_ID = PREFIX + "btn-menu";
const BUTTON_POPUP_ID = PREFIX + "btn-popup";
const TABVIEW_BUTTON_ID = "tabview-button";
const POPUP_CLASS = PREFIX + "popup"; // for CSS styling
const GROUP_SEPARATOR = " \u2022 ";

const BUTTON_LEFT = 0;
const BUTTON_MIDDLE = 1;
const BUTTON_RIGHT = 2;
const KEY_CTRL = 17;

function processWindow(window) {
	window.TabView._initFrame(() => processPanorama(window));
}

function processPanorama(window) {
	let {document, gBrowser} = window;
	let gTabView = window.TabView;
	let GroupItems = gTabView.getContentWindow().GroupItems;
	let deleteList = [];

	let {$, $E, $EL, $F} = createGeneralFuncs(window);

	let GU = createGroupFuncs(window);
	let WU = createWindowFuncs(window);
	let UI = createUIFuncs(window);

	// Install window preference observer
	let prefsObserver = {
		register: function() {
			this.unloads = {}; // storage of unload functions
			this.state = {};
			for (let pref in PREFS)
				this.state[pref] = false;
			this.isUnload = false;
			this.branch = Services.prefs.getBranch(PREF_BRANCH);
			this.branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
			this.branch.addObserver("", this, false);
			return function() {
				prefsObserver.unregister();
				prefsObserver.unload();
			}
		},
		unregister: function() {
			if (! this.branch) return;
			this.branch.removeObserver("", this);
		},
		observe: function(subject, topic, data) {
			if (this[data] !== undefined) {
				let status = getPref(data);
				if (status != this.state[data]) {
					this[data](data, status);
					this.state[data] = status;
					let self = this;
					if (status)
						this.addUnload(data, function() {
							self[data](data, false)
						});
					else
						this.clearUnload(data);
				}
			}
		},
		trigger: function(pref) {
			this.observe(null, null, pref);
		},
		// if pref is given then add callback else run callbacks
		addUnload: function(pref, callback) {
			if (typeof(this.unloads[pref]) == "function")
				this.unloads[pref] = function() { this.unloads[pref](); callback(); };
			else
				this.unloads[pref] = callback;
		},
		clearUnload: function(pref) {
			if (this.unloads[pref] != undefined)
				delete this.unloads[pref];
		},
		unload: function() {
			this.isUnload = true;
			for (let key in this.unloads) {
				this.unloads[key]();
			}
		},
		openOnMouseOver: function(pref, status) {
			let groupmenu = $(GROUPS_MENU_ID);
			if (status) {
				if (! this.isUnload) {
					if (groupmenu) {
						groupmenu.addEventListener("mouseover", onMouseOverMenu, true);
						groupmenu.addEventListener("click", onMouseOverMenu, true);
					}
					UI.withTabsMenu(menu => {
						menu.addEventListener("mouseover", onMouseOverMenu, true);
						menu.addEventListener("click", onMouseOverMenu, true);
					});
				}
			} else {
				if (groupmenu) {
					groupmenu.removeEventListener("mouseover", onMouseOverMenu, true);
					groupmenu.removeEventListener("click", onMouseOverMenu, true);
				}
				UI.withTabsMenu(menu => {
					menu.removeEventListener("mouseover", onMouseOverMenu, true);
					menu.removeEventListener("click", onMouseOverMenu, true);
				});
			}
		},
		showTabsMenu: function(pref, status) {
			if (status) {
				if (! this.isUnload)
					updateMenubarMenus();
			} else {
				removeMenubarMenus();
			}
		},
		sortGroupNames: function(pref, status) {
			if (status)
				GU.sortGroups();
		},
		_getButtonPopup: function() {
			let btnPopup = $(GROUPS_BTNPOPUP_ID);
			if (! btnPopup) {
				let tabviewButton = $(TABVIEW_BUTTON_ID);
				if (tabviewButton) {
					btnPopup = $E("menupopup", {
						id: GROUPS_BTNPOPUP_ID,
						class: POPUP_CLASS // this must be addes so that css rules above works
					});
					btnPopup.addEventListener("popupshowing", e => showGroupsMenu(btnPopup), false);
					// Prevent firefox toolbar context menu
					btnPopup.addEventListener("context", function(event) {
						event.preventDefault();
						event.stopPropagation();
					}, false);
					tabviewButton.appendChild(btnPopup);
				}
			}
			return btnPopup;
		},
		_removeButtonPopup: function() {
			let tabviewButton = $(TABVIEW_BUTTON_ID);
			let btnpopup = $(GROUPS_BTNPOPUP_ID);
			if (tabviewButton && btnpopup)
				tabviewButton.removeChild(btnpopup);
		},
		addButtonMenu: function(pref, status) {
			let tabviewButton = $(TABVIEW_BUTTON_ID);
			if (status) {
				let btnpopup = this._getButtonPopup();
				if (tabviewButton && btnpopup)
					tabviewButton.setAttribute("type", "menu-button");
			} else {
				if (tabviewButton)
					tabviewButton.removeAttribute("type");
			}
			if (! (status || getPref("replacePanoramaButton")) || this.isUnload)
				this._removeButtonPopup();
		},
		replacePanoramaButton: function(pref, status) {
			let tabviewButton = $(TABVIEW_BUTTON_ID);
			if (status) {
				let btnpopup = this._getButtonPopup();
				if (tabviewButton && btnpopup)
					tabviewButton.addEventListener("click", onMouseClickButton, true);
			} else {
				if (tabviewButton)
					tabviewButton.removeEventListener("click", onMouseClickButton, true);
			}
			if (! (status || getPref("addButtonMenu")) || this.isUnload)
				this._removeButtonPopup();
		},
		showTabCount: function(pref, status) {
			updateMenuLabels();
		},
		showGroupCount: function(pref, status) {
			updateMenuLabels();
		}
	};
	unload(prefsObserver.register());

	function onSelectTabMenuItem(event) {
		if (! event.ctrlKey) {
			// Select tab and close menu
			WU.selectTab(event.target.value);
			UI.closePopup();
		} else {
			// Mark multiple selection
			let menuitem = event.target;
			let cls = menuitem.hasAttribute("class") ? menuitem.getAttribute("class") + " " : "";
			if (! cls.match(/marked/)) {
				menuitem.setAttribute("class", cls + "marked");
			} else {
				menuitem.setAttribute("class", cls.replace(/\s*\bmarked\b/, ""));
			}
		}
	}

	function onCreateGroup(event) {
		let [ret, name, openInBg] = WU.promptCheck("Create New Group", "Enter group title:", "", "Open in background");
		if (ret && name != null && name.length) {
			name = name.trim();
			if (name) {
				if (GU.findGroup(name)) {
					WU.alert("Cannot create group", 'Group "' + name + '" already exists');
					return;
				}
				GU.createGroup(name, null, openInBg);
				if (getPref("sortGroupNames")) {
					GU.sortGroups();
				}
			}
		}
	}

	function onCreateSubGroup(event) {
		let group = null;
		if (document.popupNode) {
			// Called from context menu
			group = GU.findGroup(document.popupNode.value);
		} else {
			group = GroupItems.getActiveGroupItem();
		}
		if (! group) {
			return;
		}
		let title = group.getTitle();
		if (! title) {
			// Don't create a subgroup of anonymous group
			return;
		}
		let [ret, name, openInBg] = WU.promptCheck("Create Subgroup of " + title, "Enter group title:", "", "Open in background");
		if (ret && name != null && name.length) {
			name = name.trim();
			if (name) {
				let pathTitle = GU.joinTitle(title, name);
				if (GU.findGroup(pathTitle)) {
					WU.alert("Cannot create group", 'Group "' + name + '" already exists as child of "' + title + '"');
					return;
				}
				GU.createGroup(name, title, openInBg);
				if (getPref("sortGroupNames")) {
					GU.sortGroups();
				}
			}
		}
	}

	function onBookmarkGroup(event) {
		let group = GU.findGroup(document.popupNode.value);
		GU.bookmarkGroup(group);
	}

	// Triggered by "Open New Tab" menuitem in empty group
	function onCreateTabInGroup(event) {
		let group = GU.findGroup(event.target.value);
		GU.createTabInGroup(group, true);
		let urlbar = $("urlbar");
		if (urlbar) urlbar.focus();
	}

	// Todo: select unloaded tab
	function onCloseGroup(event) {
		let menu = document.popupNode;
		let group = GU.findGroup(menu.value);
		let title = group.getTitle();
		let popup = UI.findPopup(menu);

		// close = really close, closeAll = undoable close, closeHidden = close previously closeAll-ed group?
		if (WU.confirm("Close Group", "Really close this group and its children: \"" + title + "\" ?\n\nWarning: this operations cannot be undone!")) {
			GU.closeGroup(group);
			if (getPref("sortGroupNames")) {
				// Just in case closing group change the sorting
				GU.sortGroups();
			}
			updateMenubarMenus();
		}

		// Reopen menu
		if (getPref("keepMenuOpen"))
			UI.openPopup(popup, title);
	}

	function onCloseCurrentGroup(event) {
		let group = GroupItems.getActiveGroupItem();
		if (group) {
			if (WU.confirm("Close Group", "Really close this group and its children: \"" + group.getTitle() + "\" ?\n\nWarning: this operations cannot be undone!")) {
				GU.closeGroup(group);
				if (getPref("sortGroupNames")) {
					GU.sortGroups();
				}
				updateMenubarMenus();
			}
		}
	}

	function onRenameGroup(event) {
		let group = null;
		if (document.popupNode) {
			// Called from context menu
			group = GroupItems.groupItem(document.popupNode.value);
		} else {
			group = GroupItems.getActiveGroupItem();
		}
		if (! group) return;
		let title = group.getTitle();
		let parts = title.split(GROUP_SEPARATOR);
		let oldname = parts.pop();
		let newname = WU.prompt("Rename Group (" + GU.getTitle(group) + ")", "New group name: ", oldname);
		if (newname) {
			newname = newname.trim();
			if (newname && newname != oldname) {
				let fullname = parts.length > 0 ? parts.join(GROUP_SEPARATOR) + GROUP_SEPARATOR + newname : newname;
				if (GroupItems.groupItems.some(function(group) { return group.getTitle() == fullname })) {
					WU.alert("Failed to rename group", "Group with title \"" + newname + "\" already exists.");
					return;
				}
				GU.renameGroup(group, newname);
				if (getPref("sortGroupNames")) {
					GU.sortGroups();
				}
				updateMenubarLabels();
			}
		}
		// Reopen menu
		if (getPref("keepMenuOpen")) {
			let popup = UI.findPopup(document.popupNode || event.target);
			UI.openPopup(popup, group);
		}
		updateMenubarLabels();
	}

	function onSelectGroupByName(event) {
		GU.selectGroup(event.target.value);
	}

	function onGroupMenuItemClick(event) {
		switch (event.button) {
			case BUTTON_LEFT: {
				// Select group
				if (GU.selectGroup(GU.findGroup(event.target.value)))
					UI.closePopup(); // close menu if group successfully selected
				break;
			}
			case BUTTON_RIGHT: {
				// Populate context menu
				let popup = $(GROUP_MENUITEM_CONTEXT_ID).childNodes[2].childNodes[0];
				UI.clearPopup(popup);

				let groups = [];
				let gid = event.target.value;
				let group = GroupItems.groupItem(gid);
				if (! group) {
					return;
				}
				let srcTitle = group.getTitle();
				GroupItems.groupItems.forEach(function(gr) {
					// Don't filter the disabled target here otherwise the tree structure might get broken
					groups.push([gr.id, GU.getTitle(gr)]);
				});
				// must be sorted even though sortGroupNames = true
				groups.sort(function(a, b) { return a[1].localeCompare(b[1]); });

				let stack = [];
				let parent = popup;
				let addMoveHere = function(parent) {
					parent.appendChild($E("menuseparator"));
					parent.appendChild($E("menuitem", {
						label: "Move Here",
						value: parent.parentNode.value[0],
						disabled: ! GU.canMove(srcTitle, parent.parentNode.value[1])
					}, {
						command: onMoveGroups
					}));
				};
				for (let i = 0, n = groups.length; i < n; ++i) {
					let level = GU.getLevel(groups[i][1]);
					let nextLevel = (i < (n-1)) ? GU.getLevel(groups[i+1][1]) : level;
					//LOG($F("{0} level {1} nextLevel {2}", groups[i][1], level, nextLevel));
					if (level < nextLevel) {
						let _menu = $E("menu", {
							label: GU.splitTitle(groups[i][1]).name,
							value: groups[i] // value type is an array
						});
						let _popup = $E("menupopup");
						_menu.appendChild(_popup);
						parent.appendChild(_menu);
						stack.push(parent);
						parent = _popup;
					} else {
						parent.appendChild($E("menuitem", {
							label: GU.splitTitle(groups[i][1]).name,
							value: groups[i][0],
							disabled: ! GU.canMove(srcTitle, groups[i][1])
						}, {
							command: onMoveGroups
						}));

						if (level > nextLevel) {
							addMoveHere(parent);
							let diff = level - nextLevel;
							while (diff-- > 0) {
								parent = stack.pop();
								if (diff > 0)
									addMoveHere(parent);
							}
						}
					}
				}
				if (stack.length) {
					addMoveHere(parent);
					while (stack.length > 1) {
						addMoveHere(stack.pop());
					}
				}

				// Move group to top
				if (group.getTitle().indexOf(GROUP_SEPARATOR) != -1) {
					popup.appendChild($E("menuseparator"));
					popup.appendChild($E("menuitem", {
						label: "Top",
						value: null
					}, {
						command: onMoveGroups
					}));
				}

				break;
			}
		}
	}

	// Triggered by "New Tab" menuitem in group context menu
	function onOpenNewTab(event) {
		let group = GroupItems.groupItem(document.popupNode.value);
		GU.createTabInGroup(group);
		let urlbar = $("urlbar");
		if (urlbar) urlbar.focus();
	}

	function onGroupPopupShowing(event) {
		deleteList = [];
	}

	function onGroupPopupHiding(event) {
		if (deleteList.length) {
			let tabs = [];
			while (deleteList.length) {
				tabs.push(gBrowser.tabs[deleteList.pop()]);
			}
			tabs.forEach(function(tab) {
				if (tab)
					gBrowser.removeTab(tab);
			});

			GU.preventEmptyActiveGroup();
		}
	}

	function onMouseClickMenu(event) {
		let menu = event.target;
		if ((menu.id == GROUPS_MENU_ID || UI.isTabsMenu(menu)) && ! menu.open) {
			let menubar = menu.parentNode;
			for (let i = 0, n = menubar.childNodes.length; i < n; i++) {
				if (menubar.childNodes[i].open) {
					menubar.childNodes[i].open = false;
				}
			}
			UI.closePopup();
			menu.open = true;
		}
	}

	function onMouseOverMenu(event) {
		onMouseClickMenu(event);
	}

	function onMouseClickButton(event) {
		if (event.target.id == TABVIEW_BUTTON_ID) {
			let popup = $(BUTTON_POPUP_ID);
			if (popup) {
				popup.hidePopup();
				popup.openPopup(event.target, "after_start", 0, 0, false, false);
			}
			event.stopPropagation();
			event.preventDefault();
		}
	}

	function onMouseOverButton(event) {
		onMouseClickButton(event);
	}

	// Click = switch to tab
	// Ctrl + Click = mark tab for multiple selection
	// Middle click = close button
	// Right click = show context menu
	function onTabMenuItemClick(event) {
		switch (event.button) {
			case BUTTON_MIDDLE: {
				// Can't  directly remove tab because then the tabindex would have been changing
				deleteList.push(event.target.value);

				let popup = event.target.parentNode;
				popup.removeChild(event.target);

				event.stopPropagation();

				// The menu labels still showing the wrong tab count at this point (we let it be like that)
				// The menu labels will be updated after closing the menu
				break;
			}
			case BUTTON_RIGHT: {
				let context = $(TAB_MENUITEM_CONTEXT_ID);
				UI.clearPopup(context);

				let selected = UI.getSelectedTabs(event.target);
				let ntabs = selected.length > 1 ? selected.length + " " : "";
				let s = selected.length > 1 ? "s" : "";
				let menu = $E("menu", { label: $F("Move {0}to Group", (ntabs > 1 ? (ntabs + " Tabs ") : "")) });
				let popup = $E("menupopup");

				let srcGroupId = event.target.getAttribute("groupid");

				// Add move to current group
				let currentGroup = GroupItems.getActiveGroupItem();
				if (currentGroup && currentGroup.id != srcGroupId) {
					popup.appendChild($E("menuitem", {
						label: "Current Group: " + GU.splitTitle(currentGroup.getTitle()).name,
						value: currentGroup.id
					}, {
						command: onMoveTabs
					}));
					popup.appendChild($E("menuseparator"));
				}

				let groups = [];
				GroupItems.groupItems.forEach(function(gr) {
					groups.push([gr.id, GU.getTitle(gr)]);
				});
				// must be sorted even thought sortGroupNames = true
				groups.sort(function(a, b) { return a[1].localeCompare(b[1]); });

				let stack = [];
				let parent = popup;
				let addMoveHere = function(parent) {
					parent.appendChild($E("menuseparator"));
					parent.appendChild($E("menuitem", {
						label: "Move Here",
						value: parent.parentNode.value[0],
						disabled: parent.parentNode.value[0] == srcGroupId
					}, {
						command: onMoveTabs
					}));
				};
				for (let i = 0, n = groups.length; i < n; ++i) {
					let level = GU.getLevel(groups[i][1]);
					let nextLevel = (i < (n-1)) ? GU.getLevel(groups[i+1][1]) : level;
					//LOG($F("{0} level {1} nextLevel {2}", groups[i][1], level, nextLevel));
					if (level < nextLevel) {
						let _menu = $E("menu", {
							label: GU.splitTitle(groups[i][1]).name,
							value: groups[i] // not a typo, the value is an array
						});
						let _popup = $E("menupopup");
						_menu.appendChild(_popup);
						parent.appendChild(_menu);
						stack.push(parent);
						parent = _popup;
					} else {
						parent.appendChild($E("menuitem", {
							label: GU.splitTitle(groups[i][1]).name,
							value: groups[i][0],
							disabled: groups[i][0] == srcGroupId
						}, {
							command: onMoveTabs
						}));

						if (level > nextLevel) {
							addMoveHere(parent);
							let diff = level - nextLevel;
							while (diff-- > 0) {
								parent = stack.pop();
								if (diff > 0)
									addMoveHere(parent);
							}
						}
					}
				}
				if (stack.length) {
					addMoveHere(parent);
					while (stack.length > 1) {
						addMoveHere(stack.pop());
					}
				}

				menu.appendChild(popup);
				context.appendChild(menu);
				context.appendChild($E("menuitem", {
					label: $F("Close {0}Tab{1}", ntabs, s),
					closemenu: "single" // close the context menu only
				}, {
					command: onCloseTabs
				}));

				event.stopPropagation(); // prevent reaching the menu (group) click handler
				break;
			}
		}
	}

	function onCloseTabs(event) {
		let menuitems = UI.getSelectedTabs(document.popupNode);
		if (menuitems.length == 0)
			return;

		let popup = document.popupNode.parentNode;
		menuitems.forEach(function(item) {
			deleteList.push(item.value);
			popup.removeChild(item);
		});
	}

	function onMoveTabs(event) {
		let menuitems = UI.getSelectedTabs(document.popupNode);
		if (menuitems.length == 0)
			return;

		let tabitem = $T(gBrowser.tabs[menuitems[0].value]);
		let srcGroup = tabitem ? tabitem.parent : null;
		let targetGroupId = event.target.value;

		// LOG("Moving tabs to " + GroupItems.groupItem(targetGroupId).getTitle());
		// menuitems.forEach(function(item) LOG("Moving " + gBrowser.tabs[item.value].getAttribute("label")));
		// return;

		let tabs = [];
		menuitems.forEach(function(item) { return tabs.push(gBrowser.tabs[item.value]); });
		tabs.forEach(function(tab) {
			if (tab.pinned) {
				// unpin tab first
				gBrowser.unpinTab(tab);
			}
			GroupItems.moveTabToGroupItem(tab, targetGroupId);
		});

		GU.preventEmptyActiveGroup();

		// Reopen menu
		if (getPref("keepMenuOpen"))
			UI.openPopup(UI.findPopup(document.popupNode), srcGroup, true);
	}

	function onMoveGroups(event) {
		let src = GroupItems.groupItem(document.popupNode.value);
		let dst = GroupItems.groupItem(event.target.value);
		GU.moveGroup(src, dst);
		if (getPref("sortGroupNames"))
			GU.sortGroups();
	}

	function getGroupsMenuLabel(isTabClose) {
		isTabClose = isTabClose || false;

		let title = GROUPS_MENU_LABEL;
		if (GroupItems && (getPref("showTabCount") || getPref("showGroupCount"))) {
			title += " (";
			if (getPref("showTabCount")) {
				let tabCount = WU.getNumberOfTabs();
				if (tabCount == null || tabCount == undefined) {
					tabCount = "-";
				} else if (isTabClose) {
					tabCount--; // this event is triggered before the tab is removed
				}
				title += tabCount + "/";
			}
			if (getPref("showGroupCount")) {
				let groupCount = GU.getNumberOfGroups();
				if (groupCount == null && groupCount == undefined) {
					groupCount = "-";
				}
				title += groupCount;
			}
			title += ")";
		}
		return title;
	}

	// Called when switching tab
	function onTabSelectHandler(event) {
		let group = GroupItems.getActiveGroupItem();
		updateMenubarMenus();
	}

	function updateMenubarLabels() {
		if (GroupItems) {
			let group = GroupItems.getActiveGroupItem();
			let parts = GU.getTitle(group).split(GROUP_SEPARATOR);
			for (let i = 0, n = parts.length; i < n; ++i) {
				let menu = $("TABGROUPS_MENU_LEVEL_" + i);
				if (typeof menu !== "undefined")
					if (menu.getAttribute("title") != parts[i])
						menu.setAttribute("title", parts[i]);
			}
		}
	}

	// Update menus in the menubar based on current group hierarchy
	// TabGroups -> Parent Group -> Group
	function updateMenubarMenus() {
		if (! getPref("showTabsMenu"))
			return;
		if (GroupItems) {
			let group = GroupItems.getActiveGroupItem();
			let title = group.getTitle();
			let parts = title.split(GROUP_SEPARATOR);
			let curr_path = "";
			let curr_group = null;
			let i = 0;
			for (n = parts.length; i < n; ++i) {
				if (curr_path != "")
					curr_path += GROUP_SEPARATOR;
				curr_path += parts[i];
				curr_group = GU.findGroup(curr_path);
				let menu_id = "TABGROUPS_MENU_LEVEL_" + i;
				let menu_menu = $(menu_id);
				if (menu_menu == undefined) {
					menu_menu = $E("menu", { id: menu_id, label: parts[i], group_id: curr_group.id, class: "tabgroupsmenu-tabs-menu" });

					let popup = $E("menupopup", { class: "grouptabs-popup" });
					popup.addEventListener("popupshowing", onShowTabsMenu, false);
					menu_menu.appendChild(popup);

					if (getPref("openOnMouseOver")) {
						menu_menu.addEventListener("mouseover", onMouseOverMenu, true);
						menu_menu.addEventListener("click", onMouseOverMenu, true);
					}

					let menubar = $("main-menubar");
					menubar.insertBefore(menu_menu, menubar.lastChild);
				} else if (menu_menu.getAttribute("group_id") != curr_group.id) {
					menu_menu.setAttribute("group_id", curr_group.id);
					menu_menu.setAttribute("label", parts[i]);
				}
			}
			// remove the rest of the menu (if any)
			let menu = null;
			do {
				menu = $("TABGROUPS_MENU_LEVEL_" + i);
				if (menu) {
					menu.parentNode.removeChild(menu);
				}
			} while (menu);
		}
	}

	function removeMenubarMenus() {
		for (let i = 0; i < 10; ++i) {
			let menu = $(`TABGROUPS_MENU_LEVEL_${i}`);
			if (menu)
				menu.parentNode.removeChild(menu);
		}
	}

	function updateMenuLabels(isTabClose) {
		let groupsMenu = $(GROUPS_MENU_ID);
		if (groupsMenu)
			groupsMenu.setAttribute("label", getGroupsMenuLabel(isTabClose));
	}

	function onTabOpenHandler(event) {
		if (GroupItems) {
			updateMenubarMenus();
			updateMenuLabels();
		}
	}

	function onTabCloseHandler(event) {
		if (GroupItems) {
			updateMenubarMenus();
			updateMenuLabels(true);
		}

	}

	function onTabMoveHandler(event) {
		if (GroupItem)
			updateMenubarMenus();
	}

	// DRAG DROP //////////////////////////////////////////////////////////////////////////////////////

	function onTabDragStart(event) {
		let target = event.target; // could be a menuitem (tab) or menu (group)
		let canMove = true;
		if (target.tagName == "menuitem") {
			// Dragging a tab menu item
			let tab = gBrowser.tabs[target.value];
			if (! tab || tab.pinned)
				canMove = false;
		} else {
			// Dragging a menu i.e. a group
			let group = GroupItems.groupItem(event.target.value);
			if (group.getTitle() == "") {
				WU.alert("Cannot Drag Anonymous Group", "Please set a title first for the group before dragging it.");
				canMove = false;
			}
		}
		if (canMove) {
			let dt = event.dataTransfer;
			dt.effectAllowed = "move";
			dt.dropEffect = "move";
			dt.mozSetDataAt("plain/text", target.value, 0); // value
			dt.mozSetDataAt("plain/text", target.tagName, 1); // type
			event.stopPropagation();
		} else {
			event.preventDefault();
			event.stopPropagation();
		}
	}

	function onTabDragEnter(event) {
		return onTabDragOver(event);
	}

	function onTabDragOver(event) {
		let target = event.target;

		let value = parseInt(event.dataTransfer.mozGetDataAt("plain/text", 0), 10);
		let type = event.dataTransfer.mozGetDataAt("plain/text", 1);

		// drag to group
		if (target.tagName != "menu") {
			event.stopPropagation();
			return;
		}

		if (! ((type == "menu" && target.id == GROUPS_MENU_ID) ||
			   target.getAttribute("class").indexOf("tabgroup") != -1)) {
			event.stopPropagation();
			return;
		}

		let group = target.value ? GU.findGroup(target.value) : null;
		if (type == "menuitem") {
			let tab = gBrowser.tabs[value];
			if (tab) {
				if ($T(tab) && $T(tab).parent == group) {
					event.stopPropagation();
					return;
				}
			}
		} else if (type == "menu") {
			let canDrop = true;
			if (group && ! group.getTitle()) {
				canDrop = false;
			} else {
				let sourceGroup = GU.findGroup(value);
				let parts = sourceGroup.getTitle().split(GROUP_SEPARATOR);
				parts.pop();
				let sourcePrefix = parts.join(GROUP_SEPARATOR);
				// Can't drag to the same group, its children, or its immediate parent
				if ((! sourcePrefix && target.id == GROUPS_MENU_ID) || sourceGroup == group || (group && group.getTitle().indexOf(sourceGroup.getTitle() + GROUP_SEPARATOR) === 0) || (sourcePrefix && group && group.getTitle() == sourcePrefix)) {
					canDrop = false;
				}
			}
			if (! canDrop) {
				event.stopPropagation();
				return;
			}
		}

		event.preventDefault(); // allow dragover
		event.stopPropagation();
	}

	function onTabDrop(event) {
		let dt = event.dataTransfer;

		let value = dt.mozGetDataAt("plain/text", 0);
		let type = dt.mozGetDataAt("plain/text", 1);

		let dstGroup = null; // if null then move to top
		if (event.target.id != GROUPS_MENU_ID) {
			dstGroup = GU.findGroup(event.target.value);
		}

		if (type == "menuitem") {
			let tabindex = value;
			let tab = gBrowser.tabs[tabindex];
			let tabitem = $T(tab);
			if (tabitem && tabitem.parent) {
				// batch move
				let srcGroup = tabitem.parent;
				let gid = srcGroup.id;
				let queue = []
				let menuitem = $(PREFIX + "tab-" + tabindex);
				if (menuitem.hasAttribute("class") && menuitem.getAttribute("class").match(/marked/)) {
					let menu = $(PREFIX + "group-" + gid);
					for (let i = 0, len = menu.itemCount; i < len; ++i) {
						let item = menu.getItemAtIndex(i);
						if (item.hasAttribute("class") && item.getAttribute("class").match(/marked/)) {
							queue.push(item.value);
						}
					}
				} else {
					queue.push(value);
				}

				let dstGroupId = dstGroup.id;
				for (let i = 0, len = queue.length; i < len; ++i) {
					GroupItems.moveTabToGroupItem(gBrowser.tabs[queue[i]], dstGroupId);
				}

				if (srcGroup.getChildren().length == queue.length) {
					// Prevent panorama from opening up when moving all tabs
					gBrowser.selectedTab = GU.createTabInGroup(dstGroup);
				}
			} else {
				// Moving orphaned tab
				GroupItems.moveTabToGroupItem(tab, dstGroupId);
			}

			// group.reorderTabsBasedOnTabItemOrder();
		} else if (type == "menu") {
			GU.moveGroup(GU.findGroup(value), dstGroup);
		}

		// Reopen menu
		let target = event.target;
		let popup = null;
		if (target.id == GROUPS_MENU_ID) {
			popup = $(GROUPS_POPUP_ID);
		} else {
			target = target.parentNode;
			while (target.parentNode != null && target.parentNode.tagName != "window") {
				if (target.id == GROUPS_POPUP_ID) {
					popup = target;
					break;
				} else if (target.id == GROUPS_BTNPOPUP_ID) {
					popup = target;
					break;
				}
				target = target.parentNode;
			}
		}

		// Reopen menu
		if (getPref("keepMenuOpen") && popup)
			UI.openPopup(popup, dstGroup);

		event.stopPropagation();
	}

	// END DRAG DROP /////////////////////////////////////////////////////////////////////////////////

	// Show tab groups under given popup
	function showGroupsMenu(popup, gid) {
		let prefix = gid ? GroupItems.groupItem(gid).getTitle() : null;
		if (gid && ! prefix) {
			// we're showing subgroups of an unnamed group
			return;
		}

		UI.clearPopup(popup);

		// Lisf of tab groups
		let hasGroups = false;
		let activeGroup = GroupItems.getActiveGroupItem();

		// Sort group names first so that a parent group comes before its children
		let groupItems = GroupItems.groupItems.concat();

		// Even thought group names are sorted on start, we'd still need to sort it because the user can add new groups by other means
		// than this ext.
		groupItems.sort((a, b) => {
			let r = (a.getTitle() === "") - (b.getTitle() === "");
			if (r === 0)
				r = a.getTitle().toLowerCase().localeCompare(b.getTitle().toLowerCase());
			return r;
		});

		let groupTitles = [];
		let addedTitles = [];
		groupItems.forEach(function(group) {
			let title = GU.getTitle(group);
			if (! prefix || title.indexOf(prefix + GROUP_SEPARATOR) === 0) {
				hasGroups = true;

				let displayTitle = title;
				if (prefix) {
					displayTitle = displayTitle.substr(prefix.length + GROUP_SEPARATOR.length);
				}
				displayTitle = displayTitle.split(GROUP_SEPARATOR)[0]

				if (addedTitles.indexOf(displayTitle) == -1) {
					addedTitles.push(displayTitle);

					let cls = "menu-iconic tabgroup";
					if (activeGroup) {
						let pathPrefix = prefix ? prefix + GROUP_SEPARATOR + displayTitle : displayTitle;
						let activeTitle = GU.getTitle(activeGroup);
						if (activeTitle === pathPrefix || activeTitle.indexOf(pathPrefix + GROUP_SEPARATOR) === 0) {
							cls += " current";
						}
					}
					groupTitles.push([displayTitle, group.id, cls]);
				}
			}
		});
		groupTitles.forEach(function(arr) {
			let group = GroupItems.groupItem(arr[1]);
			let m = $E("menu", {
				id: PREFIX + "group-" + arr[1],
				label: GU.getMenuLabel(group, prefix),
				value: arr[1],
				"class": arr[2],
				context: GROUP_MENUITEM_CONTEXT_ID,
				acceltext: GU.getTabsCount(group),
				image: GU.getImage(group)
			});
			// enable drop
			m.addEventListener("dragenter", onTabDragEnter, false);
			m.addEventListener("dragover", onTabDragOver, false);
			m.addEventListener("drop", onTabDrop, false);
			// enable drag
			m.addEventListener("dragstart", onTabDragStart, false);

			// Select tab in group by clicking on the group title
			m.addEventListener("click", onGroupMenuItemClick, false);

			let mp = $E("menupopup", { id: PREFIX + "group-popup-" + arr[1] });
			mp.addEventListener("popupshowing", onShowTabsMenu, false);

			m.appendChild(mp);
			popup.appendChild(m);
		});

		// List of tabs not under any group (most probably app tabs)
		if (prefix)
			// Only process this if not under any prefix
			return;

		let orphanTabs = [];
		let tabs = gBrowser.tabContainer.childNodes;
		for (let i = 0, len = tabs.length; i < len; i++) {
			let tab = tabs[i];
			if (! $T(tab) || $T(tab).parent == null) {
				orphanTabs.push([i, tab]);
			}
		}
		if (orphanTabs.length) {
			if (hasGroups) {
				popup.appendChild($E("menuseparator"));
			}
			orphanTabs.forEach(function(arr) {
				let index = arr[0];
				let tab = arr[1];
				let cls = "menuitem-iconic";
				if (tab.selected) {
					cls += " current";
				} else if (WU.isUnloaded(tab)) {
					cls += " unloaded";
				}
				let taburl = WU.getTabURL(tab);
				// using description will cut the menuitem label so use tooltiptext instead
				let mi = $E("menuitem", {
					id: PREFIX + "tab-" + index,
					value: index,
					"class": cls,
					label: tab.getAttribute("label"),
					tooltiptext: taburl,
					closemenu: "none",
					context: TAB_MENUITEM_CONTEXT_ID,
				});
				copyattr(mi, tab, "image");
				copyattr(mi, tab, "busy");
				if ($A(tab, "selected")) {
					mi.setAttribute("style", "font-weight: bold");
				}
				mi.addEventListener("dragstart", onTabDragStart, false);
				mi.addEventListener("click", onTabMenuItemClick, false);
				mi.addEventListener("command", onSelectTabMenuItem, false);
				popup.appendChild(mi);
			});
		}

		if (! gid) {
			popup.appendChild($E("menuseparator"));

			let mi = $E("menuitem", { label: "New Group\u2026", "class": "menu-iconic" });
			mi.addEventListener("command", onCreateGroup, false);
			popup.appendChild(mi);
		}
	}

	function onShowTabsMenu(event) {
		let menu = event.target.parentNode;
		let popup = event.target; // menupopup
		let gid = popup.parentNode.getAttribute("group_id") || popup.parentNode.value;
		if (gid) {
			UI.clearPopup(popup);
			if (GU.hasSubgroup(GU.findGroup(parseInt(gid)))) {
				showGroupsMenu(popup, gid); // show subgroups
				popup.appendChild($E("menuseparator"));
			}
			showTabsMenu(popup, gid); // show the tabs

			onGroupPopupShowing(event);
		}

		event.stopPropagation();
	}

	function showTabsMenu(mp, gid) {
		let group = GroupItems.groupItem(gid);
		if (! group)
			return;
		let tabs = gBrowser.tabContainer;

		//group.reorderTabItemsBasedOnTabOrder();

		mp.addEventListener("popuphiding", onGroupPopupHiding, false);

		group.reorderTabItemsBasedOnTabOrder();
		let children = group.getChildren();
		if (children.length > 0) {
			let children = group.getChildren();
			if (getPref("reverseTabOrder")) {
				children = children.slice(0);
				children.reverse();
			}
			children.forEach(function(tabitem) {
				tab = tabitem.tab;
				let cls = "menuitem-iconic";
				if (tab.selected) {
					cls += " current";
				} else if (WU.isUnloaded(tab)) {
					cls += " unloaded";
				}
				let tabindex = tabs.getIndexOfItem(tab);
				let taburl = WU.getTabURL(tab, null);
				// using description will cuts the menuitem label so use tooltiptext instead
				let mi = $E("menuitem", {
					id: PREFIX + "tab-" + tabindex,
					class: cls,
					label: tab.getAttribute("label"),
					tooltiptext: taburl,
					groupid: gid,
					value: tabindex,
					closemenu: "none",
					context: TAB_MENUITEM_CONTEXT_ID,
				});
				copyattr(mi, tab, "image");
				copyattr(mi, tab, "busy");
				mi.addEventListener("dragstart", onTabDragStart, false);
				mi.addEventListener("click", onTabMenuItemClick, false);
				mi.addEventListener("command", onSelectTabMenuItem, false);
				mp.appendChild(mi);
			});
		} else {
			mp.appendChild($E("menuitem", {
				label: "Open New Tab",
				value: group.id
			}, {
				command: onCreateTabInGroup
			}));
		}

		// Shown only on current group
		if (mp.id == TABS_POPUP_ID) {
			mp.appendChild($E("menuseparator"));
			mp.appendChild($E("menuitem", { label: "Close Group" }, { command: onCloseCurrentGroup }));
			mp.appendChild($E("menuitem", { label: "Rename Group\u2026" }, { command: onRenameGroup }));

			let title = group.getTitle();
			if (title != "") {
				// Don't create a subgroup from anonymous group
				mp.appendChild($E("menuitem", { label: "New Subgroup\u2026" }, { command: onCreateSubGroup }));

				// Menu items of parent groups
				let parts = title.split(GROUP_SEPARATOR);
				parts.pop();
				if (parts.length > 0) {
					mp.appendChild($E("menuseparator"));
					while (parts.length > 0) {
						let tempTitle = parts.join(GROUP_SEPARATOR);
						mp.appendChild($E("menuitem", { label: tempTitle, value: GU.findGroup(tempTitle) }, { command: onSelectGroupByName }));
						parts.pop();
					}
				}
			}
		}
	}

	// Adds a menu to the menubar and to the panorama button
	function createGroupsMenu() {
		let menubar = $("main-menubar");
		let menu = $E("menu", {
			id: GROUPS_MENU_ID,
			label: getGroupsMenuLabel(),
			accesskey: "G",
			context: PREFIX + "extra-context"
		});
		// enable drop
		menu.addEventListener("dragenter", onTabDragEnter, false);
		menu.addEventListener("dragover", onTabDragOver, false);
		menu.addEventListener("drop", onTabDrop, false);
		menubar.insertBefore(menu, menubar.lastChild);
		prefsObserver.trigger("openOnMouseOver");

		let popup = $E("menupopup", {
			id: GROUPS_POPUP_ID,
			class: POPUP_CLASS
		});
		popup.addEventListener("popupshowing", e => showGroupsMenu(popup), false);
		menu.appendChild(popup);

		return function() {
			menubar.removeChild(menu);
		};
	}

	/**
	 * Create a context menu that will be displayed on right click on the menubar menu
	 */
	function createContextMenu() {
		let popupset = $("mainPopupSet");

		// Group menuitem context menu

		let groupContext = $EL("menupopup", [
			$E("menuitem", { label: "Close Group" }, { command: onCloseGroup }),
			$E("menuitem", { label: "Rename Group\u2026" }, { command: onRenameGroup }),
			$EL("menu", [ $E("menupopup") ], { label: "Move Group To\u2026" }),
			$E("menuseparator"),
			$E("menuitem", { label: "New Tab" }, { command: onOpenNewTab }),
			$E("menuitem", { label: "New Subgroup\u2026" }, { command: onCreateSubGroup }),
			$E("menuseparator"),
			$E("menuitem", { label: "Bookmark Group" }, { command: onBookmarkGroup })
		], {
			id: GROUP_MENUITEM_CONTEXT_ID
		});
		popupset.appendChild(groupContext);

		// Tab menuitem context menu
		let tabContext = $E("menupopup", { id: TAB_MENUITEM_CONTEXT_ID });
		popupset.appendChild(tabContext);

		return function() {
			popupset.removeChild(groupContext);
			popupset.removeChild(tabContext);
		}
	}

	// To be called after panorana has been loaded otherwise it will pick the wrong active group
	function registerEventHandler() {
		listen(window, gBrowser.tabContainer, "TabSelect", onTabSelectHandler, false);
		listen(window, gBrowser.tabContainer, "TabOpen", onTabOpenHandler, false);
		listen(window, gBrowser.tabContainer, "TabClose", onTabCloseHandler, false);
		listen(window, gBrowser.tabContainer, "TabMove", onTabMoveHandler, false);
	}

	unload(createGroupsMenu(), window);
	if (GroupItems) {
		updateMenubarMenus();
		updateMenuLabels();
		registerEventHandler();
	}
	unload(function() {
		let menubar = $("main-menubar");
		if (menubar) {
			let menus = menubar.childNodes;
			for (let i = menus.length - 1; i >= 0; --i) {
				let id = menus[i].getAttribute("id");
				if (id && id.match(/^TABGROUPS_MENU/)) {
					menubar.removeChild(menus[i]);
				}
			}
		}
	}, window);
	unload(createContextMenu(), window);

	// Sort groupItems
	if (getPref("sortGroupNames"))
		GU.sortGroups();

	registerEventHandler();
	updateMenubarMenus();
	updateMenuLabels();

	for (let key in PREFS)
		prefsObserver.trigger(key);
}

function startup(data, reason) {
	AddonManager.getAddonByID(data.id, function(addon) {
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/moz-utils.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/my-utils.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/debug.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/prefs.js").spec, global);

		startDebugger();

		setDefaultPrefs();

		// Load stylesheet
		let styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
		let styleUri = addon.getResourceURI("res/style.css");
		styleSheetService.loadAndRegisterSheet(styleUri, styleSheetService.AGENT_SHEET);
		unload(function() {
			if (styleSheetService.sheetRegistered(styleUri, styleSheetService.AGENT_SHEET))
				styleSheetService.unregisterSheet(styleUri, styleSheetService.AGENT_SHEET);
		});

		watchWindows(processWindow, "navigator:browser");
	});
}

function shutdown(data, reason) {
	if (reason != APP_SHUTDOWN) {
		unload();
		stopDebugger();
	}
}

function install() {}
function uninstall() {}

// vim: set ts=4 sw=4 sts=4 et:
