let consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
let jsonService = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);

function LOG(msg) {
    if (typeof(msg) == "object") {
        msg = jsonService.encode(msg);
    }
    consoleService.logStringMessage("tabgroupsmenu: " + msg);
}

function startDebugger() {
    let jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);  
    if (! jsd.isOn) {
        jsd.asyncOn({ 
            onDebuggerActivated: function() {
                jsd.errorHook = {  
                    onError: function(message, fileName, lineNo, colNo, flags, errnum, exc) {  
                        LOG(message + "@" + fileName + "@" + lineNo + "@" + colNo + "@" + errnum + "\n");  
                                  
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
                  
                        // LOG("errorHook: " + messageType + "\n");  
                  
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
                        LOG("debugHook: " + stackTrace);
                  
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
            LOG("tab -> " + data.groupID);
        }
    }, false);
}

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
        LOG(group + " - " + tab.getAttribute("label"));
    }
}

function dumpWindow(win) {
    let ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
    LOG("window sessionstore: " + ss.getWindowValue(win, "tabview-group"));
}

function dumpTabsWithoutSession(win) {
    let ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
    for (let i = 0, n = win.gBrowser.tabs.length; i < n; i++) {
        let tab = win.gBrowser.tabs[i];
        if (tab.pinned) {
            continue;
        }
        if (! getTabItem(tab)) {
            LOG("No tabitem: " + tab.getAttribute("label"));
        } else {
            let str = ss.getTabValue(tab, "tabview-tab");
            if (str === undefined || str == "") {
                LOG("No sessionstore: " + tab.getAttribute("label"));
            } else {
                let data = JSON.parse(str);
                if (data === null) {
                    LOG("Session data is null: " + tab.getAttribute("label"));
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
        if (! getTabItem(tab)) {
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
            LOG("Fix: " + tab.getAttribute("label"));
            // Load tab if not loaded
            if (tab.getAttribute("ontap") === true) {
                BarTap.loadTabContents(tab);
            }
            GroupItems.moveTabToGroupItem(tab, group.id);
            getTabItem(tab).save();
        }
    }
}

// vim: set ts=4 sw=4 sts=4 et:
