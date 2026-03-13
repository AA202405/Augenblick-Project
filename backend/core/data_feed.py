"""
data_feed.py — 120-OBJECT SIMULATION
======================================
Maharashtra: 30  |  Delhi: 28  |  Telangana: 22  |  Gujarat: 22  |  Goa: 18

Types: civilian_aircraft, cargo_aircraft, military_aircraft,
       helicopter, drone, bird, unknown

Paths:
  aircraft / cargo  → multi-waypoint inter+intra-state routes
  military          → closed circular patrol loop
  helicopter        → short multi-hop intra-state
  drone             → small rectangular patrol loop (low alt)
  bird              → wandering waypoints (low alt, slow)
  unknown           → erratic low path near restricted zones
"""

import math, random
from datetime import datetime, timezone
from typing import Optional

# ─────────────────────────────────────────────────────────────────────────────
# RESTRICTED ZONES
# ─────────────────────────────────────────────────────────────────────────────
RESTRICTED_ZONES = [
    {"id":"RZ-MUM",  "name":"Mumbai TMA",        "lat":(18.9,19.3),"lon":(72.7,73.1),"severity":"CRITICAL"},
    {"id":"RZ-DEL",  "name":"Delhi TMA",          "lat":(28.4,28.8),"lon":(76.9,77.3),"severity":"CRITICAL"},
    {"id":"RZ-GOA",  "name":"Goa Naval Airspace", "lat":(15.2,15.6),"lon":(73.8,74.2),"severity":"CRITICAL"},
    {"id":"RZ-HYD",  "name":"Hyderabad ATC Zone", "lat":(17.2,17.6),"lon":(78.2,78.6),"severity":"HIGH"},
    {"id":"RZ-AMD",  "name":"Ahmedabad TMA",      "lat":(22.9,23.3),"lon":(72.4,72.8),"severity":"HIGH"},
    {"id":"RZ-PUN",  "name":"Pune Military Zone", "lat":(18.5,18.7),"lon":(73.8,74.0),"severity":"HIGH"},
    {"id":"RZ-NDLS", "name":"New Delhi VIP Zone", "lat":(28.55,28.65),"lon":(77.1,77.2),"severity":"CRITICAL"},
]

# ─────────────────────────────────────────────────────────────────────────────
# NAMED COORDINATES  (lat, lon)
# ─────────────────────────────────────────────────────────────────────────────
# Maharashtra
MUM=(19.089,72.866); PNQ=(18.580,73.909); NAG=(21.092,79.047)
AUR=(19.877,75.343); NAS=(20.119,73.790); SOL=(17.627,75.906)
AMR=(21.604,77.782); KOL=(20.397,78.314); JLG=(16.832,75.719)
MHKD=(19.730,75.320)  # Khamgaon (midpoint)

# Goa
GOI=(15.381,73.831); PAN=(15.491,73.828); MAP=(15.299,74.124)
VAS=(15.506,73.990); CAL=(15.600,73.750); CAN=(15.350,74.367)
PON=(15.450,73.980)   # Ponda

# Telangana
HYD=(17.240,78.429); WAR=(17.978,79.594); NZB=(18.860,79.096)
KRM=(17.001,79.982); SID=(16.679,78.927); ADB=(18.706,78.096)
KGL=(17.540,78.800)   # Keesara (midpoint)

# Gujarat
AMD=(23.077,72.627); STV=(21.170,72.831); VDO=(22.307,73.181)
RJT=(22.292,70.780); BHJ=(23.287,69.670); JMN=(22.471,70.058)
POR=(22.600,69.600); GAD=(23.223,72.650); ANK=(23.703,72.554)

# Delhi / NCR
DEL=(28.556,77.100); AGR=(27.177,78.008); GWL=(26.293,78.228)
LKO=(26.761,80.889); JDH=(28.926,77.740); NDA=(28.459,77.027)
FAR=(28.409,77.318); NOI=(28.536,77.391); MTH=(27.496,77.673)
CNB=(26.450,80.332)   # Kanpur

# ─────────────────────────────────────────────────────────────────────────────
# ANOMALY CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────
AN_NONE   = None
AN_ADROP  = "altitude_drop"
AN_ERRAT  = "erratic_heading"
AN_RZONE  = "restricted_zone"
AN_NOXP   = "no_transponder"
AN_LOWF   = "low_alt_high_speed"
AN_SBURST = "speed_burst"
AN_BIRD   = "bird_in_corridor"

