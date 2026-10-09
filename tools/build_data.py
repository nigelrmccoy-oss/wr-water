#!/usr/bin/env python3
"""Build data/facilities.js for the wr-water training sim from sourced inputs.
Inputs (data/raw/): 2025_facility_flows.csv (parsed from Region 2025 Summary Report App. C),
kitchener_water_plants_storage.geojson (City of Kitchener open data), geocoded_approx_places.json,
grand_river_02GA048_daily_2015_2025.csv (ECCC WSC). Every field carrying an assumption is flagged in `est`.
"""
import csv, json, os, statistics, collections, random
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, '..', 'data', 'raw')
OUT = os.path.join(HERE, '..', 'data', 'facilities.js')
random.seed(7)

SRC = {
  'SUM25': 'https://www.regionofwaterloo.ca/media/o2gdycy5/2025_annual_summary_report.pdf',
  'AWQR25': 'https://www.regionofwaterloo.ca/media/ykjajvdl/2025-annual-water-quality-report.pdf',
  'WWMR25': 'https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/dkdmkxvo/2025-water-and-wastewater-monitoring-report-final-s_access.pdf',
  'PEER': 'https://pub-regionofwaterloo.escribemeetings.com/filestream.ashx?DocumentId=15483',
  'KGIS': 'https://services1.arcgis.com/qAo1OsXi67t7XgmS/ArcGIS/rest/services/Drinking_Water_WFL1/FeatureServer/0',
  'OSM': 'https://www.openstreetmap.org/copyright',
  'NOM': 'https://nominatim.openstreetmap.org/ (place centroid; site location ESTIMATED)',
  'WSC': 'https://api.weather.gc.ca/collections/hydrometric-daily-mean/items?STATION_NUMBER=02GA048',
  'WPZ': 'https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Water_PressureZones/FeatureServer/0',
  'OEB': 'https://www.oeb.ca/consumer-information-and-protection/electricity-rates',
  'RATE': 'https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/drinking-water-supply/pay-my-water-bill/',
  'PROC': 'https://www.ontario.ca/page/procedure-disinfection-drinking-water-ontario',
  'REG170': 'https://www.ontario.ca/laws/regulation/030170',
}

flows = {}
for r in csv.DictReader(open(os.path.join(RAW, '2025_facility_flows.csv'))):
    if not r['mdwl_limit_m3d']:
        continue
    flows[r['facility']] = r
# parser merged the Strange St header into the Parkway row: fix from report text
pk = [k for k in flows if 'Parkway' in k][0]
strange = dict(flows[pk]); flows.pop(pk)
flows['Kitchener Drinking Water System – Strange St. Wells'] = strange
flows['Kitchener Drinking Water System – Parkway Wells (K31, K32, K33)'] = {
    'facility': 'Parkway', 'mdwl_limit_m3d': '13737', 'avg_2025_m3d': '0', 'max_raw_peak_Ls': '0', 'max_day_m3d': '0'}

def F(key):
    m = [k for k in flows if key in k]
    if len(m) > 1: m = [k for k in m if k.endswith(key)]
    assert len(m) == 1, (key, m)
    r = flows[m[0]]
    f = lambda x: float(x) if x not in (None, '', 'None') else 0.0
    mon = {}
    for mth in ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']:
        if r.get(mth + '_avg_m3d'):
            mon[mth] = f(r[mth + '_avg_m3d'])
    return dict(mdwl=f(r['mdwl_limit_m3d']), avg=f(r['avg_2025_m3d']), peakLs=f(r['max_raw_peak_Ls']), maxDay=f(r['max_day_m3d']), monthly=mon, table=m[0])

kg = {f['properties']['STATION']: f['geometry']['coordinates'] for f in json.load(open(os.path.join(RAW, 'kitchener_water_plants_storage.geojson')))['features']}
geo = json.load(open(os.path.join(RAW, 'geocoded_approx_places.json')))
geo['Wellesley'] = [43.4766, -80.7637]   # Nominatim returned Wellesley St Toronto; manual village centroid (ESTIMATE)
geo['Foxboro Green'] = [43.3170, -80.4400]  # manual approx (ESTIMATE)

def kpt(name):
    lon, lat = kg[name]; return [round(lat, 5), round(lon, 5), 'real', 'KGIS']
def osm(lat, lon):
    return [lat, lon, 'real', 'OSM']
def near(place, dlat=0.0, dlon=0.0):
    la, lo = geo[place]; return [round(la + dlat, 5), round(lo + dlon, 5), 'est', 'NOM']
def jit(p, i, r=0.006):
    import math
    a = i * 2.39996
    return [round(p[0] + r * math.sin(a) * (0.6 + 0.15 * i), 5), round(p[1] + r * math.cos(a) * (0.6 + 0.15 * i), 5), 'est', p[3] if p[2]=='est' else 'NOM']

MANN = kpt('MANNHEIM WATER TREATMENT PLANT')

# ---------------- zones (training aggregation; membership ESTIMATED) ----------------
ZONES = [
 dict(id='K4M', name='IUS – Kitchener Zone 4 / Mannheim', system='IUS', storageName='Mannheim PS Reservoir', storageM3=101347, storageEst=False,
      storageSrc='AWQR25', hgl=None, pMin=380, pMax=520),
 dict(id='K5', name='IUS – Kitchener central/east (Greenbrook·Strange·Parkway·K34)', system='IUS', storageName='Greenbrook (9,940) + Parkway (14,269) reservoirs', storageM3=24209, storageEst=False,
      storageSrc='AWQR25', hgl=None, pMin=360, pMax=510),
 dict(id='W4', name='IUS – Waterloo Zone 4 (Erb St·W10·Laurel)', system='IUS', storageName='Erb Street Reservoir', storageM3=18000, storageEst=False,
      storageSrc='AWQR25', hgl=381, pMin=370, pMax=500),
 dict(id='CAM', name='IUS – Cambridge (Cam 1)', system='IUS', storageName='Turnbull Reservoir + Middleton clearwell', storageM3=27800, storageEst=False,
      storageSrc='AWQR25', hgl=None, pMin=380, pMax=530),
 dict(id='NHB', name='New Hamburg / Baden (+Shingletown)', system='Wilmot', storageName='New Hamburg clearwell', storageM3=2414, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=350, pMax=480),
 dict(id='AYR', name='Ayr', system='Ayr', storageName='Ayr standpipe (5,061) + clearwell (2,500)', storageM3=7561, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=340, pMax=470),
 dict(id='BRA', name='Branchton Meadows', system='Branchton', storageName='Clearwell', storageM3=58, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=450),
 dict(id='ROS', name='Roseville', system='Roseville', storageName='Clearwell', storageM3=110, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=450),
 dict(id='LIN', name='Linwood', system='Linwood', storageName='Clearwell (2 cells)', storageM3=288, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=450),
 dict(id='SCH', name='St. Clements – Heidelberg', system='St. Clements', storageName='Clearwell (2 cells)', storageM3=1250, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=460),
 dict(id='WEL', name='Wellesley', system='Wellesley', storageName='Clearwell (4 cells)', storageM3=914, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=460),
 dict(id='FOX', name='Foxboro Green (private distribution)', system='Foxboro', storageName='Clearwell', storageM3=81, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=450),
 dict(id='NDU', name='New Dundee', system='New Dundee', storageName='Clearwell (4 cells)', storageM3=508, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=450),
 dict(id='PET', name='Petersburg', system='Petersburg', storageName='Clearwell', storageM3=114, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=450),
 dict(id='MAR', name='Maryhill (Village Heights + WTP)', system='Maryhill', storageName='Clearwells 174 + 45', storageM3=219, storageEst=False, storageSrc='AWQR25', hgl=None, pMin=300, pMax=450),
]

# ---------------- supply sites ----------------
# kind: well (direct to distribution), wtp (wells -> treatment -> clearwell -> high lift), surface (Mannheim)
S = []
def site(id, name, table, zone, wells, loc, kind='well', dutyMax=None, clearwell=None, hl=None, chem=('naocl',), uv=False,
         greensand=False, aop=None, gac=False, standby=False, note='', extraSrc=()):
    f = F(table)
    nW = len(wells)
    duty = dutyMax or nW
    S.append(dict(id=id, name=name, zone=zone, kind=kind, wells=wells, dutyMax=duty,
        mdwlM3d=f['mdwl'], avg2025M3d=f['avg'], peakRawLs2025=f['peakLs'], maxDay2025M3d=f['maxDay'], monthly2025=f['monthly'], flowTable=f['table'],
        clearwellM3=clearwell, highLiftPumps=hl, chem=list(chem), uv=uv, greensand=greensand, aop=aop, gac=gac, standbyPower=standby,
        lat=loc[0], lon=loc[1], locQuality=loc[2], locSrc=SRC[loc[3]], note=note, sources=[SRC['SUM25'], SRC['AWQR25']] + list(extraSrc)))

