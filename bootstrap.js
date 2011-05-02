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

const ATTR_TYPE = PREFIX + "type"
const TYPE_GROUP = "group";
const TYPE_TAB = "tab";
const TYPE_GROUPTAB = "grouptab"
const TYPE_MAIN_POPUP = "main-popup";

const POPUP_CLASS = PREFIX + "popup";

function set_type(el, type) {
	el.setAttribute(ATTR_TYPE, type);
}

// ChromeWindow -> document -> window [#main-window] -> tabbrowser -> tab -> browser -> [contentWindow | contentDocument]
function processWindow(win) {
	// win: ChromeWindow
	let doc = win.document; // XULDocument
	let gBrowser = win.gBrowser; // tabbrowser -> has tabContainer (tabs)
	// set GroupItems when the menu is shown
	let tabviewWindow = win.TabView.getContentWindow();
	let GroupItems = null;
	if (tabviewWindow) {
		GroupItems = tabviewWindow.GroupItems;
	}
	let gTabView = gBrowser.TabView;
	let deleteList = [];

	// Get element with id
	function $(id) doc.getElementById(id);
	function $A(el, attr, def) (el.hasAttribute(attr) ? el.getAttribute(attr) : def);

	// Create element with optional properties
	function $E(tag, props, eventhandlers) {
		let el = doc.createElementNS(XUL_NS, tag);
		if (props) {
			for (let key in props) {
				if (key == "value") {
					el.value = props[key];
				} else {
					el.setAttribute(key, props[key]);
				}
			}
		}
		if (eventhandlers) {
			for (let event in eventhandlers) {
				el.addEventListener(event, eventhandlers[event], false);
			}
		}
		return el;
	}

	function $EL(tag, children) {
		let el = doc.createElementNS(XUL_NS, tag);
		children.forEach(function(child) el.appendChild(child));
		return el;
	}

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

	function selectTab(event) {
		gBrowser.tabContainer.selectedIndex = event.target.value;
	}
	
	function createGroup(event) {
		let title = win.prompt("Enter group title (required):");
		if (title) {
			title = title.trim();
			if (title) {
				LOG('a');
				if (GroupItems.groupItems.some(function(group) group.getTitle() == title)) {
					win.alert("Group with title \"" + title + "\" already exists.");
					return;
				}

				let newGroup = null;
				
				if (GroupItems.newGroup) {
					// FFb11?
					newGroup = GroupItems.newGroup();
					newGroup.setTitle(title);
				} else {
					let GroupItem = win.TabView.getContentWindow().GroupItem;
					let newGroup = new GroupItem([], { title: title, immediately: true, bounds: { left: 10, top: 10, width: 50, height: 50 } });
				}
				
				newGroup.newTab();
				let newitem = newGroup.getChild(0);
				gBrowser.selectedTab = newitem.tab;
			}
		}
	}
	
	function openNewTabInGroup(event) {
		let group = GroupItems.groupItem(event.target.value);
		GroupItems.setActiveGroupItem(group);
		let newTab = gBrowser.loadOneTab("about:blank", {inBackground: false});
	}

	// Todo: select unloaded tab
	function closeGroup(event) {
		let menu = doc.popupNode;
		let gid = menu.value;
		let group = GroupItems.groupItem(gid);
		for each(tab in gBrowser.tabs) {
			if (getTabItem(tab) && getTabItem(tab).parent != group) {
				gBrowser.selectedTab = tab;
				break;
			}
		}
		// close = really close, closeAll = undoable close, closeHidden = close previously closeAll-ed group?
		group.closeAll();

		// there is no use refreshing the menu here since tab switching remove the focus
		closeMenu();
	}

	function renameGroup(event) {
		let menu = doc.popupNode;
		let gid = menu.value;
		let group = GroupItems.groupItem(gid);
		let newname = win.prompt("New group name: ", group.getTitle());
		if (newname) {
			newname = newname.trim();
			if (newname && newname != group.getTitle()) {
				if (GroupItems.groupItems.some(function(group) group.getTitle() == newname)) {
					win.alert("Group with title \"" + title + "\" already exists.");
					return;
				}
				group.setTitle(newname);		
			}
		}
	}

	function selectGroupEventHandler(event) {
		if (event.button == 0) {
			let groupItem = GroupItems.groupItem(event.target.value);
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
			//GroupItems.updateActiveGroupItemAndTabBar(tabItem);
			closeMenu();
		} else {
			GroupItems.setActiveGroupItem(groupItem);
		}
	}

	function openNewTab(event) {
		let menu = doc.popupNode;
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

	// DRAG DROP //////////////////////////////////////////////////////////////////////////////////////

	function onTabDragStart(event) {
		let mi = event.target;
		let tab = gBrowser.tabs[mi.value];
		if (! tab.pinned) {
			let dt = event.dataTransfer;
			dt.effectAllowed = "move";
			dt.dropEffect = "move";
			dt.mozSetDataAt("plain/text", mi.value, 0); // the global tabindex
			dt.mozSetDataAt("plain/text", event.clientX, 1);
			dt.mozSetDataAt("plain/text", event.clientY, 2);
		
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

		if (target.tagName != "menu") {
			event.stopPropagation(); 
			return;
		}

		if (! (target.hasAttribute(ATTR_TYPE) && target.getAttribute(ATTR_TYPE) == TYPE_GROUP)) {
			event.stopPropagation();
			return;
		}
		
		let tabindex = event.dataTransfer.mozGetDataAt("plain/text", 0);
		let group = GroupItems.groupItem(target.value);
		let tab = gBrowser.tabs[tabindex];
		if (getTabItem(tab) && getTabItem(tab).parent == group) {
			event.stopPropagation();
			return;
		}
	
		event.preventDefault(); // allow dragover
		event.stopPropagation();
	}

	function onTabDrop(event) {
		let dt = event.dataTransfer;
		let tabindex = dt.mozGetDataAt("plain/text", 0);
		let menu = event.target;
		let gid = menu.value;
		let group = GroupItems.groupItem(gid);
		let tab = gBrowser.tabs[tabindex];
		let oldGid = null;
		
		if (getTabItem(tab) !== undefined && getTabItem(tab) !== null && getTabItem(tab).parent) {
			oldGid = getTabItem(tab).parent.id;
			let mi = $(PREFIX + "tab-" + tabindex);
		
			// check if the menuitem are marked
			let queue = []
			if (mi.hasAttribute("class") && mi.getAttribute("class").match(/marked/)) {
				let menu = $(PREFIX + "group-" + oldGid);
				for (let i = 0, len = menu.itemCount; i < len; i++) {
					let menuitem = menu.getItemAtIndex(i);
					if (menuitem.getAttribute("class").match(/marked/)) {
						queue.push(menuitem.value);
					}
				}
			} else {
				queue.push(tabindex);
			}

			let oldGroup = getTabItem(tab).parent;
			let allTabsMoved = false;
			if (queue.length == oldGroup.getChildren().length) {
				// all tabs are moved, if we move all tabs and there is no app tab, panorama will be shown,
				// so we select the first tab moved instead
				allTabsMoved = true;
			}
			for (let i = 0, len = queue.length; i < len; i++) {
				let index = queue[i];
				GroupItems.moveTabToGroupItem(gBrowser.tabs[index], gid);
				if (allTabsMoved && i == 0) {
					gBrowser.tabContainer.selectedIndex = index;
				}
			};
		} else {
			// Dropping orphaned tab
			GroupItems.moveTabToGroupItem(tab, gid);
		}

		group.reorderTabsBasedOnTabItemOrder();
		
		// Updating menu works but the drop target styles doesn't seems cleared
		closeMenu();
		
		event.stopPropagation();
	}

	// END DRAG DROP /////////////////////////////////////////////////////////////////////////////////

	function isUnloaded(tab) {
		return tab.getAttribute("ontap") || // bartab
			   tab.linkedBrowser.userTypedValue != null;
	}

	function showGroupTabsMenu(event) {
		let mp = event.target; // menupopup
		let gid = event.target.parentNode.value; // tabgroup id
		let group = GroupItems.groupItem(gid);
		let tabs = gBrowser.tabContainer;
		
		group.reorderTabItemsBasedOnTabOrder();
		
		// Clear submenu
		while (mp.firstChild) {
			mp.removeChild(mp.firstChild);
		}

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
                mi.addEventListener("command", selectTab, false);
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
				value: gid
			});
			mp.appendChild(mi);
			mi.addEventListener("command", openNewTabInGroup, false);
		}

		onGroupPopupShowing(event);
		
		event.stopPropagation();
	}

	function getGroupTitle(group) {
		let title = group.getTitle();
		if (! title) {
			title = group.id;
		}
		title = title + " (" + group.getChildren().length + ")";
		return title;
	}

	function showTabsMenuProxy(event) {
		if (GroupItems == null) {
			if (event.target.getAttribute("id") == MENUBTN + "-popup") {
				let popup = event.target;
				popup.hidePopup();
				let button = $("tabview-button");
				let oldImage = button.getAttribute("image");
				button.setAttribute("image", "chrome://browser/skin/places/searching_16.png");
				win.TabView._initFrame(function() {
					tabviewWindow = win.TabView.getContentWindow();
					GroupItems = tabviewWindow.GroupItems;
					button.setAttribute("image", oldImage);
					showTabsMenu(event);
					popup.openPopup(button, "after_pointer");
				});
			} else {
				let menu = $(MENUID);
				menu.open = false;
				menu.setAttribute("class", "menu-iconic");
				menu.setAttribute("image", "chrome://browser/skin/places/searching_16.png");
				win.TabView._initFrame(function() {
					tabviewWindow = win.TabView.getContentWindow();
					GroupItems = tabviewWindow.GroupItems;
					menu.setAttribute("class", "");
					menu.removeAttribute("image");
					menu.open = true;
				});
				// {{
				LOG("Panorama loaded");
				// }}
			}
		} else {
			showTabsMenu(event);
		}
	}
	
	function showTabsMenu(event) {
		let popup = event.target;
		
		// Clear it
		while (popup.firstChild) {
			popup.removeChild(popup.firstChild);
		}
		
		// Lisf of tab groups
		let hasGroups = false;
		let activeGroup = GroupItems.getActiveGroupItem();
		let groupTitles = [];
		GroupItems.groupItems.forEach(function(group) {
			if (! group.hidden) {
				hasGroups = true;
				let cls = "menu-iconic";
				if (activeGroup == group) {
					cls += " current";
				}
				groupTitles.push([getGroupTitle(group), group.id, cls]);
			}
		});
		groupTitles.sort(function(a, b) a[0].localeCompare(b[0]));
		groupTitles.forEach(function(arr) {
			hasGroups = true;
			let m = $E("menu", {
				label: arr[0],
				value: arr[1],
				"class": arr[2],
				id: PREFIX + "group-" + arr[1]
			});
			// Cannot set this there because TYPE_ATTR became literal value
			set_type(m, TYPE_GROUP);
			m.setAttribute("context", PREFIX + "group-context");
			m.addEventListener("dragenter", onTabDragEnter, false);
			m.addEventListener("dragover", onTabDragOver, false);
			m.addEventListener("drop", onTabDrop, false);

			// Select tab in group by clicking on the group title
			m.addEventListener("click", selectGroupEventHandler, true);
			
			let mp = $E("menupopup", { id: PREFIX + "group-popup-" + arr[1] });
			mp.addEventListener("popupshowing", showGroupTabsMenu, false);
			mp.addEventListener("popuphiding", onGroupPopupHiding, false);
			
			m.appendChild(mp);
			popup.appendChild(m);
		});

		// List of tabs not under any group (most probably app tabs)
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
				mi.addEventListener("command", selectTab, false);
				mi.addEventListener("dragstart", onTabDragStart, false);
				mi.addEventListener("click", onTabClick, false);
				popup.appendChild(mi);
			});
		}

        popup.appendChild($E("menuseparator"));
		
        let mi = $E("menuitem", { label: "New Group\u2026", "class": "menu-iconic" });
		mi.addEventListener("command", createGroup, false);
		popup.appendChild(mi);
	}
	
	function setupMenu() {
		let menubar = $("main-menubar");
		
		let tabsMenu = $E("menu", {
			id: MENUID,
			label: "TabGroups",
			accesskey: "G",
			context: PREFIX + "extra-context"
		});
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
		tabsMenuPopup.addEventListener("popupshowing", showTabsMenuProxy, false);
		tabsMenu.appendChild(tabsMenuPopup);

		return function() {
			menubar.removeChild(tabsMenu);
		};
	}

	function setupUiButton() {
		// Embed in tabview button
		let tabviewButton = doc.getElementById("tabview-button");
		let btnPopup = null;
		if (tabviewButton) {
            // Embed tabgroups menu under this button
            let btnPopup = $E("menupopup", { 
                id: MENUBTN + "-popup",
                class: POPUP_CLASS // this must be addes so that css rules above works
            });
            set_type(btnPopup, TYPE_MAIN_POPUP);
            btnPopup.addEventListener("popupshowing", showTabsMenuProxy, false);
            // Prevent firefox toolbar context menu
            btnPopup.addEventListener("context", (function(event) {
                event.preventDefault();
                event.stopPropagation();
            }), false);
            tabviewButton.setAttribute("type", "menu-button");    
            tabviewButton.appendChild(btnPopup);
            
            if (getPref('replacePanoramaButton')) {
                tabviewButton.addEventListener("click", function(event) {
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

	function setupContextMenu() {
		let parent = $("mainPopupSet");
		
		let groupContextMenu = $EL("menupopup", [
			$E("menuitem", { label: "Close Group" }, { command: closeGroup }),
			$E("menuitem", { label: "Rename Group\u2026" }, { command: renameGroup }),
			$E("menuseparator"),
			$E("menuitem", { label: "New Tab" }, { command: openNewTab })
		]);
		// Cannot hide the menu if the context is shown because then the menu will not be selected again
		groupContextMenu.setAttribute("id", PREFIX + "group-context");
		parent.appendChild(groupContextMenu);

		return function() {
			parent.removeChild(groupContextMenu);
		};
	}
	
	unload(setupMenu(), win);
	unload(setupUiButton(), win);
	unload(setupContextMenu(), win);
}

function startup(data, reason) {
	AddonManager.getAddonByID(data.id, function(addon) {
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/moz-utils.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/my-utils.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/tab.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/debug.js").spec, global);
		Services.scriptloader.loadSubScript(addon.getResourceURI("libs/prefs.js").spec, global);
		
		startDebugger();
		unload(stopDebugger);

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
		
		watchWindows(processWindow);
	});
}
	
function shutdown(data, reason) {
	if (reason != APP_SHUTDOWN)
		unload();
}

function install() {}
function uninstall() {}

// vim: set ts=4 sw=4 sts=4 et:
