function copyattr(el1, el2, attr) {
    if (el2.hasAttribute(attr)) {
        el1.setAttribute(attr, el2.getAttribute(attr));
    }
}

// Remove element
function remove(el) {
    el.parentNode.removeChild(el);
}

function set_type(el, type) {
	el.setAttribute(ATTR_TYPE, type);
}

function $A(el, attr, def) {
    return (el.hasAttribute(attr) ? el.getAttribute(attr) : def);
}

function isUnloaded(tab) {
    return tab.getAttribute("ontap") || // bartab
           tab.linkedBrowser.userTypedValue != null;
}

/**
 * General utility functions
 */
function createGeneralFuncs(win) {
    let {document} = win;

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

	function $EL(tag, children) {
		let el = document.createElementNS(XUL_NS, tag);
		children.forEach(function(child) el.appendChild(child));
		return el;
	}

    return {
        $: $,
        $E: $E,
        $EL: $EL
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

    GU.getFormattedTitle = function GU_getFormattedTitle(group, prefix) {
        let title = group.getTitle();
        if (! title) {
            title = group.id;
        }
        if (prefix) {
            title = title.substr(prefix.length + GROUP_SEPARATOR.length);
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
		GroupItems.setActiveGroupItem(group);
		gBrowser.loadOneTab("about:blank", { inBackground: false });
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
        GroupItems.groupItems.forEach(function(gr) {
            if (GU.isChild(gr, group)) {
                GU.closeGroup(gr);
            }
        });
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
        return childGroup.getTitle().indexOf(parentGroup.getTitle() + GROUP_SEPARATOR) === 0;
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
            return el.getAttribute("groups");
        }
    };

    GU.getNumberOfTabsInActiveGroup = function GU_getNumberOfTabsInActiveGroup() {
        let group = GroupItems.getActiveGroupItem();
        if (group) {
            return group.getChildren().length;
        }
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

    WU.getNumberOfTabs = function GU_getNUmberOfTabs() {
        return gBrowser.tabs.length;  
    };

    return WU;
}

function createUIFuncs(window) {
    let {document} = window;
    let UI = {};
    
    /**
     * Mark panorama loading in given element
     */
    UI.markLoading = function UI_markLoading() {
        let menu = document.getElementById(GROUPS_MENU_ID);
        if (menu) {
            menu.setAttribute("class", "menu-iconic");
            menu.setAttribute("image", "chrome://browser/skin/places/searching_16.png");
        }
        let btn = document.getElementById(TABVIEW_BUTTON_ID);
        if (btn) {
            btn.setAttribute("image", "chrome://browser/skin/places/searching_16.png");
        }
    };

    UI.unmarkLoading = function UI_unmarkLoading() {
        let menu = document.getElementById(GROUPS_MENU_ID);
        if (menu) {
            menu.setAttribute("class", "");
            menu.removeAttribute("image");
        }
        let btn = document.getElementById(TABVIEW_BUTTON_ID);
        if (btn) {
            btn.removeAttribute("image");
        }
    };

    UI.openPopup = function UI_openPopup(popup) {
        if (popup.id == GROUPS_POPUP_ID) {
            document.getElementById(GROUPS_MENU_ID).open = false;
            document.getElementById(GROUPS_MENU_ID).open = true;
        } else {
            popup.hidePopup();
            popup.openPopup(document.getElementById(TABVIEW_BUTTON_ID), "after_pointer", 0, 0, false, false);
        }
    };

    return UI;
}

// vim: set ts=4 sw=4 sts=4 et:
