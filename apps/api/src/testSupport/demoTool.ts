export const demoToolMarkdown = `---
schemaVersion: "1.0.0"
slug: demo-tool
name: DemoTool
displayName: Demo Tool
version: "1.0.0"
releasedAt: "2026-05-21"
updatedAt: "2026-05-21"
author: QA Team
ownerTeam: QA
status: approved
description: Demo tool.
category: validation
riskLevel: low
sourceMode: v2-package-upload
tags: [demo]
compatibility:
  unrealEngine: ["5.4"]
  tapython: ["1.2+"]
  plugins: ["TAPython"]
dependencies: []
mountPoint: OnToolBarChameleon
installPath: <Project>/TA/TAPython/Python/DemoTool/
entryJson: DemoTool/DemoTool.json
changeSummary: Initial upload.
summary:
  features: []
  unrealApis: []
  widgetAkas: []
  installSteps: []
  riskNotes: []
menuConfigMerge:
  target: <Project>/TA/TAPython/UI/MenuConfig.json
  mountPoint: OnToolBarChameleon
  itemsToAdd: []
preInstallChecks: []
postInstallSteps: []
uninstallSteps: []
---

# Demo
`;
