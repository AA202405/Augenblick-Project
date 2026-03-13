"""
chains.py
LangChain agent setup:
  - Primary LLM:  Groq key 1  (GROQ_API_KEY)
  - Fallback LLM: Groq key 2  (GROQ_API_KEY_2)
  - Final fallback: Rule-based (system NEVER goes silent — always returns an answer)

Terminal prints full tracebacks on every failure.
Dashboard never sees error text.
"""

import os
import traceback
from datetime import datetime
from dotenv import load_dotenv

from langchain_core.messages import HumanMessage, SystemMessage
from langchain.agents        import AgentExecutor, create_react_agent
from langchain.prompts       import PromptTemplate

from agent.tools     import ALL_TOOLS
from agent.memory    import ConversationMemory
from agent.demo_ai   import generate_demo_ai_response
from agent.static_ai import get_static_response

load_dotenv()

# ── Demo Mode ─────────────────────────────────────────────────────────────────
# Set DEMO_MODE=true in .env to skip all LLM calls and use local fallbacks only.
DEMO_MODE = os.getenv("DEMO_MODE", "false").lower() == "true"
if DEMO_MODE:
    print("[chains] ⚡ DEMO_MODE enabled — LLM calls bypassed, using demo_ai + static_ai")

SYSTEM_PROMPT = """You are an expert Airspace Monitoring AI Agent for Indian airspace.
You monitor 5 states: Maharashtra, Goa, Telangana, Gujarat, and Delhi/NCR.

Your capabilities:
- Classify aerial objects (commercial aircraft, drone, bird, military, helicopter, unidentified)
- Detect and explain anomalies in flight patterns
- Assess risk levels (LOW / MEDIUM / HIGH / CRITICAL)
- Predict object trajectories
- Recommend operator actions

When analyzing airspace:
1. Always check CRITICAL and HIGH risk objects first
2. Explain anomalies in plain operational English
3. Give specific, actionable recommendations
4. Reference the state/region the object is in

Risk levels:
- CRITICAL (81-100): Immediate action required
- HIGH (61-80): Alert operator, monitor closely
- MEDIUM (31-60): Watch and log
- LOW (0-30): Normal operations

Anomaly types to watch:
- Restricted_Zone_Entry: Object in protected airspace
- Abrupt_Altitude_Change: Sudden climb/descent
- Irregular_Route: Off filed flight path
- Erratic_Movement: Unpredictable drone behaviour
- Unidentified_High_Speed: Fast object with no transponder
- Low_Altitude_TCA_Intrusion: Low-flying object in controlled zone
- Flight_Corridor_Intrusion: Wildlife in flight path
- Sudden_Altitude_Drop: Emergency descent
"""

# ── LLM setup ─────────────────────────────────────────────────────────────────
_llm_primary  = None
_llm_fallback = None
_llm_status   = {"primary": "unchecked", "fallback": "unchecked"}


def _init_llms():
    global _llm_primary, _llm_fallback

    try:
        from langchain_groq import ChatGroq
        key1 = os.getenv("GROQ_API_KEY", "")
        if key1:
            _llm_primary = ChatGroq(
                api_key=key1,
                model=os.getenv("GROQ_MODEL", "llama3-70b-8192"),
                temperature=0.1,
                max_tokens=1024,
            )
            _llm_status["primary"] = "ok"
            print("[chains] Groq primary (key1): ready")
        else:
            _llm_status["primary"] = "no key"
            print("[chains] Groq primary: no GROQ_API_KEY set")
    except Exception:
        _llm_status["primary"] = "init error"
        print("[chains] Groq primary INIT ERROR:")
        traceback.print_exc()

    try:
        from langchain_groq import ChatGroq
        key2 = os.getenv("GROQ_API_KEY_2", "")
        if key2:
            _llm_fallback = ChatGroq(
                api_key=key2,
                model=os.getenv("GROQ_MODEL", "llama3-70b-8192"),
                temperature=0.1,
                max_tokens=1024,
            )
            _llm_status["fallback"] = "ok"
            print("[chains] Groq fallback (key2): ready")
        else:
            _llm_status["fallback"] = "no key"
            print("[chains] Groq fallback: no GROQ_API_KEY_2 set")
    except Exception:
        _llm_status["fallback"] = "init error"
        print("[chains] Groq fallback INIT ERROR:")
        traceback.print_exc()


