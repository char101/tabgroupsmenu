// Some code/ideas borrowed from Restartless Restart extension

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;
Cu.import("resource://gre/modules/Services.jsm");
let ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);

const NS_XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const PREFIX = "grouptabs-";
const MENUID = PREFIX + "menu";
const MENUBTN = PREFIX + "btn";

const ATTR_TYPE = PREFIX + "type"
const TYPE_GROUP = "group";
const TYPE_TAB = "tab";
const TYPE_GROUPTAB = "grouptab"
const TYPE_MAIN_POPUP = "main-popup";

const POPUP_CLASS = PREFIX + "popup";

let cleanupList = [];
let started = false;

function log(msg) {
	let cs = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
	if (typeof(msg) == "object") {
		msg = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON).encode(msg);
	}
	cs.logStringMessage("tabgroupsmenu: " + msg);
}

function copyattr(el1, el2, attr) {
	if (el2.hasAttribute(attr)) {
		el1.setAttribute(attr, el2.getAttribute(attr));
	}
}

function set_type(el, type)  el.setAttribute(ATTR_TYPE, type);

function remove(el) el.parentNode.removeChild(el);

// FUNCTIONAL FUNCTIONS ///////////////////////////////////////////////////////////////////////////

// ChromeWindow -> document -> window [#main-window] -> tabbrowser -> tab -> browser -> [contentWindow | contentDocument]
function processWindow(win) {
	// {{
	dumpSession(win);
	// }}
	
	// win: ChromeWindow
	let doc = win.document; // XULDocument
	let gBrowser = win.gBrowser; // XULElement(tabbrowser)
	// set GroupItems when the menu is shown
	let tabviewWindow = win.TabView.getContentWindow();
	let GroupItems = null;
	if (tabviewWindow) {
		GroupItems = tabviewWindow.GroupItems;
	}
	let deleteList = [];

	// Get element with id
	function $(id) doc.getElementById(id);
	function $A(el, attr, def) (el.hasAttribute(attr) ? el.getAttribute(attr) : def);
	
	// Create element with optional properties
	function $E(tag, props, eventhandlers) {
		let el = doc.createElementNS(NS_XUL, tag);
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
		let el = doc.createElementNS(NS_XUL, tag);
		children.forEach(function(child) el.appendChild(child));
		return el;
	}

	// From: http://blog.stevenlevithan.com/archives/faster-trim-javascript
	function trim(str) {
		str = str.replace(/^\s\s*/, '');
		let ws = /\s/;
		let i = str.length;
		while (ws.test(str.charAt(--i)));
		return str.slice(0, i + 1);
	}

	function isSessionOk(tab) {
		let str = ss.getTabValue(tab, "tabview-tab");
		return ! (str === undefined || str === "");
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
		gBrowser.mTabContainer.selectedIndex = event.target.value;
	}
	
	function createGroup(event) {
		let title = win.prompt("Enter group title (required):");
		if (title) {
			title = trim(title);
			if (title) {
				if (GroupItems.groupItems.some(function(group) group.getTitle() == title)) {
					win.alert("Group with title \"" + title + "\" already exists.");
					return;
				}
				let GroupItem = win.TabView.getContentWindow().GroupItem;
				let newgroup = new GroupItem(null, { title: title, immediately: true, bounds: { left: 10, top: 10, width: 50, height: 50 } });
				newgroup.newTab();
				let newitem = newgroup.getChild(0);
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
			if (tab.tabItem && tab.tabItem.parent != group) {
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
			newname = trim(newname);
			if (newname && newname != group.getTitle()) {
				if (GroupItems.groupItems.some(function(group) group.getTitle() == newname)) {
					win.alert("Group with title \"" + title + "\" already exists.");
					return;
				}
				group.setTitle(newname);		
			}
		}
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
		if (! tab.pinned && isSessionOk(tab)) {
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
		if (tab.tabItem && tab.tabItem.parent == group) {
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
		
		if (tab.tabItem !== undefined && tab.tabItem !== null && tab.tabItem.parent) {
			let oldGid = tab.tabItem.parent.id;
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

			let oldGroup = tab.tabItem.parent;
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
					gBrowser.mTabContainer.selectedIndex = index;
				}
			};
		} else {
			// Dropping orphaned tab
			GroupItems.moveTabToGroupItem(tab, gid);
		}
			
		group.reorderTabItemsBasedOnTabOrder();
		
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
		let tabs = gBrowser.mTabContainer;
		
		group.reorderTabItemsBasedOnTabOrder();
		
		// Clear submenu
		while (mp.firstChild) {
			mp.removeChild(mp.firstChild);
		}

		let children = group.getChildren();
		if (children.length > 0) {
			group.getChildren().forEach(function(tabitem) {
				tab = tabitem.tab;
				if (isSessionOk(tab)) {
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
				}
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
				log("Panorama loaded");
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

		let mi = $E("menuitem", { label: "New Group\u2026", "class": "menu-iconic" });
		mi.addEventListener("command", createGroup, false);
		popup.appendChild(mi);
	
		popup.appendChild($E("menuseparator"));
		
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
			
			let mp = $E("menupopup", { id: PREFIX + "group-popup-" + arr[1] });
			mp.addEventListener("popupshowing", showGroupTabsMenu, false);
			mp.addEventListener("popuphiding", onGroupPopupHiding, false);
			
			m.appendChild(mp);
			popup.appendChild(m);
		});

		// List of tabs not under any group
		let orphanTabs = [];
		let invalidSessionTabs = [];
		let tabs = gBrowser.mTabContainer.childNodes;
		for (let i = 0, len = tabs.length; i < len; i++) {
			let tab = tabs[i];
			if (! tab.tabItem || tab.tabItem.parent == null) {
				orphanTabs.push([i, tab]);
			} else if (! isSessionOk(tab)) {
				invalidSessionTabs.push([i, tab]);
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

		if (invalidSessionTabs.length) {
			if (orphanTabs.length) {
				popup.appendChild($E("menuseparator"));
			}
			invalidSessionTabs.forEach(function(arr) {
				let index = arr[0];
				let tab = arr[1];
				let cls = "menuitem-iconic";
				if (tab.selected) {
					cls += " current";
				} else if (isUnloaded(tab)) {
					cls += " unloaded";
				}
				cls += " fake";
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
	}
	
	function setupMenu() {
		let menubar = $("main-menubar");
		
		let tabsMenu = $E("menu", {
			id: MENUID,
			label: "TabGroups",
			accesskey: "G",
			context: PREFIX + "extra-context"
		});
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

	function setupStylesheet() {
		let ss = doc.styleSheets[0];
		let ssfrom = ss.cssRules.length;
		let rules = [
			".menuitem-iconic > .menu-iconic-left > .menu-iconic-icon { width: 16px; height: 16px; list-style-image: url(chrome://global/skin/icons/folder-item.png); -moz-image-region: rect(0px, 16px, 16px, 0px); }",
			".menuitem-iconic[busy] > .menu-iconic-left > .menu-iconic-icon { list-style-image: url('chrome://global/skin/throbber/Throbber-small.gif') !important; }",
			".menu-iconic > .menu-iconic-left > .menu-iconic-icon { list-style-image: url('chrome://browser/skin/tabview/tabview.png'); -moz-image-region: rect(0px, 90px, 16px, 72px); }",
			".menu-iconic:-moz-drag-over { text-decoration: underline; border: 1px dotted #666; }",
			".current > .menu-iconic-text { font-weight: bold; }",
			"menuitem.marked .menu-iconic-text { color: #0000FF !important; }",
			"menuitem.unloaded .menu-iconic-text { color: #777; }",
			"menuitem.fake .menu-iconic-text { color: #B60000; }",
			"menu.loading > .menu-iconic-left > .menu-iconic-icon { list-style-image: url(chrome://browser/skin/places/searching_16.png); }"
		];
		rules.forEach(function(rule) {
			ss.insertRule("." + POPUP_CLASS + " " + rule, ss.cssRules.length);
		});

		return function() {
			for (let i = ssfrom + rules.length - 1; i >= ssfrom; --i) {
				ss.deleteRule(i);
			}
		};
	}

	function setupUiButton() {
		// Embed in tabview button
		let tabviewButton = doc.getElementById("tabview-button");
		let btnPopup = null;
		if (tabviewButton) {
			tabviewButton.setAttribute("type", "menu-button");
			
			// Embed tabgroups menu under this button
			btnPopup = $E("menupopup", { 
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
			tabviewButton.appendChild(btnPopup);
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
			$E("menuitem", { label: "Rename Group\u2026" }, { command: renameGroup })
		]);
		// Cannot hide the menu if the context is shown because then the menu will not be selected again
		groupContextMenu.setAttribute("id", PREFIX + "group-context");
		parent.appendChild(groupContextMenu);

		let debugContext = $EL("menupopup", [
			// $E("menuitem", { label: "Fix tab sessionstore" }, { command: function() fixTabsSessionStore(win, GroupItems) }),
			// $E("menuitem", { label: "Dump visible tabs" }, { command: function() dumpVisibleTabs(win) }),
			/* $E("menuitem", { label: "Dump orphaned tabs" }, { command: function() {
				if (! GroupItems) {
					win.alert("Click the menu first to load panorama");
					return;
				}
				let tabs = GroupItems.getOrphanedTabs();
				if (tabs.length > 0) {
					tabs.forEach(function(tabitem) log(tabitem.tab.getAttribute("label")));
				} else {
					log("No orphaned tabs");
				}
			}}), */
			$E("menuitem", { label: "Dump tabs without session" }, { command: function() dumpTabsWithoutSession(win) }),
		]);
		debugContext.setAttribute("id", PREFIX + "extra-context");
		parent.appendChild(debugContext);
		
		return function() {
			parent.removeChild(groupContextMenu);
			parent.removeChild(debugContext);
		};
	}

	// CLEANUP ///////////////////////////////////////////////////////////////////////////////////////
	let clids = [];
	clids.push(cleanupList.push(setupMenu()));
	clids.push(cleanupList.push(setupStylesheet()));
	clids.push(cleanupList.push(setupUiButton()));
	clids.push(cleanupList.push(setupContextMenu()));
	
	function onWindowUnload() {
		clids.forEach(function(id) cleanupList[id-1] = null);
	}
	win.addEventListener("unload", onWindowUnload, false);
	// END CLEANUP ///////////////////////////////////////////////////////////////////////////////////
}

// EXTENSION FUNCTIONS ////////////////////////////////////////////////////////////////////////////

function startup() {
	if (started) return; 
	started = true;

	// {{
	log("startup");
	// }}

	let browserWins = Services.wm.getEnumerator("navigator:browser");
	
	while (browserWins.hasMoreElements()) {
		processWindow(browserWins.getNext());
	}
	
	function windowHandler(subject, topic) {
		if ("domwindowopened" != topic) return;
		let winLoad = function() {
			subject.removeEventListener("load", winLoad, false);
			if ("navigator:browser" == subject.document.documentElement.getAttribute("windowtype")) {
				processWindow(subject);	
			}
		}
		subject.addEventListener("load", winLoad, false);
	}
	Services.ww.registerNotification(windowHandler);
	cleanupList.push(function() Services.ww.unregisterNotification(windowHandler));

	// {{
	startDebugger();
	// }}
}

function shutdown() {
	if (! started) return;
	started = false;

	// {{
	log("shutdown");
	// }}
	
	for (let [, cleaner] in Iterator(cleanupList)) {
		cleaner && cleaner();
	}

	// {{
	stopDebugger();
	// }}
}

function install() {
	startup(); 
}

function uninstall() { 
	shutdown();
}

// {{
function startDebugger() {
	let jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);  
	if (! jsd.isOn) {
		jsd.asyncOn({ 
			onDebuggerActivated: function() {
				jsd.errorHook = {  
					onError: function(message, fileName, lineNo, colNo, flags, errnum, exc) {  
						log(message + "@" + fileName + "@" + lineNo + "@" + colNo + "@" + errnum + "\n");  
								  
						// check message type  
						var jsdIErrorHook = Components.interfaces.jsdIErrorHook;  
						var messageType;          
						if (flags & jsdIErrorHook.REPORT_ERROR)  
							messageType = "Error";  
						if (flags & jsdIErrorHook.REPORT_WARNING)  
							messageType = "Warning";  
						if (flags & jsdIErrorHook.REPORT_EXCEPTION)  
							messageType = "Uncaught-Exception";  
						if (flags & jsdIErrorHook.REPORT_STRICT)  
							messageType += "-Strict";  
				  
						// log("errorHook: " + messageType + "\n");  
				  
						return true;   // trigger debugHook  
						// return true; if you do not wish to trigger debugHook  
					}  
				};
				jsd.debugHook = {  
					onExecute: function(frame, type, rv) {  
						stackTrace = "";  
						for (var f = frame; f; f = f.callingFrame) {  
							stackTrace += f.script.fileName + "@" + f.line + "@" + f.functionName + "\n";  
						}  
						log("debugHook: " + stackTrace);
				  
						return Components.interfaces.jsdIExecutionHook.RETURN_CONTINUE;  
					}  
				};
			}
		});
	}
}

function stopDebugger() {
	let jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);  
	if (jsd.isOn) {
		jsd.off();
		jsd.errorHook = null;
		jsd.debugHook = null;
	}
}

function dumpSession(window) {
	let ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);

	window.document.addEventListener("SSTabRestoring", function(event) {
		let tab = event.target;
		let strTab = ss.getTabValue(tab, "tabview-tab");
		if (strTab != "") {
			let data = JSON.parse(strTab);
			log("tab -> " + data.groupID);
		}
	}, false);
}

// }}

function dumpVisibleTabs(win) {
	let ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
	let groups = JSON.parse(ss.getWindowValue(win, "tabview-group"));
	for each(tab in win.gBrowser.visibleTabs) {
		let str = ss.getTabValue(tab, "tabview-tab");
		let group = "???";
		if (str != "") {
			let data = JSON.parse(str);
			if (data) {
				group = groups[data.groupID].title;
			}
		}
		log(group + " - " + tab.getAttribute("label"));
	}
}

function dumpWindow(win) {
	let ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
	log("window sessionstore: " + ss.getWindowValue(win, "tabview-group"));
}

function dumpTabsWithoutSession(win) {
	let ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
	for (let i = 0, n = win.gBrowser.tabs.length; i < n; i++) {
		let tab = win.gBrowser.tabs[i];
		if (tab.pinned) {
			continue;
		}
		if (! tab.tabItem) {
			log("No tabitem: " + tab.getAttribute("label"));
		} else {
			let str = ss.getTabValue(tab, "tabview-tab");
			if (str === undefined || str == "") {
				log("No sessionstore: " + tab.getAttribute("label"));
			} else {
				let data = JSON.parse(str);
				if (data === null) {
					log("Session data is null: " + tab.getAttribute("label"));
				}
			}
		}
	}
}

// Not all tabs have associated tabview-tab sessionstore data. These tabs get attached to the last selected tab on restore.
// Here we iterate through all tabs and set sessionstore data for tabs which do not have it.
function fixTabsSessionStore(win, GroupItems) {
	if (! GroupItems) {
		win.alert("Click the menu first to load panorama");
		return;
	}

	let title = "Tabs with no session data";
	let group = null;
	for (let i = 0, n = GroupItems.groupItems.length; i < n; i++) {
		if (GroupItems.groupItems[i].getTitle() == title) {
			group = GroupItems.groupItems[i];
			break;
		}
	}
	if (group === null) {
		let GroupItem = win.TabView.getContentWindow().GroupItem;
		group = new GroupItem(null, { title: title, immediately: true, bounds: { left: 10, top: 10, width: 50, height: 50 } });
	}

	let TabItem = win.TabView.getContentWindow().TabItem;
	
	
	for (let i = 0, n = win.gBrowser.tabs.length; i < n; i++) {
		let tab = win.gBrowser.tabs[i];
		if (! tab.tabItem) {
			continue;
		}
		let loose = false;
		
		let str = ss.getTabValue(tab, "tabview-tab");
		if (str === undefined || str == "") {
			loose = true;
		} else {
			let data = JSON.parse(str);
			if (data === null) {
				loose = true;
			}
		}

		if (loose) {
			log("Fix: " + tab.getAttribute("label"));
			// Load tab if not loaded
			if (tab.getAttribute("ontap") === true) {
				BarTap.loadTabContents(tab);
			}
			GroupItems.moveTabToGroupItem(tab, group.id);
			tab.tabItem.save();
		}
	}
}