# Cambridge
site('G4', 'Well G4/G4A', 'Wells G4/G4A', 'CAM', ['G4', 'G4A'], near('Hespeler', -0.012, 0.004), dutyMax=1, uv=True, note='Only one well operates at a time; UV + NaOCl; no emergency power.')
site('G5', 'Well G5/G5A', 'Wells G5/G5A', 'CAM', ['G5', 'G5A'], near('Hespeler', 0.006, -0.010), dutyMax=1, note='Only one well at a time; no emergency power.')
site('G9', 'Well G9', 'Well G9', 'CAM', ['G9'], near('Galt', 0.020, -0.020))
site('H3', 'Well H3/H3A', 'Well H3/H3A', 'CAM', ['H3', 'H3A'], near('Hespeler', 0.004, 0.012), dutyMax=1)
site('H4', 'Well H4A', 'Well H4A', 'CAM', ['H4A'], near('Hespeler', -0.006, 0.016))
site('H5', 'Well H5/H5A', 'Well H5/H5A', 'CAM', ['H5', 'H5A'], near('Hespeler', 0.012, 0.002), dutyMax=1)
site('MID', 'Middleton WTP (AOP/UV)', 'Middleton Wells', 'CAM', ['G1', 'G1A', 'G2', 'G3', 'G14', 'G15'], near('Middleton St Cambridge'), kind='wtp', clearwell=5000, hl=4, uv=True, aop='naocl_uv', standby=True, note='TCE treatment by AOP (NaOCl + UV); 5,000 m³ clearwell; 4 high-lift pumps; diesel standby.')
site('PIN', 'Pinebush WTP (greensand)', 'Pinebush Wells', 'CAM', ['P10A', 'P10B', 'P11', 'P17', 'P19'], near('Pinebush Cambridge'), kind='wtp', clearwell=527, hl=2, greensand=True)
site('P16', 'Well P16', 'Well P16', 'CAM', ['P16'], near('Pinebush Cambridge', -0.006, 0.006), note='0 m³ produced in 2025 (out of service in data).')
site('P9', 'Rahmans – Well P9', 'Well P9', 'CAM', ['P9'], near('Preston', 0.006, 0.004))
site('P15', 'Rahmans – Well P15A', 'Well P15A', 'CAM', ['P15A'], near('Preston', 0.004, 0.008))
site('SHM', 'Shades Mill WTP (greensand + UV)', 'Shades Mill Wells', 'CAM', ['G7', 'G8', 'G38', 'G39', 'G40'], near('Shades Mill', 0.0, -0.01), kind='wtp', clearwell=627, hl=2, greensand=True, uv=True)
site('TUR', 'Turnbull WTP (greensand)', 'Turnbull Wells', 'CAM', ['G6', 'G16', 'G17', 'G18'], near('Turnbull'), kind='wtp', clearwell=537, hl=2, greensand=True, note='High lift discharges to distribution and/or Turnbull Reservoir (22,800 m³).')
# Kitchener
site('GRB', 'Greenbrook WTP (greensand·AOP·GAC)', 'Greenbrook Wells', 'K5', ['K1A', 'K2A', 'K4C', 'K5A', 'K8'], kpt('GREENBROOK WATER TREATMENT PLANT'), kind='wtp', clearwell=9940, hl=3, chem=('naocl', 'nh4', 'h2o2'), uv=True, greensand=True, aop='h2o2_uv', gac=True,
     note='1,4-dioxane AOP (H2O2 + UV) then GAC; ran to waste Jun–Dec 2025 (0 treated); hl pump count ESTIMATED.', extraSrc=(SRC['KGIS'],))