def _get_llm():
    if _llm_primary:
        return _llm_primary, "groq_key1"
    if _llm_fallback:
        return _llm_fallback, "groq_key2"
    return None, "none"


async def _invoke_with_fallback(messages):
    """
    key1 → key2 → None.
    Every failure prints full traceback to terminal.
    Returns (content_or_None, source_label).
    """
    if _llm_primary:
        try:
            resp = await _llm_primary.ainvoke(messages)
            return resp.content, "groq_key1"
        except Exception:
            print("[chains] !! Groq key1 FAILED — full traceback:")
            traceback.print_exc()
            print("[chains] Trying key2...")

    if _llm_fallback:
        try:
            resp = await _llm_fallback.ainvoke(messages)
            return resp.content, "groq_key2"
        except Exception:
            print("[chains] !! Groq key2 FAILED — full traceback:")
            traceback.print_exc()
            print("[chains] Falling back to rule-based engine")

    return None, "none"


# ── Rule-based answer engine ───────────────────────────────────────────────────
def _rule_based_answer(query: str, objects: list, anomalies: list, risk_scores: list) -> str:
    """
    Generates a query-aware rule-based answer.
    Parses the query to answer what was actually asked.
    Always returns a meaningful response — never empty.
    """
    q = query.lower()
    total    = len(objects)
    critical = [o for o in risk_scores if o["risk_level"] == "CRITICAL"]
    high_obj = [o for o in risk_scores if o["risk_level"] == "HIGH"]
    medium   = [o for o in risk_scores if o["risk_level"] == "MEDIUM"]

    def fmt(o):
        return f"{o.get('callsign') or o.get('object_id','?')} ({o.get('object_type','?')}) in {o.get('state_region','?')} — score {o.get('risk_score',0)}/100"

    # ── Zone breach queries ────────────────────────────────────────────────────
    if any(k in q for k in ["zone", "breach", "restricted"]):
        breaches = [o for o in objects if o.get("in_restricted_zone")]
        if not breaches:
            return f"No restricted zone breaches detected across all {total} tracked objects."
        lines = [f"⚠ {len(breaches)} RESTRICTED ZONE BREACH(ES) DETECTED:"]
        for o in breaches[:5]:
            lines.append(
                f"  • {o.get('object_id','?')} [{o.get('object_type','?')}] "
                f"in {o.get('restricted_zone_name') or 'restricted zone'}, "
                f"{o.get('state_region','?')} — risk {o.get('risk_level','?')} ({o.get('risk_score',0)}/100). "
                f"Immediate ATC notification required."
            )
        return "\n".join(lines)

    # ── Critical queries ───────────────────────────────────────────────────────
    if any(k in q for k in ["critical", "immediate", "urgent"]):
        if not critical:
            return f"No CRITICAL objects currently. {len(high_obj)} HIGH risk objects are being monitored."
        lines = [f"🔴 {len(critical)} CRITICAL object(s):"]
        for o in critical[:5]:
            lines.append(f"  • {fmt(o)}. Triggered: {o.get('triggered_rule','risk threshold exceeded')}. Immediate action required.")
        return "\n".join(lines)

    # ── Drone queries ──────────────────────────────────────────────────────────
    if any(k in q for k in ["drone", "uav", "uas"]):
        drones = [o for o in objects if o.get("object_type","").lower() == "drone"]
        anom_drones = [o for o in drones if o.get("is_anomaly")]
        if not drones:
            return "No drones currently tracked in the monitored airspace."
        lines = [f"🛸 {len(drones)} drone(s) tracked, {len(anom_drones)} anomalous:"]
        for o in anom_drones[:5]:
            lines.append(
                f"  • {o.get('object_id','?')} in {o.get('state_region','?')} — "
                f"{o.get('anomaly_type','anomaly')}, risk {o.get('risk_level','?')} ({o.get('risk_score',0)}/100)"
            )
        if not anom_drones:
            lines.append("  All drones operating within normal parameters.")
        return "\n".join(lines)

    # ── Anomaly queries ────────────────────────────────────────────────────────
    if any(k in q for k in ["anomal", "unusual", "irregular", "suspicious"]):
        if not anomalies:
            return f"No active anomalies. All {total} objects operating normally."
        lines = [f"⚡ {len(anomalies)} active anomaly/anomalies:"]
        for a in anomalies[:6]:
            lines.append(
                f"  • {a.get('object_id','?')} [{a.get('object_type','?')}] "
                f"— {a.get('anomaly_type','?')} in {a.get('state_region','?')} "
                f"(risk {a.get('risk_level','?')}, score {a.get('risk_score',0)}/100)"
            )
        return "\n".join(lines)

    # ── Highest risk / worst object ────────────────────────────────────────────
    if any(k in q for k in ["highest", "worst", "most dangerous", "top risk"]):
        if not risk_scores:
            return "No risk data available."
        top = risk_scores[0]
        return (
            f"Highest risk object: {top.get('callsign') or top.get('object_id','?')} "
            f"[{top.get('object_type','?')}] in {top.get('state_region','?')}. "
            f"Risk: {top.get('risk_level','?')} ({top.get('risk_score',0)}/100). "
            f"Anomaly: {top.get('anomaly_type') or 'none'}. "
            f"{'In restricted zone — ATC action required.' if top.get('in_restricted_zone') else 'Monitor and verify identity.'}"
        )

    # ── Region-specific queries ────────────────────────────────────────────────
    for region in ["maharashtra", "goa", "telangana", "gujarat", "delhi"]:
        if region in q:
            region_objs = [o for o in objects if region in o.get("state_region","").lower()]
            r_crit = [o for o in region_objs if o.get("risk_level") == "CRITICAL"]
            r_anom = [o for o in region_objs if o.get("is_anomaly")]
            return (
                f"{region.title()}: {len(region_objs)} objects tracked. "
                f"CRITICAL: {len(r_crit)}, Anomalies: {len(r_anom)}. "
                + (f"Critical: {', '.join(o.get('object_id','?') for o in r_crit[:3])}." if r_crit else "No critical objects.")
            )

    # ── Unidentified / no transponder ─────────────────────────────────────────
    if any(k in q for k in ["unidentified", "transponder", "unknown"]):
        unid = [o for o in objects if not o.get("has_callsign") or o.get("object_type","").lower() == "unknown"]
        if not unid:
            return "No unidentified objects detected. All tracked objects have active transponders."
        lines = [f"❓ {len(unid)} unidentified/no-transponder object(s):"]
        for o in unid[:5]:
            lines.append(
                f"  • {o.get('object_id','?')} in {o.get('state_region','?')} "
                f"— risk {o.get('risk_level','?')} ({o.get('risk_score',0)}/100)"
            )
        return "\n".join(lines)

    # ── Anomaly analysis (from Charts explain button) ──────────────────────────
    if "anomaly analysis" in q or "telemetry" in q or "predicted trajectory" in q:
        # Extract object ID from the structured prompt
        obj_id = None
        for line in query.split('\n'):
            if line.strip().startswith("Object ID:"):
                obj_id = line.split(":", 1)[-1].strip()
                break
        obj = next((o for o in objects if o.get("object_id") == obj_id), None)
        if obj:
            alt_ft   = round((obj.get("altitude", 0)) * 3.281)
            spd_kph  = round((obj.get("velocity", 0)) * 3.6)
            in_zone  = obj.get("in_restricted_zone", False)
            return (
                f"Object {obj_id} [{obj.get('object_type','?')}] in {obj.get('state_region','?')}. "
                f"Current: {alt_ft}ft altitude, {spd_kph}km/h, heading {round(obj.get('heading',0))}°. "
                f"Risk: {obj.get('risk_level','?')} ({obj.get('risk_score',0)}/100). "
                f"Anomaly: {obj.get('anomaly_type') or 'None'}. "
                f"{'RESTRICTED ZONE BREACH — immediate ATC notification required.' if in_zone else 'Not in restricted zone.'} "
                f"{'Transponder active.' if obj.get('has_callsign') else 'No transponder detected — identity unverified.'} "
                f"Recommend: {'Immediate intercept or ATC contact.' if obj.get('risk_level') == 'CRITICAL' else 'Continue monitoring and log incident.'}"
            )

    # ── Default: full status overview ─────────────────────────────────────────
    state_counts: dict = {}
    for o in objects:
        sr = o.get("state_region", "Unknown")
        state_counts[sr] = state_counts.get(sr, 0) + 1
    state_str = ", ".join(f"{v} in {k}" for k, v in state_counts.items())

    lines = [f"{total} objects active ({state_str})."]
    if critical:
        lines.append(f"CRITICAL ({len(critical)}): {', '.join(fmt(o) for o in critical[:3])}.")
    if high_obj:
        lines.append(f"HIGH ({len(high_obj)}): {', '.join(fmt(o) for o in high_obj[:3])}.")
    if anomalies:
        lines.append(f"Active anomalies: {len(anomalies)}.")
    if not critical and not high_obj and not anomalies:
        lines.append("All objects within normal parameters.")
    return " ".join(lines)


