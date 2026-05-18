import { createRouter, publicQuery } from "./middleware.js";
import { z } from "zod";
import {
  findAllListings,
  findListingById,
  createListing,
  deleteListing,
  findPublisherByFingerprint,
  createPublisher,
  findListingByPublisherId,
} from "./queries/listings.js";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  listing: createRouter({
    list: publicQuery
      .input(z.object({ category: z.string().optional() }).optional())
      .query(({ input }) => findAllListings(input?.category)),

    getById: publicQuery
      .input(z.object({ id: z.number() }))
      .query(({ input }) => findListingById(input.id)),

    create: publicQuery
      .input(
        z.object({
          category: z.string().min(1).max(50),
          title: z.string().min(1).max(200),
          description: z.string().min(1).max(2000),
          serverName: z.string().max(200).optional(),
          price: z.string().max(100).optional(),
          contactType: z.enum(["wechat", "qq"]),
          contactValue: z.string().min(1).max(200),
          publisherId: z.string().min(1).max(255),
        })
      )
      .mutation(async ({ input }) => {
        // Check if publisher already has a listing
        const existing = await findListingByPublisherId(input.publisherId);
        if (existing) {
          throw new Error("每个人只能发布一个帖子");
        }

        // Ensure publisher exists
        let publisher = await findPublisherByFingerprint(input.publisherId);
        if (!publisher) {
          publisher = await createPublisher(input.publisherId);
        }

        return createListing(input);
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
  }),
});

export type AppRouter = typeof appRouter;
