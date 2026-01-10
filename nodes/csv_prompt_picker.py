import os
import io
import csv
import time
import random
import hashlib
from typing import Dict, List, Tuple, Optional, Any

import folder_paths
from aiohttp import web
from server import PromptServer


class AnyType(str):
    def __eq__(self, other) -> bool:
        return True

    def __ne__(self, other) -> bool:
        return False


any_type = AnyType("*")


class FlexibleOptionalInputType(dict):
    def __init__(self, type=any_type, data=None):
        super().__init__(data or {})
        self._default_type = type

    def __contains__(self, item):
        return True

    def __getitem__(self, item):
        if dict.__contains__(self, item):
            return dict.__getitem__(self, item)
        return (self._default_type,)


PROMPTFILES_SUBDIR = "csv"
_ALLOWED_EXTS = (".csv",)
_CACHE: Dict[str, Dict[str, object]] = {}


def get_promptfiles_dir() -> str:
    d = os.path.join(folder_paths.get_input_directory(), PROMPTFILES_SUBDIR)
    os.makedirs(d, exist_ok=True)
    return d


def sanitize_prompt_filename(name: str) -> str:
    name = os.path.basename((name or "").replace("\\", "/"))
    name = name.strip()
    low = name.lower()
    if not low.endswith(_ALLOWED_EXTS):
        raise ValueError("Only .csv files are allowed")
    name = "".join(ch for ch in name if ch.isprintable())
    if not name:
        raise ValueError("Invalid filename")
    return name


def sanitize_prompt_relpath(rel: str) -> str:
    rel = (rel or "").replace("\\", "/").strip()
    rel = "".join(ch for ch in rel if ch.isprintable())
    if not rel:
        raise ValueError("Invalid filename")

    if rel.startswith("/") or rel.startswith("\\"):
        raise ValueError("Invalid filename")

    head = rel.split("/")[0]
    if ":" in head:
        raise ValueError("Invalid filename")

    norm = os.path.normpath(rel).replace("\\", "/")
    if norm in (".", ""):
        raise ValueError("Invalid filename")

    parts = [p for p in norm.split("/") if p not in ("", ".")]
    if any(p == ".." for p in parts):
        raise ValueError("Invalid filename")

    cleaned = "/".join(parts).strip()
    low = cleaned.lower()
    if not low.endswith(_ALLOWED_EXTS):
        raise ValueError("Only .csv files are allowed")

    if not cleaned:
        raise ValueError("Invalid filename")

    return cleaned


def try_decode_bytes(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "gb18030", "gbk"):
        try:
            return data.decode(enc)
        except Exception:
            pass
    return data.decode("utf-8", errors="replace")


def parse_csv_labels_map(path: str) -> Tuple[List[str], Dict[str, str]]:
    with open(path, "rb") as f:
        raw = f.read()

    text = try_decode_bytes(raw)
    sio = io.StringIO(text)

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=[",", ";", "\t", "|"])
    except Exception:
        dialect = csv.excel

    reader = csv.reader(sio, dialect)
    labels: List[str] = []
    mapping: Dict[str, str] = {}

    for row in reader:
        # --- 修改这里：允许只有1列的行 ---
        if not row or not str(row[0]).strip():
            continue
        
        label = str(row[0]).strip()
        
        # 如果有第二列则取第二列，否则取第一列内容作为输出
        if len(row) >= 2:
            out = str(row[1]).strip()
        else:
            out = label
            
        if label not in mapping:
            labels.append(label)
        mapping[label] = out

    return labels, mapping


def parse_promptfile_labels_map(path: str) -> Tuple[List[str], Dict[str, str]]:
    low = path.lower()
    if low.endswith(".csv"):
        return parse_csv_labels_map(path)
    raise ValueError("Unsupported file type")


