import sys
import zipfile
from cStringIO import StringIO
import re
import subprocess

cmt_re = re.compile(r'\s*//.*')

if len(sys.argv) < 2:
    print "Usage: release.py version"
    sys.exit(0)
version = sys.argv[1]

zf = zipfile.ZipFile("tabgroupsmenu@char.cc-%s.xpi" % version, 'w', zipfile.ZIP_DEFLATED)

fin  = open('bootstrap.js', 'r')
fout = StringIO()

in_comment = False
in_debug   = False
for line in fin:
    sline = line.strip()
    if sline == '':
        continue
    if sline.startswith('//'):
        if sline.replace(' ', '') == '//{{':
            in_debug = True
        elif sline.replace(' ', '') == '//}}':
            in_debug = False
        continue
    
    if in_debug:
        continue
    
    if sline.startswith('/*'):
        if not sline.endswith('*/'):
            in_comment = True
        continue
    if sline.endswith('*/'):
        in_comment = False
        continue
    if in_comment:
        continue
   
    fout.write(line)

process = subprocess.Popen(["sed.exe", "-nf", "remccoms3.sed"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, shell=True)
str = process.communicate(input=fout.getvalue())[0]

fin.close()
print "Writing bootstrap.js"
zf.writestr("bootstrap.js", str)
fout.close()

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
