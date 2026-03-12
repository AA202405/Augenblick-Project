"""
chains.py
LangChain agent setup:
  - Primary LLM: Groq (llama3-70b)
  - Fallback LLM: Gemini (gemini-1.5-flash)
  - Rule-based fallback if both APIs are down
  - ReAct Agent for tool-calling loop
  - ConversationChain for operator Q&A
  - Auto-summary pipeline (every 30s)
"""

import os
import json
import re
from datetime import datetime
from dotenv import load_dotenv

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts  import ChatPromptTemplate, MessagesPlaceholder
from langchain.agents        import AgentExecutor, create_react_agent
from langchain.prompts       import PromptTemplate

from agent.tools   import ALL_TOOLS
from agent.memory  import ConversationMemory

load_dotenv()

# ── System prompt ─────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are an expert Airspace Monitoring AI Agent.
Your role is to autonomously analyze aerial surveillance data and assist operators.

Your capabilities:
- Classify aerial objects (aircraft, drone, bird, unknown)
- Detect and explain anomalies in flight patterns
- Assess risk levels (LOW / MEDIUM / HIGH / CRITICAL)
- Predict object trajectories
- Recommend operator actions

When analyzing airspace:
1. Always check for CRITICAL and HIGH risk objects first
2. Explain anomalies in plain English — what it means operationally
3. Give specific, actionable recommendations
4. Be concise but thorough — operators are busy

Risk levels:
- CRITICAL (81-100): Immediate action required
- HIGH (61-80): Alert operator, monitor closely
- MEDIUM (31-60): Watch and log
- LOW (0-30): Normal operations

Output format for auto-summaries:
"N objects active. [Critical/High objects described]. [Anomalies explained]. [Recommendations]."

Always use the available tools to get current data before answering operator queries.
"""

# ── LLM Setup with fallback ───────────────────────────────────────────────────
_llm_primary  = None
_llm_fallback = None
_llm_status   = {"primary": "unchecked", "fallback": "unchecked"}


def _init_llms():
    global _llm_primary, _llm_fallback

    # Primary: Groq
    try:
        from langchain_groq import ChatGroq
        _llm_primary = ChatGroq(
            api_key   = os.getenv("GROQ_API_KEY", ""),
            model     = os.getenv("GROQ_MODEL", "llama3-70b-8192"),
            temperature= 0.1,
            max_tokens = 1024,
        )
        _llm_status["primary"] = "ok"
    except Exception as e:
        _llm_status["primary"] = f"error: {e}"

    # Fallback: Gemini
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        _llm_fallback = ChatGoogleGenerativeAI(
            google_api_key = os.getenv("GEMINI_API_KEY", ""),
            model          = os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
            temperature    = 0.1,
            max_output_tokens = 1024,
        )
        _llm_status["fallback"] = "ok"
    except Exception as e:
        _llm_status["fallback"] = f"error: {e}"


def _get_llm():
    """Returns active LLM: primary → fallback → None."""
    if _llm_primary is not None:
        return _llm_primary, "groq"
    if _llm_fallback is not None:
        return _llm_fallback, "gemini"
    return None, "none"


# ── Rule-based fallback response ──────────────────────────────────────────────
def _rule_based_summary(objects: list, anomalies: list, risk_scores: list) -> str:
    """
    Fallback when LLM is unavailable.
    Generates a templated summary from state data.
    """
    total    = len(objects)
    critical = [o for o in risk_scores if o["risk_level"] == "CRITICAL"]
    high_obj = [o for o in risk_scores if o["risk_level"] == "HIGH"]

    lines = [f"{total} objects active in monitored airspace."]

    if critical:
        for obj in critical:
            rule = obj.get("triggered_rule", "risk threshold exceeded")
            lines.append(
                f"CRITICAL: Object {obj['callsign'] or obj['object_id']} "
                f"({obj['object_class']}) — {rule}. "
                f"Risk score: {obj['risk_score']}/100. Immediate action required."
            )

    if high_obj:
        for obj in high_obj[:3]:
            lines.append(
                f"HIGH: Object {obj['callsign'] or obj['object_id']} "
                f"({obj['object_class']}) — Risk score: {obj['risk_score']}/100. "
                f"Recommend close monitoring."
            )

    if anomalies:
        for anom in anomalies[:2]:
            lines.append(
                f"Anomaly detected: {anom['anomaly_type']} on "
                f"{anom['callsign'] or anom['object_id']} "
                f"at altitude {round(anom.get('altitude', 0) * 3.281, 0)}ft."
            )

    if not critical and not high_obj and not anomalies:
        lines.append("All objects within normal parameters. No immediate threats detected.")

    lines.append(f"[Rule-based fallback — LLM unavailable] Last updated: {datetime.utcnow().strftime('%H:%M:%S')} UTC")
    return " ".join(lines)


# ── ReAct Agent ───────────────────────────────────────────────────────────────
def _build_react_agent():
    llm, source = _get_llm()
    if llm is None:
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
            agent      = agent,
            tools      = ALL_TOOLS,
            verbose    = False,
            max_iterations = 6,
            handle_parsing_errors = True,
            return_intermediate_steps = False,
        )
        return executor, source
    except Exception as e:
        return None, f"error: {e}"


# ── Conversation Memory ───────────────────────────────────────────────────────
_memory = ConversationMemory(max_turns=10)


# ── Auto-summary pipeline ─────────────────────────────────────────────────────
async def generate_auto_summary() -> dict:
    """
    Auto-trigger every 30s:
    Reads airspace snapshot → generates plain-language summary.
    """
    import core.state_manager as sm

    objects     = list(sm.get_active_objects().values())
    anomalies   = sm.get_anomalies()
    risk_scores = sm.get_risk_scores()

    llm, llm_source = _get_llm()

    if llm is None:
        summary_text = _rule_based_summary(objects, anomalies, risk_scores)
        return {
            "summary":    summary_text,
            "llm_source": "rule_based_fallback",
            "timestamp":  datetime.utcnow().isoformat(),
            "stats": {
                "total":    len(objects),
                "critical": len([o for o in risk_scores if o["risk_level"] == "CRITICAL"]),
                "high":     len([o for o in risk_scores if o["risk_level"] == "HIGH"]),
                "anomalies":len(anomalies),
            }
        }

    # Build prompt with snapshot data
    snapshot = {
        "total_objects": len(objects),
        "risk_breakdown": {
            "CRITICAL": len([o for o in risk_scores if o["risk_level"] == "CRITICAL"]),
            "HIGH":     len([o for o in risk_scores if o["risk_level"] == "HIGH"]),
            "MEDIUM":   len([o for o in risk_scores if o["risk_level"] == "MEDIUM"]),
            "LOW":      len([o for o in risk_scores if o["risk_level"] == "LOW"]),
        },
        "anomalies": [
            {
                "id":    a["object_id"],
                "class": a["object_class"],
                "type":  a["anomaly_type"],
                "level": a["risk_level"],
                "score": a["risk_score"],
                "rule":  a.get("triggered_rule"),
            }
            for a in anomalies[:5]
        ],
        "top_risks": risk_scores[:5],
    }

    prompt = (
        f"Generate a concise airspace status summary for operators.\n"
        f"Current snapshot:\n{json.dumps(snapshot, indent=2)}\n\n"
        f"Include: total objects, critical/high threats with IDs and reasons, "
        f"anomaly explanations, and recommended operator actions. "
        f"Be direct and operational. Max 150 words."
    )

    try:
        response = await llm.ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt)
        ])
        summary_text = response.content
    except Exception as e:
        summary_text = _rule_based_summary(objects, anomalies, risk_scores)
        llm_source   = f"rule_based_fallback (llm error: {e})"

    return {
        "summary":    summary_text,
        "llm_source": llm_source,
        "timestamp":  datetime.utcnow().isoformat(),
        "stats": {
            "total":    len(objects),
            "critical": snapshot["risk_breakdown"]["CRITICAL"],
            "high":     snapshot["risk_breakdown"]["HIGH"],
            "anomalies":len(anomalies),
        }
    }


# ── Operator query handler ────────────────────────────────────────────────────
async def handle_operator_query(query: str) -> dict:
    """
    Handle a natural language query from an operator.
    Uses ReAct agent with tool-calling + conversation memory.
    """
    llm, llm_source = _get_llm()

    # Add to memory
    _memory.add_user_message(query)

    if llm is None:
        # Rule-based fallback
        import core.state_manager as sm
        objects     = list(sm.get_active_objects().values())
        anomalies   = sm.get_anomalies()
        risk_scores = sm.get_risk_scores()
        answer = _rule_based_summary(objects, anomalies, risk_scores)
        _memory.add_ai_message(answer)
        return {
            "query":      query,
            "answer":     answer,
            "llm_source": "rule_based_fallback",
            "timestamp":  datetime.utcnow().isoformat(),
        }

    # Try ReAct agent first (for tool-calling queries)
    agent_executor, agent_source = _build_react_agent()

    try:
        if agent_executor:
            result = await agent_executor.ainvoke({"input": query})
            answer = result.get("output", "")
        else:
            # Direct LLM with memory context
            history = _memory.get_messages()
            response = await llm.ainvoke([
                SystemMessage(content=SYSTEM_PROMPT),
                *history,
            ])
            answer = response.content

        _memory.add_ai_message(answer)
        return {
            "query":      query,
            "answer":     answer,
            "llm_source": llm_source,
            "timestamp":  datetime.utcnow().isoformat(),
        }

    except Exception as e:
        # Final fallback
        import core.state_manager as sm
        answer = _rule_based_summary(
            list(sm.get_active_objects().values()),
            sm.get_anomalies(),
            sm.get_risk_scores()
        )
        _memory.add_ai_message(answer)
        return {
            "query":      query,
            "answer":     answer,
            "llm_source": f"rule_based_fallback (error: {e})",
            "timestamp":  datetime.utcnow().isoformat(),
        }


# ── Anomaly explainer (LLMChain pattern) ─────────────────────────────────────
async def explain_anomaly(object_id: str) -> dict:
    """
    Explain why a specific object was flagged — plain language for operators.
    """
    import core.state_manager as sm
    obj = sm.get_object_by_id(object_id)

    if obj is None:
        return {"object_id": object_id, "explanation": "Object not found in active state."}

    llm, llm_source = _get_llm()

    prompt = (
        f"Explain in plain English why this aerial object was flagged as anomalous.\n\n"
        f"Object details:\n"
        f"- ID: {obj['object_id']}, Callsign: {obj['callsign'] or 'None'}\n"
        f"- Type: {obj['object_class']} (confidence: {obj['class_confidence']*100:.0f}%)\n"
        f"- Position: lat={obj['lat']}, lon={obj['lon']}, altitude={round(obj['altitude']*3.281)}ft\n"
        f"- Speed: {round(obj['velocity']*3.6)}km/h, Heading: {obj['heading']}°\n"
        f"- Vertical rate: {obj['vertical_rate']}m/s\n"
        f"- Anomaly type: {obj['anomaly_type']}\n"
        f"- Risk level: {obj['risk_level']} (score: {obj['risk_score']}/100)\n"
        f"- In restricted zone: {obj['in_restricted_zone']}\n"
        f"- Triggered rule: {obj.get('triggered_rule', 'None')}\n"
        f"- Has transponder: {obj['has_callsign']}\n\n"
        f"Give a 2-3 sentence explanation of what is suspicious, "
        f"what risk it poses, and what the operator should do next."
    )

    if llm is None:
        explanation = (
            f"Object {object_id} ({obj['object_class']}) flagged for: {obj['anomaly_type']}. "
            f"Risk level: {obj['risk_level']} (score: {obj['risk_score']}/100). "
            f"{'Restricted zone entry detected — contact ATC immediately.' if obj['in_restricted_zone'] else 'Monitor closely and verify identity.'}"
        )
        return {"object_id": object_id, "explanation": explanation, "llm_source": "rule_based_fallback"}

    try:
        response = await llm.ainvoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt)
        ])
        return {
            "object_id":   object_id,
            "explanation": response.content,
            "llm_source":  llm_source,
        }
    except Exception as e:
        return {
            "object_id":   object_id,
            "explanation": f"Explanation unavailable (LLM error: {e})",
            "llm_source":  "error",
        }


# ── Initialise on import ──────────────────────────────────────────────────────
_init_llms()


def get_llm_status() -> dict:
    return {
        "primary":  _llm_status.get("primary",  "unchecked"),
        "fallback": _llm_status.get("fallback", "unchecked"),
        "active":   "groq" if _llm_primary else ("gemini" if _llm_fallback else "rule_based"),
    }
