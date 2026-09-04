import os
import json
import uuid
import re
from urllib.parse import quote

class TackServer:
    ALLOWED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
    HISTORY_LIMIT = 100

    def __init__(self, base_dir=None):
        self.base_dir = os.path.abspath(base_dir) if base_dir else os.path.dirname(os.path.realpath(__file__))
        self.config_dir = os.path.join(self.base_dir, "config")
        self.presets_path = os.path.join(self.config_dir, "presets.json")
        self.workflows_dir = os.path.join(self.config_dir, "workflows")
        self.models_path = os.path.join(self.config_dir, "models.json")
        self.history_path = os.path.join(self.config_dir, "history.json")
        self.settings_path = os.path.join(self.config_dir, "settings.json")
        self.default_settings = {
            "clear_history_on_startup": False
        }
        
        if not os.path.exists(self.config_dir):
            os.makedirs(self.config_dir)
        if not os.path.exists(self.workflows_dir):
            os.makedirs(self.workflows_dir)
        if not os.path.exists(self.presets_path):
            self._write_json_file(self.presets_path, [])
        if not os.path.exists(self.history_path):
            self._write_json_file(self.history_path, [])
        if not os.path.exists(self.settings_path):
            self._write_json_file(self.settings_path, self.default_settings)

        settings = self.get_settings()
        if settings.get("clear_history_on_startup", False):
            self._write_json_file(self.history_path, [])

    def _write_json_file(self, file_path, content):
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(content, f, indent=2, ensure_ascii=False)

    def _read_json_file(self, file_path, default_value):
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default_value

    def _sanitize_filename(self, filename, fallback_prefix="file", default_ext=""):
        raw_name = os.path.basename(str(filename or "").replace("\\", "/")).strip()
        stem, ext = os.path.splitext(raw_name)

        stem = re.sub(r"[^A-Za-z0-9._-]", "_", stem).strip("._")
        ext = re.sub(r"[^A-Za-z0-9.]", "", ext)
        if ext and not ext.startswith("."):
            ext = "." + ext.lstrip(".")

        if not stem:
            stem = f"{fallback_prefix}_{uuid.uuid4().hex[:8]}"

        if default_ext and not ext:
            ext = default_ext

        return f"{stem}{ext}"

    def _safe_join(self, base_dir, filename):
        base_dir_abs = os.path.abspath(base_dir)
        candidate = os.path.abspath(os.path.join(base_dir_abs, filename))
        if os.path.commonpath([base_dir_abs, candidate]) != base_dir_abs:
            raise ValueError("Invalid file path")
        return candidate

    def _normalize_next_workflows(self, next_workflows):
        if not isinstance(next_workflows, list):
            return []

        normalized = []
        seen = set()
        for workflow_id in next_workflows:
            workflow_id_str = str(workflow_id).strip()
            if not workflow_id_str:
                continue
            if workflow_id_str in seen:
                continue
            seen.add(workflow_id_str)
            normalized.append(workflow_id_str)
        return normalized

    def _find_cycle_path(self, graph):
        if not isinstance(graph, dict):
            return None

        visiting = set()
        visited = set()
        stack = []
        cycle_path = None

        def dfs(node):
            nonlocal cycle_path
            visiting.add(node)
            stack.append(node)

            for next_node in graph.get(node, []):
                if next_node not in graph:
                    continue
                if next_node in visiting:
                    start_idx = stack.index(next_node)
                    cycle_path = stack[start_idx:] + [next_node]
                    return True
                if next_node in visited:
                    continue
                if dfs(next_node):
                    return True

            stack.pop()
            visiting.remove(node)
            visited.add(node)
            return False

        for node in sorted(graph.keys()):
            if node in visited:
                continue
            if dfs(node):
                return cycle_path
        return None

    def is_safe_public_filename(self, filename):
        if not filename:
            return False
        if filename in (".", ".."):
            return False
        return filename == os.path.basename(filename) and ("/" not in filename) and ("\\" not in filename)

    def get_upload_image_path(self, filename):
        if not self.is_safe_public_filename(filename):
            return None
        upload_dir = os.path.join(self.base_dir, "image_upload")
        return self._safe_join(upload_dir, filename)

    def get_presets(self):
        try:
            return self._read_json_file(self.presets_path, [])
        except Exception as e:
            print(f"Error reading presets: {e}")
            return []

    def save_preset(self, preset_data):
        try:
            if not isinstance(preset_data, dict):
                return {"status": "error", "message": "Invalid preset payload"}

            presets = self.get_presets()
            if not isinstance(presets, list):
                presets = []

            normalized_preset = dict(preset_data)
            normalized_id = str(normalized_preset.get("id") or uuid.uuid4())
            normalized_preset["id"] = normalized_id

            next_workflows = self._normalize_next_workflows(normalized_preset.get("nextWorkflows", []))
            if normalized_id in next_workflows:
                return {"status": "error", "message": "Preset cannot include itself in nextWorkflows."}

            preset_by_id = {}
            for preset in presets:
                if not isinstance(preset, dict):
                    continue
                preset_id = str(preset.get("id", "")).strip()
                if not preset_id:
                    continue
                preset_by_id[preset_id] = preset

            for next_id in next_workflows:
                target = preset_by_id.get(next_id)
                if target is None:
                    return {"status": "error", "message": f"Invalid next workflow id: {next_id}"}
                if target.get("category") != "post_image":
                    return {"status": "error", "message": f"Next workflow must be post_image: {next_id}"}

            chain_graph = {}
            for preset_id, preset in preset_by_id.items():
                chain_graph[preset_id] = self._normalize_next_workflows(preset.get("nextWorkflows", []))
            chain_graph[normalized_id] = next_workflows

            cycle = self._find_cycle_path(chain_graph)
            if cycle:
                return {"status": "error", "message": f"Detected cycle in nextWorkflows: {' -> '.join(cycle)}"}

            normalized_preset["nextWorkflows"] = next_workflows

            # Check if update or new
            existing_idx = next((i for i, p in enumerate(presets) if str(p.get("id")) == normalized_id), -1)
            
            if existing_idx >= 0:
                presets[existing_idx] = normalized_preset
            else:
                presets.append(normalized_preset)
                
            self._write_json_file(self.presets_path, presets)
            return {"status": "success", "id": normalized_id}
        except Exception as e:
            print(f"Error saving preset: {e}")
            return {"status": "error", "message": str(e)}

    def delete_preset(self, preset_id):
        try:
            presets = self.get_presets()
            preset_id_str = str(preset_id)
            presets = [p for p in presets if str(p.get("id")) != preset_id_str]

            for preset in presets:
                if not isinstance(preset, dict):
                    continue
                current_next = self._normalize_next_workflows(preset.get("nextWorkflows", []))
                preset["nextWorkflows"] = [next_id for next_id in current_next if next_id != preset_id_str]

            self._write_json_file(self.presets_path, presets)
            return {"status": "success"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_workflows(self):
        files = []
        if os.path.exists(self.workflows_dir):
            for f in os.listdir(self.workflows_dir):
                if f.endswith(".json"):
                    files.append(f)
        return files

    def save_workflow(self, data):
        try:
            requested_name = data.get("filename")
            filename = self._sanitize_filename(requested_name, fallback_prefix="workflow", default_ext=".json")
            if not filename.lower().endswith(".json"):
                filename = f"{filename}.json"
            content = data.get("content", {})
            
            file_path = self._safe_join(self.workflows_dir, filename)
            self._write_json_file(file_path, content)
            
            return {"status": "success", "filename": filename, "content": content}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def save_image(self, image_data, filename):
        try:
            assets_dir = os.path.join(self.base_dir, "web", "assets")
            if not os.path.exists(assets_dir):
                os.makedirs(assets_dir)

            safe_name = self._sanitize_filename(filename, fallback_prefix="image", default_ext=".png")
            
            file_path = self._safe_join(assets_dir, safe_name)
            with open(file_path, "wb") as f:
                f.write(image_data)
                
            extension_name = quote(os.path.basename(self.base_dir), safe="")
            return {"status": "success", "url": f"extensions/{extension_name}/assets/{safe_name}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_history(self):
        try:
            history = self._read_json_file(self.history_path, [])
            return history if isinstance(history, list) else []
        except Exception as e:
            return []

    def _find_existing_history_index(self, history, history_item):
        if not isinstance(history, list) or not isinstance(history_item, dict):
            return -1

        prompt_id = str(history_item.get("prompt_id", "")).strip()
        item_id = str(history_item.get("id", "")).strip()

        for idx, row in enumerate(history):
            if not isinstance(row, dict):
                continue
            row_prompt_id = str(row.get("prompt_id", "")).strip()
            row_id = str(row.get("id", "")).strip()

            if prompt_id and row_prompt_id == prompt_id:
                return idx
            if item_id and row_id and row_id == item_id:
                return idx
        return -1

    def _extract_history_upload_filename(self, history_entry):
        if not isinstance(history_entry, dict):
            return None

        marker = "/tk/view_upload/"
        for key in ("persisted_image_url", "image_url"):
            raw_value = str(history_entry.get(key, "")).strip()
            if not raw_value:
                continue
            marker_index = raw_value.find(marker)
            if marker_index < 0:
                continue

            raw_filename = raw_value[marker_index + len(marker):]
            raw_filename = raw_filename.split("?", 1)[0].split("#", 1)[0]
            filename = os.path.basename(raw_filename)
            if self.is_safe_public_filename(filename):
                return filename

        return None

    def _cleanup_trimmed_history_assets(self, trimmed_entries, active_entries):
        if not isinstance(trimmed_entries, list) or not trimmed_entries:
            return

        active_filenames = set()
        for entry in active_entries if isinstance(active_entries, list) else []:
            filename = self._extract_history_upload_filename(entry)
            if filename:
                active_filenames.add(filename)

        for entry in trimmed_entries:
            filename = self._extract_history_upload_filename(entry)
            if not filename or filename in active_filenames:
                continue

            file_path = self.get_upload_image_path(filename)
            if file_path and os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except Exception:
                    pass

    def save_history(self, history_item):
        try:
            if not isinstance(history_item, dict):
                return {"status": "error", "message": "Invalid history payload"}

            history = self.get_history()
            existing_index = self._find_existing_history_index(history, history_item)

            normalized_item = dict(history_item)
            if existing_index >= 0:
                existing_item = history.pop(existing_index)
                normalized_item = {**existing_item, **normalized_item}

            if not str(normalized_item.get("id", "")).strip():
                normalized_item["id"] = str(uuid.uuid4())
            if "prompt_id" in normalized_item:
                normalized_item["prompt_id"] = str(normalized_item.get("prompt_id", "")).strip()

            history.insert(0, normalized_item)  # Keep most recent first
            if len(history) > self.HISTORY_LIMIT:
                trimmed_entries = history[self.HISTORY_LIMIT:]
                history = history[:self.HISTORY_LIMIT]
                self._cleanup_trimmed_history_assets(trimmed_entries, history)
                
            self._write_json_file(self.history_path, history)
            return {"status": "success"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def save_input_image(self, image_data, original_filename):
        """
        Save uploaded image to local image_upload folder.
        Renames file to random alphanumeric (max 20 chars).
        Returns filename for frontend to use in secondary standard upload.
        """
        import string
        import random
        
        try:
            # Custom image_upload directory
            upload_dir = os.path.join(self.base_dir, "image_upload")
            if not os.path.exists(upload_dir):
                os.makedirs(upload_dir)
            
            # Get file extension
            original_name = os.path.basename(str(original_filename or ""))
            _, ext = os.path.splitext(original_name)
            ext = ext.lower()
            if ext not in self.ALLOWED_IMAGE_EXTENSIONS:
                ext = ".png"
            
            # Generate shorter random alphanumeric name (e.g. img_ + 10 chars + ext)
            random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
            safe_name = f"img_{random_str}{ext}"
            
            # Full path in custom upload directory
            file_path = self._safe_join(upload_dir, safe_name)
            
            # Collision check
            if os.path.exists(file_path):
                random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
                safe_name = f"img_{random_str}{ext}"
                file_path = self._safe_join(upload_dir, safe_name)
            
            # Write file
            with open(file_path, "wb") as f:
                f.write(image_data)
            
            return {
                "status": "success",
                "filename": safe_name,
                "abs_path": file_path, # Return absolute path for LoadImageFromPath
                "subfolder": "",  
                "type": "input",
                "preview_url": f"/tk/view_upload/{safe_name}" 
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def _normalize_single_ratio(self, ratio):
        if not isinstance(ratio, dict):
            return None

        name = str(ratio.get("name", "")).strip()
        try:
            width = int(ratio.get("width"))
            height = int(ratio.get("height"))
        except Exception:
            return None

        if not name or width <= 0 or height <= 0:
            return None
        return {"name": name, "width": width, "height": height}

    def _normalize_models_data(self, models_data, strict=False):
        if not isinstance(models_data, list):
            return [], ["Models payload must be a list."]

        normalized = []
        errors = []
        seen_ids = set()

        for index, model in enumerate(models_data):
            if not isinstance(model, dict):
                errors.append(f"Model at index {index} must be an object.")
                continue

            model_id = str(model.get("id", "")).strip()
            model_name = str(model.get("name", "")).strip()
            ratios_raw = model.get("ratios", [])

            if not model_id:
                errors.append(f"Model at index {index} has empty id.")
                continue
            if model_id in seen_ids:
                errors.append(f"Duplicate model id: {model_id}")
                continue
            if not model_name:
                errors.append(f"Model '{model_id}' has empty name.")
                continue
            if not isinstance(ratios_raw, list):
                errors.append(f"Model '{model_id}' ratios must be a list.")
                continue

            ratios = []
            for ratio_idx, ratio in enumerate(ratios_raw):
                normalized_ratio = self._normalize_single_ratio(ratio)
                if normalized_ratio is None:
                    errors.append(f"Model '{model_id}' has invalid ratio at index {ratio_idx}.")
                    continue
                ratios.append(normalized_ratio)

            seen_ids.add(model_id)
            normalized.append({
                "id": model_id,
                "name": model_name,
                "ratios": ratios
            })

        if strict and errors:
            return [], errors
        return normalized, errors

    def get_models(self):
        try:
            if not os.path.exists(self.models_path):
                # Default seed data if file doesn't exist
                default_models = [
                    {
                        "id": "sd15",
                        "name": "SD1.5",
                        "ratios": [
                            {"name": "1:1", "width": 512, "height": 512},
                            {"name": "2:3", "width": 512, "height": 768},
                            {"name": "3:2", "width": 768, "height": 512}
                        ]
                    },
                    {
                        "id": "sdxl",
                        "name": "SDXL",
                        "ratios": [
                            {"name": "1:1", "width": 1024, "height": 1024},
                            {"name": "2:3", "width": 832, "height": 1216},
                            {"name": "3:2", "width": 1216, "height": 832},
                            {"name": "16:9", "width": 1344, "height": 768},
                            {"name": "9:16", "width": 768, "height": 1344},
                            {"name": "9:21", "width": 640, "height": 1536},
                            {"name": "21:9", "width": 1536, "height": 640}
                        ]
                    },
                    {
                        "id": "flux",
                        "name": "FLUX",
                        "ratios": [
                            {"name": "1:1", "width": 1448, "height": 1448},
                            {"name": "2:3", "width": 1152, "height": 1728},
                            {"name": "3:2", "width": 1728, "height": 1152},
                            {"name": "16:9", "width": 1920, "height": 1088},
                            {"name": "9:16", "width": 1088, "height": 1920},
                            {"name": "9:21", "width": 960, "height": 2176},
                            {"name": "21:9", "width": 2176, "height": 960}
                        ]
                    },
                    {
                        "id": "qwen",
                        "name": "QwenImage",
                        "ratios": [
                            {"name": "1:1", "width": 1328, "height": 1328},
                            {"name": "2:3", "width": 1056, "height": 1584},
                            {"name": "3:2", "width": 1584, "height": 1056},
                            {"name": "16:9", "width": 1664, "height": 928},
                            {"name": "9:16", "width": 928, "height": 1664}
                        ]
                    },
                    {
                        "id": "zimage",
                        "name": "Zimage",
                        "ratios": [
                            {"name": "1:1", "width": 1440, "height": 1440},
                            {"name": "1:1", "width": 1024, "height": 1024},
                            {"name": "2:3", "width": 1088, "height": 1600},
                            {"name": "3:2", "width": 1600, "height": 1088},
                            {"name": "16:9", "width": 1920, "height": 1088},
                            {"name": "9:16", "width": 1088, "height": 1920}
                        ]
                    },
                    {
                        "id": "wan",
                        "name": "WAN",
                        "ratios": [
                            {"name": "1:1", "width": 624, "height": 624},
                            {"name": "2:3", "width": 384, "height": 576},
                            {"name": "2:3", "width": 528, "height": 768},
                            {"name": "2:3", "width": 624, "height": 912},
                            {"name": "2:3", "width": 656, "height": 960},
                            {"name": "2:3", "width": 736, "height": 1072},
                            {"name": "2:3", "width": 784, "height": 1136},
                            {"name": "3:2", "width": 752, "height": 512},
                            {"name": "3:4", "width": 416, "height": 544},
                            {"name": "3:4", "width": 560, "height": 720},
                            {"name": "3:4", "width": 672, "height": 864},
                            {"name": "3:4", "width": 720, "height": 912},
                            {"name": "3:4", "width": 784, "height": 1008},
                            {"name": "3:4", "width": 848, "height": 1088},
                            {"name": "9:16", "width": 368, "height": 624},
                            {"name": "9:16", "width": 480, "height": 848},
                            {"name": "9:16", "width": 576, "height": 1008},
                            {"name": "9:16", "width": 608, "height": 1072},
                            {"name": "9:16", "width": 672, "height": 1184},
                            {"name": "9:16", "width": 720, "height": 1264},
                            {"name": "16:9", "width": 1280, "height": 720},
                            {"name": "16:9", "width": 624, "height": 368},
                            {"name": "16:9", "width": 848, "height": 480},
                            {"name": "16:9", "width": 1008, "height": 576},
                            {"name": "16:9", "width": 1072, "height": 608},
                            {"name": "16:9", "width": 1184, "height": 672},
                            {"name": "16:9", "width": 1264, "height": 720}
                        ]
                    }
                ]
                self._write_json_file(self.models_path, default_models)
                return default_models

            stored_models = self._read_json_file(self.models_path, [])
            normalized_models, errors = self._normalize_models_data(stored_models, strict=False)
            if not normalized_models:
                # Corrupted/invalid file fallback: reset to defaults for stability.
                default_models = [
                    {
                        "id": "sd15",
                        "name": "SD1.5",
                        "ratios": [
                            {"name": "1:1", "width": 512, "height": 512},
                            {"name": "2:3", "width": 512, "height": 768},
                            {"name": "3:2", "width": 768, "height": 512}
                        ]
                    },
                    {
                        "id": "sdxl",
                        "name": "SDXL",
                        "ratios": [
                            {"name": "1:1", "width": 1024, "height": 1024},
                            {"name": "2:3", "width": 832, "height": 1216},
                            {"name": "3:2", "width": 1216, "height": 832},
                            {"name": "16:9", "width": 1344, "height": 768},
                            {"name": "9:16", "width": 768, "height": 1344},
                            {"name": "9:21", "width": 640, "height": 1536},
                            {"name": "21:9", "width": 1536, "height": 640}
                        ]
                    },
                    {
                        "id": "flux",
                        "name": "FLUX",
                        "ratios": [
                            {"name": "1:1", "width": 1448, "height": 1448},
                            {"name": "2:3", "width": 1152, "height": 1728},
                            {"name": "3:2", "width": 1728, "height": 1152},
                            {"name": "16:9", "width": 1920, "height": 1088},
                            {"name": "9:16", "width": 1088, "height": 1920},
                            {"name": "9:21", "width": 960, "height": 2176},
                            {"name": "21:9", "width": 2176, "height": 960}
                        ]
                    },
                    {
                        "id": "qwen",
                        "name": "QwenImage",
                        "ratios": [
                            {"name": "1:1", "width": 1328, "height": 1328},
                            {"name": "2:3", "width": 1056, "height": 1584},
                            {"name": "3:2", "width": 1584, "height": 1056},
                            {"name": "16:9", "width": 1664, "height": 928},
                            {"name": "9:16", "width": 928, "height": 1664}
                        ]
                    },
                    {
                        "id": "zimage",
                        "name": "Zimage",
                        "ratios": [
                            {"name": "1:1", "width": 1440, "height": 1440},
                            {"name": "1:1", "width": 1024, "height": 1024},
                            {"name": "2:3", "width": 1088, "height": 1600},
                            {"name": "3:2", "width": 1600, "height": 1088},
                            {"name": "16:9", "width": 1920, "height": 1088},
                            {"name": "9:16", "width": 1088, "height": 1920}
                        ]
                    },
                    {
                        "id": "wan",
                        "name": "WAN",
                        "ratios": [
                            {"name": "1:1", "width": 624, "height": 624},
                            {"name": "2:3", "width": 384, "height": 576},
                            {"name": "2:3", "width": 528, "height": 768},
                            {"name": "2:3", "width": 624, "height": 912},
                            {"name": "2:3", "width": 656, "height": 960},
                            {"name": "2:3", "width": 736, "height": 1072},
                            {"name": "2:3", "width": 784, "height": 1136},
                            {"name": "3:2", "width": 752, "height": 512},
                            {"name": "3:4", "width": 416, "height": 544},
                            {"name": "3:4", "width": 560, "height": 720},
                            {"name": "3:4", "width": 672, "height": 864},
                            {"name": "3:4", "width": 720, "height": 912},
                            {"name": "3:4", "width": 784, "height": 1008},
                            {"name": "3:4", "width": 848, "height": 1088},
                            {"name": "9:16", "width": 368, "height": 624},
                            {"name": "9:16", "width": 480, "height": 848},
                            {"name": "9:16", "width": 576, "height": 1008},
                            {"name": "9:16", "width": 608, "height": 1072},
                            {"name": "9:16", "width": 672, "height": 1184},
                            {"name": "9:16", "width": 720, "height": 1264},
                            {"name": "16:9", "width": 1280, "height": 720},
                            {"name": "16:9", "width": 624, "height": 368},
                            {"name": "16:9", "width": 848, "height": 480},
                            {"name": "16:9", "width": 1008, "height": 576},
                            {"name": "16:9", "width": 1072, "height": 608},
                            {"name": "16:9", "width": 1184, "height": 672},
                            {"name": "16:9", "width": 1264, "height": 720}
                        ]
                    }
                ]
                self._write_json_file(self.models_path, default_models)
                return default_models

            if errors:
                self._write_json_file(self.models_path, normalized_models)
            return normalized_models
        except Exception as e:
            print(f"Error reading models: {e}")
            return []

    def save_models(self, models_data):
        try:
            normalized_models, errors = self._normalize_models_data(models_data, strict=True)
            if errors:
                return {"status": "error", "message": errors[0]}
            self._write_json_file(self.models_path, normalized_models)
            return {"status": "success"}
        except Exception as e:
            print(f"Error saving models: {e}")
            return {"status": "error", "message": str(e)}

    def get_settings(self):
        try:
            settings = self._read_json_file(self.settings_path, {})
            if not isinstance(settings, dict):
                settings = {}
            return {**self.default_settings, **settings}
        except Exception as e:
            print(f"Error reading settings: {e}")
            return dict(self.default_settings)

    def save_settings(self, settings_data):
        try:
            incoming = settings_data if isinstance(settings_data, dict) else {}
            current = self.get_settings()
            merged = {**self.default_settings, **current, **incoming}
            merged["clear_history_on_startup"] = bool(merged.get("clear_history_on_startup", False))
            self._write_json_file(self.settings_path, merged)
            return {"status": "success", "settings": merged}
        except Exception as e:
            print(f"Error saving settings: {e}")
            return {"status": "error", "message": str(e)}

