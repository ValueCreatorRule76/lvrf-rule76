# The tables db/ownership.sql grants INSERT or UPDATE to lvrf_app now that an
# older copy of it (argv[1]) did not, joined by '|'. Read by verify_ownership.sh's
# newer_than(): a database built with the older file cannot hold those grants.
import re
import sys


def grants(path):
    s = open(path).read()
    out = set()
    for m in re.finditer(r"FOREACH t IN ARRAY ARRAY\[(.*?)\]\s*LOOP.*?GRANT (INSERT|UPDATE) ON", s, re.S):
        out |= {(m.group(2), t) for t in re.findall(r"'([a-z_]+)'", m.group(1))}
    return out


print('|'.join(sorted({t for (_, t) in grants(sys.argv[2]) - grants(sys.argv[1])})))
