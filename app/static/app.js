const sajuForm = document.getElementById("sajuForm");
const sajuOutput = document.getElementById("sajuOut");
const sajuSubmit = document.getElementById("sajuSubmit");

const chatInput = document.getElementById("chatInput");
const chatOutput = document.getElementById("chatOut");
const chatSubmit = document.getElementById("chatSubmit");

function pad(value) {
  return String(value).padStart(2, "0");
}

function withOffsetIso(localValue) {
  if (!localValue) {
    return null;
  }
  const normalized =
    localValue.length === 16 ? `${localValue}:00` : localValue;
  const localDate = new Date(normalized);
  if (Number.isNaN(localDate.getTime())) {
    return null;
  }

  const offsetMinutes = localDate.getTimezoneOffset();
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);
  const hours = pad(Math.floor(absolute / 60));
  const minutes = pad(absolute % 60);
  const offset = `${sign}${hours}:${minutes}`;

  return `${normalized}${offset}`;
}

// 브라우저가 datetime-local을 지원하는지 간단히 감지합니다.
function supportsDatetimeLocal() {
  const input = document.createElement("input");
  input.setAttribute("type", "datetime-local");
  input.value = "";
  return input.type === "datetime-local";
}

// 폴백 UI 표시 처리
document.addEventListener("DOMContentLoaded", () => {
  const fallback = document.getElementById("birthFallback");
  if (!supportsDatetimeLocal() && fallback) {
    fallback.style.display = "block";
  }
});

async function postJSON(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const data = await response.json();
      if (data && data.detail) {
        detail = Array.isArray(data.detail)
          ? data.detail.map((item) => item.msg || item).join(", ")
          : data.detail;
      }
    } catch (error) {
      detail = response.statusText || "알 수 없는 오류";
    }
    throw new Error(detail);
  }

  return response.json();
}

function setLoading(button, isLoading, loadingText) {
  if (!button) {
    return;
  }
  if (isLoading) {
    button.disabled = true;
    button.dataset.defaultLabel = button.dataset.defaultLabel || button.textContent;
    button.textContent = loadingText;
  } else {
    button.disabled = false;
    const defaultLabel = button.dataset.defaultLabel;
    if (defaultLabel) {
      button.textContent = defaultLabel;
    }
  }
}

sajuForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const birthDateInput = document.getElementById("birthDate").value;
  const birthTimeInput = document.getElementById("birthTime").value;
  // 결합 로직: date + time. 시간 미입력 시 '00:00'으로 처리.
  if (!birthDateInput) {
    sajuOutput.textContent = "생년월일을 입력해 주세요 (YYYY-MM-DD).";
    return;
  }
  const timePart = birthTimeInput ? birthTimeInput : "00:00";
  const birthLocal = `${birthDateInput}T${timePart}`;
  const location = document.getElementById("location").value.trim();
  const gender = document.getElementById("gender").value;

  const birthIso = withOffsetIso(birthLocal);
  if (!birthIso) {
    sajuOutput.textContent = "날짜 형식을 확인해 주세요.";
    return;
  }

  if (!location) {
    sajuOutput.textContent = "출생지를 입력해 주세요.";
    return;
  }

  setLoading(sajuSubmit, true, "분석 중…");
  sajuOutput.textContent = "잠시만 기다려 주세요.";

  try {
    const response = await postJSON("/api/saju-pm", {
      birth_iso: birthIso,
      location,
      gender,
    });
    // 서버 응답을 마크다운 문법 없이, 요청된 순서대로 보여주기 위해 후처리합니다.
    const raw = response.reply || "";
    const cleaned = stripMarkdown(raw);
    const ordered = reorderSajuReply(cleaned);
    // innerText를 사용해 줄바꿈을 그대로 보여줍니다.
    sajuOutput.innerText = ordered || "응답이 비어 있습니다.";
  } catch (error) {
    sajuOutput.textContent = `요청 처리에 실패했습니다: ${error.message}`;
  } finally {
    setLoading(sajuSubmit, false);
  }
});

