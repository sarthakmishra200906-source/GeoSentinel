from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile

app = FastAPI(title="Resq-AI ML Service", version="0.1.0")
MODEL_DIRECTORY = Path(__file__).parent / "model"


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "model": "not loaded"}


@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> dict[str, str]:
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="An image file is required")

    return {
        "filename": file.filename or "upload",
        "label": "unclassified",
        "message": "Model inference is not configured yet",
    }
