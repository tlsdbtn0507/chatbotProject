from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Dict

STEMS = ["갑", "을", "병", "정", "무", "기", "경", "신", "임", "계"]
BRANCHES = ["자", "축", "인", "묘", "진", "사", "오", "미", "신", "유", "술", "해"]

STEM_ELEMENTS = {
    "갑": "목",
    "을": "목",
    "병": "화",
    "정": "화",
    "무": "토",
    "기": "토",
    "경": "금",
    "신": "금",
    "임": "수",
    "계": "수",
}

BRANCH_ELEMENTS = {
    "자": "수",
    "축": "토",
    "인": "목",
    "묘": "목",
    "진": "토",
    "사": "화",
    "오": "화",
    "미": "토",
    "신": "금",
    "유": "금",
    "술": "토",
    "해": "수",
}

ELEMENT_KEYS = ["목", "화", "토", "금", "수"]


def _parse_birth_iso(birth_iso: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(birth_iso)
    except ValueError as exc:
        raise ValueError("birth_iso는 ISO 8601 형식이어야 합니다.") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _seed_bytes(parsed: datetime, location: str) -> bytes:
    key = f"{parsed.isoformat()}|{location.strip()}".encode("utf-8")
    return hashlib.sha256(key).digest()


def _build_pillar_indices(seed: bytes, parsed: datetime) -> Dict[str, Dict[str, int]]:
    return {
        "year": {
            "stem": (seed[0] + parsed.year) % len(STEMS),
            "branch": (seed[1] + parsed.year // 10) % len(BRANCHES),
        },
        "month": {
            "stem": (seed[2] + parsed.month + parsed.year) % len(STEMS),
            "branch": (seed[3] + parsed.month * 2) % len(BRANCHES),
        },
        "day": {
            "stem": (seed[4] + parsed.timetuple().tm_yday) % len(STEMS),
            "branch": (seed[5] + parsed.day * 3) % len(BRANCHES),
        },
        "hour": {
            "stem": (seed[6] + parsed.hour * 5 + parsed.minute) % len(STEMS),
            "branch": (seed[7] + parsed.hour * 2) % len(BRANCHES),
        },
    }


def _build_notes(element_counts: Dict[str, int]) -> str:
    counts = list(element_counts.items())
    counts.sort(key=lambda item: item[1], reverse=True)
    highest_value = counts[0][1]
    lowest_value = counts[-1][1]

    if highest_value == lowest_value:
        return "오행 균형이 비교적 고른 편입니다."

    dominant_elements = [element for element, value in counts if value == highest_value]
    lacking_elements = [element for element, value in counts if value == lowest_value]

    dominant_text = "·".join(dominant_elements)
    lacking_text = "·".join(lacking_elements)

    if lowest_value == 0:
        return f"{dominant_text} 기운이 두드러지며, {lacking_text} 기운 보완이 필요합니다."

    return f"{dominant_text} 기운이 상대적으로 두드러집니다."


def calc_bazi(birth_iso: str, location: str) -> Dict[str, object]:
    if not birth_iso:
        raise ValueError("birth_iso가 누락되었습니다.")
    if not location or not location.strip():
        raise ValueError("location이 누락되었습니다.")

    parsed = _parse_birth_iso(birth_iso)
    seed = _seed_bytes(parsed, location)
    indices = _build_pillar_indices(seed, parsed)

    element_counts: Dict[str, int] = {key: 0 for key in ELEMENT_KEYS}

    pillars = {}
    for key in ("year", "month", "day", "hour"):
        stem = STEMS[indices[key]["stem"]]
        branch = BRANCHES[indices[key]["branch"]]
        pillars[f"{key}_pillar"] = f"{stem}{branch}"
        element_counts[STEM_ELEMENTS[stem]] += 1
        element_counts[BRANCH_ELEMENTS[branch]] += 1

    day_stem = STEMS[indices["day"]["stem"]]
    day_master = f"{day_stem}{STEM_ELEMENTS[day_stem]}"

    notes = _build_notes(element_counts)

    return {
        "year_pillar": pillars["year_pillar"],
        "month_pillar": pillars["month_pillar"],
        "day_pillar": pillars["day_pillar"],
        "hour_pillar": pillars["hour_pillar"],
        "day_master": day_master,
        "five_elements": element_counts,
        "notes": notes,
    }