STATE_MAP = {"MH":"Maharashtra","GA":"Goa","TG":"Telangana","GJ":"Gujarat","DL":"Delhi"}

_HISTORY_LEN  = 20
_FUTURE_STEPS = 8
_TICK_SECS    = 2.0

# ─────────────────────────────────────────────────────────────────────────────
# ROUTE BUILDER HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def _ac(cs,wps,spd=245,alt=9800,anom=AN_NONE,airl=1):
    return dict(callsign=cs,type="civilian_aircraft",is_drone=0,has_callsign=1,is_unidentified=0,
                known_aircraft=1,is_known_airline=airl,is_faa_registered=0,faa_type_known=1,
                base_speed=spd,base_altitude=alt,anomaly=anom,waypoints=wps)

def _cg(cs,wps,spd=210,alt=8500,anom=AN_NONE):
    return dict(callsign=cs,type="cargo_aircraft",is_drone=0,has_callsign=1,is_unidentified=0,
                known_aircraft=1,is_known_airline=0,is_faa_registered=0,faa_type_known=1,
                base_speed=spd,base_altitude=alt,anomaly=anom,waypoints=wps)

def _mil(cs,wps,spd=380,alt=11500,anom=AN_NONE):
    return dict(callsign=cs,type="military_aircraft",is_drone=0,has_callsign=1,is_unidentified=0,
                known_aircraft=1,is_known_airline=0,is_faa_registered=0,faa_type_known=1,
                base_speed=spd,base_altitude=alt,anomaly=anom,waypoints=wps)

def _heli(cs,wps,spd=65,alt=750,anom=AN_NONE):
    return dict(callsign=cs,type="helicopter",is_drone=0,has_callsign=1,is_unidentified=0,
                known_aircraft=1,is_known_airline=0,is_faa_registered=0,faa_type_known=1,
                base_speed=spd,base_altitude=alt,anomaly=anom,waypoints=wps)

def _drone(cs,wps,spd=14,alt=110,anom=AN_NONE,unid=0):
    return dict(callsign=cs,type="drone",is_drone=1,has_callsign=1 if cs else 0,is_unidentified=unid,
                known_aircraft=0,is_known_airline=0,is_faa_registered=0,faa_type_known=0,
                base_speed=spd,base_altitude=alt,anomaly=anom,waypoints=wps)

def _bird(wps,spd=16,alt=650,anom=AN_NONE):
    return dict(callsign="",type="bird",is_drone=0,has_callsign=0,is_unidentified=0,
                known_aircraft=0,is_known_airline=0,is_faa_registered=0,faa_type_known=0,
                base_speed=spd,base_altitude=alt,anomaly=anom,waypoints=wps)

def _unk(wps,spd=85,alt=2800,anom=AN_NOXP):
    return dict(callsign="",type="unknown",is_drone=0,has_callsign=0,is_unidentified=1,
                known_aircraft=0,is_known_airline=0,is_faa_registered=0,faa_type_known=0,
                base_speed=spd,base_altitude=alt,anomaly=anom,waypoints=wps)

# patrol loop helper: returns 4-point box around center
def _loop(clat,clon,dlat=0.18,dlon=0.22):
    return [
        (clat+dlat, clon-dlon),
        (clat+dlat, clon+dlon),
        (clat-dlat, clon+dlon),
        (clat-dlat, clon-dlon),
    ]

# small drone box
def _dbox(clat,clon,d=0.04):
    return [
        (clat+d, clon-d),(clat+d, clon+d),
        (clat-d, clon+d),(clat-d, clon-d),
    ]

