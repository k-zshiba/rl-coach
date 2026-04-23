import { Goal, PlayerStat } from "@/features/worker";

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface Snapshot {
  time: number;
  ball?: Vector3;
  players: Record<string, Vector3>;
}

export interface PlayerAdvice {
  good: string[];
  bad: string[];
  improve: string[];
  nextLevel: string[];
}

export interface GoalConcessionAnalysis {
  title: string;
  reason: string;
  detail: string[];
}

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null;

const isVector3 = (x: unknown): x is Vector3 => {
  if (!isObject(x)) {
    return false;
  }
  return ["x", "y", "z"].every(
    (key) => typeof x[key] === "number" && Number.isFinite(x[key] as number),
  );
};

const pickNumber = (obj: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && Number.isFinite(val)) {
      return val;
    }
  }
  return undefined;
};

const pickString = (obj: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string" && val.length > 0) {
      return val;
    }
  }
  return undefined;
};

const collectVectors = (
  value: unknown,
  path: string,
  out: Array<{ path: string; vector: Vector3 }>,
) => {
  if (isVector3(value)) {
    out.push({ path, vector: value });
    return;
  }
  if (!isObject(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    collectVectors(nested, `${path}.${key}`, out);
  }
};

const extractSnapshots = (fullReplay: unknown): Snapshot[] => {
  if (!isObject(fullReplay)) {
    return [];
  }
  const networkFrames = fullReplay.network_frames;
  if (!Array.isArray(networkFrames)) {
    return [];
  }

  const actorNames = new Map<number, string>();

  return networkFrames.map((frame, index) => {
    if (!isObject(frame)) {
      return { time: index / 30, players: {} };
    }

    const time =
      pickNumber(frame, ["time", "seconds", "frame_time", "t"]) ?? index / 30;
    const players: Record<string, Vector3> = {};
    let ball: Vector3 | undefined;

    const updates = Array.isArray(frame.updated_actors)
      ? frame.updated_actors
      : Array.isArray(frame.actors)
        ? frame.actors
        : [];

    for (const update of updates) {
      if (!isObject(update)) {
        continue;
      }
      const actorId = pickNumber(update, ["actor_id", "actor", "id"]);
      const nameHint = pickString(update, [
        "name",
        "player_name",
        "object_name",
      ]);
      if (typeof actorId === "number" && nameHint) {
        actorNames.set(actorId, nameHint);
      }

      const vectors: Array<{ path: string; vector: Vector3 }> = [];
      collectVectors(update, "update", vectors);
      for (const { path, vector } of vectors) {
        const lower = path.toLowerCase();
        if (lower.includes("ball")) {
          ball = vector;
          continue;
        }

        const actorLabel =
          (typeof actorId === "number" ? actorNames.get(actorId) : undefined) ??
          (typeof actorId === "number" ? `actor-${actorId}` : undefined);
        if (
          actorLabel &&
          (lower.includes("location") ||
            lower.includes("position") ||
            lower.includes("rigid"))
        ) {
          players[actorLabel] = vector;
        }
      }
    }

    if (!ball) {
      const vectors: Array<{ path: string; vector: Vector3 }> = [];
      collectVectors(frame, "frame", vectors);
      ball = vectors.find((x) => x.path.toLowerCase().includes("ball"))?.vector;
    }

    return { time, ball, players };
  });
};

const distance2d = (a: Vector3, b: Vector3) => Math.hypot(a.x - b.x, a.y - b.y);

export const buildPlayerAdvice = (
  player: PlayerStat,
  allPlayers: PlayerStat[],
): PlayerAdvice => {
  const teamPlayers = allPlayers.filter((x) => x.Team === player.Team);
  const teamSize = Math.max(teamPlayers.length, 1);

  const avg = {
    score: teamPlayers.reduce((s, x) => s + x.Score, 0) / teamSize,
    shots: teamPlayers.reduce((s, x) => s + x.Shots, 0) / teamSize,
    saves: teamPlayers.reduce((s, x) => s + x.Saves, 0) / teamSize,
    assists: teamPlayers.reduce((s, x) => s + x.Assists, 0) / teamSize,
  };

  const good: string[] = [];
  const bad: string[] = [];
  const improve: string[] = [];
  const nextLevel: string[] = [];

  if (player.Score >= avg.score) {
    good.push("チーム平均以上のスコアで試合への関与が高いです。");
  }
  if (player.Shots >= avg.shots && player.Goals > 0) {
    good.push("シュート意識が高く、得点につなげられています。");
  }
  if (player.Saves >= avg.saves) {
    good.push("守備時のゴール前対応が安定しています。");
  }
  if (player.Assists >= avg.assists && player.Assists > 0) {
    good.push("味方を活かすラストパスの意識があります。");
  }

  const shotConversion = player.Shots > 0 ? player.Goals / player.Shots : 0;
  if (player.Shots >= 3 && shotConversion < 0.2) {
    bad.push("シュート本数に対して決定率が低く、精度改善の余地があります。");
    improve.push(
      "ゴール前では強いショットよりもコース優先で打ち分けましょう。",
    );
  }

  if (player.Saves === 0) {
    bad.push("セーブ数が0で、守備参加のタイミングが遅れた可能性があります。");
    improve.push(
      "3rdマン時は早めにゴールラインへ戻り、ニアポストを消しましょう。",
    );
  }

  if (player.Assists === 0 && player.Goals === 0) {
    bad.push("攻撃の最終局面で得点関与が少なめです。");
    improve.push(
      "1stタッチ後は中央への折り返しを増やして得点機会を作りましょう。",
    );
  }

  nextLevel.push("上位帯では『触る回数』より『有効な1タッチ』の質が重要です。");
  nextLevel.push(
    "味方2人の位置を見て、常に1st/2nd/3rdマンの役割を埋め続けましょう。",
  );

  if (good.length === 0) {
    good.push(
      "立ち回りの土台はできているので、判断の一貫性を伸ばすと伸びます。",
    );
  }
  if (bad.length === 0) {
    bad.push(
      "大きな弱点は見えません。細かなポジショニング改善が次の伸び代です。",
    );
  }

  return { good, bad, improve, nextLevel };
};

export const analyzeConcessions = (
  fullReplay: unknown,
  goals: Goal[],
  fps: number,
  players: PlayerStat[],
): GoalConcessionAnalysis[] => {
  const snapshots = extractSnapshots(fullReplay);
  if (snapshots.length === 0) {
    return goals.map((goal, idx) => ({
      title: `${idx + 1}失点目 (${goal.PlayerName})`,
      reason: "ネットワークフレーム座標が取得できず、詳細分析は未対応です。",
      detail: ["このリプレイでは座標データの形式が異なる可能性があります。"],
    }));
  }

  const teamByName = new Map(players.map((x) => [x.Name, x.Team]));

  return goals.map((goal, idx) => {
    const t = fps > 0 ? goal.frame / fps : idx;
    const start = t - 10;
    const end = t + 10;

    const around = snapshots.filter((x) => x.time >= start && x.time <= end);
    const beforeGoal = [...around].reverse().find((x) => x.time <= t);

    const concedingTeam = goal.PlayerTeam === 0 ? 1 : 0;
    const defenders = players
      .filter((x) => x.Team === concedingTeam)
      .map((x) => x.Name);

    if (!beforeGoal?.ball || Object.keys(beforeGoal.players).length === 0) {
      return {
        title: `${idx + 1}失点目 (${goal.PlayerName})`,
        reason:
          "失点前後10秒の座標が十分に取れず、限定的な分析になっています。",
        detail: [
          `失点時刻は約${t.toFixed(1)}秒です。`,
          "座標ログの欠損があるため、次回は完全なネットワーク解析付きリプレイを推奨します。",
        ],
      };
    }

    const playerPositions = Object.entries(beforeGoal.players);
    const defenderPositions = playerPositions.filter(([name]) =>
      defenders.some((n) => name.includes(n)),
    );

    const nearestDefender = defenderPositions
      .map(([name, pos]) => ({
        name,
        dist: distance2d(pos, beforeGoal.ball as Vector3),
      }))
      .sort((a, b) => a.dist - b.dist)[0];

    const nearestAny = playerPositions
      .map(([name, pos]) => ({
        name,
        dist: distance2d(pos, beforeGoal.ball as Vector3),
      }))
      .sort((a, b) => a.dist - b.dist)[0];

    const detail: string[] = [
      `失点時刻: 約${t.toFixed(1)}秒（前後10秒を解析）。`,
      `ボール座標: x=${beforeGoal.ball.x.toFixed(0)}, y=${beforeGoal.ball.y.toFixed(0)}, z=${beforeGoal.ball.z.toFixed(0)}。`,
      `記録された選手座標数: ${playerPositions.length}。`,
    ];

    let reason =
      "守備側のボールコンテストが遅れ、相手に先触りを許した失点です。";
    if (nearestDefender) {
      detail.push(
        `最寄り守備者は ${nearestDefender.name} で、ボールまで約${nearestDefender.dist.toFixed(0)}uu。`,
      );
    }
    if (nearestAny) {
      const knownTeam = teamByName.get(nearestAny.name);
      if (knownTeam !== undefined && knownTeam !== concedingTeam) {
        reason =
          "相手が先にボールへ到達し、守備が後手になったカウンター系の失点です。";
      }
      detail.push(
        `最寄り選手は ${nearestAny.name} で、ボールまで約${nearestAny.dist.toFixed(0)}uu。`,
      );
    }

    return {
      title: `${idx + 1}失点目 (${goal.PlayerName})`,
      reason,
      detail,
    };
  });
};
