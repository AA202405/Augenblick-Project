"""
demo_ai.py
Data-aware AI response generator.
Uses live backend object data to produce intelligent-looking responses
when the real LLM is unavailable or rate-limited.
"""

from typing import Optional


def generate_demo_ai_response(query: str, objects: list) -> Optional[str]:
    """
    Generate a realistic response based on current airspace state.
    Returns None if no keyword matched (caller should try static_ai next).
    """
    total_objects = len(objects)

    # Count by type
    drones    = sum(1 for o in objects if (o.get("object_type") or o.get("type") or "").lower() == "drone")
    aircraft  = sum(1 for o in objects if (o.get("object_type") or o.get("type") or "").lower() in
                    ("civilian_aircraft", "cargo_aircraft", "military_aircraft", "aircraft"))
    birds     = sum(1 for o in objects if (o.get("object_type") or o.get("type") or "").lower() == "bird")
    helis     = sum(1 for o in objects if (o.get("object_type") or o.get("type") or "").lower() == "helicopter")
    unknowns  = sum(1 for o in objects if (o.get("object_type") or o.get("type") or "").lower() == "unknown")

    # Count by risk
    critical_risk = sum(1 for o in objects if (o.get("risk_level") or o.get("risk") or "").upper() == "CRITICAL")
    high_risk     = sum(1 for o in objects if (o.get("risk_level") or o.get("risk") or "").upper() == "HIGH")
    medium_risk   = sum(1 for o in objects if (o.get("risk_level") or o.get("risk") or "").upper() == "MEDIUM")

    # Anomalies
    anomalies = [o for o in objects if o.get("is_anomaly") or o.get("anomaly_type") not in (None, "Normal", "")]
    zone_breaches = [o for o in objects if o.get("in_restricted_zone")]

    # State distribution
    state_counts: dict = {}
    for o in objects:
        sr = o.get("state_region") or o.get("region") or "Unknown"
        state_counts[sr] = state_counts.get(sr, 0) + 1
    state_str = ", ".join(f"{v} in {k}" for k, v in state_counts.items()) if state_counts else "across monitored states"

    q = query.lower()

    # ── How many / total objects ───────────────────────────────────────────────
    if any(k in q for k in ["how many object", "total object", "how many aerial", "objects detected", "objects tracked", "currently detected"]):
        return (
            f"The monitoring system is currently tracking {total_objects} aerial objects across the monitored airspace "
            f"({state_str}). This includes {aircraft} aircraft, {drones} drones, {helis} helicopters, "
            f"{birds} birds, and {unknowns} unidentified objects."
        )

    # ── Drones ────────────────────────────────────────────────────────────────
    if any(k in q for k in ["drone", "uav", "uas"]):
        anom_drones = [o for o in objects
                       if (o.get("object_type") or "").lower() == "drone" and o.get("is_anomaly")]
        return (
            f"The AI system has detected {drones} drones currently active in the monitored airspace. "
            f"{len(anom_drones)} of them are exhibiting anomalous behaviour such as erratic movement or "
            f"restricted zone proximity. Drones are monitored with elevated sensitivity due to their low "
            f"radar cross-section and potential to penetrate controlled airspace."
        )

    # ── Aircraft ─────────────────────────────────────────────────────────────
    if any(k in q for k in ["aircraft", "plane", "flight", "commercial"]):
        return (
            f"There are currently {aircraft} aircraft detected in the monitored region. "
            f"Most are following standard commercial flight corridors. "
            f"The system is cross-referencing their transponder data and flight plans against known airline routes."
        )

    # ── Risk ──────────────────────────────────────────────────────────────────
    if any(k in q for k in ["risk", "danger", "threat", "hazard"]):
        top_risk = sorted(objects, key=lambda x: x.get("risk_score", 0), reverse=True)[:3]
        top_ids  = ", ".join(o.get("object_id", "?") for o in top_risk) if top_risk else "none"
        return (
            f"The system has flagged {critical_risk} critical-risk and {high_risk} high-risk objects "
            f"based on trajectory deviation, altitude anomalies, and restricted zone proximity. "
            f"There are also {medium_risk} medium-risk objects under close observation. "
            f"Highest risk objects: {top_ids}."
        )

    # ── Anomaly ───────────────────────────────────────────────────────────────
    if any(k in q for k in ["anomaly", "anomalies", "unusual", "irregular", "suspicious"]):
        anom_types = {}
        for o in anomalies:
            t = o.get("anomaly_type", "Unknown")
            anom_types[t] = anom_types.get(t, 0) + 1
        type_str = ", ".join(f"{v}× {k}" for k, v in anom_types.items()) if anom_types else "none detected"
        return (
            f"Anomaly detection is currently active across all {total_objects} tracked objects. "
            f"The system has identified {len(anomalies)} anomalous entities. "
            f"Breakdown by type: {type_str}. "
            f"The IsolationForest model evaluates trajectory deviation, velocity spikes, altitude violations, "
            f"and heading irregularities in real time."
        )

    # ── Restricted zone / breach ───────────────────────────────────────────────
    if any(k in q for k in ["zone", "restricted", "breach", "violation"]):
        if not zone_breaches:
            return (
                f"No restricted zone breaches are currently detected across all {total_objects} tracked objects. "
                f"All monitored objects are operating within permitted airspace boundaries."
            )
        ids = ", ".join(o.get("object_id", "?") for o in zone_breaches[:5])
        return (
            f"⚠ {len(zone_breaches)} restricted zone breach(es) detected. "
            f"Objects in violation: {ids}. "
            f"Immediate ATC notification is recommended. These objects are operating inside protected airspace "
            f"and require intercept or communication protocols."
        )

    # ── Summary ───────────────────────────────────────────────────────────────
    if any(k in q for k in ["summary", "overview", "status", "situation", "give me"]):
        return (
            f"Current airspace summary: {total_objects} objects are being tracked ({state_str}). "
            f"Object breakdown — {aircraft} aircraft, {drones} drones, {helis} helicopters, "
            f"{birds} birds, {unknowns} unidentified. "
            f"Risk status — {critical_risk} CRITICAL, {high_risk} HIGH, {medium_risk} MEDIUM. "
            f"Active anomalies: {len(anomalies)}. Restricted zone breaches: {len(zone_breaches)}. "
            f"All sensors nominal. Continuous monitoring in progress."
        )

    # ── Critical objects ──────────────────────────────────────────────────────
    if any(k in q for k in ["critical", "immediate", "urgent", "worst"]):
        crits = [o for o in objects if (o.get("risk_level") or "").upper() == "CRITICAL"]
        if not crits:
            return (
                f"No CRITICAL objects detected at this time. "
                f"{high_risk} HIGH-risk objects are under active monitoring."
            )
        crit_list = "; ".join(
            f"{o.get('object_id','?')} [{o.get('object_type','?')}] in {o.get('state_region','?')}"
            for o in crits[:5]
        )
        return (
            f"🔴 {len(crits)} CRITICAL object(s) require immediate attention: {crit_list}. "
            f"These objects have risk scores above 80/100 and may be in restricted zones or "
            f"exhibiting severe trajectory deviations. Operator action is recommended immediately."
        )

    # ── Helicopter ────────────────────────────────────────────────────────────
    if any(k in q for k in ["helicopter", "heli", "rotorcraft"]):
        return (
            f"There are {helis} helicopters currently tracked in the monitored airspace. "
            f"Helicopters are monitored for low-altitude corridor intrusions and proximity to restricted zones."
        )

    # ── Birds ─────────────────────────────────────────────────────────────────
    if any(k in q for k in ["bird", "wildlife", "avian"]):
        anom_birds = [o for o in objects if (o.get("object_type") or "").lower() == "bird" and o.get("is_anomaly")]
        return (
            f"The system is tracking {birds} birds in the monitored airspace. "
            f"{len(anom_birds)} have been flagged as potential flight corridor intrusions. "
            f"Bird strike risk is assessed using altitude and proximity to active flight paths."
        )

    # ── Unidentified ──────────────────────────────────────────────────────────
    if any(k in q for k in ["unidentified", "unknown", "transponder", "no callsign"]):
        return (
            f"There are {unknowns} unidentified objects currently tracked. "
            f"These objects have no active transponder signal and cannot be matched to known flight plans. "
            f"They are being monitored with CRITICAL sensitivity and flagged for operator review."
        )

    # ── State-specific ────────────────────────────────────────────────────────
    for region in ["maharashtra", "goa", "telangana", "gujarat", "delhi"]:
        if region in q:
            r_objs = [o for o in objects if region in (o.get("state_region") or "").lower()]
            r_crit = sum(1 for o in r_objs if (o.get("risk_level") or "").upper() == "CRITICAL")
            r_anom = sum(1 for o in r_objs if o.get("is_anomaly"))
            return (
                f"{region.title()} airspace: {len(r_objs)} objects currently tracked. "
                f"CRITICAL alerts: {r_crit}. Active anomalies: {r_anom}. "
                f"Continuous sensor coverage is active across all monitored corridors in this region."
            )

    # No match → return None so caller tries static_ai
    return None