# ─────────────────────────────────────────────────────────────────────────────
# ROUTES  —  120 objects
# ─────────────────────────────────────────────────────────────────────────────
ROUTES = {

    # ══════════════════════════════════════════════════════════════════════════
    # MAHARASHTRA — 30 objects
    # ══════════════════════════════════════════════════════════════════════════

    # ── Commercial Aircraft (10) ──────────────────────────────────────────────
    # Inter-state long hauls
    "MH-AC01": _ac("AI-101",  [MUM,PNQ,AUR,NAG,HYD],         250,10500),          # MUM→HYD via stops
    "MH-AC02": _ac("6E-202",  [NAG,KOL,AMR,AUR,MUM],         245, 9800),          # NAG→MUM
    "MH-AC03": _ac("SG-303",  [MUM,NAS,AUR,SOL,HYD],         240, 9500, AN_ADROP),# anomaly mid-route
    "MH-AC04": _ac("IX-404",  [HYD,SOL,PNQ,MUM],             245,10200),          # HYD→MUM
    "MH-AC05": _ac("QP-505",  [AMD,NAS,MUM],                  238, 9300, AN_ERRAT),
    # Intra-state hops
    "MH-AC06": _ac("AI-606",  [MUM,NAS,PNQ],                  180, 7500),
    "MH-AC07": _ac("TR-707",  [NAG,AMR,KOL,AUR],              190, 8000),
    "MH-AC08": _ac("VT-808",  [PNQ,SOL,JLG],                  170, 7000),
    "MH-AC09": _ac("G8-909",  [MUM,PNQ,NAS,AUR],              200, 8200),
    "MH-AC10": _ac("AI-110",  [SOL,PNQ,MUM],                  185, 7800),

    # ── Cargo (3) ─────────────────────────────────────────────────────────────
    "MH-CG01": _cg("BLUEDRM", [MUM,PNQ,NAG],                  210, 8500),
    "MH-CG02": _cg("CARGO-2", [NAG,AUR,MUM],                  205, 8200),
    "MH-CG03": _cg("FEDX-MH", [DEL,NAS,MUM],                  215, 8800),

    # ── Military (2) ──────────────────────────────────────────────────────────
    "MH-ML01": _mil("IAF-MH1", _loop(19.2,75.5,0.4,0.5),     400,12000),         # patrol central MH
    "MH-ML02": _mil("IAF-MH2", _loop(20.5,78.0,0.35,0.4),    380,11500, AN_SBURST),

    # ── Helicopter (4) ────────────────────────────────────────────────────────
    "MH-HL01": _heli("EMS-MH1",[MUM,PNQ,NAS],                  65,  700),
    "MH-HL02": _heli("IAF-MH3",[NAG,AMR,KOL],                  70, 1200, AN_SBURST),
    "MH-HL03": _heli("MED-MH4",[PNQ,SOL,JLG,PNQ],              58,  600),
    "MH-HL04": _heli("CSTG-MH",[MUM,(19.0,72.95),(19.05,73.0),MUM], 60, 500),

    # ── Drone (4) ─────────────────────────────────────────────────────────────
    "MH-DR01": _drone("",       _dbox(19.05,72.93),            18,  120, AN_RZONE, 1), # near Mumbai TMA
    "MH-DR02": _drone("MH-D02", _dbox(18.60,73.91),            22,  150),
    "MH-DR03": _drone("MH-D03", _dbox(21.10,79.06),            15,  100),
    "MH-DR04": _drone("MH-D04", _dbox(19.88,75.34),            25,  200, AN_LOWF),

    # ── Bird (4) ──────────────────────────────────────────────────────────────
    "MH-BR01": _bird([MUM,NAS,(19.5,73.4),(19.8,73.6),NAS],    22, 950, AN_BIRD),
    "MH-BR02": _bird([PNQ,SOL,(18.0,75.5),SOL],                18, 600),
    "MH-BR03": _bird([NAG,(20.8,78.8),(20.5,78.5),AMR],        20, 800),
    "MH-BR04": _bird([(19.3,74.2),(19.5,74.5),(19.7,74.8),(19.9,75.0)], 17, 700),

    # ── Unknown (3) ───────────────────────────────────────────────────────────
    "MH-UK01": _unk([AMR,(20.8,76.5),(20.2,75.0),MUM],         95, 3500),
    "MH-UK02": _unk([SOL,(18.5,75.0),PNQ],                     70, 2800),
    "MH-UK03": _unk([(18.7,73.85),(18.95,73.0),(19.0,72.98)],  80, 3000, AN_ERRAT),

    # ══════════════════════════════════════════════════════════════════════════
    # DELHI / NCR — 28 objects
    # ══════════════════════════════════════════════════════════════════════════

    # ── Commercial Aircraft (10) ──────────────────────────────────────────────
    "DL-AC01": _ac("AI-201",  [DEL,MTH,AGR,LKO],              255,10800),          # DEL→LKO
    "DL-AC02": _ac("6E-202",  [LKO,CNB,AGR,DEL],              250,10500),
    "DL-AC03": _ac("SG-303",  [DEL,GWL,AGR],                  245, 9800, AN_ADROP),
    "DL-AC04": _ac("IX-404",  [DEL,AMD],                       250,10200),          # long haul DEL→AMD
    "DL-AC05": _ac("QP-505",  [MUM,AGR,DEL],                  248,10000),
    "DL-AC06": _ac("AI-606",  [DEL,NOI,JDH,DEL],              180, 7500),          # short loop NCR
    "DL-AC07": _ac("TR-707",  [DEL,NDA,FAR,NOI,DEL],          185, 7800),
    "DL-AC08": _ac("VT-808",  [AGR,MTH,DEL],                  190, 8000),
    "DL-AC09": _ac("G8-909",  [DEL,GWL,CNB,LKO],              200, 8200, AN_ERRAT),
    "DL-AC10": _ac("AI-010",  [HYD,AGR,DEL],                  245, 9600),

    # ── Cargo (3) ─────────────────────────────────────────────────────────────
    "DL-CG01": _cg("FEDX-DL", [DEL,AGR,LKO],                  210, 8500),
    "DL-CG02": _cg("BLUE-DL", [MUM,AGR,DEL],                  205, 8200),
    "DL-CG03": _cg("DHL-DEL", [DEL,GWL,AMD],                  215, 8800),

    # ── Military (3) ──────────────────────────────────────────────────────────
    "DL-ML01": _mil("IAF-DL1", _loop(28.6,77.1,0.3,0.35),     420,12500),
    "DL-ML02": _mil("IAF-DL2", [GWL,AGR,MTH,DEL,JDH,GWL],    400,11500, AN_SBURST),
    "DL-ML03": _mil("IAF-DL3", _loop(27.8,78.5,0.4,0.5),      390,12000),

    # ── Helicopter (4) ────────────────────────────────────────────────────────
    "DL-HL01": _heli("DEL-H1", [DEL,NDA,FAR],                  65,  800),
    "DL-HL02": _heli("IAF-H2", [JDH,DEL,NDA],                  80, 1200, AN_SBURST),
    "DL-HL03": _heli("MED-DL", [DEL,NOI,FAR,DEL],              60,  700),
    "DL-HL04": _heli("VIP-DL", [DEL,NDA,DEL],                  70,  900),

    # ── Drone (4) ─────────────────────────────────────────────────────────────
    "DL-DR01": _drone("",       _dbox(28.60,77.15),            18, 120, AN_RZONE, 1), # near Delhi VIP
    "DL-DR02": _drone("DL-D02", _dbox(28.46,77.03),            22, 150),
    "DL-DR03": _drone("DL-D03", _dbox(28.41,77.32),            15, 100),
    "DL-DR04": _drone("DL-D04", _dbox(28.54,77.40),            25, 200, AN_LOWF),

    # ── Bird (2) ──────────────────────────────────────────────────────────────
    "DL-BR01": _bird([DEL,MTH,AGR,(27.5,77.9),AGR],            20, 850, AN_BIRD),
    "DL-BR02": _bird([NDA,FAR,NOI,JDH],                         17, 600),

    # ── Unknown (2) ───────────────────────────────────────────────────────────
    "DL-UK01": _unk([GWL,MTH,AGR,DEL],                         95, 3500),
    "DL-UK02": _unk([(28.45,77.0),(28.52,77.12),(28.58,77.18)],80, 3000, AN_ERRAT),

    # ══════════════════════════════════════════════════════════════════════════
    # TELANGANA — 22 objects
    # ══════════════════════════════════════════════════════════════════════════

    # ── Commercial Aircraft (7) ───────────────────────────────────────────────
    "TG-AC01": _ac("AI-301",  [HYD,KGL,WAR,NZB],              250,10500),
    "TG-AC02": _ac("6E-302",  [DEL,WAR,HYD],                  248,10200),
    "TG-AC03": _ac("SG-303",  [HYD,MUM],                       245, 9800, AN_ADROP),
    "TG-AC04": _ac("IX-404",  [HYD,SID,KRM,WAR],              235, 9200),
    "TG-AC05": _ac("QP-305",  [AMD,HYD],                       240, 9500),
    "TG-AC06": _ac("AI-606",  [HYD,ADB,NZB],                  220, 8500, AN_ERRAT),
    "TG-AC07": _ac("TR-307",  [HYD,GOI],                       230, 9000),

    # ── Cargo (2) ─────────────────────────────────────────────────────────────
    "TG-CG01": _cg("BLUE-TG", [MUM,HYD,WAR],                  208, 8300),
    "TG-CG02": _cg("FEDX-TG", [HYD,DEL],                       212, 8600),

    # ── Military (2) ──────────────────────────────────────────────────────────
    "TG-ML01": _mil("IAF-TG1", _loop(17.8,79.2,0.4,0.5),      390,12000),
    "TG-ML02": _mil("IAF-TG2", [HYD,WAR,NZB,HYD],             380,11500, AN_SBURST),

    # ── Helicopter (3) ────────────────────────────────────────────────────────
    "TG-HL01": _heli("HYD-H1", [HYD,KGL,WAR],                  65,  800),
    "TG-HL02": _heli("HYD-H2", [WAR,NZB,ADB],                  70, 1000, AN_SBURST),
    "TG-HL03": _heli("MED-TG", [HYD,SID,KRM],                  60,  700),

    # ── Drone (3) ─────────────────────────────────────────────────────────────
    "TG-DR01": _drone("",       _dbox(17.30,78.40),            18, 120, AN_RZONE, 1),
    "TG-DR02": _drone("TG-D02", _dbox(17.98,79.60),            22, 150),
    "TG-DR03": _drone("TG-D03", _dbox(18.86,79.10),            15, 100, AN_LOWF),

    # ── Bird (2) ──────────────────────────────────────────────────────────────
    "TG-BR01": _bird([HYD,KGL,(17.7,79.0),WAR],                20, 850, AN_BIRD),
    "TG-BR02": _bird([WAR,KRM,SID],                             17, 600),

    # ── Unknown (3) ───────────────────────────────────────────────────────────
    "TG-UK01": _unk([KRM,(17.5,79.5),HYD],                     90, 3400),
    "TG-UK02": _unk([ADB,(18.0,78.5),(17.5,78.4),HYD],         75, 2900),
    "TG-UK03": _unk([(17.35,78.35),(17.28,78.50),(17.22,78.55)],80,3000, AN_ERRAT),

    # ══════════════════════════════════════════════════════════════════════════
    # GUJARAT — 22 objects
    # ══════════════════════════════════════════════════════════════════════════

    # ── Commercial Aircraft (7) ───────────────────────────────────────────────
    "GJ-AC01": _ac("AI-401",  [AMD,VDO,STV,MUM],              248,10200),
    "GJ-AC02": _ac("6E-402",  [DEL,AMD],                       250,10500),
    "GJ-AC03": _ac("SG-403",  [AMD,RJT,BHJ],                  235, 9200, AN_ADROP),
    "GJ-AC04": _ac("IX-404",  [MUM,STV,AMD],                  240, 9500),
    "GJ-AC05": _ac("QP-405",  [AMD,GAD,ANK,DEL],              245, 9800),
    "GJ-AC06": _ac("AI-406",  [AMD,VDO,STV],                  180, 7500),
    "GJ-AC07": _ac("TR-407",  [BHJ,JMN,RJT,AMD],              190, 8000, AN_ERRAT),

    # ── Cargo (2) ─────────────────────────────────────────────────────────────
    "GJ-CG01": _cg("BLUE-GJ", [AMD,STV,MUM],                  208, 8300),
    "GJ-CG02": _cg("DHL-GJ",  [DEL,AMD,BHJ],                  212, 8600),

    # ── Military (2) ──────────────────────────────────────────────────────────
    "GJ-ML01": _mil("IAF-GJ1", _loop(22.5,70.5,0.5,0.6),      385,12000),
    "GJ-ML02": _mil("IAF-GJ2", [AMD,RJT,BHJ,JMN,AMD],         375,11500, AN_SBURST),

    # ── Helicopter (3) ────────────────────────────────────────────────────────
    "GJ-HL01": _heli("AMD-H1", [AMD,VDO,STV],                  65,  800),
    "GJ-HL02": _heli("CST-GJ", [JMN,POR,BHJ],                  70, 1000),
    "GJ-HL03": _heli("MED-GJ", [AMD,GAD,ANK,AMD],              60,  700, AN_SBURST),

    # ── Drone (3) ─────────────────────────────────────────────────────────────
    "GJ-DR01": _drone("",       _dbox(23.10,72.60),            18, 120, AN_RZONE, 1),
    "GJ-DR02": _drone("GJ-D02", _dbox(21.18,72.84),            22, 150),
    "GJ-DR03": _drone("GJ-D03", _dbox(23.29,69.68),            15, 100, AN_LOWF),

    # ── Bird (2) ──────────────────────────────────────────────────────────────
    "GJ-BR01": _bird([AMD,STV,(21.8,72.4),(21.5,72.2)],        20, 850, AN_BIRD),
    "GJ-BR02": _bird([RJT,JMN,POR],                             17, 600),

    # ── Unknown (3) ───────────────────────────────────────────────────────────
    "GJ-UK01": _unk([POR,JMN,RJT,AMD],                         90, 3300),
    "GJ-UK02": _unk([BHJ,(22.8,70.5),(22.5,71.0),AMD],         75, 2800),
    "GJ-UK03": _unk([(23.05,72.55),(23.15,72.50),(23.25,72.48)],80,3000,AN_ERRAT),

    # ══════════════════════════════════════════════════════════════════════════
    # GOA — 18 objects
    # ══════════════════════════════════════════════════════════════════════════

    # ── Commercial Aircraft (5) ───────────────────────────────────────────────
    "GA-AC01": _ac("G8-501",  [GOI,MUM],                       225, 8800),
    "GA-AC02": _ac("AI-502",  [MUM,GOI],                       230, 9000),
    "GA-AC03": _ac("6E-503",  [GOI,HYD],                       235, 9200, AN_ADROP),
    "GA-AC04": _ac("IX-504",  [AMD,GOI],                       240, 9500),
    "GA-AC05": _ac("QP-505",  [GOI,PAN,MAP,GOI],              160, 6500, AN_ERRAT),

    # ── Cargo (1) ─────────────────────────────────────────────────────────────
    "GA-CG01": _cg("BLUE-GA", [MUM,GOI,PAN],                  205, 8200),

    # ── Military (2) ──────────────────────────────────────────────────────────
    "GA-ML01": _mil("NAVY-G1", _loop(15.45,73.95,0.15,0.18),  350,10000),  # Goa naval patrol
    "GA-ML02": _mil("IAF-GA2", [GOI,MAP,CAN,GOI],             360,10500, AN_SBURST),

    # ── Helicopter (3) ────────────────────────────────────────────────────────
    "GA-HL01": _heli("GOA-H1", [GOI,VAS,PAN],                  55,  500),
    "GA-HL02": _heli("NAVY-H", [GOI,PON,MAP],                  70,  900, AN_SBURST),
    "GA-HL03": _heli("MED-GA", [MAP,CAN,PON],                  60,  700),

    # ── Drone (3) ─────────────────────────────────────────────────────────────
    "GA-DR01": _drone("",       _dbox(15.40,73.88),            12,  80, AN_RZONE, 1), # near Goa TMA
    "GA-DR02": _drone("GA-D02", _dbox(15.49,73.85),            15, 100),
    "GA-DR03": _drone("GA-D03", _dbox(15.35,74.38),            20, 150, AN_LOWF),

    # ── Bird (2) ──────────────────────────────────────────────────────────────
    "GA-BR01": _bird([GOI,PON,(15.45,73.70),PAN],              20, 800, AN_BIRD),
    "GA-BR02": _bird([MAP,CAN,(15.28,74.30)],                   16, 550),

    # ── Unknown (2) ───────────────────────────────────────────────────────────
    "GA-UK01": _unk([CAN,MAP,(15.38,73.96),GOI],               80, 2800),
    "GA-UK02": _unk([(15.32,73.90),(15.38,73.85),(15.41,73.80)],75,2500,AN_ERRAT),
}

