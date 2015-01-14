let consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
let jsonService = Cc["@mozilla.org/dom/json;1"].createInstance(Ci.nsIJSON);

function LOG(msg) {
    if (typeof(msg) == "object") {
        msg = jsonService.encode(msg);
    }
    consoleService.logStringMessage("tabgroupsmenu: " + msg);
}

function startDebugger() {
    // let jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);
    // if (! jsd.isOn) {
    //     jsd.asyncOn({
    //         onDebuggerActivated: function() {
    //             jsd.errorHook = {
    //                 // TODO: only report error from tabgroups ext
    //                 onError: function(message, fileName, lineNo, colNo, flags, errnum, exc) {
    //                     // check message type
    //                     var jsdIErrorHook = Components.interfaces.jsdIErrorHook;
    //                     var messageType;
    //                     if (flags & jsdIErrorHook.REPORT_ERROR)
    //                         messageType = "Error";
    //                     else if (flags & jsdIErrorHook.REPORT_WARNING)
    //                         messageType = "Warning";
    //                     else if (flags & jsdIErrorHook.REPORT_EXCEPTION)
    //                         messageType = "Uncaught-Exception";
    //                     if (flags & jsdIErrorHook.REPORT_STRICT)
    //                         messageType += "-Strict";
    //
    //                     LOG(messageType + ": " + message + "@" + fileName + "@" + lineNo + "@" + colNo + "@" + errnum + "\n");
    //
    //                     // dumpStack();
    //
    //                     // trigger debugHook
    //                     return false;
    //                 }
    //             };
    //             jsd.debugHook = {
    //                 onExecute: function(frame, type, rv) {
    //                     let stackTrace = "";
    //                     for (let f = frame; f; f = f.callingFrame) {
    //                         stackTrace += f.script.fileName + "@" + f.line + "@" + f.functionName + "\n";
    //                     }
    //                     LOG("debookHook");
    //                     LOG(stackTrace);
    //                     return Components.interfaces.jsdIExecutionHook.RETURN_CONTINUE;
    //                 }
    //             };
    //         }
    //     });
    // }
}

function stopDebugger() {
    // let jsd = Cc["@mozilla.org/js/jsd/debugger-service;1"].getService(Ci.jsdIDebuggerService);
    // if (jsd.isOn) {
    //     jsd.off();
    //     jsd.errorHook = null;
    //     jsd.debugHook = null;
    // }
}

function dumpStack() {
    for (var frame = Components.stack; frame; frame = frame.caller)
        LOG("STACK: " + frame.filename + ":" + frame.lineNumber);
};

// vim: set ts=4 sw=4 sts=4 et:
