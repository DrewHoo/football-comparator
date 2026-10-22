import re,os,csv,json,html,collections,datetime as dt,sys
R=S=sys.argv[1]
def rd(p):
    b=open(p,'rb').read()
    return b.decode('utf-16') if b[:2] in (b'\xff\xfe',b'\xfe\xff') else (b.decode('utf-8','replace') if b.startswith(b'\xef\xbb\xbf') else b.decode('latin-1'))
meta={}
for r in csv.DictReader(open(S+'/rsssf/rsssf_player_logs.tsv'),delimiter='\t'):
    meta[r['url'].rsplit('/',1)[1]]=r
# martj42 team-date index (all teams)
TD=collections.defaultdict(set); M={}
for r in csv.DictReader(open(S+'/martj42/results.csv')):
    for side,opp in (('home_team','away_team'),('away_team','home_team')):
        TD[r[side]].add(r['date']); M[(r[side],r['date'])]=r
rowre=re.compile(r'^\s*(\d{1,3})\.?\s+(?:[\d\s\-]*?\s)?(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{4}|\d{2})\b')
out={}; stats=collections.Counter()
for f in sorted(os.listdir(S+'/rsssf/pages')):
    if f not in meta: continue
    t=html.unescape(re.sub(r'<[^>]+>','',rd(S+'/rsssf/pages/'+f)))
    raw=[]
    for line in t.split('\n'):
        m=rowre.match(line)
        if m: raw.append((int(m.group(1)),int(m.group(2)),int(m.group(3)),m.group(4)))
    if not raw: stats['norows']+=1; continue
    lu=re.search(r'(19|20)\d\d',meta[f]['last_updated'] or ''); luy=int(lu.group(0)) if lu else 2026
    def seq(start):
        c=start; prev=None; ys=[]
        for _,d,mo,y in raw:
            if len(y)==4: yy=int(y); c=yy//100*100
            else:
                yy=c+int(y)
                if prev is not None and yy<prev-1: c+=100; yy+=100
            ys.append(yy); prev=yy
        return ys
    ys=seq(2000 if len(raw[0][3])==2 and int(raw[0][3])<=26 else 1900)
    if max(ys)>min(2026,luy): ys=seq(1900)
    dates=[]
    for (cap,d,mo,_),y in zip(raw,ys):
        try: dates.append(dt.date(y,mo,d))
        except ValueError: pass
    ds=set(x.isoformat() for x in dates)
    near=set((x+dt.timedelta(k)).isoformat() for x in dates for k in (-1,0,1))
    best=None;bs=0
    for team,tds in TD.items():
        s=len(near & tds)
        if s>bs: bs=s;best=team
    # exact-date mapping per row (allow +-1)
    hits=[]
    for x in dates:
        for k in (0,-1,1):
            iso=(x+dt.timedelta(k)).isoformat()
            if iso in TD.get(best,()): hits.append(iso); break
    out[f]=dict(name=meta[f]['name'],country=meta[f]['country'],team=best,nrows=len(dates),matched=len(hits),first=dates[0].isoformat() if dates else None,last=dates[-1].isoformat() if dates else None,dates=hits)
    stats['ok']+=1
json.dump(out,open(S+'/rsssf_joined.json','w'))
print(stats, sum(v['nrows'] for v in out.values()), sum(v['matched'] for v in out.values()))
bad=[(k,v['name'],v['team'],v['nrows'],v['matched']) for k,v in out.items() if v['nrows'] and v['matched']/v['nrows']<0.9]
print(len(bad)); print(bad[:25])
