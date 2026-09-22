from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .errors import BadRequestError, ForbiddenError, NoRoomFound
from .routes import router as rooms_router
from .ws import router as ws_router

app = FastAPI(title="LiveWatch API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms_router)
app.include_router(ws_router)


def _error_body(status_code: int, reason: str, message: str, path: str) -> dict:
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": status_code,
        "error": reason,
        "message": message,
        "path": path,
    }


@app.exception_handler(NoRoomFound)
async def not_found_handler(request: Request, exc: NoRoomFound) -> JSONResponse:
    return JSONResponse(status_code=404, content=_error_body(404, "Not Found", str(exc), str(request.url.path)))


@app.exception_handler(ForbiddenError)
async def forbidden_handler(request: Request, exc: ForbiddenError) -> JSONResponse:
    return JSONResponse(status_code=403, content=_error_body(403, "Forbidden", str(exc), str(request.url.path)))


@app.exception_handler(BadRequestError)
async def bad_request_handler(request: Request, exc: BadRequestError) -> JSONResponse:
    return JSONResponse(status_code=400, content=_error_body(400, "Bad Request", str(exc), str(request.url.path)))


# triggered by a blank username, a too-long username, a malformed body, etc.
@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    message = ", ".join(
        f"{'.'.join(str(p) for p in err['loc'] if p != 'body')} {err['msg']}" for err in exc.errors()
    )
    return JSONResponse(status_code=400, content=_error_body(400, "Bad Request", message, str(request.url.path)))


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, exc: Exception) -> JSONResponse:
    print(f"Unhandled error on {request.url.path}: {exc!r}")
    return JSONResponse(
        status_code=500,
        content=_error_body(500, "Internal Server Error", "Something went wrong on the server", str(request.url.path)),
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
