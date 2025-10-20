from __future__ import annotations

import os
from pathlib import Path
from typing import List, Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import OpenAI
from pydantic import BaseModel, Field, validator

from app.services.saju_calc import calc_bazi

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "app" / "static"

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=500)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="OpenAI API 키가 설정되지 않았습니다. 환경 변수를 확인해 주세요.",
        )
    return OpenAI(api_key=api_key)


class SajuPMRequest(BaseModel):
    birth_iso: str = Field(..., description="ISO 8601 datetime string with timezone")
    location: str = Field(..., min_length=1)
    gender: Literal["M", "F", "N"]

    @validator("birth_iso")
    def validate_birth_iso(cls, value: str) -> str:
        if not value:
            raise ValueError("birth_iso는 필수입니다.")
        return value

    @validator("location")
    def validate_location(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("location은 공백일 수 없습니다.")
        return stripped


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str

    @validator("content")
    def validate_content(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("content는 공백일 수 없습니다.")
        return value


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gpt-4o-mini"
    temperature: float = Field(default=0.5, ge=0.0, le=2.0)

    @validator("messages")
    def validate_messages(cls, value: List[ChatMessage]) -> List[ChatMessage]:
        if not value:
            raise ValueError("messages는 비어 있을 수 없습니다.")
        return value


@app.get("/", response_class=FileResponse)
async def serve_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.post("/api/saju-pm")
async def saju_pm(payload: SajuPMRequest) -> dict:
    try:
        saju = calc_bazi(payload.birth_iso, payload.location)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    client = get_openai_client()

    system_prompt = (
        "중요: 사주는 엔터테인먼트(오락) 요소입니다. 절대로 진단이나 의학/법률/직업적 확정으로 단정하지 마세요. "
        "제공된 계산값 외 임의 추정은 금지되며, 사실로 단정하는 표현(예: '확실히', '반드시') 사용을 피하세요. "
        "다음 항목을 한국어 존댓말로 명확히 제시해 주세요: 강점 2가지(간단한 이유 포함), 보완점 1가지, 권장 행동 1줄, 추천 PM 직무(예: PO, PM, PMM) 1줄, 관련 스킬 키워드 3개. "
        "응답은 가능한 간결하게 작성하되 마지막 문장은 반드시 '나의 PM적합도에 참고해보세요.'로 끝내세요."
    )

    five_elements_lines = "\n".join(
        f"- {element}: {count}"
        for element, count in saju["five_elements"].items()
    )

    user_prompt = (
        "입력 정보:\n"
        f"- 생년월일시(ISO 8601): {payload.birth_iso}\n"
        f"- 출생지: {payload.location}\n"
        f"- 성별: {payload.gender}\n\n"

        "사주 계산 결과:\n"
        f"- 연주: {saju['year_pillar']}\n"
        f"- 월주: {saju['month_pillar']}\n"
        f"- 일주: {saju['day_pillar']}\n"
        f"- 시주: {saju['hour_pillar']}\n"
        f"- 일간: {saju['day_master']}\n"
        f"- 오행 분포:\n{five_elements_lines}\n"
        f"- 특기 사항: {saju['notes']}\n\n"
        "요청: 위 정보를 바탕으로 먼저 사주에 대한 간단한 분석과 설명을 한국어 존댓말로 제공해 주세요. "
        "그 다음 PM 역량 관점에서 아래 항목들을 한국어 존댓말로 순서대로 정리해 주세요: "
        "(1) 사주에 대한 결과를 분석하세요"
        "(2) 강점 2가지 - 각 항목에 간단한 이유 포함, "
        "(3) 보완해야 할 점 1가지, "
        "(4) 권장 행동 1줄, "
        "(5) 추천 PM 직무(예: PO, PM, PMM) 1줄, "
        "(6) 관련 스킬 키워드 3개. "
        "응답은 가능한 간결하게 작성하되 마지막 문장은 반드시 '나의 PM적합도에 참고해보세요.'로 끝내 주세요."
    )

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
    except Exception as exc:  # noqa: BLE001
        message = f"OpenAI API 호출에 실패했습니다: {exc}"
        raise HTTPException(status_code=500, detail=message) from exc

    reply = completion.choices[0].message.content.strip()

    # 후처리: 모델이 마지막 문장을 누락하거나 변경한 경우 강제 추가하여
    # 항상 '사주는 재미 요소입니다.'로 끝나도록 보장합니다.
    disclaimer = "사주는 재미 요소입니다."
    if not reply.endswith(disclaimer):
        # 이미 문장들이 있을 경우 줄바꿈 후 추가, 빈 응답이면 디스클레이머만 반환
        if reply:
            reply = reply.rstrip(" \n\t\r")
            # 만약 마지막 문장이 마침표 없이 끝난 경우 마침표 추가
            if not reply.endswith(".") and not reply.endswith("!") and not reply.endswith("?"):
                reply = reply + "."
            reply = f"{reply} {disclaimer}"
        else:
            reply = disclaimer

    return {"reply": reply}


@app.post("/api/chat")
async def chat(payload: ChatRequest) -> dict:
    client = get_openai_client()
    try:
        completion = client.chat.completions.create(
            model=payload.model,
            temperature=payload.temperature,
            messages=[message.model_dump() for message in payload.messages],
        )
    except Exception as exc:  # noqa: BLE001
        message = f"OpenAI API 호출에 실패했습니다: {exc}"
        raise HTTPException(status_code=500, detail=message) from exc

    reply = completion.choices[0].message.content.strip()
    return {"reply": reply}
