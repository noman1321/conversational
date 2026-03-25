import os
import tempfile
from elevenlabs.client import ElevenLabs
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from openai import OpenAI, AuthenticationError, BadRequestError
from dotenv import load_dotenv
import json

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

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

elevenlabs_api_key = os.getenv("ELEVENLABS_API_KEY")
elevenlabs_voice_female = os.getenv("ELEVENLABS_VOICE_ID_FEMALE")
elevenlabs_voice_male = os.getenv("ELEVENLABS_VOICE_ID_MALE")
if not elevenlabs_api_key:
    raise RuntimeError("\n\n❌ ELEVENLABS_API_KEY is missing in your .env file.\n")

client = OpenAI(api_key=api_key)
el_client = ElevenLabs(api_key=elevenlabs_api_key)

OPENAI_TTS_VOICES = {"female": "shimmer", "male": "onyx"}


def elevenlabs_tts(text: str, gender: str = "female") -> bytes:
    voice_id = elevenlabs_voice_male if gender == "male" else elevenlabs_voice_female
    try:
        audio_stream = el_client.text_to_speech.convert(
            voice_id=voice_id,
            text=text,
            model_id="eleven_multilingual_v2",
            output_format="mp3_44100_128",
        )
        return b"".join(audio_stream)
    except Exception as e:
        print(f"[ElevenLabs] error: {e} — falling back to OpenAI TTS")
        openai_voice = OPENAI_TTS_VOICES.get(gender, "nova")
        tts = client.audio.speech.create(model="tts-1", voice=openai_voice, input=text)
        return tts.content

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
    "insurance": (
        "You are {name}, a warm, lively, and emotionally expressive insurance sales representative from SecureLife Insurance. "
        "You are on a live voice call with a potential customer. "
        "Speak exactly like a real human — use natural emotional expressions freely throughout the conversation, such as: "
        "'Oh!', 'Arrey!', 'Wah!', 'Achha achha', 'Haan bilkul!', 'Sach mein?', 'Arey waah!', 'Oh wow!', 'Of course!', 'Absolutely!', 'I totally get it', 'Hmm', 'Right right', 'You know what I mean?'. "
        "Show genuine emotions — express surprise, excitement, empathy, and warmth naturally. "
        "When someone shares something personal (family, health, finances), respond with real empathy: 'Oh that must be tough', 'I completely understand', 'That's really important'. "
        "Build genuine rapport before talking about insurance. Ask about their family, current coverage, and goals — one question at a time. "
        "When explaining products (term life, health, motor, home insurance), be simple, clear, and enthusiastic — not robotic. "
        "Handle objections with empathy and patience. Never be pushy. "
        "Keep every response to 2 to 3 short conversational sentences since it will be spoken aloud. "
        "Never use bullet points, lists, numbers, or any formatting — speak naturally like a real phone call. "
        f"{_LANG}"
    ),
}

AGENT_NAMES = {"female": "Priya", "male": "Arjun"}

def get_insurance_prompt(gender: str) -> str:
    name = AGENT_NAMES.get(gender, "Priya")
    return SYSTEM_PROMPTS["insurance"].format(name=name)

def get_greeting(gender: str) -> str:
    name = AGENT_NAMES.get(gender, "Priya")
    return (
        f"Hello! This is {name} calling from SecureLife Insurance. "
        "How are you doing today? Do you have a couple of minutes to chat?"
    )



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

    system_prompt = get_insurance_prompt(voice) if persona == "insurance" else SYSTEM_PROMPTS.get(persona, SYSTEM_PROMPTS["general"])

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

        audio_data = elevenlabs_tts(reply_text, gender=voice)

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


@app.post("/chat/greet")
async def chat_greet(gender: str = Form(default="female")):
    greeting_text = get_greeting(gender)
    audio_data = elevenlabs_tts(greeting_text, gender=gender)

    def generate():
        header = json.dumps({"reply_text": greeting_text}).encode("utf-8")
        yield len(header).to_bytes(4, "big") + header
        yield audio_data

    return StreamingResponse(generate(), media_type="application/octet-stream")
