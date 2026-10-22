import json,glob,sys,collections
S=sys.argv[1]; d=sys.argv[2]
OK={'Netherlands national association football team','Argentina national football team','Kuwait national football team','Serbia and Montenegro national football team','CIS national football team','Soviet Union national association football team'}
NT={b['nt']['value'].rsplit('/',1)[1]:b['ntLabel']['value'] for b in json.load(open(S+'/wd/mnt.json'))['results']['bindings'] if "men's" in b['ntLabel']['value'] or b['ntLabel']['value'] in OK}
C=collections.Counter(); bad=0; byteam=collections.Counter(); seen=0
for f in glob.glob(S+'/wd/'+d+'/*.json'):
    try: E=json.load(open(f))['entities']
    except Exception: bad+=1; continue
    for q,e in E.items():
        seen+=1
        caps=collections.Counter(); has=False; teams=set()
        for st in e.get('claims',{}).get('P54',[]):
            try: club=st['mainsnak']['datavalue']['value']['id']
            except: continue
            if club in NT:
                has=True; teams.add(club)
                for v in st.get('qualifiers',{}).get('P1350',[]):
                    try: caps[club]+=int(float(v['datavalue']['value']['amount']))
                    except: pass
        m=max(caps.values()) if caps else None
        if has: C['nt_stint']+=1
        if has and m is None: C['nt_no_P1350']+=1
        if m is not None and m>=1: C['caps>=1']+=1
        if m is not None and m>=50: C['caps>=50']+=1
        if m is not None and m>=100: C['caps>=100']+=1
        if has:
            for t in teams: byteam[NT[t]]+=1
print(d,'bad files',bad,'entities',seen,dict(C))
print(len(NT),'teams');T42=['England','France','Germany','Spain','Italy','Netherlands','Portugal','Belgium','Croatia','Poland','Sweden','Denmark','Switzerland','Austria','Turkey','Czech','Russia','Ukraine','Norway','Serbia ','Scotland','Wales','Argentina','Brazil','Uruguay','Colombia','Chile','Mexico','United States','Egypt','Senegal','Nigeria','Ivory Coast','Ghana','Cameroon','Morocco','Algeria','South Korea','Japan','Australia','Saudi Arabia','Iran']
print('in 42 teams:',sum(n for l,n in byteam.items() if any(l.startswith(t) for t in T42)),'| other teams:',sum(n for l,n in byteam.items() if not any(l.startswith(t) for t in T42)))
print(byteam.most_common(12))
