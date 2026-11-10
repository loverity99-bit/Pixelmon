import React, { useEffect, useRef, useState } from "react";

const TOTAL_POKEMON = 1025;
const randomId = () => Math.floor(Math.random() * TOTAL_POKEMON) + 1;
const padId = (id) => String(id).padStart(4, "0");

async function getPokemon(id) {
  const [pokemonRes, speciesRes] = await Promise.all([
    fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
    fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ]);

  if (!pokemonRes.ok || !speciesRes.ok) {
    throw new Error(`포켓몬 #${padId(id)} 정보를 불러오지 못했습니다.`);
  }

  const [pokemon, species] = await Promise.all([
    pokemonRes.json(),
    speciesRes.json(),
  ]);

  const koreanName = species.names?.find(
    (item) => item.language.name === "ko",
  )?.name;
  const englishName = pokemon.name;

  return {
    id,
    name: koreanName || englishName,
    englishName,
    image:
      pokemon.sprites?.other?.["official-artwork"]?.front_default ||
      pokemon.sprites?.front_default ||
      "",
    types: pokemon.types.map((item) => item.type.name),
  };
}

export default function App() {
  const [slots, setSlots] = useState([null, null, null]);
  const [spinning, setSpinning] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const timers = useRef([]);
  const intervals = useRef([]);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      intervals.current.forEach(clearInterval);
    };
  }, []);

  const drawPokemon = async () => {
    if (spinning) return;

    setSpinning(true);
    setRevealed(false);
    setError("");
    setSlots([null, null, null]);

    timers.current.forEach(clearTimeout);
    intervals.current.forEach(clearInterval);
    timers.current = [];
    intervals.current = [];

    // 최종 3마리는 서로 중복되지 않도록 먼저 선정합니다.
    const chosen = [];
    while (chosen.length < 3) {
      const id = randomId();
      if (!chosen.includes(id)) chosen.push(id);
    }

    // 각 슬롯을 서로 다른 시점에 멈춰 슬롯머신 느낌을 줍니다.
    const stopTimes = [1900, 2750, 3600];
    const slotIds = [null, null, null];

    stopTimes.forEach((stopTime, index) => {
      intervals.current[index] = setInterval(() => {
        setSlots((current) =>
          current.map((slot, slotIndex) =>
            slotIndex === index
              ? {
                  id: randomId(),
                  name: "추첨 중...",
                  image: "",
                  spinning: true,
                }
              : slot,
          ),
        );
      }, 75);

      timers.current[index] = setTimeout(async () => {
        clearInterval(intervals.current[index]);
        try {
          const pokemon = await getPokemon(chosen[index]);
          slotIds[index] = pokemon;
          setSlots((current) =>
            current.map((slot, slotIndex) =>
              slotIndex === index ? { ...pokemon, spinning: false } : slot,
            ),
          );

          if (index === 2) {
            // 마지막 슬롯의 데이터까지 반영한 뒤 추첨을 종료합니다.
            setTimeout(() => {
              setSpinning(false);
              setRevealed(true);
              setHistory((items) =>
                [
                  { date: new Date(), pokemon: chosen.map((id) => id) },
                  ...items,
                ].slice(0, 5),
              );
            }, 350);
          }
        } catch (e) {
          setError(
            e.message || "포켓몬 정보를 불러오는 중 문제가 발생했습니다.",
          );
          setSpinning(false);
        }
      }, stopTime);
    });
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

  return (
    <main className="app">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Do+Hyeon&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #101522; }
        .app {
          min-height: 100vh; padding: 42px 20px 56px; color: #f7f8fc;
          font-family: 'Noto Sans KR', sans-serif;
          background: radial-gradient(ellipse at 50% 0%, #29395b 0%, #151d30 45%, #101522 100%);
        }
        .wrap { width: min(100%, 1040px); margin: 0 auto; }
        .eyebrow { color: #9db4ff; font-size: 12px; letter-spacing: .28em; font-weight: 900; text-align: center; }
        h1 { font-family: 'Do Hyeon', sans-serif; text-align: center; font-size: clamp(38px, 7vw, 64px); margin: 9px 0 5px; letter-spacing: .02em; }
        .subtitle { text-align: center; color: #aeb9d0; margin: 0 0 34px; font-size: 14px; }
        .range { display: inline-block; color: #dce5ff; background: #263451; border: 1px solid #40547c; border-radius: 999px; padding: 6px 13px; margin-top: 13px; font-size: 12px; }
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
        .actions { display: flex; justify-content: center; margin: 30px 0 15px; }
        button {
          border: 0; border-radius: 14px; padding: 16px 44px; cursor: pointer;
          color: #17213a; background: linear-gradient(135deg,#c8d5ff,#829eff);
          font: 900 18px 'Noto Sans KR', sans-serif; box-shadow: 0 9px 28px rgba(104,139,255,.28);
          transition: transform .15s, filter .15s;
        }
        button:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08); }
        button:disabled { opacity: .6; cursor: wait; }
        .hint { text-align: center; color: #8795b1; font-size: 12px; }
        .error { color: #ff9caa; text-align: center; margin: 14px 0; font-size: 13px; }
        .history { margin-top: 40px; border-top: 1px solid #2e3a53; padding-top: 22px; }
        .history h2 { font-size: 14px; color: #aebbd5; letter-spacing: .08em; }
        .history-row { display: flex; flex-wrap: wrap; gap: 8px; color: #93a2bf; font-size: 12px; margin-top: 10px; }
        .history-pill { background: #202c43; border: 1px solid #34435f; border-radius: 8px; padding: 7px 10px; }
        @media (max-width: 680px) {
          .app { padding: 30px 13px 40px; }
          .slots { gap: 9px; }
          .slot { min-height: 255px; padding: 16px 7px; border-radius: 15px; }
          .pokemon-image, .placeholder { height: 125px; margin-top: 18px; }
          .placeholder { font-size: 54px; }
          .name { font-size: 18px; }
          .type { padding: 3px 7px; font-size: 10px; }
          button { width: 100%; }
        }
      `}</style>

      <div className="wrap">
        <div className="eyebrow">NATIONAL POKÉDEX RANDOMIZER</div>
        <h1>JungA's POKÉMON RANDOM PICK</h1>
        <p className="subtitle">
          1,025마리의 포켓몬 중 운명의 3마리를 뽑아보세요.
          <br />
          <span className="range">NO. 0001 — 1025 · 중복 없이 3마리</span>
        </p>

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
                <div className="placeholder">
                  {pokemon?.spinning ? "?" : "?"}
                </div>
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
        {error && (
          <div className="error">
            {error} 네트워크 연결을 확인하고 다시 시도해주세요.
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
