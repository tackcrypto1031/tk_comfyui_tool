import json
import os
import tempfile
import unittest

from tack_server import TackServer


class TackServerTests(unittest.TestCase):
    def test_history_is_preserved_by_default(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = os.path.join(tmpdir, "config")
            os.makedirs(config_dir, exist_ok=True)

            history_path = os.path.join(config_dir, "history.json")
            with open(history_path, "w", encoding="utf-8") as f:
                json.dump([{"id": "keep"}], f)

            server = TackServer(base_dir=tmpdir)
            self.assertEqual(server.get_history(), [{"id": "keep"}])
            self.assertEqual(server.get_settings().get("clear_history_on_startup"), False)

    def test_history_is_cleared_when_setting_enabled(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = os.path.join(tmpdir, "config")
            os.makedirs(config_dir, exist_ok=True)

            history_path = os.path.join(config_dir, "history.json")
            settings_path = os.path.join(config_dir, "settings.json")
            with open(history_path, "w", encoding="utf-8") as f:
                json.dump([{"id": "drop"}], f)
            with open(settings_path, "w", encoding="utf-8") as f:
                json.dump({"clear_history_on_startup": True}, f)

            server = TackServer(base_dir=tmpdir)
            self.assertEqual(server.get_history(), [])

    def test_save_history_merges_existing_entry_by_prompt_id(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            first = {
                "id": "row-1",
                "prompt_id": "prompt-abc",
                "preset_name": "Demo",
                "timestamp": 1000,
                "status": "queued",
            }
            second = {
                "prompt_id": "prompt-abc",
                "status": "completed",
                "image_url": "/tk/view_upload/demo.png",
            }

            self.assertEqual(server.save_history(first).get("status"), "success")
            self.assertEqual(server.save_history(second).get("status"), "success")

            history = server.get_history()
            self.assertEqual(len(history), 1)
            self.assertEqual(history[0].get("id"), "row-1")
            self.assertEqual(history[0].get("prompt_id"), "prompt-abc")
            self.assertEqual(history[0].get("timestamp"), 1000)
            self.assertEqual(history[0].get("status"), "completed")
            self.assertEqual(history[0].get("image_url"), "/tk/view_upload/demo.png")

    def test_save_history_keeps_recent_100_entries(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            for idx in range(120):
                res = server.save_history({
                    "id": f"row-{idx}",
                    "prompt_id": f"prompt-{idx}",
                    "timestamp": idx,
                })
                self.assertEqual(res.get("status"), "success")

            history = server.get_history()
            self.assertEqual(len(history), 100)
            self.assertEqual(history[0].get("prompt_id"), "prompt-119")
            self.assertEqual(history[-1].get("prompt_id"), "prompt-20")

    def test_trimmed_history_removes_persisted_upload_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            upload_dir = os.path.join(tmpdir, "image_upload")
            os.makedirs(upload_dir, exist_ok=True)
            stale_file = os.path.join(upload_dir, "stale_history.png")
            with open(stale_file, "wb") as f:
                f.write(b"stale")

            server = TackServer(base_dir=tmpdir)
            server.save_history({
                "id": "stale-row",
                "prompt_id": "prompt-stale",
                "persisted_image_url": "/tk/view_upload/stale_history.png",
            })

            for idx in range(100):
                server.save_history({
                    "id": f"row-{idx}",
                    "prompt_id": f"prompt-{idx}",
                })

            self.assertFalse(os.path.exists(stale_file))

    def test_save_workflow_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            result = server.save_workflow({
                "filename": "..\\..\\evil.json",
                "content": {"foo": "bar"},
            })

            self.assertEqual(result.get("status"), "success")
            saved_name = result.get("filename")
            self.assertIsInstance(saved_name, str)
            self.assertNotIn("..", saved_name)
            self.assertNotIn("/", saved_name)
            self.assertNotIn("\\", saved_name)

            saved_path = os.path.join(tmpdir, "config", "workflows", saved_name)
            self.assertTrue(os.path.exists(saved_path))

    def test_save_image_blocks_path_traversal(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            result = server.save_image(b"abc", "..\\..\\payload.png")

            self.assertEqual(result.get("status"), "success")
            filename = result["url"].split("/")[-1]
            self.assertNotIn("..", filename)
            self.assertNotIn("/", filename)
            self.assertNotIn("\\", filename)

            saved_path = os.path.join(tmpdir, "web", "assets", filename)
            self.assertTrue(os.path.exists(saved_path))

    def test_save_image_url_uses_installation_folder(self):
        folders = {
            "tk_comfyui_tool": "extensions/tk_comfyui_tool/assets/preview.png",
            "tk_comfyui_tooldesign": "extensions/tk_comfyui_tooldesign/assets/preview.png",
            "Toolkit copy": "extensions/Toolkit%20copy/assets/preview.png",
        }
        with tempfile.TemporaryDirectory() as tmpdir:
            for folder, expected_url in folders.items():
                with self.subTest(folder=folder):
                    server = TackServer(base_dir=os.path.join(tmpdir, folder))
                    result = server.save_image(b"preview", "preview.png")
                    self.assertEqual(result, {"status": "success", "url": expected_url})

    def test_upload_public_filename_validation(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            self.assertIsNone(server.get_upload_image_path("../x.png"))
            self.assertIsNone(server.get_upload_image_path("..\\x.png"))
            safe_path = server.get_upload_image_path("x.png")
            self.assertIsInstance(safe_path, str)
            self.assertTrue(safe_path.endswith(os.path.join("image_upload", "x.png")))

    def test_save_preset_rejects_self_reference_next_workflow(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            result = server.save_preset({
                "id": "self_ref",
                "name": "Self Ref",
                "category": "t2i",
                "nextWorkflows": ["self_ref"],
            })
            self.assertEqual(result.get("status"), "error")

    def test_save_preset_rejects_non_post_image_next_workflow(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            base = server.save_preset({
                "id": "base_t2i",
                "name": "Base T2I",
                "category": "t2i",
                "nextWorkflows": [],
            })
            self.assertEqual(base.get("status"), "success")

            result = server.save_preset({
                "id": "root",
                "name": "Root",
                "category": "t2i",
                "nextWorkflows": ["base_t2i"],
            })
            self.assertEqual(result.get("status"), "error")

    def test_save_preset_rejects_cycle_in_next_workflows(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            a = server.save_preset({
                "id": "A",
                "name": "A",
                "category": "post_image",
                "nextWorkflows": [],
            })
            b = server.save_preset({
                "id": "B",
                "name": "B",
                "category": "post_image",
                "nextWorkflows": ["A"],
            })
            self.assertEqual(a.get("status"), "success")
            self.assertEqual(b.get("status"), "success")

            result = server.save_preset({
                "id": "A",
                "name": "A",
                "category": "post_image",
                "nextWorkflows": ["B"],
            })
            self.assertEqual(result.get("status"), "error")

    def test_delete_preset_cleans_next_workflow_references(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            p1 = server.save_preset({
                "id": "P1",
                "name": "Root",
                "category": "t2i",
                "nextWorkflows": [],
            })
            p2 = server.save_preset({
                "id": "P2",
                "name": "Post",
                "category": "post_image",
                "nextWorkflows": [],
            })
            self.assertEqual(p1.get("status"), "success")
            self.assertEqual(p2.get("status"), "success")

            update = server.save_preset({
                "id": "P1",
                "name": "Root",
                "category": "t2i",
                "nextWorkflows": ["P2"],
            })
            self.assertEqual(update.get("status"), "success")

            deleted = server.delete_preset("P2")
            self.assertEqual(deleted.get("status"), "success")

            presets = server.get_presets()
            root = next((p for p in presets if p.get("id") == "P1"), None)
            self.assertIsNotNone(root)
            self.assertEqual(root.get("nextWorkflows"), [])

    def test_save_models_rejects_invalid_payload(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            result = server.save_models({"not": "a list"})
            self.assertEqual(result.get("status"), "error")

    def test_save_models_rejects_duplicate_ids(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            server = TackServer(base_dir=tmpdir)
            result = server.save_models([
                {"id": "m1", "name": "Model 1", "ratios": [{"name": "1:1", "width": 512, "height": 512}]},
                {"id": "m1", "name": "Model 1 dup", "ratios": [{"name": "1:1", "width": 1024, "height": 1024}]},
            ])
            self.assertEqual(result.get("status"), "error")

    def test_get_models_filters_invalid_entries(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = os.path.join(tmpdir, "config")
            os.makedirs(config_dir, exist_ok=True)
            models_path = os.path.join(config_dir, "models.json")
            with open(models_path, "w", encoding="utf-8") as f:
                json.dump([
                    {"id": "ok", "name": "OK", "ratios": [{"name": "1:1", "width": 512, "height": 512}]},
                    {"id": "", "name": "bad", "ratios": []},
                    {"id": "bad2", "name": "bad2", "ratios": [{"name": "", "width": 1, "height": 1}]},
                ], f)

            server = TackServer(base_dir=tmpdir)
            models = server.get_models()
            self.assertEqual(len(models), 2)
            self.assertEqual(models[0].get("id"), "ok")
            bad2 = next((m for m in models if m.get("id") == "bad2"), None)
            self.assertIsNotNone(bad2)
            self.assertEqual(bad2.get("ratios"), [])

    def test_get_models_falls_back_to_defaults_when_all_invalid(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config_dir = os.path.join(tmpdir, "config")
            os.makedirs(config_dir, exist_ok=True)
            models_path = os.path.join(config_dir, "models.json")
            with open(models_path, "w", encoding="utf-8") as f:
                json.dump([{"id": "", "name": "", "ratios": "oops"}], f)

            server = TackServer(base_dir=tmpdir)
            models = server.get_models()
            self.assertTrue(len(models) > 0)
            self.assertEqual(models[0].get("id"), "sd15")


if __name__ == "__main__":
    unittest.main()