# ─────────────────────────────────────────────────────────────────────────────
# SIMULATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────
_sim_state: dict = {}
_tick_count: int = 0

def _haversine(la1,lo1,la2,lo2):
    R=6371.0; dlat=math.radians(la2-la1); dlon=math.radians(lo2-lo1)
    a=math.sin(dlat/2)**2+math.cos(math.radians(la1))*math.cos(math.radians(la2))*math.sin(dlon/2)**2
    return R*2*math.asin(math.sqrt(max(0,a)))

def _bearing(la1,lo1,la2,lo2):
    dlon=math.radians(lo2-lo1); r1,r2=math.radians(la1),math.radians(la2)
    x=math.sin(dlon)*math.cos(r2); y=math.cos(r1)*math.sin(r2)-math.sin(r1)*math.cos(r2)*math.cos(dlon)
    return (math.degrees(math.atan2(x,y))+360)%360

def _lerp(a,b,t): return a+(b-a)*t

def _check_restricted(lat,lon):
    for z in RESTRICTED_ZONES:
        if z["lat"][0]<=lat<=z["lat"][1] and z["lon"][0]<=lon<=z["lon"][1]:
            return {"in_zone":True,"zone_id":z["id"],"zone_name":z["name"]}
    return {"in_zone":False,"zone_id":None,"zone_name":None}

