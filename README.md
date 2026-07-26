# life-agent

**人人都有好故事，只是不会讲。**

一个"采访者 + 导演" agent：通过访谈式对话把普通人讲不出来的故事挖出来，替他讲好，最终以图文/视频的形式引起共鸣。

## 文档

- [产品需求文档（PRD）](docs/PRD.md) — 定位、三层需求、MVP 范围
- [技术文档（TECH）](docs/TECH.md) — 前后端技术路线、架构、API 与数据模型
- [项目任务（TASKS）](docs/TASKS.md) — 任务看板 + 决策日志，随开发实时更新

## 状态

P0 阶段：访谈 agent 对话设计中。当前进度见 [TASKS.md](docs/TASKS.md)。

## 开发

```powershell
# 后端（conda 环境 ai_agent，Python 3.11+）
cd backend
pip install -r requirements.txt
copy .env.example .env   # 填入 LLM_API_KEY；不填则以 MOCK 模式运行
python -m uvicorn app.main:app --reload --port 8000

# 前端（另开终端）
cd frontend
npm install
npm run dev              # http://localhost:5173，/api 已代理到 8000
```

目录结构：`prompts/` 是提示词资产（改动等同代码，提交须写调优原因）；`backend/app/agent/` 是访谈 agent 核心（状态机/状态栏/防编造校验），设计依据见 [TECH.md §3.5](docs/TECH.md)。
