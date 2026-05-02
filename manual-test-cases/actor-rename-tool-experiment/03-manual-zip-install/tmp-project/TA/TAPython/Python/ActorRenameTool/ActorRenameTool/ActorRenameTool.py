import unreal
import re


class ActorRenameController:
    def __init__(self, json_path):
        self.json_path = json_path
        self.data = unreal.PythonBPLib.get_chameleon_data(json_path)
        self.data.set_text("txt_status", "就绪。请在场景中选中目标 Actor。")

    def _get_selected_actors(self):
        actors = unreal.EditorLevelLibrary.get_selected_level_actors()
        return list(actors) if actors else []

    def refresh_actor_list(self):
        actors = self._get_selected_actors()
        if not actors:
            self.data.set_text("txt_actor_list", "(未选中任何 Actor)")
            self.data.set_text("txt_status", "提示: 未选中任何 Actor。")
            return

        lines = []
        for index, actor in enumerate(actors):
            tags = [str(tag) for tag in actor.tags]
            tag_text = f" [Tags: {', '.join(tags)}]" if tags else ""
            lines.append(f"{index + 1}. {actor.get_actor_label()}{tag_text}")

        self.data.set_text("txt_actor_list", "\n".join(lines))
        self.data.set_text("txt_status", f"已列出 {len(actors)} 个选中的 Actor。")

    def execute_find_replace(self):
        find_text = self.data.get_text("input_find")
        replace_text = self.data.get_text("input_replace") or ""
        case_sensitive = self.data.get_is_checked("chk_case_sensitive")

        if not find_text:
            self.data.set_text("txt_status", "警告: 查找字段不能为空。")
            return

        changed = 0
        for actor in self._get_selected_actors():
            label = actor.get_actor_label()
            if case_sensitive:
                new_label = label.replace(find_text, replace_text)
            else:
                new_label = re.sub(re.escape(find_text), replace_text, label, flags=re.IGNORECASE)
            if new_label != label:
                actor.set_actor_label(new_label)
                changed += 1

        self.data.set_text("txt_status", f"查找替换完成: {changed} 个 Actor 已修改。")
        self.refresh_actor_list()

    def execute_batch_rename(self):
        base_name = self.data.get_text("input_base_name")
        start_index = int(self.data.get_text("input_start_index") or "1")
        padding = max(1, int(self.data.get_text("input_padding") or "2"))

        actors = self._get_selected_actors()
        for index, actor in enumerate(actors):
            actor.set_actor_label(f"{base_name}_{str(start_index + index).zfill(padding)}")

        self.data.set_text("txt_status", f"批量重命名完成: {len(actors)} 个 Actor 已修改。")
        self.refresh_actor_list()


instance = None