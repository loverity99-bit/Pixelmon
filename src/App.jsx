import React, { useEffect, useRef, useState } from "react";

const TOTAL_POKEMON = 1025;
const CACHE_KEY = "pokemon-randomizer-species-v1";
const padId = (id) => String(id).padStart(4, "0");

// 전국도감 번호 기준 세대 범위
const GENERATIONS = [
  { id: 1, label: "1세대", start: 1, end: 151 },
  { id: 2, label: "2세대", start: 152, end: 251 },
  { id: 3, label: "3세대", start: 252, end: 386 },
  { id: 4, label: "4세대", start: 387, end: 493 },
  { id: 5, label: "5세대", start: 494, end: 649 },
  { id: 6, label: "6세대", start: 650, end: 721 },
  { id: 7, label: "7세대", start: 722, end: 809 },
  { id: 8, label: "8세대", start: 810, end: 905 },
  { id: 9, label: "9세대", start: 906, end: 1025 },
];

// 세대/전설 필터에서 가져온 종족 데이터 캐시
const speciesCache = new Map();

function loadCacheFromStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    saved.forEach((item) => speciesCache.set(item.id, item));
  } catch {
    // 저장 데이터가 없거나 손상된 경우 새로 불러옵니다.
  }
}

function saveCacheToStorage() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify([...speciesCache.values()]));
  } catch {
    // 브라우저 저장 공간이 부족해도 현재 추첨은 계속 진행합니다.
  }
}

let cacheInitialized = false;

function ensureCacheInitialized() {
  if (!cacheInitialized) {
    loadCacheFromStorage();
    cacheInitialized = true;
  }
}

async function fetchSpeciesMeta(id) {
  const response = await fetch(
    `https://pokeapi.co/api/v2/pokemon-species/${id}`,
  );
  if (!response.ok) {
    throw new Error(`도감 #${padId(id)} 분류 정보를 불러오지 못했습니다.`);
  }

  const species = await response.json();
  const koreanName =
    species.names?.find((item) => item.language.name === "ko")?.name || "";

  return {
    id,
    koreanName,
    isLegendary: Boolean(species.is_legendary),
    isMythical: Boolean(species.is_mythical),
  };
}

