import re,sys,os,json,html
def rd(p):
    b=open(p,'rb').read()
    return b.decode('utf-16') if b[:2] in (b'\xff\xfe',b'\xfe\xff') else (b.decode('utf-8') if b.startswith(b'\xef\xbb\xbf') else b.decode('latin-1'))

P=sys.argv[1]
res=[]
for f in sorted(os.listdir(P)):
    raw=rd(os.path.join(P,f))
    t=html.unescape(re.sub(r'<[^>]+>','',raw))
    title=re.search(r'<title>(.*?)</title>',raw,re.I|re.S)
    title=' '.join(title.group(1).split()) if title else ''
    lu=re.search(r'Last updated:?\s*([^\n<]*)',t,re.I)
    # cap rows: line starts with number, then optional goals, date d-m-yy
    rows=[]
    for line in t.split('\n'):
        m=re.match(r'\s*(\d{1,3})\.?\s(.*?)\b(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{2}|\d{4})\b(.*)',line)
        if m:
            rows.append((int(m.group(1)),f"{m.group(3)}-{m.group(4)}-{m.group(5)}",m.group(6)))
    tot=re.search(r'Total\s+caps\s*/\s*goals:?\s*(\d+)\s+(\d+)',t,re.I)
    fr=re.search(r'^\s*Friendl\w*\s+(\d+)\s+(\d+)',t,re.I|re.M)
    res.append(dict(f=f,title=title,lu=lu.group(1).strip() if lu else None,nrows=len(rows),
        first=rows[0][1] if rows else None,cap50=rows[49][1] if len(rows)>=50 else None,
        last=rows[-1][1] if rows else None,maxnum=max([r[0] for r in rows],default=0),
        nfr=sum(1 for r in rows if not re.search(r'[A-Za-z]{3,}',re.sub(r'^.*?\d+\s*-\s*\d+','',r[2],count=1))),
        tot=tot.groups() if tot else None,fr=fr.groups() if fr else None,size=len(raw),
        women=bool(re.search(r'women|female|ladies',title+t[:1500],re.I))))
json.dump(res,open(sys.argv[2],'w'),indent=0,ensure_ascii=False)
print(len(res))