# ── Smart fallback chain ──────────────────────────────────────────────────────
def _smart_fallback(query: str, objects: list, anomalies: list, risk_scores: list) -> str:
    """
    3-tier fallback:
      1. generate_demo_ai_response() — data-aware, uses live objects
      2. get_static_response()       — static knowledge base
      3. _rule_based_answer()        — existing keyword engine
      4. Hard-coded safe response    — system NEVER goes silent
    """
    # Tier 1 — data-aware demo AI
    try:
        demo = generate_demo_ai_response(query, objects)
        if demo:
            return demo
    except Exception:
        traceback.print_exc()

    # Tier 2 — static knowledge base
    try:
        static = get_static_response(query)
        if static:
            return static
    except Exception:
        traceback.print_exc()

    # Tier 3 — existing rule-based engine
    try:
        rule = _rule_based_answer(query, objects, anomalies, risk_scores)
        if rule:
            return rule
    except Exception:
        traceback.print_exc()

    # Tier 4 — absolute safe fallback
    return "The AI monitoring engine is currently analyzing airspace patterns and generating insights."


# ── ReAct Agent ───────────────────────────────────────────────────────────────
def _build_react_agent():
    llm, source = _get_llm()
    if llm is None:
        print("[chains] No LLM available — skipping ReAct agent build")
        return None, "none"

    react_prompt = PromptTemplate.from_template(
        SYSTEM_PROMPT + """

You have access to the following tools:
{tools}

Use the following format:
Question: the input question you must answer
Thought: you should always think about what to do
Action: the action to take, should be one of [{tool_names}]
Action Input: the input to the action
Observation: the result of the action
... (this Thought/Action/Action Input/Observation can repeat N times)
Thought: I now know the final answer
Final Answer: the final answer to the original input question

Question: {input}
Thought: {agent_scratchpad}"""
    )

    try:
        agent = create_react_agent(llm, ALL_TOOLS, react_prompt)
        executor = AgentExecutor(
            agent=agent,
            tools=ALL_TOOLS,
            verbose=False,
            max_iterations=6,
            handle_parsing_errors=True,
            return_intermediate_steps=False,
        )
        return executor, source
    except Exception:
        print("[chains] !! ReAct agent build FAILED:")
        traceback.print_exc()
        return None, "none"


