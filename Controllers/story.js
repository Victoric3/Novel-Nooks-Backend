const asyncErrorWrapper = require("express-async-handler");
const Story = require("../Models/story");
const User = require("../Models/user");
const deleteImageFile = require("../Helpers/Libraries/deleteImageFile");
const { createNotification } = require("./notification");
const fs = require('fs');
const path = require('path');
const EPub = require('epub-gen');
const os = require('os');
const util = require('util');

// Updated to handle PDF uploads
const addStory = async (req, res) => {
  try {
    let { title, summary, tags, prizePerChapter, free, contentCount, completed } = req.body;

    // Process JSON fields that may be sent as strings
    tags = typeof tags === 'string' ? JSON.parse(tags) : (tags || []);
    contentCount = req.pdfData?.contentCount ||
      (typeof contentCount === 'string' ? JSON.parse(contentCount) : (contentCount || []));

    // Only admins are allowed to create stories
    if (req.user.role !== "admin") {
      return res.status(401).json({
        status: "unauthorized",
        errorMessage: "You need to have admin access to do this",
      });
    }

    // Check if PDF was processed
    if (!req.pdfData && !req.body.content) {
      return res.status(400).json({
        success: false,
        errorMessage: "No PDF file or content provided",
      });
    }

    // Use PDF data if available, otherwise use provided content
    let content = req.pdfData?.content || [];

    if (!content || content.length === 0) {
      return res.status(400).json({
        success: false,
        errorMessage: "Content is empty or not provided",
      });
    }

    // Ensure content is an array of chapters
    if (!Array.isArray(content)) {
      return res.status(400).json({
        success: false,
        errorMessage: "Content must be an array of chapters",
      });
    }

    // Validate chapter content
    const shortContent = content.filter(item => item.length < 100);
    if (shortContent.length > 0) {
      return res.status(400).json({
        success: false,
        errorMessage: "Each chapter must be at least 100 characters",
      });
    }

    // Use calculated read times or calculate based on content
    const readTime = req.pdfData?.readTimes || content.map(chapter => {
      const wordCount = chapter?.trim().split(/\s+/).length;
      return Math.floor(wordCount / 200);
    });

    // Create the story
    const newStory = await Story.create({
      title,
      content,
      author: req.user._id,
      image: req.fileLink || "https://i.ibb.co/Jx8zhtr/story.jpg",
      readTime,
      tags,
      summary,
      prizePerChapter,
      free,
      completed: completed ?? true,
      contentCount: contentCount.length > 0 ? contentCount :
        Array.from({ length: content.length }, (_, i) => `Chapter ${i + 1}`),
      contentCount: content.length,
    });

    // Send notification to all users with the "books" preference
    // const users = await User.find({
    //   'notificationSettings.books': true
    // });

    // // Send notifications to interested users
    // const notificationPromises = users.map(user => 
    //   createNotification(
    //     user._id,
    //     "STORY_UPDATE",
    //     "New Story Published",
    //     `${title} - A new story is now available!`,
    //     {
    //       storyId: newStory._id,
    //       slug: newStory.slug,
    //       image: newStory.image,
    //       route: "book_detail",
    //       params: { slug: newStory.slug }
    //     }
    //   )
    // );

    // // Don't await notifications to speed up response
    // Promise.allSettled(notificationPromises).catch(err => 
    //   console.error("Failed to send notifications:", err)
    // );

    // Send success response
    return res.status(200).json({
      success: true,
      message: "Story added successfully",
      data: newStory,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      status: "failed",
      errorMessage: error.message || "Internal server error",
    });
  }
};

const addImage = asyncErrorWrapper(async (req, res, next) => {
  try {
    if (!req.fileLink) {
      return res.status(400).json({
        success: false,
        errorMessage: "file could not be processed",
      });
    }
    res.status(200).json({
      success: true,
      message: "file uploaded successfully",
      url: req.fileLink,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      errorMessage: error || "internal server error",
    });
  }
});

