import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../lib/security.js";
import { classifyFeedbackText } from "../lib/aiService.js";
import { ensureFeedbackEmbedding } from "../lib/vectorRagService.js";
import { parseFeedbackCsv } from "../lib/csvParser.js";
import { getSimulatedFeed } from "../lib/simulatedIngestion.js";

const router = Router();

// GET /api/feedback
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await requireAuth(req);

    const search = (req.query.search as string) || undefined;
    const sentiment = (req.query.sentiment as string) || undefined;
    const status = (req.query.status as string) || undefined;
    const channel = (req.query.channel as string) || undefined;
    const theme = (req.query.theme as string) || (req.query.themeId as string) || undefined;
    const dateFrom = (req.query.dateFrom as string) || undefined;
    const dateTo = (req.query.dateTo as string) || undefined;

    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "50", 10);
    const skip = (page - 1) * limit;

    const whereClause: any = {
      workspaceId: session.workspaceId,
    };

    if (search) {
      whereClause.OR = [
        { content: { contains: search } },
        { customerLabel: { contains: search } },
        { sourceRef: { contains: search } },
      ];
    }

    if (sentiment) whereClause.sentiment = sentiment;
    if (status) whereClause.status = status;
    if (channel) whereClause.channel = channel;

    if (theme) {
      whereClause.themes = {
        some: {
          OR: [
            { themeId: theme },
            { theme: { name: { contains: theme } } },
          ],
        },
      };
    }

    if (dateFrom || dateTo) {
      whereClause.createdAt = {};

      if (dateFrom) {
        whereClause.createdAt.gte = new Date(dateFrom);
      }

      if (dateTo) {
        whereClause.createdAt.lte = new Date(dateTo);
      }
    }

    const [total, feedbacks] = await Promise.all([
      prisma.feedback.count({
        where: whereClause,
      }),

      prisma.feedback.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          themes: {
            include: {
              theme: true,
            },
          },
        },
      }),
    ]);

    res.json({
      feedbacks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    console.error("Fetch feedback error:", error);

    res.status(500).json({
      error: "Failed to fetch feedback",
    });
  }
});

// POST /api/feedback
router.post("/", async (req: Request, res: Response): Promise<void> => {
  try {
    const session = await requireRole(["ADMIN", "ANALYST"], req);

    const {
      content,
      channel,
      sourceRef,
      customerLabel,
      sentiment,
      sentimentScore,
      status,
      createdAt,
    } = req.body;

    if (
      !content ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      res.status(400).json({
        error: "Content is required for feedback",
      });
      return;
    }

    const feedback = await prisma.feedback.create({
      data: {
        content: content.trim(),
        channel: channel || "MANUAL",
        sourceRef: sourceRef || null,
        customerLabel: customerLabel || null,
        sentiment: sentiment || "Neutral",
        sentimentScore:
          typeof sentimentScore === "number" ? sentimentScore : null,
        status: status || "NEW",
        createdAt: createdAt ? new Date(createdAt) : new Date(),
        workspaceId: session.workspaceId,
      },
    });

    try {
      await ensureFeedbackEmbedding(feedback.id, feedback.content);
    } catch (embErr) {
      console.warn("Could not generate embedding for new feedback:", embErr);
    }

    res.status(201).json({
      feedback,
    });
  } catch (error: any) {
    if (error.statusCode) {
      res.status(error.statusCode).json({
        error: error.message,
      });
      return;
    }

    console.error("Create feedback error:", error);

    res.status(500).json({
      error: "Failed to create feedback",
    });
  }
});

