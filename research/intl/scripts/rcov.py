import json,csv,collections,sys
sys.path.insert(0,sys.argv[1]+'/scripts')
S=sys.argv[1]
from pop import load,TEAMS
J=json.load(open(S+'/rsssf_joined.json'))
K=collections.Counter()
for f,v in J.items():
    for d in v['dates']: K[(v['team'],d)]+=1
rows=load(S+'/martj42/results.csv')
def era(y): return '1998-2003' if y<=2003 else '2004-2008' if y<=2008 else '2009-2014' if y<=2014 else '2015-2026'
A=collections.defaultdict(list)
for t,y,c,r in rows:
    k=K[(t,r['date'])]; A[(era(y),c)].append(k); A[(era(y),'ALL')].append(k)
    A[('team',t,era(y))].append(k)
print('era type n mean_rsssf_apps share>=11 share0')
for e in ['1998-2003','2004-2008','2009-2014','2015-2026']:
    for c in ['friendlies','qualifiers','nations_league','tournament','other','ALL']:
        v=A[(e,c)]
        if v: print(e,c,len(v),round(sum(v)/len(v),2),round(sum(1 for x in v if x>=11)/len(v),2),round(sum(1 for x in v if x==0)/len(v),2))
print('per team mean RSSSF-logged apps per match, by era')
for t in TEAMS: print(t,[round(sum(A[('team',t,e)])/max(1,len(A[('team',t,e)])),1) for e in ['1998-2003','2004-2008','2009-2014','2015-2026']])
json.dump({f"{t}|{d}":n for (t,d),n in K.items()},open(S+'/rsssf_apps_by_match.json','w'))
