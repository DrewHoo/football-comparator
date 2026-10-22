import json,csv,collections,sys
S=sys.argv[1]; sys.path.insert(0,S+'/scripts')
from pop import cls
src=open(S+'/scripts/gap.py').read().split('K={')[0]; exec(src.split('def espn')[0]); exec('def espn'+src.split('def espn')[1])
J=json.load(open(S+'/rsssf_joined.json'))
R={}
for r in csv.DictReader(open(S+'/martj42/results.csv')):
    R[(r['home_team'],r['date'])]=r; R[(r['away_team'],r['date'])]=r
F='messi-intlg cronaldo-intlg haaland-intlg fran-mbappe-intlg lewandowski-intlg ibrahimovic-intlg egy-salah-intlg kane-intlg neymar-intlg fran-benzema-intlg cavani-intlg aguero-intlg higuain-intlg dimaria-intlg hrmodric-intl dui-kroos-intl thmueller-intlg klose-intlg podolski-intlg rooney-intlg lampard-intlg gerrard-intlg beckham-intl henry-intlg zidane-intl trezeguet-intl ribery-intlg fran-giroud-intlg griezmann-intlg dvilla-intlg ftorres-intlg raul-intlg xavi-intlg iniesta-intl sramos-intlg totti-intl delpiero-intlg pirlo-intlg buffon-intl robben-intl vpersie-intl sneijder-intl nistelrooij-intlg rlukaku-intlg debruyne-intl ehazard-intlg skor-son-hm-intlg radamelfalcao-intlg col-jamesr-intlg'.split()
w=csv.writer(sys.stdout)
w.writerow(['file','team','log_caps','matched','fr','q','nl','tour','oth','pre1998','espn_V','espn_P','espn_N','espn_U','first50_V','first50_P','first50_N','first50_U','first50_fr','first50_q','first50_tour','nonTour_caps'])
out={}
for f in F:
    v=J[f+'.html']; t=v['team']; C=collections.Counter(); F50=collections.Counter(); pre=0
    for i,d in enumerate(v['dates']):
        r=R.get((t,d))
        if not r or r['date'][:4]<'1998':
            pre+=1; st='pre'; c='pre'
        else:
            c=cls(r); st=espn(t,r)
        C[c]+=1; C['E'+st]+=1
        if i<50: F50['E'+st]+=1; F50[c]+=1
    row=[f,t,v['nrows'],len(v['dates']),C['friendlies'],C['qualifiers'],C['nations_league'],C['tournament'],C['other'],pre,C['EV'],C['EP'],C['EN'],C['EU'],F50['EV'],F50['EP'],F50['EN'],F50['EU'],F50['friendlies'],F50['qualifiers'],F50['tournament'],len(v['dates'])-C['tournament']]
    w.writerow(row); out[f]=row
