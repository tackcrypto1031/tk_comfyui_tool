import os
import json
import uuid

class TackServer:
    def __init__(self):
        self.base_dir = os.path.dirname(os.path.realpath(__file__))
        self.config_dir = os.path.join(self.base_dir, "config")
        self.presets_path = os.path.join(self.config_dir, "presets.json")
        self.workflows_dir = os.path.join(self.config_dir, "workflows")
        
        if not os.path.exists(self.config_dir):
            os.makedirs(self.config_dir)
        if not os.path.exists(self.workflows_dir):
            os.makedirs(self.workflows_dir)
        if not os.path.exists(self.presets_path):
            with open(self.presets_path, "w", encoding="utf-8") as f:
                json.dump([], f)
        
        self.history_path = os.path.join(self.config_dir, "history.json")
        self.history_path = os.path.join(self.config_dir, "history.json")
        # Always clear history on startup to match ComfyUI temp folder behavior
        with open(self.history_path, "w", encoding="utf-8") as f:
            json.dump([], f)

    def get_presets(self):
        try:
            with open(self.presets_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading presets: {e}")
            return []

    def save_preset(self, preset_data):
        try:
            presets = self.get_presets()
            # Check if update or new
            existing_idx = next((i for i, p in enumerate(presets) if p.get("id") == preset_data.get("id")), -1)
            
            if existing_idx >= 0:
                presets[existing_idx] = preset_data
            else:
                if "id" not in preset_data:
                    preset_data["id"] = str(uuid.uuid4())
                presets.append(preset_data)
                
            with open(self.presets_path, "w", encoding="utf-8") as f:
                json.dump(presets, f, indent=2, ensure_ascii=False)
            return {"status": "success", "id": preset_data["id"]}
        except Exception as e:
            print(f"Error saving preset: {e}")
            return {"status": "error", "message": str(e)}

    def delete_preset(self, preset_id):
        try:
            presets = self.get_presets()
            presets = [p for p in presets if p.get("id") != preset_id]
            with open(self.presets_path, "w", encoding="utf-8") as f:
                json.dump(presets, f, indent=2, ensure_ascii=False)
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
            filename = data.get("filename", f"workflow_{uuid.uuid4()}.json")
            content = data.get("content", {})
            
            file_path = os.path.join(self.workflows_dir, filename)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(content, f, indent=2, ensure_ascii=False)
            
            return {"status": "success", "filename": filename, "content": content}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def save_image(self, image_data, filename):
        try:
            assets_dir = os.path.join(self.base_dir, "web", "assets")
            if not os.path.exists(assets_dir):
                os.makedirs(assets_dir)
            
            file_path = os.path.join(assets_dir, filename)
            with open(file_path, "wb") as f:
                f.write(image_data)
                
            return {"status": "success", "url": f"extensions/tk_comfyui_tooldesign/assets/{filename}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def get_history(self):
        try:
            with open(self.history_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            return []

    def save_history(self, history_item):
        try:
            history = self.get_history()
            history.insert(0, history_item) # Add to beginning
            # Optional: Limit history size
            if len(history) > 100:
                history = history[:100]
                
            with open(self.history_path, "w", encoding="utf-8") as f:
                json.dump(history, f, indent=2, ensure_ascii=False)
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
            _, ext = os.path.splitext(original_filename)
            if not ext:
                ext = ".png"
            
            # Generate shorter random alphanumeric name (e.g. img_ + 10 chars + ext)
            random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
            safe_name = f"img_{random_str}{ext}"
            
            # Full path in custom upload directory
            file_path = os.path.join(upload_dir, safe_name)
            
            # Collision check
            if os.path.exists(file_path):
                random_str = ''.join(random.choices(string.ascii_lowercase + string.digits, k=10))
                safe_name = f"img_{random_str}{ext}"
                file_path = os.path.join(upload_dir, safe_name)
            
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

    def get_models(self):
        try:
            models_path = os.path.join(self.config_dir, "models.json")
            if not os.path.exists(models_path):
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
                with open(models_path, "w", encoding="utf-8") as f:
                    json.dump(default_models, f, indent=2, ensure_ascii=False)
                return default_models
            
            with open(models_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading models: {e}")
            return []

    def save_models(self, models_data):
        try:
            models_path = os.path.join(self.config_dir, "models.json")
            with open(models_path, "w", encoding="utf-8") as f:
                json.dump(models_data, f, indent=2, ensure_ascii=False)
            return {"status": "success"}
        except Exception as e:
            print(f"Error saving models: {e}")
            return {"status": "error", "message": str(e)}