def _init_all():
    for obj_id, route in ROUTES.items():
        wps = route["waypoints"]
        n   = len(wps)
        start_wp = random.randint(0, max(0, n-2))
        _sim_state[obj_id] = {
            "wp_idx":    start_wp,
            "seg_prog":  random.uniform(0.0, 0.9),
            "direction": 1,
            "history":   [],
            "loop_count":0,
        }

def _predict_future(obj_id, speed_ms, vr, wp_idx, seg_prog, direction):
    wps   = ROUTES[obj_id]["waypoints"]
    n     = len(wps)
    future= []
    wi, sp, di = wp_idx, seg_prog, direction

    for step in range(_FUTURE_STEPS):
        step_km = (speed_ms * _TICK_SECS * 3) / 1000.0
        p1 = wps[wi % n]; p2 = wps[(wi+1) % n]
        seg_km = _haversine(p1[0],p1[1],p2[0],p2[1])
        delta  = step_km / max(seg_km, 0.001)
        sp    += delta
        while sp >= 1.0:
            sp -= 1.0
            wi += di
            if wi >= n-1:
                wi = n-2; di = -1
            elif wi < 0:
                wi = 1; di = 1
            p1 = wps[wi % n]; p2 = wps[(wi+1) % n]
            seg_km = _haversine(p1[0],p1[1],p2[0],p2[1])
        t  = min(sp, 1.0)
        la = _lerp(p1[0],p2[0],t); lo = _lerp(p1[1],p2[1],t)
        fa = max(0, ROUTES[obj_id]["base_altitude"] + vr*(step+1)*0.5)
        future.append({"lat":round(la,6),"lon":round(lo,6),"alt":round(fa,1),"t":step+1})
    return future