site('K34', 'K34 WTP (K34/K36)', 'Wells K34/K36', 'K5', ['K34', 'K36'], near('Hidden Valley', 0.020, -0.040), kind='wtp', clearwell=90, hl=2, chem=('naocl', 'nh4'), greensand=True)
site('PKW', 'Parkway WTP (K31/K32/K33)', 'Parkway Wells', 'K5', ['K31', 'K33'], kpt('PARKWAY WATER TREATMENT PLANT'), kind='wtp', clearwell=14269, hl=3, chem=('naocl', 'nh4'),
     note='K32 disconnected; 0 m³ in 2025 (standby in sim). Reservoir 14,269 m³; hl pump count ESTIMATED.', extraSrc=(SRC['KGIS'],))
site('STR', 'Strange Street WTP', 'Strange St. Wells', 'K5', ['K10A', 'K11A', 'K13B', 'K18', 'K19', 'W1B', 'W2B', 'W2C', 'W3A'], kpt('STRANGE STREET WATER TREATMENT PLANT'), kind='wtp', clearwell=250, hl=3, chem=('naocl', 'nh4'), greensand=True,
     note='W1B/W2B/W2C/W3A commissioned Aug 2025.', extraSrc=(SRC['KGIS'],))
site('WOO', 'Woolners Wells (K80/K81/K82)', 'Woolners Wells', 'K5', ['K80', 'K81', 'K82'], near('Breslau', 0.010, -0.025), note='0 m³ in 2025 (standby in sim); treatment details not in AWQR – NaOCl ASSUMED.')
# Mannheim WTP DWS
mw = lambda i: jit(MANN, i, 0.012)
for i, (wid, tbl) in enumerate([('K21', 'Well K21'), ('K21A', 'Well K21A'), ('K25', 'Well K25'), ('K29', 'Well K29'), ('K91', 'Well K91'), ('K92', 'Well K92'), ('K93', 'Well K93'), ('K94', 'Well K94')]):
    site(wid, 'Well ' + wid, tbl, 'K4M', [wid], mw(i + 1), chem=('naocl',), note='Blends at Mannheim PS Reservoir; NH4 added before reservoir.')
for i, (wid, tbl) in enumerate([('ASR1', '– ASR1'), ('ASR2', '– ASR2'), ('ASR3', '– ASR3'), ('ASR4', '– ASR4'), ('ASR5', '– ASR5'), ('RCW2', '– RCW2'), ('RCW3', '– RCW3'), ('RCW4', '– RCW4')]):
    site(wid, wid + (' (ASR well)' if wid.startswith('ASR') else ' (recovery well)'), tbl, 'K4M', [wid], jit(MANN, i + 9, 0.005), kind='asr', chem=(),
         note='Aquifer Storage & Recovery: recovered water blended with WTP treated water into clearwells. Seasonal use.')
site('MWTP', 'Mannheim WTP (Grand River – Hidden Valley intake)', 'Grand River Intake', 'K4M', ['LL-1', 'LL-2'], MANN, kind='surface', clearwell=15280, hl=None,
     chem=('cl2gas', 'naocl', 'pacl', 'polymer', 'lox', 'nh4'), uv=True, standby=True,
     note='Hidden Valley low lift (2 submersible) → HVHL reservoir → 3 boosters → coag/floc/plate settlers/ozone/filtration → UV → Cl2 gas → clearwells 15,280 m³ → Mannheim PS Reservoir 101,347 m³ (NH4 added).',
     extraSrc=(SRC['KGIS'], SRC['PEER'], SRC['WSC']))
