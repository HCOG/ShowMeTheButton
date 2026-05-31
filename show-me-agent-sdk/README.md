# ShowMeTheButton Agent SDK

Python SDK for enterprise customers to integrate ShowMeTheButton into their applications.

## Installation

```bash
pip install show-me-agent-sdk
```

## Usage

```python
from show_me_agent_sdk import ShowMeAgent

# Initialize with your deployment
agent = ShowMeAgent(
    endpoint="https://your-agent-service.com",
    api_key="your-api-key"
)

# Query the agent
result = agent.query(
    query="我想导出报表",
    elements=[
        {"id": "btn-export", "label": "导出", "type": "button"},
        {"id": "btn-save", "label": "保存", "type": "button"}
    ]
)

print(result.target_id)  # "btn-export"
print(result.confidence)  # 0.92
```

## For Enterprise

This SDK is designed for enterprise customers who want to:

- Deploy their own ShowMeTheButton Agent service
- Integrate with their existing knowledge bases
- Customize the LLM and RAG configuration

See main [README.md](../../README.md) for more information.