_memory = ConversationMemory(max_turns=10)


# ── Operator query ─────────────────────────────────────────────────────────────
async def handle_operator_query(query: str) -> dict:
    import core.state_manager as sm

    _memory.add_user_message(query)

    # Always pre-fetch live state so rule-based can use it
    try:
        objects     = list(sm.get_active_objects().values())
        anomalies   = sm.get_anomalies()
        risk_scores = sm.get_risk_scores()
    except Exception:
        print("[chains] !! state_manager fetch FAILED:")
        traceback.print_exc()
        objects, anomalies, risk_scores = [], [], []

    llm, llm_source = _get_llm()

    # ── DEMO MODE: skip all LLM calls, go straight to local fallbacks ─────────
    if DEMO_MODE:
        print("[chains] DEMO_MODE — skipping LLM, using demo_ai / static_ai")
        answer = _smart_fallback(query, objects, anomalies, risk_scores)
        _memory.add_ai_message(answer)
        return {
            "query": query, "answer": answer,
            "llm_source": "demo_mode",
            "timestamp": datetime.utcnow().isoformat(),
        }

    # ── No LLM at all → smart fallback chain ──────────────────────────────────
    if llm is None:
        print("[chains] No LLM configured — using smart fallback chain")
        answer = _smart_fallback(query, objects, anomalies, risk_scores)
        _memory.add_ai_message(answer)
        return {
            "query": query, "answer": answer,
            "llm_source": "rule_based_fallback",
            "timestamp": datetime.utcnow().isoformat(),
        }

    # ── Try ReAct agent first ─────────────────────────────────────────────────
    agent_executor, _ = _build_react_agent()

    try:
        if agent_executor:
            result = await agent_executor.ainvoke({"input": query})
            answer = result.get("output", "")
            if not answer:
                raise ValueError("Agent returned empty output")
        else:
            # Agent build failed — try plain LLM call
            print("[chains] Agent executor unavailable, trying plain LLM call")
            history = _memory.get_messages()
            content, llm_source = await _invoke_with_fallback([
                SystemMessage(content=SYSTEM_PROMPT), *history,
            ])
            if content is None:
                raise ValueError("Plain LLM call returned None")
            answer = content

        _memory.add_ai_message(answer)
        return {
            "query": query, "answer": answer,
            "llm_source": llm_source,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception:
        print("[chains] !! handle_operator_query FAILED — falling back to smart fallback chain. Full traceback:")
        traceback.print_exc()
        answer = _smart_fallback(query, objects, anomalies, risk_scores)
        _memory.add_ai_message(answer)
        return {
            "query": query, "answer": answer,
            "llm_source": "rule_based_fallback",
            "timestamp": datetime.utcnow().isoformat(),
        }


# ── Anomaly explainer ──────────────────────────────────────────────────────────
async def explain_anomaly(object_id: str) -> dict:
    import core.state_manager as sm

    try:
        obj = sm.get_object_by_id(object_id)
    except Exception:
        print(f"[chains] !! get_object_by_id({object_id}) FAILED:")
        traceback.print_exc()
        obj = None

    if obj is None:
        return {
            "object_id": object_id,
            "explanation": f"Object {object_id} not found in active state.",
            "llm_source": "rule_based_fallback",
        }

    prompt = (
        f"Explain why this aerial object was flagged as anomalous.\n\n"
        f"Object:\n"
        f"- ID: {obj['object_id']}, Callsign: {obj['callsign'] or 'None'}\n"
        f"- Type: {obj.get('object_type','unknown')} / ML class: {obj['object_class']}\n"
        f"- Region: {obj.get('state_region','unknown')}\n"
        f"- Position: lat={obj['lat']}, lon={obj['lon']}, altitude={round(obj['altitude']*3.281)}ft\n"
        f"- Speed: {round(obj['velocity']*3.6)}km/h, Heading: {obj['heading']}°\n"
        f"- Vertical rate: {obj['vertical_rate']}m/s\n"
        f"- Anomaly type: {obj['anomaly_type']}\n"
        f"- Risk level: {obj['risk_level']} (score: {obj['risk_score']}/100)\n"
        f"- In restricted zone: {obj['in_restricted_zone']}\n"
        f"  Zone: {obj.get('restricted_zone_name','N/A')}\n"
        f"- Transponder: {obj['has_callsign']}\n\n"
        f"Give a 2-3 sentence operational explanation: what is suspicious, "
        f"what risk it poses, what the operator should do."
    )

    try:
        content, llm_source = await _invoke_with_fallback([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ])
    except Exception:
        print(f"[chains] !! explain_anomaly LLM call FAILED for {object_id}:")
        traceback.print_exc()
        content, llm_source = None, "none"

    if content is None:
        print(f"[chains] LLM returned None for {object_id} — using rule-based explanation")
        content = (
            f"Object {object_id} ({obj.get('object_type','?')}) flagged: {obj['anomaly_type']}. "
            f"Risk: {obj['risk_level']} ({obj['risk_score']}/100) in {obj.get('state_region','')}. "
            f"{'Restricted zone — contact ATC immediately.' if obj['in_restricted_zone'] else 'Monitor and verify identity.'}"
        )
        llm_source = "rule_based_fallback"

    return {"object_id": object_id, "explanation": content, "llm_source": llm_source}


# ── Init on import ─────────────────────────────────────────────────────────────
_init_llms()


def get_llm_status() -> dict:
    return {
        "primary":  _llm_status.get("primary",  "unchecked"),
        "fallback": _llm_status.get("fallback", "unchecked"),
        "active":   "groq_key1" if _llm_primary else ("groq_key2" if _llm_fallback else "rule_based"),
    }