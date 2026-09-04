const CLASS_PRIORITY = {
    LoadImageFromPath: 0,
    LoadImage: 1,
};

const INPUT_KEY_PRIORITY = ["image", "image_path", "path", "file_path", "filename"];

export function resolvePresetPreviewUrl(previewUrl, extensionUrl) {
    const value = String(previewUrl ?? "").trim();
    const localAsset = value.match(/^\/?extensions\/tk_comfyui_tool(?:design)?\/assets\/(.+)$/);
    if (!localAsset) return value;

    const resolved = new URL(`./assets/${localAsset[1]}`, extensionUrl);
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

function isNumericNodeId(value) {
    return /^\d+$/.test(String(value));
}

function compareNodeIds(a, b) {
    const aStr = String(a);
    const bStr = String(b);

    const aNumeric = isNumericNodeId(aStr);
    const bNumeric = isNumericNodeId(bStr);
    if (aNumeric && bNumeric) return Number(aStr) - Number(bStr);
    if (aNumeric) return -1;
    if (bNumeric) return 1;
    return aStr.localeCompare(bStr);
}

function pickInputName(inputs) {
    if (!inputs || typeof inputs !== "object") return null;

    for (const key of INPUT_KEY_PRIORITY) {
        if (Object.prototype.hasOwnProperty.call(inputs, key) && !Array.isArray(inputs[key])) {
            return key;
        }
    }

    return null;
}

export function findImageInputTargets(workflow) {
    if (!workflow || typeof workflow !== "object") return [];

    const targets = [];
    for (const [nodeId, nodeData] of Object.entries(workflow)) {
        if (!nodeData || !nodeData.inputs) continue;
        if (!Object.prototype.hasOwnProperty.call(CLASS_PRIORITY, nodeData.class_type)) continue;

        const inputName = pickInputName(nodeData.inputs);
        if (!inputName) continue;

        targets.push({
            nodeId: String(nodeId),
            nodeClass: nodeData.class_type,
            inputName,
        });
    }

    targets.sort((a, b) => {
        const classDelta = CLASS_PRIORITY[a.nodeClass] - CLASS_PRIORITY[b.nodeClass];
        if (classDelta !== 0) return classDelta;
        return compareNodeIds(a.nodeId, b.nodeId);
    });

    return targets;
}

export function pickPrimaryImageInputTarget(workflow) {
    const targets = findImageInputTargets(workflow);
    return targets.length > 0 ? targets[0] : null;
}

export function isVideoOutput(file) {
    return !!file && (/^video\//i.test(String(file.format || "")) || /\.(mp4|webm|m4v|mov|mkv|avi|ogv)$/i.test(String(file.filename || "")));
}

function extractFirstOutputFile(historyEntry, video) {
    if (!historyEntry || !historyEntry.outputs || typeof historyEntry.outputs !== "object") return null;

    const outputNodeIds = Object.keys(historyEntry.outputs).sort(compareNodeIds);
    for (const nodeId of outputNodeIds) {
        const nodeOutput = historyEntry.outputs[nodeId];
        if (!nodeOutput || typeof nodeOutput !== "object") continue;
        for (const key of video ? ["videos", "gifs", "images"] : ["images", "gifs"]) {
            if (!Array.isArray(nodeOutput[key])) continue;
            for (const file of nodeOutput[key]) {
                if (!file || !file.filename || isVideoOutput(file) !== video) continue;
                return {
                    filename: file.filename,
                    subfolder: file.subfolder || "",
                    type: file.type || "output",
                    sourceNodeId: String(nodeId),
                };
            }
        }
    }

    return null;
}

export function extractFirstOutputImage(historyEntry) {
    return extractFirstOutputFile(historyEntry, false);
}

export function extractFirstOutputVideo(historyEntry) {
    return extractFirstOutputFile(historyEntry, true);
}

export function findCyclePath(graph) {
    if (!graph || typeof graph !== "object") return null;

    const nodes = Object.keys(graph);
    const visiting = new Set();
    const visited = new Set();
    const stack = [];
    let cyclePath = null;

    const dfs = (node) => {
        visiting.add(node);
        stack.push(node);

        const rawNext = Array.isArray(graph[node]) ? graph[node] : [];
        const nextNodes = rawNext.map((next) => String(next));
        for (const next of nextNodes) {
            if (!Object.prototype.hasOwnProperty.call(graph, next)) continue;

            if (!visited.has(next) && !visiting.has(next)) {
                if (dfs(next)) return true;
                continue;
            }

            if (visiting.has(next)) {
                const startIdx = stack.indexOf(next);
                cyclePath = stack.slice(startIdx).concat(next);
                return true;
            }
        }

        stack.pop();
        visiting.delete(node);
        visited.add(node);
        return false;
    };

    const sortedNodes = [...nodes].sort(compareNodeIds);
    for (const node of sortedNodes) {
        if (visited.has(node)) continue;
        if (dfs(node)) return cyclePath;
    }

    return null;
}
