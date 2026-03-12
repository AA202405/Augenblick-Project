"""
memory.py
Manages multi-turn conversation memory for operator Q&A.
Keeps last N turns in memory for context.
"""

from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from collections import deque


class ConversationMemory:
    """
    Simple sliding window conversation memory.
    Stores last max_turns message pairs.
    """

    def __init__(self, max_turns: int = 10):
        self.max_turns = max_turns
        self._messages: deque[BaseMessage] = deque(maxlen=max_turns * 2)

    def add_user_message(self, content: str):
        self._messages.append(HumanMessage(content=content))

    def add_ai_message(self, content: str):
        self._messages.append(AIMessage(content=content))

    def get_messages(self) -> list[BaseMessage]:
        return list(self._messages)

    def get_history_text(self) -> str:
        """Human-readable history for logging."""
        lines = []
        for msg in self._messages:
            role = "Operator" if isinstance(msg, HumanMessage) else "Agent"
            lines.append(f"{role}: {msg.content}")
        return "\n".join(lines)

    def clear(self):
        self._messages.clear()

    @property
    def turn_count(self) -> int:
        return len(self._messages) // 2
