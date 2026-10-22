import json,csv,collections,sys
S=sys.argv[1]; sys.path.insert(0,S+'/scripts')
from pop import cls
src=open(S+'/scripts/gap.py').read().split('K={')[0]; exec(src.split('def espn')[0]); exec('def espn'+src.split('def espn')[1])
J=json.load(open(S+'/rsssf_joined.json'))
R={}
for r in csv.DictReader(open(S+'/martj42/results.csv')):
    R[(r['home_team'],r['date'])]=r; R[(r['away_team'],r['date'])]=r
WIKI={'messi':208,'cronaldo':234,'haaland':59,'fran-mbappe':107,'lewandowski':170,'ibrahimovic':122,'egy-salah':122,'kane':125,'neymar':130,'fran-benzema':97,'cavani':136,'aguero':101,'higuain':75,'dimaria':145,'hrmodric':206,'dui-kroos':114,'thmueller':131,'klose':137,'podolski':130,'rooney':120,'lampard':106,'gerrard':114,'beckham':115,'henry':123,'zidane':108,'trezeguet':71,'ribery':81,'fran-giroud':137,'griezmann':137,'dvilla':98,'ftorres':110,'raul':102,'xavi':133,'iniesta':131,'sramos':180,'totti':58,'delpiero':91,'pirlo':116,'buffon':176,'robben':96,'vpersie':102,'sneijder':134,'nistelrooij':70,'rlukaku':135,'debruyne':127,'ehazard':126,'skor-son-hm':151,'radamelfalcao':104,'col-jamesr':131}
w=csv.writer(sys.stdout)
w.writerow(['player','wiki_caps','rsssf_caps','lag','tourV','miss_tour_only','miss_espn_only','miss_espn_rsssf','f50_tourV','f50_miss_tour_only','f50_miss_espn_only','f50_window'])
for k,wc in WIKI.items():
    f=k+'-intlg.html' if k+'-intlg.html' in J else k+'-intl.html'; v=J[f]; t=v['team']
    tv=0; eo=0.0; f50t=0; f50e=0.0; n=0
    for i,d in enumerate(v['dates']):
        r=R.get((t,d))
        if not r: c='pre'; st='U'
        else: c=cls(r); st=espn(t,r)
        isT = c=='tournament' and st=='V'
        tv+=isT; m={'V':0,'P':0.22,'F1':0.52,'N':1,'U':1}[st]; eo+=m
        if i<50: f50t+=isT; f50e+=m
    lag=wc-v['nrows']
    w.writerow([k,wc,v['nrows'],lag,tv,wc-tv,round(eo+lag),lag,f50t,50-f50t,round(f50e),v['dates'][0]+'..'+v['dates'][min(49,len(v['dates'])-1)]])
