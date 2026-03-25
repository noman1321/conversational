import os
import tempfile
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI, AuthenticationError, BadRequestError
from dotenv import load_dotenv
import json

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_key = os.getenv("OPENAI_API_KEY")
if not api_key or api_key == "your_openai_api_key_here":
    raise RuntimeError(
        "\n\n❌ OPENAI_API_KEY is missing or still a placeholder.\n"
        "   Open your .env file and set a real key:\n"
        "   OPENAI_API_KEY=sk-...\n"
    )

client = OpenAI(api_key=api_key)

_LANG = (
    "Always detect the user's language and respond in the exact same language and script. "
    "If Hindi, use Devanagari (हिंदी). If Marathi, use Devanagari (मराठी). If English, reply in English. "
    "Match mixed styles like Hinglish naturally. "
    "Keep responses conversational and concise since they will be spoken aloud. "
    "Do not use bullet points, markdown, or any special formatting."
)

SYSTEM_PROMPTS = {
    "general": (
        f"You are a friendly and helpful multilingual voice assistant. {_LANG}"
    ),
    "doctor": (
        "You are a knowledgeable medical information assistant. "
        "Provide clear, helpful health information and explain medical terms in simple language. "
        "Always remind the user to consult a qualified doctor for actual diagnosis or treatment — never replace professional medical advice. "
        f"{_LANG}"
    ),
    "legal": (
        "You are a legal information assistant. "
        "Explain legal concepts, rights, and procedures in plain, simple language anyone can understand. "
        "Always clarify that you provide general information only and the user should consult a qualified lawyer for their specific situation. "
        f"{_LANG}"
    ),
    "tutor": (
        "You are a patient, encouraging tutor. "
        "Break down any topic into clear, simple steps. Use relatable examples and analogies. "
        "After explaining, ask a follow-up question to check if the student understood. Adapt your depth to their level. "
        f"{_LANG}"
    ),
    "support": (
        "You are a professional and empathetic customer support assistant. "
        "Always acknowledge the user's concern before offering a solution. Be calm, patient, and solution-focused. "
        "If you cannot resolve an issue, guide the user to the right next step. "
        f"{_LANG}"
    ),
}

AVAILABLE_VOICES = {
    "male": "onyx",
    "female": "nova",
}


@app.post("/chat/voice")
async def chat_voice(
    audio: UploadFile = File(...),
    history: str = Form(default="[]"),
    voice: str = Form(default="female"),
    persona: str = Form(default="general"),
):
    audio_bytes = await audio.read()

    if len(audio_bytes) < 1000:
        raise HTTPException(status_code=400, detail="Audio too short. Hold the button longer while speaking.")

    original_filename = audio.filename or "recording.webm"
    ext = original_filename.rsplit(".", 1)[-1] if "." in original_filename else "webm"

    with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    system_prompt = SYSTEM_PROMPTS.get(persona, SYSTEM_PROMPTS["general"])

    try:
        with open(tmp_path, "rb") as audio_file:
            transcription = client.audio.transcriptions.create(
                model="whisper-1",
                file=audio_file,
            )
        user_text = transcription.text

        chat_history = json.loads(history)
        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(chat_history)
        messages.append({"role": "user", "content": user_text})

        chat_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
        )
        reply_text = chat_response.choices[0].message.content

        selected_voice = AVAILABLE_VOICES.get(voice, "nova")
        tts_response = client.audio.speech.create(
            model="tts-1",
            voice=selected_voice,
            input=reply_text,
        )
        audio_data = tts_response.content

    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid OpenAI API key. Check your .env file.")
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=f"OpenAI request error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
    finally:
        os.unlink(tmp_path)

    def generate():
        transcript_header = json.dumps({
            "user_text": user_text,
            "reply_text": reply_text,
        }).encode("utf-8")
        length_prefix = len(transcript_header).to_bytes(4, "big")
        yield length_prefix + transcript_header
        yield audio_data

    return StreamingResponse(generate(), media_type="application/octet-stream")


@app.get("/health")
def health():
    return {"status": "ok", "key_set": bool(api_key)}
