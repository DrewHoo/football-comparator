import json,glob,sys
S=sys.argv[1]
B5={b['club']['value'].rsplit('/',1)[1] for b in json.load(open(S+'/wd/clubs.json'))['results']['bindings']}
UQ=set(json.load(open(S+'/c100/ucl_club_qids.json')))
NT={b['nt']['value'].rsplit('/',1)[1] for b in json.load(open(S+'/wd/mnt.json'))['results']['bindings']}
def yr(q,p):
    for v in q.get(p,[]):
        try: return int(v['datavalue']['value']['time'][1:5])
        except: pass
    return None
def classify(ent):
    cl=ent.get('claims',{}); b5=ucl=False; caps=[]
    for st in cl.get('P54',[]):
        try: club=st['mainsnak']['datavalue']['value']['id']
        except: continue
        q=st.get('qualifiers',{}); s=yr(q,'P580'); e=yr(q,'P582')
        ov=(e is None or e>=2003) and (s is None or s<=2026)
        if club in NT:
            for v in q.get('P1350',[]):
                try: caps.append((club,int(float(v['datavalue']['value']['amount']))))
                except: pass
        if ov and club in B5: b5=True
        if ov and club in UQ: ucl=True
    return b5,ucl,caps
if __name__=='__main__':
    E={}
    for f in glob.glob(S+'/c100/ent/*.json'): E.update(json.load(open(f))['entities'])
    C=json.load(open(S+'/c100/c100.json'))
    for c in C:
        b5,ucl,caps=classify(E.get(c['qid'],{})); c['b5']=b5; c['ucl']=ucl
    json.dump(C,open(S+'/c100/c100.json','w'),ensure_ascii=False)
    era=[c for c in C if c['latest']>='2002-08-01']
    print('100+ caps total',len(C),'| latest cap >= Aug 2002:',len(era))
    print('  big-5 club stint overlapping 2003+:',sum(c['b5'] for c in era))
    print('  UCL club (not big5) overlapping 2003+:',sum(1 for c in era if c['ucl'] and not c['b5']))
    print('  big5 or UCL:',sum(1 for c in era if c['b5'] or c['ucl']))
    print('  active (bold) & big5|ucl:',sum(1 for c in era if c['active'] and (c['b5'] or c['ucl'])))