# Mannheim Village, Shingletown
site('K22A', 'Well K22A', 'Well K22A', 'K4M', ['K22A'], near('Mannheim', 0.004, 0.004), note='0 m³ in 2025.')
site('K23', 'Well K23', 'Well K23', 'K4M', ['K23'], near('Mannheim', -0.003, 0.006), uv=True)
site('K24', 'Well K24', 'Well K24', 'K4M', ['K24'], near('Mannheim', 0.006, -0.004))
site('K26', 'Well K26', 'Well K26', 'K4M', ['K26'], near('Mannheim', -0.005, -0.006))
site('K50', 'Shingletown Wells K50/K51', 'Wells K50/K51', 'NHB', ['K50', 'K51'], near('Shingletown'), standby=True, note='Feeds Shingletown, New Hamburg/Baden via Baden valves; can also be directed east to Mannheim.')
# Waterloo
site('ERB', 'Erb Street wells (W6B/W6C/W7/W8)', 'Erb Street Wells', 'W4', ['W6B', 'W6C', 'W7', 'W8'], osm(43.44252, -80.58402), chem=('naocl', 'nh4'), note='Wells pump to Erb St Reservoir (18,000 m³); NH4 at reservoir inlet; portable generator connection.')
site('W10', 'Well W10', 'Well W10', 'W4', ['W10'], osm(43.46464, -80.56357), chem=('naocl', 'nh4'), uv=True)
site('LAU', 'Laurel WTP (W25)', 'Well W25', 'W4', ['W25'], near('Laurel Creek', -0.006, 0.008), kind='wtp', clearwell=399, hl=2, chem=('naocl', 'nh4'), greensand=True, standby=True)
# Townships
site('NHW', 'New Hamburg WTP (NH3/NH4)', 'Wells (NH3, NH4)', 'NHB', ['NH3', 'NH4'], near('New Hamburg'), kind='wtp', dutyMax=1, clearwell=2414, hl=4, greensand=True, standby=True)
site('AYR', 'Ayr WTP (A1/A2/A3)', 'Wells (A1, A2, A3)', 'AYR', ['A1', 'A2', 'A3'], near('Ayr'), kind='wtp', clearwell=2500, hl=3, greensand=True, standby=True)
site('BRA', 'Branchton Meadows WTP', 'Wells (BM2, BM3)', 'BRA', ['BM2', 'BM3'], near('Branchton'), kind='wtp', clearwell=58, hl=3, greensand=True, standby=True)
site('ROS', 'Roseville WTP', 'Wells (R5, R6)', 'ROS', ['R5', 'R6'], near('Roseville'), kind='wtp', clearwell=110, hl=3, greensand=True, standby=True)
site('MHW', 'Maryhill WTP (MH1/MH2)', 'Maryhill WTP- Wells', 'MAR', ['MH1', 'MH2'], near('Maryhill', -0.004, 0), kind='wtp', clearwell=45, hl=2, greensand=True, note='0 m³ in 2025; interconnect valve opens on low pressure.')
site('MHV', 'Maryhill Village Heights', 'Maryhill Heights- Wells', 'MAR', ['MH4A', 'MH5'], near('Maryhill', 0.004, 0.006), kind='wtp', clearwell=174, hl=3, standby=True)
site('LIN', 'Linwood WTP', 'Wells (L1A, L2)', 'LIN', ['L1A', 'L2'], near('Linwood'), kind='wtp', clearwell=288, hl=4, greensand=True, standby=True)
site('SCL', 'St. Clements WTP', 'Wells (SC2, SC3, SC4)', 'SCH', ['SC2', 'SC3', 'SC4'], near('St Clements'), kind='wtp', clearwell=1250, hl=4, greensand=True, standby=True)
site('WEL', 'Wellesley WTP', 'Wells (WY1, WY5, WY6)', 'WEL', ['WY1', 'WY5', 'WY6'], near('Wellesley'), kind='wtp', clearwell=914, hl=5, greensand=True, standby=True)
site('FOX', 'Foxboro Green WTP', 'Wells (FG1, FG2A, FG4)', 'FOX', ['FG1', 'FG2A', 'FG4'], near('Foxboro Green'), kind='wtp', clearwell=81, hl=4, greensand=True, standby=True)
site('NDU', 'New Dundee pump house', 'Wells (ND4, ND5)', 'NDU', ['ND4', 'ND5'], near('New Dundee'), kind='wtp', clearwell=508, hl=2, standby=True)
site('PET', 'Petersburg pump house', 'Well PE1', 'PET', ['PE1'], near('Petersburg'), kind='wtp', clearwell=114, hl=2)

