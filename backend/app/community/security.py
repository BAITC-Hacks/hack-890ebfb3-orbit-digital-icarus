"""Bound incoming write bodies before JSON parsing, including chunked requests."""

from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    def __init__(self, app, maximum: int = 512 * 1024):
        self.app, self.maximum = app, maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in {"GET", "HEAD", "OPTIONS"}:
            return await self.app(scope, receive, send)
        size, chunks = 0, []
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > self.maximum:
                return await JSONResponse({"detail": {"code": "request_too_large"}}, status_code=413,
                                          headers={"Cache-Control": "no-store"})(scope, receive, send)
            chunks.append(chunk)
            if not message.get("more_body", False):
                break
        replayed = False

        async def bounded_receive():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()

        await self.app(scope, bounded_receive, send)
