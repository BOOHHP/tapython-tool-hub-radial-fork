from __future__ import annotations

import unreal


class TestSelectionAuditController:
    def __init__(self, json_path: str) -> None:
        self.json_path = json_path
        self.data = unreal.PythonBPLib.get_chameleon_data(json_path)
        self.latest_summary = "等待刷新。"
        self.refresh_audit()

    def _get_selected_actors(self) -> list[object]:
        actors = unreal.EditorLevelLibrary.get_selected_level_actors()
        return list(actors) if actors else []

    def refresh_audit(self) -> None:
        actors = self._get_selected_actors()
        self.data.set_text("txt_selection_count", f"Selected Actors: {len(actors)}")

        if not actors:
            self.latest_summary = "未选中 Actor。该状态用于测试空结果展示。"
            self.data.set_text("txt_audit_result", self.latest_summary)
            return

        lines = ["Selection Audit Summary", ""]
        for index, actor in enumerate(actors, start=1):
            label = actor.get_actor_label()
            class_name = actor.get_class().get_name()
            lines.append(f"{index}. {label} [{class_name}]")

        if len(actors) > 25:
            lines.append("")
            lines.append("Warning: selection contains more than 25 actors.")

        self.latest_summary = "\n".join(lines)
        self.data.set_text("txt_audit_result", self.latest_summary)

    def copy_summary(self) -> None:
        self.data.set_text("txt_audit_result", self.latest_summary)


instance = None