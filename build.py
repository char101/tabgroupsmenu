import sys
import zipfile
import re
import glob
import os

cmt_re = re.compile(r'\s*//.*')
ver_re = re.compile(r'<version>[0-9a-z.]+</version>') 

if len(sys.argv) < 2:
    print "Usage: release.py version [debug:1|0, default 0]"
    sys.exit(0)
version = sys.argv[1]

is_debug = False
if len(sys.argv) == 3 and sys.argv[2] == '1':
    print 'DEBUG included'
    is_debug = True

str = open('install.rdf', 'rb').read()
str = ver_re.sub('<version>%s</version>' % version, str)
open('install.rdf', 'wb').write(str)

for file in glob.glob('../tabgroupsmenu-*.xpi'):
    os.unlink(file)

zf = zipfile.ZipFile("../tabgroupsmenu-%s%s.xpi" % (version, '-debug' if is_debug else ''), 'w', zipfile.ZIP_DEFLATED)

zf.write('bootstrap.js')
zf.write('install.rdf')
zf.write('chrome.manifest')
zf.write('res/style.css')
zf.write('res/icon.png')
zf.write('libs/moz-utils.js')
zf.write('libs/my-utils.js')
zf.write('libs/protocol.js')
zf.write('chrome/options.xul')
if is_debug:
    zf.write('libs/debug.js')
else:
    zf.write('libs/debug-release.js', 'libs/debug.js')
zf.write('libs/prefs.js')

zf.close()