def _advance(obj_id):
    global _tick_count
    st    = _sim_state[obj_id]
    route = ROUTES[obj_id]
    wps   = route["waypoints"]
    n     = len(wps)
    anom  = route.get("anomaly")
    speed = float(route["base_speed"])
    base_alt = float(route["base_altitude"])

    # Speed anomaly mods
    if anom == AN_SBURST and _tick_count % 15 < 7:
        speed *= 2.8
    elif anom == AN_ERRAT:
        speed *= random.uniform(0.5, 1.5)

    wi = st["wp_idx"] % n
    p1 = wps[wi]; p2 = wps[(wi+1) % n]
    seg_km = _haversine(p1[0],p1[1],p2[0],p2[1])
    delta  = (speed * _TICK_SECS / 1000.0) / max(seg_km, 0.001)
    st["seg_prog"] += delta

    while st["seg_prog"] >= 1.0:
        st["seg_prog"] -= 1.0
        st["wp_idx"]   += st["direction"]
        # bounce at ends
        if st["wp_idx"] >= n-1:
            st["wp_idx"] = n-2; st["direction"] = -1; st["loop_count"] += 1
        elif st["wp_idx"] < 0:
            st["wp_idx"] = 1;   st["direction"] =  1; st["loop_count"] += 1
        wi = st["wp_idx"] % n
        p1 = wps[wi]; p2 = wps[(wi+1) % n]
        seg_km = _haversine(p1[0],p1[1],p2[0],p2[1])

    t   = min(st["seg_prog"], 1.0)
    lat = _lerp(p1[0], p2[0], t)
    lon = _lerp(p1[1], p2[1], t)
    alt = base_alt; vr = 0.0

    # Altitude / anomaly overrides
    prog_ratio = st["wp_idx"] / max(n-1, 1)
    if anom == AN_ADROP and 0.35 < prog_ratio < 0.55:
        alt = 2500 + random.uniform(-200,200); vr = -350.0
    elif anom == AN_ADROP and 0.55 <= prog_ratio < 0.70:
        alt = min(base_alt, alt+1500); vr = 320.0
    elif anom == AN_RZONE:
        alt = max(60, alt - _tick_count*0.3); vr = -3.0
    elif anom == AN_LOWF:
        alt = max(20, base_alt*0.05); vr = random.uniform(-1,1)
    elif anom == AN_BIRD:
        alt = base_alt + math.sin(_tick_count*0.3)*50; vr = random.uniform(-5,10)
    elif anom == AN_SBURST and _tick_count%15 < 7:
        alt = base_alt + random.uniform(-400,400); vr = random.choice([-300,-250,250,300])
    elif anom == AN_ERRAT:
        vr = random.uniform(-5,5)
    else:
        vr = random.uniform(-1.5,1.5)

    # Heading toward next waypoint
    nxt = wps[(st["wp_idx"]+1) % n]
    heading = _bearing(lat,lon,nxt[0],nxt[1])
    if anom == AN_ERRAT and _tick_count%10 < 5:
        heading = (heading + random.uniform(-120,120)) % 360

    # Tiny noise
    lat += random.gauss(0, 0.00007); lon += random.gauss(0, 0.00007)
    alt  = max(0, alt + random.gauss(0,4))

    # Anomaly flag
    is_anom, anom_label = False, "Normal"
    if anom == AN_ADROP and 0.35 < prog_ratio < 0.55:
        is_anom, anom_label = True, "Abrupt Altitude Change"
    elif anom == AN_ERRAT and _tick_count%10 < 5:
        is_anom, anom_label = True, "Irregular Route"
    elif anom == AN_RZONE:
        is_anom, anom_label = True, "Restricted Zone Entry"
    elif anom == AN_NOXP:
        is_anom, anom_label = True, "Unidentified Object"
    elif anom == AN_LOWF:
        is_anom, anom_label = True, "Low Altitude High Speed"
    elif anom == AN_BIRD and prog_ratio >= 0.3:
        is_anom, anom_label = True, "Bird in Flight Corridor"
    elif anom == AN_SBURST and _tick_count%15 < 7:
        is_anom, anom_label = True, "Sudden Speed Burst"

    ts = datetime.now(timezone.utc).isoformat()
    st["history"].append({"lat":round(lat,6),"lon":round(lon,6),"alt":round(alt,1),"ts":ts})
    if len(st["history"]) > _HISTORY_LEN:
        st["history"] = st["history"][-_HISTORY_LEN:]

    future = _predict_future(obj_id, speed, vr, st["wp_idx"], st["seg_prog"], st["direction"])
    rz     = _check_restricted(lat, lon)
    prefix = obj_id.split("-")[0]
    state_region = STATE_MAP.get(prefix,"Unknown")

    # Source = first waypoint, destination = last waypoint
    src = wps[0]; dst = wps[-1]

    return {
        "icao24":               obj_id,
        "callsign":             route["callsign"],
        "object_type":          route["type"],
        "latitude":             round(lat,6),
        "longitude":            round(lon,6),
        "baro_altitude":        round(alt,1),
        "velocity":             round(speed,2),
        "true_track":           round(heading,2),
        "vertical_rate":        round(vr,2),
        "geo_altitude":         round(alt+random.gauss(0,8),1),
        "has_callsign":         route["has_callsign"],
        "is_unidentified":      route["is_unidentified"],
        "known_aircraft":       route["known_aircraft"],
        "is_drone":             route["is_drone"],
        "is_known_airline":     route["is_known_airline"],
        "is_faa_registered":    route["is_faa_registered"],
        "faa_type_known":       route["faa_type_known"],
        "source":               {"lat":src[0],"lon":src[1]},
        "destination":          {"lat":dst[0],"lon":dst[1]},
        "waypoints":            [{"lat":w[0],"lon":w[1]} for w in wps],
        "route_progress":       round(prog_ratio,4),
        "route_direction":      st["direction"],
        "state_region":         state_region,
        "history":              list(st["history"]),
        "future_trajectory":    future,
        "in_restricted_zone":   rz["in_zone"],
        "restricted_zone_id":   rz["zone_id"],
        "restricted_zone_name": rz["zone_name"],
        "anomaly_active":       is_anom,
        "anomaly_label":        anom_label,
        "loop_count":           st["loop_count"],
        "source_str":           "simulation",
        "timestamp":            ts,
    }

async def get_current_objects() -> list:
    global _tick_count
    if not _sim_state:
        _init_all()
    _tick_count += 1
    objects = []
    for obj_id in ROUTES:
        try:
            objects.append(_advance(obj_id))
        except Exception as e:
            print(f"[data_feed] Error on {obj_id}: {e}")
    return objects

def get_restricted_zones() -> list:
    return RESTRICTED_ZONES

def get_tick_count() -> int:
    return _tick_count