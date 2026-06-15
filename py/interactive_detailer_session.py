"""
Session manager for the vsLinx Interactive Detailer node.

ComfyUI executes prompts on a worker thread, so a node is allowed to block.
The flow is:

  1. The node calls request_prompts(payload, timeout). A session is created,
     the payload (segment previews etc.) is pushed to the frontend via a
     custom websocket event, and the worker thread blocks on an Event.
  2. The frontend shows a dialog and POSTs the per-segment prompts back to
     /vslinx/interactive_detailer/submit, which resolves the session and
     wakes the worker thread.
  3. While waiting, the interrupt flag is polled so the user can still press
     "Cancel" in the queue without the server hanging forever. A timeout
     covers headless/API runs where no browser is connected.

Only one session can be pending at a time, which matches ComfyUI's serial
execution model (a second Interactive Detailer node in the same workflow
simply starts its own session once the first one finished).
"""

from __future__ import annotations

import threading
import uuid

from aiohttp import web
from server import PromptServer

EVENT_NAME = "vslinx-interactive-detailer"
EVENT_NAME_CLOSE = "vslinx-interactive-detailer-close"


class _Session:
    __slots__ = ("id", "event", "prompts", "cancelled", "payload")

    def __init__(self, payload: dict):
        self.id = uuid.uuid4().hex
        self.event = threading.Event()
        self.prompts = None
        self.cancelled = False
        self.payload = payload


class _SessionManager:
    def __init__(self):
        self._lock = threading.Lock()
        self._current: _Session | None = None

    # ---- called from the execution (worker) thread ----

    def request_prompts(self, payload: dict, timeout_sec: int):
        """
        Blocks until the frontend answers, the prompt is interrupted, or the
        timeout elapses.

        Returns ("ok", [prompt, ...]) or ("timeout", None).
        Raises InterruptProcessingException if the run was cancelled (either
        from the dialog's "Cancel run" button or ComfyUI's queue).
        """
        import comfy.model_management as mm

        with self._lock:
            # Drop any stale session (e.g. browser never answered last run).
            if self._current is not None:
                self._current.event.set()
            session = _Session(payload)
            session.payload["session_id"] = session.id
            self._current = session

        PromptServer.instance.send_sync(EVENT_NAME, session.payload)

        poll = 0.25
        waited = 0.0
        try:
            while not session.event.wait(timeout=poll):
                # Re-raises if the user pressed Cancel in the ComfyUI queue.
                mm.throw_exception_if_processing_interrupted()
                if timeout_sec > 0:
                    waited += poll
                    if waited >= timeout_sec:
                        PromptServer.instance.send_sync(
                            EVENT_NAME_CLOSE, {"session_id": session.id}
                        )
                        return "timeout", None
        finally:
            with self._lock:
                if self._current is session:
                    # Session is finished either way once we leave the wait.
                    self._current = None

        if session.cancelled:
            raise mm.InterruptProcessingException()

        prompts = session.prompts if isinstance(session.prompts, list) else []
        return "ok", [p if isinstance(p, str) else "" for p in prompts]

    # ---- called from the aiohttp (server) thread ----

    def resolve(self, session_id: str, prompts, cancelled: bool) -> bool:
        with self._lock:
            session = self._current
            if session is None or session.id != session_id:
                return False
            session.prompts = prompts
            session.cancelled = bool(cancelled)
            session.event.set()
            return True

    def get_pending(self) -> dict | None:
        with self._lock:
            session = self._current
            if session is not None and not session.event.is_set():
                return session.payload
            return None


MANAGER = _SessionManager()

# ----------------------------- API routes -----------------------------

routes = PromptServer.instance.routes


@routes.post("/vslinx/interactive_detailer/submit")
async def _submit(request):
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "invalid json"}, status=400)

    ok = MANAGER.resolve(
        str(data.get("session_id", "")),
        data.get("prompts", []),
        bool(data.get("cancelled", False)),
    )
    return web.json_response({"ok": ok})


@routes.get("/vslinx/interactive_detailer/pending")
async def _pending(request):
    return web.json_response({"pending": MANAGER.get_pending()})
