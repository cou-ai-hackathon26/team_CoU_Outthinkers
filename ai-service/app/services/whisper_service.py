import tempfile
from pathlib import Path

import av
import torch
from faster_whisper.audio import decode_audio
from fastapi import HTTPException, Request, UploadFile

# Faster-Whisper versions may pass this removed PyAV argument.
_original_av_open = av.open


def _compatible_av_open(*args, **kwargs):
    kwargs.pop("metadata_errors", None)
    return _original_av_open(*args, **kwargs)


av.open = _compatible_av_open


async def transcribe_upload(request: Request, file: UploadFile) -> dict:
    processor = getattr(request.app.state, "processor", None)
    asr_model = getattr(request.app.state, "asr_model", None)
    if processor is None or asr_model is None:
        raise HTTPException(status_code=503, detail="Whisper model is not initialized")
    if not file.content_type or not (file.content_type.startswith("audio/") or file.content_type == "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Unsupported audio file")
    audio = await file.read()
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file exceeds 10 MB")
    if not audio:
        raise HTTPException(status_code=400, detail="Empty audio file")

    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as temp:
            temp.write(audio)
            temp.flush()
            temp_path = temp.name
        waveform = decode_audio(temp_path, sampling_rate=16000)
        inputs = processor(waveform, sampling_rate=16000, return_tensors="pt")
        with torch.inference_mode():
            predicted_ids = asr_model.generate(inputs["input_features"], num_beams=1, do_sample=False, max_new_tokens=256)
        transcript = processor.batch_decode(predicted_ids, skip_special_tokens=True)[0].strip()
        return {"transcript": transcript, "language": "bn", "language_probability": 1.0}
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Transcription error: {exc}")
        raise HTTPException(status_code=500, detail="Transcription failed") from exc
    finally:
        if temp_path:
            Path(temp_path).unlink(missing_ok=True)
        await file.close()
