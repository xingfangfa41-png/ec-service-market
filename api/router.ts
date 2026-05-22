import { createRouter, publicQuery } from "./middleware.js";
import { z } from "zod";
import {
  findAllListings,
  findListingById,
  createListing,
  updateListing,
  deleteListing,
  findPublisherByFingerprint,
  createPublisher,
  findListingByPublisherId,
  checkPublisherCooldown,
  updatePublisherLastPosted,
} from "./queries/listings.js";

/** Blocked keywords for spam prevention */
const BLOCKED_KEYWORDS = [
  "http://", "https://", "www.", ".com", ".cn", ".net", ".org",
  "加群", "群号", "QQ群", "微信群", "扫码", "二维码",
  "点击", "链接", "网址", "网站", "访问", "免费领", "赚钱",
  "刷单", "返利", "诈骗", "骗子", "钓鱼", "盗号", "外挂",
  "辅助", "脚本", "bot", "spam", "advertisement",
  "代购", "代练", "工作室", "Farm", "farming",
];

const ALLOWED_DOMAINS = [
  "ec-crystal-war.com",
  "github.com",
];

function containsBlockedContent(text: string): boolean {
  const lower = text.toLowerCase();
  return BLOCKED_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function sanitizeText(text: string): string {
  // Remove zero-width characters and excessive whitespace
  return text
    .replace(/[\u200B-\u200D\uFEFF\u2060\u180E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  listing: createRouter({
    list: publicQuery
      .input(z.object({ category: z.string().optional() }).optional().nullable())
      .query(({ input }) => findAllListings(input?.category ?? undefined)),

    getById: publicQuery
      .input(z.object({ id: z.number() }))
      .query(({ input }) => findListingById(input.id)),

    create: publicQuery
      .input(
        z.object({
          category: z.string().min(1).max(50),
          title: z.string().min(3).max(200),
          description: z.string().min(10).max(2000),
          serverName: z.string().max(200).optional(),
          price: z.string().max(100).optional(),
          contactType: z.enum(["wechat", "qq"]),
          contactValue: z.string().min(1).max(200),
          publisherId: z.string().uuid().max(255),
        })
      )
      .mutation(async ({ input }) => {
        // 1. Sanitize inputs
        const title = sanitizeText(input.title);
        const description = sanitizeText(input.description);

        if (title.length < 3) throw new Error("标题太短，至少3个字符");
        if (description.length < 10) throw new Error("描述太短，至少10个字符");

        // 2. Content security check
        if (containsBlockedContent(title) || containsBlockedContent(description)) {
          throw new Error("内容包含不允许的关键词或链接");
        }

        // 3. Check if publisher already has an existing listing
        const existing = await findListingByPublisherId(input.publisherId);
        if (existing) {
          throw new Error("你已经发布过帖子了，每个人只能发布一个");
        }

        // 4. Check 30-minute cooldown (even for new publishers)
        const cooldown = await checkPublisherCooldown(input.publisherId);
        if (cooldown.inCooldown) {
          const mins = Math.ceil(cooldown.remainingSeconds / 60);
          throw new Error(`发布太频繁，请等待 ${mins} 分钟后再试`);
        }

        // 5. Ensure publisher exists
        let publisher = await findPublisherByFingerprint(input.publisherId);
        if (!publisher) {
          publisher = await createPublisher(input.publisherId);
        }

        // 6. Create the listing
        const listing = await createListing({
          ...input,
          title,
          description,
        });

        // 7. Update last posted timestamp
        await updatePublisherLastPosted(input.publisherId);

        return listing;
      }),

    update: publicQuery
      .input(
        z.object({
          id: z.number(),
          publisherId: z.string().uuid(),
          category: z.string().min(1).max(50),
          title: z.string().min(3).max(200),
          description: z.string().min(10).max(2000),
          serverName: z.string().max(200).optional(),
          price: z.string().max(100).optional(),
          contactType: z.enum(["wechat", "qq"]),
          contactValue: z.string().min(1).max(200),
        })
      )
      .mutation(async ({ input }) => {
        const listing = await findListingById(input.id);
        if (!listing) throw new Error("帖子不存在");
        if (listing.publisherId !== input.publisherId) throw new Error("无权编辑此帖子");

        const title = sanitizeText(input.title);
        const description = sanitizeText(input.description);
        if (containsBlockedContent(title) || containsBlockedContent(description)) {
          throw new Error("内容包含不允许的关键词或链接");
        }

        return updateListing(input.id, {
          category: input.category,
          title,
          description,
          serverName: input.serverName,
          price: input.price,
          contactType: input.contactType,
          contactValue: input.contactValue,
        });
      }),

    delete: publicQuery
      .input(z.object({ id: z.number(), publisherId: z.string() }))
      .mutation(async ({ input }) => {
        const listing = await findListingById(input.id);
        if (!listing) {
          throw new Error("帖子不存在");
        }
        if (listing.publisherId !== input.publisherId) {
          throw new Error("无权删除此帖子");
        }
        return deleteListing(input.id);
      }),

    checkPublisher: publicQuery
      .input(z.object({ publisherId: z.string() }))
      .query(({ input }) => findListingByPublisherId(input.publisherId)),

    /** Check cooldown status for frontend display */
    cooldownStatus: publicQuery
      .input(z.object({ publisherId: z.string().uuid() }))
      .query(async ({ input }) => {
        return checkPublisherCooldown(input.publisherId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