def get_cached_promptfile(filename: str) -> Tuple[List[str], Dict[str, str]]:
    folder = get_promptfiles_dir()
    path = os.path.join(folder, filename)

    st = os.stat(path)
    mtime = st.st_mtime

    cached = _CACHE.get(filename)
    if cached and cached.get("mtime") == mtime:
        return cached["labels"], cached["map"]

    labels, mapping = parse_promptfile_labels_map(path)
    _CACHE[filename] = {"mtime": mtime, "labels": labels, "map": mapping}
    return labels, mapping


def sha256_bytes(data: bytes) -> str:
    h = hashlib.sha256()
    h.update(data)
    return h.hexdigest()


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def invalidate_file_caches(filename: str):
    _CACHE.pop(filename, None)


def find_existing_filename_by_hash(content_hash: str) -> Optional[str]:
    folder = get_promptfiles_dir()
    try:
        # Change: Use os.walk to search recursively in subdirectories
        for root, _, filenames in os.walk(folder):
            for fn in filenames:
                low = fn.lower()
                if not low.endswith(_ALLOWED_EXTS):
                    continue
                full = os.path.join(root, fn)
                
                # Verify file exists
                if not os.path.isfile(full):
                    continue
                    
                try:
                    if sha256_file(full) == content_hash:
                        # Return path relative to the csv root folder, forcing forward slashes
                        rel_path = os.path.relpath(full, folder).replace("\\", "/")
                        return rel_path
                except Exception:
                    continue
    except Exception:
        pass
    return None


def suggest_copy_name(original_filename: str) -> str:
    folder = get_promptfiles_dir()
    base, ext = os.path.splitext(original_filename)
    n = 1
    while True:
        candidate = f"{base} ({n}){ext}"
        if not os.path.exists(os.path.join(folder, candidate)):
            return candidate
        n += 1

def ensure_unique_name(preferred_filename: str) -> str:
    folder = get_promptfiles_dir()
    preferred_path = os.path.join(folder, preferred_filename)
    if not os.path.exists(preferred_path):
        return preferred_filename
    return suggest_copy_name(preferred_filename)

@PromptServer.instance.routes.post("/vslinx/csv_prompt_upload")
async def vslinx_csv_prompt_upload(request: web.Request):
    reader = await request.multipart()

    mode = "auto"
    rename_to = None
    original_filename = None
    data = None

    async for part in reader:
        if part.name == "mode":
            mode = (await part.text()).strip() or "auto"
        elif part.name == "rename_to":
            rename_to = (await part.text()).strip() or None
        elif part.name == "file":
            try:
                original_filename = sanitize_prompt_filename(part.filename or "uploaded.csv")
            except Exception as e:
                return web.json_response({"error": str(e)}, status=400)

            try:
                data = await part.read(decode=False)
            except Exception as e:
                return web.json_response({"error": f"Failed to read upload: {e}"}, status=500)

    if original_filename is None or data is None:
        return web.json_response({"error": "Missing form field 'file'."}, status=400)

    folder = get_promptfiles_dir()
    content_hash = sha256_bytes(data)

    existing_same = find_existing_filename_by_hash(content_hash)
    if existing_same:
        return web.json_response({"filename": existing_same, "deduped": True})

    target_name = original_filename
    target_path = os.path.join(folder, target_name)

    def save_to(path: str):
        with open(path, "wb") as f:
            f.write(data)

    if mode == "auto":
        if not os.path.exists(target_path):
            try:
                save_to(target_path)
                invalidate_file_caches(target_name)
            except Exception as e:
                return web.json_response({"error": f"Failed to save file: {e}"}, status=500)
            return web.json_response({"filename": target_name, "deduped": False})

        try:
            if sha256_file(target_path) == content_hash:
                return web.json_response({"filename": target_name, "deduped": True})
        except Exception:
            pass

        return web.json_response(
            {"error": "NAME_CONFLICT", "filename": target_name, "suggested": suggest_copy_name(target_name)},
            status=409,
        )

    if mode == "overwrite":
        try:
            save_to(target_path)
            invalidate_file_caches(target_name)
        except Exception as e:
            return web.json_response({"error": f"Failed to overwrite file: {e}"}, status=500)
        return web.json_response({"filename": target_name, "deduped": False, "overwritten": True})

    if mode == "rename":
        final_name = target_name
        if rename_to:
            try:
                final_name = sanitize_prompt_filename(rename_to)
            except Exception:
                final_name = target_name

        final_name = ensure_unique_name(final_name)
        final_path = os.path.join(folder, final_name)

        try:
            save_to(final_path)
            invalidate_file_caches(final_name)
        except Exception as e:
            return web.json_response({"error": f"Failed to save file: {e}"}, status=500)

        return web.json_response({"filename": final_name, "deduped": False})

    return web.json_response({"error": f"Invalid mode '{mode}'"}, status=400)


@PromptServer.instance.routes.get("/vslinx/csv_prompt_read")
async def vslinx_csv_prompt_read(request: web.Request):
    filename = request.rel_url.query.get("filename", "")

    try:
        filename = sanitize_prompt_relpath(filename)
    except Exception as e:
        return web.json_response({"error": str(e)}, status=400)

    try:
        labels, mapping = get_cached_promptfile(filename)
        return web.json_response({"labels": labels, "map": mapping})
    except FileNotFoundError:
        return web.json_response({"error": "File not found."}, status=404)
    except Exception as e:
        return web.json_response({"error": f"Failed to parse file: {e}"}, status=500)


@PromptServer.instance.routes.get("/vslinx/csv_prompt_list")
async def vslinx_csv_prompt_list(request: web.Request):
    folder = get_promptfiles_dir()
    try:
        files = []
        for root, dirs, filenames in os.walk(folder):
            for fn in filenames:
                low = fn.lower()
                if not low.endswith(_ALLOWED_EXTS):
                    continue
                full = os.path.join(root, fn)
                if not os.path.isfile(full):
                    continue
                rel = os.path.relpath(full, folder).replace("\\", "/")
                if rel.startswith("./"):
                    rel = rel[2:]
                if rel:
                    files.append(rel)

        files.sort(key=lambda s: s.lower())
        return web.json_response({"files": files})
    except Exception as e:
        return web.json_response({"error": f"Failed to list files: {e}"}, status=500)


def _normalize_selected_keys(row: Dict[str, Any]) -> List[str]:
    key = row.get("key", None)
    keys = row.get("keys", None)

    selected: List[Any] = []

    if isinstance(keys, (list, tuple)) and len(keys) > 0:
        selected = list(keys)
    elif isinstance(key, (list, tuple)) and len(key) > 0:
        selected = list(key)
    elif isinstance(key, str):
        selected = [key]
    elif key is not None:
        selected = [str(key)]

    out: List[str] = []
    for k in selected:
        if k is None:
            continue
        s = str(k).strip()
        if not s or s == "(None)":
            continue
        out.append(s)
    return out


class VSLinx_MultiLangPromptPicker:
    CATEGORY = "vsLinx/utility"
    FUNCTION = "run"
    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("prompt", "selection_preview", "output_preview")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "Add comma?": ("BOOLEAN", {"default": True}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF, "display": "seed"}),
            },
            "optional": FlexibleOptionalInputType(
                type=any_type,
                data={
                    "pre_text": ("STRING", {"forceInput": True}),
                    "selection_preview": ("STRING", {"forceInput": True}),
                },
            ),
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        if kwargs.get("control_after_generate") == "randomize":
            return hash(time.time_ns())
        return None

    def run(self, **kwargs):
        add_comma_global = bool(kwargs.get("Add comma?", True))
        seed = int(kwargs.get("seed", 0))
        control_after_generate = kwargs.get("control_after_generate", "fixed")

        # 1. 获取输入（支持串流）
        pre_text = str(kwargs.get("pre_text", "") or "").strip()
        prev_selection_preview = str(kwargs.get("selection_preview", "") or "").strip()

        # 2. 随机种子处理
        if control_after_generate == "randomize":
            eff_seed = time.time_ns() & 0xFFFFFFFFFFFFFFFF
        elif control_after_generate == "increment":
            eff_seed = (seed + 1) & 0xFFFFFFFFFFFFFFFF
        elif control_after_generate == "decrement":
            eff_seed = (seed - 1) & 0xFFFFFFFFFFFFFFFF
        else:
            eff_seed = seed
        rng = random.Random(eff_seed)

        # 3. 标点定义
        punctuation_marks = (",", "，", ".", "。", "!", "！", "?", "？", ";", "；", ":", "：")

        # 4. 收集选中的项
        items = []
        for k, v in kwargs.items():
            if not (isinstance(k, str) and k.lower().startswith("csv_")):
                continue
            if not isinstance(v, dict):
                continue
            vtype = v.get("type")
            if vtype not in ("CsvRowWidget", "ExtraPromptWidget"):
                continue
            order = v.get("order", 0)
            try:
                order = int(order)
            except Exception:
                order = 0
            items.append((order, k, v))

        items.sort(key=lambda t: (t[0], t[1]))

        # 5. 分别提取两组片段：[提示词片段] 和 [标签片段]
        prompt_segments = []
        label_segments = []

        for _, _, v in items:
            vtype = v.get("type")
            if vtype == "CsvRowWidget":
                filename = v.get("file")
                if not filename: continue
                try:
                    filename = sanitize_prompt_relpath(filename)
                    labels, mapping = get_cached_promptfile(filename)
                except Exception: continue
                
                selected_keys = _normalize_selected_keys(v)
                for key in selected_keys:
                    actual_key = key
                    if key == "Random" and labels:
                        actual_key = rng.choice(labels)
                    
                    # 从 mapping 中获取，如果不存在则直接使用 key 本身
                    val = mapping.get(actual_key, "").strip()
                    if not val:
                        val = actual_key
                    
                    prompt_segments.append(val)
                    label_segments.append(actual_key)

            elif vtype == "ExtraPromptWidget":
                text = str(v.get("text", "")).strip()
                if text:
                    prompt_segments.append(text)
                    label_segments.append(text)

        # 6. 核心拼接函数（完全模拟提示词逻辑）
        def build_final_string(prefix, segments, add_comma):
            sep = ", " if add_comma else " "
            result = prefix
            
            for seg in segments:
                if not result:
                    result = seg
                    continue
                
                # 检查前文末尾和当前开头是否有标点
                last_char = result.rstrip()[-1:]
                current_is_punc = seg in punctuation_marks
                prev_has_punc = last_char in punctuation_marks
                
                if current_is_punc:
                    # 如果当前是标点，直接贴上去
                    result = result.rstrip() + seg
                elif prev_has_punc:
                    # 如果前文有标点，加个空格保持美观
                    result = result.rstrip() + " " + seg
                else:
                    # 都没有标点，按设置补连接符
                    result = result.rstrip() + sep + seg
            
            # 处理整体末尾逗号
            if add_comma and result:
                if not result.rstrip()[-1:] in punctuation_marks:
                    result = result.rstrip() + ","
            
            return result

        # 7. 生成两个完全相同逻辑的输出
        final_prompt = build_final_string(pre_text, prompt_segments, add_comma_global)
        final_labels = build_final_string(prev_selection_preview, label_segments, add_comma_global)

        # 8. 视觉预览（仅用于界面展示的辅助，保留换行以便观察）
        preview_list = []
        for i in range(len(label_segments)):
            l = label_segments[i]
            p = prompt_segments[i]
            if l == p:
                preview_list.append(f"🔹 {l}")
            else:
                preview_list.append(f"🏷️ {l} -> 💬 {p}")

        return (
            final_prompt,        # 输出1：提示词内容
            final_labels,        # 输出2：标签/中文内容 (格式与输出1完全一致)
            "\n".join(preview_list) if preview_list else "No selections" # 输出3：视觉参考
        )


NODE_CLASS_MAPPINGS = {
    "vsLinx_MultiLangPromptPicker": VSLinx_MultiLangPromptPicker,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "vsLinx_MultiLangPromptPicker": "Multi-Language CSV Prompt Picker",
}