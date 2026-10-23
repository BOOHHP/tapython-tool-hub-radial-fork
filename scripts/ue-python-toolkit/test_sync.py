import hashlib
import importlib.util
import json
import contextlib
import io
import tempfile
import unittest
import zipfile
from pathlib import Path


MODULE_PATH = Path(__file__).with_name("sync.py")


def load_sync_module():
    spec = importlib.util.spec_from_file_location("ue_python_toolkit_sync", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load sync.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SyncToolkitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ue-python-toolkit-test-")
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        self.source.mkdir()
        (self.source / "00_Python_Main.py").write_text(
            "def launch():\n    return 'launched'\n",
            encoding="utf-8",
        )
        self.write_tool(
            "1_Actor/1_Read/query.py",
            {
                "name": "Query Tool",
                "id": "query_tool",
                "description": "Read selected assets",
                "destructive": False,
                "params": [{"key": "run", "label": "Run", "type": "action", "default": ""}],
            },
        )
        self.write_tool(
            "2_Model/1_Edit/offset.py",
            {
                "name": "Offset Tool",
                "description": "Offset selected actors",
                "destructive": True,
                "params": [{"key": "distance", "label": "Distance", "type": "float", "default": 1.0}],
            },
        )
        self.sync = load_sync_module()

    def tearDown(self):
        self.temp.cleanup()

    def write_tool(self, relative_path, metadata):
        target = self.source / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            "TOOL_META = " + repr(metadata) + "\n\ndef main(params=None):\n    return params\n",
            encoding="utf-8",
        )

    def test_scan_and_bootstrap_registry_are_deterministic_and_read_only(self):
        before = self.tree_hashes(self.source)
        scan = self.sync.scan_source(self.source)
        registry = self.sync.bootstrap_registry(
            scan,
            collection_id="ue-python-toolkit",
            author="Scene C",
            owner_team="Scene C",
        )
        after = self.tree_hashes(self.source)

        self.assertEqual(before, after)
        self.assertEqual(scan["toolCount"], 2)
        self.assertEqual(scan["categories"], ["1_Actor", "2_Model"])
        self.assertEqual(len(registry["modules"]), 2)
        ids = [module["moduleId"] for module in registry["modules"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn("query_tool", ids)
        generated_id = next(module["moduleId"] for module in registry["modules"] if module["sourcePath"].endswith("offset.py"))
        self.assertRegex(generated_id, r"^tool-[a-f0-9]{12}$")

        second = self.sync.bootstrap_registry(
            scan,
            collection_id="ue-python-toolkit",
            author="Scene C",
            owner_team="Scene C",
        )
        self.assertEqual(registry, second)

        overridden = self.sync.bootstrap_registry(
            scan,
            collection_id="ue-python-toolkit",
            author="Scene C",
            owner_team="Scene C",
            module_id_overrides={"2_Model/1_Edit/offset.py": "batch_offset_actors"},
        )
        offset = next(module for module in overridden["modules"] if module["sourcePath"].endswith("offset.py"))
        self.assertEqual(offset["moduleId"], "batch_offset_actors")
        self.assertEqual(offset["slug"], "uept-batch-offset-actors")

    def test_classifies_new_changed_unchanged_and_missing_modules(self):
        scan = self.sync.scan_source(self.source)
        registry = self.sync.bootstrap_registry(scan, "ue-python-toolkit", "Scene C", "Scene C")
        registry["modules"][0]["sourceSha256"] = "0" * 64
        registry["modules"].append({
            "moduleId": "missing-tool",
            "slug": "uept-missing-tool",
            "version": "1.0.0",
            "sourcePath": "9_Missing/tool.py",
            "sourceSha256": "1" * 64,
        })

        report = self.sync.classify_modules(scan, registry)
        statuses = {item["moduleId"]: item["status"] for item in report["modules"]}
        self.assertEqual(statuses[registry["modules"][0]["moduleId"]], "changed")
        self.assertIn("unchanged", statuses.values())
        self.assertEqual(statuses["missing-tool"], "missing")

        new_scan = self.sync.scan_source(self.source)
        self.write_tool("3_New/tool.py", {"name": "New Tool", "params": []})
        new_scan = self.sync.scan_source(self.source)
        report = self.sync.classify_modules(new_scan, registry)
        self.assertIn("new", {item["status"] for item in report["modules"]})

    def test_builds_deterministic_shell_and_module_v2_packages(self):
        scan = self.sync.scan_source(self.source)
        registry = self.sync.bootstrap_registry(scan, "ue-python-toolkit", "Scene C", "Scene C")
        output_a = self.root / "out-a"
        output_b = self.root / "out-b"

        result_a = self.sync.build_packages(scan, registry, output_a)
        result_b = self.sync.build_packages(scan, registry, output_b)

        self.assertEqual(result_a["packageCount"], 3)
        packages_a = sorted(output_a.glob("*.tapython-tool.zip"))
        packages_b = sorted(output_b.glob("*.tapython-tool.zip"))
        self.assertEqual([path.name for path in packages_a], [path.name for path in packages_b])
        self.assertEqual(
            [self.sha256(path) for path in packages_a],
            [self.sha256(path) for path in packages_b],
        )

        shell_package = output_a / "ue-python-toolkit-1.0.0.tapython-tool.zip"
        with zipfile.ZipFile(shell_package) as archive:
            names = set(archive.namelist())
            self.assertIn("manifest.json", names)
            self.assertIn("Python/UEPythonToolkit/runtime.py", names)
            self.assertIn("Python/UEPythonToolkit/__init__.py", names)
            self.assertIn("Python/UEPythonToolkit/collection.lock.json", names)
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["toolType"], "python-script")
            self.assertEqual(manifest["install"]["mountPoint"], "OnToolbar")
            self.assertEqual(len(manifest["menuEntries"]), 1)
            lock = json.loads(archive.read("Python/UEPythonToolkit/collection.lock.json"))
            self.assertEqual(lock["modules"], [])

        module_id = registry["modules"][0]["moduleId"]
        module_package = output_a / f"uept-{module_id.replace('_', '-')}-1.0.0.tapython-tool.zip"
        with zipfile.ZipFile(module_package) as archive:
            names = set(archive.namelist())
            self.assertIn(f"Python/UEPythonToolkit/Modules/{module_id}/tool.py", names)
            self.assertIn(f"Python/UEPythonToolkit/Modules/{module_id}/module.json", names)
            manifest = json.loads(archive.read("manifest.json"))
            self.assertEqual(manifest["menuEntries"], [])
            self.assertEqual(manifest["collection"]["role"], "module")

    def test_rejects_writes_inside_source_and_same_version_source_changes(self):
        config_path = self.root / "unsafe-config.json"
        config_path.write_text(json.dumps({
            "sourceRoot": str(self.source),
            "registryPath": str(self.source / "module-registry.json"),
            "reportPath": str(self.root / "report.json"),
            "outputRoot": str(self.root / "generated"),
            "collectionId": "ue-python-toolkit",
            "author": "Scene C",
            "ownerTeam": "Scene C"
        }), encoding="utf-8")
        with self.assertRaisesRegex(self.sync.SyncError, "inside sourceRoot"):
            self.sync.read_config(config_path)

        overlap_config = json.loads(config_path.read_text(encoding="utf-8"))
        overlap_config["registryPath"] = str(self.root / "state.json")
        overlap_config["reportPath"] = str(self.root / "state.json")
        config_path.write_text(json.dumps(overlap_config), encoding="utf-8")
        with self.assertRaisesRegex(self.sync.SyncError, "must be distinct"):
            self.sync.read_config(config_path)

        inside_output = dict(overlap_config)
        inside_output["registryPath"] = str(self.root / "generated" / "registry.json")
        inside_output["reportPath"] = str(self.root / "report.json")
        inside_output["outputRoot"] = str(self.root / "generated")
        config_path.write_text(json.dumps(inside_output), encoding="utf-8")
        with self.assertRaisesRegex(self.sync.SyncError, "inside outputRoot"):
            self.sync.read_config(config_path)

        scan = self.sync.scan_source(self.source)
        registry = self.sync.bootstrap_registry(scan, "ue-python-toolkit", "Scene C", "Scene C")
        changed_path = self.source / registry["modules"][0]["sourcePath"]
        changed_path.write_text(changed_path.read_text(encoding="utf-8") + "\n# changed\n", encoding="utf-8")
        changed_scan = self.sync.scan_source(self.source)
        output = self.root / "blocked-output"
        with self.assertRaisesRegex(self.sync.SyncError, "version bump"):
            self.sync.build_packages(changed_scan, registry, output)
        self.assertFalse(output.exists())

        registered = next(item for item in registry["modules"] if item["sourcePath"] == changed_path.relative_to(self.source).as_posix())
        registered["sourceSha256"] = next(item["sourceSha256"] for item in changed_scan["modules"] if item["sourcePath"] == registered["sourcePath"])
        with self.assertRaisesRegex(self.sync.SyncError, "version is still"):
            self.sync.build_packages(changed_scan, registry, output)
        self.assertFalse(output.exists())

    def test_rejects_registry_fields_that_escape_output(self):
        scan = self.sync.scan_source(self.source)
        registry = self.sync.bootstrap_registry(scan, "ue-python-toolkit", "Scene C", "Scene C")
        registry["shell"]["slug"] = "../escaped"
        with self.assertRaisesRegex(self.sync.SyncError, "invalid shell slug"):
            self.sync.build_packages(scan, registry, self.root / "output")
        self.assertFalse((self.root / "escaped-1.0.0.tapython-tool.zip").exists())

        registry = self.sync.bootstrap_registry(scan, "ue-python-toolkit", "Scene C", "Scene C")
        del registry["shell"]["versionSourceSha256"]
        with self.assertRaisesRegex(self.sync.SyncError, "shell version baseline"):
            self.sync.build_packages(scan, registry, self.root / "output")

        registry = self.sync.bootstrap_registry(scan, "ue-python-toolkit", "Scene C", "Scene C")
        del registry["modules"][0]["versionSourceVersion"]
        with self.assertRaisesRegex(self.sync.SyncError, "module version baseline"):
            self.sync.build_packages(scan, registry, self.root / "output")

    def test_command_build_atomically_replaces_output_and_bootstrap_wont_overwrite_registry(self):
        scan = self.sync.scan_source(self.source)
        registry = self.sync.bootstrap_registry(scan, "ue-python-toolkit", "Scene C", "Scene C")
        registry_path = self.root / "registry.json"
        report_path = self.root / "report.json"
        output = self.root / "generated"
        self.sync.write_json(registry_path, registry)
        output.mkdir()
        (output / "stale.tapython-tool.zip").write_bytes(b"stale")
        config = {
            "sourceRoot": str(self.source),
            "registryPath": str(registry_path),
            "reportPath": str(report_path),
            "outputRoot": str(output),
            "collectionId": "ue-python-toolkit",
            "author": "Scene C",
            "ownerTeam": "Scene C"
        }
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.sync.command_build(config, None), 0)
        self.assertFalse((output / "stale.tapython-tool.zip").exists())
        self.assertEqual(len(list(output.glob("*.tapython-tool.zip"))), 3)

        config_path = self.root / "config.json"
        config_path.write_text(json.dumps(config), encoding="utf-8")
        with contextlib.redirect_stderr(io.StringIO()), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(self.sync.main(["--config", str(config_path), "bootstrap", "--write"]), 1)
        preserved = self.sync.load_json(registry_path)
        self.assertEqual(preserved, registry)

    @staticmethod
    def tree_hashes(root):
        return {
            path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(root.rglob("*"))
            if path.is_file()
        }

    @staticmethod
    def sha256(path):
        return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    unittest.main()
