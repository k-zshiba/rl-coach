import { ReplayYield } from "@/features/replay/replayStore";
import React from "react";
import { analyzeConcessions, buildPlayerAdvice } from "./analysis";

interface CoachInsightsProps {
  replay: ReplayYield;
}

export const CoachInsights = ({ replay }: CoachInsightsProps) => {
  const stats = replay.data.properties.PlayerStats ?? [];
  const [selectedName, setSelectedName] = React.useState(stats[0]?.Name ?? "");

  const selectedPlayer = stats.find((x) => x.Name === selectedName) ?? stats[0];
  const advice = selectedPlayer
    ? buildPlayerAdvice(selectedPlayer, stats)
    : null;

  const concessions = analyzeConcessions(
    replay.fullData,
    replay.data.properties.Goals,
    replay.data.properties.RecordFPS,
    stats,
  );

  return (
    <section className="space-y-4 rounded border border-zinc-500/40 p-4">
      <h2 className="text-xl font-bold">コーチング分析</h2>
      <p className="text-sm opacity-80">
        .replay の全項目をJSONとしてパース済み（トップレベルキー数:{" "}
        {Object.keys(replay.fullData).length}）
      </p>

      {stats.length > 0 ? (
        <div className="space-y-3">
          <label className="font-semibold" htmlFor="player-select">
            選手別アドバイス
          </label>
          <select
            id="player-select"
            className="ml-2 rounded border px-2 py-1 text-black"
            value={selectedPlayer?.Name ?? ""}
            onChange={(e) => setSelectedName(e.target.value)}
          >
            {stats.map((x) => (
              <option key={`${x.Name}-${x.OnlineID}`} value={x.Name}>
                {x.Name}
              </option>
            ))}
          </select>

          {selectedPlayer && advice ? (
            <div className="grid gap-4 md:grid-cols-2">
              <ul className="list-disc space-y-1 pl-5">
                <li className="font-semibold">良いところ</li>
                {advice.good.map((x, i) => (
                  <li key={`good-${i}`}>{x}</li>
                ))}
              </ul>
              <ul className="list-disc space-y-1 pl-5">
                <li className="font-semibold">悪いところ</li>
                {advice.bad.map((x, i) => (
                  <li key={`bad-${i}`}>{x}</li>
                ))}
              </ul>
              <ul className="list-disc space-y-1 pl-5">
                <li className="font-semibold">改善点</li>
                {advice.improve.map((x, i) => (
                  <li key={`improve-${i}`}>{x}</li>
                ))}
              </ul>
              <ul className="list-disc space-y-1 pl-5">
                <li className="font-semibold">
                  上のレベルに行くために必要なこと
                </li>
                {advice.nextLevel.map((x, i) => (
                  <li key={`next-${i}`}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">
          失点理由（前後10秒の座標ベース）
        </h3>
        {concessions.map((concession) => (
          <article
            key={concession.title}
            className="rounded border border-zinc-400/30 p-3"
          >
            <h4 className="font-semibold">{concession.title}</h4>
            <p>{concession.reason}</p>
            <ul className="list-disc pl-5">
              {concession.detail.map((x, i) => (
                <li key={`${concession.title}-${i}`}>{x}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
};