const getAllStories = async (req, res) => {
  try {
    const { specific } = req.body;
    const { slug } = req.params;
    const searchQuery = req.query.search || "";
    const authorUsername = req.query.author;
    const tags = req.query.tags;
    const free = req.query.free;
    const completed = req.query.completed;
    const minRating = req.query.minRating;
    const minLikes = req.query.minLikes;
    const section = req.query.section;
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * pageSize;
    const userId = req.user?._id;

    // Define section-to-sort-field mapping
    const sectionSortMap = {
      trending: "rankPoints",
      newReleases: "createdAt",
      topRated: "averageRating",
      free: "rankPoints", // Top Free Reads
      bestSelling: "likeCount", // Proxy for sales; use purchaseCount if available
      editorPicks: "rankPoints",
      topCommented: "commentCount",
    };

    const pipeline = [
      // Stage 1: Calculate likeCount and contentCount with safer checks
      {
        $addFields: {
          likeCount: {
            $cond: {
              if: { $isArray: "$likes" },
              then: { $size: "$likes" },
              else: 0,
            },
          },
          contentCount: {
            $cond: {
              if: { $isArray: "$content" },
              then: { $size: "$content" },
              else: 0,
            },
          },
        },
      },
      // Stage 2: Calculate rankPoints
      {
        $addFields: {
          rankPoints: {
            $add: [
              { $multiply: ["$commentCount", 2] },
              "$likeCount",
              {
                $cond: [
                  { $gte: ["$averageRating", 3] },
                  { $multiply: ["$averageRating", "$ratingCount", 10] },
                  {
                    $multiply: [
                      { $subtract: [3, "$averageRating"] },
                      "$ratingCount",
                      -10,
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      // Stage 3: Join with users collection for author info
      {
        $lookup: {
          from: "users",
          let: { authorId: "$author" },
          pipeline: [
            { $match: { $expr: { $eq: ["$_id", "$$authorId"] } } },
            { $project: { username: 1 } },
          ],
          as: "authorInfo",
        },
      },
      { $unwind: "$authorInfo" },
      // Stage 4: Apply section-specific filters
      ...(section === "free" ? [{ $match: { free: true } }] : []),
      ...(section === "editorPicks" ? [{ $match: { isEditorPick: true } }] : []),
      // Stage 5: Apply general filters
      ...(tags ? [{ $match: { tags: { $all: tags.split(",") } } }] : []),
      ...(free !== undefined
        ? [{ $match: { free: free === "true" } }]
        : []),
      ...(completed !== undefined
        ? [{ $match: { completed: completed === "true" } }]
        : []),
      ...(minRating
        ? [{ $match: { averageRating: { $gte: parseFloat(minRating) } } }]
        : []),
      ...(minLikes
        ? [{ $match: { likeCount: { $gte: parseInt(minLikes) } } }]
        : []),
      ...(searchQuery
        ? [
          {
            $match: {
              $or: [
                { title: { $regex: new RegExp(searchQuery, "i") } },
                { summary: { $regex: new RegExp(searchQuery, "i") } },
              ],
            },
          },
        ]
        : []),
      ...(authorUsername
        ? [{ $match: { "authorInfo.username": authorUsername } }]
        : []),
      // Stage 6: Add likeStatus and isInReadingList if user is authenticated
      ...(userId
        ? [
          {
            $lookup: {
              from: "users",
              let: { storyId: { $toString: "$_id" } },
              pipeline: [
                { $match: { _id: userId } },
                {
                  $project: {
                    _id: 0,
                    // Check if likes array exists and contains story ID
                    hasLiked: {
                      $cond: {
                        if: { $isArray: "$likes" },
                        then: {
                          $in: [
                            "$$storyId",
                            { $map: { input: "$likes", as: "id", in: { $toString: "$$id" } } }
                          ]
                        },
                        else: false
                      }
                    },
                    // Check if readList array exists and contains story ID
                    isInReadingList: {
                      $cond: {
                        if: { $isArray: "$readList" },
                        then: {
                          $in: [
                            "$$storyId",
                            { $map: { input: "$readList", as: "id", in: { $toString: "$$id" } } }
                          ]
                        },
                        else: false
                      }
                    }
                  }
                }
              ],
              as: "userInteraction"
            }
          },
          {
            $addFields: {
              // Handle case where no user document was found
              userInteraction: {
                $cond: {
                  if: { $gt: [{ $size: "$userInteraction" }, 0] },
                  then: { $arrayElemAt: ["$userInteraction", 0] },
                  else: { hasLiked: false, isInReadingList: false }
                }
              }
            }
          },
          {
            $addFields: {
              likeStatus: { $ifNull: ["$userInteraction.hasLiked", false] },
              isInReadingList: { $ifNull: ["$userInteraction.isInReadingList", false] }
            }
          },
          {
            $project: {
              userInteraction: 0
            }
          }
        ]
        : [
          {
            $addFields: {
              likeStatus: false,
              isInReadingList: false
            }
          }
        ]),
      // Stage 7: Apply sorting
      ...(section && sectionSortMap[section]
        ? [{ $sort: { [sectionSortMap[section]]: -1 } }]
        : section === "recommended" && userId
          ? [
            // Recommended: Boost stories matching user's preferred tags
            {
              $lookup: {
                from: "users",
                let: { userId: userId },
                pipeline: [
                  { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
                  { $project: { preferredTags: 1 } },
                ],
                as: "userData",
              },
            },
            { $unwind: "$userData" },
            {
              $addFields: {
                tagMatchCount: {
                  $cond: {
                    if: {
                      $and: [
                        { $isArray: "$tags" },
                        { $isArray: "$userData.preferredTags" }
                      ]
                    },
                    then: { $size: { $ifNull: [{ $setIntersection: ["$tags", "$userData.preferredTags"] }, []] } },
                    else: 0
                  }
                }
              }
            },
            { $sort: { tagMatchCount: -1, rankPoints: -1 } },
          ]
          : specific && slug === "recent"
            ? [{ $sort: { createdAt: -1 } }]
            : specific
              ? [{ $match: { tags: slug } }, { $sort: { rankPoints: -1 } }]
              : slug
                ? [
                  {
                    $addFields: {
                      rankPoints: {
                        $add: [
                          "$rankPoints",
                          {
                            $multiply: [
                              // Replace this problematic section
                              {
                                $size: {
                                  $ifNull: [
                                    { $setIntersection: ["$tags", slug.split("+").filter(Boolean)] },
                                    []
                                  ]
                                }
                              },
                              1000,
                            ],
                          },
                        ],
                      },
                    },
                  },
                  { $sort: { rankPoints: -1 } },
                ]
                : [{ $sort: { rankPoints: -1 } }]),
      // Stage 8: Pagination with $facet
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: pageSize },
            {
              $project: {
                _id: 1,
                title: 1,
                slug: 1,
                summary: 1,
                tags: 1,
                image: 1,
                readTime: 1,
                free: 1,
                prizePerChapter: 1,
                createdAt: 1,
                updatedAt: 1,
                author: {
                  _id: "$author",
                  username: "$authorInfo.username",
                },
                likeCount: 1,
                commentCount: 1,
                averageRating: 1,
                ratingCount: 1,
                rankPoints: 1,
                contentCount: 1,
                likeStatus: { $ifNull: ["$likeStatus", false] },
                isInReadingList: { $ifNull: ["$isInReadingList", false] },
                ratings: {
                  $cond: {
                    if: { $isArray: "$ratings" },
                    then: "$ratings",
                    else: []
                  }
                }
              },
            },
          ],
        },
      },
    ];

    // Execute the aggregation
    const [result] = await Story.aggregate(pipeline);
    const { metadata, data } = result || { metadata: [], data: [] };
    const totalCount = metadata[0]?.total || 0;


    return res.status(200).json({
      success: true,
      count: data.length,
      data: data,
      page: page,
      pages: Math.ceil(totalCount / pageSize),
      total: totalCount,
    });
  } catch (error) {
    console.error("Error in getAllStories:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Convert the detailStory controller to handle EPUB generation
const detailStory = async (req, res) => {
  const { id } = req.params;
  const tempDir = os.tmpdir();
  const epubFileName = `${Date.now()}-${Math.floor(Math.random() * 1000)}.epub`;
  const epubFilePath = path.join(tempDir, epubFileName);

  try {
    // Parallel fetch of user and story data for better performance
    const [user, story] = await Promise.all([
      User.findById(req.user._id, "free vouchers purchased"),
      Story.findById(id).select("title slug summary image content contentTitles free prizePerChapter author tags").lean()
    ]);

    // Early validation checks
    if (!user) {
      return res.status(404).json({
        success: false,
        errorMessage: "User not found",
      });
    }

    if (!story) {
      return res.status(404).json({
        success: false,
        errorMessage: "Story not found",
      });
    }

    // Get author information for EPUB metadata
    const author = await User.findById(story.author, "username").lean();
    const authorName = author ? author.username : "Unknown Author";

    // Determine which chapters to include
    let chaptersToInclude = [];

    // Free book or premium user gets all chapters
    if (story.free || !user.free) {
      chaptersToInclude = story.content.map((_, index) => index);
    } else {
      // Calculate total cost for non-free chapters after index 4 (first 5 are free)
      const nonFreeChapters = story.content.length - 5;
      const totalCost = nonFreeChapters > 0 ? story.prizePerChapter * nonFreeChapters : 0;

      // Check if user has purchased any chapters
      const purchasedChapters =
        user.purchased.find(item => item.slug === story.slug)?.chapter || [];

      if (user.vouchers >= totalCost) {
        // User can afford the entire book
        chaptersToInclude = story.content.map((_, index) => index);

        // Deduct vouchers for unpurchased chapters beyond the free tier
        const chaptersToPurchase = [];
        for (let i = 5; i < story.content.length; i++) {
          if (!purchasedChapters.includes(i)) {
            chaptersToPurchase.push(i);
          }
        }

        if (chaptersToPurchase.length > 0) {
          // Deduct vouchers
          user.vouchers -= story.prizePerChapter * chaptersToPurchase.length;

          // Update purchased chapters
          if (purchasedChapters.length > 0) {
            user.purchased = user.purchased.map(item => {
              if (item.slug === story.slug) {
                return {
                  ...item,
                  chapter: [...new Set([...item.chapter, ...chaptersToPurchase])]
                };
              }
              return item;
            });
          } else {
            user.purchased.push({
              slug: story.slug,
              chapter: chaptersToPurchase
            });
          }

          await user.save();
        }
      } else {
        // User can't afford the entire book - provide first 5 chapters
        isPartial = true;
        chaptersToInclude = [...Array(5).keys()];  // Indices 0-4 (first 5 chapters)
      }
    }

    // Update the CSS for chapter styling with subtitle support
    const chapterCSS = `
      .chapter-title {
        font-size: 2em;
        font-weight: bold;
        text-align: center;
        margin-bottom: 0.8em;
        page-break-after: avoid;
      }
      .chapter-subtitle {
        font-size: 1.3em;
        font-style: italic;
        font-weight: 600;
        text-align: center;
        margin-bottom: 2em;
        margin-top: 0;
        page-break-after: avoid;
      }
      .chapter-content {
        page-break-before: always;
        padding-top: 2em;
      }
      p {
        text-indent: 1.5em;
        margin-bottom: 0.5em;
        line-height: 1.5;
      }
    `;

    // Prepare EPUB content with chapters
    const epubChapters = chaptersToInclude.map(index => {
      const chapterTitle = story.contentTitles[index] || `Chapter ${index + 1}`;
      const chapterContent = story.content[index] || "Content not available";

      // Split the content into paragraphs
      const paragraphs = chapterContent.split('\n\n').filter(p => p.trim() !== '');

      // Extract the first paragraph as subtitle if it exists
      const subtitle = paragraphs.length > 0 ? paragraphs[0] : '';
      const remainingParagraphs = paragraphs.length > 1 ? paragraphs.slice(1) : [];

      // Format each chapter with HTML to control page breaks and styling
      return {
        title: chapterTitle,
        data: `
          <div class="chapter-content">
            <h1 class="chapter-title">${chapterTitle}</h1>
            <h2 class="chapter-subtitle">${subtitle}</h2>
            ${remainingParagraphs.map(para => `<p>${para}</p>`).join('')}
          </div>
        `,
        beforeToc: index === 0 // First chapter comes before TOC
      };
    });

    // Generate EPUB with updated options
    const epubOptions = {
      title: story.title,
      author: authorName,
      publisher: "Novel Nooks",
      cover: story.image || "https://i.ibb.co/Jx8zhtr/story.jpg",
      content: epubChapters,
      appendChapterTitles: false, // We're handling titles manually in the HTML
      customOpfTemplatePath: null,
      customNcxTocTemplatePath: null,
      customHtmlTocTemplatePath: null,
      lang: "en",
      tocTitle: "Table of Contents",
      version: 3,
      description: story.summary || "No summary available",
      genres: story.tags || [],
      css: chapterCSS, // Add our custom CSS
      fonts: [], // Can include custom fonts if needed
      verbose: false
    };

    // Create EPUB file - FIX: Added the output path as the second parameter
    await new EPub(epubOptions, epubFilePath).promise;

    // Send response with EPUB download
    return res.download(epubFilePath, `${story.title.replace(/[^\w\s]/gi, '')}.epub`, async (err) => {
      if (err) {
        console.error("Error sending EPUB file:", err);
      }

      // Clean up the temporary file
      try {
        fs.unlinkSync(epubFilePath);
      } catch (unlinkError) {
        console.error("Error deleting temporary EPUB:", unlinkError);
      }
    });

  } catch (error) {
    console.error("Error in detailStory:", error);

    // Clean up in case of error
    try {
      if (fs.existsSync(epubFilePath)) {
        fs.unlinkSync(epubFilePath);
      }
    } catch (unlinkError) {
      console.error("Error deleting temporary EPUB after error:", unlinkError);
    }

    return res.status(500).json({
      success: false,
      errorMessage: `Internal server error: ${error.message}`,
    });
  }
};

const likeStory = async (req, res) => {
  console.log("started liking story");
  const { id } = req.params;
  const userId = req.user._id;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  async function attemptUpdate() {
    try {
      // Use lean() for faster query and only select what's needed
      const [user, story] = await Promise.all([
        User.findById(userId).select("likes").lean(),
        Story.findById(id).select("likes likeCount __v").lean(),
      ]);

      if (!user) {
        return res.status(404).json({
          success: false,
          errorMessage: "User not found",
        });
      }

      if (!story) {
        return res.status(404).json({
          success: false,
          errorMessage: "Story not found",
        });
      }

      // Check if user has already liked the story
      const hasLiked = user.likes?.some(
        (likedStoryId) => likedStoryId.toString() === story._id.toString()
      );

      // Use findOneAndUpdate with version key check
      const updatedStory = await Story.findOneAndUpdate(
        {
          _id: story._id,
          __v: story.__v, // Version check
        },
        [
          {
            $set: {
              likes: {
                $cond: {
                  if: { $eq: [hasLiked, true] },
                  then: {
                    $filter: {
                      input: "$likes",
                      cond: { $ne: ["$$this", userId] },
                    },
                  },
                  else: {
                    // Ensure we don't add duplicate likes
                    $cond: {
                      if: { $in: [userId, "$likes"] },
                      then: "$likes",
                      else: { $concatArrays: ["$likes", [userId]] },
                    },
                  },
                },
              },
            },
          },
          {
            $set: {
              likeCount: { $size: "$likes" },
              __v: { $add: ["$__v", 1] }, // Increment version
            },
          },
        ],
        {
          new: true,
          runValidators: true,
        }
      )
        .select("likeCount") // Only select what's needed
        .lean(); // Use lean() to improve performance

      if (!updatedStory && retryCount < MAX_RETRIES) {
        retryCount++;
        return await attemptUpdate();
      }

      if (!updatedStory) {
        return res.status(409).json({
          success: false,
          errorMessage: "Concurrent update detected. Please try again.",
        });
      }

      // Update user's likes array
      await User.findOneAndUpdate(
        { _id: userId },
        hasLiked
          ? { $pull: { likes: story._id } }
          : { $addToSet: { likes: story._id } }
      );

      console.log("User's likes updated successfully");
      console.log(updatedStory);

      return res.status(200).json({
        success: true,
        data: updatedStory,
        likeStatus: !hasLiked
      });
    } catch (error) {
      if (error.name === "VersionError" && retryCount < MAX_RETRIES) {
        retryCount++;
        return await attemptUpdate();
      }

      console.error("Error in likeStory:", error);
      return res.status(500).json({
        success: false,
        errorMessage: "Internal server error",
      });
    }
  }

  return attemptUpdate();
};

const rateStory = async (req, res, next) => {
  const { rating } = req.body;
  const { id } = req.params;
  const userId = req.user._id;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  try {
    // Validate the rating value
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5.",
      });
    }

    async function attemptRatingUpdate() {
      try {
        console.log("STARTED getting story for rating");

        // Use findById with lean() and minimal field selection
        const story = await Story.findById(id)
          .select("ratings averageRating ratingCount __v")
          .lean();

        if (!story) {
          return res.status(404).json({
            success: false,
            message: "Story not found",
          });
        }

        // Find existing rating index without populating
        const existingRatingIndex = story.ratings.findIndex(
          (r) => r.user.toString() === userId.toString()
        );

        // The error is in how updateOperation is being used - we need to restructure this
        let updateQuery;

        if (existingRatingIndex !== -1) {
          // Update existing rating
          updateQuery = {
            $set: { [`ratings.${existingRatingIndex}.rating`]: rating },
          };
        } else {
          // Add new rating
          updateQuery = {
            $push: { ratings: { user: userId, rating } },
          };
        }

        // Use findOneAndUpdate with version check - NOT using pipeline array syntax
        const updatedStory = await Story.findOneAndUpdate(
          {
            _id: story._id,
            __v: story.__v // Version check
          },
          updateQuery,
          {
            new: true,
            runValidators: true
          }
        );

        // Now calculate average in a separate update
        if (updatedStory) {
          // Calculate average rating
          const ratings = updatedStory.ratings.map(r => r.rating);
          const averageRating = ratings.length > 0 ?
            ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;

          // Update the average and count
          updatedStory.averageRating = averageRating;
          updatedStory.ratingCount = ratings.length;
          updatedStory.__v += 1; // Increment version
          await updatedStory.save();

          return res.status(200).json({
            success: true,
            data: {
              averageRating: updatedStory.averageRating,
              ratingCount: updatedStory.ratingCount
            }
          });
        }

        if (retryCount < MAX_RETRIES) {
          retryCount++;
          return await attemptRatingUpdate();
        }

        return res.status(409).json({
          success: false,
          message: "Concurrent update detected. Please try again."
        });
      } catch (error) {
        if (error.name === "VersionError" && retryCount < MAX_RETRIES) {
          retryCount++;
          return await attemptRatingUpdate();
        }

        console.error("Error in rateStory:", error);
        return res.status(500).json({
          success: false,
          message: "Failed to update rating",
          error: process.env.NODE_ENV === "development" ? error.message : undefined
        });
      }
    }

    return attemptRatingUpdate();
  }
  catch (error) {
    console.error("Error in rateStory:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update rating",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });

  }
};

const editStoryPage = asyncErrorWrapper(async (req, res, next) => {
  const { slug } = req.params;

  const story = await Story.findOne({
    slug: slug,
  }).populate("author likes");

  return res.status(200).json({
    success: true,
    data: story,
  });
});

// Updated to handle PDF uploads for edits
const editStory = async (req, res) => {
  try {
    const { slug } = req.params;
    let { title, summary, tags, contentCount } = req.body;

    if (req.user.role !== "admin") {
      return res.status(401).json({
        errorMessage: "You are not allowed to do this",
      });
    }

    const story = await Story.findOne({ slug });
    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found",
      });
    }

    // Process JSON fields
    tags = typeof tags === 'string' ? JSON.parse(tags) : (tags || story.tags);
    contentCount = req.pdfData?.contentCount ||
      (typeof contentCount === 'string' ? JSON.parse(contentCount) : contentCount);

    // Update story basic info
    const previousImage = story.image;
    story.title = title || story.title;
    story.summary = summary || story.summary;
    story.tags = tags;
    story.image = req.fileLink || previousImage;

    // Handle image replacement
    if (req.fileLink && previousImage && previousImage !== "https://i.ibb.co/Jx8zhtr/story.jpg") {
      deleteImageFile(req, previousImage);
    }

    // If PDF uploaded, replace all content
    if (req.pdfData) {
      story.content = req.pdfData.content;
      story.contentCount = req.pdfData.contentCount;
      story.readTime = req.pdfData.readTimes;
      story.contentCount = contentCount || req.pdfData.contentCount;
      story.markModified("content");
      story.markModified("readTime");
      story.markModified("contentCount");
    } else if (!req.pdfData && contentCount) {
      // If only contentCount updated
      story.contentCount = contentCount;
      story.markModified("contentCount");
    }

    await story.save();

    // Notify users about the story update
    const followers = await User.find({
      likes: story._id,
      'notificationSettings.books': true
    });

    // Send notifications to followers
    const notificationPromises = followers.map(user =>
      createNotification(
        user._id,
        "STORY_UPDATE",
        "Story Updated",
        `${story.title} has been updated!`,
        {
          storyId: story._id,
          slug: story.slug,
          image: story.image,
          route: "book_detail",
          params: { slug: story.slug }
        }
      )
    );

    // Don't await notifications to speed up response
    Promise.allSettled(notificationPromises).catch(err =>
      console.error("Failed to send update notifications:", err)
    );

    return res.status(200).json({
      success: true,
      data: story,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      errorMessage: error.message || "Internal server error"
    });
  }
};

const deleteStory = asyncErrorWrapper(async (req, res, next) => {
  const { slug } = req.params;

  const story = await Story.findOne({ slug: slug });

  deleteImageFile(req, story.image);

  await story.remove();

  return res.status(200).json({
    success: true,
    message: "Story delete succesfully ",
  });
});

const getEbooksForUser = async (userId, page = 1, limit = 10, searchQuery = "", filterBy = "") => {
  try {
    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Start building the query
    let query = { author: userId };

    // Apply search query if provided
    if (searchQuery) {
      query.$or = [
        { title: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    // Apply filters based on filterBy parameter
    if (filterBy) {
      switch (filterBy) {
        case 'complete':
          query.status = 'complete';
          break;
        case 'processing':
          query.status = 'processing';
          break;
        // 'recent' filter will be handled in sort
        case 'all':
        default:
          // No additional filter for 'all'
          break;
      }
    }

    // Determine sort order (default: newest first)
    const sortOptions = { createdAt: -1 };

    // Find stories for the user with filters and pagination
    // Only select necessary fields to reduce payload size
    const stories = await Story.find(query)
      .select({
        title: 1,
        description: 1,
        image: 1,
        status: 1,
        slug: 1,
        createdAt: 1,
        updatedAt: 1,
        averageRating: 1,
        ratingCount: 1,
        processingError: 1,
        contentCount: 1,
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(limit);

    // Get total count for pagination with the same filters
    const total = await Story.countDocuments(query);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    console.log(`Found ${stories.length} ebooks for user with filter: ${filterBy}`);

    return {
      ebooks: stories,
      pagination: {
        currentPage: page,
        totalPages,
        totalEbooks: total,
        hasMore: page < totalPages
      }
    };
  } catch (error) {
    console.error('Error fetching user ebooks:', error);
    throw new Error(`Failed to fetch user ebooks: ${error.message}`);
  }
};

const getEbooksForUserEndPoint = async (req, res) => {
  try {
    console.log("started getting ebook for user");

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const searchQuery = req.query.search || "";
    const filterBy = req.query.filter || "";
    const userId = req.user._id;

    const result = await getEbooksForUser(userId, page, limit, searchQuery, filterBy);

    return res.status(200).json({
      success: true,
      data: result.ebooks,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Error in getUserEbooks:', error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch user ebooks",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

const checkStoryUpdates = async (req, res) => {
  try {
    const { id } = req.params;
    const lastKnownContentCount = parseInt(req.query.lastContentCount) || 0;
    const lastCheckDate = req.query.lastCheckDate ? new Date(req.query.lastCheckDate) : null;

    // Fetch story with minimal fields needed
    const story = await Story.findById(id)
      .select('title contentCount content contentTitles updatedAt completed')
      .lean();

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found"
      });
    }

    // Check if the story is already completed
    if (story.completed) {
      return res.status(200).json({
        success: true,
        hasUpdates: false,
        isComplete: true,
        message: "This story is already complete"
      });
    }

    // Check if there are content updates based on count
    const hasNewChapters = story.contentCount > lastKnownContentCount;

    // Check if the story was updated after the last check date
    const wasUpdatedAfterLastCheck = lastCheckDate ?
      new Date(story.updatedAt) > new Date(lastCheckDate) : false;

    // Calculate the number of new chapters
    const newChaptersCount = Math.max(0, story.contentCount - lastKnownContentCount);

    // Get titles of new chapters if there are any
    let newChapterDetails = [];
    if (hasNewChapters && story.contentTitles && story.content) {
      for (let i = lastKnownContentCount; i < story.contentCount; i++) {
        if (i < story.contentTitles.length) {
          newChapterDetails.push({
            index: i,
            title: story.contentTitles[i] || `Chapter ${i + 1}`,
            preview: story.content[i] ? `${story.content[i].substring(0, 100)}...` : null
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      hasUpdates: hasNewChapters || wasUpdatedAfterLastCheck,
      currentContentCount: story.contentCount,
      lastKnownContentCount,
      newChaptersCount,
      newChapters: newChapterDetails,
      lastUpdated: story.updatedAt,
      storyTitle: story.title,
      isComplete: story.completed
    });

  } catch (error) {
    console.error("Error in checkStoryUpdates:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check for story updates",
      error: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

module.exports = {
  addStory,
  addImage,
  getAllStories,
  detailStory,
  likeStory,
  rateStory,
  editStoryPage,
  editStory,
  deleteStory,
  getEbooksForUserEndPoint,
  checkStoryUpdates
};
