---
model: normal
schedule: 4h
skillIds: ["agent-qa"]
enabled: false
prerequisiteCommand: "echo '## QA target config (resolved by prereq — do NOT re-curl)'; curl -fsS \"http://localhost:1337/api/projects/by-project/seo-tools/config\" 2>/dev/null || echo '{\"error\":\"tamtam config service unreachable from host\"}'"
---


