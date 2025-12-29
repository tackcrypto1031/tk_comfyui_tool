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

print("🍌 ComfyUI Toolkit Node: Loaded")
