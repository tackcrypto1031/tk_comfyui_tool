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

