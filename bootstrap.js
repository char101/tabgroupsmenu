const {utils: Cu, classes: Cc, interfaces: Ci} = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const EXT_ID = "tabgroupsmenu@char.cc";
const global = this;

const PREFIX = "grouptabs-";

const GROUPS_MENU_ID = PREFIX + "menu";
const GROUPS_POPUP_ID = PREFIX + "menu-popup";
const GROUPS_CONTEXT_ID = PREFIX + "context";
const GROUPS_MENU_LABEL = "TabGroups";

const TABS_MENU_ID = PREFIX + "cgm";
const TABS_POPUP_ID = PREFIX + "cgp";

const GROUPS_BTN_ID = PREFIX + "btn";
const GROUPS_BTNPOPUP_ID = PREFIX + "btn-popup";

const BUTTON_MENU_ID = PREFIX + "btn-menu";
const BUTTON_POPUP_ID = PREFIX + "btn-popup";

const TABVIEW_BUTTON_ID = "tabview-button";

const POPUP_CLASS = PREFIX + "popup";

const GROUP_SEPARATOR = " ~> ";

function processWindow(window) {
	let {document, gBrowser} = window;
	let GroupItems = window.TabView.getContentWindow() == null ? null : window.TabView.getContentWindow().GroupItems;
	let gTabView = gBrowser.TabView;
	let deleteList = [];

	let {$, $E, $EL} = createGeneralFuncs(window);

	let GU = createGroupFuncs(window);
	let WU = createWindowFuncs(window);
	let UI = createUIFuncs(window);

	function onSelectTab(event) {
		WU.selectTab(event.target.value);
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
			}
		}
	}

	function onCreateSubGroup(event) {
		let group = GU.findGroup(document.popupNode.value);
		let title = group.getTitle();
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
			}
		}
	}
	
	function onCreateTabInGroup(event) {
		let group = GU.findGroup(event.target.value);
		GU.createTabInGroup(group);
	}

	// Todo: select unloaded tab
	function onCloseGroup(event) {
		let menu = document.popupNode;
		let group = GU.findGroup(menu.value);
        let popup = UI.findPopup(menu);
		
		// close = really close, closeAll = undoable close, closeHidden = close previously closeAll-ed group?
		if (WU.confirm("Close Group", "Really close this group and its children: \"" + group.getTitle() + "\" ?\n\nWarning: this operations cannot be undone!")) {
			GU.closeGroup(group);
		}

		// Reopen menu
		UI.openPopup(popup);
	}

	function onRenameGroup(event) {
        let popup = UI.findPopup(document.popupNode);
		let group = GroupItems.groupItem(document.popupNode.value);
		let title = group.getTitle();
		let parts = title.split(GROUP_SEPARATOR);
		let oldname = parts.pop();
		let newname = WU.prompt("Rename Group (" + title + ")", "New group name: ", oldname);
		if (newname) {
			newname = newname.trim();
			if (newname && newname != oldname) {
				let fullname = parts.length > 0 ? parts.join(GROUP_SEPARATOR) + GROUP_SEPARATOR + newname : newname;
				if (GroupItems.groupItems.some(function(group) group.getTitle() == fullname)) {
					WU.alert("Failed to rename group", "Group with title \"" + newname + "\" already exists.");
					return;
				}
				GU.renameGroup(group, newname);
			}
		}
		// Reopen menu
		UI.openPopup(popup);
	}

	function onSelectGroup(event) {
		if (event.button == 0) {
            if (GU.selectGroup(GU.findGroup(event.target.value)))
                UI.closePopup(); // close menu if group successfully selected
		}
	}	

	function onOpenNewTab(event) {
		let menu = document.popupNode;
		let gid = menu.value;
		let group = GroupItems.groupItem(gid);
		GroupItems.setActiveGroupItem(group);
		let newTab = gBrowser.loadOneTab("about:blank", {inBackground: false});
	}	

	function onGroupPopupShowing(event) {
		deleteList = [];
	}

	function onGroupPopupHiding(event) {
		if (deleteList.length) {
			let tabs = [];
			deleteList.forEach(function(index) {
				tabs.push(gBrowser.tabs[index]);
			});
			tabs.forEach(function(tab) gBrowser.removeTab(tab));
		}
	}

	function onTabClick(event) {
		if (event.button == 1) {
			// Can't  directly remove tab because then the tabindex would have been changing
			deleteList.push(event.target.value);
			// refresh menu
			let popup = event.target.parentNode;
			popup.removeChild(event.target);
			// refresh label
			let id = popup.getAttribute("id");
			if (id != GROUPS_POPUP_ID && id != GROUPS_BTNPOPUP_ID) {
				let menu = popup.parentNode;
				let title = menu.getAttribute("label");
				menu.setAttribute("label", title.replace(/^(.*) \((\d+)\)$/, function(str, label, count) { return label + " (" + (parseInt(count, 10) - 1) + ")"; }));
			}
			event.stopPropagation();
		} else if (event.button == 2) {
			let menuitem = event.target;
			let cls = menuitem.hasAttribute("class") ? menuitem.getAttribute("class") + " " : "";
			if (! cls.match(/marked/)) {
				menuitem.setAttribute("class", cls + "marked");
			} else {
				menuitem.setAttribute("class", cls.replace(/\s*\bmarked\b/, ""));
			}
			event.stopPropagation();
		}
	}

	function getGroupsMenuLabel(isTabClose) {
		isTabClose = isTabClose || false;
		
		let title = GROUPS_MENU_LABEL;
		if (GroupItems) {
			if (getPref("showGroupCount") || getPref("showTabCount")) {
				title += " (";
				if (getPref("showTabCount")) {
					let tabCount = WU.getNumberOfTabs();
					if (tabCount == null || tabCount == undefined) {
						tabCount = "-";
					} else if (isTabClose)
						tabCount--; // this event is triggered before the tab is removed
					title += tabCount;
					if (getPref("showGroupCount")) {
						title += "/";
					}
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
		}
		return title;
	}
	
	function getTabsMenuLabel() {
		let title = "Tabs";
		if (GroupItems) {
			if (getPref("useCurrentGroupNameInTabsMenu")) {
				let group = GroupItems.getActiveGroupItem();
				if (group) {
					title = group.getTitle();
				}
			}
			if (getPref("showTabCount")) {
				let tabCount = GU.getNumberOfTabsInActiveGroup();
				if (tabCount) {
					title += " (" + tabCount + ")";
				}
			}
		}
		return title;
	}

	// Called when switching tab
	function onTabSelectHandler(event) {
        if (GroupItems) {
            if (getPref("useCurrentGroupNameInTabsMenu") || getPref("showTabCount")) {
                let group = GroupItems.getActiveGroupItem();
                if (group) {
                    let lastGroupId = $(TABS_MENU_ID).getAttribute("groupid");
                    if (group.id == lastGroupId) {
                        return;
                    }
                    $(TABS_MENU_ID).setAttribute("groupid", group.id);
                }
                $(TABS_MENU_ID).setAttribute("label", getTabsMenuLabel());
            }
        }
	}

	function updateMenuLabels(isTabClose) {
		if (getPref("showTabCount") || getPref("showGroupCount")) {
			$(GROUPS_MENU_ID).setAttribute("label", getGroupsMenuLabel(isTabClose));
		}
		if (getPref("showTabCount")) {
			$(TABS_MENU_ID).setAttribute("label", getTabsMenuLabel());
		}
	}

	function onTabOpenHandler(event) {
        if (GroupItems)
		    updateMenuLabels();
	}

	function onTabCloseHandler(event) {
        if (GroupItems)
		    updateMenuLabels(true);
	}

	function onTabMoveHandler(event) {
        if (GroupItem)
		    updateMenuLabels();
	}

	// DRAG DROP //////////////////////////////////////////////////////////////////////////////////////

	function onTabDragStart(event) {
		let target = event.target; // could be a menuitem (tab) or menu (group)
		let canMove = true;
		if (target.tagName == "menuitem") {
			let tab = gBrowser.tabs[target.value];
			if (! tab || tab.pinned) canMove = false;
		}
		if (canMove) {
			let dt = event.dataTransfer;
			dt.effectAllowed = "move";
			dt.dropEffect = "move";
			dt.mozSetDataAt("plain/text", target.value, 0); // value
			dt.mozSetDataAt("plain/text", target.tagName, 1); // type
			//dt.mozSetDataAt("plain/text", event.clientX, 1);
			//dt.mozSetDataAt("plain/text", event.clientY, 2);
		
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
				if (getTabItem(tab) && getTabItem(tab).parent == group) {
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
			let tabitem = getTabItem(tab);
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

				let allTabsMoved = false;
				if (queue.length == srcGroup.getChildren().length) {
					// All tabs are moved, prevent panorama from showing up by selecting the first moved tab
					allTabsMoved = true;
				}

				let dstGroupId = dstGroup.id;
				for (let i = 0, len = queue.length; i < len; ++i) {
					let index = queue[i];
					GroupItems.moveTabToGroupItem(gBrowser.tabs[index], dstGroupId);
					if (allTabsMoved && i == 0) {
						gBrowser.tabContainer.selectedIndex = index;
					}
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
			popup = GROUPS_POPUP_ID;
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
		if (popup) {
			UI.openPopup(popup);
		}
		
		event.stopPropagation();
	}

	// END DRAG DROP /////////////////////////////////////////////////////////////////////////////////
	
	function onSettings(event) {
		let prefs = {};
		for (let key in PREFS) {
			prefs[key] = getPref(key);
		}
		let dialog = window.openDialog(
			"resource://tabgroupsmenu/xul/options.xul", 
			"Preferences", 
			"dialog,centerscreen,modal",
			prefs
		);
		let changedPrefs = {};
		for (let key in prefs) {
			if (getPref(key) != prefs[key]) {
				changedPrefs[key] = prefs[key];
			}
		}
		if (Object.keys(changedPrefs).length) {
			// Save new set of options (cannot apply now because the uninstall checks the old value)
			setPref("newPrefs", JSON.stringify(changedPrefs));
			// reload addon
			AddonManager.getAddonByID(EXT_ID, function(addon) {
				addon.userDisabled = true;	
				addon.userDisabled = false;
			});
		}
	}
	
	function panoramaLoaded() {
		GroupItems = window.TabView.getContentWindow().GroupItems;
		GU.onPanoramaLoaded();
		updateMenuLabels();
	}

	// Show tab groups (on event)
	function showGroupsMenuHandler(event) {
		if (GroupItems == null) {
			let target = event.target;
			if (target.id == GROUPS_BTNPOPUP_ID) {
				target.hidePopup();
			} else if (target.id == GROUPS_POPUP_ID) {
				$(GROUPS_MENU_ID).open = false;
			}
			UI.markLoading();
			window.TabView._initFrame(function() {
				panoramaLoaded();
				showGroupsMenu(event.target);
				
				UI.unmarkLoading();
				
				if (target.id == GROUPS_BTNPOPUP_ID) {
					target.openPopup($(TABVIEW_BUTTON_ID), "after_pointer");
				} else if (target.id == GROUPS_POPUP_ID) {
					$(GROUPS_MENU_ID).open = true;
				}
			});
			return;
		}
			
		showGroupsMenu(event.target);
	}
	
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
		let groupItems = [];
		GroupItems.groupItems.forEach(function(group) groupItems.push(group));
		groupItems.sort(function(a, b) a.getTitle().localeCompare(b.getTitle()));

		let groupTitles = [];
		let addedTitles = [];
		groupItems.forEach(function(group) {
			let title = group.getTitle();
			if (! group.hidden && (! prefix || title.indexOf(prefix + GROUP_SEPARATOR) === 0)) {
				hasGroups = true;

				let displayTitle = title;
				if (prefix) {
					displayTitle = displayTitle.substr(prefix.length + GROUP_SEPARATOR.length);
				}
				displayTitle = displayTitle.split(GROUP_SEPARATOR)[0]
				
				if (addedTitles.indexOf(displayTitle) == -1) {
					addedTitles.push(displayTitle);
				
					group = GU.createIfNotExists(prefix ? (prefix + GROUP_SEPARATOR + displayTitle) : displayTitle);

					let cls = "menu-iconic tabgroup";
					if (activeGroup) {
						let pathPrefix = prefix ? prefix + GROUP_SEPARATOR + displayTitle : displayTitle;
						let activeTitle = activeGroup.getTitle();
						if (activeTitle === pathPrefix || activeTitle.indexOf(pathPrefix + GROUP_SEPARATOR) === 0) {
							cls += " current";
						}
					}
					groupTitles.push([displayTitle, group.id, cls]);
				}
			}
		});
		groupTitles.sort(function(a, b) a[0].localeCompare(b[0]));
		groupTitles.forEach(function(arr) {
			let m = $E("menu", {
				id: PREFIX + "group-" + arr[1],
				label: GU.getFormattedTitle(GroupItems.groupItem(arr[1]), prefix),
				value: arr[1],
				"class": arr[2]
			});
			m.setAttribute("context", GROUPS_CONTEXT_ID);
			// enable drop
			m.addEventListener("dragenter", onTabDragEnter, false);
			m.addEventListener("dragover", onTabDragOver, false);
			m.addEventListener("drop", onTabDrop, false);
			// enable drag
			m.addEventListener("dragstart", onTabDragStart, false);

			// Select tab in group by clicking on the group title
			m.addEventListener("click", onSelectGroup, true);
			
			let mp = $E("menupopup", { id: PREFIX + "group-popup-" + arr[1] });
			mp.addEventListener("popupshowing", showTabsMenuHandler, false);
			
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
			if (! getTabItem(tab) || getTabItem(tab).parent == null) {
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
				} else if (isUnloaded(tab)) {
					cls += " unloaded";
				}
				let mi = $E("menuitem", {
					id: PREFIX + "tab-" + index,
					value: index,
					"class": cls,
					label: $A(tab, "label")
				});
				copyattr(mi, tab, "image");
				copyattr(mi, tab, "busy");
				if ($A(tab, "selected")) {
					mi.setAttribute("style", "font-weight: bold");
				}
				mi.addEventListener("command", onSelectTab, false);
				mi.addEventListener("dragstart", onTabDragStart, false);
				mi.addEventListener("click", onTabClick, false);
				popup.appendChild(mi);
			});
		}

		if (! gid) {
			popup.appendChild($E("menuseparator"));
			
			let mi = $E("menuitem", { label: "New Group\u2026", "class": "menu-iconic" });
			mi.addEventListener("command", onCreateGroup, false);
			popup.appendChild(mi);

			let sep = $E("menuseparator");
			popup.appendChild(sep);
			
			let mi2 = $E("menuitem", { label: "Options" });
			mi2.addEventListener("command", onSettings, false);
			popup.appendChild(mi2);
		}
	} 

	function showTabsMenuHandler(event) {
		if (GroupItems == null) {
			UI.markLoading();
			$(TABS_MENU_ID).open = false;
			window.TabView._initFrame(function() {
				panoramaLoaded();
				showTabsMenuHandler(event);
				UI.unmarkLoading();
				$(TABS_MENU_ID).open = true;
			});
			return;
		}
		
		let popup = event.target; // menupopup
		let gid;
		
		if (popup.id == TABS_POPUP_ID) {
			gid = GroupItems.getActiveGroupItem().id;
		} else {
			gid = popup.parentNode.value;
		}
		if (! gid) {
			return;
		}

		showGroupsMenu(popup, gid);
		showTabsMenu(popup, gid);

		onGroupPopupShowing(event);
		
		event.stopPropagation();
	}
	
	function showTabsMenu(mp, gid) {
		let group = GroupItems.groupItem(gid);
		if (! group)
			return;
		let tabs = gBrowser.tabContainer;

		//group.reorderTabItemsBasedOnTabOrder();

		mp.addEventListener("popuphiding", onGroupPopupHiding, false);
		
		let children = group.getChildren();
		if (children.length > 0) {
			group.getChildren().forEach(function(tabitem) {
				tab = tabitem.tab;
                let cls = "menuitem-iconic";
                if (tab.selected) {
                    cls += " current";
                } else if (isUnloaded(tab)) {
                    cls += " unloaded";
                }
                let tabindex = tabs.getIndexOfItem(tab);
                let mi = $E("menuitem", {
                    id: PREFIX + "tab-" + tabindex,
                    class: cls,
                    label: $A(tab, "label"),
                    value: tabindex
                });
                copyattr(mi, tab, "image");
                copyattr(mi, tab, "busy");
                mi.addEventListener("command", onSelectTab, false);
                mi.addEventListener("dragstart", onTabDragStart, false);
                mi.addEventListener("click", onTabClick, false);
                mi.addEventListener("contextmenu", (function(event) {
                    event.preventDefault();
                    event.stopPropagation();
                }), false);
                mp.appendChild(mi);
			});
		} else if (! GU.hasSubgroup(group)) {
			// Group does not have tab so we add our new tab menu item
			let mi = $E("menuitem", {
				label: "Open New Tab",
				value: group.id
			});
			mp.appendChild(mi);
			mi.addEventListener("command", onCreateTabInGroup, false);
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
		if (getPref('openOnMouseOver')) {
			menu.addEventListener("mouseover", function(event) this.open = true, true);
			menu.addEventListener("click", function(event) this.open = true, true);
		}
		menubar.insertBefore(menu, menubar.lastChild);
		
		let popup = $E("menupopup", {
			id: GROUPS_POPUP_ID,
			class: POPUP_CLASS
		});
		popup.addEventListener("popupshowing", showGroupsMenuHandler, false);
		menu.appendChild(popup);

		return function() {
			menubar.removeChild(menu);
		};
	}

    // A menu in the menubar "GroupTabs" showing the list of tabs in the current group
    function createTabsMenu() {
        if (! getPref("showTabsMenu"))
            return;
        
        let menubar = $("main-menubar");
        let menu = $E("menu", {
			id: TABS_MENU_ID,
            label: getTabsMenuLabel()
        });
		if (! getPref("useCurrentGroupNameInTabsMenu")) {
			menu.setAttribute("accesskey", "a");
		}
        menubar.insertBefore(menu, menubar.lastChild);

        let popup = $E("menupopup", {
            id: TABS_POPUP_ID,
            class: POPUP_CLASS
        });
        popup.addEventListener("popupshowing", showTabsMenuHandler, false);
        menu.appendChild(popup);

        return function() {
            menubar.removeChild(menu);
        };
    }

	function createButtonMenu() {
		// Embed in tabview button
		let tabviewButton = $(TABVIEW_BUTTON_ID);
		let btnPopup = null;
		if (tabviewButton) {
			if (getPref("addButtonMenu") || getPref("replacePanoramaButton")) {
				// Embed tabgroups menu under this button
				btnPopup = $E("menupopup", { 
					id: GROUPS_BTNPOPUP_ID,
					class: POPUP_CLASS // this must be addes so that css rules above works
				});
				listen(window, btnPopup, "popupshowing", showGroupsMenuHandler, false);
				// Prevent firefox toolbar context menu
				listen(window, btnPopup, "context", function(event) {
					event.preventDefault();
					event.stopPropagation();
				}, false);
				tabviewButton.appendChild(btnPopup);

				if (getPref("addButtonMenu")) {
					tabviewButton.setAttribute("type", "menu-button");
				}
				
				if (getPref("replacePanoramaButton")) {
					listen(window, tabviewButton, "click", function(event) {
						if (event.target == tabviewButton) {
							btnPopup.openPopup(tabviewButton, "after_start", 0, 0, false, false);
							event.stopPropagation();
							event.preventDefault();
						}
					}, true);
				}
			}
		}

		return function() {
			if (tabviewButton) {
				let popup = $(GROUPS_BTNPOPUP_ID);
				if (popup) {
					tabviewButton.removeChild(popup);
					if (getPref("addButtonMenu")) {
						tabviewButton.removeAttribute("type");
					}
				}
			}
		};
	}

    /**
     * Create a context menu that will be displayed on right click on the menubar menu
     */
	function createContextMenu() {
		let context = $EL("menupopup", [
			$E("menuitem", { label: "Close Group" }, { command: onCloseGroup }),
			$E("menuitem", { label: "Rename Group\u2026" }, { command: onRenameGroup }),
			$E("menuseparator"),
			$E("menuitem", { label: "New Tab" }, { command: onOpenNewTab }),
			$E("menuseparator"),
			$E("menuitem", { label: "New Subgroup\u2026" }, { command: onCreateSubGroup })
		], {
            id: GROUPS_CONTEXT_ID
        });
		$("mainPopupSet").appendChild(context);

		return function() $("mainPopupSet").removeChild(context);
	}
	
	unload(createGroupsMenu(), window);
	unload(createTabsMenu(), window);
	unload(createButtonMenu(), window);
	unload(createContextMenu(), window);

	listen(window, gBrowser.tabContainer, "TabSelect", onTabSelectHandler, false);
	listen(window, gBrowser.tabContainer, "TabOpen", onTabOpenHandler, false);
	listen(window, gBrowser.tabContainer, "TabClose", onTabCloseHandler, false);
	listen(window, gBrowser.tabContainer, "TabMove", onTabMoveHandler, false);
}

function startup(data, reason) {
	AddonManager.getAddonByID(data.id, function(addon) {
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/moz-utils.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/my-utils.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/tab.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/debug.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/prefs.js").spec, global);

		startDebugger();

		setDefaultPrefs();

		// Apply new prefs
		let newPrefs = getPref("newPrefs");
		if (newPrefs != null && newPrefs != "") {
			let prefs = JSON.parse(newPrefs);
			for (key in prefs) {
				setPref(key, prefs[key]);
			}
		}

		// Set resource substitution
		let resource = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
		let alias = Services.io.newFileURI(data.installPath);
		if (! data.installPath.isDirectory()) {
			alias = Services.io.newURI("jar:" + alias.spec + "!/", null, null);
		}
		resource.setSubstitution("tabgroupsmenu", alias);
		unload(function() resource.setSubstitution("tabgroupsmenu", null));

		// Whitelist XUL (see https://github.com/jvillalobos/Remote-XUL-Manager/blob/master/extension/modules/rxmPermissions.js)
		let permSvc = Cc["@mozilla.org/permissionmanager;1"].getService(Ci.nsIPermissionManager);
		let ioSvc = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		let myURI = ioSvc.newURI("resource://tabgroupsmenu/xul/options.xul", null, null);
		permSvc.add(myURI, "allowXULXBL", 1);
		unload(function() {
			permSvc.remove(myURI, "allowXULXBL");
		});
 
		// Load stylesheet
		let styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
		let ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		let styleUri = ioService.newURI("resource://tabgroupsmenu/res/style.css", null, null);
		styleSheetService.loadAndRegisterSheet(styleUri, styleSheetService.AGENT_SHEET);
		unload(function() {
			if (styleSheetService.sheetRegistered(styleUri, styleSheetService.AGENT_SHEET))
				styleSheetService.unregisterSheet(styleUri, styleSheetService.AGENT_SHEET);
		});
		
		watchWindows(processWindow);
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