// 마크다운 문법을 제거하는 간단한 정리 함수
function stripMarkdown(text) {
  if (!text) return "";
  let t = text;
  // 코드 블록 및 인라인 코드 제거/backtick 제거
  t = t.replace(/```[\s\S]*?```/g, "");
  t = t.replace(/`+/g, "");
  // 볼드/이탤릭 표기 제거
  t = t.replace(/\*\*(.*?)\*\*/g, "$1");
  t = t.replace(/__(.*?)__/g, "$1");
  t = t.replace(/\*(.*?)\*/g, "$1");
  t = t.replace(/_(.*?)_/g, "$1");
  // 제목/blockquote 기호 제거
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
  t = t.replace(/^>\s?/gm, "");
  // 리스트 마커를 제거하되 줄바꿈은 유지
  t = t.replace(/^\s*[-*+]\s+/gm, "- ");
  // 선행 숫자 목록(예: '1. ', '2) ') 제거
  t = t.replace(/^\s*\d+[\.\)]\s*/gm, "");
  // 수평선 등 여타 마크다운 기호 제거
  t = t.replace(/^([-*_]){3,}\s*$/gm, "");
  // HTML 태그가 포함되었으면 제거
  t = t.replace(/<[^>]+>/g, "");
  // 연속 공백 정리
  t = t.replace(/\u00A0/g, " ");
  return t.trim();
}

// 응답 텍스트에서 섹션을 인식해 요청한 순서로 재배치합니다.
function reorderSajuReply(text) {
  if (!text) return "";
  // 전처리: 응답에 '(1)', '(2)' 등 빈 플레이스홀더만 있는 라인을 제거
  let cleanText = text.replace(/^\(\d+\)\s*$/gm, "");
  // 그리고 불필요한 연속 괄호 숫자 표기도 제거
  cleanText = cleanText.replace(/\(\d+\)\s*/g, "");
  // 공백 라인 정리
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n");

  // 섹션 키워드(한글)를 찾기 위한 정규식
  const sectionPatterns = {
    strengths: /(강점|장점|Strengths?)[:\s\-–—]*/i,
    weaknesses: /(보완|단점|보완해야|개선)[:\s\-–—]*/i,
    action: /(권장|권장 행동|행동)[:\s\-–—]*/i,
    recommend_job: /(추천|추천 직무|추천직무)[:\s\-–—]*/i,
    skills: /(관련 스킬|스킬|키워드|관련 키워드)[:\s\-–—]*/i,
  };

  // 각 섹션의 시작 인덱스를 찾습니다.
  const indices = {};
  const lower = cleanText;
  for (const [key, pat] of Object.entries(sectionPatterns)) {
    const m = pat.exec(lower);
    indices[key] = m ? m.index : -1;
  }

  // 섹션 인덱스를 기반으로 텍스트를 슬라이스합니다.
  // 먼저 가장 먼저 등장하는 섹션의 앞부분을 '사주 전문/분석'으로 간주합니다.
  const presentSections = Object.entries(indices)
    .filter(([, idx]) => idx >= 0)
    .sort((a, b) => a[1] - b[1]);

  let sajuMain = "";
  let strengths = "";
  let weaknesses = "";
  let action = "";
  let recommend_job = "";
  let skills = "";

  if (presentSections.length === 0) {
    // 라벨이 전혀 없으면 전체를 사주 전문으로 간주
    sajuMain = cleanText;
  } else {
    const firstIdx = presentSections[0][1];
    if (firstIdx > 0) {
      sajuMain = cleanText.slice(0, firstIdx).trim();
    }

    // 각 섹션별로 텍스트 분리
    const getSection = (startKey) => {
      const start = indices[startKey];
      if (start < 0) return "";
      // find the next section start after this one (based on cleanText indices)
      const others = Object.values(indices).filter((i) => i > start).sort((a, b) => a - b);
      const end = others.length ? others[0] : cleanText.length;
      // slice from cleanText and remove the heading label
      let slice = cleanText.slice(start, end).trim();
      // remove leading label like '강점 2가지:' and any leading numeric markers
      slice = slice.replace(/^[^\n:\-–—]+[:\-–—]?\s*/g, "");
      slice = slice.replace(/^\s*\d+[\.\)]\s*/g, "");
      return slice.trim();
    };

    strengths = getSection('strengths');
    weaknesses = getSection('weaknesses');
    action = getSection('action');
    recommend_job = getSection('recommend_job');
    skills = getSection('skills');
  }

  // 사주 전문이 비어있거나 의미있는 텍스트가 없으면, 다른 섹션을 이용해 요약을 생성합니다.
  function firstLine(s) {
    if (!s) return "";
    const line = s.split(/\r?\n/).find((l) => l.trim());
    return line ? line.replace(/^[-\s\d\.\)\(]+/, "").trim() : "";
  }

  if (!sajuMain || sajuMain.length < 10) {
    const synth = [];
    const fStr = firstLine(strengths);
    const fWeak = firstLine(weaknesses);
    if (fStr) synth.push(`강점: ${fStr}`);
    if (fWeak) synth.push(`보완점: ${fWeak}`);
    if (action) synth.push(`권장 행동: ${firstLine(action)}`);
    if (recommend_job) synth.push(`추천 직무: ${firstLine(recommend_job)}`);
    if (skills) synth.push(`스킬: ${firstLine(skills)}`);
    if (synth.length) {
      sajuMain = synth.join(' / ');
    }
  }

  // 결과를 요청한 순서로 구성
  const parts = [];
  if (sajuMain) {
    parts.push('사주(전문/분석):\n' + sajuMain);
  } else {
    parts.push('사주(전문/분석) 내용이 응답에 포함되어 있지 않습니다. 아래는 전달받은 분석을 재구성한 결과입니다.');
  }

  if (strengths) parts.push('\n(1) 강점 2가지:\n' + strengths);
  if (weaknesses) parts.push('\n(2) 보완해야 할 점 1가지:\n' + weaknesses);
  if (action) parts.push('\n(3) 권장 행동 1줄:\n' + action);
  if (recommend_job) parts.push('\n(4) 추천 PM 직무:\n' + recommend_job);
  if (skills) parts.push('\n(5) 관련 스킬 키워드 3개:\n' + skills);

  return parts.join('\n\n').trim();
}

chatSubmit.addEventListener("click", async () => {
  const message = chatInput.value.trim();
  if (!message) {
    chatOutput.textContent = "메시지를 입력해 주세요.";
    return;
  }

  setLoading(chatSubmit, true, "전송 중…");
  chatOutput.textContent = "답변을 기다리는 중입니다.";

  try {
    const response = await postJSON("/api/chat", {
      messages: [
        {
          role: "system",
          content: "당신은 친절한 대화를 제공하는 어시스턴트입니다.",
        },
        {
          role: "user",
          content: message,
        },
      ],
      model: "gpt-4o-mini",
      temperature: 0.5,
    });
    chatOutput.textContent = response.reply || "응답이 비어 있습니다.";
  } catch (error) {
    chatOutput.textContent = `요청 처리에 실패했습니다: ${error.message}`;
  } finally {
    setLoading(chatSubmit, false);
  }
});