# ---------------- storage / towers (display + zone storage) ----------------
STORE = [
 dict(id='MPS', name='Mannheim PS Reservoir', zone='K4M', type='reservoir', volM3=101347, volEst=False, loc=jit(MANN, 20, 0.003)),
 dict(id='MCW', name='Mannheim WTP clearwells', zone='K4M', type='reservoir', volM3=15280, volEst=False, loc=jit(MANN, 21, 0.002)),
 dict(id='HVI', name='Hidden Valley low lift intake (Grand River)', zone='K4M', type='intake', volM3=None, volEst=True, loc=kpt('HIDDEN VALLEY LOW LIFT INTAKE')),
 dict(id='ARF', name='Mannheim Artificial Recharge Facility', zone='K4M', type='recharge', volM3=None, volEst=True, loc=kpt('MANNHEIM ARTIFICIAL RECHARGE FACITLITY')),
 dict(id='GBR', name='Greenbrook Reservoir', zone='K5', type='reservoir', volM3=9940, volEst=False, loc=jit(kpt('GREENBROOK WATER TREATMENT PLANT'), 3, 0.0015)),
 dict(id='PKR', name='Parkway Reservoir', zone='K5', type='reservoir', volM3=14269, volEst=False, loc=kpt('PARKWAY RESEVOIR')),
 dict(id='SSR', name='Strange Street Reservoir', zone='K5', type='reservoir', volM3=250, volEst=False, loc=kpt('STRANGE STREET RESEVOIR')),
 dict(id='FPT', name='Freeport Tower', zone='K5', type='tower', volM3=4500, volEst=True, loc=kpt('FREEPORT TOWER')),
 dict(id='ERR', name='Erb Street Reservoir', zone='W4', type='reservoir', volM3=18000, volEst=False, loc=osm(43.44252, -80.58402)),
 dict(id='WZ6', name='Waterloo Zone 6 tank', zone='W4', type='tower', volM3=3000, volEst=True, loc=[43.45635, -80.57214, 'est', 'NOM']),
 dict(id='INT', name='Ira Needles elevated tank', zone='K4M', type='tower', volM3=4500, volEst=True, loc=near('Ira Needles')),
 dict(id='TBR', name='Turnbull Reservoir', zone='CAM', type='reservoir', volM3=22800, volEst=False, loc=near('Turnbull', 0.003, 0.004)),
 dict(id='PBT', name='Pinebush elevated tank', zone='CAM', type='tower', volM3=4500, volEst=True, loc=near('Pinebush Cambridge', 0.004, -0.006)),
 dict(id='EWT', name='Elmira West elevated tank', zone='K4M', type='tower', volM3=2300, volEst=True, loc=near('Elmira', 0, -0.012)),
 dict(id='AYS', name='Ayr standpipe', zone='AYR', type='tower', volM3=5061, volEst=False, loc=near('Ayr', 0.004, 0.006)),
]
for s in STORE:
    l = s.pop('loc'); s.update(lat=l[0], lon=l[1], locQuality=l[2], locSrc=SRC[l[3]])

# ---------------- zone demand from 2025 supply (sum of member site averages) ----------------
for z in ZONES:
    members = [s for s in S if s['zone'] == z['id']]
    z['avgDemandM3d'] = round(sum(s['avg2025M3d'] for s in members))
    z['sites'] = [s['id'] for s in members]
    z['demandMethod'] = 'Sum of 2025 average daily treated volumes of member sources (Summary Report App. C); zone membership is a training aggregation (ESTIMATE).'

# monthly seasonal factor from all facilities 2025
tot = collections.Counter(); ann = 0
for s in S:
    for m, v in s['monthly2025'].items(): tot[m] += v
    ann += s['avg2025M3d']
season = {m: round(tot[m] / ann, 3) for m in tot}

# Grand River near Doon 02GA048 monthly medians 2015-2025
rows = list(csv.DictReader(open(os.path.join(RAW, 'grand_river_02GA048_daily_2015_2025.csv'))))
mm = collections.defaultdict(list)
for r in rows:
    if r['DISCHARGE']: mm[int(r['DATE'][5:7])].append(float(r['DISCHARGE']))
river = {m: dict(median=round(statistics.median(v), 1), p90=round(sorted(v)[int(0.9 * len(v))], 1), p10=round(sorted(v)[int(0.1 * len(v))], 1)) for m, v in sorted(mm.items())}

