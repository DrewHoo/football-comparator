import json,csv,collections,sys
S=sys.argv[1]; sys.path.insert(0,S+'/scripts')
from pop import load
exec(open(S+'/scripts/gap.py').read().split('rows=load')[0])
rows=load(S+'/martj42/results.csv')
T=collections.defaultdict(collections.Counter)
for team,y,c,r in rows:
    e=era(y); st=espn(team,r); k=K.get((team,r['date']),0); p=P(c,y); m=max(0,p-k)
    if st in ('N','U') and team in UEFA and c in ('qualifiers','tournament') and y<=2008: st='W'
    f={'V':0,'W':0,'P':0.22,'F1':0.52,'N':1,'U':0}[st]; u=1 if st=='U' else 0
    for key in [(e,c),(e,'ALL'),('ALL',c),('ALL','ALL')]:
        x=T[key]; x['tm']+=1; x[st]+=1
        x['firm']+=f; x['firm_miss']+=f*m; x['unk']+=u; x['unk_miss']+=u*m
w=csv.writer(sys.stdout)
w.writerow(['era','type','team_matches','espn_V','wikidata_W','espn_partial','espn_N','unprobed_U','firm_gap_team_matches','firm_missing_apps_after_rsssf','unprobed_team_matches','unprobed_missing_apps_after_rsssf'])
for e in ['1998-2003','2004-2008','2009-2014','2015-2026','ALL']:
    for c in ['friendlies','qualifiers','nations_league','tournament','other','ALL']:
        x=T[(e,c)]
        if x['tm']: w.writerow([e,c,x['tm'],x['V'],x['W'],x['P']+x['F1'],x['N'],x['U'],round(x['firm']),round(x['firm_miss']),x['unk'],round(x['unk_miss'])])
