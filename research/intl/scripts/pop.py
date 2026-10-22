import csv,collections,sys,json
SRC='https://github.com/martj42/international_results/blob/master/results.csv'
TEAMS=['England','France','Germany','Spain','Italy','Netherlands','Portugal','Belgium','Croatia','Poland','Sweden','Denmark','Switzerland','Austria','Turkey','Czech Republic','Russia','Ukraine','Norway','Serbia','Scotland','Wales','Argentina','Brazil','Uruguay','Colombia','Chile','Mexico','United States','Egypt','Senegal','Nigeria','Ivory Coast','Ghana','Cameroon','Morocco','Algeria','South Korea','Japan','Australia','Saudi Arabia','Iran']
TOURN={'FIFA World Cup','UEFA Euro','Copa América','African Cup of Nations','AFC Asian Cup','Gold Cup','Confederations Cup'}
NLF={'UEFA Nations League':{'2019-06','2021-10','2023-06','2025-06'},'CONCACAF Nations League':{'2021-06','2023-06','2024-03','2025-03'}}
def cls(r):
    t=r['tournament']
    if t=='Friendly': return 'friendlies'
    if 'qualification' in t: return 'qualifiers'
    if t in NLF: return 'tournament' if r['date'][:7] in NLF[t] else 'nations_league'
    if t in TOURN: return 'tournament'
    return 'other'
def load(path):
    out=[]
    for r in csv.DictReader(open(path)):
        y=r['date'][:4]
        if not('1998'<=y<='2026'): continue
        for side in ('home_team','away_team'):
            if r[side] in TEAMS: out.append((r[side],int(y),cls(r),r))
    return out
if __name__=='__main__':
    rows=load(sys.argv[1]); C=collections.defaultdict(collections.Counter)
    for t,y,c,r in rows: C[(t,y)][c]+=1
    w=csv.writer(open(sys.argv[2],'w',newline=''))
    w.writerow(['team','year','friendlies','qualifiers','nations_league','tournament','other','total','source_url'])
    for t in TEAMS:
        for y in range(1998,2027):
            c=C[(t,y)]; w.writerow([t,y,c['friendlies'],c['qualifiers'],c['nations_league'],c['tournament'],c['other'],sum(c.values()),SRC])
