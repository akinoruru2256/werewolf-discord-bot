const { Client, GatewayIntentBits, Partials } = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

const PREFIX = "/";

// ===== ゲーム状態 =====
let players = new Set();
let roles = {}; // { roleName: count }
let assignedRoles = new Map();

let phase = "waiting"; // waiting / day / night
let dayTime = 60;
let nightTime = 60;

let startVotes = new Set();
let startRequested = false;

// ===== ユーティリティ =====
function totalRoles() {
  return Object.values(roles).reduce((a, b) => a + b, 0);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ===== フェーズ管理 =====
async function startPhase(channel, nextPhase, time) {
  phase = nextPhase;
  await channel.send(`⏳ **${nextPhase.toUpperCase()} フェーズ開始（${time}秒）**`);

  setTimeout(async () => {
    if (phase === "day") {
      startPhase(channel, "night", nightTime);
    } else if (phase === "night") {
      startPhase(channel, "day", dayTime);
    }
  }, time * 1000);
}

// ===== Bot 起動 =====
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== メッセージ処理 =====
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith(PREFIX) || message.author.bot) return;

  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = args.shift();

  // ===== 参加 =====
  if (command === "join") {
    players.add(message.author.id);
    message.reply("✅ 参加しました");
  }

  if (command === "leave") {
    players.delete(message.author.id);
    message.reply("🚪 退出しました");
  }

  // ===== 役職設定 =====
  if (command === "setrole") {
    const role = args[0];
    const count = Number(args[1]);
    if (!role || isNaN(count)) {
      return message.reply("❌ `/setrole 役職名 人数`");
    }
    roles[role] = count;
    message.reply(`🧩 役職設定: ${role} × ${count}`);
  }

  // ===== フェーズ時間設定 =====
  if (command === "settime") {
    const type = args[0];
    const time = Number(args[1]);
    if (!["day", "night"].includes(type) || isNaN(time)) {
      return message.reply("❌ `/settime day|night 秒数`");
    }
    if (type === "day") dayTime = time;
    if (type === "night") nightTime = time;
    message.reply(`⏱ ${type} フェーズ時間を ${time} 秒に設定`);
  }

  // ===== 開始提案 =====
  if (command === "start") {
    if (players.size < totalRoles()) {
      return message.reply("❌ 参加人数が役職数より少ないため開始できません");
    }
    startRequested = true;
    startVotes.clear();
    message.channel.send(
      "⚠️ ゲーム開始提案\n`/agree` で賛成、`/disagree` で反対"
    );
  }

  // ===== 投票 =====
  if (command === "agree" && startRequested) {
    startVotes.add(message.author.id);

    if (startVotes.size > players.size / 2) {
      message.channel.send("🎉 過半数賛成！ゲームを開始します");
      startRequested = false;

      // 役職配布
      let rolePool = [];
      for (const [role, count] of Object.entries(roles)) {
        for (let i = 0; i < count; i++) rolePool.push(role);
      }

      shuffle(rolePool);

      const playerArray = Array.from(players);
      for (let i = 0; i < playerArray.length; i++) {
        const user = await client.users.fetch(playerArray[i]);
        const role = rolePool[i];
        assignedRoles.set(playerArray[i], role);
        await user.send(`🃏 あなたの役職は **${role}** です`);
      }

      startPhase(message.channel, "day", dayTime);
    }
  }

  if (command === "disagree" && startRequested) {
    message.reply("❌ 反対しました");
  }
});

// ===== ログイン =====
client.login(process.env.DISCORD_TOKEN);
