---
model: smart
schedule: 30m
skillIds: ["agent-improve"]
prerequisiteCommand: "echo '## Top 5 oldest candidate files'; find app components lib hooks scripts docs -type f -not -path '*/.tamtam/*' -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/dist/*' -not -path '*/coverage/*' -not -name '*.d.ts' \\( -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.sh' \\) -printf '%TY-%Tm-%Td %p\\n' 2>/dev/null | sort | head -5; echo; echo '## Recent improve runs (tail of .tamtam/cache/audits/improve.md)'; tail -10 .tamtam/cache/audits/improve.md 2>/dev/null || echo '(no audit log yet)'"
---


