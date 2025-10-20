# FastAPI OpenAI Chat

사주 계산 더미 모듈과 OpenAI Chat API를 이용해 사주 기반 PM 역량 해석과 일반 대화를 한 번에 테스트할 수 있는 FastAPI 애플리케이션입니다.

## Requirements

- Python 3.10+
- OpenAI API 키 (`.env` 파일 또는 환경 변수)

## Setup

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`.env` 파일에 OpenAI API 키를 설정합니다.

```
OPENAI_API_KEY=sk-...
```

## Development

```bash
uvicorn main:app --reload --port 8000
```

브라우저에서 http://localhost:8000 을 열어 사주와 일반 챗 테스트를 진행할 수 있습니다.

## 주요 기능

- `app/services/saju_calc.py`  
  입력된 생년월일시와 위치를 기반으로 결정적인 사주 결과를 생성합니다.
- `POST /api/saju-pm`  
  사주 계산 결과를 바탕으로 OpenAI Chat API에서 PM 역량 해석을 받아옵니다.
- `POST /api/chat`  
  임의의 메시지 배열을 OpenAI Chat API에 전달하고 결과를 반환합니다.
- 정적 프런트엔드  
  `app/static` 폴더에서 단일 FastAPI 인스턴스로 HTML/JS/CSS 를 제공합니다.
