import sys,json
for l in sys.stdin:
  try: r=json.loads(l)
  except: print(l.strip()); continue
  print(r['source']); print(r['competition'],'|',r['home'],r['result'],r['away'],'|',r['date'],r['venue'],r['kickoff'],'att',r['attendance'])
  print('goals',[ (g.get('player'),g.get('team'),g.get('minute')) for g in r['goals']])
  for t in r['teams']:
    print(t['name'],'| coach',t['coach']); print('  XI', [(p['shirt'],p['name'],p['off']) for p in t['starters']]); print('  bench',[(p['shirt'],p['name'],p['on']) for p in t['bench']])
  print('cautions',r['cautions'],'| sent off',r['sentOff'],'| ref',r['referee'])
