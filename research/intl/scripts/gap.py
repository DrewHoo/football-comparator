import json,csv,collections,sys
S=sys.argv[1]; sys.path.insert(0,S+'/scripts')
from pop import load,TEAMS,cls
UEFA=set(TEAMS[:22]); CONMEBOL={'Argentina','Brazil','Uruguay','Colombia','Chile'}
def espn(team,r):
    t=r['tournament']; y=int(r['date'][:4]); ym=r['date'][:7]
    if t=='FIFA World Cup': return 'V'
    if t=='UEFA Euro': return 'V' if y>=2004 else 'N'
    if t=='Copa América': return 'V' if y==2007 else 'U'
    if y<=2000: return 'N'
    if t=='FIFA World Cup qualification':
        if y<=2001: return 'N'
        if team in UEFA: return 'V' if y>=2004 else 'N'
        if team in CONMEBOL:
            if y<=2005 or ('2007-10'<=ym<='2007-11'): return 'N'
            return 'V'
        return 'U'
    if t=='UEFA Euro qualification': return 'V' if y>=2002 else 'N'
    if t=='Friendly': return 'F1' if y<=2011 else ('U' if y<=2013 else 'P')
    return 'U'
K={tuple(k.split('|')):n for k,n in json.load(open(S+'/rsssf_apps_by_match.json')).items()}
def era(y): return '1998-2003' if y<=2003 else '2004-2008' if y<=2008 else '2009-2014' if y<=2014 else '2015-2026'
def P(c,y):  # players used per side [E]
    if c in('friendlies','other'): return 16.0 if y<2014 else 17.0
    return 13.8 if y<2020 else 15.0
rows=load(S+'/martj42/results.csv')
T=collections.defaultdict(collections.Counter); D=collections.defaultdict(set)
for team,y,c,r in rows:
    e=era(y); st=espn(team,r); k=K.get((team,r['date']),0)
    for key in [(e,c),(e,'ALL'),('ALL',c),('ALL','ALL')]:
        T[key]['tm']+=1; T[key][st]+=1
        D[key].add((r['date'],r['home_team'],r['away_team']))
        if st!='V':
            T[key]['gap_tm']+=1; T[key]['rsssf']+=k; T[key]['need']+=P(c,y)
            T[key]['miss']+=max(0,P(c,y)-k)
            if st=='P': T[key]['missP']+=0.22*max(0,P(c,y)-k)  # P slices ~7/9 covered
if __name__!="__main__": raise SystemExit
w=csv.writer(sys.stdout)
w.writerow(['era','type','team_matches','distinct','espn_V','espn_P','espn_N','espn_U','gap_team_matches','rsssf_apps_in_gap','est_apps_needed_in_gap','est_missing_apps_after_rsssf'])
for e in ['1998-2003','2004-2008','2009-2014','2015-2026','ALL']:
    for c in ['friendlies','qualifiers','nations_league','tournament','other','ALL']:
        x=T[(e,c)]
        if x['tm']: w.writerow([e,c,x['tm'],len(D[(e,c)]),x['V'],x['P'],x['N'],x['U'],x['gap_tm'],x['rsssf'],round(x['need']),round(x['miss'])])
