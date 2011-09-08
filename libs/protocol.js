Cu.import("resource://gre/modules/XPCOMUtils.jsm");

let Protocol = function Protocol() {
    let classID = Components.ID("77c82a10-d843-11e0-9572-0800200c9a66");
    let name = "tabgroupsmenu";
    let contractID = "@mozilla.org/network/protocol;1?name=" + name;
    let installPath = null;

    let ios = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);

    let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

    function ProtocolHandler() { }
    ProtocolHandler.prototype = {
        /* nsIProtocolHandler attributes */
        get scheme() {
            return name;
        },
        get protocolFlags() {
            return (Ci.nsIProtocolHandler.URI_STD | Ci.nsIProtocolHandler.URI_IS_LOCAL_RESOURCE | Ci.nsIProtocolHandler.URI_DANGEROUS_TO_LOAD);
        },
        get defaultPort() {
            return -1;
        },    
       
        /* nsISupports */
        QueryInterface: XPCOMUtils.generateQI([Ci.nsISupports, Ci.nsISupportsWeakReference, Ci.nsIProtocolHandler]),
        
        createInstance: function createInstance(outer, iid) {
            if (outer)
                throw Cr.NS_ERROR_NO_AGGREGATION;
            return this.QueryInterface(iid);
        },

        /* nsIProtocolHandler */

        allowPort: function allowPort(port, scheme) {
            return false;
        },

        newURI: function newURI(spec, charset, baseURI) {
            var uri = Cc["@mozilla.org/network/standard-url;1"].createInstance(Ci.nsIStandardURL);
            uri.init(uri.URLTYPE_STANDARD, -1, spec, charset, baseURI);
            uri.mutable = false;
            return uri;
        },

        newChannel: function newChannel(uri) {
            let uri;
            if (installPath.isDirectory()) {
                let file = installPath.clone();
                file.append("chrome");
                let parts = uri.path.substr(1).split("/");
                while (parts.length) {
                    file.append(parts.shift());
                }
                uri = ios.newFileURI(file);
            } else {
                uri = ios.newURI("jar:" + ios.newFileURI(installPath).spec + "!" + "/chrome" + uri.path, null, null);
            }
            let channel = ios.newChannelFromURI(uri);
            channel.originalURI = uri;
            channel.owner = Cc["@mozilla.org/systemprincipal;1"].createInstance(Ci.nsIPrincipal);
            return channel;
        }
    };

    this.handler = new ProtocolHandler();

    this.register = function register(argInstallPath) {
        installPath = argInstallPath;
        registrar.registerFactory(classID, name, contractID, this.handler);
    };

    this.unregister = function unregister() {
        installPath = null;
        registrar.unregisterFactory(classID, this.handler);
    };
};
