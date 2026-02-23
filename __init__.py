import os
import shutil
import folder_paths
from aiohttp import web
from server import PromptServer
from .tack_server import TackServer
from .nodes import TackTestNode

WEB_DIRECTORY = "web"
NODE_CLASS_MAPPINGS = {
    "TackTestNode": TackTestNode
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "TackTestNode": "🍌 Toolkit Test Node"
}

# Initialize Backend Server Logic
server_util = TackServer()

@PromptServer.instance.routes.get("/tk/presets")
async def get_presets(request):
    return web.json_response(server_util.get_presets())

@PromptServer.instance.routes.post("/tk/save_preset")
async def save_preset(request):
    data = await request.json()
    return web.json_response(server_util.save_preset(data))

@PromptServer.instance.routes.post("/tk/delete_preset")
async def delete_preset(request):
    data = await request.json()
    return web.json_response(server_util.delete_preset(data.get("id")))

@PromptServer.instance.routes.get("/tk/workflows")
async def get_workflows(request):
    return web.json_response(server_util.get_workflows())

@PromptServer.instance.routes.post("/tk/upload_workflow")
async def upload_workflow(request):
    data = await request.json()
    return web.json_response(server_util.save_workflow(data))

@PromptServer.instance.routes.post("/tk/upload_image")
async def upload_image(request):
    try:
        reader = await request.multipart()
        field = await reader.next()
        filename = field.filename
        content = await field.read()
        return web.json_response(server_util.save_image(content, filename))
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)})

@PromptServer.instance.routes.get("/tk/history")
async def get_history(request):
    return web.json_response(server_util.get_history())

@PromptServer.instance.routes.post("/tk/save_history")
async def save_history(request):
    data = await request.json()
    return web.json_response(server_util.save_history(data))

@PromptServer.instance.routes.get("/tk/settings")
async def get_settings(request):
    return web.json_response(server_util.get_settings())

@PromptServer.instance.routes.post("/tk/save_settings")
async def save_settings(request):
    data = await request.json()
    return web.json_response(server_util.save_settings(data))

@PromptServer.instance.routes.post("/tk/upload_input_image")
async def upload_input_image(request):
    """Upload image to local image_upload folder for LoadImage nodes."""
    try:
        reader = await request.multipart()
        field = await reader.next()
        filename = field.filename
        content = await field.read()
        return web.json_response(server_util.save_input_image(content, filename))
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)})

@PromptServer.instance.routes.get("/tk/view_upload/{filename}")
async def view_upload(request):
    """Serve uploaded images from image_upload folder."""
    import mimetypes
    filename = request.match_info['filename']
    file_path = server_util.get_upload_image_path(filename)

    if file_path is None:
        return web.Response(status=400, text="Invalid filename")
    
    if not os.path.exists(file_path):
        return web.Response(status=404, text="File not found")
    
    mime_type, _ = mimetypes.guess_type(file_path)
    if mime_type is None:
        mime_type = 'application/octet-stream'
    
    with open(file_path, 'rb') as f:
        content = f.read()
    
    return web.Response(body=content, content_type=mime_type)

@PromptServer.instance.routes.get("/tk/debug/input_files")
async def debug_input_files(request):
    """Debug endpoint to see what ComfyUI sees in input folder."""
    import folder_paths
    try:
        input_dir = folder_paths.get_input_directory()
        files = os.listdir(input_dir)
        return web.json_response({"status": "success", "input_dir": input_dir, "files": files})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)})

@PromptServer.instance.routes.get("/tk/models")
async def get_models(request):
    return web.json_response(server_util.get_models())

@PromptServer.instance.routes.post("/tk/save_models")
async def save_models(request):
    data = await request.json()
    return web.json_response(server_util.save_models(data))

print("🍌 ComfyUI Toolkit Node: Loaded")
