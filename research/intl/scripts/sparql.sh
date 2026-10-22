#!/bin/zsh
curl -sS -G --max-time 300 -H 'Accept: application/sparql-results+json' -A 'drewhoover-research/1.0 (https://drewhoover.com)' --data-urlencode "query@$1" https://query.wikidata.org/sparql -o "$2"
python3 -I -c "
import json,sys;r=json.load(open('$2'));b=r['results']['bindings'];print(len(b))
for x in b[:6]: print({k:v['value'] for k,v in x.items()})"
