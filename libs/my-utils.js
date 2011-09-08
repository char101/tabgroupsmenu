function copyattr(el1, el2, attr) {
    if (el2.hasAttribute(attr)) {
        el1.setAttribute(attr, el2.getAttribute(attr));
    }
}

// Remove element
function remove(el) {
    el.parentNode.removeChild(el);
}

function $A(el, attr, def) {
    return (el.hasAttribute(attr) ? el.getAttribute(attr) : def);
}

function $T(tab) tab._tabViewTabItem;

/**
 * General utility functions
 */
function createGeneralFuncs(window) {
	const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    
	let {document} = window;

    // Get element with id
    function $(id) {
        return document.getElementById(id);
    }
	
	// Create element with optional properties
	function $E(tag, props, eventhandlers) {
		let el = document.createElementNS(XUL_NS, tag);
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

	function $EL(tag, children, attrs) {
		let el = document.createElementNS(XUL_NS, tag);
		if (typeof(children) == "object" && children instanceof Array)
			children.forEach(function(child) el.appendChild(child));
		if (typeof(attrs) == "object") 
			for (let key in attrs) 
				el.setAttribute(key, attrs[key]);
		return el;
	}

    // string format
    function $F() {
        let args = arguments; // an object
        let str = args["0"];
        let narg = args.length;
        return str.replace(/{(\d)}/g, function(match, i) {
            return i <= narg ? args[parseInt(i, 10)+1+""] : "{" + i + "}";
        });
    }

    return {
        $: $,
        $E: $E,
        $EL: $EL,
        $F: $F
    };
}

/**
 * Create functions related to tabgrouping associated with a window
 */
function createGroupFuncs(window) {
    let {document, gBrowser} = window;
    let GroupItems = window.TabView.getContentWindow() == null ? null : window.TabView.getContentWindow().GroupItems;
    let GU = {};
   
    GU.onPanoramaLoaded = function GU_onPanoramaLoaded() {
        GroupItems = window.TabView.getContentWindow().GroupItems;
    };
    
    GU.findGroup = function GU_findGroup(spec) {
        let group = null;
        if (typeof(spec) === "number") {
            return GroupItems.groupItem(spec);
        } else if (typeof(spec) === "string") {
            GroupItems.groupItems.forEach(function(gr) {
                if (gr.getTitle() === spec) {
                    group = gr;
                    return;
                }
            });
        }
        return group;
    };

    GU.removePrefix = function GU_removePrefix(title, prefix) {
        return prefix ? title.substr(prefix.length + GROUP_SEPARATOR.length) : title;
    };

    // getTitle which handles group without title
    GU.getTitle = function GU_getTitle(group) {
        if (typeof(group) == "string")
            return group;
        let title = group.getTitle();
        if (! title)
            title = "(Anonymous: " + group.id + ")";
        return title;
    };

    GU.getBasename = function GU_getBasename(group) {
        let title = typeof(group) == "string" ? group : group.getTitle();
        let pos = title.lastIndexOf(GROUP_SEPARATOR);
        if (pos != -1)
            title = title.substr(pos + GROUP_SEPARATOR.length);
        return title;
    };
    
    GU.getMenuLabel = function GU_getFormattedTitle(group, prefix) {
        let title = GU.getTitle(group);
        if (prefix) {
            title = GU.removePrefix(title, prefix);
        }
        let nSubGroups = 0, nTabs = group.getChildren().length;
        let prefix = title + GROUP_SEPARATOR;
        GroupItems.groupItems.forEach(function(gr) {
            if (GU.isChild(gr, group)) {
                ++nSubGroups;
                nTabs += gr.getChildren().length;
            }
        });
        if (nTabs || nSubGroups) {
            title += " (";
            if (nTabs) {
                title += nTabs + " tab" + (nTabs > 1 ? "s" : "");
                if (nSubGroups)
                    title += ", ";
            }
            if (nSubGroups) 
                title += nSubGroups + " group" + (nSubGroups > 1 ? "s" : "");
            title += ")";
        }
        return title;
    };

    GU.createGroup = function GU_createGroup(name, prefix, openInBg) {
        let newGroup = GroupItems.newGroup();
        newGroup.setTitle(GU.joinTitle(prefix, name));
        if (! openInBg) {
            newGroup.newTab();
            let newitem = newGroup.getChild(0);
            gBrowser.selectedTab = newitem.tab;
        }
        return newGroup;
    };

    GU.createIfNotExists = function GU_createIfNotExists(title) {
        let group = GU.findGroup(title);
        if (! group) {
            group = GroupItems.newGroup();
            group.setTitle(title);
        }
        return group;
    };

    GU.createTabInGroup = function GU_createTabInGroup(group) {
        // In newer version this automatically creates a new tab
		GroupItems.setActiveGroupItem(group);
        if (group.getChildren().length == 0) {
		    return gBrowser.loadOneTab("about:blank", { inBackground: false });
        }
    };

    GU.selectGroup = function GU_selectGroup(group) {
        if (! group)
            return;
		if (group == GroupItems.getActiveGroupItem())
			return;
		let tabItem = group.getActiveTab();
		if (! tabItem) {
			tabItem = group.getChild(0);
		}
        if (! tabItem) {
            GU.createTabInGroup(group);
            tabItem = group.getChild(0);
        }
		if (tabItem) {
			gBrowser.selectedTab = tabItem.tab;
			GroupItems.setActiveGroupItem(group);
			return true;
		}
		return false;
	};

    GU.renameGroup = function GU_renameGroup(group, newname) {
        let title = group.getTitle();
        
        let newtitle = GU.joinTitle(GU.splitTitle(title).prefix, newname);
        group.setTitle(newtitle);
        
        let prefix = title + GROUP_SEPARATOR;
        let newprefix = newtitle + GROUP_SEPARATOR;
        GroupItems.groupItems.forEach(function (gr) {
            if (gr.getTitle().indexOf(prefix) == 0) {
                gr.setTitle(newprefix + gr.getTitle().substr(prefix.length));
            }
        });
    };

    GU.moveGroup = function GU_moveGroup(srcGroup, dstGroup) {
        // move srcgroup under dstgroup
        let srcTitle = srcGroup.getTitle();
        let newName;
        if (dstGroup) {
            let dstTitle = dstGroup.getTitle();
            newName = GU.joinTitle(dstTitle, GU.splitTitle(srcTitle).name);
        } else {
            // move to top
            newName = GU.splitTitle(srcTitle).name;
        }
        let existingGroup = GU.findGroup(newName);
        if (existingGroup) {
            // Move tabs from srcGroup to existingGroup
            srcGroup.getChildren().forEach(function(tabitem) {
                GroupItems.moveTabToGroupItem(tabitem.tab, existingGroup.id);
            });
            srcGroup.destroy();
            srcGroup = existingGroup;
        } else {
            srcGroup.setTitle(newName);
        }

        // move children of srcgroup under the new srcgroup
        let oldPrefix = srcTitle + GROUP_SEPARATOR;
        let newPrefix = srcGroup.getTitle();
        GroupItems.groupItems.forEach(function(gr) {
            let title = gr.getTitle();
            if (title.indexOf(oldPrefix) === 0) {
                gr.setTitle(GU.joinTitle(newPrefix, GU.splitTitle(title).name));
            }
        });
    };

    GU.closeGroup = function GU_closeGroup(group) {
        // Close children
        let children = [];
        for (let i = 0, n = GroupItems.groupItems.length; i < n; ++i) {
            if (GU.isChild(GroupItems.groupItems[i], group)) {
                children.push(GroupItems.groupItems[i]);
            }
        }
        while (children.length) {
            let child = children.pop();
            child.destroy();
        }
        group.destroy();
    };

    // Extract display name without prefix
    GU.splitTitle = function GU_splitTitle(title) {
        let parts = title.split(GROUP_SEPARATOR);
        let name = parts.pop();
        return {
            prefix: parts.join(GROUP_SEPARATOR),
            name: name
        };
    };

    GU.joinTitle = function GU_joinTitle(prefix, name) {
        return prefix ? (prefix + GROUP_SEPARATOR + name) : name;
    };

    GU.isChild = function GU_isChild(childGroup, parentGroup) {
        return GU.getTitle(childGroup).indexOf(GU.getTitle(parentGroup) + GROUP_SEPARATOR) === 0;
    };

    GU.isParent = function GU_isParent(group, parent) {
        let title = GU.getTitle(group);
        let parentTitle = GU.getTitle(parent);
        let rpos = title.lastIndexOf(GROUP_SEPARATOR);
        if (rpos == -1)
            return (parent == null || parent == undefined) ? true : false;
        if (parent == null || parent == undefined)
            return false;
        return title.substr(0, rpos) == parentTitle;
    };

    GU.getLevel = function GU_getLevel(title) {
        if (typeof(title) == "object") {
            title = title.getTitle();
        }
        let level = 0;
        let pos = -1;
        while (1) {
            pos = title.indexOf(GROUP_SEPARATOR, pos + 1);
            if (pos == -1)
                break
            ++level;
        }
        return level;
    };

    GU.hasSubgroup = function GU_hasSubgroup(group) {
        let title = group.getTitle();
        if (! title)
            return false;
        let prefix = title + GROUP_SEPARATOR;
        return GroupItems.groupItems.some(function(gr) gr.getTitle().indexOf(prefix) === 0);
    };

    GU.getNumberOfGroups = function GU_getNumberOfGroups() {
        let el = document.getElementById("tabviewGroupsNumber");
        if (el) {
            return parseInt(el.getAttribute("groups"), 10);
        }
        return null;
    };

    GU.getNumberOfTabsInActiveGroup = function GU_getNumberOfTabsInActiveGroup() {
        let group = GroupItems.getActiveGroupItem();
        if (group) {
            return group.getChildren().length;
        }
    };

    GU.preventEmptyActiveGroup = function UI_preventEmptyActiveGroup() {
        let group = GroupItems.getActiveGroupItem();
        if (group && group.getChildren().length == 0)
            gBrowser.selectedTab = GU.createTabInGroup(group);
    };

    GU.canMove = function GU_canMove(srcGroup, dstGroup) {
        let srcTitle = GU.getTitle(srcGroup);
        let dstTitle = GU.getTitle(dstGroup);
        return srcTitle != dstTitle &&
               ! GU.isChild(dstTitle, srcTitle) &&
               ! GU.isParent(srcTitle, dstTitle);
    };

    GU.bookmarkGroup = function GU_bookmarkGroup(group) {
        let bm = Cc["@mozilla.org/browser/nav-bookmarks-service;1"].getService(Ci.nsINavBookmarksService);
        let ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
        let title = GU.getTitle(group);
        let folder = bm.createFolder(bm.bookmarksMenuFolder, title, bm.DEFAULT_INDEX);
        let children = group.getChildren();
        for (let i = 0, n = children.length; i < n; ++i) {
            let tab = children[i].tab;
            let browser = gBrowser.getBrowserForTab(tab);
            let uri = null;
            if (browser) {
                if (browser.currentURI)
                    uri = browser.currentURI.spec;
                if (browser.userTypedValue)
                    uri = browser.userTypedValue;
            }
            if (uri != null && uri != undefined && uri != "" && uri != "about:blank") {
                bm.insertBookmark(folder, ios.newURI(uri, null, null), bm.DEFAULT_INDEX, tab.getAttribute("label"));
            }
        }
        let prompt = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
        prompt.alert(window, "Bookmark Created", 'Bookmark folder "' + title + '" created with ' + children.length + " entr" + (children.length > 1 ? "ies" : "y"));
    };

    return GU;
}

function createWindowFuncs(window) {
    let {gBrowser} = window;
    let WU = {}
    let promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

    WU.selectTab = function WU_selectTab(tabIndex) {
        gBrowser.tabContainer.selectedIndex = tabIndex;
    };

    WU.prompt = function WU_prompt(title, text, value) {
        let input = { value: value };
        let check = { value: false };
        if (promptService.prompt(window, title, text, input, null, check)) {
            return input.value;
        }
    };

    WU.alert = function WU_alert(title, text) {
        promptService.alert(window, title, text);
    };

    WU.confirm = function WU_confirm(title, text) {
        return promptService.confirm(window, title, text);        
    };

    WU.confirmCheck = function WU_confirmCheck(title, text, checkmsg) {
        let checkstate = { value: false };
        let ret = promptService.confirm(window, title, text, checkmsg, checkstate);
        return [ret, checkstate.value];
    };

    WU.promptCheck = function WU_promptCheck(title, text, val, checkmsg) {
        let value = { value: val };
        let check = { value: false };
        let ret = promptService.prompt(window, title, text, value, checkmsg, check);
        return [ret, value.value, check.value];
    }

    WU.getNumberOfTabs = function WU_getNUmberOfTabs() {
        return gBrowser.tabs.length;  
    };

    WU.getTabURL = function WU_getTabURL(tab, defaultValue) {
        let browser = gBrowser.getBrowserForTab(tab);
        if (browser) {
            if (browser.currentURI)
                return browser.currentURI.spec;
            if (browser.userTypedValue)
                return browser.userTypedValue;
        }
        return defaultValue;
    };

    WU.isUnloaded = function WU_isUnloaded(tab) {
        return !tab.currentURI && tab.linkedBrowser.userTypedValue != null;
    };

    return WU;
}

function createUIFuncs(window) {
    let {document} = window;
    let UI = {};
	let {$} = createGeneralFuncs(window);
    
    /**
     * Mark panorama loading in given element
     */
    UI.markLoading = function UI_markLoading() {
        let menu = $(GROUPS_MENU_ID);
        if (menu) {
            menu.setAttribute("class", "menu-iconic");
            menu.setAttribute("image", "chrome://browser/skin/places/searching_16.png");
        }
        let btn = $(TABVIEW_BUTTON_ID);
        if (btn) {
            btn.setAttribute("image", "chrome://browser/skin/places/searching_16.png");
        }
    };

    UI.unmarkLoading = function UI_unmarkLoading() {
        let menu = $(GROUPS_MENU_ID);
        if (menu) {
            menu.setAttribute("class", "");
            menu.removeAttribute("image");
        }
        let btn = $(TABVIEW_BUTTON_ID);
        if (btn) {
            btn.removeAttribute("image");
        }
    };

    UI.openPopup = function UI_openPopup(popup, group, openGroup) {
        if (! popup)
            return;
        
        UI.clearPopup(popup);
        if (popup.id == GROUPS_POPUP_ID) {
            $(GROUPS_MENU_ID).open = false;
            $(GROUPS_MENU_ID).open = true;
        } else {
            popup.hidePopup();
            popup.openPopup($(TABVIEW_BUTTON_ID), "after_pointer", 0, 0, false, false);
        }

        // Select given group (menu -> menupopup -> [menu|menuitem]
        if (group) {
            let title = typeof(group) == "string" ? group : group.getTitle();
            if (! title)
                return;
            let parts = title.split(GROUP_SEPARATOR);
            if (! openGroup)
                parts.pop();
            while (parts.length) {
                let label = parts.shift();
                for (let i = 0, n = popup.children.length; i < n; ++i) {
                    let child = popup.children[i];
                    if (child.tagName == "menu" && child.getAttribute("alt_label") == label) {
                        child.open = true;
                        popup = child.firstChild;
                        break;
                    }
                }
            }
        }
    };

	UI.currentPopup = function UI_currentPopup() {
		if ($(GROUPS_MENU_ID).open) {
			return $(GROUPS_POPUP_ID);
		}
        if ($(TABS_MENU_ID).open) {
            return $(TABS_POPUP_ID);
        }
		let popup = $(BUTTON_POPUP_ID);
		if (popup && popup.state == "open") {
			return popup;
		}
		return null;
	};
	
	UI.closePopup = function UI_closePopup(popup) {
		if (popup == undefined) {
			// Find open popup
			popup = UI.currentPopup();
		}
		if (popup) {
			popup.hidePopup();
		}
	};

	UI.clearPopup = function UI_clearPopup(popup) {
		while (popup.firstChild) {
			popup.removeChild(popup.firstChild);
		}
	};

    UI.findPopup = function UI_findPopup(element) {
        while (true) {
            if (element.id == GROUPS_POPUP_ID || element.id == TABS_POPUP_ID || element.id == GROUPS_BTNPOPUP_ID) {
                return element;
            }
            element = element.parentNode;
            if (! element)
                break;
        }
        return null;
    };

    UI.isTabSelected = function UI_isTabSelected(menuitem) {
        return menuitem.hasAttribute("class") && menuitem.getAttribute("class").match(/marked/);
    };

    UI.isMultipleTabSelected = function UI_isMultipleTabSelected(menuitem) {
        let menu = menuitem.parentContainer;
        for (let i = 0, n = menu.itemCount; i < n; ++i) {
            let item = menu.getItemAtIndex(i);
            if (item.tagName == "menuitem" && item != menuitem && UI.isTabSelected(item)) {
                return true;
            }
        }
        return false;
    };

    UI.getSelectedTabs = function UI_getSelectedTabs(menuitem) {
        let tabs = [menuitem];
        let menu = menuitem.parentContainer;
        for (let i = 0, n = menu.itemCount; i < n; ++i) {
            let item = menu.getItemAtIndex(i);
            if (item !== menuitem && UI.isTabSelected(item)) {
                tabs.push(item);
            }
        }
        //LOG("Selected tabs are:\n" + tabs.map(function(v) v.getAttribute("label")).join("\n"));
        return tabs;
    };
    
    return UI;
}

// vim: set ts=4 sw=4 sts=4 et:
