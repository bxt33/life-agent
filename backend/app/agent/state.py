"""访谈业务状态：阶段状态机 + 状态栏。

状态栏由代码维护和渲染（不是让 LLM 从长历史里现数），每轮以 user 角色消息
追加到轨迹末尾，<agent_status> 标签包裹。阶段推进条件由代码判定，防止模型
"过早宣布完成"。读数必须配操作策略——光给数字模型不会用。
"""

import json
from dataclasses import asdict, dataclass, field

MAX_TURNS = 40

STAGES = ["warmup", "explore", "deepen", "emotion", "wrapup", "done"]

# 每阶段的操作策略：与状态栏读数成对出现
STAGE_STRATEGY = {
    "warmup": "破冰阶段。让对方放松，从最近的、轻的事情聊起，不谈'讲故事'这件事本身。",
    "explore": "找线索阶段。留意对方话里有情绪重量的片段（人、事件、反复提起的东西），"
    "用轻的问题试探哪条线索对方愿意展开。",
    "deepen": "深挖阶段。围绕 current_lead 追细节，一轮只用一招（追原话/追具象/追第一反应）。"
    "detail_hits 三类各命中至少 1 次前不要换线索；对方明显不愿说则换线索。",
    "emotion": "情绪落点阶段。从'发生了什么'转向'这件事对你意味着什么'，依然用小问题。",
    "wrapup": "收尾阶段。把你听到的故事完整复述一遍（时间线+关键细节+情绪），"
    "问对方'我讲得对吗，有没有讲错或漏掉的'。得到确认后告诉对方可以生成故事稿了。",
    "done": "访谈已结束。感谢对方，告知可以点击生成故事稿。",
}


@dataclass
class InterviewState:
    stage: str = "warmup"
    turns: int = 0  # 用户发言轮次
    stage_turns: int = 0  # 当前阶段内的用户轮次
    leads: list[str] = field(default_factory=list)
    current_lead: str = ""
    detail_hits: dict = field(default_factory=lambda: {"原话": 0, "具象": 0, "第一反应": 0})
    emotion_signals: list[str] = field(default_factory=list)
    safety_flag: bool = False

    @classmethod
    def loads(cls, raw: str) -> "InterviewState":
        try:
            data = json.loads(raw or "{}")
        except json.JSONDecodeError:
            data = {}
        state = cls()
        for key, value in data.items():
            if hasattr(state, key):
                setattr(state, key, value)
        return state

    def dumps(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    # -- 状态更新 ---------------------------------------------------------

    def on_user_message(self, extraction: dict) -> None:
        """吸收单条用户消息的抽取结果（LLM 逐条抽取、代码汇总）。"""
        self.turns += 1
        self.stage_turns += 1
        for lead in extraction.get("leads", []):
            if lead and lead not in self.leads:
                self.leads.append(lead)
        if not self.current_lead and self.leads:
            self.current_lead = self.leads[0]
        for kind in extraction.get("detail_hits", []):
            if kind in self.detail_hits:
                self.detail_hits[kind] += 1
        for signal in extraction.get("emotion_signals", []):
            if signal and signal not in self.emotion_signals:
                self.emotion_signals.append(signal)
        self._advance()

    def _advance(self) -> None:
        """阶段推进——代码规则判定，不依赖 LLM 自我感觉。"""
        stage = self.stage
        deep_done = all(v >= 1 for v in self.detail_hits.values())
        if stage == "warmup" and self.stage_turns >= 2:
            self._to("explore")
        elif stage == "explore" and (self.leads or self.stage_turns >= 4):
            self._to("deepen")
        elif stage == "deepen" and (deep_done or self.stage_turns >= 10):
            self._to("emotion")
        elif stage == "emotion" and self.stage_turns >= 3:
            self._to("wrapup")
        elif stage == "wrapup" and self.stage_turns >= 3:
            self._to("done")
        # 总预算兜底：接近上限强制收尾
        if self.stage not in ("wrapup", "done") and self.turns >= MAX_TURNS - 4:
            self._to("wrapup")

    def _to(self, stage: str) -> None:
        self.stage = stage
        self.stage_turns = 0

    # -- 状态栏渲染 -------------------------------------------------------

    def render_status(self) -> str:
        """一眼定位的键值对（不要散文），读数 + 操作策略成对给出。"""
        lines = [
            "<agent_status>",
            "以下是系统（非用户）维护的访谈仪表盘，严格按策略执行：",
            f"stage: {self.stage}",
            f"turns: {self.turns}/{MAX_TURNS}",
            f"leads: {json.dumps(self.leads, ensure_ascii=False)}",
            f"current_lead: {self.current_lead or '（未定）'}",
            f"detail_hits: {json.dumps(self.detail_hits, ensure_ascii=False)}",
            f"emotion_signals: {json.dumps(self.emotion_signals, ensure_ascii=False)}",
            f"策略: {STAGE_STRATEGY[self.stage]}",
            "</agent_status>",
        ]
        return "\n".join(lines)