// POST /api/feedback/classify
router.post(
  "/classify",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await requireRole(["ADMIN", "ANALYST"], req);
      const { feedbackId } = req.body;

      if (feedbackId) {
        const feedback = await prisma.feedback.findUnique({
          where: { id: feedbackId },
        });

        if (
          !feedback ||
          feedback.workspaceId !== session.workspaceId
        ) {
          res.status(404).json({
            error: "Feedback item not found",
          });
          return;
        }

        const classification = await classifyFeedbackText(
          feedback.content
        );

        const updated = await prisma.feedback.update({
          where: { id: feedbackId },
          data: {
            sentiment: classification.sentiment,
            sentimentScore: classification.sentimentScore,
            featureArea: classification.featureArea,
            rationale: classification.rationale,
          },
        });

        // Link AI-classified themes to feedback in database
        if (classification.themes && classification.themes.length > 0) {
          for (const themeName of classification.themes) {
            if (!themeName || !themeName.trim()) continue;
            let theme = await prisma.theme.findFirst({
              where: { workspaceId: session.workspaceId, name: themeName.trim() },
            });
            if (!theme) {
              theme = await prisma.theme.create({
                data: {
                  name: themeName.trim(),
                  description: `AI-identified theme: ${themeName.trim()}`,
                  workspaceId: session.workspaceId,
                },
              });
            }
            await prisma.feedbackTheme.upsert({
              where: {
                feedbackId_themeId: {
                  feedbackId: feedback.id,
                  themeId: theme.id,
                },
              },
              create: {
                feedbackId: feedback.id,
                themeId: theme.id,
                confidence: 0.95,
              },
              update: {
                confidence: 0.95,
              },
            });
          }
        }

        await ensureFeedbackEmbedding(
          feedback.id,
          feedback.content
        );

        res.json({
          feedback: updated,
          classification,
        });
      } else {
        const unclassified = await prisma.feedback.findMany({
          where: {
            workspaceId: session.workspaceId,
          },
        });

        let count = 0;

        for (const fb of unclassified) {
          const classification = await classifyFeedbackText(
            fb.content
          );

          await prisma.feedback.update({
            where: { id: fb.id },
            data: {
              sentiment: classification.sentiment,
              sentimentScore: classification.sentimentScore,
              featureArea: classification.featureArea,
              rationale: classification.rationale,
            },
          });

          await ensureFeedbackEmbedding(
            fb.id,
            fb.content
          );

          count++;
        }

        res.json({
          message: `Successfully classified ${count} feedback items`,
          count,
        });
      }
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          error: error.message,
        });
        return;
      }

      console.error("Classification error:", error);

      res.status(500).json({
        error: "Failed to classify feedback",
      });
    }
  }
);

// POST /api/feedback/import
router.post(
  "/import",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await requireRole(["ADMIN", "ANALYST"], req);

      let csvContent = req.body?.csv || req.body?.text || req.body?.content || req.body?.file;

      // Handle raw string payload or multipart form data string
      if (!csvContent && typeof req.body === "string" && req.body.trim()) {
        const bodyStr = req.body.trim();
        if (bodyStr.includes("Content-Disposition:")) {
          const headerEnd = bodyStr.indexOf("\r\n\r\n");
          const boundaryEnd = bodyStr.lastIndexOf("------");
          if (headerEnd !== -1) {
            csvContent = bodyStr.substring(headerEnd + 4, boundaryEnd !== -1 ? boundaryEnd : undefined).trim();
          }
        } else {
          csvContent = bodyStr;
        }
      }

      if (!csvContent || typeof csvContent !== "string") {
        res.status(400).json({
          error: "No CSV content provided",
        });
        return;
      }

      const parseResult = parseFeedbackCsv(csvContent);

      if (parseResult.validRows.length === 0) {
        res.status(400).json({
          error: "No valid feedback rows found in CSV",
          failedCount: parseResult.failedRows.length,
          failedRows: parseResult.failedRows,
        });
        return;
      }

      const dataToInsert = parseResult.validRows.map((row) => ({
        content: row.content,
        channel: row.channel,
        customerLabel: row.customerLabel || null,
        createdAt: row.createdAt || new Date(),
        sentiment: row.sentiment || "Neutral",
        status: row.status || "NEW",
        workspaceId: session.workspaceId,
      }));

      await prisma.feedback.createMany({
        data: dataToInsert,
      });

      res.json({
        message: `Successfully imported ${parseResult.validRows.length} feedback items`,
        count: parseResult.validRows.length,
        importedCount: parseResult.validRows.length,
        failedCount: parseResult.failedRows.length,
        failedRows: parseResult.failedRows,
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          error: error.message,
        });
        return;
      }

      console.error("CSV Import error:", error);

      res.status(500).json({
        error:
          error.message ||
          "Failed to process CSV import file",
      });
    }
  }
);

