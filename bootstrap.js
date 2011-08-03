const Cu = Components.utils;
const Cc = Components.classes;
const Ci = Components.interfaces;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/AddonManager.jsm");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const global = this;

const PREFIX = "grouptabs-";
const MENUID = PREFIX + "menu";
const MENUBTN = PREFIX + "btn";
const CURRENT_GROUP_MENU_ID = PREFIX + "cgm";
const CURRENT_GROUP_POPUP_ID = PREFIX + "cgp";

const ATTR_TYPE = PREFIX + "type"
const TYPE_GROUP = "group";
const TYPE_TAB = "tab";
const TYPE_GROUPTAB = "grouptab"
const TYPE_MAIN_POPUP = "main-popup";

const POPUP_CLASS = PREFIX + "popup";

const GROUP_SEPARATOR = " |:| ";

function initWindow(window) {
	if (window.TabView.getContentWindow() == null) {
		window.TabView._initFrame(function() processWindow(window));
	} else {
		processWindow(window);
	}
}

function processWindow(window) {
	let {document, gBrowser} = window;
	let GroupItems = window.TabView.getContentWindow().GroupItems;
	let gTabView = gBrowser.TabView;
	let deleteList = [];

	let {$, $E, $EL} = createGeneralFuncs(window);

	// Check if window already processed
	if ($(MENUID))
		return;
	
	let GU = createGroupFuncs(window);
	let WU = createWindowFuncs(window);

	function currentPopup() {
		return $( ($(MENUID).open ? MENUID : MENUBTN) + "-popup"  );
	}

	function closeMenu() {
		currentPopup().hidePopup();
	}
	
	function refreshMenu() {
		let popup = currentPopup();
		popup.hidePopup();
		popup.openPopup(popup.parentNode, "after_start", 0, 0, true, false);
	}

	function clearPopup(popup) {
		while (popup.firstChild) {
			popup.removeChild(popup.firstChild);
		}
	}

	function onSelectTab(event) {
		WU.selectTab(event.target.value);
	}
	
	function onCreateGroup(event) {
		let name = WU.prompt("Create New Group", "Enter group title:");
		if (name) {
			name = name.trim();
			if (name) {
				if (GU.findGroup(name)) {
					WU.alert("Cannot create group", 'Group "' + name + '" already exists');
					return;
				}
				GU.createGroup(name);
			}
		}
	}

	function onCreateSubGroup(event) {
		let group = GU.findGroup(document.popupNode.value);
		let title = group.getTitle();
		let name = WU.prompt("Create Subgroup of " + title, "Enter group title:");
		if (name) {
			name = name.trim();
			if (name) {
				let pathTitle = GU.joinTitle(title, name);
				if (GU.findGroup(pathTitle)) {
					WU.alert("Cannot create group", 'Group "' + name + '" already exists as child of "' + title + '"');
					return;
				}
				GU.createGroup(name, title);
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
		
		// close = really close, closeAll = undoable close, closeHidden = close previously closeAll-ed group?
		if (window.confirm("Really close this group and its children: \"" + group.getTitle() + "\" ?\n\nWarning: this operations cannot be undone!")) {
			GU.closeGroup(group);
		}

		// there is no use refreshing the menu here since tab switching remove the focus
		closeMenu();
	}

	function onRenameGroup(event) {
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
					window.alert("Group with title \"" + newname + "\" already exists.");
					return;
				}
				GU.renameGroup(group, newname);
			}
		}
	}

	function selectGroupEventHandler(event) {
		if (event.button == 0) {
			let groupItem = GU.findGroup(event.target.value);
            if (groupItem) {
                let activeGroupItem = GroupItems.getActiveGroupItem();
                if (groupItem == activeGroupItem) {
                    return;
                }
                selectGroup(groupItem);
                
                event.stopPropagation();
                event.preventDefault();
            }
		}
	}

	function selectGroup(groupItem) {
		// restore the last active tab in the group
		let activeTab = groupItem.getActiveTab();
		let tabItem = null;
		if (activeTab) {
			tabItem = activeTab;
		} else {
			// if not tab is active, use the first one
			var child = groupItem.getChild(0)
			if (child) {
				tabItem = child;
			}
		}
		if (tabItem) {
            gBrowser.selectedTab = tabItem.tab;
			closeMenu();
		} else {
			GroupItems.setActiveGroupItem(groupItem);
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
			if (id != (MENUID + "-popup") && id != (MENUBTN + "-popup")) {
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

	// Called when switching tab
	function onTabSelectHandler(event) {
		let group = GroupItems.getActiveGroupItem();
		if (group) {
			$(CURRENT_GROUP_MENU_ID).setAttribute("label", group.getTitle());
		}
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
		
		if (! ((type == "menu" && target.id == MENUID) ||
			   target.getAttribute(ATTR_TYPE) == TYPE_GROUP)) {
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
			let sourceGroup = GU.findGroup(value);
			let parts = sourceGroup.getTitle().split(GROUP_SEPARATOR);
			parts.pop();
			let sourcePrefix = parts.join(GROUP_SEPARATOR);
			// Can't drag to the same group, its children, or its immediate parent
			if ((! sourcePrefix && target.id == MENUID) || sourceGroup == group || (group && group.getTitle().indexOf(sourceGroup.getTitle() + GROUP_SEPARATOR) === 0) || (sourcePrefix && group && group.getTitle() == sourcePrefix)) {
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
		if (event.target.id != MENUID) {
			dstGroup = GU.findGroup(event.target.value);
		}

		if (type == "menuitem") {
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

		// Updating menu works but the drop target styles doesn't seems cleared
		closeMenu();
		
		event.stopPropagation();
	}

	// END DRAG DROP /////////////////////////////////////////////////////////////////////////////////

	// Show tab groups (on event)
	function showTabGroupsHandler(event) {
		clearPopup(event.target);
		showTabGroups(event.target); 
	}
	
	// Show tab groups under given popup
	function showTabGroups(popup, gid) {
		let prefix = gid ? GroupItems.groupItem(gid).getTitle() : null;

		clearPopup(popup);

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

					let cls = "menu-iconic";
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
			// Cannot set this there because TYPE_ATTR became literal value
			set_type(m, TYPE_GROUP);
			m.setAttribute("context", PREFIX + "group-context");
			// enable drop
			m.addEventListener("dragenter", onTabDragEnter, false);
			m.addEventListener("dragover", onTabDragOver, false);
			m.addEventListener("drop", onTabDrop, false);
			// enable drag
			m.addEventListener("dragstart", onTabDragStart, false);

			// Select tab in group by clicking on the group title
			m.addEventListener("click", selectGroupEventHandler, true);
			
			let mp = $E("menupopup", { id: PREFIX + "group-popup-" + arr[1] });
			mp.addEventListener("popupshowing", showGroupTabsHandler, false);
			
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
					label: $A(tab, "label"),
					ATTR_TYPE: TYPE_TAB
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

        popup.appendChild($E("menuseparator"));
		
        let mi = $E("menuitem", { label: "New Group\u2026", "class": "menu-iconic" });
		mi.addEventListener("command", onCreateGroup, false);
		popup.appendChild(mi);
	} 

	function showGroupTabsHandler(event) {
		let popup = event.target; // menupopup
		let gid;
		
		if (popup.id == CURRENT_GROUP_POPUP_ID) {
			gid = GroupItems.getActiveGroupItem().id;
		} else {
			gid = popup.parentNode.value;
		}
		if (! gid) {
			return;
		}

		showTabGroups(popup, gid);
		showGroupTabs(popup, gid);

		onGroupPopupShowing(event);
		
		event.stopPropagation();
	}
	
	function showGroupTabs(mp, gid) {
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
                set_type(mi, TYPE_GROUPTAB);
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
		} else {
			// Group does not have tab so we add our new tab menu item
			let mi = $E("menuitem", {
				label: "New Tab",
				value: group.id
			});
			mp.appendChild(mi);
			mi.addEventListener("command", onCreateTabInGroup, false);
		}
	}
	
    // Adds a menu to the menubar and to the panorama button
	function createTabGroupsMenu() {
		let menubar = $("main-menubar");
		
		let tabsMenu = $E("menu", {
			id: MENUID,
			label: "TabGroups",
			accesskey: "G",
			context: PREFIX + "extra-context"
		});
		// enable drop
		tabsMenu.addEventListener("dragenter", onTabDragEnter, false);
		tabsMenu.addEventListener("dragover", onTabDragOver, false);
		tabsMenu.addEventListener("drop", onTabDrop, false);
		if (getPref('openOnMouseOver')) {
			tabsMenu.addEventListener("mouseover", function(event) this.open = true, true);
			tabsMenu.addEventListener("click", function(event) this.open = true, true);
		}
		menubar.insertBefore(tabsMenu, menubar.lastChild);
		
		// the default reads from context attribute
		//tabsMenu.addEventListener("contextmenu", (function(event) event.preventDefault()), false);
		let tabsMenuPopup = $E("menupopup", {
			id: MENUID + "-popup",
			class: POPUP_CLASS
		});
		set_type(tabsMenuPopup, TYPE_MAIN_POPUP);
		tabsMenuPopup.addEventListener("popupshowing", showTabGroupsHandler, false);
		tabsMenu.appendChild(tabsMenuPopup);

		return function() {
			menubar.removeChild(tabsMenu);
		};
	}

    // A menu in the menubar "GroupTabs" showing the list of tabs in the current group
    function createTabsMenu() {
        let menubar = $("main-menubar");
        
		let currentGroup = GroupItems ? GroupItems.getActiveGroupItem() : null;
        let menu = $E("menu", {
			id: CURRENT_GROUP_MENU_ID,
            label: getPref("useCurrentGroupNameInTabsMenu") && currentGroup ? currentGroup.getTitle() : "Tabs"
        });
		if (! getPref("useCurrentGroupNameInTabsMenu")) {
			menu.setAttribute("accesskey", "a");
		}
        menubar.insertBefore(menu, menubar.lastChild);

        let popup = $E("menupopup", {
            id: CURRENT_GROUP_POPUP_ID,
            class: POPUP_CLASS
        });
        popup.addEventListener("popupshowing", showGroupTabsHandler, false);
        menu.appendChild(popup);

        return function() {
            menubar.removeChild(menu);
        };
    }

	function addMenuToPanoramaButton() {
		// Embed in tabview button
		let tabviewButton = $("tabview-button");
		let btnPopup = null;
		if (tabviewButton) {
            // Embed tabgroups menu under this button
            btnPopup = $E("menupopup", { 
                id: MENUBTN + "-popup",
                class: POPUP_CLASS // this must be addes so that css rules above works
            });
            set_type(btnPopup, TYPE_MAIN_POPUP);
            listen(window, btnPopup, "popupshowing", showTabGroupsHandler, false);
            // Prevent firefox toolbar context menu
			listen(window, btnPopup, "context", function(event) {
				event.preventDefault();
				event.stopPropagation();
			}, false);
            tabviewButton.setAttribute("type", "menu-button");    
            tabviewButton.appendChild(btnPopup);
            
            if (getPref('replacePanoramaButton')) {
                listen(window, tabviewButton, "click", function(event) {
					btnPopup.openPopup(tabviewButton, "after_start", 0, 0, false, false);
					event.stopPropagation();
					event.preventDefault();
				}, true);
			}
		}

		return function() {
			if (tabviewButton) {
				tabviewButton.removeChild(btnPopup);
				tabviewButton.removeAttribute("type");
			}
		};
	}

    /**
     * Create a context menu that will be displayed on right click on the menubar menu
     */
	function createContextMenu() {
		let parent = $("mainPopupSet");
		
		let groupContextMenu = $EL("menupopup", [
			$E("menuitem", { label: "Close Group" }, { command: onCloseGroup }),
			$E("menuitem", { label: "Rename Group\u2026" }, { command: onRenameGroup }),
			$E("menuseparator"),
			$E("menuitem", { label: "New Tab" }, { command: onOpenNewTab }),
			$E("menuseparator"),
			$E("menuitem", { label: "New Subgroup" }, { command: onCreateSubGroup })
		]);
		// Cannot hide the menu if the context is shown because then the menu will not be selected again
		groupContextMenu.setAttribute("id", PREFIX + "group-context");
		parent.appendChild(groupContextMenu);

		return function() {
			parent.removeChild(groupContextMenu);
		};
	}
	
	unload(createTabGroupsMenu(), window);
	if (getPref("showTabsMenu")) {
		unload(createTabsMenu(), window);
	}
	unload(addMenuToPanoramaButton(), window);
	unload(createContextMenu(), window);

	if (getPref("useCurrentGroupNameInTabsMenu")) {
		listen(window, gBrowser.tabContainer, "TabSelect", onTabSelectHandler, false);
	}
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

		// Set resource substitution
		let resource = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
		let alias = Services.io.newFileURI(data.installPath);
		if (! data.installPath.isDirectory()) {
			alias = Services.io.newURI("jar:" + alias.spec + "!/", null, null);
		}
		resource.setSubstitution("tabgroupsmenu", alias);
		unload(function() resource.setSubstitution("tabgroupsmenu", null));
 
		// Load stylesheet
		let styleSheetService = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
		let ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
		let styleUri = ioService.newURI("resource://tabgroupsmenu/res/style.css", null, null);
		styleSheetService.loadAndRegisterSheet(styleUri, styleSheetService.AGENT_SHEET);
		unload(function() {
			if (styleSheetService.sheetRegistered(styleUri, styleSheetService.AGENT_SHEET))
				styleSheetService.unregisterSheet(styleUri, styleSheetService.AGENT_SHEET);
		});
		
		watchWindows(initWindow);
		
		// make sure debugger is stopped last
		unload(stopDebugger);
	});
}
	
function shutdown(data, reason) {
	if (reason != APP_SHUTDOWN)
		unload();
}

function install() {}
function uninstall() {}

// vim: set ts=4 sw=4 sts=4 et:
