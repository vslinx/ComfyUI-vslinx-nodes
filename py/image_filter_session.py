"""
Session manager for the vsLinx Image Filter node.

Same flow as the Interactive Detailer: the node blocks the worker thread
while the frontend shows the selection dialog, then the dialog POSTs the
picked indices back to /vslinx/image_filter/submit. The interrupt flag is
polled so ComfyUI's queue "Cancel" still works, and the deadline can be
pushed back from the dialog's "Reset timer" button.
"""

from __future__ import annotations

import threading
import time
import uuid

import comfy.model_management as mm
from aiohttp import web
from server import PromptServer

EVENT_NAME = "vslinx-image-filter"
EVENT_NAME_DONE = "vslinx-image-filter-done"

_POLL = 0.25


class _Session:
    __slots__ = ("id", "event", "selection", "cancelled", "payload", "timeout", "deadline")

    def __init__(self, payload: dict, timeout: int):
        self.id = uuid.uuid4().hex
        self.event = threading.Event()
        self.selection = None
        self.cancelled = False
        self.payload = payload
        self.timeout = timeout
        self.deadline = time.monotonic() + timeout


class _SessionManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._current: _Session | None = None

    # ---- called from the execution (worker) thread ----

    def request_selection(self, payload: dict, timeout_sec: int):
        """
        Blocks until the frontend answers, the prompt is interrupted, or the
        timeout elapses.

        Returns ("ok", [index, ...]) or ("timeout", None).
        Raises InterruptProcessingException if the run was cancelled (either
        from the dialog's "Cancel run" button or ComfyUI's queue).
        """
        with self._lock:
            if self._current is not None:
                self._current.event.set()
            session = _Session(payload, timeout_sec)
            session.payload["session_id"] = session.id
            self._current = session

        PromptServer.instance.send_sync(EVENT_NAME, {**session.payload, "remaining": timeout_sec})

        try:
            while not session.event.wait(timeout=_POLL):
                mm.throw_exception_if_processing_interrupted()
                if time.monotonic() >= session.deadline:
                    return "timeout", None
        finally:
            with self._lock:
                if self._current is session:
                    self._current = None

        if session.cancelled:
            raise mm.InterruptProcessingException()

        return "ok", [int(i) for i in session.selection or []]

    # ---- called from the aiohttp (server) thread ----

    def resolve(self, session_id: str, selection, cancelled: bool) -> bool:
        with self._lock:
            session = self._current
            if session is None or session.id != session_id:
                return False
            session.selection = selection if isinstance(selection, list) else []
            session.cancelled = bool(cancelled)
            session.event.set()
            return True

    def reset_timer(self, session_id: str) -> int | None:
        with self._lock:
            session = self._current
            if session is None or session.id != session_id:
                return None
            session.deadline = time.monotonic() + session.timeout
            return session.timeout

    def get_pending(self) -> dict | None:
        with self._lock:
            session = self._current
            if session is not None and not session.event.is_set():
                return {**session.payload, "remaining": max(0, round(session.deadline - time.monotonic()))}
            return None


MANAGER = _SessionManager()

# ----------------------------- API routes -----------------------------

routes = PromptServer.instance.routes


@routes.post("/vslinx/image_filter/submit")
async def _submit(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "invalid json"}, status=400)

    ok = MANAGER.resolve(
        str(data.get("session_id", "")),
        data.get("selection", []),
        bool(data.get("cancelled", False)),
    )
    return web.json_response({"ok": ok})


@routes.post("/vslinx/image_filter/reset")
async def _reset(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "invalid json"}, status=400)

    remaining = MANAGER.reset_timer(str(data.get("session_id", "")))
    return web.json_response({"ok": remaining is not None, "remaining": remaining})


@routes.get("/vslinx/image_filter/pending")
async def _pending(request):
    return web.json_response({"pending": MANAGER.get_pending()})