// 전설 필터를 사용할 때만 필요한 종족 정보를 가져옵니다.
// 한 번 불러온 정보는 브라우저에 저장해 다음 추첨부터 재사용합니다.
async function loadSpeciesMetadata(ids, onProgress) {
  ensureCacheInitialized();

  const missingIds = ids.filter((id) => !speciesCache.has(id));
  let completed = 0;
  let cursor = 0;
  const workerCount = Math.min(24, missingIds.length);

  const worker = async () => {
    while (true) {
      const currentIndex = cursor++;
      if (currentIndex >= missingIds.length) return;

      const id = missingIds[currentIndex];
      let lastError;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const metadata = await fetchSpeciesMeta(id);
          speciesCache.set(id, metadata);
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          if (attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
      }

      if (lastError) throw lastError;

      completed += 1;
      if (completed % 10 === 0 || completed === missingIds.length) {
        onProgress(completed, missingIds.length);
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  saveCacheToStorage();

  return ids.map((id) => speciesCache.get(id)).filter(Boolean);
}

async function getPokemon(id) {
  ensureCacheInitialized();

  const pokemonResponse = await fetch(
    `https://pokeapi.co/api/v2/pokemon/${id}`,
  );
  if (!pokemonResponse.ok) {
    throw new Error(`포켓몬 #${padId(id)} 정보를 불러오지 못했습니다.`);
  }

  const pokemon = await pokemonResponse.json();
  let speciesMeta = speciesCache.get(id);

  if (!speciesMeta) {
    speciesMeta = await fetchSpeciesMeta(id);
    speciesCache.set(id, speciesMeta);
    saveCacheToStorage();
  }

  return {
    id,
    name: speciesMeta.koreanName || pokemon.name,
    englishName: pokemon.name,
    image:
      pokemon.sprites?.other?.["official-artwork"]?.front_default ||
      pokemon.sprites?.front_default ||
      "",
    types: pokemon.types.map((item) => item.type.name),
    isLegendary: speciesMeta.isLegendary,
    isMythical: speciesMeta.isMythical,
  };
}

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function App() {
  const [slots, setSlots] = useState([null, null, null]);
  const [selectedGenerations, setSelectedGenerations] = useState([]);
  const [legendMode, setLegendMode] = useState("include");
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(null);
  const timers = useRef([]);
  const intervals = useRef([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      intervals.current.forEach(clearInterval);
    };
  }, []);

  const toggleGeneration = (generationId) => {
    setSelectedGenerations((current) =>
      current.includes(generationId)
        ? current.filter((id) => id !== generationId)
        : [...current, generationId].sort((a, b) => a - b),
    );
  };

  const drawPokemon = async () => {
    if (spinning) return;

    setSpinning(true);
    setRevealed(false);
    setError("");
    setLoadingProgress(null);
    setSlots([null, null, null]);

    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    timers.current = [];
    intervals.current = [];

    try {
      const activeGenerations = selectedGenerations.length
        ? GENERATIONS.filter((generation) =>
            selectedGenerations.includes(generation.id),
          )
        : GENERATIONS;

      let candidateIds = activeGenerations.flatMap((generation) => {
        const ids = [];
        for (let id = generation.start; id <= generation.end; id++)
          ids.push(id);
        return ids;
      });

      if (legendMode !== "include") {
        setLoadingMessage("전설 포켓몬 분류 정보를 확인하고 있습니다...");

        const metadata = await loadSpeciesMetadata(
          candidateIds,
          (done, total) => {
            setLoadingProgress({ done, total });
          },
        );

        const legendaryIds = new Set(
          metadata
            .filter((item) => item.isLegendary || item.isMythical)
            .map((item) => item.id),
        );

        candidateIds =
          legendMode === "only"
            ? candidateIds.filter((id) => legendaryIds.has(id))
            : candidateIds.filter((id) => !legendaryIds.has(id));
      }

      if (candidateIds.length < 3) {
        throw new Error(
          `현재 조건에 해당하는 포켓몬이 ${candidateIds.length}마리뿐이라 3마리를 뽑을 수 없습니다. 세대 또는 전설 옵션을 변경해주세요.`,
        );
      }

      const chosenIds = shuffle(candidateIds).slice(0, 3);

      setLoadingMessage("포켓몬 정보를 준비하고 있습니다...");
      setLoadingProgress(null);
      const chosenPokemon = await Promise.all(chosenIds.map(getPokemon));

      setLoadingMessage("슬롯머신 가동 중...");

      // 각 슬롯이 서로 다른 시점에 멈추도록 연출합니다.
      const stopTimes = [1900, 2750, 3600];

      stopTimes.forEach((stopTime, index) => {
        intervals.current[index] = setInterval(() => {
          const randomId =
            candidateIds[Math.floor(Math.random() * candidateIds.length)];

          setSlots((current) =>
            current.map((slot, slotIndex) =>
              slotIndex === index
                ? {
                    id: randomId,
                    name: "추첨 중...",
                    image: "",
                    spinning: true,
                  }
                : slot,
            ),
          );
        }, 75);

        timers.current[index] = setTimeout(() => {
          clearInterval(intervals.current[index]);

          setSlots((current) =>
            current.map((slot, slotIndex) =>
              slotIndex === index
                ? { ...chosenPokemon[index], spinning: false }
                : slot,
            ),
          );

          if (index === 2) {
            const finishTimer = setTimeout(() => {
              setSpinning(false);
              setRevealed(true);
              setLoadingMessage("");
              setHistory((items) =>
                [
                  {
                    date: new Date(),
                    pokemon: chosenPokemon.map((pokemon) => pokemon.id),
                    generations: activeGenerations.map(
                      (generation) => generation.id,
                    ),
                    legendMode,
                  },
                  ...items,
                ].slice(0, 5),
              );
            }, 350);
            timers.current.push(finishTimer);
          }
        }, stopTime);
      });
    } catch (e) {
      timers.current.forEach(clearTimeout);
      intervals.current.forEach(clearInterval);
      setError(e.message || "포켓몬 정보를 불러오는 중 문제가 발생했습니다.");
      setSpinning(false);
      setLoadingMessage("");
    }
  };

  const typeLabels = {
    normal: "노말",
    fire: "불꽃",
    water: "물",
    electric: "전기",
    grass: "풀",
    ice: "얼음",
    fighting: "격투",
    poison: "독",
    ground: "땅",
    flying: "비행",
    psychic: "에스퍼",
    bug: "벌레",
    rock: "바위",
    ghost: "고스트",
    dragon: "드래곤",
    dark: "악",
    steel: "강철",
    fairy: "페어리",
  };

  const legendLabels = {
    exclude: "전설없음",
    include: "전설포함",
    only: "전설만",
  };

  const generationSummary = selectedGenerations.length
    ? selectedGenerations.map((id) => `${id}세대`).join(", ")
    : "전체 세대";

  return (
    <main className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Do+Hyeon&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #101522; }
        .app {
          min-height: 100vh; padding: 38px 20px 56px; color: #f7f8fc;
          font-family: 'Noto Sans KR', sans-serif;
          background: radial-gradient(ellipse at 50% 0%, #29395b 0%, #151d30 45%, #101522 100%);
        }
        .wrap { width: min(100%, 1040px); margin: 0 auto; }
        .eyebrow { color: #9db4ff; font-size: 12px; letter-spacing: .28em; font-weight: 900; text-align: center; }
        h1 { font-family: 'Do Hyeon', sans-serif; text-align: center; font-size: clamp(38px, 7vw, 64px); margin: 9px 0 5px; letter-spacing: .02em; }
        .subtitle { text-align: center; color: #aeb9d0; margin: 0 0 25px; font-size: 14px; }
        .range { display: inline-block; color: #dce5ff; background: #263451; border: 1px solid #40547c; border-radius: 999px; padding: 6px 13px; margin-top: 13px; font-size: 12px; }
        .filters {
          display: grid; grid-template-columns: 1.15fr .85fr; gap: 14px;
          margin: 0 0 22px;
        }
        .filter-card {
          border: 1px solid #394967; border-radius: 17px; padding: 17px 18px;
          background: rgba(27, 39, 62, .88);
        }
        .filter-title { color: #dce5ff; font-size: 14px; font-weight: 900; margin: 0 0 13px; }
        .generation-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .check-option, .radio-option {
          display: flex; align-items: center; gap: 8px; cursor: pointer;
          color: #c5d0e7; font-size: 13px; user-select: none;
        }
        .check-option {
          padding: 9px 10px; border: 1px solid #394b6d; border-radius: 10px;
          background: #202e49; transition: .15s;
        }
        .check-option:has(input:checked) {
          border-color: #91aaff; background: #2d3e63; color: #fff;
        }
        input[type="checkbox"], input[type="radio"] {
          accent-color: #91aaff; width: 16px; height: 16px; margin: 0;
        }
        .radio-list { display: grid; gap: 9px; }
        .radio-option {
          padding: 9px 10px; border: 1px solid transparent; border-radius: 10px;
          background: #202e49;
        }
        .radio-option:has(input:checked) {
          border-color: #91aaff; background: #2d3e63; color: #fff;
        }
        .filter-note { color: #8292b1; font-size: 11px; margin: 11px 0 0; line-height: 1.5; }
        .selection-summary {
          display: flex; flex-wrap: wrap; justify-content: center; gap: 7px;
          margin: 0 0 18px; color: #9eafd0; font-size: 11px;
        }
        .summary-chip { background: #202c43; border: 1px solid #34435f; border-radius: 999px; padding: 5px 10px; }
        .slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; }
        .slot {
          position: relative; min-height: 330px; padding: 20px 16px 22px; overflow: hidden;
          text-align: center; border: 1px solid #394967; border-radius: 22px;
          background: linear-gradient(160deg, rgba(43,58,88,.96), rgba(24,33,52,.98));
          box-shadow: 0 18px 45px rgba(0,0,0,.22);
        }
        .slot:before { content: ''; position: absolute; inset: 0 0 auto; height: 4px; background: linear-gradient(90deg,#829eff,#b8c8ff,#829eff); opacity: .85; }
        .slot-label { color: #9eafd0; font-size: 11px; font-weight: 900; letter-spacing: .2em; }
        .pokemon-image, .placeholder {
          width: min(100%, 190px); height: 185px; object-fit: contain; margin: 13px auto 5px;
          filter: drop-shadow(0 12px 12px rgba(0,0,0,.25));
        }
        .placeholder {
          display: grid; place-items: center; border-radius: 50%;
          color: #7284aa; font-size: 74px; font-weight: 900;
          background: radial-gradient(circle, #344565 0%, rgba(37,51,78,.2) 68%, transparent 70%);
        }
        .spinning .placeholder { animation: pulse .18s infinite alternate; }
        @keyframes pulse { from { transform: translateY(-3px) scale(.96); opacity: .65; } to { transform: translateY(3px) scale(1.04); opacity: 1; } }
        .dex { color: #9eafd0; font-size: 12px; font-weight: 700; letter-spacing: .08em; }
        .name { font-size: clamp(21px, 3vw, 27px); font-weight: 900; margin: 5px 0 8px; }
        .types { display: flex; justify-content: center; flex-wrap: wrap; gap: 6px; min-height: 25px; }
        .type { color: #dce5ff; background: #3b4b6d; border: 1px solid #53678f; border-radius: 999px; padding: 3px 10px; font-size: 11px; }
        .special-tag { display: inline-block; margin-top: 7px; color: #ffe2a1; background: #58472b; border: 1px solid #80663a; border-radius: 999px; padding: 3px 9px; font-size: 10px; }
        .actions { display: flex; justify-content: center; margin: 26px 0 13px; }
        button {
          border: 0; border-radius: 14px; padding: 16px 44px; cursor: pointer;
          color: #17213a; background: linear-gradient(135deg,#c8d5ff,#829eff);
          font: 900 18px 'Noto Sans KR', sans-serif; box-shadow: 0 9px 28px rgba(104,139,255,.28);
          transition: transform .15s, filter .15s;
        }
        button:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08); }
        button:disabled { opacity: .6; cursor: wait; }
        .hint { text-align: center; color: #8795b1; font-size: 12px; }
        .progress { text-align: center; color: #c3d0ee; font-size: 12px; margin-top: 10px; }
        .error { color: #ff9caa; text-align: center; margin: 14px 0; font-size: 13px; line-height: 1.6; }
        .history { margin-top: 40px; border-top: 1px solid #2e3a53; padding-top: 22px; }
        .history h2 { font-size: 14px; color: #aebbd5; letter-spacing: .08em; }
        .history-row { display: flex; flex-wrap: wrap; gap: 8px; color: #93a2bf; font-size: 12px; margin-top: 10px; }
        .history-pill { background: #202c43; border: 1px solid #34435f; border-radius: 8px; padding: 7px 10px; }
        @media (max-width: 700px) {
          .filters { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
          .app { padding: 28px 13px 40px; }
          .slots { gap: 9px; }
          .slot { min-height: 255px; padding: 16px 7px; border-radius: 15px; }
          .pokemon-image, .placeholder { height: 125px; margin-top: 18px; }
          .placeholder { font-size: 54px; }
          .name { font-size: 18px; }
          .type { padding: 3px 7px; font-size: 10px; }
          button { width: 100%; }
          .generation-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }
      `}</style>

      <div className="wrap">
        <div className="eyebrow">NATIONAL POKÉDEX RANDOMIZER</div>
        <h1>JungA's POKÉMON RANDOM PICK</h1>
        <p className="subtitle">
          원하는 세대와 전설 옵션을 선택하고 운명의 3마리를 뽑아보세요.
          <br />
          <span className="range">NO. 0001 — 1025 · 중복 없이 3마리</span>
        </p>

        <section className="filters">
          <div className="filter-card">
            <h2 className="filter-title">세대 선택</h2>
            <div className="generation-grid">
              {GENERATIONS.map((generation) => (
                <label className="check-option" key={generation.id}>
                  <input
                    type="checkbox"
                    checked={selectedGenerations.includes(generation.id)}
                    onChange={() => toggleGeneration(generation.id)}
                    disabled={spinning}
                  />
                  <span>{generation.label}</span>
                </label>
              ))}
            </div>
            <p className="filter-note">
              여러 세대를 함께 선택할 수 있습니다. 아무 세대도 선택하지 않으면
              1~9세대 전체에서 추첨합니다.
            </p>
          </div>

          <div className="filter-card">
            <h2 className="filter-title">전설 포켓몬 설정</h2>
            <div className="radio-list">
              {[
                {
                  value: "exclude",
                  label: "전설없음",
                  description: "전설 및 환상 포켓몬 제외",
                },
                {
                  value: "include",
                  label: "전설포함",
                  description: "일반·전설·환상 포켓몬 모두 포함",
                },
                {
                  value: "only",
                  label: "전설만",
                  description: "전설 및 환상 포켓몬만 추첨",
                },
              ].map((option) => (
                <label className="radio-option" key={option.value}>
                  <input
                    type="radio"
                    name="legendMode"
                    value={option.value}
                    checked={legendMode === option.value}
                    onChange={() => setLegendMode(option.value)}
                    disabled={spinning}
                  />
                  <span>
                    <strong>{option.label}</strong>
                    <span className="radio-description">
                      {" "}
                      · {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>

        <div className="selection-summary">
          <span className="summary-chip">{generationSummary}</span>
          <span className="summary-chip">{legendLabels[legendMode]}</span>
          <span className="summary-chip">3마리 중복 없음</span>
        </div>

        <section className="slots" aria-live="polite">
          {slots.map((pokemon, index) => (
            <article
              className={`slot ${pokemon?.spinning ? "spinning" : ""}`}
              key={index}
            >
              <div className="slot-label">SELECT 0{index + 1}</div>
              {pokemon?.image ? (
                <img
                  className="pokemon-image"
                  src={pokemon.image}
                  alt={pokemon.name}
                />
              ) : (
                <div className="placeholder">?</div>
              )}
              {pokemon && !pokemon.spinning ? (
                <>
                  <div className="dex">No. {padId(pokemon.id)}</div>
                  <div className="name">{pokemon.name}</div>
                  <div className="types">
                    {pokemon.types.map((type) => (
                      <span className="type" key={type}>
                        {typeLabels[type] || type}
                      </span>
                    ))}
                  </div>
                  {(pokemon.isLegendary || pokemon.isMythical) && (
                    <span className="special-tag">
                      {pokemon.isMythical ? "환상 포켓몬" : "전설 포켓몬"}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <div className="dex">
                    No. {pokemon ? padId(pokemon.id) : "????"}
                  </div>
                  <div className="name">
                    {pokemon?.spinning ? "추첨 중..." : "대기 중"}
                  </div>
                </>
              )}
            </article>
          ))}
        </section>

        <div className="actions">
          <button onClick={drawPokemon} disabled={spinning}>
            {spinning
              ? "포켓몬 추첨 중..."
              : revealed
                ? "다시 3마리 뽑기"
                : "🎲  3마리 추첨하기"}
          </button>
        </div>
        <div className="hint">
          버튼을 누르면 슬롯이 차례대로 멈추며 포켓몬이 공개됩니다.
        </div>
        {loadingMessage && (
          <div className="progress">
            {loadingMessage}
            {loadingProgress &&
              ` (${loadingProgress.done.toLocaleString()} / ${loadingProgress.total.toLocaleString()})`}
          </div>
        )}
        {error && (
          <div className="error">
            {error}
            <br />
            네트워크 연결을 확인하고 옵션을 변경한 뒤 다시 시도해주세요.
          </div>
        )}

        {history.length > 0 && (
          <section className="history">
            <h2>최근 추첨 기록</h2>
            {history.map((item, index) => (
              <div
                className="history-row"
                key={`${item.date.getTime()}-${index}`}
              >
                <span>
                  {item.date.toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="history-pill">
                  {item.generations.length
                    ? item.generations.map((id) => `${id}세대`).join(", ")
                    : "전체 세대"}
                </span>
                <span className="history-pill">
                  {legendLabels[item.legendMode]}
                </span>
                {item.pokemon.map((id) => (
                  <span className="history-pill" key={id}>
                    #{padId(id)}
                  </span>
                ))}
              </div>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
