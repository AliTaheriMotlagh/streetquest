// Demo data. Run: npm run db:seed  (set SEED_LAT/SEED_LNG to seed near you)
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const lat = Number(process.env.SEED_LAT ?? 51.5079);
const lng = Number(process.env.SEED_LNG ?? -0.0877);

async function user(username: string, role = "PLAYER", xp = 0, avatar = "🕶️") {
  return prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, email: `${username.toLowerCase()}@example.com`, passwordHash: await bcrypt.hash("password123", 10), role, xp, avatar, referralCode: username.toUpperCase() },
  });
}

const admin = await user("admin", "ADMIN", 5000, "👑");
const vee = await user("VeeRunner", "PLAYER", 2400, "🦊");
const kai = await user("KaiNight", "PLAYER", 900, "🥷");
await user("Lola", "PLAYER", 300, "🐯");
await prisma.friendship.upsert({ where: { requesterId_addresseeId: { requesterId: vee.id, addresseeId: kai.id } }, update: {}, create: { requesterId: vee.id, addresseeId: kai.id, status: "ACCEPTED" } });

if (!(await prisma.announcement.count()))
  await prisma.announcement.create({ data: { title: "Launch week: double chest loot!", body: "Crack chests this week for bonus rewards.", ctaLabel: "Play", ctaUrl: "/play" } });

const start = new Date(Date.now() + 2 * 3600_000);
await prisma.event.upsert({
  where: { slug: "launch-night-hunt" },
  update: {},
  create: {
    slug: "launch-night-hunt",
    title: "Launch Night Hunt",
    description: "Official kickoff. Meet at the meeting point, sweep the area as a squad and stack the group bonus.",
    lat: lat + 0.001,
    lng: lng + 0.001,
    startsAt: start,
    endsAt: new Date(start.getTime() + 3 * 3600_000),
    creatorId: admin.id,
    official: true,
    rewardXp: 500,
    rewardCoins: 150,
    participants: { create: [{ userId: admin.id }, { userId: vee.id }] },
  },
});

if (!(await prisma.adminMission.count()))
  await prisma.adminMission.create({
    data: { title: "The Vault Job", description: "A sponsor left a diamond near here. First come, first served.", lat: lat - 0.0008, lng: lng + 0.0006, itemKey: "diamond", rewardXp: 500, rewardCoins: 200, activeFrom: new Date(), activeTo: new Date(Date.now() + 30 * 86400_000), sponsor: "Demo Brand" },
  });

console.log(`Seeded around ${lat},${lng}. Logins: admin / VeeRunner / KaiNight / Lola — password: password123`);
await prisma.$disconnect();
