import sys
import zipfile
from cStringIO import StringIO
import re

cmt_re = re.compile(r'\s*//.*')

if len(sys.argv) < 2:
    print "Usage: release.py version [debug:1|0, default 0]"
    sys.exit(0)
version = sys.argv[1]

is_debug = False
if len(sys.argv) == 3 and sys.argv[2] == '1':
    print 'DEBUG included'
    is_debug = True

zf = zipfile.ZipFile("../tabgroupsmenu@char.cc-%s%s.xpi" % (version, '-debug' if is_debug else ''), 'w', zipfile.ZIP_DEFLATED)

zf.write('bootstrap.js', 'bootstrap.js')
zf.write('res/style.css')
zf.write('res/icon.png')
zf.write('libs/moz-utils.js')
zf.write('libs/my-utils.js')
zf.write('libs/tab.js')
if is_debug:
    zf.write('libs/debug.js')
else:
    zf.write('libs/debug-release.js', 'libs/debug.js')
zf.write('libs/prefs.js')

fin = open('install.rdf', 'r')
fout = StringIO()
for line in fin:
    if '<version>' in line:
        line = "%s%s</version>\n" % (line[0:line.find('<version>') + len('<version>')], version)
    fout.write(line)

fin.close()
print "Writing install.rdf"
zf.writestr("install.rdf", fout.getvalue())
fout.close()

zf.close()