ASSUME = {
 'electricity': {
   'commodity': {'offPeak': 0.098, 'midPeak': 0.157, 'onPeak': 0.203, 'source': SRC['OEB'], 'est': False,
                 'note': 'OEB RPP TOU prices effective Nov 1 2025 (summer periods May–Oct: on-peak weekdays 11–17, mid 7–11 & 17–19, off-peak 19–7 + weekends). Large Regional sites are really Class A/B (HOEP + Global Adjustment); RPP is used as a transparent proxy.'},
   'deliveryAdderPerKwh': {'value': 0.04, 'est': True, 'note': 'ESTIMATE: delivery + regulatory adder; real Enova/Kitchener Utilities/GrandBridge GS>50 kW tariffs not modelled.'},
 },
 'pumpWireToWaterEff': {'value': 0.70, 'est': True},
 'tdhM': {'wellDirect': 75, 'wellToClearwell': 40, 'highLift': 65, 'asr': 60, 'mannLowLift': 15, 'mannBooster': 45, 'mannHighLift': 70, 'est': True,
          'note': 'ESTIMATE: total dynamic head by role. Real pump curves/heads are not published.'},
 'processKwhPerM3': {'mannheim': 0.08, 'greensand': 0.01, 'uv': 0.015, 'aop': 0.05, 'est': True, 'note': 'ESTIMATE: ozone/LOX, UV, backwash, HVAC lumped.'},
 'chemicals': {
   'naocl12': {'pricePerL': 0.45, 'kgClPerL': 0.12, 'est': True},
   'cl2gas': {'pricePerKg': 3.00, 'est': True},
   'ammSulphate20': {'pricePerL': 0.55, 'densityKgL': 1.11, 'nFraction': 0.212, 'cl2ToNRatio': 4.5, 'est': True},
   'h2o2_50': {'pricePerKg': 1.20, 'est': True},
   'pacl': {'pricePerKg': 0.65, 'est': True},
   'polymer': {'pricePerKg': 4.00, 'est': True},
   'lox': {'pricePerKg': 0.25, 'kgPerKgO3': 10, 'est': True},
   'note': 'All unit prices are ESTIMATES for training (2026 CAD, delivered, typical Ontario municipal tender ranges). Edit in data/facilities.js.'},
 'chlorineDemandMgL': {'groundwater': 0.4, 'greensand': 1.2, 'river': 2.0, 'est': True},
 'alarmLimits': {
   'cl2Lo': 0.8, 'cl2LoLo': 0.5, 'cl2Hi': 3.5, 'est': True,
   'filteredTurbAlarm': 0.3, 'filteredTurbSrc': SRC['PROC'], 'filteredTurbNote': 'Procedure for Disinfection: ≤0.3 NTU in 95% of measurements each month (chemically assisted filtration).',
   'filterToWasteNtu': 1.0, 'pressLoKpa': 275, 'pressLoNote': 'ESTIMATE: ~40 psi typical Ontario minimum normal operating pressure.',
   'distMinFree': 0.05, 'distMinCombined': 0.25, 'distSrc': SRC['REG170']},
 'waterRate': {'wholesalePerM3': 1.3386, 'source': SRC['RATE'], 'est': False, 'note': '2026 Region wholesale water supply rate (for context only).'},
 'iusContext': {'avgDay2024M3d': 152167, 'maxWeek2024M3d': 183216, 'source': SRC['WWMR25'],
   'mannheimWtpAvailLs': {'sustainable': 475, 'peak': 625, 'source': SRC['PEER'], 'note': 'Plate-settler loading limit (peer review; from search-result excerpt, PDF behind bot-check).'}},
 'iusInventory': {'trunkKm': 336, 'elevatedTanks': 10, 'inGroundReservoirs': 7, 'topUpChlorination': 9, 'source': SRC['AWQR25']},
}

data = dict(generated='built by tools/build_data.py', sources=SRC, zones=ZONES, sites=S, storage=STORE, season2025=season, grandRiverMonthly=river,
            grandRiverStation=dict(id='02GA048', name='GRAND RIVER NEAR DOON', lat=43.41281, lon=-80.41703, drainageKm2=2496, source=SRC['WSC']),
            assumptions=ASSUME)
with open(OUT, 'w') as fh:
    fh.write('// AUTO-GENERATED by tools/build_data.py — edit the generator or tweak values here.\n')
    fh.write('export const DATA = ' + json.dumps(data, indent=1) + ';\n')
print('sites', len(S), 'zones', len(ZONES), 'storage', len(STORE), 'wells', sum(len(s['wells']) for s in S))
print('season', season)
for z in ZONES: print(z['id'], z['avgDemandM3d'], z['sites'])