// POST /api/feedback/simulate
router.post(
  "/simulate",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await requireRole(["ADMIN", "ANALYST"], req);

      const rawChannel = req.body?.channel || req.body?.channelType || "all";
      let channelType = "all";
      const normalized = String(rawChannel).toLowerCase();
      if (normalized.includes("support")) channelType = "support";
      else if (normalized.includes("review") || normalized.includes("app")) channelType = "app_reviews";
      else if (normalized.includes("nps") || normalized.includes("survey")) channelType = "nps";
      else if (normalized.includes("sale")) channelType = "sales";
      else channelType = normalized;

      let simulatedItems = getSimulatedFeed(channelType);
      if (req.body?.count && Number(req.body.count) > 0) {
        simulatedItems = simulatedItems.slice(0, Number(req.body.count));
      }

      const dataToInsert = simulatedItems.map((item) => ({
        content: item.content,
        channel: item.channel,
        customerLabel: item.customerLabel,
        sentiment: item.sentiment,
        status: item.status,
        createdAt: item.createdAt,
        workspaceId: session.workspaceId,
      }));

      await prisma.feedback.createMany({
        data: dataToInsert,
      });

      res.json({
        message: "Simulated channel feed imported successfully",
        count: dataToInsert.length,
        importedCount: dataToInsert.length,
        channel: req.body?.channel || channelType,
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          error: error.message,
        });
        return;
      }

      console.error("Simulated ingestion error:", error);

      res.status(500).json({
        error: "Failed to simulate channel ingestion",
      });
    }
  }
);

// GET /api/feedback/:id
router.get(
  "/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await requireAuth(req);

      const id = String(req.params.id);

      const feedback = await prisma.feedback.findUnique({
        where: { id },
        include: {
          themes: {
            include: {
              theme: true,
            },
          },
        },
      });

      if (!feedback) {
        res.status(404).json({
          error: "Feedback item not found",
        });
        return;
      }

      if (feedback.workspaceId !== session.workspaceId) {
        res.status(403).json({
          error:
            "Forbidden: Cross-workspace access attempt blocked",
        });
        return;
      }

      res.json({
        feedback,
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        error: "Failed to fetch feedback",
      });
    }
  }
);

// PATCH /api/feedback/:id
router.patch(
  "/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await requireRole(
        ["ADMIN", "ANALYST"],
        req
      );

      const id = String(req.params.id);

      const existingFeedback =
        await prisma.feedback.findUnique({
          where: { id },
        });

      if (!existingFeedback) {
        res.status(404).json({
          error: "Feedback item not found",
        });
        return;
      }

      if (
        existingFeedback.workspaceId !==
        session.workspaceId
      ) {
        res.status(403).json({
          error:
            "Forbidden: Cross-workspace access attempt blocked",
        });
        return;
      }

      const {
        content,
        channel,
        sourceRef,
        customerLabel,
        sentiment,
        sentimentScore,
        status,
      } = req.body;

      const updatedFeedback =
        await prisma.feedback.update({
          where: { id },
          data: {
            ...(content !== undefined && { content }),
            ...(channel !== undefined && { channel }),
            ...(sourceRef !== undefined && { sourceRef }),
            ...(customerLabel !== undefined && {
              customerLabel,
            }),
            ...(sentiment !== undefined && { sentiment }),
            ...(sentimentScore !== undefined && {
              sentimentScore,
            }),
            ...(status !== undefined && { status }),
          },
        });

      res.json({
        feedback: updatedFeedback,
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        error: "Failed to update feedback",
      });
    }
  }
);

// DELETE /api/feedback/:id
router.delete(
  "/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const session = await requireRole(
        ["ADMIN", "ANALYST"],
        req
      );

      const id = String(req.params.id);

      const existingFeedback =
        await prisma.feedback.findUnique({
          where: { id },
        });

      if (!existingFeedback) {
        res.status(404).json({
          error: "Feedback item not found",
        });
        return;
      }

      if (
        existingFeedback.workspaceId !==
        session.workspaceId
      ) {
        res.status(403).json({
          error:
            "Forbidden: Cross-workspace access attempt blocked",
        });
        return;
      }

      await prisma.feedback.delete({
        where: { id },
      });

      res.json({
        message: "Feedback deleted successfully",
      });
    } catch (error: any) {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        error: "Failed to delete feedback",
      });
    }
  }
);

export default router;
