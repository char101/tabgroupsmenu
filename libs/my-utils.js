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
    let GroupItems = window.TabView.getContentWindow().GroupItems;
    let obj = {};
    
    obj.findGroup = function GU_findGroup(spec) {
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

    obj.getFormattedTitle = function GU_getFormattedTitle(group, prefix) {
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
            if (gr.getTitle().indexOf(prefix) == 0) {
                ++nSubGroups;
                nTabs += gr.getChildren().length;
            }
        });
        if (nTabs || nSubGroups) {
            if (nTabs) 
                title += " (" + nTabs + " tab" + (nTabs > 1 ? "s" : "");
            if (nSubGroups) 
                title += ", " + nSubGroups + " group" + (nSubGroups > 1 ? "s" : "");
            title += ")";
        }
        return title;
    };

    obj.createGroup = function GU_createGroup(name, prefix) {
        let newGroup = GroupItems.newGroup();
        newGroup.setTitle(obj.joinTitle(prefix, name));
        newGroup.newTab();
        let newitem = newGroup.getChild(0);
        gBrowser.selectedTab = newitem.tab;
        return newGroup;
    };

    obj.createIfNotExists = function GU_createIfNotExists(title) {
        let group = obj.findGroup(title);
        if (! group) {
            group = GroupItems.newGroup();
            group.setTitle(title);
        }
        return group;
    };

    obj.createTabInGroup = function GU_createTabInGroup(group) {
		GroupItems.setActiveGroupItem(group);
		gBrowser.loadOneTab("about:blank", { inBackground: false });
    };

    obj.renameGroup = function GU_renameGroup(group, newname) {
        let title = group.getTitle();
        
        let newtitle = obj.joinTitle(obj.splitTitle(title).prefix, newname);
        group.setTitle(newtitle);
        
        let prefix = title + GROUP_SEPARATOR;
        let newprefix = newtitle + GROUP_SEPARATOR;
        GroupItems.groupItems.forEach(function (gr) {
            if (gr.getTitle().indexOf(prefix) == 0) {
                gr.setTitle(newprefix + gr.getTitle().substr(prefix.length));
            }
        });
    };

    obj.moveGroup = function GU_moveGroup(srcGroup, dstGroup) {
        // move srcgroup under dstgroup
        let srcTitle = srcGroup.getTitle();
        let newName;
        if (dstGroup) {
            let dstTitle = dstGroup.getTitle();
            newName = obj.joinTitle(dstTitle, obj.splitTitle(srcTitle).name);
        } else {
            // move to top
            newName = obj.splitTitle(srcTitle).name;
        }
        let existingGroup = obj.findGroup(newName);
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
                gr.setTitle(obj.joinTitle(newPrefix, obj.splitTitle(title).name));
            }
        });
    };

    obj.closeGroup = function GU_closeGroup(group) {
        // Close children
        GroupItems.groupItems.forEach(function(gr) {
            if (obj.isChild(gr, group)) {
                obj.closeGroup(gr);
            }
        });
        group.destroy();
    };

    // Extract display name without prefix
    obj.splitTitle = function GU_splitTitle(title) {
        let parts = title.split(GROUP_SEPARATOR);
        let name = parts.pop();
        return {
            prefix: parts.join(GROUP_SEPARATOR),
            name: name
        };
    };

    obj.joinTitle = function GU_joinTitle(prefix, name) {
        return prefix ? (prefix + GROUP_SEPARATOR + name) : name;
    };

    obj.isChild = function GU_isChild(childGroup, parentGroup) {
        return childGroup.getTitle().indexOf(parentGroup.getTitle() + GROUP_SEPARATOR) === 0;
    };

    return obj;
}

function createWindowFuncs(window) {
    let {gBrowser} = window;
    let obj = {}
    let promptService = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);

    obj.selectTab = function WU_selectTab(tabIndex) {
        gBrowser.tabContainer.selectedIndex = tabIndex;
    };

    obj.prompt = function WU_prompt(title, text, value) {
        let input = { value: value };
        let check = { value: false };
        if (promptService.prompt(window, title, text, input, null, check)) {
            return input.value;
        }
    };

    obj.alert = function WU_alert(title, text) {
        promptService.alert(window, title, text);
    };

    obj.confirm = function WU_confirm(title, text) {
        return promptService.confirm(window, title, text);        
    };

    return obj;
}

// vim: set ts=4 sw=4 sts=4 et:
